import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomBytes, timingSafeEqual } from 'crypto'
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

export async function GET(request: NextRequest) {
  if (!claveValida(request.nextUrl.searchParams.get('key'))) {
    return NextResponse.json({ ok: false, message: 'No encontrado' }, { status: 404 })
  }

  try {
    const cuentas = [
      { email: 'admin@keeper.ec', nombre: 'Administrador', rol: 'admin' },
      { email: 'vocal@keeper.ec', nombre: 'Vocal 1', rol: 'vocal' },
    ]
    const usuarios = []
    for (const c of cuentas) {
      const password = randomBytes(6).toString('hex')
      const passwordHash = await bcrypt.hash(password, 10)
      await prisma.user.upsert({
        where: { email: c.email },
        update: { passwordHash, activo: true, rol: c.rol },
        create: { ...c, passwordHash, activo: true },
      })
      usuarios.push({ email: c.email, password, rol: c.rol })
    }
    return NextResponse.json({
      ok: true,
      message: 'Contraseñas nuevas. Guárdalas ahora; no se vuelven a mostrar.',
      usuarios,
    })
  } catch (error) {
    console.error('Error en reset-admin:', error)
    return NextResponse.json({ ok: false, message: 'Error al restablecer' }, { status: 500 })
  }
}
