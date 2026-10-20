import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { CONFIG_DEFECTO, ConfigProg, horaValida } from '@/lib/programacion'

export const dynamic = 'force-dynamic'
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })

async function leerConfig(): Promise<ConfigProg> {
  const a = await prisma.ajuste.findUnique({ where: { key: 'programacion' } })
  try { const c = a ? (JSON.parse(a.value) as Partial<ConfigProg>) : {}; return { estadios: c.estadios?.length ? c.estadios : CONFIG_DEFECTO.estadios, inicio: c.inicio || CONFIG_DEFECTO.inicio, horarios: c.horarios || CONFIG_DEFECTO.horarios } } catch { return CONFIG_DEFECTO }
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
    ok: true, torneos, torneoId: id, config: await leerConfig(), cerradas: await cerradas(id),
    grupos: grupos.map((g) => ({ id: g.id, nombre: g.nombre, equipos: miembros.filter((m) => m.grupoId === g.id).map((m) => ({ id: m.teamId, nombre: nombre.get(m.teamId) || '?' })) })),
    partidos: partidos.map((p) => ({ id: p.id, jornadaNum: p.jornadaNum, grupo: p.grupoId ? gnombre.get(p.grupoId) || null : null, localId: p.localId, visitanteId: p.visitanteId, local: nombre.get(p.localId) || '?', visitante: nombre.get(p.visitanteId) || '?', fecha: p.fecha, hora: p.hora, escenario: p.escenario, estado: p.estado, golesLocal: p.golesLocal, golesVisitante: p.golesVisitante })),
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

  const p = await prisma.partido.findUnique({ where: { id: String(b.partidoId) } })
  if (!p) return falla('Partido no encontrado', 404)
  if ((await cerradas(p.torneoId)).includes(p.jornadaNum)) return falla(`La Fecha ${p.jornadaNum} está cerrada. Pulsa «Editar fecha» para modificarla.`, 409)

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
