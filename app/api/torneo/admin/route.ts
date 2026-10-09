import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'
import { cargarTorneo, criteriosDe } from '@/lib/torneo-data'
import { marcadorDesdeEventos, roundRobin, sanciones } from '@/lib/torneo'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const TIPOS_EVENTO = ['gol', 'gol_penal', 'autogol', 'amarilla', 'doble_amarilla', 'roja']
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })
const entero = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : NaN)
const texto = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null)

// ---- GET: admin y vocal ----
export async function GET(req: NextRequest) {
  const u = await verifyAuth()
  if (!u) return falla('No autorizado', 401)
  const torneos = await prisma.torneo.findMany({ orderBy: [{ activo: 'desc' }, { createdAt: 'desc' }] })
  const equipos = await prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
  const id = req.nextUrl.searchParams.get('torneoId') || torneos[0]?.id
  const d = id ? await cargarTorneo(id) : null
  const partidoId = req.nextUrl.searchParams.get('partidoId')

  // Plantillas de un partido (para registrar goles y tarjetas). Sin cédulas.
  let planilla = null
  if (partidoId && d) {
    const p = d.partidos.find((x) => x.id === partidoId)
    if (p) {
      const jug = await prisma.player.findMany({ where: { teamId: { in: [p.localId, p.visitanteId] } }, orderBy: [{ number: 'asc' }, { lastName: 'asc' }], select: { id: true, firstName: true, lastName: true, number: true, teamId: true, estado: true } })
      const previos = d.calc.filter((c) => c.id !== p.id)
      const susp = new Map(sanciones(previos, d.cfg).filter((s) => s.suspendidoProximo > 0).map((s) => [s.playerId, s.suspendidoProximo]))
      planilla = { partido: p, jugadores: jug.map((j) => ({ id: j.id, nombre: `${j.firstName} ${j.lastName}`, numero: j.number, teamId: j.teamId, suspendido: susp.get(j.id) || 0 })) }
    }
  }
  return NextResponse.json({
    ok: true, rol: u.rol, torneos, equipos,
    torneo: d && { ...d.torneo, fases: d.fases, partidos: d.partidos.map(({ _i, ...p }) => { void _i; return p }), goleadores: d.goleadores, sanciones: d.sanciones },
    planilla,
  })
}

