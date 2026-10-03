import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

// Busca un premio por su código de cobro; con confirmar=true lo marca como entregado (una sola vez).
export async function POST(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const b = await req.json().catch(() => ({}))
  const codigo = String(b.codigo || '').trim().toUpperCase()
  const n = await prisma.sorteoNumero.findUnique({ where: { codigoCobro: codigo }, include: { premio: true, boleto: true } })
  if (!n || !n.boleto) return NextResponse.json({ ok: false, message: 'Código no encontrado' }, { status: 404 })
  const info = {
    boleto: `${n.color.toUpperCase()} ${String(n.numero).padStart(4, '0')}`,
    premio: n.premio.nombre, categoria: n.premio.categoria, periodo: n.premio.periodo, lugar: n.premio.lugar,
    nombres: n.boleto.nombres, telefono: n.boleto.telefono, correo: n.boleto.correo,
    estado: n.estado, entregadoAt: n.entregadoAt,
  }
  if (b.confirmar) {
    const r = await prisma.sorteoNumero.updateMany({ where: { id: n.id, estado: 'ganado' }, data: { estado: 'entregado', entregadoAt: new Date() } })
    if (!r.count) return NextResponse.json({ ok: false, message: 'Este premio YA fue entregado.', info }, { status: 409 })
    return NextResponse.json({ ok: true, entregado: true, info: { ...info, estado: 'entregado', entregadoAt: new Date() } })
  }
  return NextResponse.json({ ok: true, info })
}
