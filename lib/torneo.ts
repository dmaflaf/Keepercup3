// Cálculos del torneo (puros, sin base de datos): tablas, goleadores, sanciones y marcadores.

export interface CfgTorneo {
  puntosVictoria: number
  puntosEmpate: number
  puntosDerrota: number
  amarillasSuspension: number
  partidosDobleAmarilla: number
  partidosRojaDirecta: number
}

export interface EventoCalc { teamId: string; playerId: string | null; tipo: string; minuto?: number | null }
export interface PartidoCalc {
  id: string
  grupoId: string | null
  localId: string
  visitanteId: string
  estado: string
  golesLocal: number | null
  golesVisitante: number | null
  jornadaNum: number
  fecha: string | null
  eventos: EventoCalc[]
}

export interface FilaTabla {
  teamId: string
  pj: number; pg: number; pe: number; pp: number
  gf: number; gc: number; dg: number; pts: number
  amarillas: number; rojas: number
  pos: number
}

export const CRITERIOS_VALIDOS = ['puntos', 'dg', 'gf', 'gc', 'ganados', 'h2h', 'fairplay'] as const

const finalizado = (p: PartidoCalc) => p.estado === 'finalizado' && p.golesLocal !== null && p.golesVisitante !== null

/** Marcador calculado a partir de los goles registrados (autogol suma al rival). */
export function marcadorDesdeEventos(p: { localId: string; visitanteId: string }, eventos: EventoCalc[]) {
  let l = 0
  let v = 0
  for (const e of eventos) {
    if (e.tipo === 'gol' || e.tipo === 'gol_penal') (e.teamId === p.localId ? l++ : v++)
    else if (e.tipo === 'autogol') (e.teamId === p.localId ? v++ : l++)
  }
  return { golesLocal: l, golesVisitante: v }
}

function estadisticas(equipos: string[], partidos: PartidoCalc[], cfg: CfgTorneo) {
  const m = new Map<string, FilaTabla>()
  for (const t of equipos) m.set(t, { teamId: t, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0, amarillas: 0, rojas: 0, pos: 0 })
  for (const p of partidos) {
    if (!finalizado(p)) continue
    const L = m.get(p.localId)
    const V = m.get(p.visitanteId)
    if (!L || !V) continue
    const gl = p.golesLocal as number
    const gv = p.golesVisitante as number
    L.pj++; V.pj++
    L.gf += gl; L.gc += gv; V.gf += gv; V.gc += gl
    if (gl > gv) { L.pg++; V.pp++; L.pts += cfg.puntosVictoria; V.pts += cfg.puntosDerrota }
    else if (gl < gv) { V.pg++; L.pp++; V.pts += cfg.puntosVictoria; L.pts += cfg.puntosDerrota }
    else { L.pe++; V.pe++; L.pts += cfg.puntosEmpate; V.pts += cfg.puntosEmpate }
    for (const e of p.eventos) {
      const f = m.get(e.teamId)
      if (!f) continue
      if (e.tipo === 'amarilla') f.amarillas++
      else if (e.tipo === 'doble_amarilla') { f.amarillas += 2; f.rojas++ }
      else if (e.tipo === 'roja') f.rojas++
    }
  }
  for (const f of m.values()) f.dg = f.gf - f.gc
  return m
}

function valor(f: FilaTabla, c: string): number {
  switch (c) {
    case 'puntos': return f.pts
    case 'dg': return f.dg
    case 'gf': return f.gf
    case 'gc': return -f.gc
    case 'ganados': return f.pg
    case 'fairplay': return -(f.amarillas + 3 * f.rojas) // menos tarjetas = mejor
    default: return 0
  }
}

function ordenar(ids: string[], stats: Map<string, FilaTabla>, criterios: string[], partidos: PartidoCalc[], cfg: CfgTorneo): string[] {
  if (ids.length <= 1 || criterios.length === 0) return ids
  const [c, ...resto] = criterios
  const grupos = new Map<string, string[]>()
  let claves: [string, number[]][]
  if (c === 'h2h') {
    const set = new Set(ids)
    const mini = estadisticas(ids, partidos.filter((p) => set.has(p.localId) && set.has(p.visitanteId)), cfg)
    claves = ids.map((id) => {
      const f = mini.get(id) as FilaTabla
      return [id, [f.pts, f.dg, f.gf]]
    })
  } else {
    claves = ids.map((id) => [id, [valor(stats.get(id) as FilaTabla, c)]])
  }
  for (const [id, k] of claves) {
    const key = k.join('|')
    grupos.set(key, [...(grupos.get(key) || []), id])
  }
  const orden = Array.from(grupos.entries()).sort((a, b) => {
    const ka = a[0].split('|').map(Number)
    const kb = b[0].split('|').map(Number)
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i]
    return 0
  })
  return orden.flatMap(([, g]) => (g.length > 1 ? ordenar(g, stats, resto, partidos, cfg) : g))
}

/** Tabla de posiciones de un grupo según los criterios de ubicación configurados. */
export function tabla(equipos: string[], partidos: PartidoCalc[], cfg: CfgTorneo, criterios: string[], posManual?: Map<string, number>): FilaTabla[] {
  const stats = estadisticas(equipos, partidos, cfg)
  let orden = ordenar([...equipos], stats, criterios, partidos, cfg)
  if (posManual && posManual.size) {
    const fijos = Array.from(posManual.entries()).filter(([id]) => orden.includes(id)).sort((a, b) => a[1] - b[1])
    orden = orden.filter((id) => !posManual.has(id))
    for (const [id, pos] of fijos) orden.splice(Math.min(Math.max(pos - 1, 0), orden.length), 0, id)
  }
  return orden.map((id, i) => ({ ...(stats.get(id) as FilaTabla), pos: i + 1 }))
}

