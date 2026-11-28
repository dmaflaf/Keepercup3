import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })
const CLAVE_LOG = 'sorteo:reinicios'

// Historial de reinicios (solo administrador). Con ?copia=<clave> descarga en CSV los boletos que había antes de ese reinicio.
export async function GET(req: NextRequest) {
  const u = await verifyAuth()
  if (!u || u.rol !== 'admin') return falla('Solo el administrador', 403)
  const copia = req.nextUrl.searchParams.get('copia')
  if (copia) {
    if (!/^sorteo:copia:\d+$/.test(copia)) return falla('Copia inválida')
    const a = await prisma.ajuste.findUnique({ where: { key: copia } })
    if (!a) return falla('No se encontró esa copia', 404)
    const d = JSON.parse(a.value) as { boletos: Record<string, unknown>[] }
    const cols = ['color', 'numero', 'nombres', 'correo', 'telefono', 'club', 'codigo', 'semana', 'createdAt']
    const csv = [cols.join(';'), ...d.boletos.map((b) => cols.map((c) => `"${String(b[c] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n')
    return new NextResponse('﻿' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="boletos-antes-del-reinicio-${copia.split(':')[2]}.csv"` } })
  }
  const a = await prisma.ajuste.findUnique({ where: { key: CLAVE_LOG } })
  return NextResponse.json({ ok: true, reinicios: a ? JSON.parse(a.value) : [] })
}

// Deja el sorteo como nuevo: borra boletos, bloqueos y ganadores de tómbola, y devuelve los números ganadores cargados a
// "pendiente". Conserva premios, números cargados y configuración.
// Protección: pide la CONTRASEÑA del administrador, guarda antes una COPIA de todo lo que borra y anota quién y cuándo.
export async function POST(req: NextRequest) {
  const u = await verifyAuth()
  if (!u || u.rol !== 'admin') return falla('Solo el administrador', 403)
  const b = await req.json().catch(() => ({}))
  if (b.confirmar !== 'BORRAR') return falla('Escribe BORRAR para confirmar')
  const admin = await prisma.user.findUnique({ where: { id: u.id }, select: { passwordHash: true, nombre: true, email: true } })
  if (!admin || !(await bcrypt.compare(String(b.password || ''), admin.passwordHash))) return falla('La contraseña no es correcta.', 401)

  // Copia de seguridad de lo que se va a borrar o cambiar
  const [boletos, numeros, bloqueos] = await Promise.all([
    prisma.sorteoBoleto.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.sorteoNumero.findMany({ where: { OR: [{ origen: 'tombola' }, { NOT: { estado: 'pendiente' } }] } }),
    prisma.sorteoBloqueo.findMany(),
  ])
  const ahora = new Date()
  const claveCopia = `sorteo:copia:${ahora.getTime()}`
  await prisma.ajuste.create({ data: { key: claveCopia, value: JSON.stringify({ fecha: ahora.toISOString(), boletos, numeros, bloqueos }) } })

  const r = await prisma.$transaction(async (tx) => {
    const tomb = await tx.sorteoNumero.deleteMany({ where: { origen: 'tombola' } })
    const inst = await tx.sorteoNumero.updateMany({
      where: { origen: 'instantaneo', NOT: { estado: 'pendiente' } },
      data: { estado: 'pendiente', boletoId: null, codigoCobro: null, ganadoAt: null, entregadoAt: null },
    })
    const bol = await tx.sorteoBoleto.deleteMany({})
    const blo = await tx.sorteoBloqueo.deleteMany({})
    return { boletos: bol.count, bloqueos: blo.count, tombola: tomb.count, premiosReiniciados: inst.count }
  })

  // Historial: quién, cuándo y cuánto se borró
  const a = await prisma.ajuste.findUnique({ where: { key: CLAVE_LOG } })
  const log = a ? (JSON.parse(a.value) as unknown[]) : []
  log.unshift({ fecha: ahora.toISOString(), quien: admin.nombre || admin.email, ...r, copia: claveCopia })
  const v = JSON.stringify(log.slice(0, 50))
  await prisma.ajuste.upsert({ where: { key: CLAVE_LOG }, create: { key: CLAVE_LOG, value: v }, update: { value: v } })
  return NextResponse.json({ ok: true, ...r, copia: claveCopia })
}
