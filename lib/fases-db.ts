// Lectura y escritura en la base para «Subir JSON», «Adicionar fase» y la carga del sorteo de la Fase 2.
// Cada carga guarda un respaldo para poder deshacerla (mientras sus partidos no se hayan jugado).
import { prisma } from '@/lib/db'
import { EstadoTorneo, Plan } from '@/lib/fases-prog'

export type DiaFecha = { fecha: string; horas: string[] }
const claveDias = (torneoId: string) => `programacion_dias:${torneoId}`
const claveRespaldo = (torneoId: string) => `respaldo:subir-fases:${torneoId}`

async function cerradas(torneoId: string): Promise<number[]> {
  const a = await prisma.ajuste.findUnique({ where: { key: `jornadas_cerradas:${torneoId}` } })
  try { return a ? (JSON.parse(a.value) as number[]) : [] } catch { return [] }
}

export async function estadoTorneo(torneoId: string): Promise<EstadoTorneo> {
  const [fases, partidos, clubes] = await Promise.all([
    prisma.fase.findMany({ where: { torneoId }, orderBy: { orden: 'asc' } }),
    prisma.partido.findMany({ where: { torneoId } }),
    prisma.team.findMany({ select: { id: true, name: true } }),
  ])
  const grupos = await prisma.grupo.findMany({ where: { faseId: { in: fases.map((f) => f.id) } }, orderBy: [{ orden: 'asc' }] })
  const miembros = await prisma.grupoEquipo.findMany({ where: { grupoId: { in: grupos.map((g) => g.id) } } })
  const ev = await prisma.evento.groupBy({ by: ['partidoId'], where: { partidoId: { in: partidos.map((p) => p.id) } }, _count: { _all: true } })
  const nEv = new Map(ev.map((x) => [x.partidoId, x._count._all]))
  return {
    fases: fases.map((f) => ({ id: f.id, nombre: f.nombre, tipo: f.tipo })), grupos: grupos.map((g) => ({ id: g.id, faseId: g.faseId, nombre: g.nombre })),
    miembros: miembros.map((m) => ({ grupoId: m.grupoId, teamId: m.teamId })), clubes, cerradas: await cerradas(torneoId),
    partidos: partidos.map((p) => ({ id: p.id, faseId: p.faseId, grupoId: p.grupoId, jornada: p.jornada, jornadaNum: p.jornadaNum, jornadaJuego: p.jornadaJuego, localId: p.localId, visitanteId: p.visitanteId, fecha: p.fecha, hora: p.hora, escenario: p.escenario, estado: p.estado, eventos: nEv.get(p.id) || 0 })),
  }
}

export interface Respaldo {
  en: number; fases: string[]; grupos: string[]; miembros: { grupoId: string; teamId: string }[]; partidos: string[]
  antes: { id: string; jornada: string; jornadaNum: number; grupoId: string | null; localId: string; visitanteId: string; fecha: string | null; hora: string | null; escenario: string | null }[]
  dias?: { key: string; antes: string | null } // días y horas de Programación antes de la carga
  origen?: string
}

/** Días y horas por fecha que trae el sorteo, solo para las fechas que todavía no tienen días propios en Programación. */
export async function diasNuevos(torneoId: string, dias: Record<number, DiaFecha[]>) {
  const a = await prisma.ajuste.findUnique({ where: { key: claveDias(torneoId) } })
  let todos: Record<string, DiaFecha[]> = {}
  try { todos = a ? JSON.parse(a.value) : {} } catch { todos = {} }
  const agregar = Object.entries(dias).filter(([j]) => !todos[j])
  if (!agregar.length) return null
  const nuevo = { ...todos, ...Object.fromEntries(agregar) }
  return { key: claveDias(torneoId), antes: a ? a.value : null, nuevo: JSON.stringify(nuevo), fechas: agregar.map(([j]) => Number(j)) }
}

