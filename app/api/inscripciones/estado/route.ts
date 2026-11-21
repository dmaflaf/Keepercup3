import { NextRequest, NextResponse } from 'next/server'
import { leerEstado, vigentes } from '@/lib/inscripciones'

export const dynamic = 'force-dynamic'

// Público: ¿están abiertas las inscripciones? Con ?codigo= dice si ese código de autorización está vigente (y para qué club).
// Nunca lista los códigos.
export async function GET(req: NextRequest) {
  const e = await leerEstado()
  const codigo = (req.nextUrl.searchParams.get('codigo') || '').trim().toUpperCase()
  const a = codigo ? vigentes(e).find((x) => x.codigo === codigo) : undefined
  return NextResponse.json({ ok: true, abiertas: e.abiertas, autorizado: a ? { equipo: a.equipo, hasta: a.hasta } : null }, { headers: { 'Cache-Control': 'no-store' } })
}
