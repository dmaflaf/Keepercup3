import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { GOLES_KC3 } from '@/lib/goles-kc3-datos'
import { planificarGoles, PREFIJO_GOL } from '@/lib/goles-kc3'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
const pagina = (titulo: string, cuerpo: string) => new NextResponse(
  `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title>
<body style="font-family:system-ui;max-width:760px;margin:24px auto;padding:0 14px;line-height:1.45;background:#0f172a;color:#e2e8f0"><h1 style="font-size:22px">${esc(titulo)}</h1>${cuerpo}</body></html>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })

// Carga los goles de GOLES_KC3 (lib/goles-kc3-datos.ts) en el torneo importado. Solo administrador.
//   /api/admin/cargar-goles              → carga (repetible: no duplica; vuelve a calcular lo cargado por esta vía)
//   /api/admin/cargar-goles?simular=1    → solo muestra qué haría
//   /api/admin/cargar-goles?deshacer=1   → quita únicamente los goles cargados por esta vía
export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const q = req.nextUrl.searchParams
  const torneo = await prisma.torneo.findFirst({ where: { origen: 'kc3-pages' }, orderBy: { createdAt: 'desc' } })
  if (!torneo) return pagina('Cargar goles', '<p>Todavía no existe el torneo importado «Keeper Cup 3». Impórtalo primero.</p>')

  if (q.get('deshacer')) {
    const ids = (await prisma.partido.findMany({ where: { torneoId: torneo.id }, select: { id: true } })).map((p) => p.id)
    const r = await prisma.evento.deleteMany({ where: { partidoId: { in: ids }, clienteId: { startsWith: PREFIJO_GOL } } })
    return pagina('Goles quitados', `<p>Se quitaron <b>${r.count}</b> gol(es) cargados desde el Excel. No se tocó nada más.</p>`)
  }

  const [clubes, partidos, jugadores, ajenos] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true } }),
    prisma.partido.findMany({ where: { torneoId: torneo.id }, select: { id: true, jornadaNum: true, localId: true, visitanteId: true, golesLocal: true, golesVisitante: true } }),
    prisma.player.findMany({ select: { id: true, teamId: true, number: true, firstName: true, lastName: true } }),
    prisma.evento.findMany({ where: { tipo: { in: ['gol', 'gol_penal', 'autogol'] } }, select: { partidoId: true, teamId: true, clienteId: true } }),
  ])
  const delTorneo = new Set(partidos.map((p) => p.id))
  const golesAjenos = new Set(ajenos.filter((e) => delTorneo.has(e.partidoId) && !(e.clienteId || '').startsWith(PREFIJO_GOL)).map((e) => `${e.partidoId}|${e.teamId}`))
  const plan = planificarGoles(GOLES_KC3, clubes, partidos, jugadores.map((j) => ({ id: j.id, teamId: j.teamId, number: j.number, nombre: `${j.firstName} ${j.lastName}` })), golesAjenos, torneo.minutosTiempo)

  const simular = !!q.get('simular')
  if (!simular) {
    await prisma.$transaction([
      ...plan.reemplazar.map((r) => prisma.evento.deleteMany({ where: { partidoId: r.partidoId, teamId: r.teamId, clienteId: { startsWith: PREFIJO_GOL } } })),
      prisma.evento.createMany({ data: plan.nuevos.map((g) => ({ partidoId: g.partidoId, teamId: g.teamId, playerId: g.playerId, tipo: 'gol', minuto: g.minuto, periodo: g.periodo, clienteId: g.cid })) }),
    ])
  }
  const color = { ok: '#86efac', aviso: '#fde68a', error: '#fca5a5' }
  const lista = plan.novedades.map((n) => `<li style="color:${color[n.nivel]};margin:6px 0">${esc(n.texto)}</li>`).join('')
  return pagina(simular ? 'Simulación de carga de goles (no se guardó nada)' : 'Goles cargados',
    `<p>${simular ? 'Se cargarían' : 'Se cargaron'} <b>${plan.resumen.goles}</b> gol(es) en <b>${plan.resumen.partidos}</b> partido(s) (${plan.resumen.grupos} club-partido). Los minutos son simulados; se pueden corregir en ✏️ Editar partido. El marcador de los partidos no se modificó.</p>
     <h2 style="font-size:17px">Novedades (${plan.novedades.length})</h2>${lista ? `<ul>${lista}</ul>` : '<p>Sin novedades.</p>'}
     <p style="color:#94a3b8;font-size:13px">Repetir esta carga no duplica nada. Para quitar solo estos goles: <code>?deshacer=1</code> al final de la dirección.</p>`)
}
