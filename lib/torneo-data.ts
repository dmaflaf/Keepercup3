import { prisma } from '@/lib/db'
import { CfgTorneo, EventoCalc, PartidoCalc, goleadores, sanciones, tabla, CRITERIOS_VALIDOS } from '@/lib/torneo'

export const cfgDe = (t: CfgTorneo & Record<string, unknown>): CfgTorneo => ({
  puntosVictoria: t.puntosVictoria, puntosEmpate: t.puntosEmpate, puntosDerrota: t.puntosDerrota,
  amarillasSuspension: t.amarillasSuspension, partidosDobleAmarilla: t.partidosDobleAmarilla, partidosRojaDirecta: t.partidosRojaDirecta,
})

export const criteriosDe = (s: string) => s.split(',').map((x) => x.trim()).filter((x) => (CRITERIOS_VALIDOS as readonly string[]).includes(x))

/** Carga un torneo completo y calcula tablas, goleadores y sanciones. Nunca incluye datos personales (cédula, correo...). */
export async function cargarTorneo(torneoId: string) {
  const torneo = await prisma.torneo.findUnique({ where: { id: torneoId } })
  if (!torneo) return null
  const cfg = cfgDe(torneo)
  const [fases, partidosDB] = await Promise.all([
    prisma.fase.findMany({ where: { torneoId }, orderBy: { orden: 'asc' } }),
    prisma.partido.findMany({ where: { torneoId }, orderBy: [{ jornadaNum: 'asc' }, { fecha: 'asc' }, { hora: 'asc' }, { createdAt: 'asc' }] }),
  ])
  const faseIds = fases.map((f) => f.id)
  const grupos = await prisma.grupo.findMany({ where: { faseId: { in: faseIds } }, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] })
  const miembros = await prisma.grupoEquipo.findMany({ where: { grupoId: { in: grupos.map((g) => g.id) } } })
  const eventos = await prisma.evento.findMany({ where: { partidoId: { in: partidosDB.map((p) => p.id) } }, orderBy: [{ minuto: 'asc' }, { createdAt: 'asc' }] })

  const teamIds = new Set<string>([...miembros.map((m) => m.teamId), ...partidosDB.flatMap((p) => [p.localId, p.visitanteId])])
  const teams = await prisma.team.findMany({ where: { id: { in: Array.from(teamIds) } }, select: { id: true, name: true } })
  const nombreEquipo = new Map(teams.map((t) => [t.id, t.name]))
  const playerIds = Array.from(new Set(eventos.map((e) => e.playerId).filter(Boolean) as string[]))
  const players = await prisma.player.findMany({ where: { id: { in: playerIds } }, select: { id: true, firstName: true, lastName: true, number: true } })
  const jugador = new Map(players.map((p) => [p.id, p]))

  const eventosPorPartido = new Map<string, EventoCalc[]>()
  for (const e of eventos) eventosPorPartido.set(e.partidoId, [...(eventosPorPartido.get(e.partidoId) || []), { teamId: e.teamId, playerId: e.playerId, tipo: e.tipo, minuto: e.minuto }])
  const calc: PartidoCalc[] = partidosDB.map((p) => ({
    id: p.id, grupoId: p.grupoId, localId: p.localId, visitanteId: p.visitanteId, estado: p.estado,
    golesLocal: p.golesLocal, golesVisitante: p.golesVisitante, jornadaNum: p.jornadaNum, fecha: p.fecha,
    eventos: eventosPorPartido.get(p.id) || [],
  }))

  const fasesOut = fases.map((f) => {
    const crit = criteriosDe(f.criterios)
    return {
      id: f.id, orden: f.orden, nombre: f.nombre, tipo: f.tipo, criterios: crit,
      grupos: grupos.filter((g) => g.faseId === f.id).map((g) => {
        const ms = miembros.filter((m) => m.grupoId === g.id)
        const ids = ms.map((m) => m.teamId)
        const pos = new Map(ms.filter((m) => m.posManual).map((m) => [m.teamId, m.posManual as number]))
        const t = tabla(ids, calc.filter((p) => p.grupoId === g.id), cfg, crit, pos)
        return {
          id: g.id, nombre: g.nombre,
          equipos: ids.map((id) => ({ id, name: nombreEquipo.get(id) || '?', posManual: pos.get(id) ?? null })),
          tabla: t.map((r) => ({ ...r, equipo: nombreEquipo.get(r.teamId) || '?' })),
        }
      }),
    }
  })

  const partidos = partidosDB.map((p, i) => ({
    id: p.id, faseId: p.faseId, grupoId: p.grupoId, jornada: p.jornada, jornadaNum: p.jornadaNum, fecha: p.fecha, hora: p.hora,
    escenario: p.escenario, veedor: p.veedor, observaciones: p.observaciones, estado: p.estado,
    localId: p.localId, visitanteId: p.visitanteId, local: nombreEquipo.get(p.localId) || '?', visitante: nombreEquipo.get(p.visitanteId) || '?',
    golesLocal: p.golesLocal, golesVisitante: p.golesVisitante, marcadorManual: p.marcadorManual,
    penalesLocal: p.penalesLocal, penalesVisitante: p.penalesVisitante,
    eventos: eventos.filter((e) => e.partidoId === p.id).map((e) => ({
      id: e.id, tipo: e.tipo, minuto: e.minuto, teamId: e.teamId, playerId: e.playerId,
      jugador: e.playerId ? `${jugador.get(e.playerId)?.firstName ?? ''} ${jugador.get(e.playerId)?.lastName ?? ''}`.trim() : null,
      numero: e.playerId ? jugador.get(e.playerId)?.number ?? null : null,
    })),
    _i: i,
  }))

  const gol = goleadores(calc).map((g) => {
    const j = jugador.get(g.playerId)
    return { ...g, jugador: j ? `${j.firstName} ${j.lastName}` : '?', numero: j?.number ?? null, equipo: nombreEquipo.get(g.teamId) || '?' }
  })
  const san = sanciones(calc, cfg).map((s) => {
    const j = jugador.get(s.playerId)
    return { ...s, jugador: j ? `${j.firstName} ${j.lastName}` : '?', numero: j?.number ?? null, equipo: nombreEquipo.get(s.teamId) || '?' }
  }).filter((s) => s.suspendidoProximo > 0 || s.precaucion || s.totalAmarillas > 0 || s.rojas > 0)
    .sort((a, b) => b.suspendidoProximo - a.suspendidoProximo || b.totalAmarillas - a.totalAmarillas)

  return { torneo, cfg, fases: fasesOut, partidos, goleadores: gol, sanciones: san, calc }
}
