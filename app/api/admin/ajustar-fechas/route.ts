import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { buscarClub } from '@/lib/goles-kc3'

export const dynamic = 'force-dynamic'

// Grupo B: las fechas 6 y 7 se jugaron intercambiadas. Solo cambia el número y la etiqueta de la fecha;
// no toca marcadores, eventos, horarios ni la tabla. Solo administrador.
//   ?simular=1 → muestra qué haría · (sin parámetros) → aplica · ?deshacer=1 → vuelve a como estaba
const CAMBIOS: { a: string; b: string; antes: number; ahora: number }[] = [
  { a: 'Libert', b: 'Mandela', antes: 7, ahora: 6 },
  { a: 'Leones', b: 'Sub 21', antes: 7, ahora: 6 },
  { a: 'Jolines', b: 'Templo Fit', antes: 7, ahora: 6 },
  { a: 'Pecezuelos', b: 'Real Sevilla', antes: 7, ahora: 6 },
  { a: 'Jolines', b: 'Real Sevilla', antes: 6, ahora: 7 },
  { a: 'Leones', b: 'Pecezuelos', antes: 6, ahora: 7 },
  { a: 'Libert', b: 'Sub 21', antes: 6, ahora: 7 },
  { a: 'Mandela', b: 'Templo Fit', antes: 6, ahora: 7 },
]
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
const pagina = (t: string, cuerpo: string) => new NextResponse(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t)}</title><body style="font-family:system-ui;max-width:760px;margin:24px auto;padding:0 14px;line-height:1.45;background:#0f172a;color:#e2e8f0"><h1 style="font-size:22px">${esc(t)}</h1>${cuerpo}</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })

export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const q = req.nextUrl.searchParams
  const torneo = await prisma.torneo.findFirst({ where: { origen: 'kc3-pages' }, orderBy: { createdAt: 'desc' } })
  if (!torneo) return pagina('Ajustar fechas', '<p>No existe el torneo importado «Keeper Cup 3».</p>')
  const [clubes, partidos] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true } }),
    prisma.partido.findMany({ where: { torneoId: torneo.id }, select: { id: true, localId: true, visitanteId: true, jornadaNum: true, jornada: true } }),
  ])
  const nom = (id: string) => clubes.find((c) => c.id === id)?.name || '?'
  const deshacer = !!q.get('deshacer'), simular = !!q.get('simular')
  const filas: string[] = []
  const updates: { id: string; num: number }[] = []
  for (const c of CAMBIOS) {
    const a = buscarClub(c.a, clubes), b = buscarClub(c.b, clubes)
    const p = a && b ? partidos.find((x) => (x.localId === a && x.visitanteId === b) || (x.localId === b && x.visitanteId === a)) : null
    if (!p) { filas.push(`<li style="color:#fca5a5">${esc(c.a)} vs ${esc(c.b)}: no encontrado en el torneo.</li>`); continue }
    const destino = deshacer ? c.antes : c.ahora
    if (p.jornadaNum === destino) { filas.push(`<li>${esc(nom(p.localId))} vs ${esc(nom(p.visitanteId))}: ya está en la Fecha ${destino}.</li>`); continue }
    updates.push({ id: p.id, num: destino })
    filas.push(`<li style="color:#fde68a">${esc(nom(p.localId))} vs ${esc(nom(p.visitanteId))}: Fecha ${p.jornadaNum} → <b>Fecha ${destino}</b></li>`)
  }
  if (!simular && updates.length) await prisma.$transaction(updates.map((u) => prisma.partido.update({ where: { id: u.id }, data: { jornadaNum: u.num, jornada: `Fecha ${u.num}` } })))
  return pagina(simular ? 'Simulación: cambio de fechas del Grupo B (no se guardó nada)' : deshacer ? 'Fechas del Grupo B devueltas a como estaban' : 'Fechas del Grupo B actualizadas',
    `<p>${simular ? 'Se cambiarían' : 'Se cambiaron'} <b>${updates.length}</b> partido(s). No se tocaron marcadores, eventos, horarios ni la tabla.</p><ul>${filas.join('')}</ul><p style="color:#94a3b8;font-size:13px">Repetirlo no cambia nada más. Para volver atrás: <code>?deshacer=1</code>.</p>`)
}
