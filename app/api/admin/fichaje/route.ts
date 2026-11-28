import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { estadoFichaje, guardarCfgFichaje, pedirFichaje } from '@/lib/fichaje'

export const dynamic = 'force-dynamic'
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })

// Fichaje de Oro (solo administrador): configuración, pedidos de los DT y aprobación.
export async function GET() {
  const no = await exigirAdmin(); if (no) return no
  const e = await estadoFichaje()
  if (!e) return NextResponse.json({ ok: true, cfg: null })
  const pedidos = await prisma.fichajeOro.findMany({ where: { torneoId: e.torneoId }, orderBy: { createdAt: 'desc' } })
  const ids = Array.from(new Set(pedidos.flatMap((p) => [p.teamId, p.origenId])))
  const [clubes, jug] = await Promise.all([
    prisma.team.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.player.findMany({ where: { id: { in: pedidos.map((p) => p.playerId) } }, select: { id: true, firstName: true, lastName: true, number: true, position: true } }),
  ])
  const nom = new Map(clubes.map((c) => [c.id, c.name])), pj = new Map(jug.map((j) => [j.id, j]))
  const el = new Map(e.elegibles.map((x) => [x.playerId, x]))
  return NextResponse.json({
    ok: true, cfg: e.cfg, copasListas: e.copasListas, clasificados: e.clasificados, eliminados: e.eliminados.length, elegibles: e.elegibles.length,
    listaElegibles: e.elegibles.filter((x) => !e.tomados.has(x.playerId)).map((x) => ({ playerId: x.playerId, nombre: x.nombre, origen: x.origen, partidos: x.partidos })),
    pedidos: pedidos.map((p) => {
      const j = pj.get(p.playerId)
      return { id: p.id, estado: p.estado, motivo: p.motivo, pedidoPor: p.pedidoPor, fecha: p.createdAt, club: nom.get(p.teamId) || '?', origen: nom.get(p.origenId) || '?', partidos: p.partidos, jugador: j ? `${j.firstName} ${j.lastName}`.trim() : '?', numero: j?.number ?? null, posicion: j?.position ?? null, goles: el.get(p.playerId)?.goles ?? null }
    }),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const no = await exigirAdmin(); if (no) return no
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  if (b.accion === 'config') {
    const c: Record<string, unknown> = {}
    if (typeof b.abierta === 'boolean') c.abierta = b.abierta
    for (const k of ['minPartidos', 'hastaFecha']) if (b[k] !== undefined) { const n = Number(b[k]); if (!Number.isInteger(n) || n < 1 || n > 60) return falla(`Valor inválido para ${k}`); c[k] = n }
    await guardarCfgFichaje(c)
    return NextResponse.json({ ok: true })
  }
  if (b.accion === 'aprobar' || b.accion === 'rechazar' || b.accion === 'anular') {
    const f = await prisma.fichajeOro.findUnique({ where: { id: String(b.id) } })
    if (!f) return falla('Pedido no encontrado', 404)
    if (b.accion === 'aprobar' && f.estado !== 'pendiente') return falla('Ese pedido ya fue resuelto.')
    const motivo = String(b.motivo || '').trim().slice(0, 300) || null
    await prisma.fichajeOro.update({ where: { id: f.id }, data: { estado: b.accion === 'aprobar' ? 'aprobado' : 'rechazado', motivo: b.accion === 'aprobar' ? null : motivo || (b.accion === 'anular' ? 'Anulado por la organización' : null), resueltoEn: new Date() } })
    return NextResponse.json({ ok: true })
  }
  if (b.accion === 'asignar') {
    const r = await pedirFichaje(String(b.teamId || ''), String(b.playerId || ''), 'admin')
    if (!r.ok) return falla(r.message, 409)
    return NextResponse.json({ ok: true })
  }
  return falla('Acción desconocida')
}
