import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cargarTorneo } from '@/lib/torneo-data'
import { estadisticasPorteros } from '@/lib/ficha'

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
    // Fair play por club: amarilla 1, doble amarilla 3, roja directa 3 (menos puntos = mejor conducta)
    const fp = new Map<string, { teamId: string; equipo: string; amarillas: number; dobles: number; rojas: number; puntos: number }>()
    for (const c of calc) for (const e of c.eventos) {
      if (!['amarilla', 'doble_amarilla', 'roja'].includes(e.tipo)) continue
      const x = fp.get(e.teamId) || { teamId: e.teamId, equipo: d.nombreEquipo.get(e.teamId) || '?', amarillas: 0, dobles: 0, rojas: 0, puntos: 0 }
      if (e.tipo === 'amarilla') { x.amarillas++; x.puntos += 1 } else if (e.tipo === 'doble_amarilla') { x.dobles++; x.puntos += 3 } else { x.rojas++; x.puntos += 3 }
      fp.set(e.teamId, x)
    }
    const fairplay = [...fp.values()].sort((a, b) => a.puntos - b.puntos || a.equipo.localeCompare(b.equipo))
    // Porteros, jugadores con más partidos, mejor ataque y mejor defensa
    const info = d.jugadoresInfo
    const porteros = estadisticasPorteros(d).map((p) => {
      const teamId = calc.flatMap((c) => c.eventos).find((e) => e.playerId === p.playerId)?.teamId || ''
      return { jugador: info.get(p.playerId)?.nombre || '?', numero: info.get(p.playerId)?.numero ?? null, equipo: d.nombreEquipo.get(teamId) || '?', partidos: p.partidos, golesRecibidos: p.golesRecibidos, vallas: p.vallas, promedio: Math.round((p.golesRecibidos / p.partidos) * 100) / 100 }
    })
    const pj = new Map<string, { teamId: string; n: number }>()
    for (const c of calc) {
      if (c.estado !== 'finalizado') continue
      const vistos = new Set<string>()
      for (const e of c.eventos) if (e.playerId && (e.tipo === 'titular' || e.tipo === 'entra') && !vistos.has(e.playerId)) { vistos.add(e.playerId); pj.set(e.playerId, { teamId: e.teamId, n: (pj.get(e.playerId)?.n || 0) + 1 }) }
    }
    const masPartidos = [...pj.entries()].map(([id, v]) => ({ jugador: info.get(id)?.nombre || '?', numero: info.get(id)?.numero ?? null, equipo: d.nombreEquipo.get(v.teamId) || '?', partidos: v.n })).sort((a, b) => b.partidos - a.partidos).slice(0, 20)
    const filas = d.fases.flatMap((f) => f.grupos.flatMap((g) => g.tabla))
    const ataque = [...filas].sort((a, b) => b.gf - a.gf).slice(0, 10).map((r) => ({ equipo: r.equipo, teamId: r.teamId, valor: r.gf, pj: r.pj }))
    const defensa = [...filas].filter((r) => r.pj > 0).sort((a, b) => a.gc / a.pj - b.gc / b.pj || a.gc - b.gc).slice(0, 10).map((r) => ({ equipo: r.equipo, teamId: r.teamId, valor: r.gc, pj: r.pj }))
    const estadisticas = { porteros: porteros.slice(0, 10), masPartidos, ataque, defensa }
    return NextResponse.json(
      {
        ok: true,
        estadisticas,
        torneos: lista,
        torneo: { id: torneo.id, nombre: torneo.nombre, amarillasSuspension: cfg.amarillasSuspension },
        partidos: partidos.map(({ observaciones, veedor, _i, ...p }) => { void observaciones; void veedor; void _i; return p }),
        fairplay,
        ...resto,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } }
    )
  } catch {
    return NextResponse.json({ ok: false, message: 'No disponible' }, { status: 503 })
  }
}
