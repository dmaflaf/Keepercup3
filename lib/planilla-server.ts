import { prisma } from '@/lib/db'
import { cargarTorneo } from '@/lib/torneo-data'
import { marcadorDesdeEventos } from '@/lib/torneo'
import { bloqueoSuspension, suspendidosEn } from '@/lib/suspension'
import { juegaPara, refuerzosAprobados } from '@/lib/fichaje'
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
  const susp = d ? suspendidosEn(d, p.id) : new Map<string, number>()
  const fase = await prisma.fase.findUnique({ where: { id: p.faseId }, select: { tipo: true } })
  // Fase Final: los Fichajes de Oro aprobados aparecen en la planilla de su club destino
  if (fase?.tipo === 'eliminatoria') {
    const ref = [...(await refuerzosAprobados(p.torneoId)).entries()].filter(([, t]) => t === p.localId || t === p.visitanteId)
    if (ref.length) {
      const extra = await prisma.player.findMany({ where: { id: { in: ref.map(([id]) => id) } }, select: { id: true, firstName: true, lastName: true, number: true, position: true, teamId: true } })
      const destino = new Map(ref)
      for (const x of extra) jug.push({ ...x, teamId: destino.get(x.id)!, position: `⭐ Fichaje de Oro${x.position ? ' · ' + x.position : ''}` })
    }
  }
  return {
    partido: {
      id: p.id, jornada: p.jornada, fecha: p.fecha, hora: p.hora, escenario: p.escenario,
      local: nombre.get(p.localId) || '?', visitante: nombre.get(p.visitanteId) || '?', localId: p.localId, visitanteId: p.visitanteId,
      estado: p.estado, marcadorManual: p.marcadorManual, golesLocal: p.golesLocal, golesVisitante: p.golesVisitante,
      penalesLocal: p.penalesLocal, penalesVisitante: p.penalesVisitante,
      periodo: p.periodo as Periodo, relojBase: p.relojBaseSeg, relojDesde: p.relojDesde ? p.relojDesde.getTime() : null,
      dur: torneo?.minutosTiempo ?? 45, titulares: torneo?.titulares ?? 11, cambiosMax: torneo?.cambiosMax ?? 29,
      suspendidoMotivo: p.suspendidoMotivo, suspendidoMinuto: p.suspendidoMinuto,
      eliminatoria: fase?.tipo === 'eliminatoria', esFinal: fase?.tipo === 'eliminatoria' && /^\s*final\s*$/i.test(p.jornada),
    },
    jugadores: jug.map((j) => ({ id: j.id, nombre: `${j.firstName} ${j.lastName}`, numero: j.number, posicion: j.position, teamId: j.teamId, suspendido: susp.get(j.id) || 0 })),
    eventos: eventos.map((e) => ({ cid: e.clienteId || e.id, tipo: e.tipo, teamId: e.teamId, playerId: e.playerId, minuto: e.minuto, periodo: e.periodo, eid: e.id, extra: e.sancionExtra, extraMotivo: e.sancionMotivo })),
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
  const cerrado = p.estado === 'finalizado' || p.estado === 'suspendido'
  if (cerrado && !(op.t === 'reloj' && op.a === 'reabrir') && !esAdmin) return p.estado === 'suspendido' ? 'El partido está SUSPENDIDO' : 'El partido ya está finalizado'
  // Un partido suspendido no se maneja con el reloj: se resuelve con Fallo de mesa, Reanudar o Jugar de nuevo
  if (p.estado === 'suspendido' && op.t === 'reloj') return 'El partido está SUSPENDIDO: usa «Reanudar partido», «Fallo de mesa» o «Jugar de nuevo».'
  const equipoValido = (id: string) => id === p.localId || id === p.visitanteId

  // Un jugador suspendido no puede ser alineado ni registrar eventos: rige para TODOS (vocal y administrador)
  const suspendido = (playerId: string) => bloqueoSuspension(p.torneoId, p.id, playerId)

  switch (op.t) {
    case 'titular': {
      if (!equipoValido(op.teamId)) return 'Ese equipo no juega este partido'
      if (!(await juegaPara(op.playerId, op.teamId, p))) return 'Ese jugador no es de ese equipo'
      const cid = `T:${p.id}:${op.playerId}`
      if (!op.on) { await prisma.evento.deleteMany({ where: { partidoId, playerId: op.playerId, tipo: 'titular' } }); return }
      if (await prisma.evento.findFirst({ where: { clienteId: cid } })) return
      { const no = await suspendido(op.playerId); if (no) return no }
      const n = await prisma.evento.count({ where: { partidoId, teamId: op.teamId, tipo: 'titular' } })
      if (p.periodo === 'previo' && n >= (torneo?.titulares ?? 11)) return `Ya hay ${torneo?.titulares ?? 11} titulares`
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
        // Fase Final: no se puede cerrar empatado sin un ganador por penales (Art. 41)
        const fase = await prisma.fase.findUnique({ where: { id: p.faseId }, select: { tipo: true } })
        if (fase?.tipo === 'eliminatoria') {
          const gl = (data.golesLocal ?? p.golesLocal) as number | null, gv = (data.golesVisitante ?? p.golesVisitante) as number | null
          const pl = (data.penalesLocal ?? p.penalesLocal) as number | null, pv = (data.penalesVisitante ?? p.penalesVisitante) as number | null
          if (gl !== null && gl === gv && (pl === null || pv === null || pl === pv)) return /^\s*final\s*$/i.test(p.jornada) && r.base < (2 * dur + 15) * 60 ? 'La final está empatada: juega el tiempo extra y, si sigue igual, los penales.' : 'Partido de eliminatoria empatado: defínelo por penales antes de finalizar.'
        }
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
        if (!(await juegaPara(op.playerId, op.teamId, p))) return 'Ese jugador no es de ese equipo'
        const no = await suspendido(op.playerId); if (no) return no
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
      if (!(await juegaPara(op.entra, op.teamId, p))) return 'Ese jugador no es de ese equipo'
      { const no = await suspendido(op.entra); if (no) return no }
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
