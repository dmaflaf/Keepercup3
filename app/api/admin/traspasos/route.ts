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
    const [eventos, pases] = await Promise.all([
      prisma.evento.groupBy({ by: ['playerId'], where: { playerId: { in: ids } }, _count: { _all: true } }),
      prisma.traspaso.groupBy({ by: ['playerId'], where: { playerId: { in: ids } }, _count: { _all: true } }),
    ])
    const ev = new Map(eventos.map((e) => [e.playerId, e._count._all]))
    const ps = new Map(pases.map((e) => [e.playerId, e._count._all]))
    return NextResponse.json({ ok: true, jugadores: filtrados.map((j) => ({ id: j.id, nombre: `${j.firstName} ${j.lastName}`, cedula: j.cedula, numero: j.number, clubId: j.team.id, club: j.team.name, eventos: ev.get(j.id) || 0, pases: ps.get(j.id) || 0 })) })
  }
  const [equipos, historial] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.traspaso.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }),
  ])
  const nombres = new Map((await prisma.player.findMany({ where: { id: { in: historial.map((h) => h.playerId) } }, select: { id: true, firstName: true, lastName: true } })).map((p) => [p.id, `${p.firstName} ${p.lastName}`]))
  const v = await ventana()
  return NextResponse.json({ ok: true, equipos, ventana: { ...v, activa: ventanaActiva(v) }, historial: historial.map((h) => ({ ...h, jugador: nombres.get(h.playerId) || '(eliminado)' })) })
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
    if (await prisma.traspaso.count({ where: { playerId: j.id } })) return falla('Este jugador ya tuvo su único traspaso del torneo.')
    const eventos = await prisma.evento.count({ where: { playerId: j.id } })
    if (eventos > 0) return falla(`${j.firstName} ${j.lastName} ya tiene ${eventos} registro(s) en partidos (alineaciones, goles o tarjetas): no puede cambiar de club.`)
    const numero = b.numero === '' || b.numero === null || b.numero === undefined ? null : Number(b.numero)
    if (numero !== null && (!Number.isInteger(numero) || numero < 0 || numero > 99)) return falla('Número inválido')
    if (numero !== null && (await prisma.player.findFirst({ where: { teamId: destino.id, number: numero } }))) return falla(`El número ${numero} ya está ocupado en ${destino.name}. Elige otro.`)
    if (j.cedula && (await prisma.player.findFirst({ where: { teamId: destino.id, cedula: j.cedula } }))) return falla(`Ya existe un jugador con esa cédula en ${destino.name}. Revisa duplicados en Depuración.`)
    await prisma.$transaction([
      prisma.player.update({ where: { id: j.id }, data: { teamId: destino.id, number: numero } }),
      prisma.traspaso.create({ data: { playerId: j.id, deTeamId: j.team.id, aTeamId: destino.id, deClub: j.team.name, aClub: destino.name, numeroAnterior: j.number, numeroNuevo: numero, motivo: typeof b.motivo === 'string' ? b.motivo.trim().slice(0, 200) || null : null, usuario: u.email } }),
    ])
    return NextResponse.json({ ok: true, nombre: `${j.firstName} ${j.lastName}`, de: j.team.name, a: destino.name })
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
