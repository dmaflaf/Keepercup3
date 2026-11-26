import { NextRequest, NextResponse } from 'next/server'
import { generarNomina } from '@/lib/nomina-club'
import { sesionPortal } from '@/lib/portal'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Nómina oficial del club en PDF, para su DT (la misma que genera el administrador)
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const { club, ok } = await sesionPortal(params.token)
  if (!club || !ok) return NextResponse.json({ ok: false, message: 'Entra con tu cédula primero.' }, { status: 401 })
  return generarNomina(req, { id: club.id })
}
