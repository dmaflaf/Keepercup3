// Planilla de juego en vivo: reloj, operaciones (que se pueden guardar sin conexión y reenviar) y cálculos derivados.
// Todo lo de aquí es puro: lo usan el servidor (para guardar) y el iPad/celular (para mostrar al instante).
import { marcadorDesdeEventos } from '@/lib/torneo'

export type Periodo = 'previo' | 't1' | 'descanso' | 't2' | 'fin' | 'penales'
export const TIPOS_JUEGO = ['gol', 'gol_penal', 'autogol', 'amarilla', 'doble_amarilla', 'roja', 'falta', 'tanda_gol', 'tanda_fallo'] as const
export const TIPOS_PLANILLA = ['titular', 'entra', 'sale', ...TIPOS_JUEGO]

export interface Reloj { periodo: Periodo; base: number; desde: number | null } // base en segundos; desde = epoch ms si corre
export type AccionReloj = 'iniciar' | 'pausar' | 'reanudar' | 'descanso' | 't2' | 'fin' | 'penales' | 'finalizar' | 'reabrir'

export type Op = { id: string; en: number } & (
  | { t: 'titular'; teamId: string; playerId: string; on: boolean }
  | { t: 'reloj'; a: AccionReloj }
  | { t: 'evento'; tipo: string; teamId: string; playerId: string | null; minuto: number; periodo: number }
  | { t: 'cambio'; teamId: string; sale: string; entra: string; minuto: number; periodo: number }
  | { t: 'borrar'; cid: string }
)

export interface EventoP { cid: string; tipo: string; teamId: string; playerId: string | null; minuto: number | null; periodo: number | null }
export interface JugadorP { id: string; nombre: string; numero: number | null; posicion: string | null; teamId: string; suspendido: number }
export interface PartidoP {
  id: string; jornada: string; fecha: string | null; hora: string | null; escenario: string | null
  local: string; visitante: string; localId: string; visitanteId: string
  estado: string; marcadorManual: boolean; golesLocal: number | null; golesVisitante: number | null
  penalesLocal: number | null; penalesVisitante: number | null
  periodo: Periodo; relojBase: number; relojDesde: number | null
  dur: number; titulares: number; cambiosMax: number
}
export interface SnapshotP { partido: PartidoP; jugadores: JugadorP[]; eventos: EventoP[] }

// ---------- Reloj ----------
const detener = (r: Reloj, en: number): Reloj => (r.desde ? { ...r, base: Math.round(r.base + (en - r.desde) / 1000), desde: null } : r)

/** Transición del reloj. Idéntica en el servidor y en el dispositivo. */
export function transicion(r: Reloj, a: AccionReloj, en: number, dur: number): Reloj {
  switch (a) {
    case 'iniciar': return r.periodo === 'previo' ? { periodo: 't1', base: 0, desde: en } : r
    case 'pausar': return detener(r, en)
    case 'reanudar': return !r.desde && (r.periodo === 't1' || r.periodo === 't2') ? { ...r, desde: en } : r
    case 'descanso': return { ...detener(r, en), periodo: 'descanso' }
    case 't2': return { periodo: 't2', base: dur * 60, desde: en }
    case 'fin': return { ...detener(r, en), periodo: 'fin' }
    case 'penales': return { ...detener(r, en), periodo: 'penales' }
    case 'finalizar': return { ...detener(r, en), periodo: 'fin' }
    default: return r
  }
}
export const segundos = (r: Reloj, ahora: number) => Math.max(0, r.base + (r.desde ? (ahora - r.desde) / 1000 : 0))
export const minutoActual = (r: Reloj, ahora: number) => Math.floor(segundos(r, ahora) / 60) + 1
export const mmss = (seg: number) => `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(Math.floor(seg % 60)).padStart(2, '0')}`
/** Minuto con tiempo añadido: 45+2' en el primer tiempo, 90+3' en el segundo. */
export function etiquetaMinuto(minuto: number | null, periodo: number | null, dur: number): string {
  if (minuto === null) return ''
  if (periodo === 1 && minuto > dur) return `${dur}+${minuto - dur}'`
  if (periodo === 2 && minuto > 2 * dur) return `${2 * dur}+${minuto - 2 * dur}'`
  return `${minuto}'`
}
export const periodoNumero = (p: Periodo) => (p === 't1' ? 1 : p === 't2' ? 2 : p === 'penales' ? 3 : 0)

