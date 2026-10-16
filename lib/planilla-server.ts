import { prisma } from '@/lib/db'
import { cargarTorneo } from '@/lib/torneo-data'
import { marcadorDesdeEventos, sanciones } from '@/lib/torneo'
import { enCancha, jugaron, cambiosHechos, Op, Periodo, SnapshotP, TIPOS_JUEGO, transicion } from '@/lib/planilla'

export interface ResultadoOp { id: string; ok: boolean; message?: string }

export async function cargarSnapshot(partidoId: string): Promise<SnapshotP | null> {
  const p = await prisma.partido.findUnique({ where: { id: partidoId } })
  if (!p) return null
  const [torneo, equipos, eventos, jug, d] = await Promise.all([
    prisma.torneo.findUnique({ where: { id: p.torneoId } }),
    prisma.team.findMany({ where: { id: { in: [p.localId, p.visitanteId] } }, select: { id: true, name: true } }),
    prisma.evento.findMany({ where: { partidoId }, orderBy: [{ createdAt: 'asc' }] }),
    prisma.player.findMany({ where: { teamId: { in: [p.localId, p.visitanteId] } }, orderBy: [{ number: 'asc' }, { lastName: 'asc' }], select: { id: true, firstName: true, lastName: true, number: true, position: true, teamId: true } }),
    cargarTorneo(p.torneoId),
  ])
  const nombre = new Map(equipos.map((t) => [t.id, t.name]))
  const previos = (d?.calc || []).filter((c) => c.id !== p.id)
  const susp = new Map(d ? sanciones(previos, d.cfg).filter((s) => s.suspendidoProximo > 0).map((s) => [s.playerId, s.suspendidoProximo]) : [])
  return {
    partido: {
      id: p.id, jornada: p.jornada, fecha: p.fecha, hora: p.hora, escenario: p.escenario,
      local: nombre.get(p.localId) || '?', visitante: nombre.get(p.visitanteId) || '?', localId: p.localId, visitanteId: p.visitanteId,
      estado: p.estado, marcadorManual: p.marcadorManual, golesLocal: p.golesLocal, golesVisitante: p.golesVisitante,
      penalesLocal: p.penalesLocal, penalesVisitante: p.penalesVisitante,
      periodo: p.periodo as Periodo, relojBase: p.relojBaseSeg, relojDesde: p.relojDesde ? p.relojDesde.getTime() : null,
      dur: torneo?.minutosTiempo ?? 45, titulares: torneo?.titulares ?? 11, cambiosMax: torneo?.cambiosMax ?? 29,
    },
    jugadores: jug.map((j) => ({ id: j.id, nombre: `${j.firstName} ${j.lastName}`, numero: j.number, posicion: j.position, teamId: j.teamId, suspendido: susp.get(j.id) || 0 })),
    eventos: eventos.map((e) => ({ cid: e.clienteId || e.id, tipo: e.tipo, teamId: e.teamId, playerId: e.playerId, minuto: e.minuto, periodo: e.periodo })),
  }
}

async function recalcular(partidoId: string) {
  const p = await prisma.partido.findUnique({ where: { id: partidoId } })
  if (!p || p.marcadorManual) return
  const ev = await prisma.evento.findMany({ where: { partidoId } })
  await prisma.partido.update({ where: { id: partidoId }, data: marcadorDesdeEventos(p, ev) })
}

/** Aplica las operaciones en orden. Son idempotentes: reenviar una ya guardada no duplica nada. */
export async function aplicarOps(partidoId: string, ops: Op[], esAdmin: boolean): Promise<ResultadoOp[]> {
  const out: ResultadoOp[] = []
  for (const op of ops) {
    try {
      const msg = await aplicarUna(partidoId, op, esAdmin)
      out.push(msg ? { id: op.id, ok: false, message: msg } : { id: op.id, ok: true })
    } catch (e) {
      console.error('Planilla: error en operación', op.t, e)
      out.push({ id: op.id, ok: false, message: 'Error del servidor; reintentando' })
    }
  }
  return out
}

