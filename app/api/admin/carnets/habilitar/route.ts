import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

// Cambia el estado de varios jugadores (habilitado | pendiente). Al habilitar, también se asegura que tengan código QR.
export async function POST(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const b = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(b.ids) ? b.ids.map(String) : []
  if (!ids.length || ids.length > 500) return NextResponse.json({ ok: false, message: 'Selecciona jugadores' }, { status: 400 })
  const estado = b.estado === 'pendiente' ? 'pendiente' : 'habilitado'
  await prisma.player.updateMany({ where: { id: { in: ids } }, data: { estado } })
  const sinQr = await prisma.player.findMany({ where: { id: { in: ids }, qrToken: null }, select: { id: true } })
  for (const p of sinQr) await prisma.player.update({ where: { id: p.id }, data: { qrToken: randomBytes(16).toString('base64url') } })
  return NextResponse.json({ ok: true, actualizados: ids.length, qrCreados: sinQr.length })
}
