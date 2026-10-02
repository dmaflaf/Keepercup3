import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { verifyAuth } from '@/lib/auth'
import { TIPOS_FOTO } from '@/lib/drive'

export const dynamic = 'force-dynamic'

const prisma = new PrismaClient()

export async function GET(_req: Request, { params }: { params: { id: string; kind: string } }) {
  const user = await verifyAuth()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  const tipo = TIPOS_FOTO.find((t) => t === params.kind)
  if (!tipo) return NextResponse.json({ ok: false }, { status: 404 })
  if (tipo !== 'selfie' && user.rol !== 'admin') return NextResponse.json({ ok: false }, { status: 403 })

  const img = await prisma.playerImage.findUnique({ where: { playerId_kind: { playerId: params.id, kind: tipo } } })
  if (!img) return NextResponse.json({ ok: false }, { status: 404 })
  return new NextResponse(new Uint8Array(img.data), {
    headers: { 'Content-Type': img.mime, 'Cache-Control': 'private, max-age=3600' },
  })
}
