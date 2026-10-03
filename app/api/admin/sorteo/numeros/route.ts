import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { prisma } from '@/lib/db'
import { esColor, exigirAdmin, generarCodigo, leerConfig } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

// Carga números ganadores a un premio: lista pegada (numeros) o al azar (azar: cantidad).
export async function POST(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const b = await req.json().catch(() => ({}))
  const premio = await prisma.sorteoPremio.findUnique({ where: { id: String(b.premioId || '') } })
  if (!premio) return NextResponse.json({ ok: false, message: 'Premio no encontrado' }, { status: 404 })
  if (!esColor(b.color)) return NextResponse.json({ ok: false, message: 'Elige el color del boleto' }, { status: 400 })
  const color = b.color
  const cfg = await leerConfig()

  let lista: number[] = []
  if (b.azar) {
    const cant = Number(b.azar)
    if (!Number.isInteger(cant) || cant < 1 || cant > 500) return NextResponse.json({ ok: false, message: 'Cantidad inválida (1 a 500)' }, { status: 400 })
    const ocupados = new Set<number>([
      ...(await prisma.sorteoNumero.findMany({ where: { color }, select: { numero: true } })).map((n) => n.numero),
      ...(await prisma.sorteoBoleto.findMany({ where: { color }, select: { numero: true } })).map((n) => n.numero),
    ])
    if (cfg.rangoMax - ocupados.size < cant) return NextResponse.json({ ok: false, message: 'No quedan suficientes números libres en el rango' }, { status: 400 })
    const elegidos = new Set<number>()
    while (elegidos.size < cant) {
      const n = randomInt(1, cfg.rangoMax + 1)
      if (!ocupados.has(n)) elegidos.add(n)
    }
    lista = Array.from(elegidos)
  } else {
    lista = String(b.numeros || '').split(/[\s,;]+/).filter(Boolean).map(Number)
    if (!lista.length) return NextResponse.json({ ok: false, message: 'Pega al menos un número' }, { status: 400 })
    const malos = lista.filter((n) => !Number.isInteger(n) || n < 1 || n > cfg.rangoMax)
    if (malos.length) return NextResponse.json({ ok: false, message: `Números fuera de rango (1 a ${cfg.rangoMax}): ${malos.slice(0, 5).join(', ')}` }, { status: 400 })
    lista = Array.from(new Set(lista))
  }

  let creados = 0
  const repetidos: number[] = []
  const yaRegistrados: { numero: number; nombres: string; correo: string; codigoCobro: string }[] = []
  for (const numero of lista) {
    try {
      const boleto = await prisma.sorteoBoleto.findUnique({ where: { color_numero: { color, numero } } })
      const cobro = boleto ? generarCodigo(8) : null
      await prisma.sorteoNumero.create({
        data: {
          premioId: premio.id, color, numero, origen: 'instantaneo',
          ...(boleto ? { estado: 'ganado', boletoId: boleto.id, codigoCobro: cobro, ganadoAt: new Date() } : {}),
        },
      })
      creados++
      if (boleto && cobro) yaRegistrados.push({ numero, nombres: boleto.nombres, correo: boleto.correo, codigoCobro: cobro })
    } catch {
      repetidos.push(numero)
    }
  }
  return NextResponse.json({ ok: true, creados, repetidos, yaRegistrados })
}

export async function DELETE(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const id = req.nextUrl.searchParams.get('id') || ''
  const r = await prisma.sorteoNumero.deleteMany({ where: { id, estado: 'pendiente' } })
  if (!r.count) return NextResponse.json({ ok: false, message: 'Solo se pueden quitar números que aún no han ganado.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
