import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { planificar } from '@/lib/fases-prog'
import { aplicarPlan, deshacerUltima, diasNuevos, estadoTorneo, guardarRespaldo, ultimoRespaldo } from '@/lib/fases-db'
import { desdeSorteo } from '@/lib/sorteo-f2'
import { buscarClub } from '@/lib/goles-kc3'
import { SORTEO_F2 } from '@/lib/sorteo-f2-datos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Carga el sorteo oficial de la Fase 2 (semilla E9C9RI): grupos de Copa Oro y Copa Plata y los 48 partidos de las
// Fechas 8, 9 y 10 con día, hora y estadio. Usa los grupos que ya creaste en Torneo (por sus clubes) y los partidos ya
// generados (les pone fecha y horario); solo crea lo que falte. No toca la Fase 1 ni ningún partido jugado.
//   ?simular=1 → muestra qué haría · (sin parámetros) → aplica · ?deshacer=1 → vuelve a como estaba
const ORIGEN = 'sorteo-f2'
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
const pagina = (t: string, cuerpo: string) => new NextResponse(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t)}</title><body style="font-family:system-ui;max-width:820px;margin:24px auto;padding:0 14px;line-height:1.45;background:#0f172a;color:#e2e8f0"><h1 style="font-size:22px">${esc(t)}</h1>${cuerpo}</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
const DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const q = req.nextUrl.searchParams
  const torneo = (await prisma.torneo.findFirst({ where: { origen: 'kc3-pages' }, orderBy: { createdAt: 'desc' } })) || (await prisma.torneo.findFirst({ orderBy: [{ activo: 'desc' }, { createdAt: 'desc' }] }))
  if (!torneo) return pagina('Cargar sorteo Fase 2', '<p>No existe el torneo «Keeper Cup 3».</p>')

  if (q.get('deshacer')) {
    const u = await ultimoRespaldo(torneo.id)
    if (!u || u.origen !== ORIGEN) return pagina('Nada que deshacer', '<p>La última carga no es la de este sorteo (o no hay ninguna). No se cambió nada.</p>')
    const r = await deshacerUltima(torneo.id)
    return pagina(r.ok ? 'Sorteo de la Fase 2 deshecho' : 'No se pudo deshacer', `<p>${esc(r.message)}</p>`)
  }

  const estado = await estadoTorneo(torneo.id)
  const { datos, dias, notas } = desdeSorteo(SORTEO_F2, estado)
  const plan = planificar(datos, estado)
  const diasCambio = await diasNuevos(torneo.id, dias)
  const simular = !!q.get('simular')
  const c = { fases: plan.fasesNuevas.length, grupos: plan.gruposNuevos.length, equipos: plan.miembrosNuevos.length, crear: plan.crear.length, actualizar: plan.actualizar.length, sinCambio: plan.sinCambio, jugados: plan.jugados.length }
  const nada = !c.fases && !c.grupos && !c.equipos && !c.crear && !c.actualizar && !diasCambio

  let titulo = simular ? 'Simulación: sorteo de la Fase 2 (no se guardó nada)' : 'Sorteo de la Fase 2 cargado'
  if (plan.errores.length) titulo = 'Sorteo de la Fase 2: hay que corregir algo antes (no se guardó nada)'
  else if (!simular && nada) titulo = 'Sorteo de la Fase 2: ya estaba cargado (no hay cambios)'
  else if (!simular) { const r = await aplicarPlan(torneo.id, plan, diasCambio); r.origen = ORIGEN; await guardarRespaldo(torneo.id, r) }

  const nom = (x: string) => estado.clubes.find((k) => k.id === buscarClub(x, estado.clubes))?.name || `${x} (¿?)`
  const lista = (xs: string[], color: string) => xs.length ? `<ul style="color:${color}">${xs.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''
  const grupos = datos.fases.map((f) => `<h3 style="margin:14px 0 4px">${esc(f.nombre)}</h3>${(f.grupos || []).map((g) => `<p style="margin:2px 0"><b style="color:#fbbf24">${esc(g.nombre)}:</b> ${esc(g.equipos.map(nom).join(', '))}</p>`).join('')}`).join('')
  const filas = [8, 9, 10].map((n) => {
    const ps = datos.fases.flatMap((f) => (f.partidos || []).filter((p) => p.fecha === n).map((p) => ({ ...p, fase: f.nombre }))).sort((a, b) => `${a.dia}${a.hora}${a.estadio}`.localeCompare(`${b.dia}${b.hora}${b.estadio}`))
    return `<h3 style="margin:16px 0 4px">Fecha ${n} · ${ps.length} partidos</h3><table style="border-collapse:collapse;font-size:14px;width:100%">${ps.map((p) => `<tr style="border-top:1px solid #334155"><td style="padding:3px 6px;white-space:nowrap">${p.dia ? `${DIA[new Date(p.dia + 'T12:00:00Z').getUTCDay()]} ${p.dia.slice(8)}/${p.dia.slice(5, 7)}` : ''} ${esc(p.hora || '')}</td><td style="padding:3px 6px">${esc(p.estadio || '')}</td><td style="padding:3px 6px">${esc(nom(p.local))} <span style="color:#94a3b8">vs</span> ${esc(nom(p.visitante))}</td><td style="padding:3px 6px;color:#94a3b8">${esc(p.grupo || '')}</td></tr>`).join('')}</table>`
  }).join('')
  const resumen = `<p>Se ${simular || plan.errores.length ? 'crearían' : 'crearon'} <b>${c.fases}</b> fase(s), <b>${c.grupos}</b> grupo(s) y <b>${c.crear}</b> partido(s); ${simular || plan.errores.length ? 'se actualizarían' : 'se actualizaron'} <b>${c.actualizar}</b> partido(s) ya existentes (fecha, día, hora, estadio y quién es local); sin cambios: ${c.sinCambio}.${c.jugados ? ` Ya jugados (no se tocan): ${c.jugados}.` : ''}${diasCambio ? ` Días de Programación fijados para la${diasCambio.fechas.length > 1 ? 's Fechas' : ' Fecha'} ${diasCambio.fechas.join(', ')}.` : ''}</p>`
  return pagina(titulo,
    `${plan.errores.length ? `<p style="color:#fca5a5"><b>⛔ Hay que corregir:</b></p>${lista(plan.errores, '#fca5a5')}` : ''}${resumen}${lista(notas, '#cbd5e1')}${lista(plan.avisos.filter((a) => !notas.includes(a)), '#fde68a')}
     <p style="color:#94a3b8;font-size:13px">No se toca la Fase 1: resultados, goles, tarjetas, tablas y estadísticas siguen igual. Repetirlo no duplica nada.${simular ? ' Para cargarlo, abre este mismo enlace sin <code>?simular=1</code>.' : ' Para volver atrás: <code>?deshacer=1</code> (mientras no se haya jugado ningún partido de estas fechas).'}</p>
     <h2 style="font-size:18px;margin-top:20px">Grupos</h2>${grupos}<h2 style="font-size:18px;margin-top:20px">Partidos</h2>${filas}`)
}