// ---------- Derivados ----------
export function enCancha(eventos: EventoP[], teamId: string): Set<string> {
  const s = new Set<string>()
  for (const e of eventos) {
    if (e.teamId !== teamId || !e.playerId) continue
    if (e.tipo === 'titular' || e.tipo === 'entra') s.add(e.playerId)
  }
  for (const e of eventos) if (e.tipo === 'sale' && e.playerId && e.teamId === teamId) s.delete(e.playerId)
  return s
}
export const jugaron = (eventos: EventoP[], teamId: string) => new Set(eventos.filter((e) => e.teamId === teamId && e.playerId && (e.tipo === 'titular' || e.tipo === 'entra')).map((e) => e.playerId as string))
export const cambiosHechos = (eventos: EventoP[], teamId: string) => eventos.filter((e) => e.teamId === teamId && e.tipo === 'entra').length
export const faltasDe = (eventos: EventoP[], teamId: string) => eventos.filter((e) => e.teamId === teamId && e.tipo === 'falta').length
export const marcadorDe = (s: SnapshotP) => (s.partido.marcadorManual && s.partido.golesLocal !== null ? { golesLocal: s.partido.golesLocal, golesVisitante: s.partido.golesVisitante ?? 0 } : marcadorDesdeEventos(s.partido, s.eventos))
export function tanda(s: SnapshotP) {
  const c = (teamId: string, tipo: string) => s.eventos.filter((e) => e.teamId === teamId && e.tipo === tipo).length
  return { local: c(s.partido.localId, 'tanda_gol'), visitante: c(s.partido.visitanteId, 'tanda_gol'), falloL: c(s.partido.localId, 'tanda_fallo'), falloV: c(s.partido.visitanteId, 'tanda_fallo') }
}
/** Amarillas que lleva el jugador en ESTE partido (para sugerir la doble amarilla). */
export const amarillasEnPartido = (eventos: EventoP[], playerId: string) => eventos.filter((e) => e.playerId === playerId && e.tipo === 'amarilla').length

// ---------- Aplicar una operación (optimista, en el dispositivo) ----------
export function aplicarOp(s: SnapshotP, op: Op): SnapshotP {
  const p = s.partido
  switch (op.t) {
    case 'titular': {
      const sin = s.eventos.filter((e) => !(e.tipo === 'titular' && e.playerId === op.playerId))
      return { ...s, eventos: op.on ? [...sin, { cid: `T:${p.id}:${op.playerId}`, tipo: 'titular', teamId: op.teamId, playerId: op.playerId, minuto: 0, periodo: 0 }] : sin }
    }
    case 'reloj': {
      const r = transicion({ periodo: p.periodo, base: p.relojBase, desde: p.relojDesde }, op.a, op.en, p.dur)
      const base = { ...p, periodo: r.periodo, relojBase: r.base, relojDesde: r.desde }
      if (op.a === 'finalizar') return { ...s, partido: { ...base, estado: 'finalizado', ...marcadorDe(s) } }
      if (op.a === 'reabrir') return { ...s, partido: { ...base, estado: 'programado' } }
      return { ...s, partido: base }
    }
    case 'evento': {
      const ev = [...s.eventos, { cid: op.id, tipo: op.tipo, teamId: op.teamId, playerId: op.playerId, minuto: op.minuto, periodo: op.periodo }]
      return { ...s, eventos: ev, partido: p.marcadorManual ? p : { ...p, ...marcadorDesdeEventos(p, ev) } }
    }
    case 'cambio':
      return { ...s, eventos: [...s.eventos,
        { cid: `${op.id}-s`, tipo: 'sale', teamId: op.teamId, playerId: op.sale, minuto: op.minuto, periodo: op.periodo },
        { cid: `${op.id}-e`, tipo: 'entra', teamId: op.teamId, playerId: op.entra, minuto: op.minuto, periodo: op.periodo }] }
    case 'borrar': {
      const ev = s.eventos.filter((e) => e.cid !== op.cid && e.cid !== `${op.cid}-s` && e.cid !== `${op.cid}-e`)
      return { ...s, eventos: ev, partido: p.marcadorManual ? p : { ...p, ...marcadorDesdeEventos(p, ev) } }
    }
  }
}

// ---------- Estadísticas de jugadores y porteros (para la ficha) ----------
export interface PartidoStat {
  localId: string; visitanteId: string; estado: string; duracion: number // minutos totales del partido
  eventos: { teamId: string; playerId: string | null; tipo: string; minuto?: number | null }[]
}
export const esPortero = (pos: string | null | undefined) => /port|arq/i.test(pos || '')

/** Minutos jugados y, si es portero, goles recibidos en ese partido. null si el jugador no jugó. */
export function intervaloJugador(p: PartidoStat, teamId: string, playerId: string): { desde: number; hasta: number } | null {
  const ent = p.eventos.find((e) => e.playerId === playerId && e.tipo === 'entra')
  const tit = p.eventos.find((e) => e.playerId === playerId && e.tipo === 'titular')
  const sal = p.eventos.find((e) => e.playerId === playerId && e.tipo === 'sale')
  if (!ent && !tit) return null
  const desde = tit ? 0 : Math.max(0, (ent!.minuto ?? 1) - 1)
  const hasta = sal ? (sal.minuto ?? p.duracion + 1) - 1 : p.duracion // el que sale deja el minuto del cambio al que entra
  return { desde, hasta: Math.max(desde, hasta) }
}
export function golesRecibidosEn(p: PartidoStat, teamId: string, desde: number, hasta: number): number {
  return p.eventos.filter((e) => {
    const m = e.minuto ?? 0
    const enContra = ((e.tipo === 'gol' || e.tipo === 'gol_penal') && e.teamId !== teamId) || (e.tipo === 'autogol' && e.teamId === teamId)
    return enContra && m > desde && m <= hasta
  }).length
}
