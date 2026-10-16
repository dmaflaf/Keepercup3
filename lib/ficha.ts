import type { cargarTorneo } from '@/lib/torneo-data'
import { esPortero, golesRecibidosEn, intervaloJugador, PartidoStat } from '@/lib/planilla'

type Datos = NonNullable<Awaited<ReturnType<typeof cargarTorneo>>>

export interface Ficha {
  torneo: string
  goles: number
  penales: number
  autogoles: number
  amarillas: number
  rojas: number
  suspendidoPartidos: number
  suspensionesCumplidas: number
  motivos: string[]
  amarillasParaSuspension: number
  enCiclo: number // amarillas acumuladas hacia la próxima suspensión
  partidosJugados: number | null // solo si el club tiene alineaciones registradas (planilla en vivo)
  golesPorPartido: number | null
  minutosJugados: number | null
  portero: { partidos: number; golesRecibidos: number; vallasInvictas: number; promedio: number; ranking: number | null } | null
  sinTarjetas: boolean
  rankingGoleador: number | null
  proximo: { jornada: string; rival: string; local: boolean; fecha: string | null; hora: string | null; escenario: string | null } | null
  ultimos: { jornada: string; rival: string; gf: number; gc: number; res: 'V' | 'E' | 'D' }[]
  tabla: { fase: string; grupo: string; filas: { pos: number; equipo: string; pj: number; dg: number; pts: number; mio: boolean }[]; miPos: number } | null
  historial: { tipo: string; minuto: number | null; jornada: string; rival: string; fecha: string | null }[]
}

const TIPOS_EVENTO = ['gol', 'gol_penal', 'autogol', 'amarilla', 'doble_amarilla', 'roja']

interface StatPortero { playerId: string; partidos: number; golesRecibidos: number; vallas: number; minutos: number }

/** Porteros del torneo con sus goles recibidos, según las alineaciones y cambios de la planilla. */
function estadisticasPorteros(d: Datos): StatPortero[] {
  const dur = d.torneo.minutosTiempo
  const equipoDe = new Map<string, string>()
  for (const c of d.calc) for (const e of c.eventos) if (e.playerId) equipoDe.set(e.playerId, e.teamId)
  const out: StatPortero[] = []
  for (const [pid, pos] of d.posiciones) {
    if (!esPortero(pos)) continue
    const teamId = equipoDe.get(pid)
    if (!teamId) continue
    const st: StatPortero = { playerId: pid, partidos: 0, golesRecibidos: 0, vallas: 0, minutos: 0 }
    for (const c of d.calc) {
      if (c.estado !== 'finalizado' || (c.localId !== teamId && c.visitanteId !== teamId)) continue
      const ps: PartidoStat = { localId: c.localId, visitanteId: c.visitanteId, estado: c.estado, duracion: c.duracion ?? 2 * dur, eventos: c.eventos }
      const iv = intervaloJugador(ps, teamId, pid)
      if (!iv || iv.hasta <= iv.desde) continue
      const g = golesRecibidosEn(ps, teamId, iv.desde, iv.hasta)
      st.partidos++; st.golesRecibidos += g; st.minutos += iv.hasta - iv.desde
      if (g === 0 && iv.hasta - iv.desde >= dur) st.vallas++
    }
    if (st.partidos > 0) out.push(st)
  }
  return out.sort((a, b) => a.golesRecibidos / a.partidos - b.golesRecibidos / b.partidos || b.vallas - a.vallas || b.partidos - a.partidos)
}

