import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

// Listado de clubes registrados con el avance de su nómina (solo administrador).
export async function GET() {
  const no = await exigirAdmin()
  if (no) return no
  const [equipos, jugadores] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true, city: true, estado: true, logo: true, logoUrl: true, directorName: true, contactPhone: true, assistantPhone: true, createdAt: true }, orderBy: { name: 'asc' } }),
    prisma.player.findMany({ select: { teamId: true, estado: true, images: { select: { kind: true } } } }),
  ])
  const m = new Map<string, { total: number; habilitados: number; conFoto: number; conCedulas: number }>()
  for (const j of jugadores) {
    const a = m.get(j.teamId) || { total: 0, habilitados: 0, conFoto: 0, conCedulas: 0 }
    a.total++
    if (j.estado === 'habilitado') a.habilitados++
    if (j.images.some((i) => i.kind === 'selfie')) a.conFoto++
    if (j.images.some((i) => i.kind === 'cedula_front') && j.images.some((i) => i.kind === 'cedula_back')) a.conCedulas++
    m.set(j.teamId, a)
  }
  return NextResponse.json({
    ok: true,
    clubes: equipos.map((t) => ({ id: t.id, nombre: t.name, ciudad: t.city, estado: t.estado, escudo: !!(t.logo || t.logoUrl), director: t.directorName, telefono: t.contactPhone || t.assistantPhone || '', registrado: t.createdAt, ...(m.get(t.id) || { total: 0, habilitados: 0, conFoto: 0, conCedulas: 0 }) })),
  })
}
