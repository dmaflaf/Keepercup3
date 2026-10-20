import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { recorteAPixeles } from '@/lib/encuadre'
import { edadDe } from '@/lib/ficha'
import { construirNomina, JugadorNomina } from '@/lib/nomina-pdf'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function archivo(origin: string, ruta: string) { const r = await fetch(`${origin}${ruta}`); if (!r.ok) throw new Error(ruta); return new Uint8Array(await r.arrayBuffer()) }
const dePng = (v?: string | null) => (v && v.startsWith('data:image/png;base64,') ? Buffer.from(v.split(',')[1], 'base64') : null)

// Nómina oficial del club en PDF (solo administrador)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const no = await exigirAdmin()
  if (no) return no
  const t = await prisma.team.findUnique({ where: { id: params.id }, select: { name: true, city: true, directorName: true, contactPhone: true, assistantPhone: true, logo: true } })
  if (!t) return NextResponse.json({ ok: false, message: 'Club no encontrado' }, { status: 404 })
  const filas = await prisma.player.findMany({
    where: { teamId: params.id }, orderBy: [{ number: 'asc' }, { lastName: 'asc' }],
    select: { number: true, firstName: true, lastName: true, cedula: true, birthDate: true, position: true, phone: true, estado: true, images: { where: { kind: 'selfie' }, select: { data: true, crop: true } } },
  })
  const jugadores: JugadorNomina[] = []
  // Foto pequeña (encuadre automático si existe), de a pocas para no saturar la memoria
  for (let i = 0; i < filas.length; i += 8) {
    const lote = await Promise.all(filas.slice(i, i + 8).map(async (j) => {
      let foto: Buffer | null = null
      const im = j.images[0]
      if (im) {
        try {
          let base = sharp(Buffer.from(im.data)).rotate()
          const c = im.crop as { x: number; y: number; w: number; h: number } | null
          if (c) { const n = await base.toBuffer({ resolveWithObject: true }); base = sharp(n.data).extract(recorteAPixeles(c, n.info.width, n.info.height)) }
          foto = await base.resize(112, 136, { fit: 'cover', position: 'attention' }).jpeg({ quality: 78 }).toBuffer()
        } catch { foto = null }
      }
      return { numero: j.number, apellidos: j.lastName, nombres: j.firstName, cedula: j.cedula || '', nacimiento: j.birthDate, edad: edadDe(j.birthDate), posicion: j.position || '', telefono: j.phone || '', estado: j.estado, foto } satisfies JugadorNomina
    }))
    jugadores.push(...lote)
  }
  const origin = req.nextUrl.origin
  const [normal, negrita] = await Promise.all([archivo(origin, '/fonts/RobotoCondensed_400Regular.ttf'), archivo(origin, '/fonts/RobotoCondensed_700Bold.ttf')])
  const generado = `Generada el ${new Date(Date.now() - 5 * 3600 * 1000).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })}`
  const pdf = await construirNomina({ club: t.name, ciudad: t.city === '-' ? '' : t.city, director: t.directorName === '-' ? '' : t.directorName, telefono: t.contactPhone || t.assistantPhone || '', escudo: dePng(t.logo), jugadores, generado, fuentes: { normal, negrita } })
  return new NextResponse(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="nomina-${t.name.replace(/[^a-z0-9]+/gi, '-')}.pdf"`, 'Cache-Control': 'no-store' } })
}
