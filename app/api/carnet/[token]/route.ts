import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'
import { cargarTorneo } from '@/lib/torneo-data'
import { construirFicha, edadDe } from '@/lib/ficha'

export const dynamic = 'force-dynamic'

// Ficha deportiva / carnet digital.
// Público: carnet, estado, edad y estadísticas del torneo. Árbitro o vocal con sesión: + control. Administrador: + cédula y acceso a documentos.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(params.token)) return NextResponse.json({ ok: false }, { status: 404 })
  const j = await prisma.player.findUnique({
    where: { qrToken: params.token },
    select: {
      id: true, firstName: true, lastName: true, number: true, position: true, estado: true, birthDate: true, cedula: true, teamId: true,
      team: { select: { name: true, logo: true } },
      images: { select: { kind: true, crop: true } },
    },
  })
  if (!j) return NextResponse.json({ ok: false, message: 'Carnet no encontrado' }, { status: 404 })

  let ficha = null
  try {
    const t = await prisma.torneo.findFirst({ where: { activo: true, publico: true }, orderBy: { createdAt: 'desc' }, select: { id: true } })
    const d = t ? await cargarTorneo(t.id) : null
    if (d) ficha = construirFicha(d, j.id, j.teamId)
  } catch { /* sin torneo todavía */ }

  const staff = await verifyAuth()
  const esAdmin = staff?.rol === 'admin'
  const selfie = j.images.find((i) => i.kind === 'selfie')
  const suspendidoPorSancion = (ficha?.suspendidoPartidos ?? 0) > 0
  const cedula = j.cedula || ''

  return NextResponse.json({
    ok: true,
    nombres: j.firstName, apellidos: j.lastName, numero: j.number, posicion: j.position, club: j.team.name,
    edad: edadDe(j.birthDate),
    escudo: j.team.logo && j.team.logo.startsWith('data:') ? j.team.logo : null,
    estado: j.estado === 'suspendido' || suspendidoPorSancion ? 'suspendido' : j.estado,
    suspendidoPorSancion,
    tieneFoto: !!selfie,
    crop: selfie?.crop ?? null,
    cedulaOculta: cedula ? `${cedula.slice(0, 4)}•••${cedula.slice(-3)}` : '',
    ficha,
    control: staff
      ? {
          rol: staff.rol,
          fechaNacimiento: j.birthDate,
          documentos: { selfie: !!selfie, cedulaFrente: j.images.some((i) => i.kind === 'cedula_front'), cedulaReverso: j.images.some((i) => i.kind === 'cedula_back') },
          ...(esAdmin ? { cedula, jugadorId: j.id, usuario: staff.email } : {}),
        }
      : null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
