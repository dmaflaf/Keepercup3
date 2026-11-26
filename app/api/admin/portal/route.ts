import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'
import { nuevoTokenPortal } from '@/lib/portal'

export const dynamic = 'force-dynamic'
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })

// Portal del DT (solo administrador): enlace de cada club y pedidos de cambio de los DT
export async function GET() {
  const u = await verifyAuth()
  if (!u || u.rol !== 'admin') return falla('Solo el administrador', 403)
  const [sol, clubes] = await Promise.all([
    prisma.solicitudCambio.findMany({ orderBy: [{ createdAt: 'desc' }], take: 200 }),
    prisma.team.findMany({ select: { id: true, name: true, portalToken: true, directorName: true, directorCedula: true, contactPhone: true, assistantPhone: true } }),
  ])
  const nombre = new Map(clubes.map((c) => [c.id, c.name]))
  return NextResponse.json({
    ok: true,
    solicitudes: sol.map((s) => ({ id: s.id, teamId: s.teamId, club: nombre.get(s.teamId) || '?', texto: s.texto, estado: s.estado, respuesta: s.respuesta, fecha: s.createdAt })),
    enlaces: Object.fromEntries(clubes.map((c) => [c.id, { token: c.portalToken, dt: c.directorName, conCedula: !!c.directorCedula, telefono: c.contactPhone || c.assistantPhone || '' }])),
  })
}

export async function POST(req: NextRequest) {
  const u = await verifyAuth()
  if (!u || u.rol !== 'admin') return falla('Solo el administrador', 403)
  const b = await req.json().catch(() => null)
  if (!b) return falla('Solicitud inválida')
  if (b.accion === 'enlace') {
    const t = await prisma.team.findUnique({ where: { id: String(b.teamId) }, select: { id: true, portalToken: true } })
    if (!t) return falla('Club no encontrado', 404)
    // «Cambiar enlace»: el anterior deja de funcionar al instante
    const token = !t.portalToken || b.nuevo ? nuevoTokenPortal() : t.portalToken
    if (token !== t.portalToken) await prisma.team.update({ where: { id: t.id }, data: { portalToken: token } })
    return NextResponse.json({ ok: true, token })
  }
  if (b.accion === 'responder') {
    if (!['atendida', 'rechazada', 'pendiente'].includes(b.estado)) return falla('Estado inválido')
    await prisma.solicitudCambio.update({ where: { id: String(b.id) }, data: { estado: b.estado, respuesta: String(b.respuesta || '').trim().slice(0, 500) || null, atendidaEn: b.estado === 'pendiente' ? null : new Date() } })
    return NextResponse.json({ ok: true })
  }
  return falla('Acción desconocida')
}
