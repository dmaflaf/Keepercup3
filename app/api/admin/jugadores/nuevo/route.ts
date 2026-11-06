import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import sharp from 'sharp'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'
import { cedulaEcuatorianaValida as cedulaEcuador, normCedula } from '@/lib/importar'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MAX_POR_CLUB = 40
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })
const texto = (v: FormDataEntryValue | null, n = 60) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, n)

// Datos para el formulario: clubes con su cantidad de jugadores y números ocupados. Solo administrador.
export async function GET() {
  const u = await verifyAuth()
  if (!u || u.rol !== 'admin') return falla('Solo el administrador', 403)
  const [clubes, jugadores] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.player.findMany({ select: { teamId: true, number: true } }),
  ])
  return NextResponse.json({ ok: true, max: MAX_POR_CLUB, clubes: clubes.map((c) => { const suyos = jugadores.filter((j) => j.teamId === c.id); return { id: c.id, nombre: c.name, total: suyos.length, numeros: suyos.map((j) => j.number).filter((n) => n !== null).sort((a, b) => (a as number) - (b as number)) } }) })
}

// Agrega UN jugador nuevo a un club, con sus fotos. Solo administrador y confirmando con su contraseña.
export async function POST(req: NextRequest) {
  const u = await verifyAuth()
  if (!u || u.rol !== 'admin') return falla('Solo el administrador', 403)
  const f = await req.formData().catch(() => null)
  if (!f) return falla('Solicitud inválida')

  const admin = await prisma.user.findUnique({ where: { id: u.id }, select: { passwordHash: true } })
  if (!admin || !(await bcrypt.compare(String(f.get('password') || ''), admin.passwordHash))) return falla('La contraseña no es correcta.', 401)

  const club = await prisma.team.findUnique({ where: { id: String(f.get('equipoId') || '') }, select: { id: true, name: true } })
  if (!club) return falla('Elige el club.')
  const firstName = texto(f.get('nombres')), lastName = texto(f.get('apellidos'))
  if (!firstName || !lastName) return falla('Escribe nombres y apellidos.')
  const extranjero = f.get('extranjero') === '1'
  const cedula = extranjero ? texto(f.get('cedula'), 20).toUpperCase().replace(/[^A-Z0-9]/g, '') : normCedula(String(f.get('cedula') || ''))
  if (!cedula) return falla('Escribe la cédula o pasaporte.')
  if (!extranjero && !cedulaEcuador(cedula)) return falla('La cédula no es válida. Si es extranjero, marca «Pasaporte / documento extranjero».')
  if (extranjero && cedula.length < 5) return falla('El documento es demasiado corto.')
  const nacimiento = String(f.get('nacimiento') || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nacimiento)) return falla('Elige la fecha de nacimiento.')
  const edad = (Date.now() - new Date(nacimiento + 'T00:00:00Z').getTime()) / (365.25 * 86400000)
  if (edad < 12 || edad > 80) return falla('Revisa la fecha de nacimiento.')
  const numTxt = String(f.get('numero') || '').trim()
  const number = numTxt === '' ? null : Number(numTxt)
  if (number !== null && (!Number.isInteger(number) || number < 0 || number > 999)) return falla('Número de camiseta inválido.')

  const otro = await prisma.player.findFirst({ where: { cedula }, select: { firstName: true, lastName: true, team: { select: { name: true } } } })
  if (otro) return falla(`Esa cédula ya está registrada: ${otro.firstName} ${otro.lastName} en ${otro.team.name}. Si cambia de club, usa Traspasos.`)
  if (number !== null && (await prisma.player.findFirst({ where: { teamId: club.id, number } }))) return falla(`El número ${number} ya está ocupado en ${club.name}.`)
  const total = await prisma.player.count({ where: { teamId: club.id } })
  if (total >= MAX_POR_CLUB && f.get('superarTope') !== '1') return falla(`${club.name} ya tiene ${total} jugadores (tope ${MAX_POR_CLUB}). Marca «Superar el tope» si está autorizado.`, 409)

  // Fotos (opcionales): se reducen y guardan como en la carga de clubes
  const fotos: { kind: string; data: Buffer }[] = []
  for (const kind of ['selfie', 'cedula_front', 'cedula_back']) {
    const a = f.get(kind)
    if (!(a instanceof File) || !a.size) continue
    if (a.size > 12 * 1024 * 1024) return falla('Una foto es demasiado grande (máx. 12 MB).', 413)
    try {
      const lado = kind === 'selfie' ? 800 : 1200
      fotos.push({ kind, data: await sharp(Buffer.from(await a.arrayBuffer())).rotate().resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: kind === 'selfie' ? 80 : 76 }).toBuffer() })
    } catch { return falla('No se pudo leer una de las fotos. Usa JPG o PNG.', 422) }
  }

  const j = await prisma.player.create({
    data: {
      teamId: club.id, firstName, lastName, cedula, number, birthDate: nacimiento,
      position: texto(f.get('posicion'), 30) || null, phone: texto(f.get('telefono'), 20) || null,
      estado: 'pendiente', editadoManual: true, qrToken: randomBytes(16).toString('base64url'),
      images: { create: fotos.map((x) => ({ kind: x.kind, sourceId: 'manual', mime: 'image/jpeg', data: x.data, bytes: x.data.length })) },
    },
    select: { id: true, qrToken: true },
  })
  return NextResponse.json({ ok: true, id: j.id, qr: j.qrToken, club: club.name, nombre: `${firstName} ${lastName}`, fotos: fotos.length })
}
