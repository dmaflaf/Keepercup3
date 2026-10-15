import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { construirPdf, siteUrl } from '@/lib/carnet'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const dePng = (v?: string | null) => (v && v.startsWith('data:image/png;base64,') ? Buffer.from(v.split(',')[1], 'base64') : null)

// PDF A4 (9 carnets por hoja, frentes y dorsos) de un club. ?equipo=...&ids=a,b (opcional) &todos=1 (incluye no habilitados)
export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const equipo = req.nextUrl.searchParams.get('equipo') || ''
  const ids = (req.nextUrl.searchParams.get('ids') || '').split(',').filter(Boolean)
  const todos = req.nextUrl.searchParams.get('todos') === '1'
  const team = await prisma.team.findUnique({ where: { name: equipo }, select: { name: true, logo: true } })
  if (!team) return NextResponse.json({ ok: false, message: 'Club no encontrado' }, { status: 404 })

  const jugadores = await prisma.player.findMany({
    where: { team: { name: equipo }, ...(ids.length ? { id: { in: ids } } : todos ? {} : { estado: 'habilitado' }), qrToken: { not: null } },
    orderBy: [{ number: 'asc' }, { lastName: 'asc' }],
    select: { firstName: true, lastName: true, number: true, estado: true, qrToken: true, images: { where: { kind: 'selfie' }, select: { data: true } } },
  })
  if (!jugadores.length) return NextResponse.json({ ok: false, message: 'No hay jugadores habilitados con código QR en este club' }, { status: 404 })

  const aus = await prisma.ajuste.findMany({ where: { key: { startsWith: 'aus_' } }, orderBy: { key: 'asc' } })
  const logo = await fetch(`${req.nextUrl.origin}/logo-kc3.png`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
  const pdf = await construirPdf({
    club: team.name,
    escudo: dePng(team.logo),
    auspicios: aus.map((a) => dePng(a.value)).filter(Boolean) as Buffer[],
    logoTorneo: logo ? Buffer.from(logo) : null,
    jugadores: jugadores.map((j) => ({ nombres: j.firstName, apellidos: j.lastName, numero: j.number, estado: j.estado, qrToken: j.qrToken as string, selfie: j.images[0] ? Buffer.from(j.images[0].data) : null })),
  })
  void siteUrl
  return new NextResponse(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="carnets-${equipo.replace(/[^a-z0-9]+/gi, '-')}.pdf"` },
  })
}
