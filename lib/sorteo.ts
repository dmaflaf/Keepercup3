import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/db'

export const COLORES = ['negro', 'rojo'] as const
export type Color = (typeof COLORES)[number]

export interface SorteoCfg {
  coloresActivos: Color[]
  rangoMax: number
  maxPorSemana: number
  desde: number // (anterior: un solo rango para todos los colores; se usa si un color no tiene el suyo)
  hasta: number
  /** Rango que participa ahora, POR COLOR (ej. negro 5201–6000 y rojo 1–800 el mismo fin de semana). */
  rangos: Record<Color, { desde: number; hasta: number }>
  instagram: string
  tiktok: string
}

const DEFAULTS = { coloresActivos: ['negro'] as Color[], rangoMax: 6000, maxPorSemana: 4 }

export async function leerConfig(): Promise<SorteoCfg> {
  const filas = await prisma.sorteoConfig.findMany()
  const m: Record<string, string> = {}
  filas.forEach((f) => (m[f.key] = f.value))
  const colores = (m.coloresActivos || '').split(',').filter((c): c is Color => (COLORES as readonly string[]).includes(c))
  const rangoMax = Number(m.rangoMax) > 0 ? Number(m.rangoMax) : DEFAULTS.rangoMax
  const desde = Number(m.desde) >= 1 ? Number(m.desde) : 1
  const hasta = Number(m.hasta) >= desde ? Math.min(Number(m.hasta), rangoMax) : rangoMax
  // Rango de cada color; si un color no tiene el suyo, usa el rango general anterior
  const rangos = Object.fromEntries(COLORES.map((c) => {
    const d = Number(m[`desde:${c}`]), h = Number(m[`hasta:${c}`])
    return [c, d >= 1 && h >= d ? { desde: d, hasta: Math.min(h, rangoMax) } : { desde, hasta }]
  })) as Record<Color, { desde: number; hasta: number }>
  return {
    coloresActivos: colores.length ? colores : DEFAULTS.coloresActivos,
    desde,
    hasta,
    rangos,
    rangoMax,
    maxPorSemana: Number(m.maxPorSemana) > 0 ? Number(m.maxPorSemana) : DEFAULTS.maxPorSemana,
    instagram: m.instagram || '',
    tiktok: m.tiktok || '',
  }
}

export async function guardarConfig(cfg: Partial<Omit<SorteoCfg, 'rangos'>> & { rangos?: Partial<SorteoCfg['rangos']> }) {
  const pares: [string, string][] = []
  if (cfg.coloresActivos) pares.push(['coloresActivos', cfg.coloresActivos.join(',')])
  if (cfg.rangoMax) pares.push(['rangoMax', String(cfg.rangoMax)])
  if (cfg.rangos) for (const [c, r] of Object.entries(cfg.rangos)) { pares.push([`desde:${c}`, String(r.desde)], [`hasta:${c}`, String(r.hasta)]) }
  if (cfg.desde) pares.push(['desde', String(cfg.desde)])
  if (cfg.hasta) pares.push(['hasta', String(cfg.hasta)])
  if (cfg.maxPorSemana) pares.push(['maxPorSemana', String(cfg.maxPorSemana)])
  if (cfg.instagram !== undefined) pares.push(['instagram', cfg.instagram])
  if (cfg.tiktok !== undefined) pares.push(['tiktok', cfg.tiktok])
  for (const [key, value] of pares) {
    await prisma.sorteoConfig.upsert({ where: { key }, update: { value }, create: { key, value } })
  }
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin 0/O/1/I

export function generarCodigo(largo: number, prefijo = ''): string {
  const b = randomBytes(largo)
  let s = ''
  for (let i = 0; i < largo; i++) s += ALFABETO[b[i] % ALFABETO.length]
  return prefijo + s
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip + (process.env.JWT_SECRET || 'kc3')).digest('hex').slice(0, 24)
}

export const p4 = (n: number) => String(n).padStart(4, '0')

export function esColor(c: unknown): c is Color {
  return typeof c === 'string' && (COLORES as readonly string[]).includes(c)
}

export function enmascarar(correo: string): string {
  const [u, d] = correo.split('@')
  return (u.slice(0, 2) + '***') + '@' + (d || '')
}

import { NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'

/** Devuelve null si es admin; si no, la respuesta de error a retornar. */
export async function exigirAdmin(): Promise<NextResponse | null> {
  const u = await verifyAuth()
  if (!u) return NextResponse.json({ ok: false, message: 'No autorizado' }, { status: 401 })
  if (u.rol !== 'admin') return NextResponse.json({ ok: false, message: 'Solo el administrador' }, { status: 403 })
  return null
}

/** Lunes (YYYY-MM-DD) de la semana actual en hora de Ecuador (UTC-5, sin horario de verano). */
export function semanaActual(ahora = new Date()): string {
  const d = new Date(ahora.getTime() - 5 * 3600 * 1000)
  const dow = (d.getUTCDay() + 6) % 7 // lunes = 0
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}
