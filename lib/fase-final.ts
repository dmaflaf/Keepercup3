// Herramienta «Fase Final»: arma los partidos de la eliminatoria de cada copa a partir de las llaves (Art. 41).
// Se usa por rondas: al terminar la Fase 2 crea los 4 cuartos; cuando hay ganadores, las semis; luego la final y el 3.er puesto.
// Solo crea los cruces que ya tienen sus dos clubes DEFINIDOS (no provisionales) y que todavía no tienen partido.
import { prisma } from '@/lib/db'
import { cargarTorneo } from '@/lib/torneo-data'
import { construirLlaves, Cruce } from '@/lib/llaves'

export const RONDA: Record<Cruce['id'], { nombre: string; paso: number }> = {
  C1: { nombre: 'Cuartos de final', paso: 0 }, C2: { nombre: 'Cuartos de final', paso: 0 }, C3: { nombre: 'Cuartos de final', paso: 0 }, C4: { nombre: 'Cuartos de final', paso: 0 },
  S1: { nombre: 'Semifinal', paso: 1 }, S2: { nombre: 'Semifinal', paso: 1 }, F: { nombre: 'Final', paso: 2 }, T: { nombre: 'Tercer puesto', paso: 2 },
}
export interface PlanFaseFinal {
  copa: string; faseNombre: string; faseId: string | null; crearFase: boolean
  crear: { id: Cruce['id']; ronda: string; jornadaNum: number; localId: string; visitanteId: string; local: string; visitante: string }[]
  esperando: string[] // cruces que todavía no se pueden crear y por qué
  hechos: string[] // cruces que ya tienen partido
}

export async function planFaseFinal(torneoId: string, copa: string): Promise<PlanFaseFinal | { error: string }> {
  const d = await cargarTorneo(torneoId)
  if (!d) return { error: 'Torneo no encontrado' }
  const llave = construirLlaves(d.fases, d.partidos, d.nombreEquipo).find((l) => l.copa === copa)
  if (!llave) return { error: `No encuentro los 4 grupos de la ${copa} en la Fase 2 (deben llamarse «Grupo 1 ${copa}», «Grupo 2 ${copa}»…).` }
  const faseNombre = `${copa} · Fase Final`
  const fase = d.fases.find((f) => f.tipo === 'eliminatoria' && f.nombre.toLowerCase() === faseNombre.toLowerCase())
    || d.fases.find((f) => f.tipo === 'eliminatoria' && f.nombre.toLowerCase().includes(copa.toLowerCase()))
  // Numeración de fechas: cuartos van después de la última fecha jugada por los clubes de la copa; semis +1; final y 3.er puesto +2
  const clubes = new Set(llave.cruces.slice(0, 4).flatMap((c) => [c.local?.teamId, c.visitante?.teamId]).filter(Boolean) as string[])
  const elim = new Set(d.fases.filter((f) => f.tipo === 'eliminatoria').map((f) => f.id))
  const previos = d.partidos.filter((p) => !elim.has(p.faseId) && (clubes.has(p.localId) || clubes.has(p.visitanteId))).map((p) => Math.max(p.jornadaNum, p.jornadaJuego ?? 0))
  const propios = fase ? d.partidos.filter((p) => p.faseId === fase.id) : []
  const cuartosYa = propios.filter((p) => /cuartos/i.test(p.jornada)).map((p) => p.jornadaNum)
  const base = cuartosYa.length ? Math.min(...cuartosYa) : (previos.length ? Math.max(...previos) : 0) + 1
  const plan: PlanFaseFinal = { copa, faseNombre: fase?.nombre || faseNombre, faseId: fase?.id || null, crearFase: !fase, crear: [], esperando: [], hechos: [] }
  for (const c of llave.cruces) {
    const r = RONDA[c.id]
    if (c.partidoId) { plan.hechos.push(`${c.id}: ${c.local?.nombre} vs ${c.visitante?.nombre}`); continue }
    if (!c.local || !c.visitante) { plan.esperando.push(`${c.id} (${r.nombre}): falta ${!c.local ? c.origenLocal : c.origenVisitante}`); continue }
    if (c.local.provisional || c.visitante.provisional) { plan.esperando.push(`${c.id} (${r.nombre}): ${c.local.nombre} vs ${c.visitante.nombre} todavía es provisional (su grupo no ha terminado)`); continue }
    plan.crear.push({ id: c.id, ronda: r.nombre, jornadaNum: base + r.paso, localId: c.local.teamId, visitanteId: c.visitante.teamId, local: c.local.nombre, visitante: c.visitante.nombre })
  }
  return plan
}

const CLAVE = (copa: string) => `fasefinal:ultimo:${copa}`

export async function aplicarFaseFinal(torneoId: string, copa: string) {
  const plan = await planFaseFinal(torneoId, copa)
  if ('error' in plan) return plan
  if (!plan.crear.length) return { error: 'No hay cruces listos para crear.', plan }
  let faseId = plan.faseId
  if (!faseId) {
    const ult = await prisma.fase.findFirst({ where: { torneoId }, orderBy: { orden: 'desc' } })
    faseId = (await prisma.fase.create({ data: { torneoId, nombre: plan.faseNombre, orden: (ult?.orden ?? 0) + 1, tipo: 'eliminatoria' } })).id
  }
  const creados = await prisma.$transaction(plan.crear.map((c) => prisma.partido.create({ data: { torneoId, faseId: faseId!, jornada: c.ronda, jornadaNum: c.jornadaNum, localId: c.localId, visitanteId: c.visitanteId, estado: 'programado' }, select: { id: true } })))
  const v = JSON.stringify({ fecha: new Date().toISOString(), partidos: creados.map((x) => x.id), faseCreada: plan.crearFase ? faseId : null })
  await prisma.ajuste.upsert({ where: { key: CLAVE(copa) }, create: { key: CLAVE(copa), value: v }, update: { value: v } })
  return { ok: true, creados: creados.length, plan }
}

/** Deshace la última creación: borra esos partidos si todavía no se jugaron (sin eventos ni resultado). */
export async function deshacerFaseFinal(copa: string) {
  const a = await prisma.ajuste.findUnique({ where: { key: CLAVE(copa) } })
  if (!a) return { error: 'No hay nada que deshacer.' }
  const u = JSON.parse(a.value) as { partidos: string[]; faseCreada: string | null }
  const ps = await prisma.partido.findMany({ where: { id: { in: u.partidos } }, select: { id: true, estado: true, golesLocal: true } })
  const conEventos = new Set((await prisma.evento.findMany({ where: { partidoId: { in: ps.map((p) => p.id) } }, select: { partidoId: true } })).map((e) => e.partidoId))
  const jugados = ps.filter((p) => p.estado !== 'programado' || p.golesLocal !== null || conEventos.has(p.id))
  if (jugados.length) return { error: `No se puede deshacer: ${jugados.length} de esos partidos ya tienen datos (resultado o planilla).` }
  await prisma.partido.deleteMany({ where: { id: { in: ps.map((p) => p.id) } } })
  if (u.faseCreada && !(await prisma.partido.count({ where: { faseId: u.faseCreada } }))) await prisma.fase.delete({ where: { id: u.faseCreada } }).catch(() => null)
  await prisma.ajuste.delete({ where: { key: CLAVE(copa) } })
  return { ok: true, borrados: ps.length }
}
