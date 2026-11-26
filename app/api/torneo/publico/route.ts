import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cargarTorneo } from '@/lib/torneo-data'
import { estadisticasPorteros } from '@/lib/ficha'
import { goleadores } from '@/lib/torneo'
import { calcularSanciones } from '@/lib/sanciones'

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
    // Porteros: solo los que jugaron al menos la mitad de los partidos del que más jugó (mínimo 2).
    // Orden: menos goles recibidos por partido; a igual promedio, más partidos jugados y más vallas invictas.
    const todosPort = estadisticasPorteros(d).map((p) => {
      const teamId = calc.flatMap((c) => c.eventos).find((e) => e.playerId === p.playerId)?.teamId || ''
      return { jugador: info.get(p.playerId)?.nombre || '?', numero: info.get(p.playerId)?.numero ?? null, equipo: d.nombreEquipo.get(teamId) || '?', partidos: p.partidos, golesRecibidos: p.golesRecibidos, vallas: p.vallas, promedio: Math.round((p.golesRecibidos / p.partidos) * 100) / 100 }
    })
    const minPorteros = Math.max(2, Math.ceil(Math.max(0, ...todosPort.map((p) => p.partidos)) / 2))
    const porteros = todosPort.filter((p) => p.partidos >= minPorteros)
      .sort((a, b) => a.golesRecibidos / a.partidos - b.golesRecibidos / b.partidos || b.partidos - a.partidos || b.vallas - a.vallas)
    const pj = new Map<string, { teamId: string; n: number }>()
    for (const c of calc) {
      if (c.estado !== 'finalizado') continue
      const vistos = new Set<string>()
      for (const e of c.eventos) if (e.playerId && (e.tipo === 'titular' || e.tipo === 'entra') && !vistos.has(e.playerId)) { vistos.add(e.playerId); pj.set(e.playerId, { teamId: e.teamId, n: (pj.get(e.playerId)?.n || 0) + 1 }) }
    }
    const masPartidos = [...pj.entries()].map(([id, v]) => ({ jugador: info.get(id)?.nombre || '?', numero: info.get(id)?.numero ?? null, equipo: d.nombreEquipo.get(v.teamId) || '?', partidos: v.n })).sort((a, b) => b.partidos - a.partidos).slice(0, 20)
    // Ataque y defensa: cada club UNA vez, con todos sus partidos del torneo (todas las fases).
    // Solo clubes con al menos la mitad de los partidos del que más jugó; se ordena por promedio por partido.
    const club = new Map<string, { pj: number; gf: number; gc: number }>()
    for (const c of calc) {
      if (c.estado !== 'finalizado' || c.golesLocal == null || c.golesVisitante == null) continue
      for (const [id, gf, gc] of [[c.localId, c.golesLocal, c.golesVisitante], [c.visitanteId, c.golesVisitante, c.golesLocal]] as [string, number, number][]) {
        const x = club.get(id) || { pj: 0, gf: 0, gc: 0 }; x.pj++; x.gf += gf; x.gc += gc; club.set(id, x)
      }
    }
    const minClub = Math.max(1, Math.ceil(Math.max(0, ...[...club.values()].map((x) => x.pj)) / 2))
    const filasClub = [...club.entries()].filter(([, x]) => x.pj >= minClub).map(([teamId, x]) => ({ teamId, equipo: d.nombreEquipo.get(teamId) || '?', pj: x.pj, gf: x.gf, gc: x.gc }))
    const r2 = (n: number) => Math.round(n * 100) / 100
    const ataque = [...filasClub].sort((a, b) => b.gf / b.pj - a.gf / a.pj || b.gf - a.gf).slice(0, 10).map((r) => ({ equipo: r.equipo, teamId: r.teamId, valor: r.gf, pj: r.pj, promedio: r2(r.gf / r.pj) }))
    const defensa = [...filasClub].sort((a, b) => a.gc / a.pj - b.gc / b.pj || b.pj - a.pj).slice(0, 10).map((r) => ({ equipo: r.equipo, teamId: r.teamId, valor: r.gc, pj: r.pj, promedio: r2(r.gc / r.pj) }))
    // Sanciones: en qué fechas no juega y cuándo vuelve
    const fs = calcularSanciones(calc.map((c) => ({ id: c.id, jornadaNum: c.jornadaNum, fecha: c.fecha, localId: c.localId, visitanteId: c.visitanteId, estado: c.estado, eventos: c.eventos, ciclo: c.ciclo })), { amarillasSuspension: cfg.amarillasSuspension, partidosDobleAmarilla: cfg.partidosDobleAmarilla, partidosRojaDirecta: cfg.partidosRojaDirecta })
    const filaSan = new Map(fs.map((f) => [f.playerId, f]))
    const vuelta = (s: { playerId: string; teamId: string }) => {
      const f = filaSan.get(s.playerId)
      if (!f) return null
      if (f.estado !== 'SUSPENDIDO') return f.total > 0 ? { noJuega: [] as string[], vuelve: null, siguienteEtapa: false, cumplio: true } : null
      const nom = (n: number) => partidos.find((p) => p.jornadaNum === n)?.jornada || `Fecha ${n}`
      const ultima = Math.max(0, ...f.pendientes)
      const prox = f.fuera ? null : partidos.filter((p) => (p.localId === s.teamId || p.visitanteId === s.teamId) && p.estado !== 'finalizado' && p.jornadaNum > ultima).sort((a, b) => a.jornadaNum - b.jornadaNum)[0]
      return { noJuega: f.pendientes.map(nom), vuelve: prox ? { jornada: prox.jornada, fecha: prox.fecha, rival: prox.localId === s.teamId ? prox.visitante : prox.local } : null, siguienteEtapa: f.fuera > 0, cumplio: false }
    }
    const sancionesOut = resto.sanciones.map((s) => ({ ...s, vuelta: vuelta(s) }))
    // Goleadores por sección: todo el torneo, cada fase sin copas (Fase 1) y cada copa (Oro / Plata, con sus eliminatorias)
    const faseDe = new Map(partidos.map((p) => [p.id, p.faseId]))
    const grupoNom = new Map(d.fases.flatMap((f) => f.grupos.map((g) => [g.id, g.nombre] as [string, string])))
    const faseNom = new Map(d.fases.map((f) => [f.id, f.nombre]))
    const copaDe = (t: string) => (/\boro\b/i.test(t) ? 'Copa Oro' : /\bplata\b/i.test(t) ? 'Copa Plata' : null)
    const seccionDe = (c: (typeof calc)[number]) => copaDe((c.grupoId && grupoNom.get(c.grupoId)) || '') || copaDe(faseNom.get(faseDe.get(c.id) || '') || '') || `fase:${faseDe.get(c.id)}`
    const conNombre = (l: ReturnType<typeof goleadores>) => l.map((g) => ({ ...g, jugador: info.get(g.playerId)?.nombre || '?', numero: info.get(g.playerId)?.numero ?? null, equipo: d.nombreEquipo.get(g.teamId) || '?' }))
    const claves = Array.from(new Set(calc.map(seccionDe)))
    const nombreSec = (k: string) => (k.startsWith('fase:') ? faseNom.get(k.slice(5)) || 'Fase' : k)
    const orden = (k: string) => (k.startsWith('fase:') ? d.fases.findIndex((f) => `fase:${f.id}` === k) : k === 'Copa Oro' ? 100 : 101)
    claves.sort((a, b) => orden(a) - orden(b))
    // Desglose de cada jugador por sección (ej. Fase 1: 10 · Copa Plata: 4)
    const porSec = new Map<string, Map<string, number>>()
    for (const c of calc) { const k = seccionDe(c); for (const e of c.eventos) if (e.playerId && (e.tipo === 'gol' || e.tipo === 'gol_penal')) { const m = porSec.get(e.playerId) || new Map<string, number>(); m.set(k, (m.get(k) || 0) + 1); porSec.set(e.playerId, m) } }
    const detalle = (id: string) => claves.filter((k) => porSec.get(id)?.get(k)).map((k) => ({ nombre: nombreSec(k), goles: porSec.get(id)!.get(k)! }))
    const global = conNombre(goleadores(calc)).map((g) => ({ ...g, detalle: detalle(g.playerId) }))
    // Copa de cada club: el grupo donde juega en la fase con copas
    const copaClub = new Map<string, string>()
    for (const f of d.fases) for (const g of f.grupos) { const c = copaDe(g.nombre); if (c) for (const e of g.equipos) copaClub.set(e.id, c) }
    const goleadoresPor = [
      { id: 'todo', nombre: 'Goleadores Global', goleadores: global },
      ...claves.filter((k) => k.startsWith('fase:')).map((k) => ({ id: k, nombre: nombreSec(k), goleadores: conNombre(goleadores(calc.filter((c) => seccionDe(c) === k))).map((g) => ({ ...g, detalle: [] as { nombre: string; goles: number }[] })) })),
      // Copa Oro / Copa Plata: jugadores de los clubes de esa copa, con TODOS sus goles del torneo (los goles siguen al jugador)
      ...['Copa Oro', 'Copa Plata'].filter((c) => [...copaClub.values()].includes(c)).map((c) => ({
        id: c, nombre: c,
        goleadores: global.filter((g) => copaClub.get(g.teamId) === c).sort((a, b) => b.goles - a.goles || (porSec.get(b.playerId)?.get(c) || 0) - (porSec.get(a.playerId)?.get(c) || 0) || a.jugador.localeCompare(b.jugador)),
      })),
    ].filter((x) => x.goleadores.length)
    const estadisticas = { porteros: porteros.slice(0, 10), minPorteros, minClub, masPartidos, ataque, defensa }
    return NextResponse.json(
      {
        ok: true,
        estadisticas,
        torneos: lista,
        torneo: { id: torneo.id, nombre: torneo.nombre, amarillasSuspension: cfg.amarillasSuspension },
        partidos: partidos.map(({ observaciones, veedor, _i, ...p }) => { void observaciones; void veedor; void _i; return p }),
        fairplay,
        goleadoresPor,
        ...resto,
        sanciones: sancionesOut,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } }
    )
  } catch {
    return NextResponse.json({ ok: false, message: 'No disponible' }, { status: 503 })
  }
}
