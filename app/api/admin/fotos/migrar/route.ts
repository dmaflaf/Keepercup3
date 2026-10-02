import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { verifyAuth } from '@/lib/auth'
import { copiarFotos } from '@/lib/fotos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  const user = await verifyAuth()
  if (!user || user.rol !== 'admin') {
    return NextResponse.json({ ok: false, message: 'No autorizado' }, { status: 401 })
  }
  try {
    const body = await request.json().catch(() => ({}))
    const r = await copiarFotos(prisma, { omitir: Array.isArray(body.omitir) ? body.omitir : [] })
    return NextResponse.json({ ok: true, ...r })
  } catch (error) {
    console.error('Error migrando fotos:', error)
    return NextResponse.json({ ok: false, message: 'Error al copiar fotos. ¿Las tablas están actualizadas?' }, { status: 500 })
  }
}
