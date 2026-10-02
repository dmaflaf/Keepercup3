import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { verifyAuth } from '@/lib/auth'
import { prepararImportacion, escribirImportacion, resumir } from '@/lib/importar-db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  const user = await verifyAuth()
  if (!user || user.rol !== 'admin') {
    return NextResponse.json({ ok: false, message: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const equipos = Array.isArray(body.equipos) ? body.equipos : []
    const jugadores = Array.isArray(body.jugadores) ? body.jugadores : []
    const confirmar = body.confirmar === true
    if (equipos.length > 500 || jugadores.length > 5000) {
      return NextResponse.json({ ok: false, message: 'Archivo demasiado grande' }, { status: 400 })
    }

    const { r, jugadoresDB } = await prepararImportacion(prisma, equipos, jugadores)
    const resumen = resumir(r)

    if (!confirmar) {
      return NextResponse.json({ ok: true, resumen, incidencias: r.incidencias })
    }

    const { idsTocados, ...resultado } = await escribirImportacion(prisma, r, jugadoresDB)
    void idsTocados
    return NextResponse.json({ ok: true, resumen, resultado })
  } catch (error) {
    console.error('Error en importación:', error)
    return NextResponse.json(
      { ok: false, message: 'Error al importar. Verifica que la base de datos tenga las tablas actualizadas.' },
      { status: 500 }
    )
  }
}
