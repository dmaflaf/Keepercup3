// ¿Quién está suspendido para un partido? Una sola regla para la planilla, la edición de partidos y la auditoría de goles:
// se cuentan las tarjetas y los partidos cumplidos ANTES de este partido (fechas anteriores), sin importar lo que pasó después.
import { cargarTorneo } from '@/lib/torneo-data'
import { sanciones } from '@/lib/torneo'

type Datos = NonNullable<Awaited<ReturnType<typeof cargarTorneo>>>

export function suspendidosEn(d: Datos, partidoId: string): Map<string, number> {
  const cur = d.calc.find((c) => c.id === partidoId)
  if (!cur) return new Map()
  // Este partido va como «por jugar» para que el cambio de fase (Art. 50) se aplique igual que en la tabla de sanciones
  const lista = [...d.calc.filter((c) => c.id !== cur.id && c.jornadaNum < cur.jornadaNum), { ...cur, estado: 'programado', golesLocal: null, golesVisitante: null, eventos: [] }]
  return new Map(sanciones(lista, d.cfg).filter((s) => s.suspendidoProximo > 0).map((s) => [s.playerId, s.suspendidoProximo]))
}

/** Mensaje de bloqueo si el jugador está suspendido para ese partido; null si puede jugar. */
export async function bloqueoSuspension(torneoId: string, partidoId: string, playerId: string, nombre?: string): Promise<string | null> {
  const d = await cargarTorneo(torneoId)
  if (!d) return null
  const n = suspendidosEn(d, partidoId).get(playerId)
  return n ? `${nombre || 'Ese jugador'} está SUSPENDIDO para este partido (${n} partido(s) por cumplir). No puede ser alineado ni registrar goles o tarjetas.` : null
}
