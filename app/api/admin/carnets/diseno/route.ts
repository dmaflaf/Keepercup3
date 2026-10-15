import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { LAYOUT_DEFECTO, Layout, mezclarLayout } from '@/lib/carnet'

export const dynamic = 'force-dynamic'

async function guardado(): Promise<Partial<Layout> | undefined> {
  const a = await prisma.ajuste.findUnique({ where: { key: 'carnet_layout' } })
  try { return a ? (JSON.parse(a.value) as Partial<Layout>) : undefined } catch { return undefined }
}

export async function GET() {
  const no = await exigirAdmin()
  if (no) return no
  return NextResponse.json({ ok: true, layout: mezclarLayout(await guardado()), defecto: LAYOUT_DEFECTO })
}

// Guarda las medidas (solo números razonables, de las claves que existen)
export async function POST(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const b = await req.json().catch(() => null)
  if (!b || typeof b.layout !== 'object') return NextResponse.json({ ok: false, message: 'Datos inválidos' }, { status: 400 })
  const limpio: Record<string, Record<string, unknown>> = {}
  for (const grupo of Object.keys(LAYOUT_DEFECTO) as (keyof Layout)[]) {
    const src = b.layout[grupo]
    if (!src || typeof src !== 'object') continue
    limpio[grupo] = {}
    for (const k of Object.keys(LAYOUT_DEFECTO[grupo])) {
      const v = (src as Record<string, unknown>)[k]
      if (Array.isArray(v)) {
        const arr = v.map(Number)
        if (arr.length === 4 && arr.every((n) => Number.isFinite(n) && n >= 0 && n <= 400)) limpio[grupo][k] = arr
      } else if (v !== undefined) {
        const n = Number(v)
        if (!Number.isFinite(n) || n < 0 || n > 400) return NextResponse.json({ ok: false, message: `Valor inválido en ${grupo}.${k}` }, { status: 400 })
        limpio[grupo][k] = n
      }
    }
  }
  await prisma.ajuste.upsert({ where: { key: 'carnet_layout' }, update: { value: JSON.stringify(limpio) }, create: { key: 'carnet_layout', value: JSON.stringify(limpio) } })
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const no = await exigirAdmin()
  if (no) return no
  await prisma.ajuste.deleteMany({ where: { key: 'carnet_layout' } })
  return NextResponse.json({ ok: true })
}
