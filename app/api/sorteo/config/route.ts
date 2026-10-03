import { NextResponse } from 'next/server'
import { leerConfig } from '@/lib/sorteo'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const c = await leerConfig()
    const eq = await prisma.team.findMany({ select: { name: true }, orderBy: { name: 'asc' } })
    return NextResponse.json({ ok: true, ...c, equipos: eq.map((e) => e.name) })
  } catch {
    return NextResponse.json({ ok: false, message: 'No disponible' }, { status: 503 })
  }
}
