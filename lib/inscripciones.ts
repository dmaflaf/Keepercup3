// Cierre de inscripciones: con las inscripciones cerradas, lo que llegue de los formularios (Hoja de Google → sincronización)
// NO entra al sistema: jugadores nuevos y cambios de número o de club quedan RETENIDOS hasta que el administrador los apruebe.
// El administrador puede autorizar a un club por unas horas (con un código para abrir los formularios).
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'

export interface Autorizacion { id: string; teamId: string; equipo: string; codigo: string; hasta: string; nota?: string; creada: string }
export interface EstadoInscripciones { abiertas: boolean; cierre: string | null; autorizaciones: Autorizacion[] }
export interface Retenido {
  cedula: string; tipo: 'nuevo' | 'cambio'; equipo: string; teamId: string; nombre: string; recibido: string
  numero: number | null; numeroPrevio?: number | null; equipoPrevio?: string | null
  datos: Record<string, unknown> // lo que se crearía o cambiaría
}

const CLAVE = 'inscripciones', CLAVE_RET = 'inscripciones:retenidos'

export async function leerEstado(): Promise<EstadoInscripciones> {
  const a = await prisma.ajuste.findUnique({ where: { key: CLAVE } })
  // Sin configuración: CERRADAS (el plazo de inscripción ya terminó)
  try { const e = a ? JSON.parse(a.value) : {}; return { abiertas: !!e.abiertas, cierre: e.cierre ?? null, autorizaciones: Array.isArray(e.autorizaciones) ? e.autorizaciones : [] } } catch { return { abiertas: false, cierre: null, autorizaciones: [] } }
}
export async function guardarEstado(e: EstadoInscripciones) {
  await prisma.ajuste.upsert({ where: { key: CLAVE }, create: { key: CLAVE, value: JSON.stringify(e) }, update: { value: JSON.stringify(e) } })
}
export const vigentes = (e: EstadoInscripciones, ahora = Date.now()) => e.autorizaciones.filter((a) => new Date(a.hasta).getTime() > ahora)
/** ¿Se acepta lo que llega de ese club? Abiertas para todos, o el club tiene una autorización vigente. */
export function permitido(e: EstadoInscripciones, equipo: string, ahora = Date.now()) {
  return e.abiertas || vigentes(e, ahora).some((a) => a.equipo === equipo)
}
export const nuevoCodigo = () => randomBytes(4).toString('hex').toUpperCase()

export async function leerRetenidos(): Promise<Retenido[]> {
  const a = await prisma.ajuste.findUnique({ where: { key: CLAVE_RET } })
  try { return a ? JSON.parse(a.value) : [] } catch { return [] }
}
export async function guardarRetenidos(l: Retenido[]) {
  await prisma.ajuste.upsert({ where: { key: CLAVE_RET }, create: { key: CLAVE_RET, value: JSON.stringify(l) }, update: { value: JSON.stringify(l) } })
}
/** Agrega o reemplaza (por cédula y tipo) lo retenido en esta sincronización. */
export async function retener(nuevos: Retenido[], aceptados: string[] = []) {
  if (!nuevos.length && !aceptados.length) return
  const l = (await leerRetenidos()).filter((x) => !aceptados.includes(x.cedula))
  for (const r of nuevos) {
    const i = l.findIndex((x) => x.cedula === r.cedula && x.tipo === r.tipo)
    if (i >= 0) l[i] = r; else l.push(r)
  }
  await guardarRetenidos(l.slice(-1000))
}
