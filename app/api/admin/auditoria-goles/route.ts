import { bloqueoSuspension } from '@/lib/suspension'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })
const GOL = ['gol', 'gol_penal']
const PREFIJO = 'manualgol:' // goles asignados desde esta auditoría

// Auditoría de goleadores: compara el marcador de cada partido jugado con los goles registrados (con jugador),
// por fase, fecha y club. Solo administrador.
export async function GET(req: NextRequest) {
  const u = await verifyAuth()
  if (!u || u.rol !== 'admin') return falla('Solo el administrador', 403)
  const torneos = await prisma.torneo.findMany({ orderBy: [{ activo: 'desc' }, { createdAt: 'desc' }], select: { id: true, nombre: true, origen: true } })
  const tid = req.nextUrl.searchParams.get('torneoId') || torneos.find((t) => t.origen === 'kc3-pages')?.id || torneos[0]?.id
  if (!tid) return NextResponse.json({ ok: true, torneos, partidos: [], fases: [], jugadores: [] })
  const [fases, partidos] = await Promise.all([
    prisma.fase.findMany({ where: { torneoId: tid }, orderBy: { orden: 'asc' }, select: { id: true, nombre: true } }),
    prisma.partido.findMany({ where: { torneoId: tid }, orderBy: [{ jornadaNum: 'asc' }, { fecha: 'asc' }, { hora: 'asc' }] }),
  ])
  const ids = partidos.map((p) => p.id)
  const eventos = await prisma.evento.findMany({ where: { partidoId: { in: ids } }, select: { id: true, partidoId: true, teamId: true, playerId: true, tipo: true, minuto: true, clienteId: true } })
  const equipos = Array.from(new Set(partidos.flatMap((p) => [p.localId, p.visitanteId])))
  const [clubes, jugadores] = await Promise.all([
    prisma.team.findMany({ where: { id: { in: equipos } }, select: { id: true, name: true } }),
    prisma.player.findMany({ where: { teamId: { in: equipos } }, orderBy: [{ number: 'asc' }, { lastName: 'asc' }], select: { id: true, teamId: true, number: true, firstName: true, lastName: true } }),
  ])
  const nombre = new Map(clubes.map((c) => [c.id, c.name]))
  const jug = new Map(jugadores.map((j) => [j.id, j]))
  const out = partidos.filter((p) => p.estado === 'finalizado' && p.golesLocal !== null && p.golesVisitante !== null).map((p) => {
    const ev = eventos.filter((e) => e.partidoId === p.id)
    const lado = (teamId: string, rival: string, marcador: number) => {
      const goles = ev.filter((e) => (GOL.includes(e.tipo) && e.teamId === teamId) || (e.tipo === 'autogol' && e.teamId === rival))
      const conJugador = goles.filter((e) => e.playerId).length
      return {
        teamId, club: nombre.get(teamId) || '?', marcador, registrados: conJugador, faltan: Math.max(0, marcador - conJugador), sobran: Math.max(0, conJugador - marcador),
        goles: goles.map((e) => { const j = e.playerId ? jug.get(e.playerId) : null; return { id: e.id, tipo: e.tipo, minuto: e.minuto, jugador: j ? `${j.firstName} ${j.lastName}`.trim() : '¿sin jugador?', numero: j?.number ?? null, propio: (e.clienteId || '').startsWith(PREFIJO) } }),
        titulares: ev.filter((e) => e.tipo === 'titular' && e.teamId === teamId).length,
      }
    }
    return {
      id: p.id, faseId: p.faseId, jornada: p.jornada, jornadaNum: p.jornadaNum, fecha: p.fecha, mesa: p.resueltoMesa,
      local: lado(p.localId, p.visitanteId, p.golesLocal as number), visitante: lado(p.visitanteId, p.localId, p.golesVisitante as number),
    }
  })
  return NextResponse.json({
    ok: true, torneos, torneoId: tid, fases, partidos: out,
    jugadores: jugadores.map((j) => ({ id: j.id, teamId: j.teamId, numero: j.number, nombre: `${j.firstName} ${j.lastName}`.trim() })),
  })
}

// Asignar o quitar un gol (sin minuto). No cambia el marcador del partido.
export async function POST(req: NextRequest) {
  const u = await verifyAuth()
  if (!u || u.rol !== 'admin') return falla('Solo el administrador', 403)
  const b = await req.json().catch(() => null)
  if (!b) return falla('Solicitud inválida')
  if (b.accion === 'quitar') {
    const e = await prisma.evento.findUnique({ where: { id: String(b.eventoId) } })
    if (!e || !['gol', 'gol_penal', 'autogol'].includes(e.tipo)) return falla('Gol no encontrado', 404)
    const p = await prisma.partido.findUnique({ where: { id: e.partidoId } })
    if (p && !p.marcadorManual) await prisma.partido.update({ where: { id: p.id }, data: { marcadorManual: true } }) // el marcador no baja
    await prisma.evento.delete({ where: { id: e.id } })
    return NextResponse.json({ ok: true })
  }
  if (b.accion !== 'agregar') return falla('Acción desconocida')
  const p = await prisma.partido.findUnique({ where: { id: String(b.partidoId) } })
  if (!p || p.estado !== 'finalizado' || p.golesLocal === null || p.golesVisitante === null) return falla('Partido no encontrado o no jugado', 404)
  const teamId = String(b.teamId) // club al que se le cuenta el gol
  if (teamId !== p.localId && teamId !== p.visitanteId) return falla('Ese club no juega este partido')
  const rival = teamId === p.localId ? p.visitanteId : p.localId
  const tipo = ['gol', 'gol_penal', 'autogol'].includes(b.tipo) ? String(b.tipo) : 'gol'
  const j = await prisma.player.findUnique({ where: { id: String(b.playerId) }, select: { teamId: true } })
  // Autogol: lo hace un jugador del rival y cuenta para este club
  if (!j || j.teamId !== (tipo === 'autogol' ? rival : teamId)) return falla(tipo === 'autogol' ? 'El autogol lo marca un jugador del rival.' : 'Ese jugador no es de ese club.')
  { const no = await bloqueoSuspension(p.torneoId, p.id, String(b.playerId)); if (no) return falla(no) }
  const ev = await prisma.evento.findMany({ where: { partidoId: p.id, tipo: { in: ['gol', 'gol_penal', 'autogol'] } } })
  const ya = ev.filter((e) => (GOL.includes(e.tipo) && e.teamId === teamId) || (e.tipo === 'autogol' && e.teamId === rival)).filter((e) => e.playerId).length
  const marcador = teamId === p.localId ? p.golesLocal : p.golesVisitante
  if (ya >= marcador) return falla(`Ese club ya tiene sus ${marcador} gol(es) asignados. Quita uno si hay que cambiarlo.`)
  await prisma.$transaction([
    // El marcador del partido manda: se fija para que agregar goles no lo recalcule
    ...(p.marcadorManual ? [] : [prisma.partido.update({ where: { id: p.id }, data: { marcadorManual: true } })]),
    prisma.evento.create({ data: { partidoId: p.id, teamId: tipo === 'autogol' ? rival : teamId, playerId: String(b.playerId), tipo, minuto: null, periodo: null, clienteId: `${PREFIJO}${p.id}:${Date.now()}` } }),
  ])
  return NextResponse.json({ ok: true })
}
