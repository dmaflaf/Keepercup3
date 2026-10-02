export type Nivel = 'error' | 'aviso'

export interface Incidencia {
  hoja: 'Equipos' | 'Jugadores'
  fila: number
  nivel: Nivel
  mensaje: string
  detalle?: string
}

export interface EquipoLimpio {
  fila: number
  name: string
  city: string
  directorName: string
  directorCedula: string
  assistantName: string
  contactPhone: string
  contactEmail: string
  logoUrl: string
  nominaUrl: string
  folderUrl: string
  estado: string
  codigoEquipo: string
}

export interface JugadorLimpio {
  fila: number
  equipo: string
  firstName: string
  lastName: string
  cedula: string
  number: number | null
  position: string
  birthDate: string
  email: string
  phone: string
  selfieUrl: string
  cedulaFrontUrl: string
  cedulaBackUrl: string
}

type Fila = Record<string, unknown>
type Indice = Map<string, unknown>

export function normKey(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function limpiar(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim()
}

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'van', 'von'])

export function titleCase(s: string): string {
  return limpiar(s)
    .toLowerCase()
    .split(' ')
    .map((palabra, i) =>
      i > 0 && PARTICULAS.has(palabra)
        ? palabra
        : palabra
            .split('-')
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join('-')
    )
    .join(' ')
}

function indexar(f: Fila): Indice {
  const m: Indice = new Map()
  for (const k of Object.keys(f)) m.set(normKey(k), f[k])
  return m
}

function val(m: Indice, ...nombres: string[]): string {
  for (const n of nombres) {
    const v = m.get(normKey(n))
    if (v !== undefined && limpiar(v) !== '') return limpiar(v)
  }
  return ''
}

export function normCedula(raw: string): string {
  const d = raw.replace(/\D/g, '')
  return d.length === 9 ? '0' + d : d
}

export function cedulaEcuatorianaValida(c: string): boolean {
  if (!/^\d{10}$/.test(c)) return false
  const prov = Number(c.slice(0, 2))
  if ((prov < 1 || prov > 24) && prov !== 30) return false
  if (Number(c[2]) >= 6) return false
  let suma = 0
  for (let i = 0; i < 9; i++) {
    let d = Number(c[i]) * (i % 2 === 0 ? 2 : 1)
    if (d > 9) d -= 9
    suma += d
  }
  return (10 - (suma % 10)) % 10 === Number(c[9])
}

function normTel(raw: string): string {
  const d = raw.replace(/\D/g, '')
  return d.length === 9 && d.startsWith('9') ? '0' + d : d
}

const CORREO_TIPEO = [/@gamil\./, /@gmial\./, /@gmai\./, /@hotmial\./, /@hotmai\./, /@outook\./, /@outlok\./, /\.con$/, /\.cm$/]

function normCorreo(raw: string): { v: string; aviso?: string } {
  const v = raw.toLowerCase().replace(/\s/g, '')
  if (!v) return { v }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return { v, aviso: 'Correo inválido' }
  if (CORREO_TIPEO.some((r) => r.test(v))) return { v, aviso: 'Correo con posible error de tipeo' }
  return { v }
}

