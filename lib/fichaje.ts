// Fichaje de Oro: quién puede fichar, a quién y con qué condiciones.
//  - Ficha: un club CLASIFICADO a cuartos (de cualquier copa). Uno por club, sin cambios.
//  - Fichado: jugador de un club ELIMINADO en la Fase 2 (de cualquier copa), habilitado, sin sanción pendiente, con al menos
//    N partidos jugados (por defecto 3) contando hasta la Fecha X (por defecto 10). Cada jugador, para un solo club.
//  - El jugador NO cambia de club: el fichaje solo lo agrega a la planilla del club destino en la Fase Final.
import { prisma } from '@/lib/db'
import { cargarTorneo } from '@/lib/torneo-data'
import { cargarMultas } from '@/lib/multas-data'
import { construirLlaves } from '@/lib/llaves'

export interface CfgFichaje { abierta: boolean; minPartidos: number; hastaFecha: number }
const CLAVE = 'fichaje:config'
export async function leerCfgFichaje(): Promise<CfgFichaje> {
  const a = await prisma.ajuste.findUnique({ where: { key: CLAVE } })
  let v: Partial<CfgFichaje> = {}; try { v = a ? JSON.parse(a.value) : {} } catch { v = {} }
  return { abierta: !!v.abierta, minPartidos: Number(v.minPartidos) > 0 ? Number(v.minPartidos) : 3, hastaFecha: Number(v.hastaFecha) > 0 ? Number(v.hastaFecha) : 10 }
}
export async function guardarCfgFichaje(c: Partial<CfgFichaje>) {
  const v = JSON.stringify({ ...(await leerCfgFichaje()), ...c })
  await prisma.ajuste.upsert({ where: { key: CLAVE }, create: { key: CLAVE, value: v }, update: { value: v } })
}

export interface Elegible { playerId: string; nombre: string; numero: number | null; posicion: string | null; origenId: string; origen: string; copa: string; partidos: number; goles: number; amarillas: number; rojas: number; tieneFoto: boolean }
export interface EstadoFichaje {
  torneoId: string; cfg: CfgFichaje
  clasificados: { teamId: string; nombre: string; copa: string }[] // pueden fichar
  eliminados: { teamId: string; nombre: string; copa: string }[] // de aquí salen los fichados
  copasListas: string[] // copas cuyos 4 grupos de la Fase 2 terminaron
  elegibles: Elegible[]
  tomados: Map<string, { teamId: string; estado: string }> // jugador -> pedido vigente (pendiente o aprobado)
}

export async function estadoFichaje(torneoId?: string): Promise<EstadoFichaje | null> {
  const torneo = torneoId ? { id: torneoId } : await prisma.torneo.findFirst({ orderBy: [{ activo: 'desc' }, { createdAt: 'desc' }], select: { id: true } })
  if (!torneo) return null
  const [d, m, cfg, pedidos] = await Promise.all([cargarTorneo(torneo.id), cargarMultas(torneo.id), leerCfgFichaje(), prisma.fichajeOro.findMany({ where: { torneoId: torneo.id, estado: { in: ['pendiente', 'aprobado'] } } })])
  if (!d) return null
  const llaves = construirLlaves(d.fases, d.partidos, d.nombreEquipo)
  const clasificados: EstadoFichaje['clasificados'] = [], eliminados: EstadoFichaje['eliminados'] = [], copasListas: string[] = []
  for (const l of llaves) {
    if (l.gruposTerminados < 4) continue
    copasListas.push(l.copa)
    const dentro = new Set(l.cruces.filter((c) => c.id.startsWith('C')).flatMap((c) => [c.local?.teamId, c.visitante?.teamId]).filter(Boolean) as string[])
    dentro.forEach((id) => clasificados.push({ teamId: id, nombre: d.nombreEquipo.get(id) || '?', copa: l.copa }))
    // Eliminados: los demás clubes de los grupos de esa copa en la Fase 2
    const fase = [...d.fases].reverse().find((f) => f.tipo === 'grupos' && f.grupos.some((g) => (l.copa === 'Copa Oro' ? /\boro\b/i : /\bplata\b/i).test(g.nombre)))
    for (const g of fase?.grupos || []) if ((l.copa === 'Copa Oro' ? /\boro\b/i : /\bplata\b/i).test(g.nombre)) for (const e of g.equipos) if (!dentro.has(e.id)) eliminados.push({ teamId: e.id, nombre: e.name, copa: l.copa })
  }
  const elim = new Map(eliminados.map((e) => [e.teamId, e]))
  // Partidos jugados por jugador (alineación, cambio, gol o tarjeta) en partidos finalizados hasta la fecha tope
  const jugados = new Map<string, Set<string>>(), goles = new Map<string, number>(), am = new Map<string, number>(), ro = new Map<string, number>()
  for (const p of d.partidos) {
    if (p.estado !== 'finalizado' || p.jornadaNum > cfg.hastaFecha) continue
    for (const e of p.eventos) {
      if (!e.playerId || !elim.has(e.teamId)) continue
      if (['titular', 'entra', 'gol', 'gol_penal', 'amarilla', 'doble_amarilla', 'roja'].includes(e.tipo)) { const s = jugados.get(e.playerId) || new Set<string>(); s.add(p.id); jugados.set(e.playerId, s) }
      if (e.tipo === 'gol' || e.tipo === 'gol_penal') goles.set(e.playerId, (goles.get(e.playerId) || 0) + 1)
      if (e.tipo === 'amarilla') am.set(e.playerId, (am.get(e.playerId) || 0) + 1)
      if (e.tipo === 'roja' || e.tipo === 'doble_amarilla') ro.set(e.playerId, (ro.get(e.playerId) || 0) + 1)
    }
  }
  const suspendidos = new Set((m?.sanciones || []).filter((s) => s.estado === 'SUSPENDIDO').map((s) => s.playerId))
  const jug = await prisma.player.findMany({
    where: { teamId: { in: [...elim.keys()] }, estado: 'habilitado' },
    select: { id: true, firstName: true, lastName: true, number: true, position: true, teamId: true, images: { where: { kind: 'selfie' }, select: { id: true } } },
  })
  const elegibles: Elegible[] = jug
    .filter((j) => (jugados.get(j.id)?.size || 0) >= cfg.minPartidos && !suspendidos.has(j.id))
    .map((j) => ({ playerId: j.id, nombre: `${j.firstName} ${j.lastName}`.trim(), numero: j.number, posicion: j.position, origenId: j.teamId, origen: elim.get(j.teamId)!.nombre, copa: elim.get(j.teamId)!.copa, partidos: jugados.get(j.id)!.size, goles: goles.get(j.id) || 0, amarillas: am.get(j.id) || 0, rojas: ro.get(j.id) || 0, tieneFoto: j.images.length > 0 }))
    .sort((a, b) => b.partidos - a.partidos || b.goles - a.goles || a.nombre.localeCompare(b.nombre))
  const tomados = new Map(pedidos.map((p) => [p.playerId, { teamId: p.teamId, estado: p.estado }]))
  return { torneoId: torneo.id, cfg, clasificados, eliminados, copasListas, elegibles, tomados }
}

