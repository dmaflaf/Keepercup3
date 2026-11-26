import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { recorteAPixeles } from '@/lib/encuadre'

export const dynamic = 'force-dynamic'

// Miniatura pública (cara encuadrada, 96×96) SOLO de jugadores que marcaron gol en un torneo público, para la tabla de
// goleadores. Se genera una vez y la guarda la red de Vercel (caché de 7 días), así que casi no consume recursos.
export async function GET(_req: Request, { params }: { params: { playerId: string } }) {
  if (!/^[a-z0-9]{10,40}$/i.test(params.playerId)) return new NextResponse(null, { status: 404 })
  const goles = await prisma.evento.findMany({ where: { playerId: params.playerId, tipo: { in: ['gol', 'gol_penal'] } }, select: { partidoId: true }, take: 20 })
  if (!goles.length) return new NextResponse(null, { status: 404 })
  const publico = await prisma.partido.findFirst({ where: { id: { in: goles.map((g) => g.partidoId) }, torneoId: { in: (await prisma.torneo.findMany({ where: { publico: true }, select: { id: true } })).map((t) => t.id) } }, select: { id: true } })
  if (!publico) return new NextResponse(null, { status: 404 })
  const im = await prisma.playerImage.findUnique({ where: { playerId_kind: { playerId: params.playerId, kind: 'selfie' } }, select: { data: true, crop: true } })
  if (!im) return new NextResponse(null, { status: 404 })
  try {
    let base = sharp(Buffer.from(im.data)).rotate()
    const c = im.crop as { x: number; y: number; w: number; h: number } | null
    if (c) { const n = await base.toBuffer({ resolveWithObject: true }); base = sharp(n.data).extract(recorteAPixeles(c, n.info.width, n.info.height)) }
    const out = await base.resize(96, 96, { fit: 'cover', position: 'attention' }).jpeg({ quality: 72 }).toBuffer()
    return new NextResponse(new Uint8Array(out), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400' } })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
