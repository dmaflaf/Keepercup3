import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const equipos = (await prisma.team.findMany({ select: { name: true }, orderBy: { name: 'asc' } })).map((t) => t.name)
  const aus = await prisma.ajuste.findMany({ where: { key: { startsWith: 'aus_' } }, orderBy: { key: 'asc' } })
  const auspicios = aus.map((a) => ({ slot: Number(a.key.slice(4)), imagen: a.value }))
  const nombre = req.nextUrl.searchParams.get('equipo')
  if (!nombre) return NextResponse.json({ ok: true, equipos, auspicios })
  const team = await prisma.team.findUnique({ where: { name: nombre }, select: { logo: true } })
  const filas = await prisma.player.findMany({
    where: { team: { name: nombre } },
    orderBy: [{ number: 'asc' }, { lastName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, number: true, estado: true, qrToken: true, images: { select: { kind: true } } },
  })
  const pend = new Set((await prisma.traspaso.findMany({ where: { carnetReimpreso: false, playerId: { in: filas.map((j) => j.id) } }, select: { playerId: true } })).map((t) => t.playerId))
  return NextResponse.json({
    ok: true, equipos, auspicios,
    escudo: team?.logo && team.logo.startsWith('data:') ? team.logo : null,
    jugadores: filas.map((j) => ({
      id: j.id, nombre: `${j.firstName} ${j.lastName}`, numero: j.number, estado: j.estado, tieneQr: !!j.qrToken, reimprimir: pend.has(j.id),
      selfie: j.images.some((i) => i.kind === 'selfie'),
      cedulas: j.images.some((i) => i.kind === 'cedula_front') && j.images.some((i) => i.kind === 'cedula_back'),
    })),
  })
}
