import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { aplicarOps, cargarSnapshot } from '@/lib/planilla-server'
import type { Op } from '@/lib/planilla'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Planilla en vivo (admin y vocal). GET: estado completo del partido. POST: aplica operaciones (idempotentes).
export async function GET(req: NextRequest) {
  const u = await verifyAuth()
  if (!u) return NextResponse.json({ ok: false, message: 'No autorizado' }, { status: 401 })
  const s = await cargarSnapshot(req.nextUrl.searchParams.get('partidoId') || '')
  if (!s) return NextResponse.json({ ok: false, message: 'Partido no encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true, rol: u.rol, usuario: u.email, snapshot: s })
}

export async function POST(req: NextRequest) {
  const u = await verifyAuth()
  if (!u) return NextResponse.json({ ok: false, message: 'No autorizado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  const partidoId = String(b?.partidoId || '')
  const ops: Op[] = Array.isArray(b?.ops) ? b.ops.filter((o: Op) => o && typeof o.id === 'string' && typeof o.t === 'string' && typeof o.en === 'number').slice(0, 200) : []
  if (!partidoId || !ops.length) return NextResponse.json({ ok: false, message: 'Solicitud inválida' }, { status: 400 })
  const resultados = await aplicarOps(partidoId, ops, u.rol === 'admin')
  return NextResponse.json({ ok: true, resultados, snapshot: await cargarSnapshot(partidoId), rol: u.rol })
}
