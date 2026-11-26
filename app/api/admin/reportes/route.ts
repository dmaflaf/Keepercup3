import { NextRequest } from 'next/server'
import { exigirAdmin } from '@/lib/sorteo'
import { generarReporte } from '@/lib/reportes-generar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// PDF de reportes (solo administrador). ?tipo=resultados|sancionados|interno|club|clubes  &torneoId=  &equipo= (id del club)  &dinero=1
export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  return generarReporte(req)
}
