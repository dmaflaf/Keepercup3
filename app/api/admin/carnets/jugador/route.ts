import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { cedulaEcuatorianaValida, normCedula } from '@/lib/importar'

export const dynamic = 'force-dynamic'

const POSICIONES = ['', 'Portero', 'Defensa', 'Mediocampista', 'Delantero']
const ESTADOS = ['pendiente', 'habilitado', 'suspendido']
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })
const limpiar = (v: unknown, max: number) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)

function fechaISO(raw: string): string | null {
  if (!raw) return ''
  let y: number, m: number, d: number
  let r = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (r) { y = +r[1]; m = +r[2]; d = +r[3] } else {
    r = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    if (!r) return null
    d = +r[1]; m = +r[2]; y = +r[3]
  }
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 1940 || y > new Date().getUTCFullYear()) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${y}-${p(m)}-${p(d)}`
}

export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const j = await prisma.player.findUnique({
    where: { id: req.nextUrl.searchParams.get('id') || '' },
    select: { id: true, firstName: true, lastName: true, cedula: true, number: true, position: true, birthDate: true, email: true, phone: true, estado: true, editadoManual: true, team: { select: { name: true } } },
  })
  if (!j) return falla('Jugador no encontrado', 404)
  return NextResponse.json({ ok: true, jugador: { ...j, equipo: j.team.name, team: undefined } })
}

// Corrige a mano los datos de un jugador. Lo que se cambia aquí manda sobre la hoja de Google (no se vuelve a pisar al sincronizar).
export async function PATCH(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const b = await req.json().catch(() => null)
  if (!b?.id) return falla('Falta el jugador')
  const j = await prisma.player.findUnique({ where: { id: String(b.id) }, select: { id: true, cedula: true, teamId: true, number: true, firstName: true, lastName: true } })
  if (!j) return falla('Jugador no encontrado', 404)

  const data: Prisma.PlayerUpdateInput = {}
  const avisos: string[] = []

  const nombres = limpiar(b.firstName, 80), apellidos = limpiar(b.lastName, 80)
  if (!nombres || !apellidos) return falla('Nombres y apellidos son obligatorios')
  data.firstName = nombres; data.lastName = apellidos

  const cedula = normCedula(String(b.cedula ?? ''))
  if (!/^\d{10}$/.test(cedula)) return falla('La cédula debe tener 10 dígitos')
  if (!cedulaEcuatorianaValida(cedula)) avisos.push('La cédula no pasa la validación oficial (revisa los dígitos). Se guardó igual.')
  let cedulaCambio = false
  if (cedula !== j.cedula) {
    const otro = await prisma.player.findFirst({ where: { cedula, NOT: { id: j.id } }, select: { team: { select: { name: true } }, firstName: true, lastName: true } })
    if (otro) return falla(`Esa cédula ya pertenece a ${otro.firstName} ${otro.lastName} (${otro.team.name}).`, 409)
    data.cedula = cedula
    cedulaCambio = true
  }

  const numRaw = String(b.number ?? '').trim()
  if (numRaw === '') data.number = null
  else {
    const n = Number(numRaw)
    if (!Number.isInteger(n) || n < 0 || n > 999) return falla('El número debe estar entre 0 y 999')
    if (n !== j.number) {
      const otro = await prisma.player.findFirst({ where: { teamId: j.teamId, number: n, NOT: { id: j.id } }, select: { firstName: true, lastName: true } })
      if (otro) return falla(`El número ${n} ya lo tiene ${otro.firstName} ${otro.lastName} en este equipo.`, 409)
    }
    data.number = n
  }

  const nac = fechaISO(limpiar(b.birthDate, 12))
  if (nac === null) return falla('Fecha de nacimiento inválida (usa AAAA-MM-DD o DD/MM/AAAA)')
  data.birthDate = nac || null

  const pos = limpiar(b.position, 20)
  if (!POSICIONES.includes(pos)) return falla('Posición inválida')
  data.position = pos || null

  const correo = limpiar(b.email, 120).toLowerCase()
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) return falla('Correo inválido')
  data.email = correo || null
  const tel = limpiar(b.phone, 20).replace(/[^\d+]/g, '')
  data.phone = tel || null

  if (b.estado !== undefined) {
    if (!ESTADOS.includes(b.estado)) return falla('Estado inválido')
    data.estado = b.estado
  }
  data.editadoManual = true
  if (b.regenerarQr) data.qrToken = randomBytes(16).toString('base64url')

  try {
    await prisma.$transaction(async (tx) => {
      await tx.player.update({ where: { id: j.id }, data })
      // La cédula anterior queda como alias para que la sincronización no cree un duplicado con el dato erróneo
      if (cedulaCambio && j.cedula) await tx.playerAlias.upsert({ where: { cedula: j.cedula }, update: { playerId: j.id }, create: { cedula: j.cedula, playerId: j.id } })
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return falla('Ya existe un jugador con ese número o cédula en el equipo.', 409)
    console.error('Edición de jugador fallida', e)
    return falla('No se pudo guardar', 500)
  }
  return NextResponse.json({ ok: true, avisos, qrRegenerado: !!b.regenerarQr })
}
