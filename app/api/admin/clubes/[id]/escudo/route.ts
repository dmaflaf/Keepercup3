import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

// Imagen del escudo para el listado de clubes
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const no = await exigirAdmin()
  if (no) return new NextResponse(null, { status: 403 })
  const t = await prisma.team.findUnique({ where: { id: params.id }, select: { logo: true } })
  const m = t?.logo?.match(/^data:(image\/[a-z+]+);base64,(.+)$/)
  if (!m) return new NextResponse(null, { status: 404 })
  return new NextResponse(new Uint8Array(Buffer.from(m[2], 'base64')), { headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=300' } })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const no = await exigirAdmin()
  if (no) return no
  try {
    const f = await req.formData()
    const archivo = f.get('file')
    if (!(archivo instanceof File)) return NextResponse.json({ ok: false, message: 'Elige una imagen' }, { status: 400 })
    if (archivo.size > 4 * 1024 * 1024) return NextResponse.json({ ok: false, message: 'Imagen demasiado grande' }, { status: 413 })
    const png = await sharp(Buffer.from(await archivo.arrayBuffer())).rotate().resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer()
    await prisma.team.update({ where: { id: params.id }, data: { logo: `data:image/png;base64,${png.toString('base64')}` } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, message: 'No se pudo procesar la imagen' }, { status: 422 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const no = await exigirAdmin()
  if (no) return no
  await prisma.team.update({ where: { id: params.id }, data: { logo: null } })
  return NextResponse.json({ ok: true })
}
