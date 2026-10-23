import { prisma } from '@/lib/db'
import { cargarMultas } from '@/lib/multas-data'

export const CONCEPTOS = ['inscripcion', 'garantia', 'carnets', 'otro'] as const
// Valores por defecto para todos los clubes: se aplican mientras no se registre un cargo propio de ese concepto
export const POR_DEFECTO: Record<string, number> = { inscripcion: 125, garantia: 45 }
export const PRECIO_CARNET = 0.5 // por jugador habilitado
export const ETIQUETA: Record<string, string> = { multas: 'Multas', inscripcion: 'Inscripción', garantia: 'Garantía', carnets: 'Carnets', otro: 'Otro' }

/** Cargos, multas y pagos de cada club del torneo. */
export async function calcularFinanzas(tid: string) {
  const [multasD, cargos, pagos, teams] = await Promise.all([
    cargarMultas(tid),
    prisma.cargo.findMany({ where: { torneoId: tid }, orderBy: { createdAt: 'desc' } }),
    prisma.pago.findMany({ where: { torneoId: tid }, orderBy: { createdAt: 'desc' } }),
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  const nombre = new Map(teams.map((t) => [t.id, t.name]))
  const hab = await prisma.player.groupBy({ by: ['teamId'], where: { estado: 'habilitado' }, _count: { _all: true } })
  const habilitados = new Map(hab.map((h) => [h.teamId, h._count._all]))
  const enTorneo = new Set(multasD?.multas.map((m) => m.teamId) || [])
  const clubes = (enTorneo.size ? teams.filter((t) => enTorneo.has(t.id)) : teams).map((t) => t.id)
  const multaDe = new Map((multasD?.multas || []).map((m) => [m.teamId, m]))
  const filas = clubes.map((id) => {
    const porConcepto: Record<string, { cargado: number; pagado: number }> = {}
    const m = multaDe.get(id)
    porConcepto.multas = { cargado: m?.total || 0, pagado: m?.pagado || 0 }
    for (const c of CONCEPTOS) porConcepto[c] = { cargado: 0, pagado: 0 }
    for (const c of cargos) if (c.teamId === id && !c.anulado) porConcepto[c.concepto].cargado += c.monto
    if (!cargos.some((c) => c.teamId === id && c.concepto === 'carnets')) porConcepto.carnets.cargado = Math.round((habilitados.get(id) || 0) * PRECIO_CARNET * 100) / 100
    for (const [k, v] of Object.entries(POR_DEFECTO)) if (!cargos.some((c) => c.teamId === id && c.concepto === k)) porConcepto[k].cargado = v
    for (const p of pagos) if (p.teamId === id && !p.anulado && p.concepto && p.concepto !== 'multas' && porConcepto[p.concepto]) porConcepto[p.concepto].pagado += p.monto
    const cargado = Object.values(porConcepto).reduce((a, x) => a + x.cargado, 0), pagado = Object.values(porConcepto).reduce((a, x) => a + x.pagado, 0)
    return { teamId: id, club: nombre.get(id) || '?', porConcepto, cargado, pagado, saldo: Math.round((cargado - pagado) * 100) / 100 }
  })
  const pagosOut = pagos.map((p) => ({ id: p.id, teamId: p.teamId, club: nombre.get(p.teamId) || '?', concepto: p.concepto || 'multas', monto: p.monto, nota: p.nota, comprobante: p.comprobante, fechaPago: p.fechaPago, anulado: p.anulado, usuario: p.usuario }))
  const cargosOut = cargos.map((c) => ({ id: c.id, teamId: c.teamId, club: nombre.get(c.teamId) || '?', concepto: c.concepto, detalle: c.detalle, monto: c.monto, anulado: c.anulado, fecha: c.createdAt }))
  return { filas, cargos: cargosOut, pagos: pagosOut }
}
