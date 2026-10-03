import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin, guardarConfig, esColor, leerConfig } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const b = await req.json().catch(() => ({}))
  const cambios: any = {}
  if (Array.isArray(b.coloresActivos)) {
    const c = b.coloresActivos.filter(esColor)
    if (!c.length) return NextResponse.json({ ok: false, message: 'Debe haber al menos un color activo' }, { status: 400 })
    cambios.coloresActivos = c
  }
  if (b.rangoMax !== undefined) {
    const n = Number(b.rangoMax)
    if (!Number.isInteger(n) || n < 1 || n > 100000) return NextResponse.json({ ok: false, message: 'Rango inválido' }, { status: 400 })
    cambios.rangoMax = n
  }
  for (const k of ['instagram', 'tiktok']) {
    if (typeof b[k] === 'string') {
      const v = b[k].trim()
      if (v && !/^https:\/\//i.test(v)) return NextResponse.json({ ok: false, message: `El enlace de ${k} debe empezar con https://` }, { status: 400 })
      cambios[k] = v
    }
  }
  await guardarConfig(cambios)
  return NextResponse.json({ ok: true, config: await leerConfig() })
}
