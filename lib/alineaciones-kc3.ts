// Carga de alineaciones (titulares, ingresos y salidas con minuto) transcritas de las hojas de vocalía.
// Solo crea eventos titular/entra/sale: no toca marcadores, goles, tarjetas ni tabla. Los minutos de los cambios son simulados.
// Criterios: número exacto del club; si no existe o es ilegible, el jugador de nombre más parecido y, si no, el de número más cercano;
// un jugador repetido en la hoja se toma una sola vez; la pareja del cambio es la de la hoja y, si no sirve, el jugador en cancha de número más cercano.
import { normalizar } from '@/lib/importar-kc3'
import { buscarClub, Novedad, PartidoG } from '@/lib/goles-kc3'

export const PREFIJO_ALI = 'xlsxali:'
export type FilaAli = [numero: number | null, nombre: string, pareja: number | null, minuto: number | null]
export interface JugadorA { id: string; teamId: string; number: number | null; nombre: string; posicion?: string | null }
export interface EventoAli { cid: string; partidoId: string; teamId: string; playerId: string; tipo: 'titular' | 'entra' | 'sale'; minuto: number; periodo: number }
export interface PlanAli { eventos: EventoAli[]; reemplazar: { partidoId: string; teamId: string }[]; novedades: Novedad[]; resumen: { clubes: number; partidos: number; titulares: number; ingresos: number } }

const tokens = (t: string) => normalizar(t).split(' ').filter((w) => w.length >= 3)
function parecidoNombre(hoja: string, jugador: string): number {
  const a = tokens(hoja), b = tokens(jugador)
  if (!a.length || !b.length) return 0
  const ok = a.filter((x) => b.some((y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))))).length
  return ok / a.length
}
const esArquero = (j: JugadorA) => /port|arq/i.test(j.posicion || '') || j.number === 1

