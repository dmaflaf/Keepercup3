import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

// Reglas acordadas: solo el administrador; solo en la ventana de pases (preliminar / Fase 1); un solo pase por jugador;
// quien ya tiene partidos o eventos registrados no puede cambiar de club.
interface Ventana { abierta: boolean; hasta: string | null }
const hoyEc = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })

async function ventana(): Promise<Ventana> {
  const a = await prisma.ajuste.findUnique({ where: { key: 'pases_ventana' } })
  try { const v = a ? (JSON.parse(a.value) as Partial<Ventana>) : {}; return { abierta: v.abierta !== false, hasta: v.hasta || null } } catch { return { abierta: true, hasta: null } }
}
const ventanaActiva = (v: Ventana) => v.abierta && (!v.hasta || hoyEc() <= v.hasta)

/** Torneo en curso (activo más reciente) y su límite de traspasos por jugador. Los traspasos antiguos sin torneo pasan a él. */
async function torneoActual() {
  const t = await prisma.torneo.findFirst({ where: { activo: true }, orderBy: { createdAt: 'desc' }, select: { id: true, nombre: true, traspasosPorJugador: true } })
  if (t) await prisma.traspaso.updateMany({ where: { torneoId: null }, data: { torneoId: t.id } })
  return t
}
const vigentes = (playerId: string, torneoId: string | null) => prisma.traspaso.count({ where: { playerId, anulado: false, ...(torneoId ? { torneoId } : {}) } })
/** Registros del jugador en partidos de este torneo (alineaciones, goles, tarjetas). */
async function eventosEnTorneo(playerId: string, torneoId: string | null, teamId?: string) {
  const partidoIds = torneoId ? (await prisma.partido.findMany({ where: { torneoId }, select: { id: true } })).map((p) => p.id) : undefined
  return prisma.evento.count({ where: { playerId, ...(partidoIds ? { partidoId: { in: partidoIds } } : {}), ...(teamId ? { teamId } : {}) } })
}

export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q) {
    const dig = q.replace(/\D/g, '')
    const jugadores = await prisma.player.findMany({
      where: { OR: [...(dig.length >= 4 ? [{ cedula: { contains: dig } }] : []), ...q.split(/\s+/).filter((w) => w.length > 1).slice(0, 1).flatMap((w) => [{ firstName: { contains: w, mode: 'insensitive' as const } }, { lastName: { contains: w, mode: 'insensitive' as const } }])] },
      take: 40, orderBy: [{ lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, cedula: true, number: true, team: { select: { id: true, name: true } } },
    })
    const palabras = q.toLowerCase().split(/\s+/).filter(Boolean)
    const filtrados = jugadores.filter((j) => dig.length >= 4 && (j.cedula || '').includes(dig) || palabras.every((w) => `${j.firstName} ${j.lastName}`.toLowerCase().includes(w))).slice(0, 15)
    const ids = filtrados.map((j) => j.id)
    const t = await torneoActual()
    const partidoIds = t ? (await prisma.partido.findMany({ where: { torneoId: t.id }, select: { id: true } })).map((p) => p.id) : undefined
    const [eventos, pases] = await Promise.all([
      prisma.evento.groupBy({ by: ['playerId'], where: { playerId: { in: ids }, ...(partidoIds ? { partidoId: { in: partidoIds } } : {}) }, _count: { _all: true } }),
      prisma.traspaso.groupBy({ by: ['playerId'], where: { playerId: { in: ids }, anulado: false, ...(t ? { torneoId: t.id } : {}) }, _count: { _all: true } }),
    ])
    const ev = new Map(eventos.map((e) => [e.playerId, e._count._all]))
    const ps = new Map(pases.map((e) => [e.playerId, e._count._all]))
    return NextResponse.json({ ok: true, jugadores: filtrados.map((j) => ({ id: j.id, nombre: `${j.firstName} ${j.lastName}`, cedula: j.cedula, numero: j.number, clubId: j.team.id, club: j.team.name, eventos: ev.get(j.id) || 0, pases: ps.get(j.id) || 0, limite: t?.traspasosPorJugador ?? 1 })) })
  }
  const [equipos, historial] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.traspaso.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }),
  ])
  const nombres = new Map((await prisma.player.findMany({ where: { id: { in: historial.map((h) => h.playerId) } }, select: { id: true, firstName: true, lastName: true } })).map((p) => [p.id, `${p.firstName} ${p.lastName}`]))
  const v = await ventana()
  const t = await torneoActual()
  return NextResponse.json({ ok: true, equipos, torneo: t, ventana: { ...v, activa: ventanaActiva(v) }, historial: historial.map((h) => ({ ...h, jugador: nombres.get(h.playerId) || '(eliminado)' })) })
}

