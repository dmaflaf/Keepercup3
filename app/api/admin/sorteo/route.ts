import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { COLORES, exigirAdmin, leerConfig } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await exigirAdmin()
  if (no) return no
  const [config, premios, porColor, ganadores, porClub, bloqueos] = await Promise.all([
    leerConfig(),
    prisma.sorteoPremio.findMany({
      orderBy: { createdAt: 'desc' },
      include: { numeros: { orderBy: [{ color: 'asc' }, { numero: 'asc' }], include: { boleto: { select: { nombres: true, correo: true, telefono: true } } } } },
    }),
    prisma.sorteoBoleto.groupBy({ by: ['color'], _count: true }),
    prisma.sorteoNumero.count({ where: { estado: { in: ['ganado', 'entregado'] } } }),
    prisma.sorteoBoleto.groupBy({ by: ['club'], _count: true, orderBy: { _count: { club: 'desc' } } }),
    prisma.sorteoBloqueo.findMany({ where: { tipo: 'telefono' }, orderBy: { createdAt: 'desc' } }),
  ])
  // Por color: cuántos boletos del rango activo ya se registraron y cuántos premios instantáneos quedan por salir
  const colores = await Promise.all(COLORES.map(async (c) => {
    const r = config.rangos[c]
    const [enRango, pendientes] = await Promise.all([
      prisma.sorteoBoleto.count({ where: { color: c, numero: { gte: r.desde, lte: r.hasta } } }),
      prisma.sorteoNumero.count({ where: { color: c, estado: 'pendiente' } }),
    ])
    return { color: c, activo: config.coloresActivos.includes(c), desde: r.desde, hasta: r.hasta, enRango, total: r.hasta - r.desde + 1, premiosPendientes: pendientes }
  }))
  return NextResponse.json({
    ok: true,
    config,
    colores,
    boletos: Object.fromEntries(porColor.map((c) => [c.color, c._count])),
    ganadores,
    bloqueos: bloqueos.map((x) => ({ id: x.id, telefono: x.valor, motivo: x.motivo })),
    clubes: porClub.map((c) => ({ club: c.club || '(sin club)', total: c._count })),
    premios: premios.map((p) => ({
      id: p.id, nombre: p.nombre, categoria: p.categoria, periodo: p.periodo, lugar: p.lugar, activo: p.activo,
      numeros: p.numeros.map((n) => ({
        id: n.id, color: n.color, numero: n.numero, origen: n.origen, estado: n.estado, codigoCobro: n.codigoCobro,
        ganador: n.boleto ? { nombres: n.boleto.nombres, correo: n.boleto.correo, telefono: n.boleto.telefono } : null,
      })),
    })),
  })
}
