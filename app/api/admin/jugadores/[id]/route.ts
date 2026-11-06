import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { verifyAuth } from '@/lib/auth'
import { marcadorDesdeEventos } from '@/lib/torneo'

export const dynamic = 'force-dynamic'

const prisma = new PrismaClient()
const ESTADOS = ['pendiente', 'habilitado', 'suspendido']

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyAuth()
  if (!user) return NextResponse.json({ ok: false, message: 'No autorizado' }, { status: 401 })
  const esAdmin = user.rol === 'admin'

  const j = await prisma.player.findUnique({
    where: { id: params.id },
    select: {
      id: true, firstName: true, lastName: true, cedula: true, number: true, position: true,
      birthDate: true, email: true, phone: true, estado: true, selfieUrl: true,
      cedulaFrontUrl: true, cedulaBackUrl: true,
      team: { select: { name: true } },
      images: { select: { kind: true } },
    },
  })
  if (!j) return NextResponse.json({ ok: false, message: 'No encontrado' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    rol: user.rol,
    jugador: {
      id: j.id,
      nombre: `${j.firstName} ${j.lastName}`,
      equipo: j.team.name,
      numero: j.number,
      posicion: j.position,
      estado: j.estado,
      fechaNacimiento: j.birthDate,
      cedula: esAdmin ? j.cedula : null,
      correo: esAdmin ? j.email : null,
      telefono: esAdmin ? j.phone : null,
      fotos: {
        selfie: j.images.some((i) => i.kind === 'selfie'),
        cedula_front: esAdmin && j.images.some((i) => i.kind === 'cedula_front'),
        cedula_back: esAdmin && j.images.some((i) => i.kind === 'cedula_back'),
      },
      enlacesDrive: esAdmin ? { selfie: j.selfieUrl, cedula_front: j.cedulaFrontUrl, cedula_back: j.cedulaBackUrl } : null,
    },
  })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyAuth()
  if (!user || user.rol !== 'admin') return NextResponse.json({ ok: false, message: 'No autorizado' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  if (!ESTADOS.includes(body.estado)) return NextResponse.json({ ok: false, message: 'Estado inválido' }, { status: 400 })
  await prisma.player.update({ where: { id: params.id }, data: { estado: body.estado } })
  return NextResponse.json({ ok: true })
}

// Elimina a un jugador (solo administrador). Se usa para quitar duplicados por error de digitación.
// Si ya tiene goles, tarjetas o alineaciones en el torneo no se borra: perdería el historial.
/** Qué se perdería al eliminar al jugador (para mostrarlo antes de confirmar). */
async function impacto(playerId: string) {
  const ev = await prisma.evento.findMany({ where: { playerId }, select: { tipo: true, partidoId: true } })
  const partidos = await prisma.partido.findMany({ where: { id: { in: Array.from(new Set(ev.map((e) => e.partidoId))) } }, select: { id: true, marcadorManual: true } })
  const goles = ev.filter((e) => ['gol', 'gol_penal', 'autogol'].includes(e.tipo))
  return {
    goles: goles.length,
    tarjetas: ev.filter((e) => ['amarilla', 'doble_amarilla', 'roja'].includes(e.tipo)).length,
    alineaciones: ev.filter((e) => ['titular', 'entra'].includes(e.tipo)).length,
    partidos: partidos.length,
    // Partidos cuyo marcador se calcula con los goles: bajaría si se borran sus goles
    marcadoresAfectados: partidos.filter((p) => !p.marcadorManual && goles.some((g) => g.partidoId === p.id)).length,
  }
}

// Eliminar a un jugador: solo el administrador, con su contraseña y un motivo. Borra también sus registros en partidos
// (alineaciones, goles, tarjetas) y sus fotos; los marcadores escritos a mano no cambian. Queda una constancia del borrado.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyAuth()
  if (!user || user.rol !== 'admin') return NextResponse.json({ ok: false, message: 'Solo el administrador puede eliminar jugadores' }, { status: 401 })
  const j = await prisma.player.findUnique({ where: { id: params.id }, select: { id: true, firstName: true, lastName: true, cedula: true, number: true, team: { select: { name: true } } } })
  if (!j) return NextResponse.json({ ok: false, message: 'Jugador no encontrado' }, { status: 404 })
  if (req.nextUrl.searchParams.get('resumen')) return NextResponse.json({ ok: true, impacto: await impacto(j.id) })

  const b = await req.json().catch(() => ({})) as { password?: string; motivo?: string }
  const motivo = String(b.motivo || '').trim().slice(0, 300)
  if (!motivo) return NextResponse.json({ ok: false, message: 'Escribe el motivo de la eliminación.' }, { status: 400 })
  const admin = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } })
  if (!admin || !(await bcrypt.compare(String(b.password || ''), admin.passwordHash))) return NextResponse.json({ ok: false, message: 'La contraseña no es correcta.' }, { status: 401 })

  const imp = await impacto(j.id)
  const ev = await prisma.evento.findMany({ where: { playerId: j.id }, select: { partidoId: true } })
  const ids = Array.from(new Set(ev.map((e) => e.partidoId)))
  await prisma.$transaction([
    prisma.evento.deleteMany({ where: { playerId: j.id } }),
    prisma.playerAlias.deleteMany({ where: { playerId: j.id } }),
    prisma.player.delete({ where: { id: j.id } }), // sus fotos se borran con él
  ])
  // Recalcular los marcadores que salen de los goles (los escritos a mano no se tocan)
  for (const p of await prisma.partido.findMany({ where: { id: { in: ids }, marcadorManual: false } })) {
    const evs = await prisma.evento.findMany({ where: { partidoId: p.id } })
    await prisma.partido.update({ where: { id: p.id }, data: marcadorDesdeEventos(p, evs) })
  }
  // Constancia del borrado
  const clave = 'registro:jugadores_eliminados'
  const a = await prisma.ajuste.findUnique({ where: { key: clave } })
  const lista = a ? (JSON.parse(a.value) as unknown[]) : []
  lista.unshift({ fecha: new Date().toISOString(), usuario: user.email, jugador: `${j.firstName} ${j.lastName}`, cedula: j.cedula, numero: j.number, club: j.team.name, motivo, ...imp })
  await prisma.ajuste.upsert({ where: { key: clave }, create: { key: clave, value: JSON.stringify(lista.slice(0, 500)) }, update: { value: JSON.stringify(lista.slice(0, 500)) } })
  return NextResponse.json({ ok: true, nombre: `${j.firstName} ${j.lastName}`, impacto: imp })
}
