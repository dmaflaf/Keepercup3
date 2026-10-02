import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { verifyAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const prisma = new PrismaClient()

export async function GET() {
  const user = await verifyAuth()
  if (!user) return NextResponse.json({ ok: false, message: 'No autorizado' }, { status: 401 })
  const esAdmin = user.rol === 'admin'

  const filas = await prisma.player.findMany({
    orderBy: [{ team: { name: 'asc' } }, { lastName: 'asc' }],
    take: 3000,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      cedula: true,
      number: true,
      position: true,
      estado: true,
      selfieUrl: true,
      cedulaFrontUrl: true,
      cedulaBackUrl: true,
      team: { select: { name: true } },
    },
  })

  return NextResponse.json({
    ok: true,
    rol: user.rol,
    jugadores: filas.map((j) => ({
      id: j.id,
      nombre: `${j.firstName} ${j.lastName}`,
      equipo: j.team.name,
      numero: j.number,
      posicion: j.position,
      estado: j.estado,
      cedula: esAdmin ? j.cedula : null,
      tieneSelfie: !!j.selfieUrl,
      tieneCedulaFrente: !!j.cedulaFrontUrl,
      tieneCedulaReverso: !!j.cedulaBackUrl,
    })),
  })
}
