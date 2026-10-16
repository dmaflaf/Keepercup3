import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomInt } from 'crypto'
import { prisma } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })

// Clave legible (sin letras confusas como 0/O o 1/l)
const ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const claveNueva = () => Array.from({ length: 10 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('')

async function admin() {
  const u = await verifyAuth()
  return u && u.rol === 'admin' ? u : null
}

// Gestión de usuarios (solo administrador). Las claves se guardan cifradas: nadie puede leerlas; solo se pueden restablecer.
export async function GET() {
  if (!(await admin())) return falla('Solo el administrador', 403)
  const usuarios = await prisma.user.findMany({ orderBy: [{ rol: 'asc' }, { nombre: 'asc' }], select: { id: true, email: true, nombre: true, rol: true, activo: true, createdAt: true } })
  return NextResponse.json({ ok: true, usuarios })
}

export async function POST(req: NextRequest) {
  const yo = await admin()
  if (!yo) return falla('Solo el administrador', 403)
  const b = await req.json().catch(() => null)
  if (!b) return falla('Solicitud inválida')

  if (b.accion === 'crear') {
    const email = String(b.email || '').trim().toLowerCase()
    const nombre = String(b.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 80)
    const rol = b.rol === 'admin' ? 'admin' : 'vocal'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return falla('Escribe un correo válido (puede ser inventado, por ejemplo vocal1@keeper.ec)')
    if (!nombre) return falla('Escribe el nombre de la persona o del dispositivo (ej. «iPad cancha 1»)')
    if (await prisma.user.findUnique({ where: { email } })) return falla('Ya existe un usuario con ese correo')
    const clave = typeof b.password === 'string' && b.password.length > 0 ? b.password : claveNueva()
    if (clave.length < 8) return falla('La clave debe tener al menos 8 caracteres')
    await prisma.user.create({ data: { email, nombre, rol, activo: true, passwordHash: await bcrypt.hash(clave, 10) } })
    return NextResponse.json({ ok: true, email, clave })
  }

  const u = await prisma.user.findUnique({ where: { id: String(b.id) } })
  if (!u) return falla('Usuario no encontrado', 404)

  if (b.accion === 'clave') {
    const clave = typeof b.password === 'string' && b.password.length > 0 ? b.password : claveNueva()
    if (clave.length < 8) return falla('La clave debe tener al menos 8 caracteres')
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(clave, 10) } })
    return NextResponse.json({ ok: true, email: u.email, clave })
  }

  if (b.accion === 'activo') {
    const activo = !!b.activo
    if (!activo && u.id === yo.id) return falla('No puedes desactivar tu propia cuenta')
    if (!activo && u.rol === 'admin' && (await prisma.user.count({ where: { rol: 'admin', activo: true, NOT: { id: u.id } } })) === 0) return falla('Debe quedar al menos un administrador activo')
    await prisma.user.update({ where: { id: u.id }, data: { activo } })
    return NextResponse.json({ ok: true })
  }

  if (b.accion === 'editar') {
    const nombre = String(b.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 80)
    if (!nombre) return falla('El nombre no puede quedar vacío')
    const rol = b.rol === 'admin' ? 'admin' : 'vocal'
    if (rol !== u.rol && u.id === yo.id) return falla('No puedes cambiar tu propio rol')
    if (rol !== 'admin' && u.rol === 'admin' && (await prisma.user.count({ where: { rol: 'admin', activo: true, NOT: { id: u.id } } })) === 0) return falla('Debe quedar al menos un administrador activo')
    await prisma.user.update({ where: { id: u.id }, data: { nombre, rol } })
    return NextResponse.json({ ok: true })
  }
  return falla('Acción desconocida')
}
