import { NextRequest, NextResponse } from 'next/server'
import { rgb } from 'pdf-lib'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { cargarTorneo } from '@/lib/torneo-data'
import { cargarMultas } from '@/lib/multas-data'
import { Reporte, usd } from '@/lib/reportes-pdf'
import { fechaLarga } from '@/lib/programacion'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const cache = new Map<string, Uint8Array>()
async function archivo(origin: string, ruta: string) {
  const hit = cache.get(ruta); if (hit) return hit
  const r = await fetch(`${origin}${ruta}`); if (!r.ok) throw new Error(`No se pudo leer ${ruta}`)
  const b = new Uint8Array(await r.arrayBuffer()); cache.set(ruta, b); return b
}
const hoy = () => new Date(Date.now() - 5 * 3600 * 1000).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })

// PDF de reportes (solo administrador). ?tipo=resultados|sancionados|interno|club|clubes  &torneoId=  &equipo= (id del club)  &dinero=1
export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const q = req.nextUrl.searchParams
  const torneo = q.get('torneoId') ? { id: q.get('torneoId') as string } : await prisma.torneo.findFirst({ orderBy: [{ activo: 'desc' }, { createdAt: 'desc' }], select: { id: true } })
  if (!torneo) return NextResponse.json({ ok: false, message: 'No hay torneo' }, { status: 404 })
  const [d, m] = await Promise.all([cargarTorneo(torneo.id), cargarMultas(torneo.id)])
  if (!d || !m) return NextResponse.json({ ok: false, message: 'Torneo no encontrado' }, { status: 404 })
  const tipo = q.get('tipo') || 'resultados'
  const origin = req.nextUrl.origin
  const [normal, negrita] = await Promise.all([archivo(origin, '/fonts/RobotoCondensed_400Regular.ttf'), archivo(origin, '/fonts/RobotoCondensed_700Bold.ttf')])
  const R = await Reporte.crear({ normal, negrita }, `${m.torneo.nombre} · ${hoy()}`)
  const fase = d.fases[d.fases.length - 1]
  const nombre = (id: string) => d.nombreEquipo.get(id) || '?'
  const jug = m.jornadasJugadas

  const estadoTxt = (s: (typeof m.sanciones)[number]) => (s.estado === 'SUSPENDIDO' ? `SUSPENDIDO ${s.pendientes.map((f) => 'F' + f).join(', ')}${s.fuera ? ` +${s.fuera} sig. etapa` : ''}` : s.estado === 'Cumplida' ? 'Cumplida' : s.estado === 'Acumula' ? `Acumula ${s.acum}/${m.torneo.amarillasSuspension}` : '—')
  const filaSan = (s: (typeof m.sanciones)[number], conClub: boolean) => [`${s.numero ?? '–'}  ${s.jugador}`, ...(conClub ? [s.club] : []), String(s.y), String(s.r), s.motivo, { t: estadoTxt(s), color: s.estado === 'SUSPENDIDO' ? ('rojo' as const) : s.estado === 'Cumplida' ? ('verde' as const) : undefined, negrita: s.estado === 'SUSPENDIDO' }]
  const ordenSan = (a: (typeof m.sanciones)[number], b: (typeof m.sanciones)[number]) => (b.estado === 'SUSPENDIDO' ? 1 : 0) - (a.estado === 'SUSPENDIDO' ? 1 : 0) || b.total - a.total || b.r - a.r || b.y - a.y || a.jugador.localeCompare(b.jugador)

  if (tipo === 'resultados') {
    for (const g of fase?.grupos || []) {
      R.hoja(g.nombre, `Resultados y posiciones hasta la Fecha ${jug}`)
      R.titulo('Tabla de posiciones')
      R.tabla([{ t: '#', w: 26, al: 'c' }, { t: 'Equipo', w: 187 }, { t: 'PJ', w: 36, al: 'c' }, { t: 'G', w: 32, al: 'c' }, { t: 'E', w: 32, al: 'c' }, { t: 'P', w: 32, al: 'c' }, { t: 'GF', w: 36, al: 'c' }, { t: 'GC', w: 36, al: 'c' }, { t: 'DG', w: 38, al: 'c' }, { t: 'PTS', w: 36, al: 'c' }],
        g.tabla.map((r, i) => [String(i + 1), r.equipo, String(r.pj), String(r.pg), String(r.pe), String(r.pp), String(r.gf), String(r.gc), r.dg > 0 ? `+${r.dg}` : String(r.dg), { t: String(r.pts), negrita: true }]))
      R.titulo('Resultados')
      const ps = d.partidos.filter((p) => p.grupoId === g.id && (p.jornadaNum <= jug || (p.jornadaNum === jug + 1 && p.fecha)))
      for (const j of Array.from(new Set(ps.map((p) => p.jornadaNum))).sort((a, b) => a - b)) {
        R.tabla([{ t: `Fecha ${j}`, w: 175, al: 'r' }, { t: 'Resultado', w: 70, al: 'c' }, { t: '', w: 150 }, { t: 'Día y hora', w: 120 }],
          ps.filter((p) => p.jornadaNum === j).map((p) => { const ok = p.estado === 'finalizado' && p.golesLocal !== null; return [{ t: p.local, negrita: true }, { t: ok ? `${p.golesLocal} - ${p.golesVisitante}` : 'vs', negrita: ok }, { t: p.visitante, negrita: true }, { t: p.fecha ? `${fechaLarga(p.fecha).slice(0, 3)} ${p.fecha.slice(8)}/${p.fecha.slice(5, 7)} ${p.hora || ''} ${p.escenario ? '· ' + p.escenario : ''}` : 'por programar', color: 'gris' as const }] }), { size: 9 })
      }
    }
  } else if (tipo === 'sancionados') {
    R.hoja('Jugadores sancionados', `Suspendidos y con amarillas acumuladas · hasta la Fecha ${jug}`)
    R.linea(`Reglas: ${m.torneo.amarillasSuspension} amarillas acumuladas = 1 partido · 2 amarillas en un partido = ${m.torneo.partidosDobleAmarilla} partido · roja directa = ${m.torneo.partidosRojaDirecta} partidos.`, 9, GRIS_)
    for (const g of m.grupos) {
      const filas = m.sanciones.filter((s) => s.grupo === g.nombre && (s.estado === 'SUSPENDIDO' || s.estado === 'Acumula')).sort(ordenSan)
      if (!filas.length) continue
      R.titulo(g.nombre)
      R.tabla([{ t: 'Jugador', w: 135 }, { t: 'Club', w: 100 }, { t: 'Am.', w: 28, al: 'c' }, { t: 'Roj.', w: 28, al: 'c' }, { t: 'Motivo', w: 94 }, { t: 'Estado', w: 130 }], filas.map((s) => filaSan(s, true)), { size: 9 })
    }
  } else if (tipo === 'interno') {
    R.hoja('Tarjetas y valores (interno)', `Amarilla ${usd(m.torneo.precioAmarilla)} · roja directa ${usd(m.torneo.precioRoja)} · hasta la Fecha ${jug}`)
    let T = { y: 0, r: 0, total: 0, pagado: 0, pendiente: 0 }
    for (const g of m.grupos) {
      const filas = m.multas.filter((x) => x.grupo === g.nombre).sort((a, b) => b.pendiente - a.pendiente || a.nombre.localeCompare(b.nombre))
      R.titulo(g.nombre)
      R.tabla([{ t: 'Club', w: 175 }, { t: 'Am.', w: 40, al: 'c' }, { t: 'Dobles', w: 46, al: 'c' }, { t: 'Roj.', w: 40, al: 'c' }, { t: 'Total', w: 66, al: 'r' }, { t: 'Pagado', w: 66, al: 'r' }, { t: 'Pendiente', w: 82, al: 'r' }],
        filas.map((x) => [x.nombre, String(x.y), String(x.dobles), String(x.r), usd(x.total), usd(x.pagado), { t: usd(x.pendiente), color: x.pendiente > 0 ? ('rojo' as const) : ('verde' as const), negrita: true }]))
      for (const x of filas) T = { y: T.y + x.y, r: T.r + x.r, total: T.total + x.total, pagado: T.pagado + x.pagado, pendiente: T.pendiente + x.pendiente }
    }
    R.titulo('Total general')
    R.linea(`${T.y} amarillas · ${T.r} rojas directas · Total a pagar ${usd(T.total)} · Pagado ${usd(T.pagado)} · Pendiente ${usd(T.pendiente)}`, 11, AZUL_OSC, true)
  } else if (tipo === 'club' || tipo === 'clubes') {
    const ids = tipo === 'club' ? [q.get('equipo') || ''] : m.grupos.flatMap((g) => g.equipos.map((e) => e.id))
    const dinero = q.get('dinero') !== '0'
    for (const id of ids) {
      const club = m.multas.find((x) => x.teamId === id)
      if (!club) continue
      R.hoja(club.nombre, `${club.grupo} · informe para el club · hasta la Fecha ${jug}`)
      const gTabla = fase?.grupos.find((g) => g.nombre === club.grupo)?.tabla || []
      const pos = gTabla.findIndex((r) => r.teamId === id)
      if (pos >= 0) { const r = gTabla[pos]; R.linea(`Posición ${pos + 1}.º en ${club.grupo} · ${r.pj} PJ · ${r.pg} G · ${r.pe} E · ${r.pp} P · GF ${r.gf} · GC ${r.gc} · DG ${r.dg > 0 ? '+' : ''}${r.dg} · ${r.pts} puntos`, 11, AZUL_OSC, true) }
      R.titulo('Partidos')
      R.tabla([{ t: 'Fecha', w: 40, al: 'c' }, { t: 'Partido', w: 245 }, { t: 'Resultado', w: 60, al: 'c' }, { t: 'Día y hora', w: 170 }],
        d.partidos.filter((p) => p.localId === id || p.visitanteId === id).map((p) => { const ok = p.estado === 'finalizado' && p.golesLocal !== null; return [String(p.jornadaNum), `${p.local} vs ${p.visitante}`, { t: ok ? `${p.golesLocal} - ${p.golesVisitante}` : '—', negrita: ok }, { t: p.fecha ? `${fechaLarga(p.fecha)} ${p.hora || ''}${p.escenario ? ' · ' + p.escenario : ''}` : 'por programar', color: 'gris' as const }] }), { size: 9 })
      const sanc = m.sanciones.filter((s) => s.teamId === id).sort(ordenSan)
      R.titulo('Tarjetas y sanciones')
      if (sanc.length) R.tabla([{ t: 'Jugador', w: 165 }, { t: 'Am.', w: 30, al: 'c' }, { t: 'Roj.', w: 30, al: 'c' }, { t: 'Motivo', w: 120 }, { t: 'Estado', w: 170 }], sanc.map((s) => filaSan(s, false)), { size: 9 })
      else R.linea('Sin tarjetas registradas.', 10, GRIS_)
      if (dinero) { R.titulo('Valores por tarjetas'); R.linea(`${club.y} amarillas × ${usd(m.torneo.precioAmarilla)} + ${club.r} rojas × ${usd(m.torneo.precioRoja)} = ${usd(club.total)}   ·   Pagado ${usd(club.pagado)}   ·   Pendiente ${usd(club.pendiente)}`, 11, club.pendiente > 0 ? ROJO_ : VERDE_, true) }
    }
    if (!R.pdf.getPageCount()) return NextResponse.json({ ok: false, message: 'Club no encontrado' }, { status: 404 })
  } else return NextResponse.json({ ok: false, message: 'Tipo de reporte desconocido' }, { status: 400 })

  const bytes = await R.bytes()
  return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="keeper-cup-3-${tipo}.pdf"`, 'Cache-Control': 'no-store' } })
}
const AZUL_OSC = rgb(0.043, 0.071, 0.106), GRIS_ = rgb(0.38, 0.42, 0.48), ROJO_ = rgb(0.75, 0.1, 0.17), VERDE_ = rgb(0.1, 0.55, 0.25)
