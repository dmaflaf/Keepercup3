// Carga de goles por jugador (desde GOLES_KC3.xlsx) en los partidos del torneo importado de la herramienta de GitHub Pages.
// Reglas: el marcador manda (nunca se cargan más goles que los del marcador); un número que no existe en el club se asigna
// al máximo goleador de ese club en el archivo; los minutos son simulados (reproducibles); un partido que ya tiene goles
// cargados de otra forma, o ganado en mesa, no se toca.
import { claveClub, normalizar } from '@/lib/importar-kc3'

export const PREFIJO_GOL = 'xlsxgol:'
const ALIAS: Record<string, string> = { leipzig: 'Leipzig RB', 'leipzig rb': 'Leipzig RB', 'atl madrid': 'San Francisco', 'atletico madrid': 'San Francisco', 'alianza jr': 'Alianza Jr.' }
/** Partidos que no se cargan (ganados o perdidos en mesa): fecha y dos clubes. */
const EN_MESA: { fecha: number; clubes: [string, string] }[] = [{ fecha: 1, clubes: ['leipzig', 'america'] }]

/** Club del sistema que corresponde al nombre escrito: igual; sin «SC/FC…» (Libert = Libert SC); o sin espacios (Sub 21 = Sub21). */
export function buscarClub(nombre: string, clubes: { id: string; name: string }[]): string | null {
  const n = normalizar(ALIAS[normalizar(nombre)] ?? nombre)
  const unico = (clave: (t: string) => string) => { const k = clave(n); const cand = clubes.filter((x) => clave(x.name) === k); return k && cand.length === 1 ? cand[0] : undefined }
  // Compacto: sin espacios ni puntos y sin «SC/FC/CF/CD/Club» al final («Libert S.C.» = «Libert», «Sub 21» = «Sub21»)
  const compacto = (t: string) => normalizar(t).replace(/ /g, '').replace(/(sc|fc|cf|cd|club)$/, '')
  const c = clubes.find((x) => normalizar(x.name) === n) || unico(claveClub) || unico((t) => claveClub(t).replace(/ /g, '')) || unico(compacto)
  return c?.id ?? null
}

export interface PartidoG { id: string; jornadaNum: number; localId: string; visitanteId: string; golesLocal: number | null; golesVisitante: number | null }
export interface JugadorG { id: string; teamId: string; number: number | null; nombre: string }
export interface GolNuevo { cid: string; partidoId: string; teamId: string; playerId: string; minuto: number; periodo: number }
export interface Novedad { nivel: 'ok' | 'aviso' | 'error'; texto: string }
export interface PlanGoles { nuevos: GolNuevo[]; reemplazar: { partidoId: string; teamId: string }[]; novedades: Novedad[]; resumen: { grupos: number; goles: number; partidos: number } }

