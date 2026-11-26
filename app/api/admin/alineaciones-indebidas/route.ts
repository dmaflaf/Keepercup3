import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { cargarMultas } from '@/lib/multas-data'

export const dynamic = 'force-dynamic'

// Alineaciones indebidas: jugadores que aparecen en la planilla (alineación, cambio, gol o tarjeta) de un partido
// en el que debían cumplir sanción. Ese partido no cuenta como cumplido. Solo lectura: no cambia nada.
export async function GET(req: NextRequest) {
  const no = await exigirAdmin(); if (no) return no
  const torneos = await prisma.torneo.findMany({ orderBy: [{ activo: 'desc' }, { createdAt: 'desc' }], select: { id: true, nombre: true } })
  const torneoId = req.nextUrl.searchParams.get('torneoId') || torneos[0]?.id
  if (!torneoId) return NextResponse.json({ ok: true, torneos, casos: [] })
  const m = await cargarMultas(torneoId)
  if (!m) return NextResponse.json({ ok: false, message: 'Torneo no encontrado' }, { status: 404 })
  const lista = m.sanciones.flatMap((s) => s.indebidas.map((x) => ({ s, ...x })))
  const ids = Array.from(new Set(lista.map((x) => x.partidoId)))
  const [partidos, eventos] = await Promise.all([
    prisma.partido.findMany({ where: { id: { in: ids } }, select: { id: true, jornada: true, fecha: true, localId: true, visitanteId: true, golesLocal: true, golesVisitante: true, resueltoMesa: true } }),
    prisma.evento.findMany({ where: { partidoId: { in: ids }, playerId: { in: lista.map((x) => x.s.playerId) } }, select: { partidoId: true, playerId: true, tipo: true, minuto: true } }),
  ])
  const pm = new Map(partidos.map((p) => [p.id, p]))
  const equipos = new Map((await prisma.team.findMany({ where: { id: { in: partidos.flatMap((p) => [p.localId, p.visitanteId]) } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]))
  const NOM: Record<string, string> = { titular: 'titular', entra: 'entró de cambio', sale: 'salió', gol: 'gol', gol_penal: 'gol de penal', autogol: 'autogol', amarilla: 'amarilla', doble_amarilla: 'doble amarilla', roja: 'roja', falta: 'falta' }
  const casos = lista.map(({ s, partidoId, jornada }) => {
    const p = pm.get(partidoId)
    const ev = eventos.filter((e) => e.partidoId === partidoId && e.playerId === s.playerId)
    return {
      partidoId, jornada, fechaNombre: p?.jornada || `Fecha ${jornada}`, fecha: p?.fecha || null,
      club: s.club, teamId: s.teamId, jugador: s.jugador, numero: s.numero, motivo: s.motivo,
      partido: p ? `${equipos.get(p.localId) || '?'} ${p.golesLocal ?? '-'}–${p.golesVisitante ?? '-'} ${equipos.get(p.visitanteId) || '?'}` : '?',
      mesa: !!p?.resueltoMesa,
      aparece: Array.from(new Set(ev.map((e) => (NOM[e.tipo] || e.tipo) + (e.minuto != null && !['titular'].includes(e.tipo) ? ` ${e.minuto}'` : '')))),
    }
  }).sort((a, b) => a.jornada - b.jornada || a.club.localeCompare(b.club))
  return NextResponse.json({ ok: true, torneos, torneoId, casos }, { headers: { 'Cache-Control': 'no-store' } })
}
