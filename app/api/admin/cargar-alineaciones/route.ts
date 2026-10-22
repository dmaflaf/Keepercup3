import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { ALINEACIONES_KC3 } from '@/lib/alineaciones-kc3-datos'
import { planificarAlineaciones, PREFIJO_ALI } from '@/lib/alineaciones-kc3'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
const pagina = (titulo: string, cuerpo: string) => new NextResponse(
  `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title>
<body style="font-family:system-ui;max-width:760px;margin:24px auto;padding:0 14px;line-height:1.45;background:#0f172a;color:#e2e8f0"><h1 style="font-size:22px">${esc(titulo)}</h1>${cuerpo}</body></html>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })

// Carga las alineaciones de lib/alineaciones-kc3-datos.ts en el torneo importado. Solo administrador.
//   /api/admin/cargar-alineaciones             → carga (repetible, no duplica)
//   /api/admin/cargar-alineaciones?simular=1   → solo muestra qué haría
//   /api/admin/cargar-alineaciones?deshacer=1  → quita únicamente lo cargado por esta vía
export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const q = req.nextUrl.searchParams
  const torneo = await prisma.torneo.findFirst({ where: { origen: 'kc3-pages' }, orderBy: { createdAt: 'desc' } })
  if (!torneo) return pagina('Cargar alineaciones', '<p>Todavía no existe el torneo importado «Keeper Cup 3». Impórtalo primero.</p>')
  const partidos = await prisma.partido.findMany({ where: { torneoId: torneo.id }, select: { id: true, jornadaNum: true, localId: true, visitanteId: true, golesLocal: true, golesVisitante: true, estado: true } })
  const ids = partidos.map((p) => p.id)

  if (q.get('deshacer')) {
    const r = await prisma.evento.deleteMany({ where: { partidoId: { in: ids }, clienteId: { startsWith: PREFIJO_ALI } } })
    return pagina('Alineaciones quitadas', `<p>Se quitaron <b>${r.count}</b> evento(s) cargados desde las hojas. No se tocó nada más.</p>`)
  }

  const [clubes, jugadores, otros] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true } }),
    prisma.player.findMany({ select: { id: true, teamId: true, number: true, firstName: true, lastName: true, position: true } }),
    prisma.evento.findMany({ where: { partidoId: { in: ids }, tipo: { in: ['titular', 'entra', 'sale'] } }, select: { partidoId: true, teamId: true, clienteId: true } }),
  ])
  const yaTienen = new Set(otros.filter((e) => !(e.clienteId || '').startsWith(PREFIJO_ALI)).map((e) => `${e.partidoId}|${e.teamId}`))
  const plan = planificarAlineaciones(ALINEACIONES_KC3, clubes, partidos, jugadores.map((j) => ({ id: j.id, teamId: j.teamId, number: j.number, nombre: `${j.firstName} ${j.lastName}`, posicion: j.position })), yaTienen, torneo.minutosTiempo)

  const simular = !!q.get('simular')
  let intactos = true
  if (!simular) {
    const antes = JSON.stringify(partidos.map((p) => [p.id, p.golesLocal, p.golesVisitante, p.estado]))
    await prisma.$transaction([
      ...plan.reemplazar.map((r) => prisma.evento.deleteMany({ where: { partidoId: r.partidoId, teamId: r.teamId, clienteId: { startsWith: PREFIJO_ALI } } })),
      prisma.evento.createMany({ data: plan.eventos.map((e) => ({ partidoId: e.partidoId, teamId: e.teamId, playerId: e.playerId, tipo: e.tipo, minuto: e.minuto, periodo: e.periodo, clienteId: e.cid })) }),
    ])
    const despues = await prisma.partido.findMany({ where: { torneoId: torneo.id }, select: { id: true, golesLocal: true, golesVisitante: true, estado: true } })
    intactos = antes === JSON.stringify(partidos.map((p) => { const x = despues.find((y) => y.id === p.id); return [p.id, x?.golesLocal, x?.golesVisitante, x?.estado] }))
  }
  const color = { ok: '#86efac', aviso: '#fde68a', error: '#fca5a5' }
  const lista = plan.novedades.map((n) => `<li style="color:${color[n.nivel]};margin:6px 0">${esc(n.texto)}</li>`).join('')
  const r = plan.resumen
  return pagina(simular ? 'Simulación de carga de alineaciones (no se guardó nada)' : 'Alineaciones cargadas',
    `<p>${simular ? 'Se cargarían' : 'Se cargaron'} <b>${r.titulares}</b> titulares y <b>${r.ingresos}</b> ingresos (con su salida) en <b>${r.partidos}</b> partido(s), ${r.clubes} club-partido. Los minutos de los cambios son simulados.</p>
     ${simular ? '' : `<p>Marcadores y estados de los partidos: <b>${intactos ? 'intactos ✔' : 'CAMBIARON ✖ (avísame)'}</b>. No se tocaron goles, tarjetas ni tabla.</p>`}
     <h2 style="font-size:17px">Novedades (${plan.novedades.length})</h2>${lista ? `<ul>${lista}</ul>` : '<p>Sin novedades.</p>'}
     <p style="color:#94a3b8;font-size:13px">Repetir esta carga no duplica nada. Para quitar solo esto: <code>?deshacer=1</code> al final de la dirección.</p>`)
}
