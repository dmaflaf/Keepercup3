import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/db'
import { esColor, generarCodigo, hashIp, leerConfig, semanaActual } from '@/lib/sorteo'
import { enviarCorreo } from '@/lib/correo'

export const dynamic = 'force-dynamic'

const MAX_POR_IP_HORA = 60

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

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
  const numero = Number(b.numero)

  if (!b.sigue) return NextResponse.json({ ok: false, message: 'Debes seguir al torneo en Instagram y TikTok para participar.' }, { status: 400 })
  if (nombres.length < 5 || !/\s/.test(nombres) || nombres.length > 80) return NextResponse.json({ ok: false, message: 'Escribe tu nombre completo.' }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo) || correo.length > 120) return NextResponse.json({ ok: false, message: 'Escribe un correo válido.' }, { status: 400 })
  if (!/^09\d{8}$/.test(telefono)) return NextResponse.json({ ok: false, message: 'El teléfono es obligatorio: 10 dígitos que empiecen con 09.' }, { status: 400 })
  if (club.length < 2 || club.length > 60) return NextResponse.json({ ok: false, message: 'Elige el club que apoyas.' }, { status: 400 })
  const equiposValidos = (await prisma.team.findMany({ select: { name: true } })).map((t) => t.name)
  if (equiposValidos.length && club !== 'Otro' && !equiposValidos.includes(club)) return NextResponse.json({ ok: false, message: 'Elige un club de la lista.' }, { status: 400 })

  const cfg = await leerConfig()
  if (!esColor(color) || !cfg.coloresActivos.includes(color)) return NextResponse.json({ ok: false, message: 'Ese color de boleto no está participando en este momento.' }, { status: 400 })
  if (!Number.isInteger(numero) || numero < 1 || numero > cfg.rangoMax) return NextResponse.json({ ok: false, message: `El número de boleto debe estar entre 1 y ${cfg.rangoMax}.` }, { status: 400 })

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sin-ip'
  const ipHash = hashIp(ip)
  const hace1h = new Date(Date.now() - 3600 * 1000)
  if ((await prisma.sorteoBoleto.count({ where: { ipHash, createdAt: { gt: hace1h } } })) >= MAX_POR_IP_HORA) {
    return NextResponse.json({ ok: false, message: 'Demasiados registros desde esta red. Inténtalo más tarde.' }, { status: 429 })
  }

  // Un registro por dispositivo y por teléfono cada semana (lunes a domingo, hora de Ecuador)
  const semana = semanaActual()
  const valido = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(v) ? v : '')
  const deviceIds = Array.from(new Set([valido(req.cookies.get('kc3d')?.value), valido(b.deviceId)].filter(Boolean)))
  const deviceId = deviceIds[0] || randomUUID()
  const yaEstaSemana = await prisma.sorteoBoleto.findFirst({
    where: { semana, OR: [{ telefono }, ...(deviceIds.length ? [{ deviceId: { in: deviceIds } }] : [])] },
    select: { id: true },
  })
  if (yaEstaSemana) {
    return NextResponse.json({ ok: false, message: 'Este dispositivo o teléfono ya registró un boleto esta semana. Podrás registrar otro desde el lunes, con tu nuevo número.' }, { status: 429 })
  }

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

    const etiqueta = `${r.boleto.color.toUpperCase()} ${String(r.boleto.numero).padStart(4, '0')}`
    if (r.premio) {
      void enviarCorreo(correo, '¡Ganaste en el sorteo Keeper Cup 3!',
        `<h2>¡Felicidades ${esc(nombres)}!</h2><p>Tu boleto <b>${etiqueta}</b> ganó: <b>${esc(r.premio.nombre)}</b>.</p><p>Código de cobro: <b style="font-size:22px">${r.cobro}</b></p><p>Reclámalo en ${esc(r.premio.lugar)} presentando tu <b>boleto físico</b> y este código.</p>`)
    } else {
      void enviarCorreo(correo, 'Ya participas en el sorteo Keeper Cup 3',
        `<h2>¡Listo ${esc(nombres)}!</h2><p>Tu boleto <b>${etiqueta}</b> quedó registrado.</p><p>Código de confirmación: <b>${r.boleto.codigo}</b></p><p>Guarda tu boleto físico: lo necesitas si ganas.</p>`)
    }

    const resp = NextResponse.json({
      ok: true,
      gano: !!r.premio,
      codigo: r.boleto.codigo,
      boleto: etiqueta,
      nombres,
      premio: r.premio ? { nombre: r.premio.nombre, categoria: r.premio.categoria, periodo: r.premio.periodo, lugar: r.premio.lugar } : null,
      codigoCobro: r.cobro,
    })
    resp.cookies.set('kc3d', deviceId, { maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: 'lax', secure: true, path: '/' })
    return resp
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const campos = JSON.stringify(e.meta?.target || '')
      if (/telefono|deviceId|semana/.test(campos)) {
        return NextResponse.json({ ok: false, message: 'Este dispositivo o teléfono ya registró un boleto esta semana. Podrás registrar otro desde el lunes.' }, { status: 429 })
      }
      return NextResponse.json({ ok: false, message: 'Ese boleto ya fue registrado. Cada número solo puede registrarse una vez.' }, { status: 409 })
    }
    return NextResponse.json({ ok: false, message: 'No se pudo registrar. Inténtalo de nuevo.' }, { status: 500 })
  }
}
