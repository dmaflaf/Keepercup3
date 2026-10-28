import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { buscarClub } from '@/lib/goles-kc3'

export const dynamic = 'force-dynamic'

// Horarios de la Fecha 6 (imagen oficial) + Randagi 3-0 San José por sanción disciplinaria (jugó en lugar de Clowiss).
// Solo cambia día, hora y estadio; no toca marcadores salvo Randagi–San José. Solo administrador.
//   ?simular=1 → muestra qué haría · (sin parámetros) → aplica · ?deshacer=1 → vuelve a como estaba
const HORARIOS: [string, string, string, string, string][] = [
  ['Libert', 'Mandela', '2026-10-23', '19:00', 'San Miguel'],
  ['Alianza Jr.', 'Galacticos', '2026-10-23', '21:00', 'San Miguel'],
  ['Juventus', 'Leipzig', '2026-10-23', '21:00', 'Los Sauces'],
  ['Randagi', 'Universitarios', '2026-10-24', '16:00', 'San Miguel'],
  ['Barcelona', 'San Francisco', '2026-10-24', '18:00', 'San Miguel'],
  ['Leones', 'Sub 21', '2026-10-24', '20:00', 'San Miguel'],
  ['Barrio Fino', 'Cordovez', '2026-10-24', '18:00', 'Los Sauces'],
  ['La Banda', 'Somec', '2026-10-24', '20:00', 'Los Sauces'],
  ['America', 'Legacy', '2026-10-25', '09:00', 'San Miguel'],
  ['Jolines', 'Templo Fit', '2026-10-25', '11:00', 'San Miguel'],
  ['Cormoran', 'San Andres', '2026-10-25', '13:00', 'San Miguel'],
  ['Arapaima', 'Huracán', '2026-10-25', '15:00', 'San Miguel'],
  ['Corintians', 'Gladiadores AZ', '2026-10-25', '17:00', 'San Miguel'],
  ['Pecezuelos', 'Real Sevilla', '2026-10-25', '15:00', 'Los Sauces'],
  ['Real Potosí', 'Vaster', '2026-10-25', '17:00', 'Los Sauces'],
  ['Randagi', 'San José', '2026-10-23', '19:00', 'Los Sauces'], // en lugar de Clowiss – San José
]
const SANCION = { a: 'Randagi', b: 'San José', golesA: 3, golesB: 0, nota: 'Resultado 3-0 a favor de Randagi por sanción disciplinaria (agresión al árbitro de San José). Randagi jugó en lugar de Clowiss.' }
const CLAVE = 'respaldo:cargar-horarios-f6'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
const pagina = (t: string, cuerpo: string) => new NextResponse(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t)}</title><body style="font-family:system-ui;max-width:780px;margin:24px auto;padding:0 14px;line-height:1.45;background:#0f172a;color:#e2e8f0"><h1 style="font-size:22px">${esc(t)}</h1>${cuerpo}</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })

type Previo = { id: string; fecha: string | null; hora: string | null; escenario: string | null; estado: string; golesLocal: number | null; golesVisitante: number | null; marcadorManual: boolean; observaciones: string | null }

