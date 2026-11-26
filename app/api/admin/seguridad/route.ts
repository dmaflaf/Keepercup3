import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Revisión rápida de seguridad (solo administrador): claves configuradas en Vercel y administradores existentes.
// Nunca devuelve el valor de una clave, solo si está bien configurada.
export async function GET() {
  const u = await verifyAuth()
  if (!u || u.rol !== 'admin') return NextResponse.json({ ok: false }, { status: 403 })
  const jwt = process.env.JWT_SECRET || ''
  const avisos: string[] = []
  if (!jwt) avisos.push('Falta JWT_SECRET en Vercel: las sesiones usan una clave de reserva que está escrita en el código público. Cualquiera podría fabricar una sesión de administrador. Créala YA (texto largo al azar) en Vercel → Settings → Environment Variables y vuelve a publicar.')
  else if (jwt.length < 32 || jwt === 'keeper-secret-key-change-in-production') avisos.push('JWT_SECRET es corta o conocida: cámbiala por un texto al azar de 40 caracteres o más.')
  const sync = process.env.SYNC_KEY || ''
  if (sync && sync.length < 24) avisos.push('SYNC_KEY es corta: usa 32 caracteres o más.')
  const admins = await prisma.user.findMany({ where: { rol: 'admin' }, orderBy: { createdAt: 'asc' }, select: { email: true, nombre: true, activo: true, createdAt: true } })
  return NextResponse.json({ ok: true, avisos, admins })
}
