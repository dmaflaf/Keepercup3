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
    const adminUser = (process.env.ADMIN_USER || '').trim().toLowerCase()
    const adminPass = process.env.ADMIN_PASSWORD || ''
    const resultado: { usuario: string; rol: string; password?: string }[] = []

    if (adminUser && adminPass) {
      const passwordHash = await bcrypt.hash(adminPass, 10)
      await prisma.user.upsert({
        where: { email: adminUser },
        update: { passwordHash, activo: true, rol: 'admin' },
        create: { email: adminUser, nombre: 'Administrador', rol: 'admin', passwordHash, activo: true },
      })
      await prisma.user.updateMany({
        where: { email: 'admin@keeper.ec' },
        data: { activo: false },
      })
      resultado.push({ usuario: adminUser, rol: 'admin' })
    }

    const passVocal = randomBytes(6).toString('hex')
    await prisma.user.upsert({
      where: { email: 'vocal@keeper.ec' },
      update: { passwordHash: await bcrypt.hash(passVocal, 10), activo: true, rol: 'vocal' },
      create: {
        email: 'vocal@keeper.ec',
        nombre: 'Vocal 1',
        rol: 'vocal',
        passwordHash: await bcrypt.hash(passVocal, 10),
        activo: true,
      },
    })
    resultado.push({ usuario: 'vocal@keeper.ec', rol: 'vocal', password: passVocal })

    return NextResponse.json({
      ok: true,
      message: 'Listo. El admin usa la contraseña definida en Vercel. La del vocal se muestra solo ahora.',
      usuarios: resultado,
    })
  } catch (error) {
    console.error('Error en reset-admin:', error)
    return NextResponse.json({ ok: false, message: 'Error al restablecer' }, { status: 500 })
  }
}
