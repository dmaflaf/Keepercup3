// Agregar fases nuevas al torneo (p. ej. Copa Oro / Copa Plata y sus cuartos) desde un JSON o desde el formulario
// «Adicionar fase» de Programación. Todo se planifica primero (vista previa) y se aplica después.
// Nunca toca partidos ya jugados ni sus eventos; las fechas siguen la numeración del torneo (Fase 1 = 1..7, luego 8, 9, 10...).
import { buscarClub } from '@/lib/goles-kc3'
import { normalizar } from '@/lib/importar-kc3'
import { roundRobin } from '@/lib/torneo'

export interface PartidoJson { fecha: number; etiqueta?: string; grupo?: string; local: string; visitante: string; dia?: string; hora?: string; estadio?: string }
export interface FaseJson { nombre: string; tipo?: 'grupos' | 'eliminatoria'; grupos?: { nombre: string; equipos: string[] }[]; generar?: { primeraFecha: number; idaYVuelta?: boolean }; partidos?: PartidoJson[] }
export interface DatosFases { fases: FaseJson[] }

export interface EstadoTorneo {
  fases: { id: string; nombre: string; tipo: string }[]
  grupos: { id: string; faseId: string; nombre: string }[]
  miembros: { grupoId: string; teamId: string }[]
  partidos: { id: string; faseId: string; grupoId: string | null; jornada: string; jornadaNum: number; jornadaJuego: number | null; localId: string; visitanteId: string; fecha: string | null; hora: string | null; escenario: string | null; estado: string; eventos: number }[]
  clubes: { id: string; name: string }[]
  cerradas: number[]
}

/** Referencia a una fase o grupo: el id si ya existe, o «nuevo:N» si lo crea este plan. */
export type Ref = string
export interface Plan {
  errores: string[]
  avisos: string[]
  fasesNuevas: { ref: Ref; nombre: string; tipo: string }[]
  gruposNuevos: { ref: Ref; faseRef: Ref; nombre: string }[]
  miembrosNuevos: { grupoRef: Ref; teamId: string }[]
  crear: { faseRef: Ref; grupoRef: Ref | null; jornada: string; jornadaNum: number; localId: string; visitanteId: string; fecha: string | null; hora: string | null; escenario: string | null }[]
  actualizar: { id: string; data: { jornada?: string; jornadaNum?: number; grupoRef?: Ref | null; localId?: string; visitanteId?: string; fecha?: string | null; hora?: string | null; escenario?: string | null } }[]
  sinCambio: number
  jugados: string[]
  resumen: { fase: string; tipo: string; nueva: boolean; grupos: { nombre: string; equipos: string[] }[]; fechas: number[]; partidos: number }[]
}

