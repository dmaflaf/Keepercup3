import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

// Deja el sorteo como nuevo (para después de las pruebas): borra boletos, bloqueos y ganadores de tómbola,
// y devuelve los números ganadores cargados a "pendiente". Conserva premios, números cargados y configuración.
export async function POST(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const b = await req.json().catch(() => ({}))
  if (b.confirmar !== 'BORRAR') return NextResponse.json({ ok: false, message: 'Escribe BORRAR para confirmar' }, { status: 400 })
  const r = await prisma.$transaction(async (tx) => {
    const tomb = await tx.sorteoNumero.deleteMany({ where: { origen: 'tombola' } })
    const inst = await tx.sorteoNumero.updateMany({
      where: { origen: 'instantaneo', NOT: { estado: 'pendiente' } },
      data: { estado: 'pendiente', boletoId: null, codigoCobro: null, ganadoAt: null, entregadoAt: null },
    })
    const bol = await tx.sorteoBoleto.deleteMany({})
    const blo = await tx.sorteoBloqueo.deleteMany({})
    return { boletos: bol.count, bloqueos: blo.count, tombola: tomb.count, premiosReiniciados: inst.count }
  })
  return NextResponse.json({ ok: true, ...r })
}
