import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'keeper-secret-key-change-in-production')

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Rutas públicas (sin protección)
  if (pathname === '/' || pathname.startsWith('/registro') || pathname.startsWith('/carnets') || pathname.startsWith('/torneo') || pathname.startsWith('/api/torneo/publico')) {
    return NextResponse.next()
  }

  // Rutas de auth (login, crear admin)
  if (pathname === '/admin/login' || pathname === '/api/auth/login' || pathname === '/api/auth/create-admin' || pathname === '/api/auth/logout') {
    return NextResponse.next()
  }

  // Rutas protegidas /admin
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('auth-token')?.value

    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    try {
      await jwtVerify(token, secret)
      return NextResponse.next()
    } catch (err) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