function semilla(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
function azar(seed: number) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

export function planificarGoles(
  filas: readonly (readonly [number, string, number, number])[], clubes: { id: string; name: string }[], partidos: PartidoG[],
  jugadores: JugadorG[], golesAjenos: Set<string> /* «partidoId|teamId» con goles cargados de otra forma */, dur: number,
): PlanGoles {
  const nov: Novedad[] = []
  const idClub = (nombre: string) => buscarClub(nombre, clubes)
  const nombreClub = (id: string) => clubes.find((c) => c.id === id)?.name ?? id
  // Agrupar por fecha + club (sumando si el mismo número aparece dos veces)
  const grupos = new Map<string, { fecha: number; club: string; teamId: string; nums: Map<number, number> }>()
  for (const [fecha, club, numero, goles] of filas) {
    const teamId = idClub(club)
    if (!teamId) { nov.push({ nivel: 'error', texto: `Fecha ${fecha}: el club «${club}» no existe en el sistema; se omiten sus ${goles} gol(es) del #${numero}.` }); continue }
    const k = `${fecha}|${teamId}`
    const g = grupos.get(k) || { fecha, club, teamId, nums: new Map() }
    g.nums.set(numero, (g.nums.get(numero) || 0) + goles)
    grupos.set(k, g)
  }
  // Clubes con goles en el marcador pero sin filas en el archivo: también se completan (con el goleador del club)
  const fechasArchivo = new Set(filas.map((x) => x[0]))
  for (const p of partidos) {
    if (!fechasArchivo.has(p.jornadaNum)) continue
    for (const [teamId, goles] of [[p.localId, p.golesLocal], [p.visitanteId, p.golesVisitante]] as const) {
      const k = `${p.jornadaNum}|${teamId}`
      if (goles && !grupos.has(k)) grupos.set(k, { fecha: p.jornadaNum, club: nombreClub(teamId), teamId, nums: new Map() })
    }
  }
  const nuevos: GolNuevo[] = []
  const reemplazar: { partidoId: string; teamId: string }[] = []
  const partidosTocados = new Set<string>()
  for (const g of grupos.values()) {
    const nombre = nombreClub(g.teamId)
    const p = partidos.find((x) => x.jornadaNum === g.fecha && (x.localId === g.teamId || x.visitanteId === g.teamId))
    if (!p) { nov.push({ nivel: 'error', texto: `Fecha ${g.fecha}: ${nombre} no tiene partido en el torneo.` }); continue }
    const rival = p.localId === g.teamId ? p.visitanteId : p.localId
    if (EN_MESA.some((m) => m.fecha === g.fecha && [normalizar(nombre), normalizar(nombreClub(rival))].every((n) => m.clubes.includes(n)))) {
      nov.push({ nivel: 'aviso', texto: `Fecha ${g.fecha}: ${nombre} vs ${nombreClub(rival)} se decidió en mesa; no se cargan goles.` }); continue
    }
    const objetivo = p.localId === g.teamId ? p.golesLocal : p.golesVisitante
    if (objetivo === null) { nov.push({ nivel: 'error', texto: `Fecha ${g.fecha}: ${nombre} no tiene marcador cargado; se omite.` }); continue }
    if (golesAjenos.has(`${p.id}|${g.teamId}`)) { nov.push({ nivel: 'aviso', texto: `Fecha ${g.fecha}: ${nombre} ya tenía goles cargados en ese partido; no se tocó.` }); continue }

    // Cotejo por número; el que no existe va al máximo goleador del club (en el archivo)
    const delClub = jugadores.filter((j) => j.teamId === g.teamId)
    const porNumero = new Map<number, string>()
    for (const j of delClub) if (j.number !== null) porNumero.set(j.number, j.id)
    const totalEnArchivo = new Map<string, number>()
    for (const f of filas) { if (idClub(f[1]) !== g.teamId) continue; const pid = porNumero.get(f[2]); if (pid) totalEnArchivo.set(pid, (totalEnArchivo.get(pid) || 0) + f[3]) }
    const maximo = [...totalEnArchivo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    const porJugador = new Map<string, number>()
    for (const [num, goles] of g.nums) {
      let pid = porNumero.get(num) ?? null
      if (!pid) {
        pid = maximo
        const dest = pid ? delClub.find((j) => j.id === pid) : null
        nov.push({ nivel: 'aviso', texto: `Fecha ${g.fecha} · ${nombre}: el #${num} no existe en el club; ${goles} gol(es) ${dest ? `pasan a #${dest.number} ${dest.nombre} (el que más goles tiene)` : 'quedan sin asignar (el club no tiene jugadores con goles)'}.` })
      }
      if (pid) porJugador.set(pid, (porJugador.get(pid) || 0) + goles)
    }
    let total = [...porJugador.values()].reduce((a, b) => a + b, 0)
    // El marcador manda: quitar de los que menos goles tienen (empate: el último)
    while (total > objetivo) {
      const orden = [...porJugador.entries()].filter(([, v]) => v > 0)
      const menor = Math.min(...orden.map(([, v]) => v))
      const [pid] = [...orden].reverse().find(([, v]) => v === menor)!
      porJugador.set(pid, porJugador.get(pid)! - 1)
      const j = delClub.find((x) => x.id === pid)
      nov.push({ nivel: 'aviso', texto: `Fecha ${g.fecha} · ${nombre}: el archivo trae ${total} gol(es) y el marcador ${objetivo}; se quitó 1 de #${j?.number} ${j?.nombre}.` })
      total--
    }
    if (total < objetivo) {
      const dest = maximo ? delClub.find((j) => j.id === maximo) : null
      if (dest) {
        porJugador.set(dest.id, (porJugador.get(dest.id) || 0) + (objetivo - total))
        nov.push({ nivel: 'aviso', texto: `Fecha ${g.fecha} · ${nombre}: el marcador es ${objetivo} y el archivo trae ${total}; ${objetivo - total} gol(es) pasan a #${dest.number} ${dest.nombre} (el goleador del club).` })
        total = objetivo
      } else nov.push({ nivel: 'aviso', texto: `Fecha ${g.fecha} · ${nombre}: el marcador es ${objetivo} y solo hay ${total} gol(es) con jugador; el club no tiene goleador con quién completar.` })
    }
    if (total === 0) continue

    // Minutos simulados y reproducibles
    const rnd = azar(semilla(`${p.id}|${g.teamId}`))
    const minutos = new Set<number>()
    while (minutos.size < total) minutos.add(1 + Math.floor(rnd() * (2 * dur)))
    const orden = [...minutos].sort((a, b) => a - b)
    let i = 0
    for (const [pid, n] of [...porJugador.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      for (let k = 0; k < n; k++) { const minuto = orden[i++]; nuevos.push({ cid: `${PREFIJO_GOL}${p.id}:${g.teamId}:${pid}:${k}`, partidoId: p.id, teamId: g.teamId, playerId: pid, minuto, periodo: minuto <= dur ? 1 : 2 }) }
    }
    reemplazar.push({ partidoId: p.id, teamId: g.teamId })
    partidosTocados.add(p.id)
  }
  return { nuevos, reemplazar, novedades: nov, resumen: { grupos: reemplazar.length, goles: nuevos.length, partidos: partidosTocados.size } }
}
