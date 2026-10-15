import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'
import { cargarTorneo } from '@/lib/torneo-data'

export const dynamic = 'force-dynamic'

// Carnet digital. Público: foto, nombre, club, número, posición y estado. Con sesión (admin/vocal): además datos de control.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(params.token)) return NextResponse.json({ ok: false }, { status: 404 })
  const j = await prisma.player.findUnique({
    where: { qrToken: params.token },
    select: { id: true, firstName: true, lastName: true, number: true, position: true, estado: true, team: { select: { name: true, logo: true } }, images: { where: { kind: 'selfie' }, select: { id: true } } },
  })
  if (!j) return NextResponse.json({ ok: false, message: 'Carnet no encontrado' }, { status: 404 })

  let sancion: { suspendidoProximo: number; amarillas: number; rojas: number; precaucion: boolean } | null = null
  try {
    const t = await prisma.torneo.findFirst({ where: { activo: true }, orderBy: { createdAt: 'desc' }, select: { id: true } })
    const d = t ? await cargarTorneo(t.id) : null
    const s = d?.sanciones.find((x) => x.playerId === j.id)
    if (s) sancion = { suspendidoProximo: s.suspendidoProximo, amarillas: s.totalAmarillas, rojas: s.rojas, precaucion: s.precaucion }
  } catch { /* sin torneo */ }

  const staff = await verifyAuth()
  const suspendido = j.estado === 'suspendido' || (sancion?.suspendidoProximo ?? 0) > 0
  return NextResponse.json({
    ok: true,
    nombres: j.firstName, apellidos: j.lastName, numero: j.number, posicion: j.position, club: j.team.name,
    escudo: j.team.logo && j.team.logo.startsWith('data:') ? j.team.logo : null,
    estado: suspendido ? 'suspendido' : j.estado,
    suspendidoPorSancion: (sancion?.suspendidoProximo ?? 0) > 0,
    tieneFoto: j.images.length > 0,
    control: staff ? { sancion, rol: staff.rol } : null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