export function goleadores(partidos: PartidoCalc[]) {
  const m = new Map<string, { playerId: string; teamId: string; goles: number; penales: number }>()
  for (const p of partidos) {
    for (const e of p.eventos) {
      if ((e.tipo !== 'gol' && e.tipo !== 'gol_penal') || !e.playerId) continue
      const f = m.get(e.playerId) || { playerId: e.playerId, teamId: e.teamId, goles: 0, penales: 0 }
      f.goles++
      if (e.tipo === 'gol_penal') f.penales++
      m.set(e.playerId, f)
    }
  }
  return Array.from(m.values()).sort((a, b) => b.goles - a.goles)
}

export interface EstadoSancion {
  playerId: string
  teamId: string
  amarillas: number // acumuladas en el ciclo actual
  rojas: number
  totalAmarillas: number
  suspendidoProximo: number // partidos de suspensión pendientes de cumplir
  precaucion: boolean // le falta 1 amarilla para suspensión
  cumplidos: number
  motivos: string[]
}

/** Sanciones por jugador. Un partido finalizado en que el jugador cumple suspensión consume 1 partido pendiente. */
export function sanciones(partidos: PartidoCalc[], cfg: CfgTorneo): EstadoSancion[] {
  const fin = partidos.filter(finalizado).sort((a, b) => a.jornadaNum - b.jornadaNum || (a.fecha || '').localeCompare(b.fecha || '') || a.id.localeCompare(b.id))
  const jugadores = new Map<string, EstadoSancion>()
  const get = (e: EventoCalc) => {
    const id = e.playerId as string
    if (!jugadores.has(id)) jugadores.set(id, { playerId: id, teamId: e.teamId, amarillas: 0, rojas: 0, totalAmarillas: 0, suspendidoProximo: 0, precaucion: false, cumplidos: 0, motivos: [] })
    return jugadores.get(id) as EstadoSancion
  }
  const equiposDe = new Map<string, string[]>() // teamId -> partidos propios (para el cumplimiento)
  for (const p of fin) for (const t of [p.localId, p.visitanteId]) equiposDe.set(t, [...(equiposDe.get(t) || []), p.id])

  for (const p of fin) {
    // 1) cumplimiento: quien tenía suspensión pendiente de su equipo descansa este partido (antes de contar lo ocurrido en él)
    for (const s of jugadores.values()) {
      if ((s.teamId === p.localId || s.teamId === p.visitanteId) && s.suspendidoProximo > 0) {
        const jugo = p.eventos.some((e) => e.playerId === s.playerId)
        if (!jugo) { s.suspendidoProximo--; s.cumplidos++ }
      }
    }
    // 2) lo ocurrido en el partido genera sanciones para los siguientes
    for (const e of p.eventos) {
      if (!e.playerId) continue
      if (e.tipo === 'amarilla') {
        const s = get(e)
        s.amarillas++; s.totalAmarillas++
        if (s.amarillas >= cfg.amarillasSuspension) {
          s.amarillas -= cfg.amarillasSuspension
          s.suspendidoProximo += 1
          s.motivos.push(`${cfg.amarillasSuspension} amarillas acumuladas = 1 partido`)
        }
      } else if (e.tipo === 'doble_amarilla') {
        const s = get(e)
        s.totalAmarillas += 2; s.rojas++
        s.suspendidoProximo += cfg.partidosDobleAmarilla
        s.motivos.push(`Doble amarilla = ${cfg.partidosDobleAmarilla} partido(s)`)
      } else if (e.tipo === 'roja') {
        const s = get(e)
        s.rojas++
        s.suspendidoProximo += cfg.partidosRojaDirecta
        s.motivos.push(`Roja directa = ${cfg.partidosRojaDirecta} partido(s)`)
      }
    }
  }
  for (const s of jugadores.values()) s.precaucion = s.suspendidoProximo === 0 && cfg.amarillasSuspension > 1 && s.amarillas === cfg.amarillasSuspension - 1
  return Array.from(jugadores.values())
}

/** Todos los cruces de una liga (método del círculo). dobleVuelta repite invirtiendo la localía. */
export function roundRobin(equipos: string[], dobleVuelta = false): { jornada: number; local: string; visitante: string }[] {
  const e = [...equipos]
  if (e.length % 2 === 1) e.push('')
  const n = e.length
  const rondas: { jornada: number; local: string; visitante: string }[] = []
  const rot = [...e]
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = rot[i]
      const b = rot[n - 1 - i]
      if (!a || !b) continue
      rondas.push(r % 2 === 0 ? { jornada: r + 1, local: a, visitante: b } : { jornada: r + 1, local: b, visitante: a })
    }
    rot.splice(1, 0, rot.pop() as string)
  }
  if (dobleVuelta) {
    const base = rondas.length ? Math.max(...rondas.map((x) => x.jornada)) : 0
    const vuelta = rondas.map((x) => ({ jornada: x.jornada + base, local: x.visitante, visitante: x.local }))
    return [...rondas, ...vuelta]
  }
  return rondas
}
