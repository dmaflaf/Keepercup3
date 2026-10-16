import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

const KINDS = ['cedula_front', 'cedula_back']
const ESTADOS = ['auto', 'revisar', 'manual', 'otra_foto']

// Jugadores con foto de cédula y el estado del encuadre de cada lado (?equipo= para un club)
export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const equipo = req.nextUrl.searchParams.get('equipo')
  const equipos = (await prisma.team.findMany({ select: { name: true }, orderBy: { name: 'asc' } })).map((t) => t.name)
  const filas = await prisma.player.findMany({
    where: { ...(equipo ? { team: { name: equipo } } : {}), images: { some: { kind: { in: KINDS } } } },
    orderBy: [{ team: { name: 'asc' } }, { lastName: 'asc' }],
    take: 4000,
    select: {
      id: true, firstName: true, lastName: true, number: true, team: { select: { name: true } },
      images: { where: { kind: { in: KINDS } }, select: { kind: true, cropEstado: true, cropMotivo: true, crop: true } },
    },
  })
  const lado = (j: (typeof filas)[number], kind: string) => {
    const i = j.images.find((x) => x.kind === kind)
    return i ? { estado: i.cropEstado, motivo: i.cropMotivo, esquinas: i.crop } : null
  }
  return NextResponse.json({
    ok: true, equipos,
    jugadores: filas.map((j) => ({ id: j.id, nombre: `${j.firstName} ${j.lastName}`, numero: j.number, equipo: j.team.name, frente: lado(j, 'cedula_front'), reverso: lado(j, 'cedula_back') })),
  })
}

// Guarda la cédula enderezada (JPEG). La foto original se conserva la primera vez. Sin archivo, solo cambia el estado.
export async function POST(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const f = await req.formData().catch(() => null)
  if (!f) return NextResponse.json({ ok: false, message: 'Solicitud inválida' }, { status: 400 })
  const playerId = String(f.get('playerId') || '')
  const kind = String(f.get('kind') || '')
  const estado = String(f.get('estado') || '')
  const motivo = String(f.get('motivo') || '').slice(0, 200) || null
  if (!playerId || !KINDS.includes(kind) || !ESTADOS.includes(estado)) return NextResponse.json({ ok: false, message: 'Datos inválidos' }, { status: 400 })

  let esquinas: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull
  try {
    const e = JSON.parse(String(f.get('esquinas') || 'null'))
    if (Array.isArray(e) && e.length === 4 && e.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n)))) esquinas = e
  } catch { /* sin esquinas */ }

  const img = await prisma.playerImage.findUnique({ where: { playerId_kind: { playerId, kind } }, select: { original: true } })
  if (!img) return NextResponse.json({ ok: false, message: 'Ese jugador no tiene esa foto' }, { status: 404 })

  const archivo = f.get('archivo')
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > 6_000_000) return NextResponse.json({ ok: false, message: 'Imagen demasiado grande' }, { status: 413 })
    const data = await sharp(Buffer.from(await archivo.arrayBuffer())).resize({ width: 1400, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()
    // Guarda la original antes de reemplazar (solo la primera vez)
    if (!img.original) {
      const cur = await prisma.playerImage.findUnique({ where: { playerId_kind: { playerId, kind } }, select: { data: true, mime: true } })
      if (cur) await prisma.playerImage.update({ where: { playerId_kind: { playerId, kind } }, data: { original: cur.data, originalMime: cur.mime } })
    }
    await prisma.playerImage.update({ where: { playerId_kind: { playerId, kind } }, data: { data, mime: 'image/jpeg', bytes: data.length, crop: esquinas, cropEstado: estado, cropMotivo: motivo } })
  } else {
    await prisma.playerImage.update({ where: { playerId_kind: { playerId, kind } }, data: { cropEstado: estado, cropMotivo: motivo } })
  }
  return NextResponse.json({ ok: true })
}

// Vuelve a la foto original subida por el jugador
export async function DELETE(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const b = await req.json().catch(() => null)
  const playerId = String(b?.playerId || ''), kind = String(b?.kind || '')
  if (!playerId || !KINDS.includes(kind)) return NextResponse.json({ ok: false, message: 'Datos inválidos' }, { status: 400 })
  const img = await prisma.playerImage.findUnique({ where: { playerId_kind: { playerId, kind } }, select: { original: true, originalMime: true } })
  if (!img?.original) return NextResponse.json({ ok: false, message: 'Esa foto no tiene original guardada' }, { status: 404 })
  await prisma.playerImage.update({
    where: { playerId_kind: { playerId, kind } },
    data: { data: img.original, mime: img.originalMime || 'image/jpeg', bytes: img.original.length, original: null, originalMime: null, crop: Prisma.DbNull, cropEstado: null, cropMotivo: null },
  })
  return NextResponse.json({ ok: true })
}
