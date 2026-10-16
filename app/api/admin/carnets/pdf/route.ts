import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { construirPdf, Layout } from '@/lib/carnet'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const dePng = (v?: string | null) => (v && v.startsWith('data:image/png;base64,') ? Buffer.from(v.split(',')[1], 'base64') : null)

const cache = new Map<string, Uint8Array>()
async function archivo(origin: string, ruta: string): Promise<Uint8Array> {
  const hit = cache.get(ruta)
  if (hit) return hit
  const r = await fetch(`${origin}${ruta}`)
  if (!r.ok) throw new Error(`No se pudo leer ${ruta}`)
  const b = new Uint8Array(await r.arrayBuffer())
  cache.set(ruta, b)
  return b
}

async function layoutGuardado(): Promise<Partial<Layout> | undefined> {
  const a = await prisma.ajuste.findUnique({ where: { key: 'carnet_layout' } })
  try { return a ? (JSON.parse(a.value) as Partial<Layout>) : undefined } catch { return undefined }
}

// PDF A4 (9 carnets por hoja, frentes y dorsos) de un club.
// ?equipo=...  &ids=a,b (opcional)  &todos=1 (incluye no habilitados)  &muestra=1 (una hoja de prueba con datos ficticios)
export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const origin = req.nextUrl.origin
  const equipo = req.nextUrl.searchParams.get('equipo') || ''
  const muestra = req.nextUrl.searchParams.get('muestra') === '1'
  const ids = (req.nextUrl.searchParams.get('ids') || '').split(',').filter(Boolean)
  const todos = req.nextUrl.searchParams.get('todos') === '1'

  try {
    const [plantilla, negrita, normal, numero] = await Promise.all([
      archivo(origin, '/plantillas/carnet-26.pdf'), archivo(origin, '/fonts/RobotoCondensed_700Bold.ttf'),
      archivo(origin, '/fonts/RobotoCondensed_400Regular.ttf'), archivo(origin, '/fonts/BarlowCondensed_800ExtraBold.ttf'),
    ])
    const base = { plantilla, fuentes: { negrita, normal, numero }, layout: await layoutGuardado() }

    if (muestra) {
      const team = equipo ? await prisma.team.findUnique({ where: { name: equipo }, select: { name: true, logo: true } }) : null
      const pdf = await construirPdf({
        ...base, club: team?.name || 'Legacy FC', escudo: dePng(team?.logo),
        jugadores: [{ nombres: 'Damián Ismael', apellidos: 'Mafla Flores', cedula: '1003399134', fechaNacimiento: '1985-07-19', numero: 25, qrToken: 'MUESTRAMUESTRAMUESTRA1', selfie: null }],
      })
      return new NextResponse(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="muestra-carnet.pdf"' } })
    }

    const team = await prisma.team.findUnique({ where: { name: equipo }, select: { name: true, logo: true } })
    if (!team) return NextResponse.json({ ok: false, message: 'Club no encontrado' }, { status: 404 })
    const jugadores = await prisma.player.findMany({
      where: { team: { name: equipo }, ...(ids.length ? { id: { in: ids } } : todos ? {} : { estado: 'habilitado' }), qrToken: { not: null } },
      orderBy: [{ number: 'asc' }, { lastName: 'asc' }],
      select: { firstName: true, lastName: true, cedula: true, birthDate: true, number: true, qrToken: true, images: { where: { kind: 'selfie' }, select: { data: true, crop: true } } },
    })
    if (!jugadores.length) return NextResponse.json({ ok: false, message: 'No hay jugadores habilitados con código QR en este club' }, { status: 404 })

    const pdf = await construirPdf({
      ...base, club: team.name, escudo: dePng(team.logo),
      jugadores: jugadores.map((j) => ({ nombres: j.firstName, apellidos: j.lastName, cedula: j.cedula, fechaNacimiento: j.birthDate, numero: j.number, qrToken: j.qrToken as string, selfie: j.images[0] ? Buffer.from(j.images[0].data) : null, crop: (j.images[0]?.crop as { x: number; y: number; w: number; h: number } | null) ?? null })),
    })
    return new NextResponse(Buffer.from(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="carnets-${equipo.replace(/[^a-z0-9]+/gi, '-')}.pdf"` },
    })
  } catch (e) {
    console.error('PDF de carnets fallido', e)
    return NextResponse.json({ ok: false, message: 'No se pudo generar el PDF' }, { status: 500 })
  }
}
