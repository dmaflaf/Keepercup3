import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

const ESTADOS = ['auto', 'revisar', 'manual', 'otra_foto']

// Jugadores con selfie y el estado de su encuadre (?equipo= para un club; sin él, todos)
export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const equipo = req.nextUrl.searchParams.get('equipo')
  const equipos = (await prisma.team.findMany({ select: { name: true }, orderBy: { name: 'asc' } })).map((t) => t.name)
  const filas = await prisma.player.findMany({
    where: { ...(equipo ? { team: { name: equipo } } : {}), images: { some: { kind: 'selfie' } } },
    orderBy: [{ team: { name: 'asc' } }, { lastName: 'asc' }],
    take: 4000,
    select: { id: true, firstName: true, lastName: true, number: true, team: { select: { name: true } }, images: { where: { kind: 'selfie' }, select: { crop: true, cropEstado: true, cropMotivo: true } } },
  })
  return NextResponse.json({
    ok: true, equipos,
    jugadores: filas.map((j) => ({
      id: j.id, nombre: `${j.firstName} ${j.lastName}`, numero: j.number, equipo: j.team.name,
      crop: j.images[0]?.crop ?? null, estado: j.images[0]?.cropEstado ?? null, motivo: j.images[0]?.cropMotivo ?? null,
    })),
  })
}

// Guarda encuadres calculados (automáticos) o ajustados a mano
export async function POST(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const b = await req.json().catch(() => null)
  const items: { playerId?: string; crop?: { x: number; y: number; w: number; h: number } | null; estado?: string; motivo?: string }[] = Array.isArray(b?.items) ? b.items : []
  if (!items.length || items.length > 300) return NextResponse.json({ ok: false, message: 'Envía entre 1 y 300 elementos' }, { status: 400 })
  let guardados = 0
  for (const it of items) {
    if (!it.playerId || !ESTADOS.includes(String(it.estado))) continue
    const c = it.crop
    const valido = c && [c.x, c.y, c.w, c.h].every((n) => typeof n === 'number' && Number.isFinite(n)) && c.x >= 0 && c.y >= 0 && c.w > 0.05 && c.h > 0.05 && c.x + c.w <= 1.001 && c.y + c.h <= 1.001
    if (it.crop && !valido) continue
    const r = await prisma.playerImage.updateMany({
      where: { playerId: it.playerId, kind: 'selfie' },
      data: { crop: it.crop ? (it.crop as unknown as Prisma.InputJsonValue) : Prisma.DbNull, cropEstado: String(it.estado), cropMotivo: it.motivo ? String(it.motivo).slice(0, 200) : null },
    })
    guardados += r.count
  }
  return NextResponse.json({ ok: true, guardados })
}
