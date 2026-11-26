import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Escudo pequeño de un club para la página pública (llaves, tablas). Solo la imagen, en miniatura.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[a-z0-9]{10,40}$/i.test(params.id)) return new NextResponse(null, { status: 404 })
  const t = await prisma.team.findUnique({ where: { id: params.id }, select: { logo: true } })
  const m = t?.logo?.match(/^data:image\/[a-z+]+;base64,(.+)$/)
  if (!m) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'public, s-maxage=3600' } })
  try {
    const png = await sharp(Buffer.from(m[1], 'base64')).resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } })
  } catch { return new NextResponse(null, { status: 404 }) }
}
