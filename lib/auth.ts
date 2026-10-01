import { jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'keeper-secret-key-change-in-production')

export interface TokenPayload {
  id: string
  email: string
  rol: 'admin' | 'vocal'
  iat: number
  exp: number
}

export async function verifyAuth(): Promise<TokenPayload | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('auth-token')?.value

    if (!token) {
      return null
    }

    const verified = await jwtVerify(token, secret)
    return verified.payload as TokenPayload
  } catch (err) {
    return null
  }
}

export function isAdmin(rol: string): boolean {
  return rol === 'admin'
}

export function isVocal(rol: string): boolean {
  return rol === 'vocal'
}

export function canManageGoles(rol: string): boolean {
  return rol === 'admin' || rol === 'vocal'
}

export function canEditFixture(rol: string): boolean {
  return rol === 'admin'
}

export function canDeleteFixture(rol: string): boolean {
  return rol === 'admin'
}
