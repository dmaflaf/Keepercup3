import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { recorteAPixeles } from '@/lib/encuadre'
import { sesionPortal } from '@/lib/portal'
import { esElegibleCacheado } from '@/lib/fichaje'

export const dynamic = 'force-dynamic'

// Miniatura de un jugador del club, solo para su DT con sesión en el portal
export async function GET(_req: Request, { params }: { params: { token: string; playerId: string } }) {
  const { club, ok } = await sesionPortal(params.token)
  if (!club || !ok) return new NextResponse(null, { status: 401 })
  // Sus jugadores, o los elegibles para el Fichaje de Oro mientras está abierto
  const propio = await prisma.player.count({ where: { id: params.playerId, teamId: club.id } })
  const suFichaje = await prisma.fichajeOro.count({ where: { teamId: club.id, playerId: params.playerId } })
  if (!propio && !suFichaje && !(await esElegibleCacheado(params.playerId))) return new NextResponse(null, { status: 404 })
  const j = await prisma.player.findFirst({ where: { id: params.playerId }, select: { images: { where: { kind: 'selfie' }, select: { data: true, crop: true } } } })
  const im = j?.images[0]
  if (!im) return new NextResponse(null, { status: 404 })
  try {
    let base = sharp(Buffer.from(im.data)).rotate()
    const c = im.crop as { x: number; y: number; w: number; h: number } | null
    if (c) { const n = await base.toBuffer({ resolveWithObject: true }); base = sharp(n.data).extract(recorteAPixeles(c, n.info.width, n.info.height)) }
    const out = await base.resize(96, 96, { fit: 'cover', position: 'attention' }).jpeg({ quality: 72 }).toBuffer()
    return new NextResponse(new Uint8Array(out), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' } })
  } catch { return new NextResponse(null, { status: 404 }) }
}
