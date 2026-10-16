import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

// Gira la selfie de un jugador (90° horario por defecto) para corregir fotos que llegaron acostadas.
// Se conserva la foto original la primera vez y se reinicia el encuadre (hay que volver a encuadrar).
export async function POST(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const b = await req.json().catch(() => null)
  const playerId = String(b?.playerId || '')
  const grados = [90, 180, 270].includes(Number(b?.grados)) ? Number(b.grados) : 90
  const img = await prisma.playerImage.findUnique({ where: { playerId_kind: { playerId, kind: 'selfie' } }, select: { data: true, mime: true, original: true } })
  if (!img) return NextResponse.json({ ok: false, message: 'Ese jugador no tiene selfie' }, { status: 404 })
  const data = await sharp(Buffer.from(img.data)).rotate(grados).jpeg({ quality: 85 }).toBuffer()
  await prisma.playerImage.update({
    where: { playerId_kind: { playerId, kind: 'selfie' } },
    data: { data, mime: 'image/jpeg', bytes: data.length, crop: Prisma.DbNull, cropEstado: null, cropMotivo: null, ...(img.original ? {} : { original: img.data, originalMime: img.mime }) },
  })
  return NextResponse.json({ ok: true })
}
