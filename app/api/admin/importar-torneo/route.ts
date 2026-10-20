import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'
import { cotejarTarjetas, DatosKC3, enlazarClubes, eventosDeTarjetas, Resolucion, validarDatos } from '@/lib/importar-kc3'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ORIGEN = 'kc3-pages'
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })
async function admin() { const u = await verifyAuth(); return u && u.rol === 'admin' ? u : null }

// Contexto para el cotejo: clubes y jugadores del sistema (sin cédulas) y si ya hay una importación hecha.
export async function GET() {
  if (!(await admin())) return falla('Solo el administrador', 403)
  const [clubes, jugadores, previo] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.player.findMany({ select: { id: true, teamId: true, number: true, firstName: true, lastName: true } }),
    prisma.torneo.findFirst({ where: { origen: ORIGEN }, select: { id: true, nombre: true, createdAt: true } }),
  ])
  return NextResponse.json({ ok: true, clubes, jugadores: jugadores.map((j) => ({ id: j.id, teamId: j.teamId, numero: j.number, nombre: `${j.firstName} ${j.lastName}`.trim() })), importacionPrevia: previo })
}

export async function POST(req: NextRequest) {
  const u = await admin()
  if (!u) return falla('Solo el administrador', 403)
  const b = await req.json().catch(() => null)
  if (!b) return falla('Solicitud inválida')

  // Deshacer: borra SOLO el torneo creado por esta importación (nunca otros torneos)
  if (b.accion === 'deshacer') {
    const t = await prisma.torneo.findFirst({ where: { id: String(b.torneoId), origen: ORIGEN } })
    if (!t) return falla('No hay una importación con ese identificador', 404)
    const partidos = (await prisma.partido.findMany({ where: { torneoId: t.id }, select: { id: true } })).map((p) => p.id)
    const fases = (await prisma.fase.findMany({ where: { torneoId: t.id }, select: { id: true } })).map((f) => f.id)
    const grupos = (await prisma.grupo.findMany({ where: { faseId: { in: fases } }, select: { id: true } })).map((g) => g.id)
    await prisma.$transaction([
      prisma.evento.deleteMany({ where: { partidoId: { in: partidos } } }),
      prisma.partido.deleteMany({ where: { torneoId: t.id } }),
      prisma.grupoEquipo.deleteMany({ where: { grupoId: { in: grupos } } }),
      prisma.grupo.deleteMany({ where: { faseId: { in: fases } } }),
      prisma.fase.deleteMany({ where: { torneoId: t.id } }),
      prisma.pago.deleteMany({ where: { torneoId: t.id } }),
      prisma.torneo.delete({ where: { id: t.id } }),
    ])
    return NextResponse.json({ ok: true })
  }

  if (b.accion !== 'vista' && b.accion !== 'aplicar') return falla('Acción desconocida')
  const error = validarDatos(b.datos)
  if (error) return falla(error)
  const d = b.datos as DatosKC3
  const [clubes, jugadores] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true } }),
    prisma.player.findMany({ select: { id: true, teamId: true, number: true, firstName: true, lastName: true } }),
  ])
  const js = jugadores.map((j) => ({ id: j.id, teamId: j.teamId, numero: j.number, nombre: `${j.firstName} ${j.lastName}`.trim() }))
  const nombres = Array.from(new Set(d.equipos.map((e) => e.nombre)))
  const mapa: Record<string, string> = { ...enlazarClubes(nombres, clubes), ...(typeof b.mapaClubes === 'object' && b.mapaClubes ? b.mapaClubes : {}) }
  for (const [e, id] of Object.entries(mapa)) if (!clubes.some((c) => c.id === id)) delete mapa[e]
  const sinClub = nombres.filter((n) => !mapa[n])
  const usados = Object.values(mapa)
  const repetidos = usados.filter((id, i) => usados.indexOf(id) !== i)
  const manual: Record<string, Resolucion> = typeof b.manual === 'object' && b.manual ? b.manual : {}
  const cot = cotejarTarjetas(d, mapa, js, manual)
  const sinCotejo = cot.filter((t) => t.estado === 'sin')
  const eventos = eventosDeTarjetas(cot)
  const resumen = {
    clubesEnlazados: Object.keys(mapa).length, clubesSinEnlazar: sinClub, clubesRepetidos: repetidos.length,
    partidos: d.partidos.length, jugados: d.partidos.filter((p) => p.estado === 'jugado').length,
    tarjetas: cot.length, auto: cot.filter((t) => t.estado === 'auto').length, manual: cot.filter((t) => t.estado === 'manual').length, ignoradas: cot.filter((t) => t.estado === 'ignorada').length, sinCotejo: sinCotejo.length,
    eventos: eventos.length, dobles: eventos.filter((e) => e.tipo === 'doble_amarilla').length, pagos: d.pagos.length,
  }
  if (b.accion === 'vista') return NextResponse.json({ ok: true, resumen, sinCotejo: sinCotejo.slice(0, 200).map((t) => ({ equipo: t.equipo, jugador: t.jugadorRaw })) })

  // ---- aplicar ----
  if (sinClub.length || repetidos.length) return falla(`Faltan clubes por enlazar o hay clubes repetidos (${[...sinClub, ...(repetidos.length ? ['repetidos'] : [])].join(', ')}).`)
  if (sinCotejo.length) return falla(`Quedan ${sinCotejo.length} tarjetas sin cotejar. Asigna el jugador o ignóralas antes de importar.`)
  if (b.confirmacion !== 'IMPORTAR') return falla('Falta escribir IMPORTAR para confirmar.')
  if (await prisma.torneo.findFirst({ where: { origen: ORIGEN }, select: { id: true } })) return falla('Esta importación ya se hizo. Para repetirla, primero deshaz la anterior (no se duplica nada).', 409)
  const nombreTorneo = String(b.nombre || 'Keeper Cup 3').trim().slice(0, 80) || 'Keeper Cup 3'

  try {
    const r = await prisma.$transaction(async (tx) => {
      const torneo = await tx.torneo.create({ data: { nombre: nombreTorneo, activo: true, publico: false, origen: ORIGEN, precioAmarilla: d.torneo.precios_usd?.amarilla ?? 1, precioRoja: d.torneo.precios_usd?.roja_directa ?? 2 } })
      // Criterios de ubicación de la herramienta: puntos, diferencia de gol, goles a favor (y nombre)
      const fase = await tx.fase.create({ data: { torneoId: torneo.id, orden: 1, nombre: 'Fase de grupos', tipo: 'grupos', criterios: 'puntos,dg,gf' } })
      const grupoId = new Map<string, string>()
      let orden = 1
      for (const g of d.torneo.grupos) {
        const gr = await tx.grupo.create({ data: { faseId: fase.id, nombre: g.nombre, orden: orden++ } })
        grupoId.set(g.id, gr.id)
        await tx.grupoEquipo.createMany({ data: g.equipos.map((e) => ({ grupoId: gr.id, teamId: mapa[e] })) })
      }
      const partidoId = new Map<string, string>()
      for (const p of d.partidos) {
        const jugado = p.estado === 'jugado' && p.goles_local !== null && p.goles_visitante !== null
        const row = await tx.partido.create({ data: {
          torneoId: torneo.id, faseId: fase.id, grupoId: grupoId.get(p.grupo) || null, jornada: `Fecha ${p.fecha}`, jornadaNum: p.fecha,
          fecha: p.fecha_iso, hora: p.hora_24h, escenario: p.estadio, localId: mapa[p.local], visitanteId: mapa[p.visitante],
          estado: jugado ? 'finalizado' : 'programado', golesLocal: jugado ? p.goles_local : null, golesVisitante: jugado ? p.goles_visitante : null, marcadorManual: jugado, periodo: jugado ? 'fin' : 'previo',
        } })
        partidoId.set(p.id, row.id)
      }
      const ev = eventos.filter((e) => partidoId.has(e.partido_id))
      if (ev.length) await tx.evento.createMany({ data: ev.map((e) => ({ partidoId: partidoId.get(e.partido_id) as string, teamId: e.teamId, playerId: e.playerId, tipo: e.tipo, minuto: null, periodo: null, clienteId: e.cid })) })
      if (d.pagos.length) await tx.pago.createMany({ data: d.pagos.map((p) => ({ torneoId: torneo.id, teamId: mapa[p.equipo], monto: p.monto_usd, nota: p.nota || 'Importado de la herramienta', usuario: u.email })) })
      return { torneoId: torneo.id, partidos: partidoId.size, eventos: ev.length, pagos: d.pagos.length }
    }, { timeout: 55000, maxWait: 10000 })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    console.error('Importación fallida', e)
    return falla('No se pudo importar. No se guardó nada (la operación se revirtió completa).', 500)
  }
}