const clave = (t: string) => normalizar(t).replace(/ /g, '')
/** «19h00», «19:00», «7:00» → «19:00» / «07:00»; null si no es una hora. */
export function horaDe(t: unknown): string | null {
  const m = String(t ?? '').trim().toLowerCase().match(/^(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*$/) || String(t ?? '').trim().match(/^(\d{1,2})$/)
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2] || 0)
  return h <= 23 && mi <= 59 ? `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}` : null
}
/** «2026-11-13» o «13/11/2026» → «2026-11-13»; null si no es una fecha. */
export function diaDe(t: unknown): string | null {
  const s = String(t ?? '').trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return s
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

/** Revisa la forma del JSON. Acepta { fases: [...] } o una sola fase { nombre, ... }. */
export function leerDatos(x: unknown): { datos?: DatosFases; error?: string } {
  if (!x || typeof x !== 'object') return { error: 'El archivo no es un JSON válido.' }
  const o = x as Record<string, unknown>
  const fases = Array.isArray(o.fases) ? o.fases : typeof o.nombre === 'string' ? [o] : null
  if (!fases || !fases.length) return { error: 'El JSON debe traer «fases»: [ { "nombre": ..., "partidos": [...] } ].' }
  for (const [i, f] of (fases as Record<string, unknown>[]).entries()) {
    if (!f || typeof f.nombre !== 'string' || !f.nombre.trim()) return { error: `La fase ${i + 1} no tiene «nombre».` }
    if (f.tipo !== undefined && f.tipo !== 'grupos' && f.tipo !== 'eliminatoria') return { error: `«${f.nombre}»: el tipo debe ser "grupos" o "eliminatoria".` }
    if (f.grupos !== undefined && (!Array.isArray(f.grupos) || (f.grupos as Record<string, unknown>[]).some((g) => !g || typeof g.nombre !== 'string' || !Array.isArray(g.equipos)))) return { error: `«${f.nombre}»: cada grupo necesita «nombre» y «equipos» (lista de nombres).` }
    if (f.partidos !== undefined && !Array.isArray(f.partidos)) return { error: `«${f.nombre}»: «partidos» debe ser una lista.` }
    for (const [j, p] of ((f.partidos as Record<string, unknown>[]) || []).entries()) {
      if (!p || typeof p.local !== 'string' || typeof p.visitante !== 'string') return { error: `«${f.nombre}», partido ${j + 1}: faltan «local» y «visitante».` }
      if (!Number.isInteger(Number(p.fecha)) || Number(p.fecha) < 1 || Number(p.fecha) > 99) return { error: `«${f.nombre}», partido ${j + 1} (${p.local} vs ${p.visitante}): «fecha» debe ser el número de fecha (8, 9, 10...).` }
    }
    const g = f.generar as Record<string, unknown> | undefined
    if (g !== undefined && (!g || !Number.isInteger(Number(g.primeraFecha)) || Number(g.primeraFecha) < 1)) return { error: `«${f.nombre}»: «generar.primeraFecha» debe ser un número.` }
  }
  return { datos: { fases: fases as FaseJson[] } }
}

export function planificar(datos: DatosFases, e: EstadoTorneo): Plan {
  const plan: Plan = { errores: [], avisos: [], fasesNuevas: [], gruposNuevos: [], miembrosNuevos: [], crear: [], actualizar: [], sinCambio: 0, jugados: [], resumen: [] }
  const nombreClub = (id: string) => e.clubes.find((c) => c.id === id)?.name ?? '?'
  const noEncontrados = new Set<string>()
  const club = (n: string) => { const id = buscarClub(n, e.clubes); if (!id) noEncontrados.add(n); return id }
  let nuevo = 0
  const miembros = e.miembros.map((m) => ({ ...m }))
  const usados = new Set<string>() // partidos existentes ya emparejados con una fila del JSON
  // Casillas y horarios ocupados por partidos que no se tocan (para avisar choques)
  const ocupadas: { id: string | null; fecha: string; hora: string; escenario: string | null; equipos: string[]; texto: string; nuevo?: boolean }[] = []
  const nombresFase = new Set<string>()

  for (const f of datos.fases) {
    const nombre = f.nombre.trim().slice(0, 80)
    if (nombresFase.has(clave(nombre))) { plan.errores.push(`La fase «${nombre}» está dos veces en el archivo.`); continue }
    nombresFase.add(clave(nombre))
    const existe = e.fases.find((x) => clave(x.nombre) === clave(nombre))
    const tipo = f.tipo || (existe?.tipo as 'grupos' | 'eliminatoria') || (f.grupos?.length ? 'grupos' : 'eliminatoria')
    const faseRef: Ref = existe ? existe.id : `nuevo:${nuevo++}`
    if (!existe) plan.fasesNuevas.push({ ref: faseRef, nombre, tipo })
    else if (existe.tipo !== tipo) plan.avisos.push(`«${nombre}» ya existe como fase ${existe.tipo === 'grupos' ? 'por grupos' : 'eliminatoria'}: se mantiene así.`)

    // Grupos de esta fase
    const grupos = new Map<string, { ref: Ref; nombre: string }>()
    for (const g of e.grupos.filter((x) => x.faseId === faseRef)) grupos.set(clave(g.nombre), { ref: g.id, nombre: g.nombre })
    const grupoDe = (n: string): Ref => {
      const k = clave(n)
      let g = grupos.get(k)
      if (!g) {
        g = { ref: `nuevo:${nuevo++}`, nombre: n.trim().slice(0, 60) }
        grupos.set(k, g)
        plan.gruposNuevos.push({ ref: g.ref, faseRef, nombre: g.nombre })
      }
      return g.ref
    }
    const meter = (grupoRef: Ref, teamId: string) => {
      if (miembros.some((m) => m.grupoId === grupoRef && m.teamId === teamId)) return
      miembros.push({ grupoId: grupoRef, teamId }); plan.miembrosNuevos.push({ grupoRef, teamId })
    }
    for (const g of f.grupos || []) {
      const ref = grupoDe(g.nombre)
      const ids = g.equipos.map((n) => club(String(n))).filter(Boolean) as string[]
      ids.forEach((id) => meter(ref, id))
    }

    // Partidos: los del archivo, o generados todos contra todos en cada grupo
    let filas: PartidoJson[] = [...(f.partidos || [])]
    if (!filas.length && f.generar) {
      for (const g of f.grupos || []) {
        const ids = g.equipos.map((n) => String(n))
        for (const c of roundRobin(ids, !!f.generar.idaYVuelta)) filas.push({ fecha: Number(f.generar.primeraFecha) + c.jornada - 1, grupo: g.nombre, local: c.local, visitante: c.visitante })
      }
    }
    filas = filas.map((p) => ({ ...p, fecha: Number(p.fecha) }))
    const fechas = new Set<number>()
    const porJornada = new Map<number, Set<string>>()
    for (const p of filas) {
      const loc = club(p.local), vis = club(p.visitante)
      if (!loc || !vis) continue
      const txt = `${nombre} · Fecha ${p.fecha}: ${nombreClub(loc)} vs ${nombreClub(vis)}`
      if (loc === vis) { plan.errores.push(`${txt}: es el mismo club.`); continue }
      const ya = porJornada.get(p.fecha) || new Set<string>()
      for (const id of [loc, vis]) if (ya.has(id)) plan.errores.push(`${nombre} · Fecha ${p.fecha}: ${nombreClub(id)} juega dos veces.`)
      ya.add(loc); ya.add(vis); porJornada.set(p.fecha, ya)
      fechas.add(p.fecha)
      const grupoRef = p.grupo ? grupoDe(p.grupo) : null
      if (grupoRef) { meter(grupoRef, loc); meter(grupoRef, vis) }
      const etiqueta = (p.etiqueta && String(p.etiqueta).trim().slice(0, 60)) || `Fecha ${p.fecha}`
      const dia = p.dia ? diaDe(p.dia) : null, hora = p.hora ? horaDe(p.hora) : null, escenario = p.estadio ? String(p.estadio).trim().slice(0, 80) : null
      if (p.dia && !dia) plan.errores.push(`${txt}: el día «${p.dia}» no es válido (usa AAAA-MM-DD).`)
      if (p.hora && !hora) plan.errores.push(`${txt}: la hora «${p.hora}» no es válida (usa 19:00).`)
      if ((dia || hora || escenario) && !(dia && hora && escenario)) plan.avisos.push(`${txt}: para darle horario hacen falta día, hora y estadio; queda por programar.`)
      const conHorario = !!(dia && hora && escenario)
      if (e.cerradas.includes(p.fecha)) { plan.errores.push(`La Fecha ${p.fecha} está cerrada en Programación. Ábrela («Editar fecha») antes de subir.`); continue }

      // ¿Ya existe ese cruce en esta fase? (misma fecha primero; si no, el mismo cruce en otra fecha sin jugar)
      const mismo = (x: EstadoTorneo['partidos'][number]) => x.faseId === faseRef && !usados.has(x.id) && ((x.localId === loc && x.visitanteId === vis) || (x.localId === vis && x.visitanteId === loc))
      const previo = e.partidos.find((x) => mismo(x) && x.jornadaNum === p.fecha) || e.partidos.find((x) => mismo(x) && x.estado !== 'finalizado')
      if (previo) {
        usados.add(previo.id)
        if (previo.estado === 'finalizado') { plan.jugados.push(txt); continue }
        const data: Plan['actualizar'][number]['data'] = {}
        if (previo.jornadaNum !== p.fecha) { data.jornadaNum = p.fecha }
        if (previo.jornada !== etiqueta) data.jornada = etiqueta
        if ((previo.grupoId ?? null) !== grupoRef && grupoRef) data.grupoRef = grupoRef
        if (previo.localId !== loc && !previo.eventos) { data.localId = loc; data.visitanteId = vis }
        if (conHorario && (previo.fecha !== dia || previo.hora !== hora || previo.escenario !== escenario)) Object.assign(data, { fecha: dia, hora, escenario })
        if (Object.keys(data).length) plan.actualizar.push({ id: previo.id, data })
        else plan.sinCambio++
        if (conHorario) ocupadas.push({ id: previo.id, fecha: dia as string, hora: hora as string, escenario, equipos: [loc, vis], texto: txt, nuevo: true })
      } else {
        plan.crear.push({ faseRef, grupoRef, jornada: etiqueta, jornadaNum: p.fecha, localId: loc, visitanteId: vis, fecha: conHorario ? dia : null, hora: conHorario ? hora : null, escenario: conHorario ? escenario : null })
        if (conHorario) ocupadas.push({ id: null, fecha: dia as string, hora: hora as string, escenario, equipos: [loc, vis], texto: txt, nuevo: true })
      }
    }
    for (const n of fechas) {
      // Solo avisa si esa fecha ya se jugó en otra fase (p. ej. poner 1, 2, 3 en vez de 8, 9, 10)
      const otras = e.partidos.filter((x) => x.jornadaNum === n && x.faseId !== faseRef && x.estado === 'finalizado')
      const fasesOtras = Array.from(new Set(otras.map((x) => e.fases.find((y) => y.id === x.faseId)?.nombre || '?')))
      if (fasesOtras.length) plan.avisos.push(`La Fecha ${n} ya se jugó en «${fasesOtras.join('», «')}». ¿Seguro que no es otra fecha (la siguiente libre)?`)
    }
    plan.resumen.push({
      fase: nombre, tipo, nueva: !existe,
      grupos: Array.from(grupos.values()).map((g) => ({ nombre: g.nombre, equipos: miembros.filter((m) => m.grupoId === g.ref).map((m) => nombreClub(m.teamId)) })),
      fechas: Array.from(fechas).sort((a, b) => a - b), partidos: filas.length,
    })
  }
  if (noEncontrados.size) plan.errores.unshift(`No encuentro estos clubes en el sistema: ${Array.from(noEncontrados).join(', ')}. Escríbelos como aparecen en Equipos.`)

  // Choques de horario: con partidos que no se tocan y entre los del propio archivo
  const tocados = new Set(plan.actualizar.filter((u) => 'fecha' in u.data).map((u) => u.id))
  for (const x of e.partidos) {
    if (!x.fecha || !x.hora || tocados.has(x.id) || usados.has(x.id)) continue
    ocupadas.push({ id: x.id, fecha: x.fecha, hora: x.hora, escenario: x.escenario, equipos: [x.localId, x.visitanteId], texto: `Fecha ${x.jornadaJuego ?? x.jornadaNum}: ${nombreClub(x.localId)} vs ${nombreClub(x.visitanteId)}` })
  }
  for (let i = 0; i < ocupadas.length; i++) for (let j = i + 1; j < ocupadas.length; j++) {
    const a = ocupadas[i], b = ocupadas[j]
    if (a.fecha !== b.fecha || a.hora !== b.hora || !(a.nuevo || b.nuevo)) continue // solo choques de lo que se sube
    if (a.escenario && a.escenario === b.escenario) plan.errores.push(`Casilla repetida ${a.fecha} ${a.hora} en ${a.escenario}: «${a.texto}» y «${b.texto}».`)
    else if (a.equipos.some((t) => b.equipos.includes(t))) plan.errores.push(`Un club juega dos partidos el ${a.fecha} a las ${a.hora}: «${a.texto}» y «${b.texto}».`)
  }
  plan.errores = Array.from(new Set(plan.errores)); plan.avisos = Array.from(new Set(plan.avisos))
  return plan
}

/** Reparte los puestos desde..hasta de los grupos de origen en grupos nuevos.
 *  Con tantos grupos como el origen y un equipo de cada puesto por grupo, se cruzan como en el sorteo de la Fase 2:
 *  el grupo g recibe el puesto (desde + p) del grupo de origen (g + p). Si no, se reparte en serpentina. */
export function repartir(origen: string[][], desde: number, hasta: number, nGrupos: number): string[][] {
  const tam = hasta - desde + 1
  const out: string[][] = Array.from({ length: nGrupos }, () => [])
  if (nGrupos === origen.length && tam === nGrupos) {
    for (let g = 0; g < nGrupos; g++) for (let p = 0; p < tam; p++) { const t = origen[(g + p) % nGrupos][desde - 1 + p]; if (t) out[g].push(t) }
    return out
  }
  const lista: string[] = []
  for (let pos = desde; pos <= hasta; pos++) for (const g of origen) if (g[pos - 1]) lista.push(g[pos - 1])
  lista.forEach((t, i) => { const r = Math.floor(i / nGrupos), k = i % nGrupos; out[r % 2 === 0 ? k : nGrupos - 1 - k].push(t) })
  return out
}

/** Cruces de eliminatoria 1° vs 2° entre grupos vecinos: 1A-2B, 1B-2A, 1C-2D, 1D-2C (cuartos con 4 grupos). */
export function crucesPrimeroSegundo(grupos: string[][]): [string, string][] {
  const out: [string, string][] = []
  for (let i = 0; i + 1 < grupos.length; i += 2) {
    const a = grupos[i], b = grupos[i + 1]
    if (a[0] && b[1]) out.push([a[0], b[1]])
    if (b[0] && a[1]) out.push([b[0], a[1]])
  }
  if (grupos.length % 2 === 1) { const u = grupos[grupos.length - 1]; if (u[0] && u[1]) out.push([u[0], u[1]]) }
  return out
}
