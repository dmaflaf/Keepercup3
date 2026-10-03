import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin, leerConfig } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await exigirAdmin()
  if (no) return no
  const [config, premios, porColor, ganadores] = await Promise.all([
    leerConfig(),
    prisma.sorteoPremio.findMany({
      orderBy: { createdAt: 'desc' },
      include: { numeros: { orderBy: [{ color: 'asc' }, { numero: 'asc' }], include: { boleto: { select: { nombres: true, correo: true, telefono: true } } } } },
    }),
    prisma.sorteoBoleto.groupBy({ by: ['color'], _count: true }),
    prisma.sorteoNumero.count({ where: { estado: { in: ['ganado', 'entregado'] } } }),
  ])
  return NextResponse.json({
    ok: true,
    config,
    boletos: Object.fromEntries(porColor.map((c) => [c.color, c._count])),
    ganadores,
    premios: premios.map((p) => ({
      id: p.id, nombre: p.nombre, categoria: p.categoria, periodo: p.periodo, lugar: p.lugar, activo: p.activo,
      numeros: p.numeros.map((n) => ({
        id: n.id, color: n.color, numero: n.numero, origen: n.origen, estado: n.estado, codigoCobro: n.codigoCobro,
        ganador: n.boleto ? { nombres: n.boleto.nombres, correo: n.boleto.correo, telefono: n.boleto.telefono } : null,
      })),
    })),
  })
}