// ---- POST: acciones ----
export async function POST(req: NextRequest) {
  const u = await verifyAuth()
  if (!u) return falla('No autorizado', 401)
  const b = await req.json().catch(() => null)
  if (!b || typeof b.accion !== 'string') return falla('Solicitud inválida')
  const esAdmin = u.rol === 'admin'
  const accionesVocal = ['evento_agregar', 'evento_borrar', 'estado_partido']
  if (!esAdmin && !accionesVocal.includes(b.accion)) return falla('Solo el administrador puede hacer esto', 403)

  switch (b.accion) {
    case 'crear_torneo': {
      const nombre = texto(b.nombre, 80)
      if (!nombre) return falla('Falta el nombre')
      const t = await prisma.torneo.create({ data: { nombre } })
      return NextResponse.json({ ok: true, id: t.id })
    }
    case 'editar_torneo': {
      const data: Record<string, unknown> = {}
      for (const k of ['puntosVictoria', 'puntosEmpate', 'puntosDerrota', 'amarillasSuspension', 'partidosDobleAmarilla', 'partidosRojaDirecta']) {
        if (b[k] !== undefined) { const n = entero(b[k]); if (n === null || Number.isNaN(n)) return falla('Número inválido en ' + k); data[k] = n }
      }
      if ((data.amarillasSuspension as number) === 0) return falla('Las amarillas para suspensión deben ser 1 o más')
      if (typeof b.nombre === 'string' && b.nombre.trim()) data.nombre = b.nombre.trim().slice(0, 80)
      if (typeof b.publico === 'boolean') data.publico = b.publico
      if (typeof b.activo === 'boolean') data.activo = b.activo
      await prisma.torneo.update({ where: { id: String(b.id) }, data })
      return NextResponse.json({ ok: true })
    }
    case 'crear_fase': {
      const nombre = texto(b.nombre, 80)
      if (!nombre) return falla('Falta el nombre de la fase')
      const orden = (await prisma.fase.count({ where: { torneoId: String(b.torneoId) } })) + 1
      const f = await prisma.fase.create({ data: { torneoId: String(b.torneoId), nombre, orden, tipo: b.tipo === 'eliminatoria' ? 'eliminatoria' : 'grupos' } })
      return NextResponse.json({ ok: true, id: f.id })
    }
    case 'editar_fase': {
      const data: Record<string, unknown> = {}
      if (typeof b.nombre === 'string' && b.nombre.trim()) data.nombre = b.nombre.trim().slice(0, 80)
      if (typeof b.criterios === 'string') {
        const c = criteriosDe(b.criterios)
        if (!c.length) return falla('Elige al menos un criterio de ubicación')
        data.criterios = c.join(',')
      }
      await prisma.fase.update({ where: { id: String(b.id) }, data })
      return NextResponse.json({ ok: true })
    }
    case 'borrar_fase': {
      const grupos = await prisma.grupo.findMany({ where: { faseId: String(b.id) }, select: { id: true } })
      const partidos = await prisma.partido.findMany({ where: { faseId: String(b.id) }, select: { id: true } })
      await prisma.$transaction([
        prisma.evento.deleteMany({ where: { partidoId: { in: partidos.map((p) => p.id) } } }),
        prisma.partido.deleteMany({ where: { faseId: String(b.id) } }),
        prisma.grupoEquipo.deleteMany({ where: { grupoId: { in: grupos.map((g) => g.id) } } }),
        prisma.grupo.deleteMany({ where: { faseId: String(b.id) } }),
        prisma.fase.delete({ where: { id: String(b.id) } }),
      ])
      return NextResponse.json({ ok: true })
    }
    case 'crear_grupo': {
      const nombre = texto(b.nombre, 60)
      if (!nombre) return falla('Falta el nombre del grupo')
      const orden = (await prisma.grupo.count({ where: { faseId: String(b.faseId) } })) + 1
      const g = await prisma.grupo.create({ data: { faseId: String(b.faseId), nombre, orden } })
      return NextResponse.json({ ok: true, id: g.id })
    }
    case 'borrar_grupo': {
      const partidos = await prisma.partido.findMany({ where: { grupoId: String(b.id) }, select: { id: true } })
      await prisma.$transaction([
        prisma.evento.deleteMany({ where: { partidoId: { in: partidos.map((p) => p.id) } } }),
        prisma.partido.deleteMany({ where: { grupoId: String(b.id) } }),
        prisma.grupoEquipo.deleteMany({ where: { grupoId: String(b.id) } }),
        prisma.grupo.delete({ where: { id: String(b.id) } }),
      ])
      return NextResponse.json({ ok: true })
    }
    case 'asignar_equipos': {
      const grupoId = String(b.grupoId)
      const nuevos: string[] = Array.isArray(b.teamIds) ? b.teamIds.map(String) : []
      const actuales = await prisma.grupoEquipo.findMany({ where: { grupoId } })
      const quitar = actuales.filter((a) => !nuevos.includes(a.teamId))
      for (const q of quitar) {
        const juega = await prisma.partido.count({ where: { grupoId, OR: [{ localId: q.teamId }, { visitanteId: q.teamId }] } })
        if (juega) return falla('No se puede quitar un equipo que ya tiene partidos en este grupo. Borra primero sus partidos.')
      }
      await prisma.$transaction([
        prisma.grupoEquipo.deleteMany({ where: { grupoId, teamId: { in: quitar.map((q) => q.teamId) } } }),
        ...nuevos.filter((t) => !actuales.some((a) => a.teamId === t)).map((teamId) => prisma.grupoEquipo.create({ data: { grupoId, teamId } })),
      ])
      return NextResponse.json({ ok: true })
    }
    case 'traer_clasificados': {
      // Agrega al grupo destino los equipos que quedaron entre las posiciones desde..hasta de cada grupo de otra fase
      const desde = Number(b.desde), hasta = Number(b.hasta)
      if (!Number.isInteger(desde) || !Number.isInteger(hasta) || desde < 1 || hasta < desde) return falla('Posiciones inválidas')
      const fase = await prisma.fase.findUnique({ where: { id: String(b.desdeFaseId) } })
      if (!fase) return falla('Fase de origen no encontrada')
      const d = await cargarTorneo(fase.torneoId)
      const origen = d?.fases.find((f) => f.id === fase.id)
      if (!origen) return falla('Fase de origen no encontrada')
      const pendientes = (d?.partidos || []).filter((p) => p.faseId === fase.id && p.estado !== 'finalizado').length
      if (pendientes && !b.forzar) {
        return NextResponse.json({ ok: false, pendientes, message: `Faltan ${pendientes} partido(s) por finalizar en "${fase.nombre}". Las posiciones todavía no son definitivas.` }, { status: 409 })
      }
      const ids = origen.grupos.flatMap((g) => g.tabla.filter((r) => r.pos >= desde && r.pos <= hasta).map((r) => r.teamId))
      const ya = new Set((await prisma.grupoEquipo.findMany({ where: { grupoId: String(b.grupoId) } })).map((x) => x.teamId))
      const nuevos = ids.filter((i) => !ya.has(i))
      await prisma.grupoEquipo.createMany({ data: nuevos.map((teamId) => ({ grupoId: String(b.grupoId), teamId })), skipDuplicates: true })
      return NextResponse.json({ ok: true, agregados: nuevos.length })
    }
    case 'pos_manual': {
      const pos = b.pos === null || b.pos === '' ? null : Number(b.pos)
      if (pos !== null && (!Number.isInteger(pos) || pos < 1)) return falla('Posición inválida')
      await prisma.grupoEquipo.updateMany({ where: { grupoId: String(b.grupoId), teamId: String(b.teamId) }, data: { posManual: pos } })
      return NextResponse.json({ ok: true })
    }
    case 'generar_fixture': {
      const grupoId = String(b.grupoId)
      const g = await prisma.grupo.findUnique({ where: { id: grupoId } })
      if (!g) return falla('Grupo no encontrado')
      const equipos = (await prisma.grupoEquipo.findMany({ where: { grupoId } })).map((x) => x.teamId)
      if (equipos.length < 2) return falla('El grupo necesita al menos 2 equipos')
      const hay = await prisma.partido.count({ where: { grupoId } })
      if (hay) return falla('Este grupo ya tiene partidos. Borra los partidos del grupo antes de generar de nuevo.')
      const cruces = roundRobin(equipos, !!b.dobleVuelta)
      const grupo = await prisma.grupo.findUnique({ where: { id: grupoId }, select: { faseId: true } })
      const fase = await prisma.fase.findUnique({ where: { id: grupo!.faseId } })
      await prisma.partido.createMany({
        data: cruces.map((c) => ({ torneoId: fase!.torneoId, faseId: fase!.id, grupoId, jornada: `Fecha ${c.jornada}`, jornadaNum: c.jornada, localId: c.local, visitanteId: c.visitante })),
      })
      return NextResponse.json({ ok: true, partidos: cruces.length })
    }
    case 'crear_partido': {
      const fase = await prisma.fase.findUnique({ where: { id: String(b.faseId) } })
      if (!fase) return falla('Fase no encontrada')
      if (!b.localId || !b.visitanteId || b.localId === b.visitanteId) return falla('Elige dos equipos distintos')
      const jn = entero(b.jornadaNum)
      const p = await prisma.partido.create({
        data: {
          torneoId: fase.torneoId, faseId: fase.id, grupoId: b.grupoId ? String(b.grupoId) : null,
          jornada: texto(b.jornada, 60) || `Fecha ${jn || 1}`, jornadaNum: jn && !Number.isNaN(jn) ? jn : 1,
          fecha: texto(b.fecha, 10), hora: texto(b.hora, 5), escenario: texto(b.escenario), veedor: texto(b.veedor),
          localId: String(b.localId), visitanteId: String(b.visitanteId),
        },
      })
      return NextResponse.json({ ok: true, id: p.id })
    }
    case 'editar_partido': {
      const data: Record<string, unknown> = {}
      for (const k of ['fecha', 'hora', 'escenario', 'veedor', 'observaciones', 'jornada']) if (b[k] !== undefined) data[k] = texto(b[k], k === 'observaciones' ? 1000 : 120)
      if (b.jornadaNum !== undefined) { const n = entero(b.jornadaNum); if (n === null || Number.isNaN(n)) return falla('Jornada inválida'); data.jornadaNum = n }
      if (b.localId && b.visitanteId) {
        if (b.localId === b.visitanteId) return falla('Elige dos equipos distintos')
        const ev = await prisma.evento.count({ where: { partidoId: String(b.id) } })
        if (ev) return falla('El partido ya tiene eventos: no se pueden cambiar los equipos.')
        data.localId = String(b.localId); data.visitanteId = String(b.visitanteId)
      }
      await prisma.partido.update({ where: { id: String(b.id) }, data })
      return NextResponse.json({ ok: true })
    }
    case 'borrar_partido': {
      await prisma.$transaction([prisma.evento.deleteMany({ where: { partidoId: String(b.id) } }), prisma.partido.delete({ where: { id: String(b.id) } })])
      return NextResponse.json({ ok: true })
    }
    case 'marcador_manual': {
      const gl = entero(b.golesLocal), gv = entero(b.golesVisitante)
      if (gl === null || gv === null || Number.isNaN(gl) || Number.isNaN(gv)) return falla('Marcador inválido')
      await prisma.partido.update({ where: { id: String(b.partidoId) }, data: { golesLocal: gl, golesVisitante: gv, marcadorManual: true } })
      return NextResponse.json({ ok: true })
    }
    case 'evento_agregar': {
      const p = await prisma.partido.findUnique({ where: { id: String(b.partidoId) } })
      if (!p) return falla('Partido no encontrado', 404)
      if (!TIPOS_EVENTO.includes(b.tipo)) return falla('Tipo de evento inválido')
      const teamId = String(b.teamId)
      if (teamId !== p.localId && teamId !== p.visitanteId) return falla('Ese equipo no juega este partido')
      const minuto = entero(b.minuto)
      if (Number.isNaN(minuto) || (minuto !== null && minuto > 130)) return falla('Minuto inválido')
      if (!b.playerId) return falla('Elige el jugador')
      const jug = await prisma.player.findUnique({ where: { id: String(b.playerId) }, select: { teamId: true } })
      if (!jug || jug.teamId !== teamId) return falla('Ese jugador no es de ese equipo')
      if (!b.forzar || !esAdmin) {
        const d = await cargarTorneo(p.torneoId)
        const previos = (d?.calc || []).filter((c) => c.id !== p.id)
        const s = d ? sanciones(previos, d.cfg).find((x) => x.playerId === String(b.playerId)) : null
        if (s && s.suspendidoProximo > 0 && !['autogol'].includes(b.tipo)) {
          return NextResponse.json({ ok: false, message: `Este jugador está SUSPENDIDO (${s.suspendidoProximo} partido(s) pendientes).`, suspendido: true }, { status: 409 })
        }
      }
      await prisma.evento.create({ data: { partidoId: p.id, teamId, playerId: String(b.playerId), tipo: b.tipo, minuto } })
      if (!p.marcadorManual && ['gol', 'gol_penal', 'autogol'].includes(b.tipo)) await recalcular(p.id)
      return NextResponse.json({ ok: true })
    }
    case 'evento_borrar': {
      const e = await prisma.evento.findUnique({ where: { id: String(b.id) } })
      if (!e) return falla('Evento no encontrado', 404)
      await prisma.evento.delete({ where: { id: e.id } })
      const p = await prisma.partido.findUnique({ where: { id: e.partidoId } })
      if (p && !p.marcadorManual) await recalcular(p.id)
      return NextResponse.json({ ok: true })
    }
    case 'estado_partido': {
      const p = await prisma.partido.findUnique({ where: { id: String(b.partidoId) } })
      if (!p) return falla('Partido no encontrado', 404)
      if (!['programado', 'finalizado', 'suspendido'].includes(b.estado)) return falla('Estado inválido')
      const data: Record<string, unknown> = { estado: b.estado }
      if (b.estado === 'finalizado') {
        if (!p.marcadorManual) {
          const ev = await prisma.evento.findMany({ where: { partidoId: p.id } })
          Object.assign(data, marcadorDesdeEventos(p, ev))
        } else if (p.golesLocal === null) return falla('Falta el marcador')
        if (esAdmin && (b.penalesLocal !== undefined || b.penalesVisitante !== undefined)) {
          data.penalesLocal = entero(b.penalesLocal); data.penalesVisitante = entero(b.penalesVisitante)
        }
      }
      await prisma.partido.update({ where: { id: p.id }, data })
      return NextResponse.json({ ok: true })
    }
    default:
      return falla('Acción desconocida')
  }
}

async function recalcular(partidoId: string) {
  const p = await prisma.partido.findUnique({ where: { id: partidoId } })
  if (!p) return
  const ev = await prisma.evento.findMany({ where: { partidoId } })
  await prisma.partido.update({ where: { id: partidoId }, data: marcadorDesdeEventos(p, ev) })
}