function normFecha(raw: string): string | null {
  let y: number, mo: number, d: number
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) {
    ;[y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  } else {
    m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
    if (!m) return null
    ;[d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  }
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${y}-${p(mo)}-${p(d)}`
}

const POSICIONES: Record<string, string> = {
  portero: 'Portero',
  arquero: 'Portero',
  defensa: 'Defensa',
  defensor: 'Defensa',
  mediocampista: 'Mediocampista',
  medio: 'Mediocampista',
  volante: 'Mediocampista',
  delantero: 'Delantero',
  atacante: 'Delantero',
}

function limpiarUrl(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : ''
}

export interface ContextoImportacion {
  equiposExistentes: string[]
  cedulasExistentes: Map<string, string>
}

export function procesar(rawEquipos: Fila[], rawJugadores: Fila[], ctx: ContextoImportacion) {
  const incidencias: Incidencia[] = []
  const equipos: EquipoLimpio[] = []
  const jugadores: JugadorLimpio[] = []
  const nombresEquipo = new Map<string, string>()
  for (const n of ctx.equiposExistentes) nombresEquipo.set(normKey(n), n)

  const vistosEquipo = new Map<string, number>()
  rawEquipos.forEach((raw, idx) => {
    const fila = idx + 2
    const m = indexar(raw)
    const name = val(m, 'Equipo')
    if (!name) {
      if (Array.from(m.values()).some((v) => limpiar(v) !== '')) {
        incidencias.push({ hoja: 'Equipos', fila, nivel: 'error', mensaje: 'Fila sin nombre de equipo' })
      }
      return
    }
    const key = normKey(name)
    if (vistosEquipo.has(key)) {
      incidencias.push({ hoja: 'Equipos', fila, nivel: 'error', mensaje: `Equipo repetido (también en fila ${vistosEquipo.get(key)})`, detalle: name })
      return
    }
    vistosEquipo.set(key, fila)

    const cedulaDT = normCedula(val(m, 'Cédula DT'))
    if (!cedulaDT) incidencias.push({ hoja: 'Equipos', fila, nivel: 'aviso', mensaje: 'Sin cédula del DT', detalle: name })
    else if (!cedulaEcuatorianaValida(cedulaDT)) incidencias.push({ hoja: 'Equipos', fila, nivel: 'aviso', mensaje: 'Cédula del DT no válida', detalle: name })

    const correo = normCorreo(val(m, 'Correo'))
    if (correo.aviso) incidencias.push({ hoja: 'Equipos', fila, nivel: 'aviso', mensaje: correo.aviso, detalle: `${name}: ${correo.v}` })

    const limpio: EquipoLimpio = {
      fila,
      name: limpiar(name),
      city: (() => {
        const c = val(m, 'Ciudad')
        return c.charAt(0).toUpperCase() + c.slice(1)
      })(),
      directorName: titleCase(val(m, 'DT')),
      directorCedula: cedulaDT,
      assistantName: titleCase(val(m, 'Asistente Técnico', 'Asistente')),
      contactPhone: normTel(val(m, 'Teléfono', 'Telefono')),
      contactEmail: correo.v,
      logoUrl: limpiarUrl(val(m, 'Escudo (Drive)', 'Escudo')),
      nominaUrl: limpiarUrl(val(m, 'Nómina (Drive)', 'Nomina')),
      folderUrl: limpiarUrl(val(m, 'Carpeta equipo (link)', 'Carpeta equipo')),
      estado: normKey(val(m, 'Estado')) || 'aprobado',
      codigoEquipo: val(m, 'Código', 'Codigo').toUpperCase(),
    }
    equipos.push(limpio)
    nombresEquipo.set(key, limpio.name)
  })

  const cedulasEnArchivo = new Map<string, number>()
  rawJugadores.forEach((raw, idx) => {
    const fila = idx + 2
    const m = indexar(raw)
    const nombres = titleCase(val(m, 'Nombres'))
    const apellidos = titleCase(val(m, 'Apellidos'))
    const equipoRaw = val(m, 'Equipo')
    if (!nombres && !apellidos && !equipoRaw && !val(m, 'Cédula', 'Cedula')) return

    const quien = `${nombres} ${apellidos}`.trim() || '(sin nombre)'
    const error = (mensaje: string) =>
      incidencias.push({ hoja: 'Jugadores', fila, nivel: 'error', mensaje, detalle: `${quien} · ${equipoRaw}` })
    const aviso = (mensaje: string) =>
      incidencias.push({ hoja: 'Jugadores', fila, nivel: 'aviso', mensaje, detalle: `${quien} · ${equipoRaw}` })

    if (!nombres || !apellidos) return error('Falta nombre o apellido')
    const equipo = nombresEquipo.get(normKey(equipoRaw))
    if (!equipo) return error(`El equipo "${equipoRaw}" no existe en la hoja Equipos`)

    const cedula = normCedula(val(m, 'Cédula', 'Cedula'))
    if (!cedula) return error('Falta la cédula')
    const previa = cedulasEnArchivo.get(cedula)
    if (previa) return error(`Cédula repetida (también en fila ${previa})`)
    const enOtro = ctx.cedulasExistentes.get(cedula)
    if (enOtro && normKey(enOtro) !== normKey(equipo)) return error(`Esa cédula ya está registrada en el equipo "${enOtro}"`)
    cedulasEnArchivo.set(cedula, fila)
    if (cedula.length !== 10) aviso('La cédula no tiene 10 dígitos')
    else if (!cedulaEcuatorianaValida(cedula)) aviso('Cédula no pasa la validación (revisar)')

    let birthDate = ''
    const fechaRaw = val(m, 'Fecha nacimiento', 'Fecha de nacimiento')
    if (fechaRaw) {
      const f = normFecha(fechaRaw)
      if (!f) aviso('Fecha de nacimiento no reconocida')
      else {
        birthDate = f
        const edad = new Date().getUTCFullYear() - Number(f.slice(0, 4))
        if (edad < 12 || edad > 55) aviso(`Edad inusual (${edad} años)`)
      }
    } else aviso('Sin fecha de nacimiento')

    const posRaw = val(m, 'Posición', 'Posicion')
    const position = POSICIONES[normKey(posRaw)] || ''
    if (posRaw && !position) aviso(`Posición no reconocida: "${posRaw}"`)

    const numRaw = val(m, 'Número', 'Numero')
    let number: number | null = null
    if (numRaw) {
      if (/^\d{1,3}$/.test(numRaw)) number = Number(numRaw)
      else aviso(`Número no válido: "${numRaw}"`)
    }

    const correo = normCorreo(val(m, 'Correo'))
    if (correo.aviso) aviso(`${correo.aviso}: ${correo.v}`)

    const selfieUrl = limpiarUrl(val(m, 'Foto selfie (Drive)', 'Selfie'))
    const cedulaFrontUrl = limpiarUrl(val(m, 'Cédula frente (Drive)', 'Cédula frente'))
    const cedulaBackUrl = limpiarUrl(val(m, 'Cédula reverso (Drive)', 'Cédula reverso'))
    const faltan = [!selfieUrl && 'selfie', !cedulaFrontUrl && 'cédula frente', !cedulaBackUrl && 'cédula reverso'].filter(Boolean)
    if (faltan.length) aviso(`Foto pendiente: ${faltan.join(', ')}`)

    jugadores.push({
      fila,
      equipo,
      firstName: nombres,
      lastName: apellidos,
      cedula,
      number,
      position,
      birthDate,
      email: correo.v,
      phone: normTel(val(m, 'Teléfono', 'Telefono')),
      selfieUrl,
      cedulaFrontUrl,
      cedulaBackUrl,
    })
  })

  const numeros = new Map<string, number>()
  for (const j of jugadores) {
    if (j.number === null) continue
    const k = `${normKey(j.equipo)}#${j.number}`
    if (numeros.has(k)) {
      incidencias.push({ hoja: 'Jugadores', fila: j.fila, nivel: 'aviso', mensaje: `Número ${j.number} repetido en el equipo (fila ${numeros.get(k)}); se importará sin número`, detalle: `${j.firstName} ${j.lastName} · ${j.equipo}` })
      j.number = null
    } else numeros.set(k, j.fila)
  }

  return { equipos, jugadores, incidencias }
}
