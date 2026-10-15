import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(params.token)) return new NextResponse(null, { status: 404 })
  const j = await prisma.player.findUnique({ where: { qrToken: params.token }, select: { images: { where: { kind: 'selfie' }, select: { data: true, mime: true } } } })
  const img = j?.images[0]
  if (!img) return new NextResponse(null, { status: 404 })
  return new NextResponse(new Uint8Array(img.data), { headers: { 'Content-Type': img.mime, 'Cache-Control': 'private, max-age=300' } })
}
