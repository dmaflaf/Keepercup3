import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { buscarClub } from '@/lib/goles-kc3'

export const dynamic = 'force-dynamic'

// Goles que faltaban en el marcador (indicados por la organización): se agrega el gol al jugador y se SUBE el marcador del club.
// Si se indica el resultado final, el marcador queda en ese resultado.
//   ?simular=1 → muestra qué haría · (sin parámetros) → aplica (repetible) · ?deshacer=1 → quita lo agregado y repone lo quitado
const PREFIJO = 'manualgol:'
interface Corr { a: string; b: string; club: string; numero: number; goles: number; resultado?: { [club: string]: number } }
const CORRECCIONES: Corr[] = [
  { a: 'Templo Fit', b: 'Pecezuelos', club: 'Templo Fit', numero: 28, goles: 1 },
  { a: 'Templo Fit', b: 'Pecezuelos', club: 'Templo Fit', numero: 55, goles: 1 },
  { a: 'Templo Fit', b: 'Libert', club: 'Templo Fit', numero: 10, goles: 1 },
  { a: 'Templo Fit', b: 'Jolines', club: 'Templo Fit', numero: 10, goles: 1, resultado: { 'Templo Fit': 1, Jolines: 4 } },
]
const CLAVE = 'respaldo:corregir-goles'
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
const pagina = (t: string, cuerpo: string) => new NextResponse(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t)}</title><body style="font-family:system-ui;max-width:780px;margin:24px auto;padding:0 14px;line-height:1.45;background:#0f172a;color:#e2e8f0"><h1 style="font-size:22px">${esc(t)}</h1>${cuerpo}</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
const GOL = ['gol', 'gol_penal']

type Respaldo = { quitados: { partidoId: string; teamId: string; playerId: string | null; tipo: string; minuto: number | null; periodo: number | null; clienteId: string | null }[]; partidos: { id: string; estado: string; golesLocal: number | null; golesVisitante: number | null; marcadorManual: boolean }[] }