// Devuelve un mensaje si la operación no es válida (permanente); undefined si quedó aplicada.
async function aplicarUna(partidoId: string, op: Op, esAdmin: boolean): Promise<string | undefined> {
  const p = await prisma.partido.findUnique({ where: { id: partidoId } })
  if (!p) return 'Partido no encontrado'
  const torneo = await prisma.torneo.findUnique({ where: { id: p.torneoId } })
  const dur = torneo?.minutosTiempo ?? 45
  const ahora = Date.now()
  const en = Math.min(op.en, ahora)
  const cerrado = p.estado === 'finalizado'
  if (cerrado && !(op.t === 'reloj' && op.a === 'reabrir') && !esAdmin) return 'El partido ya está finalizado'
  const equipoValido = (id: string) => id === p.localId || id === p.visitanteId

  const suspendido = async (playerId: string) => {
    if (esAdmin) return false
    const d = await cargarTorneo(p.torneoId)
    const previos = (d?.calc || []).filter((c) => c.id !== p.id)
    const s = d ? sanciones(previos, d.cfg).find((x) => x.playerId === playerId) : null
    return !!s && s.suspendidoProximo > 0
  }

  switch (op.t) {
    case 'titular': {
      if (!equipoValido(op.teamId)) return 'Ese equipo no juega este partido'
      const j = await prisma.player.findUnique({ where: { id: op.playerId }, select: { teamId: true } })
      if (!j || j.teamId !== op.teamId) return 'Ese jugador no es de ese equipo'
      const cid = `T:${p.id}:${op.playerId}`
      if (!op.on) { await prisma.evento.deleteMany({ where: { partidoId, playerId: op.playerId, tipo: 'titular' } }); return }
      if (await prisma.evento.findFirst({ where: { clienteId: cid } })) return
      if (await suspendido(op.playerId)) return 'Ese jugador está SUSPENDIDO'
      const n = await prisma.evento.count({ where: { partidoId, teamId: op.teamId, tipo: 'titular' } })
      if (n >= (torneo?.titulares ?? 11)) return `Ya hay ${torneo?.titulares ?? 11} titulares`
      await prisma.evento.create({ data: { partidoId, teamId: op.teamId, playerId: op.playerId, tipo: 'titular', minuto: 0, periodo: 0, clienteId: cid } })
      return
    }
    case 'reloj': {
      if (op.a === 'reabrir') {
        if (!esAdmin) return 'Solo el administrador puede reabrir'
        await prisma.partido.update({ where: { id: p.id }, data: { estado: 'programado' } })
        return
      }
      const r = transicion({ periodo: p.periodo as Periodo, base: p.relojBaseSeg, desde: p.relojDesde ? p.relojDesde.getTime() : null }, op.a, en, dur)
      const data: Record<string, unknown> = { periodo: r.periodo, relojBaseSeg: r.base, relojDesde: r.desde ? new Date(r.desde) : null }
      if (op.a === 'finalizar') {
        const ev = await prisma.evento.findMany({ where: { partidoId } })
        data.estado = 'finalizado'
        data.duracionReal = Math.max(1, Math.ceil(r.base / 60))
        if (!p.marcadorManual) Object.assign(data, marcadorDesdeEventos(p, ev))
        else if (p.golesLocal === null) return 'Falta el marcador'
        const tl = ev.filter((e) => e.teamId === p.localId && (e.tipo === 'tanda_gol' || e.tipo === 'tanda_fallo'))
        const tv = ev.filter((e) => e.teamId === p.visitanteId && (e.tipo === 'tanda_gol' || e.tipo === 'tanda_fallo'))
        if (tl.length || tv.length) { data.penalesLocal = tl.filter((e) => e.tipo === 'tanda_gol').length; data.penalesVisitante = tv.filter((e) => e.tipo === 'tanda_gol').length }
      }
      await prisma.partido.update({ where: { id: p.id }, data })
      return
    }
    case 'evento': {
      if (!(TIPOS_JUEGO as readonly string[]).includes(op.tipo)) return 'Tipo de evento inválido'
      if (!equipoValido(op.teamId)) return 'Ese equipo no juega este partido'
      if (await prisma.evento.findFirst({ where: { clienteId: op.id } })) return
      const faltaJugador = !['falta', 'tanda_gol', 'tanda_fallo'].includes(op.tipo)
      if (faltaJugador && !op.playerId) return 'Elige el jugador'
      if (op.playerId) {
        const j = await prisma.player.findUnique({ where: { id: op.playerId }, select: { teamId: true } })
        if (!j || j.teamId !== op.teamId) return 'Ese jugador no es de ese equipo'
      }
      const minuto = Math.round(op.minuto)
      if (!Number.isFinite(minuto) || minuto < 0 || minuto > 200) return 'Minuto inválido'
      await prisma.evento.create({ data: { partidoId, teamId: op.teamId, playerId: op.playerId, tipo: op.tipo, minuto, periodo: op.periodo, clienteId: op.id } })
      if (['gol', 'gol_penal', 'autogol'].includes(op.tipo)) await recalcular(partidoId)
      return
    }
    case 'cambio': {
      if (!equipoValido(op.teamId)) return 'Ese equipo no juega este partido'
      if (await prisma.evento.findFirst({ where: { clienteId: `${op.id}-e` } })) return
      const ev = await prisma.evento.findMany({ where: { partidoId } })
      const evp = ev.map((e) => ({ cid: e.clienteId || e.id, tipo: e.tipo, teamId: e.teamId, playerId: e.playerId, minuto: e.minuto, periodo: e.periodo }))
      if (cambiosHechos(evp, op.teamId) >= (torneo?.cambiosMax ?? 29)) return `Ya se usaron los ${torneo?.cambiosMax ?? 29} cambios`
      if (!enCancha(evp, op.teamId).has(op.sale)) return 'El jugador que sale no está en la cancha'
      if (jugaron(evp, op.teamId).has(op.entra)) return 'Ese jugador ya participó en el partido'
      const j = await prisma.player.findUnique({ where: { id: op.entra }, select: { teamId: true } })
      if (!j || j.teamId !== op.teamId) return 'Ese jugador no es de ese equipo'
      if (await suspendido(op.entra)) return 'Ese jugador está SUSPENDIDO'
      const minuto = Math.round(op.minuto)
      await prisma.evento.createMany({ data: [
        { partidoId, teamId: op.teamId, playerId: op.sale, tipo: 'sale', minuto, periodo: op.periodo, clienteId: `${op.id}-s` },
        { partidoId, teamId: op.teamId, playerId: op.entra, tipo: 'entra', minuto, periodo: op.periodo, clienteId: `${op.id}-e` },
      ] })
      return
    }
    case 'borrar': {
      await prisma.evento.deleteMany({ where: { partidoId, clienteId: { in: [op.cid, `${op.cid}-s`, `${op.cid}-e`] } } })
      await recalcular(partidoId)
      return
    }
  }
}
