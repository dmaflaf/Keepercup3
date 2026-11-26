import { NextRequest, NextResponse } from 'next/server'
import { generarReporte } from '@/lib/reportes-generar'
import { sesionPortal } from '@/lib/portal'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Reporte del club en PDF (partidos, tarjetas con su fecha, cuenta y pagos), para su DT
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const { club, ok } = await sesionPortal(params.token)
  if (!club || !ok) return NextResponse.json({ ok: false, message: 'Entra con tu cédula primero.' }, { status: 401 })
  return generarReporte(new NextRequest(new URL(`/api/admin/reportes?tipo=club&equipo=${club.id}&dinero=1`, req.nextUrl.origin)))
}
