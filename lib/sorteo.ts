import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/db'

export const COLORES = ['negro', 'rojo'] as const
export type Color = (typeof COLORES)[number]

export interface SorteoCfg {
  coloresActivos: Color[]
  rangoMax: number
  instagram: string
  tiktok: string
}

const DEFAULTS: SorteoCfg = { coloresActivos: ['negro'], rangoMax: 6000, instagram: '', tiktok: '' }

export async function leerConfig(): Promise<SorteoCfg> {
  const filas = await prisma.sorteoConfig.findMany()
  const m: Record<string, string> = {}
  filas.forEach((f) => (m[f.key] = f.value))
  const colores = (m.coloresActivos || '').split(',').filter((c): c is Color => (COLORES as readonly string[]).includes(c))
  return {
    coloresActivos: colores.length ? colores : DEFAULTS.coloresActivos,
    rangoMax: Number(m.rangoMax) > 0 ? Number(m.rangoMax) : DEFAULTS.rangoMax,
    instagram: m.instagram || '',
    tiktok: m.tiktok || '',
  }
}

export async function guardarConfig(cfg: Partial<SorteoCfg>) {
  const pares: [string, string][] = []
  if (cfg.coloresActivos) pares.push(['coloresActivos', cfg.coloresActivos.join(',')])
  if (cfg.rangoMax) pares.push(['rangoMax', String(cfg.rangoMax)])
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
