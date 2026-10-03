import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { esColor, generarCodigo, hashIp, leerConfig } from '@/lib/sorteo'
import { enviarCorreo } from '@/lib/correo'

export const dynamic = 'force-dynamic'

const MAX_POR_CORREO_DIA = 10
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
  const color = b.color
  const numero = Number(b.numero)

  if (!b.sigue) return NextResponse.json({ ok: false, message: 'Debes seguir al torneo en Instagram y TikTok para participar.' }, { status: 400 })
  if (nombres.length < 5 || !/\s/.test(nombres) || nombres.length > 80) return NextResponse.json({ ok: false, message: 'Escribe tu nombre completo.' }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo) || correo.length > 120) return NextResponse.json({ ok: false, message: 'Escribe un correo válido.' }, { status: 400 })
  if (telefono && !/^09\d{8}$/.test(telefono)) return NextResponse.json({ ok: false, message: 'El teléfono debe tener 10 dígitos y empezar con 09.' }, { status: 400 })

  const cfg = await leerConfig()
  if (!esColor(color) || !cfg.coloresActivos.includes(color)) return NextResponse.json({ ok: false, message: 'Ese color de boleto no está participando en este momento.' }, { status: 400 })
  if (!Number.isInteger(numero) || numero < 1 || numero > cfg.rangoMax) return NextResponse.json({ ok: false, message: `El número de boleto debe estar entre 1 y ${cfg.rangoMax}.` }, { status: 400 })

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sin-ip'
  const ipHash = hashIp(ip)
  const hace1h = new Date(Date.now() - 3600 * 1000)
  const hace24h = new Date(Date.now() - 24 * 3600 * 1000)
  const [porIp, porCorreo] = await Promise.all([
    prisma.sorteoBoleto.count({ where: { ipHash, createdAt: { gt: hace1h } } }),
    prisma.sorteoBoleto.count({ where: { correo, createdAt: { gt: hace24h } } }),
  ])
  if (porIp >= MAX_POR_IP_HORA || porCorreo >= MAX_POR_CORREO_DIA) {
    return NextResponse.json({ ok: false, message: 'Demasiados registros desde este dispositivo o correo. Inténtalo más tarde.' }, { status: 429 })
  }

  try {
    const r = await prisma.$transaction(async (tx) => {
      const boleto = await tx.sorteoBoleto.create({
        data: { color, numero, nombres, correo, telefono: telefono || null, codigo: generarCodigo(6, 'KC3-'), ipHash },
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

    return NextResponse.json({
      ok: true,
      gano: !!r.premio,
      codigo: r.boleto.codigo,
      boleto: etiqueta,
      nombres,
      premio: r.premio ? { nombre: r.premio.nombre, categoria: r.premio.categoria, periodo: r.premio.periodo, lugar: r.premio.lugar } : null,
      codigoCobro: r.cobro,
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ ok: false, message: 'Ese boleto ya fue registrado. Cada número solo puede registrarse una vez.' }, { status: 409 })
    }
    return NextResponse.json({ ok: false, message: 'No se pudo registrar. Inténtalo de nuevo.' }, { status: 500 })
  }
}
