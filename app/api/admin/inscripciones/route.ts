import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'
import { guardarEstado, guardarRetenidos, leerEstado, leerRetenidos, nuevoCodigo, vigentes } from '@/lib/inscripciones'

export const dynamic = 'force-dynamic'
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })

async function admin() { const u = await verifyAuth(); return u && u.rol === 'admin' ? u : null }

export async function GET() {
  if (!(await admin())) return falla('Solo el administrador', 403)
  const [e, ret, clubes] = await Promise.all([leerEstado(), leerRetenidos(), prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })])
  // Jugadores que entraron después del cierre (para revisarlos)
  const desde = e.cierre ? new Date(e.cierre) : null
  const recientes = desde ? await prisma.player.findMany({ where: { createdAt: { gt: desde } }, orderBy: { createdAt: 'desc' }, take: 300, select: { id: true, firstName: true, lastName: true, number: true, createdAt: true, editadoManual: true, team: { select: { name: true } } } }) : []
  return NextResponse.json({
    ok: true, abiertas: e.abiertas, cierre: e.cierre, autorizaciones: vigentes(e), clubes, retenidos: ret,
    recientes: recientes.map((j) => ({ id: j.id, nombre: `${j.firstName} ${j.lastName}`, numero: j.number, equipo: j.team.name, creado: j.createdAt, manual: j.editadoManual })),
  })
}

export async function POST(req: NextRequest) {
  const u = await admin()
  if (!u) return falla('Solo el administrador', 403)
  const b = await req.json().catch(() => null)
  if (!b) return falla('Solicitud inválida')
  const yo = await prisma.user.findUnique({ where: { id: u.id }, select: { passwordHash: true } })
  if (!yo || !(await bcrypt.compare(String(b.password || ''), yo.passwordHash))) return falla('La contraseña no es correcta.', 401)
  const e = await leerEstado()

  if (b.accion === 'cerrar' || b.accion === 'abrir') {
    e.abiertas = b.accion === 'abrir'
    if (!e.abiertas) e.cierre = b.cierre && /^\d{4}-\d{2}-\d{2}/.test(String(b.cierre)) ? new Date(String(b.cierre)).toISOString() : new Date().toISOString()
    await guardarEstado(e)
    return NextResponse.json({ ok: true })
  }
  if (b.accion === 'autorizar') {
    const club = await prisma.team.findUnique({ where: { id: String(b.teamId) }, select: { id: true, name: true } })
    if (!club) return falla('Elige el club')
    const horas = Number(b.horas)
    if (!Number.isFinite(horas) || horas < 1 || horas > 168) return falla('Horas inválidas (1 a 168)')
    const a = { id: randomBytes(6).toString('hex'), teamId: club.id, equipo: club.name, codigo: nuevoCodigo(), hasta: new Date(Date.now() + horas * 3600_000).toISOString(), nota: String(b.nota || '').slice(0, 200), creada: new Date().toISOString() }
    e.autorizaciones = [...vigentes(e), a]
    await guardarEstado(e)
    return NextResponse.json({ ok: true, autorizacion: a })
  }
  if (b.accion === 'revocar') {
    e.autorizaciones = vigentes(e).filter((a) => a.id !== String(b.id))
    await guardarEstado(e)
    return NextResponse.json({ ok: true })
  }
  if (b.accion === 'aprobar' || b.accion === 'rechazar') {
    const lista = await leerRetenidos()
    const i = lista.findIndex((x) => x.cedula === String(b.cedula) && x.tipo === b.tipo)
    if (i < 0) return falla('Ya no está en la lista')
    const r = lista[i]
    if (b.accion === 'aprobar') {
      if (r.tipo === 'nuevo') {
        if (await prisma.player.findFirst({ where: { cedula: r.cedula } })) return falla('Ese jugador ya existe en el sistema.')
        const d = r.datos as Record<string, unknown>
        const libre = r.numero == null ? true : !(await prisma.player.findFirst({ where: { teamId: r.teamId, number: r.numero } }))
        await prisma.player.create({ data: { firstName: String(d.firstName || ''), lastName: String(d.lastName || ''), position: (d.position as string) || null, birthDate: (d.birthDate as string) || null, email: (d.email as string) || null, phone: (d.phone as string) || null, cedula: r.cedula, number: libre ? r.numero : null, teamId: r.teamId, qrToken: randomBytes(16).toString('base64url'), selfieUrl: (d.selfieUrl as string) || undefined, cedulaFrontUrl: (d.cedulaFrontUrl as string) || undefined, cedulaBackUrl: (d.cedulaBackUrl as string) || undefined } })
        lista.splice(i, 1); await guardarRetenidos(lista)
        return NextResponse.json({ ok: true, message: libre ? 'Jugador creado.' : `Jugador creado SIN número: el ${r.numero} ya está ocupado en ${r.equipo}.` })
      }
      const j = await prisma.player.findFirst({ where: { cedula: r.cedula } })
      if (!j) return falla('El jugador ya no existe.')
      if (j.teamId !== r.teamId) return falla(`Es un cambio de club (${r.equipoPrevio} → ${r.equipo}): hazlo en Traspasos.`)
      if (r.numero != null && (await prisma.player.findFirst({ where: { teamId: j.teamId, number: r.numero, id: { not: j.id } } }))) return falla(`El número ${r.numero} ya lo tiene otro jugador de ${r.equipo}.`)
      await prisma.player.update({ where: { id: j.id }, data: { number: r.numero } })
    }
    lista.splice(i, 1); await guardarRetenidos(lista)
    return NextResponse.json({ ok: true })
  }
  return falla('Acción desconocida')
}