/** Refuerzos aprobados: playerId -> club destino (para la planilla de la Fase Final). */
export async function refuerzosAprobados(torneoId: string): Promise<Map<string, string>> {
  const f = await prisma.fichajeOro.findMany({ where: { torneoId, estado: 'aprobado' }, select: { playerId: true, teamId: true } })
  return new Map(f.map((x) => [x.playerId, x.teamId]))
}

/** ¿Este jugador puede jugar por este club en este partido? (su club, o su club destino de Fichaje de Oro en la Fase Final) */
export async function juegaPara(playerId: string, teamId: string, partido: { torneoId: string; faseId: string }): Promise<boolean> {
  const j = await prisma.player.findUnique({ where: { id: playerId }, select: { teamId: true } })
  if (!j) return false
  if (j.teamId === teamId) return true
  const fase = await prisma.fase.findUnique({ where: { id: partido.faseId }, select: { tipo: true } })
  if (fase?.tipo !== 'eliminatoria') return false
  return !!(await prisma.fichajeOro.findFirst({ where: { torneoId: partido.torneoId, playerId, teamId, estado: 'aprobado' }, select: { id: true } }))
}

// Cache corta de jugadores elegibles (para las fotos del portal sin recalcular todo en cada imagen)
let cache: { t: number; ids: Set<string> } | null = null
export async function esElegibleCacheado(playerId: string): Promise<boolean> {
  if (!cache || Date.now() - cache.t > 60_000) {
    const e = await estadoFichaje()
    cache = { t: Date.now(), ids: new Set(e && e.cfg.abierta ? e.elegibles.map((x) => x.playerId) : []) }
  }
  return cache.ids.has(playerId)
}

/** Pide (DT) o asigna (admin) un Fichaje de Oro, con todas las validaciones. */
export async function pedirFichaje(teamId: string, playerId: string, por: 'dt' | 'admin'): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const e = await estadoFichaje()
  if (!e) return { ok: false, message: 'No hay torneo.' }
  if (por === 'dt' && !e.cfg.abierta) return { ok: false, message: 'El Fichaje de Oro no está abierto.' }
  if (!e.clasificados.some((c) => c.teamId === teamId)) return { ok: false, message: 'Solo los clubes clasificados a cuartos pueden hacer el Fichaje de Oro.' }
  const ya = await prisma.fichajeOro.findFirst({ where: { torneoId: e.torneoId, teamId, estado: { in: ['pendiente', 'aprobado'] } } })
  if (ya) return { ok: false, message: ya.estado === 'aprobado' ? 'Tu club ya tiene su Fichaje de Oro.' : 'Tu club ya tiene un pedido pendiente.' }
  const el = e.elegibles.find((x) => x.playerId === playerId)
  if (!el) return { ok: false, message: 'Ese jugador no cumple las condiciones del Fichaje de Oro.' }
  if (e.tomados.has(playerId)) return { ok: false, message: 'Otro club ya pidió a ese jugador.' }
  const f = await prisma.fichajeOro.create({ data: { torneoId: e.torneoId, teamId, playerId, origenId: el.origenId, partidos: el.partidos, pedidoPor: por, ...(por === 'admin' ? { estado: 'aprobado', resueltoEn: new Date() } : {}) } })
  // Si dos clubes lo pidieron al mismo tiempo, se queda el primero
  const vig = await prisma.fichajeOro.findMany({ where: { torneoId: e.torneoId, playerId, estado: { in: ['pendiente', 'aprobado'] } }, orderBy: { createdAt: 'asc' } })
  if (vig[0]?.id !== f.id) { await prisma.fichajeOro.delete({ where: { id: f.id } }); return { ok: false, message: 'Otro club pidió a ese jugador un instante antes.' } }
  cache = null
  return { ok: true, id: f.id }
}
