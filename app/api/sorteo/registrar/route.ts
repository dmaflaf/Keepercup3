import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/db'
import { esColor, generarCodigo, hashIp, leerConfig, p4, semanaActual } from '@/lib/sorteo'
import { enviarCorreo } from '@/lib/correo'

export const dynamic = 'force-dynamic'

const MAX_POR_IP_HORA = 80
const BLOQUEADO = 'Tus datos están bloqueados en este sorteo. Comunícate con la organización del torneo.'

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}
const fmt = (color: string, n: number) => `${color.toUpperCase()} ${String(n).padStart(4, '0')}`

export async function POST(req: NextRequest) {
  let b: any
  try {
    b = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Solicitud inválida' }, { status: 400 })
  }

  const nombres = String(b.nombres || '').trim().replace(/\s+/g, ' ')
  const correo = String(b.correo || '').trim().toLowerCase()
  const telefono = String(b.telefono || '').trim()
  const club = String(b.club || '').trim().replace(/\s+/g, ' ')
  const color = b.color
  const crudos: unknown[] = Array.isArray(b.numeros) ? b.numeros : b.numero !== undefined ? [b.numero] : []
  const numeros = Array.from(new Set(crudos.map(Number)))

  if (!b.sigue) return NextResponse.json({ ok: false, message: 'Debes seguir al torneo en Instagram y TikTok para participar.' }, { status: 400 })
  if (nombres.length < 5 || !/\s/.test(nombres) || nombres.length > 80) return NextResponse.json({ ok: false, message: 'Escribe tu nombre completo.' }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo) || correo.length > 120) return NextResponse.json({ ok: false, message: 'Escribe un correo válido.' }, { status: 400 })
  if (!/^09\d{8}$/.test(telefono)) return NextResponse.json({ ok: false, message: 'El teléfono es obligatorio: 10 dígitos que empiecen con 09.' }, { status: 400 })
  if (club.length < 2 || club.length > 60) return NextResponse.json({ ok: false, message: 'Elige el club que apoyas.' }, { status: 400 })
  const equiposValidos = (await prisma.team.findMany({ select: { name: true } })).map((t) => t.name)
  if (equiposValidos.length && club !== 'Otro' && !equiposValidos.includes(club)) return NextResponse.json({ ok: false, message: 'Elige un club de la lista.' }, { status: 400 })

  const cfg = await leerConfig()
  if (!esColor(color) || !cfg.coloresActivos.includes(color)) return NextResponse.json({ ok: false, message: 'Ese color de boleto no está participando en este momento.' }, { status: 400 })
  if (!numeros.length) return NextResponse.json({ ok: false, message: 'Escribe el número de tu boleto.' }, { status: 400 })
  if (numeros.some((n) => !Number.isInteger(n) || n < 1 || n > cfg.rangoMax)) return NextResponse.json({ ok: false, message: `Los números de boleto deben estar entre 1 y ${cfg.rangoMax}.` }, { status: 400 })
  const fuera = numeros.filter((n) => n < cfg.desde || n > cfg.hasta)
  if (fuera.length) {
    return NextResponse.json({ ok: false, message: `El boleto ${fuera.map(p4).join(', ')} no participa en este sorteo. Revisa el número de tu boleto.` }, { status: 400 })
  }

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sin-ip'
  const ipHash = hashIp(ip)
  if ((await prisma.sorteoBoleto.count({ where: { ipHash, createdAt: { gt: new Date(Date.now() - 3600 * 1000) } } })) >= MAX_POR_IP_HORA) {
    return NextResponse.json({ ok: false, message: 'Demasiados registros desde esta red. Inténtalo más tarde.' }, { status: 429 })
  }

  const valido = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(v) ? v : '')
  const deviceIds = Array.from(new Set([valido(req.cookies.get('kc3d')?.value), valido(b.deviceId)].filter(Boolean)))
  const deviceId = deviceIds[0] || randomUUID()

  // Bloqueados por registrar números que no les pertenecen
  const bloq = await prisma.sorteoBloqueo.findFirst({
    where: { OR: [{ tipo: 'telefono', valor: telefono }, ...(deviceIds.length ? [{ tipo: 'dispositivo', valor: { in: deviceIds } }] : [])] },
  })
  if (bloq) return NextResponse.json({ ok: false, message: BLOQUEADO }, { status: 403 })

  // Tope de boletos por semana (lunes a domingo, hora de Ecuador), por teléfono y por dispositivo
  const semana = semanaActual()
  const usados = Math.max(
    await prisma.sorteoBoleto.count({ where: { semana, telefono } }),
    deviceIds.length ? await prisma.sorteoBoleto.count({ where: { semana, deviceId: { in: deviceIds } } }) : 0
  )
  const quedan = cfg.maxPorSemana - usados
  if (quedan <= 0) {
    return NextResponse.json({ ok: false, message: `Ya registraste tus ${cfg.maxPorSemana} boletos de esta semana. Podrás registrar más desde el lunes.` }, { status: 429 })
  }
  if (numeros.length > quedan) {
    return NextResponse.json({ ok: false, message: `Esta semana te quedan ${quedan} boleto(s) por registrar (máximo ${cfg.maxPorSemana} por semana). Escribiste ${numeros.length}.` }, { status: 429 })
  }

  const resultados: any[] = []
  for (const numero of numeros) {
    try {
      const r = await prisma.$transaction(async (tx) => {
        const boleto = await tx.sorteoBoleto.create({
          data: { color, numero, nombres, correo, telefono, club, codigo: generarCodigo(6, 'KC3-'), ipHash, deviceId, semana },
        })
        const gan = await tx.sorteoNumero.findUnique({ where: { color_numero: { color, numero } }, include: { premio: true } })
        if (gan && gan.estado === 'pendiente') {
          const cobro = generarCodigo(8)
          const upd = await tx.sorteoNumero.updateMany({
            where: { id: gan.id, estado: 'pendiente' },
            data: { estado: 'ganado', boletoId: boleto.id, codigoCobro: cobro, ganadoAt: new Date() },
          })
          if (upd.count === 1) return { boleto, premio: gan.premio, cobro }
        }
        return { boleto, premio: null, cobro: null }
      })
      resultados.push({
        ok: true, boleto: fmt(color, numero), codigo: r.boleto.codigo, gano: !!r.premio,
        premio: r.premio ? { nombre: r.premio.nombre, categoria: r.premio.categoria, periodo: r.premio.periodo, lugar: r.premio.lugar } : null,
        codigoCobro: r.cobro,
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        resultados.push({ ok: false, boleto: fmt(color, numero), message: 'Ya estaba registrado. Si este boleto es tuyo, preséntalo en el bar del complejo.' })
      } else {
        resultados.push({ ok: false, boleto: fmt(color, numero), message: 'No se pudo registrar. Inténtalo de nuevo.' })
      }
    }
  }

  const buenos = resultados.filter((r) => r.ok)
  if (!buenos.length) {
    return NextResponse.json({ ok: false, message: resultados.map((r) => `${r.boleto}: ${r.message}`).join(' ') }, { status: 409 })
  }

  const lineas = buenos.map((r) => (r.gano
    ? `<li><b>${r.boleto}</b>: ¡GANÓ ${esc(r.premio.nombre)}! Código de cobro <b style="font-size:20px">${r.codigoCobro}</b> — reclámalo en ${esc(r.premio.lugar)} con tu boleto físico, tu código y el teléfono con el que te registraste.</li>`
    : `<li><b>${r.boleto}</b>: registrado (código ${r.codigo})</li>`)).join('')
  void enviarCorreo(correo, buenos.some((r) => r.gano) ? '¡Ganaste en el sorteo Keeper Cup 3!' : 'Ya participas en el sorteo Keeper Cup 3',
    `<h2>Hola ${esc(nombres)}</h2><ul>${lineas}</ul><p>Guarda tus boletos físicos: son necesarios para cobrar cualquier premio.</p>`)

  const resp = NextResponse.json({ ok: true, nombres, boletos: resultados, quedanSemana: Math.max(0, quedan - buenos.length) })
  resp.cookies.set('kc3d', deviceId, { maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: 'lax', secure: true, path: '/' })
  return resp
}
