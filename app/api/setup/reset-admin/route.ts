import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { timingSafeEqual } from 'crypto'
import { PrismaClient } from '@prisma/client'

export const dynamic = 'force-dynamic'

const prisma = new PrismaClient()

function claveValida(recibida: string | null) {
  const esperada = process.env.SETUP_KEY
  if (!esperada || !recibida) return false
  const a = Buffer.from(recibida)
  const b = Buffer.from(esperada)
  return a.length === b.length && timingSafeEqual(a, b)
}

interface CuentaConfig {
  usuario: string
  password: string
  rol: 'admin' | 'vocal'
  nombre?: string
}

function leerCuentas(): CuentaConfig[] | null {
  try {
    const lista = JSON.parse(process.env.USUARIOS_JSON || '')
    if (!Array.isArray(lista) || lista.length === 0) return null
    for (const c of lista) {
      if (typeof c.usuario !== 'string' || typeof c.password !== 'string') return null
      if (c.password.length < 8) return null
      if (c.rol !== 'admin' && c.rol !== 'vocal') return null
    }
    return lista
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  if (!claveValida(request.nextUrl.searchParams.get('key'))) {
    return NextResponse.json({ ok: false, message: 'No encontrado' }, { status: 404 })
  }

  const cuentas = leerCuentas()
  if (!cuentas) {
    return NextResponse.json(
      { ok: false, message: 'Falta o es inválida la variable USUARIOS_JSON en Vercel.' },
      { status: 400 }
    )
  }

  try {
    const emails: string[] = []
    for (const c of cuentas) {
      const email = c.usuario.trim().toLowerCase()
      emails.push(email)
      const passwordHash = await bcrypt.hash(c.password, 10)
      await prisma.user.upsert({
        where: { email },
        update: { passwordHash, activo: true, rol: c.rol, nombre: c.nombre || email },
        create: { email, passwordHash, activo: true, rol: c.rol, nombre: c.nombre || email },
      })
    }
    const desactivados = await prisma.user.updateMany({
      where: { email: { notIn: emails } },
      data: { activo: false },
    })

    return NextResponse.json({
      ok: true,
      message: 'Cuentas aplicadas.',
      activas: cuentas.map((c) => ({ usuario: c.usuario.trim().toLowerCase(), rol: c.rol })),
      cuentasAnterioresDesactivadas: desactivados.count,
    })
  } catch (error) {
    console.error('Error en reset-admin:', error)
    return NextResponse.json({ ok: false, message: 'Error al aplicar las cuentas' }, { status: 500 })
  }
}
