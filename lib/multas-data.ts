import { prisma } from '@/lib/db'
import { cargarTorneo } from '@/lib/torneo-data'
import { calcularMultas, calcularSanciones, FilaMulta, FilaSancion, PartidoSan } from '@/lib/sanciones'

export interface DatosMultas {
  torneo: { id: string; nombre: string; precioAmarilla: number; precioRoja: number; amarillasSuspension: number; partidosDobleAmarilla: number; partidosRojaDirecta: number }
  grupos: { id: string; nombre: string; fase: string; equipos: { id: string; nombre: string }[] }[]
  multas: (FilaMulta & { nombre: string; grupo: string })[]
  sanciones: (FilaSancion & { jugador: string; numero: number | null; club: string; grupo: string })[]
  pagos: { id: string; teamId: string; club: string; monto: number; nota: string | null; usuario: string; anulado: boolean; createdAt: Date }[]
  jornadasJugadas: number
}

/** Tarjetas, sanciones y multas de un torneo (sin cédulas). */
export async function cargarMultas(torneoId: string): Promise<DatosMultas | null> {
  const d = await cargarTorneo(torneoId)
  if (!d) return null
  const t = d.torneo as typeof d.torneo & { precioAmarilla: number; precioRoja: number }
  const partidos: PartidoSan[] = d.calc.map((c) => ({ id: c.id, jornadaNum: c.jornadaNum, fecha: c.fecha, localId: c.localId, visitanteId: c.visitanteId, estado: c.estado, eventos: c.eventos }))
  const grupos = d.fases.flatMap((f) => f.grupos.map((g) => ({ id: g.id, nombre: g.nombre, fase: f.nombre, equipos: g.equipos.map((e) => ({ id: e.id, nombre: e.name })) })))
  const grupoDe = new Map<string, string>()
  for (const g of grupos) for (const e of g.equipos) grupoDe.set(e.id, g.nombre)
  const equipos = Array.from(new Set(grupos.flatMap((g) => g.equipos.map((e) => e.id))))
  const pagosDB = await prisma.pago.findMany({ where: { torneoId }, orderBy: { createdAt: 'desc' } })
  const pagado = new Map<string, number>()
  for (const p of pagosDB) if (!p.anulado) pagado.set(p.teamId, (pagado.get(p.teamId) || 0) + p.monto)
  const nombre = (id: string) => d.nombreEquipo.get(id) || '?'
  const multas = calcularMultas(partidos, equipos, { amarilla: t.precioAmarilla, roja: t.precioRoja }, pagado).map((m) => ({ ...m, nombre: nombre(m.teamId), grupo: grupoDe.get(m.teamId) || '' }))
  const sanc = calcularSanciones(partidos, { amarillasSuspension: d.cfg.amarillasSuspension, partidosDobleAmarilla: d.cfg.partidosDobleAmarilla, partidosRojaDirecta: d.cfg.partidosRojaDirecta })
  const sanciones = sanc.map((s) => ({ ...s, jugador: d.jugadoresInfo.get(s.playerId)?.nombre || '?', numero: d.jugadoresInfo.get(s.playerId)?.numero ?? null, club: nombre(s.teamId), grupo: grupoDe.get(s.teamId) || '' }))
  const jornadasJugadas = Math.max(0, ...partidos.filter((p) => p.estado === 'finalizado').map((p) => p.jornadaNum))
  return {
    torneo: { id: t.id, nombre: t.nombre, precioAmarilla: t.precioAmarilla, precioRoja: t.precioRoja, amarillasSuspension: d.cfg.amarillasSuspension, partidosDobleAmarilla: d.cfg.partidosDobleAmarilla, partidosRojaDirecta: d.cfg.partidosRojaDirecta },
    grupos, multas, sanciones, jornadasJugadas,
    pagos: pagosDB.map((p) => ({ id: p.id, teamId: p.teamId, club: nombre(p.teamId), monto: p.monto, nota: p.nota, usuario: p.usuario, anulado: p.anulado, createdAt: p.createdAt })),
  }
}
