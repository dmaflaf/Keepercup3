import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'
import { marcadorDesdeEventos } from '@/lib/torneo'

export const dynamic = 'force-dynamic'
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status })
const texto = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max)

// Partido suspendido (solo administrador, con su contraseña):
//   suspender → queda SUSPENDIDO: no suma puntos ni goles; sus tarjetas sí cuentan para sanciones y multas
//   mesa      → se resuelve con fallo de mesa (ej. 3-0): suma a la tabla con ese marcador; sus goles no cuentan
//   reanudar  → vuelve a la planilla para jugar los minutos que faltan, con su marcador y eventos
//   repetir   → se juega de nuevo desde 0-0 (borra goles, cambios y alineación; las TARJETAS se conservan)
//   sancion   → partidos de sanción adicionales en una roja o doble amarilla (ej. intento de agresión 4 a 6 fechas)
export async function POST(req: NextRequest) {
  const u = await verifyAuth()
  if (!u || u.rol !== 'admin') return falla('Solo el administrador', 403)
  const b = await req.json().catch(() => null)
  if (!b) return falla('Solicitud inválida')
  const admin = await prisma.user.findUnique({ where: { id: u.id }, select: { passwordHash: true, nombre: true, email: true } })
  if (!admin || !(await bcrypt.compare(String(b.password || ''), admin.passwordHash))) return falla('La contraseña no es correcta.', 401)
  const quien = admin.nombre || admin.email
  const hoy = new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })
  const nota = (prev: string | null, t: string) => (prev ? `${prev}\n` : '') + `[${hoy} · ${quien}] ${t}`

  if (b.accion === 'sancion') {
    const e = await prisma.evento.findUnique({ where: { id: String(b.eventoId) } })
    if (!e || !['roja', 'doble_amarilla'].includes(e.tipo)) return falla('La sanción adicional solo va en una roja o doble amarilla.')
    const n = Number(b.partidos)
    if (!Number.isInteger(n) || n < 0 || n > 30) return falla('Número de partidos inválido (0 a 30).')
    const motivo = texto(b.motivo, 300)
    if (n > 0 && !motivo) return falla('Escribe el motivo (ej. intento de agresión al árbitro, Art. …).')
    await prisma.evento.update({ where: { id: e.id }, data: { sancionExtra: n || null, sancionMotivo: n ? motivo : null } })
    return NextResponse.json({ ok: true })
  }

  const p = await prisma.partido.findUnique({ where: { id: String(b.partidoId) } })
  if (!p) return falla('Partido no encontrado', 404)

  if (b.accion === 'suspender') {
    const motivo = texto(b.motivo)
    if (!motivo) return falla('Escribe el motivo de la suspensión.')
    if (p.estado === 'suspendido') return falla('El partido ya está suspendido.')
    // Detener el reloj donde quedó
    const base = p.relojBaseSeg + (p.relojDesde ? Math.max(0, Math.floor((Date.now() - p.relojDesde.getTime()) / 1000)) : 0)
    const ev = await prisma.evento.findMany({ where: { partidoId: p.id } })
    await prisma.partido.update({
      where: { id: p.id },
      data: {
        estado: 'suspendido', suspendidoMotivo: motivo, suspendidoEn: new Date(), suspendidoMinuto: Math.max(0, Math.floor(base / 60)),
        relojBaseSeg: base, relojDesde: null, resueltoMesa: false,
        ...(p.marcadorManual ? {} : marcadorDesdeEventos(p, ev)),
        observaciones: nota(p.observaciones, `Partido SUSPENDIDO: ${motivo}`),
      },
    })
    return NextResponse.json({ ok: true })
  }

  if (p.estado !== 'suspendido') return falla('Esta acción es para un partido suspendido.')

  if (b.accion === 'mesa') {
    const gl = Number(b.golesLocal), gv = Number(b.golesVisitante)
    if (!Number.isInteger(gl) || !Number.isInteger(gv) || gl < 0 || gv < 0 || gl > 30 || gv > 30) return falla('Marcador inválido')
    const t = texto(b.nota)
    await prisma.partido.update({
      where: { id: p.id },
      data: { estado: 'finalizado', golesLocal: gl, golesVisitante: gv, marcadorManual: true, resueltoMesa: true, periodo: 'fin', relojDesde: null, observaciones: nota(p.observaciones, `Fallo de mesa: ${gl}-${gv}${t ? ` · ${t}` : ''}`) },
    })
    return NextResponse.json({ ok: true })
  }
  if (b.accion === 'reanudar') {
    // Sigue desde donde quedó (reloj pausado); el administrador lo continúa en la planilla
    await prisma.partido.update({ where: { id: p.id }, data: { estado: 'programado', resueltoMesa: false, relojDesde: null, observaciones: nota(p.observaciones, `Se reanuda desde el minuto ${p.suspendidoMinuto ?? '?'}`) } })
    return NextResponse.json({ ok: true })
  }
  if (b.accion === 'repetir') {
    await prisma.$transaction([
      prisma.evento.deleteMany({ where: { partidoId: p.id, tipo: { notIn: ['amarilla', 'doble_amarilla', 'roja'] } } }),
      // Las tarjetas del intento suspendido se marcan aparte (periodo -1): siguen contando, pero no se suman a las del partido nuevo
      prisma.evento.updateMany({ where: { partidoId: p.id }, data: { periodo: -1 } }),
      prisma.partido.update({
        where: { id: p.id },
        data: { estado: 'programado', resueltoMesa: false, golesLocal: null, golesVisitante: null, marcadorManual: false, penalesLocal: null, penalesVisitante: null, periodo: 'previo', relojBaseSeg: 0, relojDesde: null, duracionReal: null, fecha: null, hora: null, escenario: null, observaciones: nota(p.observaciones, 'Se jugará de nuevo desde 0-0 (las tarjetas del partido suspendido se mantienen)') },
      }),
    ])
    return NextResponse.json({ ok: true })
  }
  return falla('Acción desconocida')
}
