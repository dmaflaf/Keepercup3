import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { cargarMultas } from '@/lib/multas-data'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })
const CONCEPTOS = ['inscripcion', 'garantia', 'carnets', 'otro'] as const
// Valores por defecto para todos los clubes: se aplican mientras no se registre un cargo propio de ese concepto
const POR_DEFECTO: Record<string, number> = { inscripcion: 125, garantia: 45 }
const PRECIO_CARNET = 0.5 // por jugador habilitado
const dinero = (v: unknown) => Math.round(Number(String(v).replace(',', '.')) * 100) / 100
const texto = (v: unknown, n = 80) => (typeof v === 'string' ? v.trim().slice(0, n) || null : null)

// Finanzas del torneo por club: cargos (inscripción, garantía, carnets, otros), multas por tarjetas y pagos con comprobante y fecha. Solo administrador.
export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const torneos = await prisma.torneo.findMany({ orderBy: [{ activo: 'desc' }, { createdAt: 'desc' }], select: { id: true, nombre: true } })
  const tid = req.nextUrl.searchParams.get('torneoId') || torneos[0]?.id
  if (!tid) return NextResponse.json({ ok: true, torneos, datos: null })
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
  return NextResponse.json({
    ok: true, torneos, datos: {
      torneoId: tid, filas, porDefecto: { ...POR_DEFECTO, carnet: PRECIO_CARNET },
      cargos: cargos.map((c) => ({ id: c.id, teamId: c.teamId, club: nombre.get(c.teamId) || '?', concepto: c.concepto, detalle: c.detalle, monto: c.monto, anulado: c.anulado, fecha: c.createdAt })),
      pagos: pagos.map((p) => ({ id: p.id, teamId: p.teamId, club: nombre.get(p.teamId) || '?', concepto: p.concepto || 'multas', monto: p.monto, nota: p.nota, comprobante: p.comprobante, fechaPago: p.fechaPago, anulado: p.anulado, usuario: p.usuario })),
    },
  })
}

export async function POST(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const u = (await import('@/lib/auth')).verifyAuth
  const user = await u()
  const b = await req.json().catch(() => null)
  if (!b) return falla('Solicitud inválida')
  const torneoId = String(b.torneoId || '')
  if (!(await prisma.torneo.findUnique({ where: { id: torneoId }, select: { id: true } }))) return falla('Torneo no encontrado', 404)

  if (b.accion === 'cargo') {
    const monto = dinero(b.monto)
    if (!(monto > 0) || monto > 100000) return falla('Escribe un monto mayor a 0')
    if (!(CONCEPTOS as readonly string[]).includes(b.concepto)) return falla('Concepto inválido')
    const ids: string[] = b.todos ? (await prisma.team.findMany({ select: { id: true } })).map((t) => t.id) : [String(b.teamId)]
    const validos = await prisma.team.findMany({ where: { id: { in: ids } }, select: { id: true } })
    if (!validos.length) return falla('Club no encontrado', 404)
    await prisma.cargo.createMany({ data: validos.map((t) => ({ torneoId, teamId: t.id, concepto: b.concepto, detalle: texto(b.detalle), monto, usuario: user?.email || '' })) })
    return NextResponse.json({ ok: true, clubes: validos.length })
  }
  if (b.accion === 'pago') {
    const monto = dinero(b.monto)
    if (!(monto > 0) || monto > 100000) return falla('Escribe un monto mayor a 0')
    const concepto = b.concepto === 'multas' || (CONCEPTOS as readonly string[]).includes(b.concepto) ? String(b.concepto) : null
    if (!concepto) return falla('Concepto inválido')
    const comprobante = texto(b.comprobante, 40)
    if (!comprobante) return falla('Escribe el número de comprobante')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.fechaPago))) return falla('Elige la fecha del pago')
    if (!(await prisma.team.findUnique({ where: { id: String(b.teamId) }, select: { id: true } }))) return falla('Club no encontrado', 404)
    await prisma.pago.create({ data: { torneoId, teamId: String(b.teamId), monto, concepto, comprobante, fechaPago: String(b.fechaPago), nota: texto(b.nota), usuario: user?.email || '' } })
    return NextResponse.json({ ok: true })
  }
  if (b.accion === 'anular_cargo') { await prisma.cargo.update({ where: { id: String(b.id) }, data: { anulado: !!b.anulado } }); return NextResponse.json({ ok: true }) }
  if (b.accion === 'anular_pago') { await prisma.pago.update({ where: { id: String(b.id) }, data: { anulado: !!b.anulado } }); return NextResponse.json({ ok: true }) }
  return falla('Acción desconocida')
}
