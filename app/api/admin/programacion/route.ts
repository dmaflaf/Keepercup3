import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { CONFIG_DEFECTO, ConfigProg, horaValida, juegaEn } from '@/lib/programacion'

export const dynamic = 'force-dynamic'
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })

async function leerConfig(): Promise<ConfigProg> {
  const a = await prisma.ajuste.findUnique({ where: { key: 'programacion' } })
  try { const c = a ? (JSON.parse(a.value) as Partial<ConfigProg>) : {}; return { estadios: c.estadios?.length ? c.estadios : CONFIG_DEFECTO.estadios, inicio: c.inicio || CONFIG_DEFECTO.inicio, horarios: c.horarios || CONFIG_DEFECTO.horarios } } catch { return CONFIG_DEFECTO }
}
// Días y horas propios de una fecha (si se editaron): [{ fecha: 'YYYY-MM-DD', horas: ['HH:MM'] }]
type DiaFecha = { fecha: string; horas: string[] }
const claveDias = (torneoId: string) => `programacion_dias:${torneoId}`
async function diasFecha(torneoId: string): Promise<Record<string, DiaFecha[]>> {
  const a = await prisma.ajuste.findUnique({ where: { key: claveDias(torneoId) } })
  try { return a ? JSON.parse(a.value) : {} } catch { return {} }
}
async function cerradas(torneoId: string): Promise<number[]> {
  const a = await prisma.ajuste.findUnique({ where: { key: `jornadas_cerradas:${torneoId}` } })
  try { return a ? (JSON.parse(a.value) as number[]) : [] } catch { return [] }
}

// Programación de partidos por casillas (solo administrador)
export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const torneos = await prisma.torneo.findMany({ orderBy: [{ activo: 'desc' }, { createdAt: 'desc' }], select: { id: true, nombre: true } })
  const id = req.nextUrl.searchParams.get('torneoId') || torneos[0]?.id
  if (!id) return NextResponse.json({ ok: true, torneos, partidos: [], config: await leerConfig(), grupos: [], cerradas: [] })
  const [partidos, fases] = await Promise.all([
    prisma.partido.findMany({ where: { torneoId: id }, orderBy: [{ jornadaNum: 'asc' }, { fecha: 'asc' }, { hora: 'asc' }] }),
    prisma.fase.findMany({ where: { torneoId: id }, select: { id: true } }),
  ])
  const grupos = await prisma.grupo.findMany({ where: { faseId: { in: fases.map((f) => f.id) } }, orderBy: [{ orden: 'asc' }] })
  const miembros = await prisma.grupoEquipo.findMany({ where: { grupoId: { in: grupos.map((g) => g.id) } } })
  const equipos = await prisma.team.findMany({ where: { id: { in: Array.from(new Set([...miembros.map((m) => m.teamId), ...partidos.flatMap((p) => [p.localId, p.visitanteId])])) } }, select: { id: true, name: true } })
  const nombre = new Map(equipos.map((t) => [t.id, t.name]))
  const gnombre = new Map(grupos.map((g) => [g.id, g.nombre]))
  return NextResponse.json({
    ok: true, torneos, torneoId: id, config: await leerConfig(), cerradas: await cerradas(id), diasFecha: await diasFecha(id),
    grupos: grupos.map((g) => ({ id: g.id, nombre: g.nombre, equipos: miembros.filter((m) => m.grupoId === g.id).map((m) => ({ id: m.teamId, nombre: nombre.get(m.teamId) || '?' })) })),
    partidos: partidos.map((p) => ({ id: p.id, jornadaNum: p.jornadaNum, jornadaJuego: p.jornadaJuego, grupo: p.grupoId ? gnombre.get(p.grupoId) || null : null, localId: p.localId, visitanteId: p.visitanteId, local: nombre.get(p.localId) || '?', visitante: nombre.get(p.visitanteId) || '?', fecha: p.fecha, hora: p.hora, escenario: p.escenario, estado: p.estado, golesLocal: p.golesLocal, golesVisitante: p.golesVisitante })),
  })
}

