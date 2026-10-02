import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { verifyAuth } from '@/lib/auth'
import { driveId, obtenerImagenReducida, TipoFoto } from '@/lib/drive'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const prisma = new PrismaClient()
const LOTE = 8
const PARALELO = 4

const CAMPOS: { tipo: TipoFoto; campo: 'selfieUrl' | 'cedulaFrontUrl' | 'cedulaBackUrl' }[] = [
  { tipo: 'selfie', campo: 'selfieUrl' },
  { tipo: 'cedula_front', campo: 'cedulaFrontUrl' },
  { tipo: 'cedula_back', campo: 'cedulaBackUrl' },
]

export async function POST(request: NextRequest) {
  const user = await verifyAuth()
  if (!user || user.rol !== 'admin') {
    return NextResponse.json({ ok: false, message: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const omitir = new Set<string>(Array.isArray(body.omitir) ? body.omitir : [])

    const jugadores = await prisma.player.findMany({
      where: { OR: [{ selfieUrl: { not: null } }, { cedulaFrontUrl: { not: null } }, { cedulaBackUrl: { not: null } }] },
      select: {
        id: true, firstName: true, lastName: true,
        selfieUrl: true, cedulaFrontUrl: true, cedulaBackUrl: true,
        images: { select: { kind: true, sourceId: true } },
      },
    })

    const pendientes = jugadores
      .map((j) => ({
        j,
        faltan: CAMPOS.filter((c) => {
          const id = driveId(j[c.campo])
          return id && !j.images.some((i) => i.kind === c.tipo && i.sourceId === id)
        }),
      }))
      .filter((p) => p.faltan.length > 0 && !omitir.has(p.j.id))

    const lote = pendientes.slice(0, LOTE)
    const tareas = lote.flatMap((p) => p.faltan.map((f) => ({ j: p.j, ...f })))

    const fallos: { id: string; nombre: string; tipo: string; motivo: string }[] = []
    let copiadas = 0
    let cola = 0
    const trabajador = async () => {
      while (cola < tareas.length) {
        const t = tareas[cola++]
        const nombre = `${t.j.firstName} ${t.j.lastName}`
        try {
          const id = driveId(t.j[t.campo])
          if (!id) throw new Error('Enlace de Drive no reconocido')
          const img = await obtenerImagenReducida(id, t.tipo)
          await prisma.playerImage.upsert({
            where: { playerId_kind: { playerId: t.j.id, kind: t.tipo } },
            create: { playerId: t.j.id, kind: t.tipo, sourceId: id, mime: img.mime, data: img.data, bytes: img.data.length },
            update: { sourceId: id, mime: img.mime, data: img.data, bytes: img.data.length },
          })
          copiadas++
        } catch (e) {
          fallos.push({ id: t.j.id, nombre, tipo: t.tipo, motivo: e instanceof Error ? e.message : 'error' })
        }
      }
    }
    await Promise.all(Array.from({ length: PARALELO }, trabajador))

    return NextResponse.json({
      ok: true,
      copiadas,
      fallos,
      restantes: Math.max(0, pendientes.length - lote.length),
      totalJugadores: jugadores.length,
    })
  } catch (error) {
    console.error('Error migrando fotos:', error)
    return NextResponse.json({ ok: false, message: 'Error al copiar fotos. ¿Las tablas están actualizadas?' }, { status: 500 })
  }
}
