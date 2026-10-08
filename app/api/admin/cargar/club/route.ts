import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

// Lista de clubes y, con ?equipo=, los jugadores de ese club con el estado de sus fotos.
export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const equipos = (await prisma.team.findMany({ select: { name: true }, orderBy: { name: 'asc' } })).map((t) => t.name)
  const nombre = req.nextUrl.searchParams.get('equipo')
  if (!nombre) return NextResponse.json({ ok: true, equipos })
  const filas = await prisma.player.findMany({
    where: { team: { name: nombre } },
    orderBy: { lastName: 'asc' },
    select: { id: true, firstName: true, lastName: true, cedula: true, number: true, images: { select: { kind: true } } },
  })
  return NextResponse.json({
    ok: true,
    equipos,
    jugadores: filas.map((j) => ({
      id: j.id, nombre: `${j.firstName} ${j.lastName}`, cedula: j.cedula, numero: j.number,
      selfie: j.images.some((i) => i.kind === 'selfie'),
      frente: j.images.some((i) => i.kind === 'cedula_front'),
      reverso: j.images.some((i) => i.kind === 'cedula_back'),
    })),
  })
}
