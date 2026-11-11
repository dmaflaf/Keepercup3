import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'
import { normCedula } from '@/lib/importar'

export const dynamic = 'force-dynamic'

// Descarga del reglamento: solo con la cédula del director técnico que inscribió al club (o con sesión de administrador).
// El PDF está fuera de /public, así que no se puede bajar por un enlace directo.
const ARCHIVO = path.join(process.cwd(), 'privado', 'reglamento-keeper-cup-3.pdf')
const MAX_INTENTOS = 8, VENTANA_MIN = 15
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })

async function registrar(clave: string, item: Record<string, unknown>, max = 500) {
  const a = await prisma.ajuste.findUnique({ where: { key: clave } })
  const lista = a ? (JSON.parse(a.value) as unknown[]) : []
  lista.unshift(item)
  await prisma.ajuste.upsert({ where: { key: clave }, create: { key: clave, value: JSON.stringify(lista.slice(0, max)) }, update: { value: JSON.stringify(lista.slice(0, max)) } })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { cedula?: string }
  const admin = (await verifyAuth())?.rol === 'admin'
  let club = 'Administración'
  if (!admin) {
    // Límite de intentos por IP para que no se puedan probar cédulas al azar
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconocida'
    const clave = `intentos_reglamento:${ip}`
    const a = await prisma.ajuste.findUnique({ where: { key: clave } })
    const ahora = Date.now()
    let reg = { n: 0, desde: ahora }
    try { if (a) reg = JSON.parse(a.value) } catch { /* nuevo */ }
    if (ahora - reg.desde > VENTANA_MIN * 60000) reg = { n: 0, desde: ahora }
    if (reg.n >= MAX_INTENTOS) return falla(`Demasiados intentos. Espera ${VENTANA_MIN} minutos y vuelve a probar.`, 429)

    const cedula = normCedula(String(b.cedula || ''))
    const equipo = cedula.length >= 9 ? (await prisma.team.findMany({ select: { name: true, directorCedula: true } })).find((t) => normCedula(t.directorCedula || '') === cedula) : undefined
    if (!equipo) {
      reg.n++
      await prisma.ajuste.upsert({ where: { key: clave }, create: { key: clave, value: JSON.stringify(reg) }, update: { value: JSON.stringify(reg) } })
      return falla('Esa cédula no corresponde al director técnico de ningún club inscrito. Escríbela tal como la registraste al inscribir al equipo.', 403)
    }
    club = equipo.name
    await prisma.ajuste.deleteMany({ where: { key: clave } })
  }
  const pdf = await readFile(ARCHIVO).catch(() => null)
  if (!pdf) return falla('El reglamento no está disponible por ahora.', 503)
  await registrar('registro:reglamento_descargas', { fecha: new Date().toISOString(), club }).catch(() => null)
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Reglamento_Keeper_Cup_3.pdf"', 'Cache-Control': 'no-store', 'X-Club': encodeURIComponent(club) },
  })
}
