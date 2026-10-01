import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    const { email, password, nombre } = await request.json()

    if (!email || !password || !nombre) {
      return NextResponse.json(
        { ok: false, message: 'Email, contraseña y nombre requeridos' },
        { status: 400 }
      )
    }

    // Verificar si ya existe usuario
    const usuarioExistente = await prisma.user.findUnique({
      where: { email }
    })

    if (usuarioExistente) {
      return NextResponse.json(
        { ok: false, message: 'Usuario ya existe' },
        { status: 400 }
      )
    }

    // Hash de contraseña
    const passwordHash = await bcrypt.hash(password, 10)

    // Crear usuario
    const usuario = await prisma.user.create({
      data: {
        email,
        passwordHash,
        nombre,
        rol: 'admin',
        activo: true
      }
    })

    return NextResponse.json({
      ok: true,
      message: 'Admin creado exitosamente',
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        rol: usuario.rol
      }
    })
  } catch (error) {
    console.error('Error creando admin:', error)
    return NextResponse.json(
      { ok: false, message: 'Error al crear admin' },
      { status: 500 }
    )
  }
}