export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const q = req.nextUrl.searchParams
  const torneo = await prisma.torneo.findFirst({ where: { origen: 'kc3-pages' }, orderBy: { createdAt: 'desc' } })
  if (!torneo) return pagina('Cargar horarios', '<p>No existe el torneo importado «Keeper Cup 3».</p>')

  if (q.get('deshacer')) {
    const a = await prisma.ajuste.findUnique({ where: { key: CLAVE } })
    if (!a) return pagina('Nada que deshacer', '<p>No hay una carga anterior guardada.</p>')
    const prev = JSON.parse(a.value) as Previo[]
    await prisma.$transaction([...prev.map(({ id, ...d }) => prisma.partido.update({ where: { id }, data: d })), prisma.ajuste.delete({ where: { key: CLAVE } })])
    return pagina('Horarios devueltos a como estaban', `<p>Se restauraron <b>${prev.length}</b> partido(s).</p>`)
  }

  const [clubes, partidos] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true } }),
    prisma.partido.findMany({ where: { torneoId: torneo.id } }),
  ])
  const nom = (id: string) => clubes.find((c) => c.id === id)?.name || '?'
  const buscar = (x: string, y: string) => { const a = buscarClub(x, clubes), b = buscarClub(y, clubes); return a && b ? partidos.find((p) => (p.localId === a && p.visitanteId === b) || (p.localId === b && p.visitanteId === a)) : undefined }
  const filas: string[] = []
  const cambios: { p: (typeof partidos)[number]; data: Record<string, unknown> }[] = []
  for (const [x, y, fecha, hora, escenario] of HORARIOS) {
    const p = buscar(x, y)
    if (!p) { filas.push(`<li style="color:#fca5a5">${esc(x)} vs ${esc(y)}: no encontrado en el torneo.</li>`); continue }
    const data: Record<string, unknown> = { fecha, hora, escenario }
    let extra = ''
    if (x === SANCION.a && y === SANCION.b) {
      const localEsA = p.localId === buscarClub(SANCION.a, clubes)
      Object.assign(data, { estado: 'finalizado', marcadorManual: true, golesLocal: localEsA ? SANCION.golesA : SANCION.golesB, golesVisitante: localEsA ? SANCION.golesB : SANCION.golesA, observaciones: SANCION.nota })
      extra = ` · <b>resultado ${nom(p.localId)} ${data.golesLocal} - ${data.golesVisitante} ${nom(p.visitanteId)}</b> (sanción disciplinaria)`
    }
    cambios.push({ p, data })
    filas.push(`<li style="color:#fde68a">${p.jornada} · ${esc(nom(p.localId))} vs ${esc(nom(p.visitanteId))}: ${p.fecha || '—'} ${p.hora || ''} ${p.escenario || ''} → <b>${fecha} ${hora} ${escenario}</b>${extra}</li>`)
  }
  const clowiss = buscar('Clowiss', 'San José')
  if (clowiss) filas.push(`<li>${clowiss.jornada} · Clowiss vs San José: <b>queda pendiente</b> (no se programa; Randagi jugó en su lugar).</li>`)

  const simular = !!q.get('simular')
  if (!simular && cambios.length) {
    const previo: Previo[] = cambios.map(({ p }) => ({ id: p.id, fecha: p.fecha, hora: p.hora, escenario: p.escenario, estado: p.estado, golesLocal: p.golesLocal, golesVisitante: p.golesVisitante, marcadorManual: p.marcadorManual, observaciones: p.observaciones }))
    // Guarda el estado ORIGINAL de cada partido una sola vez (los que se suman en otra pasada también)
    const ya = await prisma.ajuste.findUnique({ where: { key: CLAVE } })
    const guardado: Previo[] = ya ? JSON.parse(ya.value) : []
    const respaldo = [...guardado, ...previo.filter((x) => !guardado.some((g) => g.id === x.id))]
    await prisma.$transaction([
      prisma.ajuste.upsert({ where: { key: CLAVE }, update: { value: JSON.stringify(respaldo) }, create: { key: CLAVE, value: JSON.stringify(respaldo) } }),
      ...cambios.map(({ p, data }) => prisma.partido.update({ where: { id: p.id }, data })),
    ])
  }
  return pagina(simular ? 'Simulación: horarios de la Fecha 6 (no se guardó nada)' : 'Horarios de la Fecha 6 cargados',
    `<p>${simular ? 'Se actualizarían' : 'Se actualizaron'} <b>${cambios.length}</b> partido(s). Solo día, hora y estadio; el único resultado que se registra es Randagi 3-0 San José.</p><ul>${filas.join('')}</ul><p style="color:#94a3b8;font-size:13px">Repetirlo no duplica nada. Para volver atrás: <code>?deshacer=1</code>.</p>`)
}
