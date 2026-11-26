// Portal del DT: cada club tiene un enlace privado (/dt/<token>) y el DT entra además con SU cédula.
// La sesión del portal es una cookie propia (12 horas), separada de la del panel de administración.
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/db'

const secreto = new TextEncoder().encode((process.env.JWT_SECRET || 'keeper-secret-key-change-in-production') + ':portal-dt')
const COOKIE = 'portal-dt'
export const nuevoTokenPortal = () => randomBytes(18).toString('base64url')
export const tokenValido = (t: string) => /^[A-Za-z0-9_-]{20,40}$/.test(t)

export async function clubDelPortal(token: string) {
  if (!tokenValido(token)) return null
  return prisma.team.findFirst({ where: { portalToken: token }, select: { id: true, name: true, city: true, directorName: true, directorCedula: true, logo: true } })
}

// La sesión dura 30 días en ese celular y queda atada al enlace: si el organizador cambia el enlace, hay que volver a entrar
const DIAS = 30
const huella = (token: string) => createHash('sha256').update(token).digest('base64url').slice(0, 16)
export async function crearSesion(teamId: string, token: string) {
  const jwt = await new SignJWT({ teamId, k: huella(token) }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${DIAS}d`).sign(secreto)
  return { nombre: COOKIE, valor: jwt, opciones: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: DIAS * 86400 } }
}

/** El club del enlace, solo si el DT ya entró con su cédula en este navegador. */
export async function sesionPortal(token: string) {
  const club = await clubDelPortal(token)
  if (!club) return { club: null, ok: false }
  try {
    const v = (await cookies()).get(COOKIE)?.value
    if (!v) return { club, ok: false }
    const { payload } = await jwtVerify(v, secreto)
    return { club, ok: payload.teamId === club.id && payload.k === huella(token) }
  } catch { return { club, ok: false } }
}

// Límite de intentos de cédula: 8 por IP cada 15 minutos
const CLAVE = 'seguridad:portal_intentos', MAX = 8, VENTANA = 15 * 60 * 1000
export async function demasiadosIntentos(ip: string) {
  const a = await prisma.ajuste.findUnique({ where: { key: CLAVE } })
  let m: Record<string, number[]> = {}; try { m = a ? JSON.parse(a.value) : {} } catch { m = {} }
  return (m[ip] || []).filter((t) => Date.now() - t < VENTANA).length >= MAX
}
export async function registrarIntento(ip: string, fallo: boolean) {
  const a = await prisma.ajuste.findUnique({ where: { key: CLAVE } })
  let m: Record<string, number[]> = {}; try { m = a ? JSON.parse(a.value) : {} } catch { m = {} }
  const ahora = Date.now()
  for (const k of Object.keys(m)) { m[k] = m[k].filter((t) => ahora - t < VENTANA); if (!m[k].length) delete m[k] }
  if (fallo) m[ip] = [...(m[ip] || []), ahora]; else delete m[ip]
  await prisma.ajuste.upsert({ where: { key: CLAVE }, create: { key: CLAVE, value: JSON.stringify(m) }, update: { value: JSON.stringify(m) } })
}
