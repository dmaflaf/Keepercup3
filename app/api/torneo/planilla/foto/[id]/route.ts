import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { verifyAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { recorteAPixeles } from '@/lib/encuadre'

export const dynamic = 'force-dynamic'

// Miniatura (cara encuadrada, ~80×96) de un jugador para la planilla en vivo. Admin y vocal.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const u = await verifyAuth()
  if (!u) return new NextResponse(null, { status: 401 })
  const im = await prisma.playerImage.findUnique({ where: { playerId_kind: { playerId: params.id, kind: 'selfie' } }, select: { data: true, crop: true } })
  if (!im) return new NextResponse(null, { status: 404 })
  try {
    let base = sharp(Buffer.from(im.data)).rotate()
    const c = im.crop as { x: number; y: number; w: number; h: number } | null
    if (c) { const n = await base.toBuffer({ resolveWithObject: true }); base = sharp(n.data).extract(recorteAPixeles(c, n.info.width, n.info.height)) }
    const out = await base.resize(80, 96, { fit: 'cover', position: 'attention' }).jpeg({ quality: 70 }).toBuffer()
    return new NextResponse(new Uint8Array(out), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' } })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
