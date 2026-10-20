import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'
import { cargarMultas } from '@/lib/multas-data'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })

// Tarjetas, sanciones y multas. El vocal ve sanciones; el dinero (multas y pagos) solo el administrador.
export async function GET(req: NextRequest) {
  const u = await verifyAuth()
  if (!u) return falla('No autorizado', 401)
  const torneos = await prisma.torneo.findMany({ orderBy: [{ activo: 'desc' }, { createdAt: 'desc' }], select: { id: true, nombre: true } })
  const id = req.nextUrl.searchParams.get('torneoId') || torneos[0]?.id
  const d = id ? await cargarMultas(id) : null
  if (!d) return NextResponse.json({ ok: true, torneos, datos: null, rol: u.rol })
  const esAdmin = u.rol === 'admin'
  return NextResponse.json({ ok: true, torneos, rol: u.rol, datos: esAdmin ? d : { ...d, multas: [], pagos: [], torneo: { ...d.torneo, precioAmarilla: 0, precioRoja: 0 } } })
}

export async function POST(req: NextRequest) {
  const u = await verifyAuth()
  if (!u || u.rol !== 'admin') return falla('Solo el administrador', 403)
  const b = await req.json().catch(() => null)
  if (!b) return falla('Solicitud inválida')
  if (b.accion === 'pago') {
    const monto = Math.round(Number(String(b.monto).replace(',', '.')) * 100) / 100
    if (!(monto > 0) || monto > 100000) return falla('Escribe un monto mayor a 0')
    const t = await prisma.torneo.findUnique({ where: { id: String(b.torneoId) }, select: { id: true } })
    const club = await prisma.team.findUnique({ where: { id: String(b.teamId) }, select: { id: true } })
    if (!t || !club) return falla('Torneo o club no encontrado', 404)
    await prisma.pago.create({ data: { torneoId: t.id, teamId: club.id, monto, nota: typeof b.nota === 'string' ? b.nota.trim().slice(0, 80) || null : null, usuario: u.email } })
    return NextResponse.json({ ok: true })
  }
  if (b.accion === 'anular') {
    await prisma.pago.update({ where: { id: String(b.id) }, data: { anulado: !!b.anulado } })
    return NextResponse.json({ ok: true })
  }
  if (b.accion === 'precios') {
    const a = Number(b.amarilla), r = Number(b.roja)
    if (!(a >= 0) || !(r >= 0) || a > 1000 || r > 1000) return falla('Precios inválidos')
    await prisma.torneo.update({ where: { id: String(b.torneoId) }, data: { precioAmarilla: a, precioRoja: r } })
    return NextResponse.json({ ok: true })
  }
  return falla('Acción desconocida')
}
