import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cargarTorneo } from '@/lib/torneo-data'

export const dynamic = 'force-dynamic'

// Página pública de un club: resultados, posición, plantel con goles y tarjetas. Sin cédula, teléfono ni fotos.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const lista = await prisma.torneo.findMany({ where: { publico: true }, orderBy: [{ activo: 'desc' }, { createdAt: 'desc' }], select: { id: true } })
  const tid = req.nextUrl.searchParams.get('torneoId') || lista[0]?.id
  if (!tid || !lista.some((t) => t.id === tid)) return NextResponse.json({ ok: false, message: 'No disponible' }, { status: 404 })
  const [d, club, plantel] = await Promise.all([
    cargarTorneo(tid),
    prisma.team.findUnique({ where: { id: params.id }, select: { id: true, name: true, logo: true } }),
    prisma.player.findMany({ where: { teamId: params.id }, orderBy: [{ number: 'asc' }], select: { id: true, firstName: true, lastName: true, number: true, position: true } }),
  ])
  if (!d || !club) return NextResponse.json({ ok: false, message: 'Club no encontrado' }, { status: 404 })
  const propios = d.partidos.filter((p) => p.localId === club.id || p.visitanteId === club.id)
  let fila = null as null | Record<string, unknown>
  let grupo = ''
  for (const f of d.fases) for (const g of f.grupos) { const r = g.tabla.find((x) => x.teamId === club.id); if (r) { fila = r; grupo = `${f.nombre} · ${g.nombre}` } }
  const gol = new Map<string, number>(), am = new Map<string, number>(), ro = new Map<string, number>(), pj = new Map<string, number>()
  for (const c of d.calc) {
    if (c.localId !== club.id && c.visitanteId !== club.id) continue
    const jugo = new Set<string>()
    for (const e of c.eventos) {
      if (!e.playerId || e.teamId !== club.id) continue
      if (e.tipo === 'gol' || e.tipo === 'gol_penal') gol.set(e.playerId, (gol.get(e.playerId) || 0) + 1)
      if (e.tipo === 'amarilla' || e.tipo === 'doble_amarilla') am.set(e.playerId, (am.get(e.playerId) || 0) + 1)
      if (e.tipo === 'roja' || e.tipo === 'doble_amarilla') ro.set(e.playerId, (ro.get(e.playerId) || 0) + 1)
      if (e.tipo === 'titular' || e.tipo === 'entra') jugo.add(e.playerId)
    }
    if (c.estado === 'finalizado') jugo.forEach((id) => pj.set(id, (pj.get(id) || 0) + 1))
  }
  const susp = new Map(d.sanciones.map((s) => [s.playerId, s.suspendidoProximo]))
  return NextResponse.json({
    ok: true, torneo: d.torneo.nombre,
    club: { id: club.id, nombre: club.name, escudo: club.logo?.startsWith('data:') ? club.logo : null },
    posicion: fila, grupo,
    partidos: propios.map((p) => ({ id: p.id, jornada: p.jornada, fecha: p.fecha, hora: p.hora, escenario: p.escenario, estado: p.estado, local: p.local, visitante: p.visitante, golesLocal: p.golesLocal, golesVisitante: p.golesVisitante, esLocal: p.localId === club.id })),
    plantel: plantel.map((p) => ({ id: p.id, nombre: `${p.firstName} ${p.lastName}`, numero: p.number, posicion: p.position, goles: gol.get(p.id) || 0, amarillas: am.get(p.id) || 0, rojas: ro.get(p.id) || 0, partidos: pj.get(p.id) || 0, suspendido: susp.get(p.id) || 0 })),
  }, { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } })
}
