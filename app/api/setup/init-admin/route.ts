import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { PrismaClient } from '@prisma/client'

export const dynamic = 'force-dynamic'

const prisma = new PrismaClient()

async function crearUsuariosIniciales() {
  try {
    const existente = await prisma.user.findFirst()
    if (existente) {
      return NextResponse.json(
        { ok: false, message: 'Ya existen usuarios. Este paso solo funciona la primera vez.' },
        { status: 400 }
      )
    }

    const passAdmin = randomBytes(6).toString('hex')
    const passVocal = randomBytes(6).toString('hex')

    await prisma.user.create({
      data: {
        email: 'admin@keeper.ec',
        passwordHash: await bcrypt.hash(passAdmin, 10),
        nombre: 'Administrador',
        rol: 'admin',
      },
    })
    await prisma.user.create({
      data: {
        email: 'vocal@keeper.ec',
        passwordHash: await bcrypt.hash(passVocal, 10),
        nombre: 'Vocal 1',
        rol: 'vocal',
      },
    })

    return NextResponse.json({
      ok: true,
      message: 'Usuarios creados. Guarda estas contraseñas, no se vuelven a mostrar.',
      usuarios: [
        { email: 'admin@keeper.ec', password: passAdmin, rol: 'admin' },
        { email: 'vocal@keeper.ec', password: passVocal, rol: 'vocal' },
      ],
    })
  } catch (error) {
    console.error('Error en setup:', error)
    return NextResponse.json(
      { ok: false, message: 'No se pudo conectar a la base de datos o faltan las tablas.', detalle: String(error).slice(0, 300) },
      { status: 500 }
    )
  }
}

export const GET = crearUsuariosIniciales
export const POST = crearUsuariosIniciales