export async function POST(req: NextRequest) {
  const u = await verifyAuth()
  if (!u || u.rol !== 'admin') return falla('Solo el administrador puede hacer traspasos', 403)
  const b = await req.json().catch(() => null)
  if (!b || typeof b.accion !== 'string') return falla('Solicitud inválida')

  if (b.accion === 'ventana') {
    const hasta = typeof b.hasta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.hasta) ? b.hasta : null
    await prisma.ajuste.upsert({ where: { key: 'pases_ventana' }, create: { key: 'pases_ventana', value: JSON.stringify({ abierta: !!b.abierta, hasta }) }, update: { value: JSON.stringify({ abierta: !!b.abierta, hasta }) } })
    return NextResponse.json({ ok: true })
  }

  if (b.accion === 'reimpreso') {
    await prisma.traspaso.update({ where: { id: String(b.id) }, data: { carnetReimpreso: !!b.valor } })
    return NextResponse.json({ ok: true })
  }

  if (b.accion === 'traspasar') {
    const v = await ventana()
    if (!ventanaActiva(v)) return falla('La ventana de pases está cerrada. Solo se permiten traspasos en la fase preliminar y en la Fase 1.')
    const j = await prisma.player.findUnique({ where: { id: String(b.playerId) }, include: { team: { select: { id: true, name: true } } } })
    if (!j) return falla('Jugador no encontrado', 404)
    const destino = await prisma.team.findUnique({ where: { id: String(b.aTeamId) }, select: { id: true, name: true } })
    if (!destino) return falla('Club de destino no encontrado', 404)
    if (destino.id === j.teamId) return falla('El jugador ya está en ese club')
    const t = await torneoActual()
    const limite = t?.traspasosPorJugador ?? 1
    const hechos = await vigentes(j.id, t?.id ?? null)
    if (hechos >= limite) return falla(limite === 0 ? `En ${t?.nombre || 'este torneo'} no se permiten traspasos.` : limite === 1 ? `Este jugador ya tuvo su único traspaso de ${t?.nombre || 'este torneo'}.` : `Este jugador ya usó sus ${limite} traspasos permitidos en ${t?.nombre || 'este torneo'}.`)
    const eventos = await eventosEnTorneo(j.id, t?.id ?? null, j.teamId)
    if (eventos > 0) return falla(`${j.firstName} ${j.lastName} ya tiene ${eventos} registro(s) en partidos (alineaciones, goles o tarjetas): no puede cambiar de club.`)
    const numero = b.numero === '' || b.numero === null || b.numero === undefined ? null : Number(b.numero)
    if (numero !== null && (!Number.isInteger(numero) || numero < 0 || numero > 99)) return falla('Número inválido')
    if (numero !== null && (await prisma.player.findFirst({ where: { teamId: destino.id, number: numero } }))) return falla(`El número ${numero} ya está ocupado en ${destino.name}. Elige otro.`)
    if (j.cedula && (await prisma.player.findFirst({ where: { teamId: destino.id, cedula: j.cedula } }))) return falla(`Ya existe un jugador con esa cédula en ${destino.name}. Revisa duplicados en Depuración.`)
    await prisma.$transaction([
      prisma.player.update({ where: { id: j.id }, data: { teamId: destino.id, number: numero } }),
      prisma.traspaso.create({ data: { torneoId: t?.id ?? null, playerId: j.id, deTeamId: j.team.id, aTeamId: destino.id, deClub: j.team.name, aClub: destino.name, numeroAnterior: j.number, numeroNuevo: numero, motivo: typeof b.motivo === 'string' ? b.motivo.trim().slice(0, 200) || null : null, usuario: u.email } }),
    ])
    return NextResponse.json({ ok: true, nombre: `${j.firstName} ${j.lastName}`, de: j.team.name, a: destino.name })
  }

  // Eliminar un traspaso hecho por error: el jugador vuelve a su club y número anteriores y el registro queda anulado
  // en el historial (no cuenta como su único traspaso, así se puede hacer el correcto).
  if (b.accion === 'eliminar') {
    const t = await prisma.traspaso.findUnique({ where: { id: String(b.id) } })
    if (!t) return falla('Traspaso no encontrado', 404)
    if (t.anulado) return falla('Ese traspaso ya fue eliminado.')
    const motivo = typeof b.motivo === 'string' ? b.motivo.trim().slice(0, 200) : ''
    if (!motivo) return falla('Escribe el motivo del error.')
    const ultimo = await prisma.traspaso.findFirst({ where: { playerId: t.playerId, anulado: false }, orderBy: { createdAt: 'desc' } })
    if (ultimo && ultimo.id !== t.id) return falla('Solo se puede eliminar el último traspaso vigente del jugador.')
    const j = await prisma.player.findUnique({ where: { id: t.playerId }, select: { id: true, teamId: true, cedula: true } })
    const anular = prisma.traspaso.update({ where: { id: t.id }, data: { anulado: true, anuladoMotivo: motivo, anuladoPor: u.email, anuladoEn: new Date() } })
    if (!j) { await anular; return NextResponse.json({ ok: true, aviso: 'El jugador ya no existe; solo se anuló el registro.' }) }
    if (j.teamId !== t.aTeamId) return falla(`El jugador ya no está en ${t.aClub}; no se puede devolver automáticamente.`)
    const ev = await eventosEnTorneo(j.id, t.torneoId, t.aTeamId)
    if (ev) return falla(`El jugador ya tiene ${ev} registro(s) en partidos con ${t.aClub} (alineaciones, goles o tarjetas). Corrige o borra esos registros antes de eliminar el traspaso.`)
    if (!(await prisma.team.findUnique({ where: { id: t.deTeamId }, select: { id: true } }))) return falla(`El club de origen (${t.deClub}) ya no existe.`)
    if (j.cedula && (await prisma.player.findFirst({ where: { teamId: t.deTeamId, cedula: j.cedula, id: { not: j.id } } }))) return falla(`Ya hay otro jugador con esa cédula en ${t.deClub}.`)
    const numOcupado = t.numeroAnterior !== null && !!(await prisma.player.findFirst({ where: { teamId: t.deTeamId, number: t.numeroAnterior, id: { not: j.id } } }))
    await prisma.$transaction([
      prisma.player.update({ where: { id: j.id }, data: { teamId: t.deTeamId, number: numOcupado ? null : t.numeroAnterior } }),
      anular,
    ])
    return NextResponse.json({ ok: true, aviso: numOcupado ? `Volvió a ${t.deClub} sin número: el N.º ${t.numeroAnterior} ya lo usa otro jugador.` : `Volvió a ${t.deClub}.` })
  }

  if (b.accion === 'deshacer') {
    const t = await prisma.traspaso.findUnique({ where: { id: String(b.id) } })
    if (!t) return falla('Traspaso no encontrado', 404)
    const j = await prisma.player.findUnique({ where: { id: t.playerId }, select: { id: true, teamId: true } })
    if (!j) return falla('El jugador ya no existe')
    if (j.teamId !== t.aTeamId) return falla('El jugador ya no está en el club al que fue traspasado.')
    if (await prisma.evento.count({ where: { playerId: j.id } })) return falla('Ya tiene registros en partidos; no se puede deshacer.')
    if (t.numeroAnterior !== null && (await prisma.player.findFirst({ where: { teamId: t.deTeamId, number: t.numeroAnterior } }))) return falla(`El número ${t.numeroAnterior} ya está ocupado en ${t.deClub}.`)
    await prisma.$transaction([
      prisma.player.update({ where: { id: j.id }, data: { teamId: t.deTeamId, number: t.numeroAnterior } }),
      prisma.traspaso.delete({ where: { id: t.id } }),
    ])
    return NextResponse.json({ ok: true })
  }
  return falla('Acción desconocida')
}
