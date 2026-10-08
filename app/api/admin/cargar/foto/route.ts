import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { normCedula } from '@/lib/importar'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const TIPOS = ['selfie', 'cedula_front', 'cedula_back']

// Recibe UNA foto (ya reducida por el navegador) de un jugador y la guarda en la base de datos.
export async function POST(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  try {
    const f = await req.formData()
    const cedula = normCedula(String(f.get('cedula') || ''))
    const kind = String(f.get('kind') || '')
    const equipo = String(f.get('equipo') || '')
    const archivo = f.get('file')
    if (!TIPOS.includes(kind) || !(archivo instanceof File)) return NextResponse.json({ ok: false, message: 'Datos incompletos' }, { status: 400 })
    if (archivo.size > 4 * 1024 * 1024) return NextResponse.json({ ok: false, message: 'Foto demasiado grande' }, { status: 413 })

    const jugador = await prisma.player.findFirst({ where: { cedula, ...(equipo && { team: { name: equipo } }) }, select: { id: true } })
    if (!jugador) return NextResponse.json({ ok: false, message: 'No hay un jugador con esa cédula en este club' }, { status: 404 })

    const lado = kind === 'selfie' ? 800 : 1200
    const data = await sharp(Buffer.from(await archivo.arrayBuffer()))
      .rotate()
      .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: kind === 'selfie' ? 80 : 76 })
      .toBuffer()
    await prisma.playerImage.upsert({
      where: { playerId_kind: { playerId: jugador.id, kind } },
      create: { playerId: jugador.id, kind, sourceId: 'manual', mime: 'image/jpeg', data, bytes: data.length },
      update: { sourceId: 'manual', mime: 'image/jpeg', data, bytes: data.length },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Foto manual fallida', e)
    return NextResponse.json({ ok: false, message: 'No se pudo procesar la imagen' }, { status: 422 })
  }
}
