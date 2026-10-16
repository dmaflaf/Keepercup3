import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Partido en vivo para el público: marcador, reloj, alineaciones y eventos. Sin datos personales.
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
  const jug = await prisma.player.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, number: true } })
  const j = new Map(jug.map((x) => [x.id, x]))
  const nombre = (id: string | null) => { const x = id ? j.get(id) : null; return x ? { nombre: `${x.firstName} ${x.lastName}`, numero: x.number } : null }
  const marcador = { l: 0, v: 0 }
  for (const e of eventos) {
    if (e.tipo === 'gol' || e.tipo === 'gol_penal') (e.teamId === p.localId ? marcador.l++ : marcador.v++)
    else if (e.tipo === 'autogol') (e.teamId === p.localId ? marcador.v++ : marcador.l++)
  }
  const tanda = (t: string, tipo: string) => eventos.filter((e) => e.teamId === t && e.tipo === tipo).length
  return NextResponse.json({
    ok: true, servidor: Date.now(),
    partido: {
      torneo: torneo.nombre, jornada: p.jornada, fecha: p.fecha, hora: p.hora, escenario: p.escenario, estado: p.estado, periodo: p.periodo,
      local: equipos.find((t) => t.id === p.localId)?.name || '?', visitante: equipos.find((t) => t.id === p.visitanteId)?.name || '?',
      localId: p.localId,
      golesLocal: p.marcadorManual && p.golesLocal !== null ? p.golesLocal : marcador.l, golesVisitante: p.marcadorManual && p.golesVisitante !== null ? p.golesVisitante : marcador.v,
      penalesLocal: p.penalesLocal ?? (p.periodo === 'penales' ? tanda(p.localId, 'tanda_gol') : null), penalesVisitante: p.penalesVisitante ?? (p.periodo === 'penales' ? tanda(p.visitanteId, 'tanda_gol') : null),
      relojBase: p.relojBaseSeg, relojDesde: p.relojDesde ? p.relojDesde.getTime() : null, dur: torneo.minutosTiempo,
    },
    eventos: eventos.filter((e) => !e.tipo.startsWith('tanda') && e.tipo !== 'titular' && e.tipo !== 'falta').map((e) => ({ tipo: e.tipo, teamId: e.teamId, minuto: e.minuto, periodo: e.periodo, ...(nombre(e.playerId) || {}) })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