export async function POST(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const b = await req.json().catch(() => null)
  if (!b) return falla('Solicitud inválida')

  if (b.accion === 'config') {
    const c = b.config as Partial<ConfigProg>
    if (!c || !Array.isArray(c.estadios) || !c.estadios.length || !/^\d{4}-\d{2}-\d{2}$/.test(String(c.inicio))) return falla('Configuración inválida')
    const horarios: Record<string, string[]> = {}
    for (const [d, hs] of Object.entries(c.horarios || {})) { if (!/^[0-6]$/.test(d)) continue; const ok = (hs as string[]).filter(horaValida); horarios[d] = Array.from(new Set(ok)).sort() }
    const v = { estadios: c.estadios.map((s) => String(s).trim()).filter(Boolean).slice(0, 6), inicio: c.inicio, horarios }
    await prisma.ajuste.upsert({ where: { key: 'programacion' }, create: { key: 'programacion', value: JSON.stringify(v) }, update: { value: JSON.stringify(v) } })
    return NextResponse.json({ ok: true })
  }

  if (b.accion === 'cerrar') {
    const lista = new Set(await cerradas(String(b.torneoId)))
    b.cerrada ? lista.add(Number(b.jornada)) : lista.delete(Number(b.jornada))
    const key = `jornadas_cerradas:${String(b.torneoId)}`
    await prisma.ajuste.upsert({ where: { key }, create: { key, value: JSON.stringify(Array.from(lista)) }, update: { value: JSON.stringify(Array.from(lista)) } })
    return NextResponse.json({ ok: true })
  }

  // Editar los días (agregar, quitar, cambiar fecha) y las horas de una fecha abierta
  if (b.accion === 'dias' || b.accion === 'dias_reset') {
    const torneoId = String(b.torneoId), jornada = Number(b.jornada)
    if (!Number.isInteger(jornada) || jornada < 1) return falla('Fecha inválida')
    if ((await cerradas(torneoId)).includes(jornada)) return falla(`La Fecha ${jornada} está cerrada. Pulsa «Editar fecha» para modificarla.`, 409)
    const todos = await diasFecha(torneoId)
    if (b.accion === 'dias_reset') {
      delete todos[jornada]
      await prisma.ajuste.upsert({ where: { key: claveDias(torneoId) }, create: { key: claveDias(torneoId), value: JSON.stringify(todos) }, update: { value: JSON.stringify(todos) } })
      return NextResponse.json({ ok: true })
    }
    const lista = Array.isArray(b.dias) ? (b.dias as { fecha: string; horas: string[]; de?: string | null }[]) : []
    if (!lista.length) return falla('Deja al menos un día.')
    const fechas = new Set<string>()
    for (const d of lista) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha))) return falla('Hay un día con fecha inválida.')
      if (fechas.has(d.fecha)) return falla(`El día ${d.fecha} está repetido.`)
      fechas.add(d.fecha)
      if (!Array.isArray(d.horas) || !d.horas.length || d.horas.some((h) => !horaValida(String(h)))) return falla(`Revisa las horas del ${d.fecha} (formato HH:MM, separadas por coma).`)
    }
    const partidos = (await prisma.partido.findMany({ where: { torneoId } })).filter((p) => (p.jornadaJuego ?? p.jornadaNum) === jornada && p.fecha)
    const nuevoDe = new Map<string, string>() // fecha anterior → nueva
    for (const d of lista) if (d.de && d.de !== d.fecha) nuevoDe.set(d.de, d.fecha)
    const updates: { id: string; fecha: string }[] = []
    for (const p of partidos) {
      const destino = nuevoDe.get(p.fecha as string) ?? (fechas.has(p.fecha as string) ? p.fecha : null)
      if (!destino) return falla(`No se puede quitar el ${p.fecha}: tiene partidos programados (${p.hora}). Déjalos sin horario primero.`)
      if (destino !== p.fecha) {
        if (p.estado === 'finalizado') return falla(`El ${p.fecha} tiene partidos ya jugados: no se puede cambiar esa fecha.`)
        updates.push({ id: p.id, fecha: destino })
      }
    }
    todos[jornada] = lista.map((d) => ({ fecha: d.fecha, horas: Array.from(new Set(d.horas.map(String))).sort() })).sort((a, z) => a.fecha.localeCompare(z.fecha))
    await prisma.$transaction([
      ...updates.map((u) => prisma.partido.update({ where: { id: u.id }, data: { fecha: u.fecha } })),
      prisma.ajuste.upsert({ where: { key: claveDias(torneoId) }, create: { key: claveDias(torneoId), value: JSON.stringify(todos) }, update: { value: JSON.stringify(todos) } }),
    ])
    return NextResponse.json({ ok: true, movidos: updates.length })
  }

  const p = await prisma.partido.findUnique({ where: { id: String(b.partidoId) } })
  if (!p) return falla('Partido no encontrado', 404)
  const lista = await cerradas(p.torneoId)

  // Jugar un partido pendiente en otra fecha (diferido o adelantado), o devolverlo a la suya
  if (b.accion === 'mover') {
    if (p.estado === 'finalizado') return falla('Ese partido ya se jugó.')
    const destino = b.jornada === null ? null : Number(b.jornada)
    if (destino !== null && (!Number.isInteger(destino) || destino < 1 || destino > 99)) return falla('Fecha inválida')
    const nueva = destino === null || destino === p.jornadaNum ? null : destino
    if (lista.includes(juegaEn(p)) || lista.includes(nueva ?? p.jornadaNum)) return falla('Esa fecha está cerrada. Pulsa «Editar fecha» para modificarla.', 409)
    await prisma.partido.update({ where: { id: p.id }, data: { jornadaJuego: nueva, fecha: null, hora: null, escenario: null } })
    return NextResponse.json({ ok: true })
  }
  if (lista.includes(juegaEn(p))) return falla(`La Fecha ${juegaEn(p)} está cerrada. Pulsa «Editar fecha» para modificarla.`, 409)

  if (b.accion === 'liberar') {
    await prisma.partido.update({ where: { id: p.id }, data: { fecha: null, hora: null, escenario: null } })
    return NextResponse.json({ ok: true })
  }
  if (b.accion === 'asignar') {
    const fecha = String(b.fecha || ''), hora = String(b.hora || ''), escenario = String(b.escenario || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !horaValida(hora) || !escenario) return falla('Elige estadio, día y una hora válida (HH:MM)')
    if (p.estado === 'finalizado') return falla('Ese partido ya se jugó: no se cambia su horario.')
    // Un equipo no puede jugar dos partidos a la misma hora
    const choque = await prisma.partido.findFirst({ where: { torneoId: p.torneoId, id: { not: p.id }, fecha, hora, OR: [{ localId: p.localId }, { visitanteId: p.localId }, { localId: p.visitanteId }, { visitanteId: p.visitanteId }] } })
    if (choque) return falla('Alguno de esos equipos ya juega ese día a esa hora.')
    const ocupante = await prisma.partido.findFirst({ where: { torneoId: p.torneoId, id: { not: p.id }, fecha, hora, escenario } })
    if (ocupante?.estado === 'finalizado') return falla('Esa casilla la ocupa un partido ya jugado.')
    await prisma.$transaction([
      ...(ocupante ? [prisma.partido.update({ where: { id: ocupante.id }, data: { fecha: null, hora: null, escenario: null } })] : []),
      prisma.partido.update({ where: { id: p.id }, data: { fecha, hora, escenario } }),
    ])
    return NextResponse.json({ ok: true, desplazado: ocupante ? { id: ocupante.id } : null })
  }
  return falla('Acción desconocida')
}
