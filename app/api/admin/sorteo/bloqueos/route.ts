import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

// Bloquea un teléfono (y los dispositivos con que se registró). Con liberar=true, borra sus boletos para que sus números
// puedan registrarse por sus dueños reales; un premio ganado y no entregado vuelve a quedar pendiente.
export async function POST(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const b = await req.json().catch(() => ({}))
  const telefono = String(b.telefono || '').trim()
  if (!/^09\d{8}$/.test(telefono)) return NextResponse.json({ ok: false, message: 'Teléfono inválido' }, { status: 400 })
  const motivo = String(b.motivo || 'Registró números que no le pertenecen').slice(0, 200)

  const boletos = await prisma.sorteoBoleto.findMany({ where: { telefono }, include: { ganador: true } })
  const dispositivos = Array.from(new Set(boletos.map((x) => x.deviceId).filter(Boolean) as string[]))
  for (const [tipo, valor] of [['telefono', telefono], ...dispositivos.map((d) => ['dispositivo', d])]) {
    await prisma.sorteoBloqueo.upsert({ where: { tipo_valor: { tipo, valor } }, update: { motivo }, create: { tipo, valor, motivo } })
  }

  let liberados = 0
  if (b.liberar) {
    for (const x of boletos) {
      if (x.ganador && x.ganador.estado === 'entregado') continue // ya se entregó: no se toca
      await prisma.$transaction(async (tx) => {
        if (x.ganador) {
          if (x.ganador.origen === 'tombola') await tx.sorteoNumero.delete({ where: { id: x.ganador.id } })
          else await tx.sorteoNumero.update({ where: { id: x.ganador.id }, data: { estado: 'pendiente', boletoId: null, codigoCobro: null, ganadoAt: null } })
        }
        await tx.sorteoBoleto.delete({ where: { id: x.id } })
      })
      liberados++
    }
  }
  return NextResponse.json({ ok: true, boletos: boletos.length, liberados })
}

export async function DELETE(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  await prisma.sorteoBloqueo.deleteMany({ where: { id: req.nextUrl.searchParams.get('id') || '' } })
  return NextResponse.json({ ok: true })
}