export function construirFicha(d: Datos, playerId: string, teamId: string): Ficha {
  const propios = d.partidos.filter((p) => p.localId === teamId || p.visitanteId === teamId)
  const s = d.sanciones.find((x) => x.playerId === playerId)
  const rivalDe = (p: (typeof propios)[number]) => (p.localId === teamId ? p.visitante : p.local)

  let goles = 0, penales = 0, autogoles = 0
  const historial: Ficha['historial'] = []
  for (const p of propios) {
    for (const e of p.eventos) {
      if (e.playerId !== playerId || !TIPOS_EVENTO.includes(e.tipo)) continue
      if (e.tipo === 'gol') goles++
      if (e.tipo === 'gol_penal') { goles++; penales++ }
      if (e.tipo === 'autogol') autogoles++
      historial.push({ tipo: e.tipo, minuto: e.minuto, jornada: p.jornada, rival: rivalDe(p), fecha: p.fecha })
    }
  }
  historial.reverse() // más reciente primero (los partidos vienen ordenados por jornada ascendente)

  // Partidos jugados: solo confiable si hay alineaciones registradas
  const conAlineacion = propios.some((p) => p.eventos.some((e) => e.tipo === 'titular' || e.tipo === 'entra'))
  const jugados = conAlineacion
    ? propios.filter((p) => p.estado === 'finalizado' && p.eventos.some((e) => e.playerId === playerId && (e.tipo === 'titular' || e.tipo === 'entra'))).length
    : null

  // Minutos y estadísticas de portero (solo con alineaciones de la planilla)
  let minutosJugados: number | null = null
  let portero: Ficha['portero'] = null
  if (conAlineacion) {
    const dur = d.torneo.minutosTiempo
    minutosJugados = 0
    for (const p of d.calc.filter((c) => c.estado === 'finalizado' && (c.localId === teamId || c.visitanteId === teamId))) {
      const iv = intervaloJugador({ localId: p.localId, visitanteId: p.visitanteId, estado: p.estado, duracion: p.duracion ?? 2 * dur, eventos: p.eventos }, teamId, playerId)
      if (iv) minutosJugados += iv.hasta - iv.desde
    }
    if (esPortero(d.posiciones.get(playerId))) {
      const todos = estadisticasPorteros(d)
      const i = todos.findIndex((x) => x.playerId === playerId)
      if (i >= 0) portero = { partidos: todos[i].partidos, golesRecibidos: todos[i].golesRecibidos, vallasInvictas: todos[i].vallas, promedio: Math.round((todos[i].golesRecibidos / todos[i].partidos) * 100) / 100, ranking: i + 1 }
    }
  }

  // Goles por partido: solo cuentan los goles de los partidos en que consta que jugó (con alineación)
  const golesEnJugados = propios
    .filter((p) => p.estado === 'finalizado' && p.eventos.some((e) => e.playerId === playerId && (e.tipo === 'titular' || e.tipo === 'entra')))
    .reduce((n, p) => n + p.eventos.filter((e) => e.playerId === playerId && (e.tipo === 'gol' || e.tipo === 'gol_penal')).length, 0)

  const terminados = propios.filter((p) => p.estado === 'finalizado' && p.golesLocal !== null && p.golesVisitante !== null)
  const ultimos = terminados.slice(-5).reverse().map((p) => {
    const local = p.localId === teamId
    const gf = (local ? p.golesLocal : p.golesVisitante) as number
    const gc = (local ? p.golesVisitante : p.golesLocal) as number
    return { jornada: p.jornada, rival: rivalDe(p), gf, gc, res: (gf > gc ? 'V' : gf < gc ? 'D' : 'E') as 'V' | 'E' | 'D' }
  })

  const pendiente = propios.find((p) => p.estado === 'programado')
  const proximo = pendiente
    ? { jornada: pendiente.jornada, rival: rivalDe(pendiente), local: pendiente.localId === teamId, fecha: pendiente.fecha, hora: pendiente.hora, escenario: pendiente.escenario }
    : null

  // Tabla del grupo donde juega su club (la fase más reciente)
  let tabla: Ficha['tabla'] = null
  for (const f of [...d.fases].sort((a, b) => b.orden - a.orden)) {
    const g = f.grupos.find((x) => x.equipos.some((e) => e.id === teamId))
    if (!g || !g.tabla.length) continue
    const miPos = g.tabla.find((r) => r.teamId === teamId)?.pos ?? 0
    tabla = {
      fase: f.nombre, grupo: g.nombre, miPos,
      filas: g.tabla.map((r) => ({ pos: r.pos, equipo: r.equipo, pj: r.pj, dg: r.dg, pts: r.pts, mio: r.teamId === teamId })),
    }
    break
  }

  const rank = goles > 0 ? 1 + d.goleadores.filter((g) => g.goles > goles).length : null
  const amarillas = s?.totalAmarillas ?? 0
  const rojas = s?.rojas ?? 0
  return {
    torneo: d.torneo.nombre,
    goles, penales, autogoles, amarillas, rojas,
    suspendidoPartidos: s?.suspendidoProximo ?? 0,
    suspensionesCumplidas: s?.cumplidos ?? 0,
    motivos: s?.motivos ?? [],
    amarillasParaSuspension: d.cfg.amarillasSuspension,
    enCiclo: s?.amarillas ?? 0,
    partidosJugados: jugados,
    golesPorPartido: jugados && jugados > 0 ? Math.round((golesEnJugados / jugados) * 100) / 100 : null,
    minutosJugados,
    portero,
    sinTarjetas: amarillas === 0 && rojas === 0 && terminados.length > 0,
    rankingGoleador: rank,
    proximo, ultimos, tabla, historial,
  }
}

export function edadDe(birthDate: string | null | undefined, hoy = new Date()): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}/.test(birthDate)) return null
  const [y, m, d] = birthDate.slice(0, 10).split('-').map(Number)
  let e = hoy.getUTCFullYear() - y
  if (hoy.getUTCMonth() + 1 < m || (hoy.getUTCMonth() + 1 === m && hoy.getUTCDate() < d)) e--
  return e >= 0 && e < 100 ? e : null
}
