import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normCedula } from '@/lib/importar'
import { cargarTorneo } from '@/lib/torneo-data'
import { cargarMultas } from '@/lib/multas-data'
import { calcularFinanzas, ETIQUETA } from '@/lib/finanzas-data'
import { crearSesion, demasiadosIntentos, registrarIntento, sesionPortal } from '@/lib/portal'

export const dynamic = 'force-dynamic'
const falla = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } })

// Portal del DT: datos de SU club (solo lectura). Requiere el enlace privado + haber entrado con la cédula del DT.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const { club, ok } = await sesionPortal(params.token)
  if (!club) return falla('Enlace no válido. Pide uno nuevo a la organización.', 404)
  if (!ok) return NextResponse.json({ ok: false, entrar: true, club: club.name }, { status: 401, headers: { 'Cache-Control': 'no-store' } })

  const torneo = await prisma.torneo.findFirst({ orderBy: [{ activo: 'desc' }, { createdAt: 'desc' }] })
  const [jug, d, m, fin, solicitudes] = await Promise.all([
    prisma.player.findMany({ where: { teamId: club.id }, orderBy: [{ number: 'asc' }, { lastName: 'asc' }], select: { id: true, firstName: true, lastName: true, number: true, position: true, estado: true, cedula: true, qrToken: true, images: { select: { kind: true } } } }),
    torneo ? cargarTorneo(torneo.id) : null, torneo ? cargarMultas(torneo.id) : null, torneo ? calcularFinanzas(torneo.id) : null,
    prisma.solicitudCambio.findMany({ where: { teamId: club.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ])
  const oculta = (c: string | null) => (c && c.length >= 7 ? `${c.slice(0, 4)}•••${c.slice(-3)}` : '')
  const san = (m?.sanciones || []).filter((s) => s.teamId === club.id)
  const precaucion = (acum: number) => !!m && m.torneo.amarillasSuspension > 1 && acum === m.torneo.amarillasSuspension - 1
  const jugadores = jug.map((j) => {
    const s = san.find((x) => x.playerId === j.id)
    const kinds = j.images.map((i) => i.kind)
    return {
      id: j.id, numero: j.number, nombre: `${j.firstName} ${j.lastName}`.trim(), posicion: j.position, cedula: oculta(j.cedula),
      estado: s && s.estado === 'SUSPENDIDO' ? 'suspendido' : j.estado, sancion: s && s.estado === 'SUSPENDIDO' ? `Suspendido: ${s.pendientes.map((f) => `Fecha ${f}`).join(', ')}${s.fuera ? ' (+ siguiente etapa)' : ''} · ${s.motivo}` : s && precaucion(s.acum) ? `En precaución: ${s.acum} amarillas` : null,
      faltaFoto: !kinds.includes('selfie'), faltaCedula: !j.cedula || !kinds.includes('cedula_front') || !kinds.includes('cedula_back'), carnetListo: j.estado === 'habilitado' && !!j.qrToken,
    }
  })
  const partidos = (d?.partidos || []).filter((p) => p.localId === club.id || p.visitanteId === club.id)
  const nom = (id: string) => d?.nombreEquipo.get(id) || '?'
  const proximos = partidos.filter((p) => p.estado !== 'finalizado').sort((a, b) => a.jornadaNum - b.jornadaNum || `${a.fecha || '9'}${a.hora || ''}`.localeCompare(`${b.fecha || '9'}${b.hora || ''}`)).slice(0, 6)
    .map((p) => ({ jornada: p.jornada, fecha: p.fecha, hora: p.hora, escenario: p.escenario, rival: nom(p.localId === club.id ? p.visitanteId : p.localId), local: p.localId === club.id, estado: p.estado }))
  const jugados = partidos.filter((p) => p.estado === 'finalizado').sort((a, b) => b.jornadaNum - a.jornadaNum).slice(0, 5)
    .map((p) => ({ id: p.id, jornada: p.jornada, rival: nom(p.localId === club.id ? p.visitanteId : p.localId), gf: p.localId === club.id ? p.golesLocal : p.golesVisitante, gc: p.localId === club.id ? p.golesVisitante : p.golesLocal }))
  const fila = fin?.filas.find((f) => f.teamId === club.id)
  const exon = (fin?.cargos || []).filter((c) => c.teamId === club.id && !c.anulado && c.monto === 0)
  const cuenta = fila ? {
    conceptos: Object.keys(ETIQUETA).filter((k) => fila.porConcepto[k].cargado || fila.porConcepto[k].pagado || exon.some((c) => c.concepto === k)).map((k) => ({ concepto: ETIQUETA[k], detalle: exon.find((c) => c.concepto === k && !fila.porConcepto[k].cargado)?.detalle || null, cargado: fila.porConcepto[k].cargado, pagado: fila.porConcepto[k].pagado })),
    cargado: fila.cargado, pagado: fila.pagado, saldo: fila.saldo,
    pagos: (fin?.pagos || []).filter((p) => p.teamId === club.id && !p.anulado).map((p) => ({ fecha: p.fechaPago, concepto: ETIQUETA[p.concepto] || p.concepto, comprobante: p.comprobante, monto: p.monto })),
  } : null
  return NextResponse.json({
    ok: true, club: { nombre: club.name, ciudad: club.city, dt: club.directorName, logo: !!club.logo }, torneo: torneo?.nombre || null,
    jugadores, proximos, jugados, cuenta,
    solicitudes: solicitudes.map((x) => ({ id: x.id, texto: x.texto, estado: x.estado, respuesta: x.respuesta, fecha: x.createdAt })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const b = await req.json().catch(() => ({})) as { accion?: string; cedula?: string; texto?: string }
  if (b.accion === 'entrar') {
    const { club } = await sesionPortal(params.token)
    if (!club) return falla('Enlace no válido. Pide uno nuevo a la organización.', 404)
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sin-ip'
    if (await demasiadosIntentos(ip)) return falla('Demasiados intentos. Espera 15 minutos.', 429)
    const ced = normCedula(String(b.cedula || ''))
    const okCed = ced.length >= 9 && normCedula(club.directorCedula || '') === ced
    await registrarIntento(ip, !okCed)
    if (!okCed) return falla('La cédula no corresponde al DT registrado de este club.', 401)
    const s = await crearSesion(club.id)
    const r = NextResponse.json({ ok: true })
    r.cookies.set(s.nombre, s.valor, s.opciones)
    return r
  }
  const { club, ok } = await sesionPortal(params.token)
  if (!club || !ok) return falla('Entra con tu cédula primero.', 401)
  if (b.accion === 'solicitud') {
    const texto = String(b.texto || '').trim().slice(0, 1000)
    if (texto.length < 5) return falla('Escribe qué hay que cambiar (por ejemplo: «El #8 se llama Juan Pérez, no Juan Peres»).')
    const abiertas = await prisma.solicitudCambio.count({ where: { teamId: club.id, estado: 'pendiente' } })
    if (abiertas >= 10) return falla('Ya tienes 10 pedidos pendientes. Espera a que la organización los revise.', 429)
    await prisma.solicitudCambio.create({ data: { teamId: club.id, texto } })
    return NextResponse.json({ ok: true })
  }
  if (b.accion === 'salir') { const r = NextResponse.json({ ok: true }); r.cookies.set('portal-dt', '', { path: '/', maxAge: 0 }); return r }
  return falla('Acción desconocida')
}