export function planificarAlineaciones(
  datos: readonly { fecha: number; club: string; filas: readonly FilaAli[] }[], clubes: { id: string; name: string }[], partidos: PartidoG[],
  jugadores: JugadorA[], yaTienen: Set<string> /* «partidoId|teamId» con alineación cargada de otra forma */, dur: number,
): PlanAli {
  const nov: Novedad[] = []
  const eventos: EventoAli[] = []
  const reemplazar: { partidoId: string; teamId: string }[] = []
  const partidosTocados = new Set<string>()
  let titulares = 0, ingresos = 0
  const nombreClub = (id: string) => clubes.find((c) => c.id === id)?.name ?? id

  for (const d of datos) {
    const teamId = buscarClub(d.club, clubes)
    if (!teamId) { nov.push({ nivel: 'error', texto: `Fecha ${d.fecha}: el club «${d.club}» no existe en el sistema; se omite su alineación.` }); continue }
    const nombre = nombreClub(teamId)
    const p = partidos.find((x) => x.jornadaNum === d.fecha && (x.localId === teamId || x.visitanteId === teamId))
    if (!p) { nov.push({ nivel: 'error', texto: `Fecha ${d.fecha}: ${nombre} no tiene partido en el torneo.` }); continue }
    if (yaTienen.has(`${p.id}|${teamId}`)) { nov.push({ nivel: 'aviso', texto: `Fecha ${d.fecha}: ${nombre} ya tenía alineación en ese partido; no se tocó.` }); continue }

    const plantel = jugadores.filter((j) => j.teamId === teamId)
    const porNumero = new Map<number, JugadorA>()
    for (const j of plantel) if (j.number !== null) porNumero.set(j.number, j)
    const usados = new Set<string>()
    const filas: { j: JugadorA; hoja: number | null; pareja: number | null; minuto: number | null }[] = []
    const etiqueta = (j: JugadorA) => `#${j.number ?? '–'} ${j.nombre}`

    for (const [num, nom, pareja, minuto] of d.filas) {
      let j: JugadorA | undefined = num !== null ? porNumero.get(num) : undefined
      let como = ''
      if (!j) {
        const libres = plantel.filter((x) => !usados.has(x.id))
        const nombreHoja = /sin nombre/i.test(nom) ? '' : nom
        const mejor = libres.map((x) => ({ x, s: parecidoNombre(nombreHoja, x.nombre) })).sort((a, b) => b.s - a.s)[0]
        if (mejor && mejor.s >= 0.5) { j = mejor.x; como = 'por nombre' }
        else if (num !== null) {
          const cerca = libres.filter((x) => x.number !== null).sort((a, b) => Math.abs((a.number as number) - num) - Math.abs((b.number as number) - num) || (a.number as number) - (b.number as number))[0]
          if (cerca) { j = cerca; como = 'por número parecido' }
        } else if (mejor && mejor.s > 0) { j = mejor.x; como = 'por nombre (parcial)' }
        if (j) nov.push({ nivel: 'aviso', texto: `Fecha ${d.fecha} · ${nombre}: «${nom}» (${num !== null ? `#${num}` : 'sin número'}) se asignó ${como} a ${etiqueta(j)}.` })
        else { nov.push({ nivel: 'error', texto: `Fecha ${d.fecha} · ${nombre}: «${nom}» (${num !== null ? `#${num}` : 'sin número'}) no tiene a quién asignarse; se omite.` }); continue }
      }
      if (usados.has(j.id)) { nov.push({ nivel: 'aviso', texto: `Fecha ${d.fecha} · ${nombre}: ${etiqueta(j)} aparece repetido en la hoja; se tomó una sola vez.` }); continue }
      usados.add(j.id)
      filas.push({ j, hoja: num, pareja, minuto })
    }
    if (!filas.length) continue

    // Titulares: las primeras 11 filas; el resto son ingresos que van sustituyendo a alguien en cancha
    const tit = filas.slice(0, 11), ing = filas.slice(11)
    const pitch = new Set(tit.map((f) => f.j.id))
    const porHoja = new Map<number, string>()
    for (const f of filas) if (f.hoja !== null) porHoja.set(f.hoja, f.j.id)
    const porId = new Map(filas.map((f) => [f.j.id, f.j]))
    const base = (t: 'T' | 'E' | 'S', pid: string) => `${PREFIJO_ALI}${p.id}:${teamId}:${pid}:${t}`
    for (const f of tit) eventos.push({ cid: base('T', f.j.id), partidoId: p.id, teamId, playerId: f.j.id, tipo: 'titular', minuto: 0, periodo: 0 })
    titulares += tit.length

    const entro = new Map<string, number>() // minuto en que entró cada ingreso: nadie sale en el mismo minuto en que entró
    const orden = ing.map((f, i) => ({ f, i })).sort((a, b) => (a.f.minuto ?? 99 + a.i) - (b.f.minuto ?? 99 + b.i))
    for (const { f } of orden) {
      const minuto = f.minuto ?? 60
      let salePid: string | null = f.pareja !== null ? porHoja.get(f.pareja) ?? null : null
      const puedeSalir = (id: string) => pitch.has(id) && (entro.get(id) ?? -1) < minuto
      if (!salePid || !puedeSalir(salePid)) {
        const objetivo = f.pareja ?? f.hoja ?? f.j.number ?? 0
        const cands = [...pitch].filter(puedeSalir).map((id) => porId.get(id) as JugadorA).filter(Boolean)
        const sinArquero = cands.filter((c) => !esArquero(c))
        const lista = (sinArquero.length ? sinArquero : cands).sort((a, b) => Math.abs((a.number ?? 0) - objetivo) - Math.abs((b.number ?? 0) - objetivo))
        salePid = lista[0]?.id ?? null
      }
      if (!salePid) continue
      pitch.delete(salePid); pitch.add(f.j.id); entro.set(f.j.id, minuto)
      const periodo = minuto <= dur ? 1 : 2
      eventos.push({ cid: base('S', salePid), partidoId: p.id, teamId, playerId: salePid, tipo: 'sale', minuto, periodo })
      eventos.push({ cid: base('E', f.j.id), partidoId: p.id, teamId, playerId: f.j.id, tipo: 'entra', minuto, periodo })
      ingresos++
    }
    reemplazar.push({ partidoId: p.id, teamId }); partidosTocados.add(p.id)
    if (tit.length < 11) nov.push({ nivel: 'ok', texto: `Fecha ${d.fecha} · ${nombre}: solo ${tit.length} titulares en la hoja; se cargaron así.` })
  }
  return { eventos, reemplazar, novedades: nov, resumen: { clubes: reemplazar.length, partidos: partidosTocados.size, titulares, ingresos } }
}
