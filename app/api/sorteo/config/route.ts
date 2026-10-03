import { NextResponse } from 'next/server'
import { leerConfig } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const c = await leerConfig()
    return NextResponse.json({ ok: true, ...c })
  } catch {
    return NextResponse.json({ ok: false, message: 'No disponible' }, { status: 503 })
  }
}
