import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { PrismaClient } from '@prisma/client'
import { prepararImportacion, escribirImportacion, resumir } from '@/lib/importar-db'
import { copiarFotos } from '@/lib/fotos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const prisma = new PrismaClient()

function claveValida(recibida: string | null) {
  const esperada = process.env.SYNC_KEY
  if (!esperada || esperada.length < 16 || !recibida) return false
  const a = Buffer.from(recibida)
  const b = Buffer.from(esperada)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  if (!claveValida(request.headers.get('x-sync-key'))) {
    return NextResponse.json({ ok: false, message: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const equipos = Array.isArray(body.equipos) ? body.equipos : []
    const jugadores = Array.isArray(body.jugadores) ? body.jugadores : []
    if (equipos.length > 300 || jugadores.length > 300) {
      return NextResponse.json({ ok: false, message: 'Lote demasiado grande' }, { status: 400 })
    }

    const { r, jugadoresDB } = await prepararImportacion(prisma, equipos, jugadores)
    const { idsTocados, ...resultado } = await escribirImportacion(prisma, r, jugadoresDB)

    let fotos: { copiadas: number; fallos: number; restantes: number } | null = null
    if (idsTocados.length) {
      try {
        const f = await copiarFotos(prisma, { soloIds: idsTocados, limiteJugadores: 10, presupuestoMs: 30000 })
        fotos = { copiadas: f.copiadas, fallos: f.fallos.length, restantes: f.restantes }
      } catch (e) {
        console.error('Fotos en sync fallaron', e)
      }
    }

    return NextResponse.json({
      ok: true,
      resumen: resumir(r),
      resultado,
      incidencias: r.incidencias.filter((i) => i.nivel === 'error'),
      rechazadas: r.filasConError,
      fotos,
    })
  } catch (error) {
    console.error('Error en sync:', error)
    return NextResponse.json({ ok: false, message: 'Error al sincronizar' }, { status: 500 })
  }
}
