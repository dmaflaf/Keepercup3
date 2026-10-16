import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

// Imagen de la cédula para el panel de encuadre. ?v=original devuelve la foto tal como la subió el jugador.
export async function GET(req: NextRequest, { params }: { params: { id: string; kind: string } }) {
  const no = await exigirAdmin()
  if (no) return no
  if (params.kind !== 'cedula_front' && params.kind !== 'cedula_back') return new NextResponse(null, { status: 404 })
  const img = await prisma.playerImage.findUnique({ where: { playerId_kind: { playerId: params.id, kind: params.kind } }, select: { data: true, mime: true, original: true, originalMime: true } })
  if (!img) return new NextResponse(null, { status: 404 })
  const orig = req.nextUrl.searchParams.get('v') === 'original' && img.original
  return new NextResponse(new Uint8Array(orig ? img.original! : img.data), { headers: { 'Content-Type': orig ? img.originalMime || 'image/jpeg' : img.mime, 'Cache-Control': 'no-store, private' } })
}
