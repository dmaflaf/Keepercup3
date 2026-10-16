import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { verifyAuth } from '@/lib/auth'

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
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyAuth()
  if (!user || user.rol !== 'admin') return NextResponse.json({ ok: false, message: 'Solo el administrador puede eliminar jugadores' }, { status: 401 })
  const j = await prisma.player.findUnique({ where: { id: params.id }, select: { id: true, firstName: true, lastName: true } })
  if (!j) return NextResponse.json({ ok: false, message: 'Jugador no encontrado' }, { status: 404 })
  const eventos = await prisma.evento.count({ where: { playerId: j.id } })
  if (eventos > 0) return NextResponse.json({ ok: false, message: `${j.firstName} ${j.lastName} ya tiene ${eventos} registro(s) en partidos (goles, tarjetas o alineaciones). No se puede eliminar sin perder el historial; corrige sus datos con ✏️ Editar.` }, { status: 409 })
  await prisma.playerAlias.deleteMany({ where: { playerId: j.id } })
  await prisma.player.delete({ where: { id: j.id } }) // sus fotos se borran con él
  return NextResponse.json({ ok: true, nombre: `${j.firstName} ${j.lastName}` })
}