export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const q = req.nextUrl.searchParams
  const torneo = await prisma.torneo.findFirst({ where: { origen: 'kc3-pages' }, orderBy: { createdAt: 'desc' } })
  if (!torneo) return pagina('Corregir goles', '<p>No existe el torneo importado «Keeper Cup 3».</p>')
  const ids = (await prisma.partido.findMany({ where: { torneoId: torneo.id }, select: { id: true } })).map((p) => p.id)

  if (q.get('deshacer')) {
    const a = await prisma.ajuste.findUnique({ where: { key: CLAVE } })
    const r: Respaldo = a ? JSON.parse(a.value) : { quitados: [], partidos: [] }
    const borrados = await prisma.evento.deleteMany({ where: { partidoId: { in: ids }, clienteId: { startsWith: PREFIJO } } })
    await prisma.$transaction([
      ...(r.quitados.length ? [prisma.evento.createMany({ data: r.quitados })] : []),
      ...r.partidos.map(({ id, ...d }) => prisma.partido.update({ where: { id }, data: d })),
      ...(a ? [prisma.ajuste.delete({ where: { key: CLAVE } })] : []),
    ])
    return pagina('Corrección deshecha', `<p>Se quitaron <b>${borrados.count}</b> gol(es) agregados, se repusieron <b>${r.quitados.length}</b> y se restauraron <b>${r.partidos.length}</b> resultado(s).</p>`)
  }

  const [clubes, partidos, jugadores] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true } }),
    prisma.partido.findMany({ where: { torneoId: torneo.id } }),
    prisma.player.findMany({ select: { id: true, teamId: true, number: true, firstName: true, lastName: true } }),
  ])
  const nom = (id: string) => clubes.find((c) => c.id === id)?.name || '?'
  const simular = !!q.get('simular')
  const filas: string[] = []
  const previo: Respaldo = { quitados: [], partidos: [] }
  const ops: (() => Promise<unknown>)[] = []
  const eventosDe = new Map<string, Awaited<ReturnType<typeof prisma.evento.findMany>>>()

  for (const c of CORRECCIONES) {
    const a = buscarClub(c.a, clubes), b = buscarClub(c.b, clubes), club = buscarClub(c.club, clubes)
    const p = a && b ? partidos.find((x) => (x.localId === a && x.visitanteId === b) || (x.localId === b && x.visitanteId === a)) : undefined
    if (!p || !club) { filas.push(`<li style="color:#fca5a5">${esc(c.a)} vs ${esc(c.b)}: partido no encontrado.</li>`); continue }
    const titulo = `${p.jornada} · ${esc(nom(p.localId))} vs ${esc(nom(p.visitanteId))}`
    // Resultado final indicado (se aplica junto con el gol que faltaba)
    if (c.resultado) {
      const gl = c.resultado[Object.keys(c.resultado).find((k) => buscarClub(k, clubes) === p.localId) || ''], gv = c.resultado[Object.keys(c.resultado).find((k) => buscarClub(k, clubes) === p.visitanteId) || '']
      if (p.golesLocal !== gl || p.golesVisitante !== gv || p.estado !== 'finalizado') {
        if (!previo.partidos.some((x) => x.id === p.id)) previo.partidos.push({ id: p.id, estado: p.estado, golesLocal: p.golesLocal, golesVisitante: p.golesVisitante, marcadorManual: p.marcadorManual })
        filas.push(`<li style="color:#fde68a">${titulo}: resultado ${p.golesLocal ?? '–'} - ${p.golesVisitante ?? '–'} → <b>${gl} - ${gv}</b>.</li>`)
        p.golesLocal = gl; p.golesVisitante = gv; p.estado = 'finalizado'; p.marcadorManual = true
        ops.push(() => prisma.partido.update({ where: { id: p.id }, data: { golesLocal: gl, golesVisitante: gv, estado: 'finalizado', marcadorManual: true } }))
      }
    }
    const j = jugadores.find((x) => x.teamId === club && x.number === c.numero)
    if (!j) { filas.push(`<li style="color:#fca5a5">${titulo}: ${esc(nom(club))} no tiene jugador con el #${c.numero}.</li>`); continue }
    if (!eventosDe.has(p.id)) eventosDe.set(p.id, await prisma.evento.findMany({ where: { partidoId: p.id } }))
    const ev = eventosDe.get(p.id)!
    const cid = `${PREFIJO}${p.id}:${club}:${j.id}:${c.numero}`
    const ya = ev.filter((e) => e.clienteId?.startsWith(cid)).length
    if (ya >= c.goles) { filas.push(`<li>${titulo}: el gol de #${c.numero} ${esc(j.firstName)} ${esc(j.lastName)} ya estaba agregado.</li>`); continue }
    for (let k = ya; k < c.goles; k++) {
      const nuevo = { partidoId: p.id, teamId: club, playerId: j.id, tipo: 'gol', minuto: null, periodo: null, clienteId: `${cid}:${k}` }
      ev.push({ ...nuevo, id: `nuevo-${cid}-${k}`, createdAt: new Date() })
      ops.push(() => prisma.evento.create({ data: nuevo }))
      if (!previo.partidos.some((x) => x.id === p.id)) previo.partidos.push({ id: p.id, estado: p.estado, golesLocal: p.golesLocal, golesVisitante: p.golesVisitante, marcadorManual: p.marcadorManual })
      if (!c.resultado) {
        if (p.localId === club) p.golesLocal = (p.golesLocal ?? 0) + 1; else p.golesVisitante = (p.golesVisitante ?? 0) + 1
        p.estado = 'finalizado'; p.marcadorManual = true
      }
      const marcador = { golesLocal: p.golesLocal, golesVisitante: p.golesVisitante, estado: 'finalizado', marcadorManual: true }
      ops.push(() => prisma.partido.update({ where: { id: p.id }, data: marcador }))
      filas.push(`<li style="color:#86efac">${titulo}: gol de <b>#${c.numero} ${esc(j.firstName)} ${esc(j.lastName)}</b> (${esc(nom(club))}) · marcador: <b>${nom(p.localId)} ${p.golesLocal} - ${p.golesVisitante} ${nom(p.visitanteId)}</b></li>`)
    }
  }
  const previa = await prisma.ajuste.findUnique({ where: { key: CLAVE } })
  if (previa && (JSON.parse(previa.value) as Respaldo).quitados.length) return pagina('Primero deshaz la corrección anterior', '<p>La versión anterior de esta corrección reemplazó goles sin subir el marcador. Abre primero <code>/api/admin/corregir-goles?deshacer=1</code> y después vuelve a abrir esta dirección.</p>')
  if (!simular && ops.length) {
    const a = previa
    const r: Respaldo = a ? JSON.parse(a.value) : { quitados: [], partidos: [] }
    for (const x of previo.partidos) if (!r.partidos.some((y) => y.id === x.id)) r.partidos.push(x)
    for (const op of ops) await op()
    await prisma.ajuste.upsert({ where: { key: CLAVE }, update: { value: JSON.stringify(r) }, create: { key: CLAVE, value: JSON.stringify(r) } })
  }
  return pagina(simular ? 'Simulación: goles que faltaban (no se guardó nada)' : 'Goles corregidos',
    `<ul>${filas.join('')}</ul><p>La tabla de posiciones, goleadores y fichas QR se actualizan solas.</p><p style="color:#94a3b8;font-size:13px">Repetirlo no duplica nada. Para volver atrás: <code>?deshacer=1</code>.</p>`)
}
