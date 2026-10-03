import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { prisma } from '@/lib/db'
import { esColor, exigirAdmin, generarCodigo } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

// Gran sorteo: elige al azar (en el servidor) entre los boletos registrados que aún no han ganado.
export async function POST(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const b = await req.json().catch(() => ({}))
  const premio = await prisma.sorteoPremio.findUnique({ where: { id: String(b.premioId || '') } })
  if (!premio) return NextResponse.json({ ok: false, message: 'Elige un premio' }, { status: 404 })
  const filtroColor = esColor(b.color) ? { color: b.color } : {}
  const where = { ganador: null, ...filtroColor }
  const total = await prisma.sorteoBoleto.count({ where })
  if (!total) return NextResponse.json({ ok: false, message: 'No quedan boletos participando' }, { status: 400 })
  const g = await prisma.sorteoBoleto.findFirst({ where, orderBy: { id: 'asc' }, skip: randomInt(0, total) })
  if (!g) return NextResponse.json({ ok: false, message: 'Intenta de nuevo' }, { status: 409 })
  const cobro = generarCodigo(8)
  await prisma.sorteoNumero.create({
    data: { premioId: premio.id, color: g.color, numero: g.numero, origen: 'tombola', estado: 'ganado', boletoId: g.id, codigoCobro: cobro, ganadoAt: new Date() },
  })
  const muestra = await prisma.sorteoBoleto.findMany({ where, select: { color: true, numero: true }, take: 60, orderBy: { createdAt: 'desc' } })
  return NextResponse.json({
    ok: true, participantes: total - 1,
    ganador: { boleto: `${g.color.toUpperCase()} ${String(g.numero).padStart(4, '0')}`, nombres: g.nombres, telefono: g.telefono, correo: g.correo, codigoCobro: cobro, premio: premio.nombre },
    muestra: muestra.map((m) => `${m.color.toUpperCase()} ${String(m.numero).padStart(4, '0')}`),
  })
}

export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const color = req.nextUrl.searchParams.get('color')
  const filtroColor = esColor(color) ? { color } : {}
  const total = await prisma.sorteoBoleto.count({ where: { ganador: null, ...filtroColor } })
  return NextResponse.json({ ok: true, participantes: total })
}
