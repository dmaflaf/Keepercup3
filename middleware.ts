import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'keeper-secret-key-change-in-production')

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Rutas públicas (sin protección)
  if (pathname === '/' || pathname.startsWith('/registro') || pathname.startsWith('/carnets') || pathname.startsWith('/torneo') || pathname.startsWith('/j/') || pathname.startsWith('/api/carnet/') || pathname.startsWith('/api/torneo/publico')) {
    return NextResponse.next()
  }

  // Rutas de auth (login, crear admin)
  if (pathname === '/admin/login' || pathname === '/api/auth/login' || pathname === '/api/auth/logout') {
    return NextResponse.next()
  }

  // Las acciones del panel (/api/admin, /api/torneo/admin…) no se aceptan si vienen de OTRO sitio web:
  // evita que alguien te haga abrir un enlace o una página trampa que use tu sesión de administrador
  if ((pathname.startsWith('/api/admin') || pathname.startsWith('/api/torneo/admin') || pathname.startsWith('/api/torneo/planilla')) && request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ ok: false, message: 'Solicitud bloqueada: ábrela desde el panel de keeper.com.ec' }, { status: 403 })
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
