import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Fotos de la cédula: SOLO administrador. Cada apertura queda registrada (AccesoDocumento).
export async function GET(_req: Request, { params }: { params: { id: string; kind: string } }) {
  const u = await verifyAuth()
  if (!u || u.rol !== 'admin') return new NextResponse(null, { status: 403 })
  if (params.kind !== 'cedula_front' && params.kind !== 'cedula_back') return new NextResponse(null, { status: 404 })
  const img = await prisma.playerImage.findUnique({ where: { playerId_kind: { playerId: params.id, kind: params.kind } }, select: { data: true, mime: true } })
  if (!img) return new NextResponse(null, { status: 404 })
  await prisma.accesoDocumento.create({ data: { adminEmail: u.email, playerId: params.id, kind: params.kind } })
  return new NextResponse(new Uint8Array(img.data), { headers: { 'Content-Type': img.mime, 'Cache-Control': 'no-store, private' } })
}
