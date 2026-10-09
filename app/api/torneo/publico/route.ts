import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cargarTorneo } from '@/lib/torneo-data'

export const dynamic = 'force-dynamic'

// Datos públicos del torneo: fixture, tablas, goleadores y sanciones. Sin datos personales.
export async function GET(req: NextRequest) {
  try {
    const lista = await prisma.torneo.findMany({ where: { publico: true }, orderBy: [{ activo: 'desc' }, { createdAt: 'desc' }], select: { id: true, nombre: true, activo: true } })
    const id = req.nextUrl.searchParams.get('torneoId') || lista[0]?.id
    if (!id || !lista.some((t) => t.id === id)) return NextResponse.json({ ok: true, torneos: lista, torneo: null })
    const d = await cargarTorneo(id)
    if (!d) return NextResponse.json({ ok: true, torneos: lista, torneo: null })
    const { calc, cfg, torneo, partidos, ...resto } = d
    void calc
    return NextResponse.json(
      {
        ok: true,
        torneos: lista,
        torneo: { id: torneo.id, nombre: torneo.nombre, amarillasSuspension: cfg.amarillasSuspension },
        partidos: partidos.map(({ observaciones, veedor, _i, ...p }) => { void observaciones; void veedor; void _i; return p }),
        ...resto,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } }
    )
  } catch {
    return NextResponse.json({ ok: false, message: 'No disponible' }, { status: 503 })
  }
}
