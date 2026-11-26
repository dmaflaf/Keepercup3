import { NextRequest } from 'next/server'
import { exigirAdmin } from '@/lib/sorteo'
import { generarNomina } from '@/lib/nomina-club'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Nómina oficial del club en PDF (solo administrador)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const no = await exigirAdmin()
  if (no) return no
  return generarNomina(req, params)
}
