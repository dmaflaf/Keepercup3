// Convierte el archivo del sorteo de la Fase 2 (sorteo-fase2-XXXX.json de la herramienta de GitHub Pages) al formato de
// «Subir JSON». Usa los grupos que ya existan en el sistema con esos mismos clubes (por ejemplo «Grupo 4 Copa Plata»
// creado en Torneo) y solo crea los que falten. Los partidos llevan su fecha (8, 9, 10), día, hora y estadio.
import { buscarClub } from '@/lib/goles-kc3'
import { DatosFases, EstadoTorneo, FaseJson, horaDe } from '@/lib/fases-prog'
import type { DiaFecha } from '@/lib/fases-db'

interface EquipoS { nombre: string; puesto?: number; grupoFase1?: string; codigo?: string }
interface GrupoS { copa: string; grupo: number | string; equipos: EquipoS[] }
interface PartidoS { fecha: number; fechaFase2?: number; copa: string; grupo: number | string; home: string; away: string; estadio?: string; dia?: string; fechaCal?: string; hora?: string }
export interface SorteoF2 { torneo?: string; fase?: number; semilla?: string; prueba?: boolean; generado?: string; grupos: GrupoS[]; partidos: PartidoS[] }

export const esSorteo = (x: unknown): x is SorteoF2 => {
  const o = x as SorteoF2
  return !!o && Array.isArray(o.grupos) && Array.isArray(o.partidos) && !!o.grupos[0]?.copa && o.partidos[0]?.home !== undefined
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** «13 de noviembre» → «2026-11-13» */
export function fechaCal(t: string | undefined, anio: number): string | null {
  const m = String(t || '').toLowerCase().match(/(\d{1,2})\s+de\s+([a-zé]+)/)
  if (!m) return null
  const mes = MESES.indexOf(m[2].replace('setiembre', 'septiembre'))
  return mes < 0 ? null : `${anio}-${String(mes + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

export function desdeSorteo(x: SorteoF2, e: EstadoTorneo): { datos: DatosFases; dias: Record<number, DiaFecha[]>; notas: string[] } {
  const notas: string[] = []
  if (x.prueba) notas.push('⚠ Este archivo es de un sorteo de PRUEBA, no del real.')
  if (x.semilla) notas.push(`Sorteo con semilla ${x.semilla}${x.generado ? ` (generado el ${new Date(x.generado).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })})` : ''}.`)
  const anio = Number((x.generado || '').slice(0, 4)) || new Date().getFullYear()
  const id = (n: string) => buscarClub(n, e.clubes)
  const clave = (g: { copa: string; grupo: number | string }) => `${g.copa}|${g.grupo}`
  const faseDe = new Map(e.fases.map((f) => [f.id, f.nombre]))

  // Grupo del sistema para cada grupo del sorteo: el que tenga sus mismos clubes (o 3 de 4)
  const destino = new Map<string, { fase: string; grupo: string }>()
  const usados = new Set<string>()
  for (const g of x.grupos) {
    const ids = g.equipos.map((t) => id(t.nombre)).filter(Boolean) as string[]
    let mejor: { g: EstadoTorneo['grupos'][number]; n: number; tam: number } | null = null
    for (const sg of e.grupos) {
      if (usados.has(sg.id)) continue
      const mi = e.miembros.filter((m) => m.grupoId === sg.id).map((m) => m.teamId)
      if (mi.length > 6) continue // grupos de la Fase 1 (8 clubes)
      const n = ids.filter((i) => mi.includes(i)).length
      if (n >= 3 && (!mejor || n > mejor.n)) mejor = { g: sg, n, tam: mi.length }
    }
    if (mejor) {
      usados.add(mejor.g.id)
      destino.set(clave(g), { fase: faseDe.get(mejor.g.faseId) || 'Fase 2', grupo: mejor.g.nombre })
      if (mejor.n < ids.length || mejor.tam !== ids.length) notas.push(`El grupo «${mejor.g.nombre}» del sistema no tiene exactamente los mismos clubes que el grupo ${g.grupo} de Copa ${g.copa} del sorteo: se agregan los que falten (no se quita ninguno). Revísalo en Torneo.`)
    }
  }
  // Los que no existen: a la misma fase donde están los otros grupos de su copa, o a una fase nueva «Copa Oro» / «Copa Plata»
  for (const g of x.grupos) {
    if (destino.has(clave(g))) continue
    const hermano = x.grupos.map((o) => destino.get(clave(o)) && o.copa === g.copa ? destino.get(clave(o)) : null).find(Boolean)
      || (Array.from(destino.values()).length && new Set(Array.from(destino.values()).map((d) => d.fase)).size === 1 ? Array.from(destino.values())[0] : null)
    destino.set(clave(g), { fase: hermano ? hermano.fase : `Copa ${g.copa}`, grupo: `Grupo ${g.grupo} Copa ${g.copa}` })
  }
  const existentes = x.grupos.filter((g) => e.grupos.some((sg) => sg.nombre === destino.get(clave(g))?.grupo && faseDe.get(sg.faseId) === destino.get(clave(g))?.fase)).length
  notas.push(existentes ? `${existentes} de ${x.grupos.length} grupos ya existen en el sistema y se usan tal cual${existentes < x.grupos.length ? '; los demás se crean' : ''}.` : `Ningún grupo existe todavía: se crean los ${x.grupos.length} grupos.`)

  const fases = new Map<string, FaseJson>()
  const fase = (n: string) => { let f = fases.get(n); if (!f) { f = { nombre: n, tipo: 'grupos', grupos: [], partidos: [] }; fases.set(n, f) } return f }
  for (const g of x.grupos) { const d = destino.get(clave(g))!; fase(d.fase).grupos!.push({ nombre: d.grupo, equipos: g.equipos.map((t) => t.nombre) }) }
  const dias: Record<number, Map<string, Set<string>>> = {}
  const horasDia = new Map<number, Set<string>>() // horas de cada día de la semana en todo el sorteo
  for (const p of x.partidos) {
    const d = destino.get(clave(p))
    if (!d) { notas.push(`El partido ${p.home} vs ${p.away} es de un grupo que no está en la lista de grupos.`); continue }
    const dia = fechaCal(p.fechaCal, anio), hora = horaDe(p.hora)
    fase(d.fase).partidos!.push({ fecha: Number(p.fecha), grupo: d.grupo, local: p.home, visitante: p.away, ...(dia ? { dia } : {}), ...(hora ? { hora } : {}), ...(p.estadio ? { estadio: p.estadio } : {}) })
    if (dia && hora) {
      const m = (dias[Number(p.fecha)] ||= new Map())
      if (!m.has(dia)) m.set(dia, new Set())
      m.get(dia)!.add(hora)
      const ds = new Date(dia + 'T12:00:00Z').getUTCDay()
      if (!horasDia.has(ds)) horasDia.set(ds, new Set())
      horasDia.get(ds)!.add(hora)
    }
  }
  const diasOut: Record<number, DiaFecha[]> = {}
  for (const [j, m] of Object.entries(dias)) {
    diasOut[Number(j)] = Array.from(m.keys()).sort().map((f) => ({ fecha: f, horas: Array.from(horasDia.get(new Date(f + 'T12:00:00Z').getUTCDay()) || m.get(f)!).sort() }))
  }
  return { datos: { fases: Array.from(fases.values()) }, dias: diasOut, notas }
}
