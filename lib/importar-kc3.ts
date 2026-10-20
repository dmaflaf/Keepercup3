// Importación del torneo desde la herramienta «Keeper Cup 3» (GitHub Pages): formato keeper-cup-3/export v1.
// Funciones puras, las usan la pantalla (para mostrar la vista previa) y el servidor (que vuelve a validar todo).
export interface DatosKC3 {
  formato: string
  version_formato: number
  torneo: { nombre: string; grupos: { id: string; nombre: string; equipos: string[] }[]; precios_usd?: { amarilla: number; roja_directa: number } }
  equipos: { nombre: string; grupo: string }[]
  partidos: { id: string; fecha: number; grupo: string; local: string; visitante: string; estadio: string | null; fecha_iso: string | null; hora_24h: string | null; goles_local: number | null; goles_visitante: number | null; resultado_cargado: boolean; estado: string }[]
  tarjetas: { id: string; partido_id: string; fecha: number; grupo: string; equipo: string; jugador: string; tipo: 'amarilla' | 'roja_directa' }[]
  pagos: { id: string; equipo: string; monto_usd: number; nota: string }[]
}
export interface ClubSistema { id: string; name: string }
export interface JugadorSistema { id: string; teamId: string; numero: number | null; nombre: string }

export const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const GENERICAS = new Set(['club', 'deportivo', 'fc', 'cd', 'cf', 'sc', 'de', 'del', 'la', 'el', 'sporting', 'futbol', 'academia', 'escuela'])
export const claveClub = (t: string) => normalizar(t).split(' ').filter((w) => !GENERICAS.has(w)).join(' ')

/** Número de camiseta de la tarjeta («17» → 17; «51 - Cuerpo técnico» → 51 pero se marca como no jugador). */
export function numeroDe(raw: string): number | null {
  const m = String(raw).trim().match(/^(\d{1,3})\b/)
  return m ? Number(m[1]) : null
}
export const esCuerpoTecnico = (raw: string) => /cuerpo|t[eé]cnico|dt\b|asistente/i.test(raw)

export function validarDatos(d: unknown): string | null {
  const x = d as Partial<DatosKC3> | null
  if (!x || x.formato !== 'keeper-cup-3/export') return 'El archivo no es una exportación de Keeper Cup 3 (falta «formato: keeper-cup-3/export»).'
  if (x.version_formato !== 1) return 'Versión de formato no soportada.'
  if (!Array.isArray(x.partidos) || !Array.isArray(x.tarjetas) || !Array.isArray(x.pagos) || !x.torneo?.grupos?.length) return 'Al archivo le faltan partidos, tarjetas, pagos o grupos.'
  return null
}

/** Enlaza cada equipo de la herramienta con un club del sistema: nombre igual, o igual sin «Club», «FC», «Sporting»… si es único. */
export function enlazarClubes(equipos: string[], clubes: ClubSistema[]): Record<string, string> {
  const mapa: Record<string, string> = {}
  for (const e of equipos) {
    let c = clubes.find((x) => normalizar(x.name) === normalizar(e))
    if (!c) { const k = claveClub(e); const cand = clubes.filter((x) => claveClub(x.name) === k); if (cand.length === 1 && k) c = cand[0] }
    if (c) mapa[e] = c.id
  }
  return mapa
}

export type Resolucion = string | 'ignorar' // id de jugador, o ignorar
export interface TarjetaResuelta { id: string; partido_id: string; equipo: string; jugadorRaw: string; tipo: 'amarilla' | 'roja_directa'; estado: 'auto' | 'manual' | 'ignorada' | 'sin'; playerId: string | null; teamId: string | null }

/** Cotejo de cada tarjeta con el jugador que tiene ese número en el club. `manual` usa la llave «equipo|jugadorRaw». */
export function cotejarTarjetas(d: DatosKC3, mapaClubes: Record<string, string>, jugadores: JugadorSistema[], manual: Record<string, Resolucion>): TarjetaResuelta[] {
  const porClub = new Map<string, JugadorSistema[]>()
  for (const j of jugadores) porClub.set(j.teamId, [...(porClub.get(j.teamId) || []), j])
  return d.tarjetas.map((t) => {
    const teamId = mapaClubes[t.equipo] || null
    const base = { id: t.id, partido_id: t.partido_id, equipo: t.equipo, jugadorRaw: t.jugador, tipo: t.tipo, teamId }
    const m = manual[`${t.equipo}|${t.jugador}`]
    if (m === 'ignorar') return { ...base, estado: 'ignorada' as const, playerId: null }
    const lista = teamId ? porClub.get(teamId) || [] : []
    if (m) { const j = lista.find((x) => x.id === m); return j ? { ...base, estado: 'manual' as const, playerId: j.id } : { ...base, estado: 'sin' as const, playerId: null } }
    const n = numeroDe(t.jugador)
    if (n === null || esCuerpoTecnico(t.jugador)) return { ...base, estado: 'sin' as const, playerId: null }
    const j = lista.find((x) => x.numero === n)
    return j ? { ...base, estado: 'auto' as const, playerId: j.id } : { ...base, estado: 'sin' as const, playerId: null }
  })
}

/** Eventos de tarjeta del sistema: dos amarillas del mismo jugador en un partido pasan a «doble_amarilla» (regla del torneo). */
export function eventosDeTarjetas(res: TarjetaResuelta[]): { cid: string; partido_id: string; teamId: string; playerId: string; tipo: 'amarilla' | 'doble_amarilla' | 'roja' }[] {
  const out: { cid: string; partido_id: string; teamId: string; playerId: string; tipo: 'amarilla' | 'doble_amarilla' | 'roja' }[] = []
  const amarillas = new Map<string, TarjetaResuelta[]>()
  for (const t of res) {
    if (!t.playerId || !t.teamId) continue
    if (t.tipo === 'roja_directa') { out.push({ cid: `kc3:${t.id}`, partido_id: t.partido_id, teamId: t.teamId, playerId: t.playerId, tipo: 'roja' }); continue }
    const k = `${t.partido_id}|${t.playerId}`
    amarillas.set(k, [...(amarillas.get(k) || []), t])
  }
  for (const lista of Array.from(amarillas.values())) {
    const dobles = Math.floor(lista.length / 2)
    for (let i = 0; i < dobles; i++) out.push({ cid: `kc3:${lista[2 * i].id}+${lista[2 * i + 1].id}`, partido_id: lista[0].partido_id, teamId: lista[0].teamId as string, playerId: lista[0].playerId as string, tipo: 'doble_amarilla' })
    if (lista.length % 2 === 1) { const t = lista[lista.length - 1]; out.push({ cid: `kc3:${t.id}`, partido_id: t.partido_id, teamId: t.teamId as string, playerId: t.playerId as string, tipo: 'amarilla' }) }
  }
  return out
}
