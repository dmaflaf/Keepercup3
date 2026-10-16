import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })
const txt = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '')

// Datos completos de un club para editar (solo administrador)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const no = await exigirAdmin()
  if (no) return no
  const t = await prisma.team.findUnique({ where: { id: params.id }, select: { id: true, name: true, city: true, directorName: true, directorCedula: true, contactPhone: true, contactEmail: true, estado: true } })
  if (!t) return falla('Club no encontrado', 404)
  return NextResponse.json({ ok: true, club: t })
}

// Editar un club. Ojo: el nombre es la llave que usan las hojas de Excel/Google para asignar jugadores.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const no = await exigirAdmin()
  if (no) return no
  const b = await req.json().catch(() => null)
  if (!b) return falla('Solicitud inválida')
  const nombre = txt(b.nombre)
  if (!nombre) return falla('El nombre del club no puede quedar vacío')
  const otro = await prisma.team.findFirst({ where: { name: { equals: nombre, mode: 'insensitive' }, NOT: { id: params.id } }, select: { id: true } })
  if (otro) return falla('Ya existe otro club con ese nombre')
  await prisma.team.update({
    where: { id: params.id },
    data: { name: nombre, city: txt(b.ciudad) || '-', directorName: txt(b.director) || '-', contactPhone: txt(b.telefono, 30) || null, contactEmail: txt(b.correo, 120) || null, ...(['aprobado', 'pendiente', 'rechazado'].includes(b.estado) ? { estado: b.estado } : {}) },
  })
  return NextResponse.json({ ok: true })
}

// Eliminar un club. Se bloquea si ya está en el torneo (grupos o partidos). Con jugadores, hay que confirmar escribiendo el nombre.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const no = await exigirAdmin()
  if (no) return no
  const t = await prisma.team.findUnique({ where: { id: params.id }, select: { id: true, name: true } })
  if (!t) return falla('Club no encontrado', 404)
  const [grupos, partidos, jugadores] = await Promise.all([
    prisma.grupoEquipo.count({ where: { teamId: t.id } }),
    prisma.partido.count({ where: { OR: [{ localId: t.id }, { visitanteId: t.id }] } }),
    prisma.player.count({ where: { teamId: t.id } }),
  ])
  if (grupos > 0 || partidos > 0) return falla(`${t.name} ya está en el torneo (${grupos} grupo(s), ${partidos} partido(s)). Quítalo primero del torneo para poder eliminarlo.`, 409)
  if (jugadores > 0) {
    const b = await req.json().catch(() => null)
    if (!b?.eliminarJugadores || txt(b.confirmarNombre) !== t.name) return falla(`${t.name} tiene ${jugadores} jugador(es). Para eliminarlo junto con ellos hay que confirmar escribiendo el nombre del club.`, 409)
    const eventos = await prisma.evento.count({ where: { teamId: t.id } })
    if (eventos > 0) return falla('Sus jugadores ya tienen registros en partidos; no se puede eliminar.', 409)
  }
  const ids = (await prisma.player.findMany({ where: { teamId: t.id }, select: { id: true } })).map((p) => p.id)
  try {
    await prisma.$transaction([
      prisma.playerAlias.deleteMany({ where: { playerId: { in: ids } } }),
      prisma.team.delete({ where: { id: t.id } }), // sus jugadores y fotos se borran con él
    ])
  } catch { return falla('No se pudo eliminar: el club todavía está enlazado a otros datos (fixture antiguo).', 409) }
  return NextResponse.json({ ok: true, nombre: t.name, jugadoresEliminados: jugadores })
}
