import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Detalle público de un partido: marcador, goles, tarjetas, alineaciones y cambios. Sin datos personales.
// Los minutos simulados (cargados desde hojas/Excel) no se publican.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const p = await prisma.partido.findUnique({ where: { id: params.id } })
  if (!p) return NextResponse.json({ ok: false, message: 'Partido no encontrado' }, { status: 404 })
  const torneo = await prisma.torneo.findUnique({ where: { id: p.torneoId } })
  if (!torneo?.publico) return NextResponse.json({ ok: false, message: 'No disponible' }, { status: 404 })
  const [equipos, eventos] = await Promise.all([
    prisma.team.findMany({ where: { id: { in: [p.localId, p.visitanteId] } }, select: { id: true, name: true } }),
    prisma.evento.findMany({ where: { partidoId: p.id }, orderBy: [{ periodo: 'asc' }, { minuto: 'asc' }, { createdAt: 'asc' }] }),
  ])
  const ids = Array.from(new Set(eventos.map((e) => e.playerId).filter(Boolean) as string[]))
  const jug = await prisma.player.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, number: true, position: true } })
  const j = new Map(jug.map((x) => [x.id, x]))
  const quien = (id: string | null) => { const x = id ? j.get(id) : null; return x ? { nombre: `${x.firstName} ${x.lastName}`, numero: x.number, posicion: x.position } : { nombre: '', numero: null, posicion: null }
  }
  const simulado = (c: string | null) => !!c && c.startsWith('xlsx')
  const real = eventos.map((e) => ({ tipo: e.tipo, teamId: e.teamId, minuto: simulado(e.clienteId) ? null : e.minuto, periodo: e.periodo, ...quien(e.playerId) }))
  const nom = (id: string) => equipos.find((t) => t.id === id)?.name || '?'
  const alineacion = (teamId: string) => {
    const mios = eventos.filter((e) => e.teamId === teamId)
    const tit = mios.filter((e) => e.tipo === 'titular').map((e) => ({ ...quien(e.playerId), sale: mios.find((s) => s.tipo === 'sale' && s.playerId === e.playerId) ? true : false }))
    const ing = mios.filter((e) => e.tipo === 'entra').map((e) => ({ ...quien(e.playerId), minuto: simulado(e.clienteId) ? null : e.minuto, sale: false}))
    return { titulares: tit, ingresos: ing }
  }
  return NextResponse.json({
    ok: true,
    partido: { torneo: torneo.nombre, jornada: p.jornada, fecha: p.fecha, hora: p.hora, escenario: p.escenario, estado: p.estado, local: nom(p.localId), visitante: nom(p.visitanteId), localId: p.localId, visitanteId: p.visitanteId, golesLocal: p.golesLocal, golesVisitante: p.golesVisitante },
    eventos: real.filter((e) => ['gol', 'gol_penal', 'autogol', 'amarilla', 'doble_amarilla', 'roja'].includes(e.tipo)),
    cambios: real.filter((e) => e.tipo === 'entra' || e.tipo === 'sale'),
    alineaciones: { local: alineacion(p.localId), visitante: alineacion(p.visitanteId) },
  }, { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } })
}
