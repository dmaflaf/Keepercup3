import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { aplicarFaseFinal, deshacerFaseFinal, planFaseFinal } from '@/lib/fase-final'

export const dynamic = 'force-dynamic'
const COPAS = ['Copa Oro', 'Copa Plata']

// Fase Final (solo administrador). GET: simulación de lo que se crearía en cada copa. POST: crear o deshacer.
export async function GET(req: NextRequest) {
  const no = await exigirAdmin(); if (no) return no
  const torneos = await prisma.torneo.findMany({ orderBy: [{ activo: 'desc' }, { createdAt: 'desc' }], select: { id: true, nombre: true } })
  const torneoId = req.nextUrl.searchParams.get('torneoId') || torneos[0]?.id
  if (!torneoId) return NextResponse.json({ ok: true, torneos, planes: [] })
  const planes = await Promise.all(COPAS.map(async (c) => ({ copa: c, plan: await planFaseFinal(torneoId, c), ultimo: !!(await prisma.ajuste.findUnique({ where: { key: `fasefinal:ultimo:${c}` } })) })))
  return NextResponse.json({ ok: true, torneos, torneoId, planes }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const no = await exigirAdmin(); if (no) return no
  const b = await req.json().catch(() => ({})) as { accion?: string; torneoId?: string; copa?: string }
  if (!b.copa || !COPAS.includes(b.copa)) return NextResponse.json({ ok: false, message: 'Copa inválida' }, { status: 400 })
  const r = b.accion === 'deshacer' ? await deshacerFaseFinal(b.copa) : b.torneoId ? await aplicarFaseFinal(b.torneoId, b.copa) : { error: 'Falta el torneo' }
  if ('error' in r) return NextResponse.json({ ok: false, message: r.error }, { status: 400 })
  return NextResponse.json(r)
}
