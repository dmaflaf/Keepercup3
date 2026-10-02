import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const JWT_SECRET = process.env.JWT_SECRET || 'keeper-secret-key-change-in-production'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = body.password

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, message: 'Email y contraseña requeridos' },
        { status: 400 }
      )
    }

    // Buscar usuario
    const usuario = await prisma.user.findUnique({
      where: { email }
    })

    if (!usuario || !usuario.activo) {
      return NextResponse.json(
        { ok: false, message: 'Credenciales inválidas' },
        { status: 401 }
      )
    }

    // Verificar contraseña
    const passwordValido = await bcrypt.compare(password, usuario.passwordHash)
    if (!passwordValido) {
      return NextResponse.json(
        { ok: false, message: 'Credenciales inválidas' },
        { status: 401 }
      )
    }

    // Generar JWT
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    const response = NextResponse.json({
      ok: true,
      message: 'Login exitoso',
      token,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        rol: usuario.rol
      }
    })

    // Guardar token en cookie httpOnly
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 // 7 días
    })

    return response
  } catch (error) {
    console.error('Error en login:', error)
    return NextResponse.json(
      { ok: false, message: 'Error al procesar login' },
      { status: 500 }
    )
  }
}
