import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await exigirAdmin()
  if (no) return no
  const filas = await prisma.sorteoBoleto.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10000,
    include: { ganador: { include: { premio: { select: { nombre: true, categoria: true } } } } },
  })
  return NextResponse.json({
    ok: true,
    boletos: filas.map((f) => ({
      id: f.id, fecha: f.createdAt, color: f.color, numero: f.numero, nombres: f.nombres, correo: f.correo,
      telefono: f.telefono, club: f.club, codigo: f.codigo, semana: f.semana,
      premio: f.ganador ? { nombre: f.ganador.premio.nombre, categoria: f.ganador.premio.categoria, estado: f.ganador.estado } : null,
    })),
  })
}