export async function aplicarPlan(torneoId: string, plan: Plan, dias?: { key: string; antes: string | null; nuevo: string } | null): Promise<Respaldo> {
  return prisma.$transaction(async (tx) => {
    const id = new Map<string, string>()
    const real = (ref: string | null) => (ref === null ? null : id.get(ref) ?? ref)
    let orden = await tx.fase.count({ where: { torneoId } })
    const r: Respaldo = { en: Date.now(), fases: [], grupos: [], miembros: [], partidos: [], antes: [] }
    for (const f of plan.fasesNuevas) {
      const x = await tx.fase.create({ data: { torneoId, nombre: f.nombre, tipo: f.tipo, orden: ++orden } })
      id.set(f.ref, x.id); r.fases.push(x.id)
    }
    for (const g of plan.gruposNuevos) {
      const faseId = real(g.faseRef) as string
      const n = await tx.grupo.count({ where: { faseId } })
      const x = await tx.grupo.create({ data: { faseId, nombre: g.nombre, orden: n + 1 } })
      id.set(g.ref, x.id); r.grupos.push(x.id)
    }
    for (const m of plan.miembrosNuevos) {
      const grupoId = real(m.grupoRef) as string
      await tx.grupoEquipo.create({ data: { grupoId, teamId: m.teamId } })
      r.miembros.push({ grupoId, teamId: m.teamId })
    }
    for (const c of plan.crear) {
      const x = await tx.partido.create({ data: { torneoId, faseId: real(c.faseRef) as string, grupoId: real(c.grupoRef), jornada: c.jornada, jornadaNum: c.jornadaNum, localId: c.localId, visitanteId: c.visitanteId, fecha: c.fecha, hora: c.hora, escenario: c.escenario } })
      r.partidos.push(x.id)
    }
    for (const u of plan.actualizar) {
      const a = await tx.partido.findUniqueOrThrow({ where: { id: u.id } })
      r.antes.push({ id: a.id, jornada: a.jornada, jornadaNum: a.jornadaNum, grupoId: a.grupoId, localId: a.localId, visitanteId: a.visitanteId, fecha: a.fecha, hora: a.hora, escenario: a.escenario })
      const { grupoRef, ...resto } = u.data
      await tx.partido.update({ where: { id: u.id }, data: { ...resto, ...(grupoRef !== undefined ? { grupoId: real(grupoRef) } : {}), ...(resto.jornadaNum !== undefined ? { jornadaJuego: null } : {}) } })
    }
    if (dias) {
      await tx.ajuste.upsert({ where: { key: dias.key }, create: { key: dias.key, value: dias.nuevo }, update: { value: dias.nuevo } })
      r.dias = { key: dias.key, antes: dias.antes }
    }
    return r
  }, { timeout: 60000 })
}

export async function guardarRespaldo(torneoId: string, r: Respaldo) {
  const key = claveRespaldo(torneoId)
  const prev = await prisma.ajuste.findUnique({ where: { key } })
  let lista: Respaldo[] = []; try { lista = prev ? JSON.parse(prev.value) : [] } catch { lista = [] }
  lista.push(r)
  await prisma.ajuste.upsert({ where: { key }, create: { key, value: JSON.stringify(lista) }, update: { value: JSON.stringify(lista) } })
}

export async function ultimoRespaldo(torneoId: string): Promise<Respaldo | null> {
  const prev = await prisma.ajuste.findUnique({ where: { key: claveRespaldo(torneoId) } })
  try { const l = prev ? (JSON.parse(prev.value) as Respaldo[]) : []; return l[l.length - 1] || null } catch { return null }
}

/** Deshace la última carga: borra lo que creó y devuelve los partidos, días y horas a como estaban. */
export async function deshacerUltima(torneoId: string): Promise<{ ok: boolean; message: string }> {
  const key = claveRespaldo(torneoId)
  const prev = await prisma.ajuste.findUnique({ where: { key } })
  let lista: Respaldo[] = []; try { lista = prev ? JSON.parse(prev.value) : [] } catch { lista = [] }
  const r = lista.pop()
  if (!r) return { ok: false, message: 'No hay ninguna carga para deshacer.' }
  const tocados = [...r.partidos, ...r.antes.map((a) => a.id)]
  const ps = await prisma.partido.findMany({ where: { id: { in: tocados } } })
  const conEventos = new Set((await prisma.evento.findMany({ where: { partidoId: { in: r.partidos } }, select: { partidoId: true } })).map((x) => x.partidoId))
  const trabados = ps.filter((p) => p.estado === 'finalizado' || conEventos.has(p.id))
  if (trabados.length) return { ok: false, message: `No se puede deshacer: ${trabados.length} partido(s) de esa carga ya se jugaron o tienen eventos.` }
  await prisma.$transaction([
    prisma.partido.deleteMany({ where: { id: { in: r.partidos } } }),
    ...r.antes.map((a) => prisma.partido.update({ where: { id: a.id }, data: { jornada: a.jornada, jornadaNum: a.jornadaNum, grupoId: a.grupoId, localId: a.localId, visitanteId: a.visitanteId, fecha: a.fecha, hora: a.hora, escenario: a.escenario } })),
    ...r.miembros.map((m) => prisma.grupoEquipo.deleteMany({ where: { grupoId: m.grupoId, teamId: m.teamId } })),
    prisma.grupo.deleteMany({ where: { id: { in: r.grupos } } }),
    prisma.fase.deleteMany({ where: { id: { in: r.fases } } }),
    ...(r.dias ? [r.dias.antes === null ? prisma.ajuste.deleteMany({ where: { key: r.dias.key } }) : prisma.ajuste.update({ where: { key: r.dias.key }, data: { value: r.dias.antes } })] : []),
    prisma.ajuste.update({ where: { key }, data: { value: JSON.stringify(lista) } }),
  ])
  return { ok: true, message: `Carga del ${new Date(r.en).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} deshecha.` }
}
