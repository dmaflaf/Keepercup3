import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const b = await req.json().catch(() => ({}))
  const nombre = String(b.nombre || '').trim()
  if (!nombre) return NextResponse.json({ ok: false, message: 'Falta el nombre del premio' }, { status: 400 })
  if (!['semanal', 'mensual', 'final'].includes(b.categoria)) return NextResponse.json({ ok: false, message: 'Categoría inválida' }, { status: 400 })
  const p = await prisma.sorteoPremio.create({
    data: { nombre, categoria: b.categoria, periodo: String(b.periodo || '').trim(), lugar: String(b.lugar || '').trim() || 'el bar del complejo' },
  })
  return NextResponse.json({ ok: true, id: p.id })
}

export async function DELETE(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const id = req.nextUrl.searchParams.get('id') || ''
  const usado = await prisma.sorteoNumero.count({ where: { premioId: id, estado: { not: 'pendiente' } } })
  if (usado) return NextResponse.json({ ok: false, message: 'Este premio ya tiene ganadores; no se puede borrar.' }, { status: 409 })
  await prisma.sorteoPremio.deleteMany({ where: { id } })
  return NextResponse.json({ ok: true })
}
