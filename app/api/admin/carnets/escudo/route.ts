import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

// Guarda el escudo de un club (PNG reducido) para los carnets.
export async function POST(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  try {
    const f = await req.formData()
    const equipo = String(f.get('equipo') || '')
    const archivo = f.get('file')
    if (!equipo || !(archivo instanceof File)) return NextResponse.json({ ok: false, message: 'Datos incompletos' }, { status: 400 })
    if (archivo.size > 4 * 1024 * 1024) return NextResponse.json({ ok: false, message: 'Imagen demasiado grande' }, { status: 413 })
    const png = await sharp(Buffer.from(await archivo.arrayBuffer())).rotate().resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer()
    await prisma.team.update({ where: { name: equipo }, data: { logo: `data:image/png;base64,${png.toString('base64')}` } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, message: 'No se pudo procesar la imagen' }, { status: 422 })
  }
}

export async function DELETE(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  await prisma.team.updateMany({ where: { name: req.nextUrl.searchParams.get('equipo') || '' }, data: { logo: null } })
  return NextResponse.json({ ok: true })
}
