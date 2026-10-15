import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

// Logos de auspiciantes del dorso (hasta 4, iguales para todos los carnets).
export async function POST(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  try {
    const f = await req.formData()
    const slot = Number(f.get('slot'))
    const archivo = f.get('file')
    if (![1, 2, 3, 4].includes(slot) || !(archivo instanceof File)) return NextResponse.json({ ok: false, message: 'Datos incompletos' }, { status: 400 })
    const png = await sharp(Buffer.from(await archivo.arrayBuffer())).rotate().resize({ width: 400, height: 240, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer()
    const value = `data:image/png;base64,${png.toString('base64')}`
    await prisma.ajuste.upsert({ where: { key: `aus_${slot}` }, update: { value }, create: { key: `aus_${slot}`, value } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, message: 'No se pudo procesar la imagen' }, { status: 422 })
  }
}

export async function DELETE(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  await prisma.ajuste.deleteMany({ where: { key: `aus_${Number(req.nextUrl.searchParams.get('slot'))}` } })
  return NextResponse.json({ ok: true })
}
