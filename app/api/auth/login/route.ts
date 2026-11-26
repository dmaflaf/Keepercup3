import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const JWT_SECRET = process.env.JWT_SECRET || 'keeper-secret-key-change-in-production'

// Límite de intentos fallidos cada 15 minutos: 10 por IP y 30 por correo (evita adivinar contraseñas probando sin parar)
const MAX_FALLOS = 10, MAX_POR_CORREO = 30, VENTANA_MS = 15 * 60 * 1000, CLAVE = 'seguridad:login_fallos'
type Fallos = Record<string, number[]>
async function leerFallos(): Promise<Fallos> {
  const a = await prisma.ajuste.findUnique({ where: { key: CLAVE } })
  try { return a ? JSON.parse(a.value) : {} } catch { return {} }
}
async function guardarFallos(f: Fallos) {
  const ahora = Date.now()
  for (const k of Object.keys(f)) { f[k] = f[k].filter((t) => ahora - t < VENTANA_MS); if (!f[k].length) delete f[k] }
  await prisma.ajuste.upsert({ where: { key: CLAVE }, create: { key: CLAVE, value: JSON.stringify(f) }, update: { value: JSON.stringify(f) } })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = body.password

    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sin-ip'
    const claves = [`ip:${ip}`, `email:${email}`]
    const fallos = await leerFallos()
    const recientes = (k: string) => (fallos[k] || []).filter((t) => Date.now() - t < VENTANA_MS).length
    if (recientes(claves[0]) >= MAX_FALLOS || recientes(claves[1]) >= MAX_POR_CORREO) {
      return NextResponse.json({ ok: false, message: 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.' }, { status: 429 })
    }
    const fallo = async () => { for (const k of claves) fallos[k] = [...(fallos[k] || []), Date.now()]; await guardarFallos(fallos) }

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
      await fallo()
      return NextResponse.json(
        { ok: false, message: 'Credenciales inválidas' },
        { status: 401 }
      )
    }

    // Verificar contraseña
    const passwordValido = await bcrypt.compare(password, usuario.passwordHash)
    if (!passwordValido) {
      await fallo()
      return NextResponse.json(
        { ok: false, message: 'Credenciales inválidas' },
        { status: 401 }
      )
    }

    if (claves.some((k) => fallos[k])) { for (const k of claves) delete fallos[k]; await guardarFallos(fallos) }

    // Generar JWT
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    const response = NextResponse.json({
      ok: true,
      message: 'Login exitoso',
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
