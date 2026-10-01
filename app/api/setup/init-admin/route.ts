import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * POST /api/setup/init-admin
 * SOLO PARA DESARROLLO - Crea un usuario admin de prueba
 * En producción, usar /api/auth/create-admin con datos reales
 */
export async function POST(request: NextRequest) {
  try {
    // Verificar si ya existe algún usuario
    const usuarioExistente = await prisma.user.findFirst()

    if (usuarioExistente) {
      return NextResponse.json({
        ok: false,
        message: 'Ya existen usuarios en la BD. Usa /api/auth/create-admin para crear nuevos.',
        usuario: {
          email: usuarioExistente.email,
          nombre: usuarioExistente.nombre,
          rol: usuarioExistente.rol
        }
      }, { status: 400 })
    }

    // Crear admin de prueba
    const passwordHash = await bcrypt.hash('admin123', 10)

    const usuario = await prisma.user.create({
      data: {
        email: 'admin@keeper.ec',
        passwordHash,
        nombre: 'Administrador',
        rol: 'admin',
        activo: true
      }
    })

    // Crear vocal de prueba
    const vocalHash = await bcrypt.hash('vocal123', 10)
    const vocal = await prisma.user.create({
      data: {
        email: 'vocal@keeper.ec',
        passwordHash: vocalHash,
        nombre: 'Vocal 1',
        rol: 'vocal',
        activo: true
      }
    })

    return NextResponse.json({
      ok: true,
      message: 'Setup completado ✅',
      usuarios: [
        {
          email: usuario.email,
          nombre: usuario.nombre,
          rol: usuario.rol,
          password: 'admin123'
        },
        {
          email: vocal.email,
          nombre: vocal.nombre,
          rol: vocal.rol,
          password: 'vocal123'
        }
      ],
      nota: 'Estas son credenciales de PRUEBA. Cambiar en producción.'
    })
  } catch (error) {
    console.error('Error en setup:', error)
    return NextResponse.json(
      { ok: false, message: 'Error al configurar' },
      { status: 500 }
    )
  }
}
