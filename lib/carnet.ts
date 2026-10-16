import { nombreClubCarnet } from '@/lib/club-nombre'
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, popGraphicsState, pushGraphicsState, moveTo, lineTo, appendBezierCurve, closePath, clip, endPath } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import QRCode from 'qrcode'
import sharp from 'sharp'
import { recorteAPixeles } from '@/lib/encuadre'

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://keeper.com.ec').replace(/\/+$/, '')
export const urlCarnet = (token: string) => `${siteUrl()}/j/${token}`

export interface JugadorCarnet {
  nombres: string
  apellidos: string
  cedula: string | null
  fechaNacimiento: string | null // YYYY-MM-DD
  numero: number | null
  qrToken: string
  selfie: Buffer | null
  crop?: { x: number; y: number; w: number; h: number } | null // encuadre automático/manual (fracciones de la imagen)
}
export interface DatosPdf {
  club: string
  escudo: Buffer | null // PNG sin fondo
  jugadores: JugadorCarnet[]
  plantilla: Uint8Array // PDF vectorial con el arte del carnet (frente y dorso)
  fuentes: { negrita: Uint8Array; normal: Uint8Array; numero: Uint8Array }
  layout?: Partial<Layout>
}

// ---------------------------------------------------------------------------------------------
// Medidas, en puntos (1 pt = 1/72 pulgada), tomadas del PDF "Carnet 26" (Illustrator).
// Todas las posiciones son relativas a la esquina superior izquierda de cada tarjeta.
// ---------------------------------------------------------------------------------------------
export interface Layout {
  foto: { x: number; y: number; w: number; h: number; inset: number; radio: number }
  texto: { cx: number; maxW: number; tam: number; base: [number, number, number, number] }
  escudoFrente: { cx: number; cy: number; w: number; h: number }
  numero: { cx: number; base: number; cap: number; maxW: number }
  banda: { cx: number; base: number; cap: number; maxW: number }
  qr: { cx: number; cy: number; lado: number }
  escudoDorso: { cx: number; cy: number; w: number; h: number }
  nombreDorso: { cx: number; base: number; tam: number; maxW: number }
  /** Rectángulo que tapa el nombre de ejemplo ('Damián Mafla - 25') que trae la franja gris del dorso en la plantilla */
  cubrirDorso: { x0: number; x1: number; y0: number; y1: number }
}

export const LAYOUT_DEFECTO: Layout = {
  foto: { x: 9.6, y: 47.4, w: 78.3, h: 98.1, inset: 1.9, radio: 8 },
  texto: { cx: 48.8, maxW: 76, tam: 11.2, base: [158.6, 168.6, 178.9, 188.8] },
  escudoFrente: { cx: 118.1, cy: 94.8, w: 52, h: 55 },
  numero: { cx: 116.5, base: 190.5, cap: 40.6, maxW: 54 },
  banda: { cx: 78.0, base: 210.9, cap: 11.4, maxW: 140 },
  qr: { cx: 79.4, cy: 117.4, lado: 72 },
  escudoDorso: { cx: 79.4, cy: 36.1, w: 40, h: 42 },
  nombreDorso: { cx: 79.4, base: 210.9, tam: 7.6, maxW: 90 },
  cubrirDorso: { x0: 14, x1: 146, y0: 201.6, y1: 213.9 },
}

// Geometría de la plantilla (página de 328,169 x 254,223 pt): tarjeta frente y dorso
const PLANTILLA = { alto: 254.223, tarjetaW: 155.98, tarjetaH: 240.94, top: 4.2, frenteX: 4.92, dorsoX: 166.78 }
const MM = 72 / 25.4
const A4 = { w: 595.276, h: 841.89 }
const SEPARACION = 2 * MM // 2 mm entre carnets
const NAVY = rgb(0.039, 0.071, 0.106)
const ROJO = rgb(0.749, 0.106, 0.173)
const BLANCO = rgb(1, 1, 1)
const GRIS_FRANJA = rgb(0.482, 0.475, 0.475) // #7b7979, color de la franja del dorso

export function mezclarLayout(parcial?: Partial<Layout>): Layout {
  const out = JSON.parse(JSON.stringify(LAYOUT_DEFECTO)) as Layout
  if (!parcial) return out
  for (const k of Object.keys(parcial) as (keyof Layout)[]) Object.assign(out[k], parcial[k])
  return out
}

type Fuentes = { negrita: PDFFont; normal: PDFFont; numero: PDFFont }

function capRatio(f: PDFFont): number {
  const e = (f as unknown as { embedder?: { font?: { capHeight?: number; unitsPerEm?: number } } }).embedder?.font
  return e?.capHeight && e.unitsPerEm ? e.capHeight / e.unitsPerEm : 0.7
}
function seguro(f: PDFFont, t: string): string {
  try { f.widthOfTextAtSize(t, 10); return t } catch { return t.replace(/[^ -ÿ]/g, '') }
}
function ajustarTam(f: PDFFont, t: string, tam: number, maxW: number, min = 5) {
  let s = tam
  while (s > min && f.widthOfTextAtSize(t, s) > maxW) s -= 0.25
  return s
}
const primera = (s: string) => (s || '').trim().split(/\s+/)[0] || ''
const fechaDMY = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '')

/** Hoja A4 con 9 carnets (3x3) con 2 mm entre ellos. Cada hoja de frentes va seguida de su hoja de dorsos (columnas espejadas, voltear por el lado largo). */
export async function construirPdf(d: DatosPdf): Promise<Uint8Array> {
  const L = mezclarLayout(d.layout)
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const fu: Fuentes = {
    negrita: await pdf.embedFont(d.fuentes.negrita, { subset: true }),
    normal: await pdf.embedFont(d.fuentes.normal, { subset: true }),
    numero: await pdf.embedFont(d.fuentes.numero, { subset: true }),
  }
  const origen = await PDFDocument.load(d.plantilla)
  const pagOrigen = origen.getPages()[0]
  const caja = (x0: number) => ({ left: x0 - 0.25, right: x0 + PLANTILLA.tarjetaW + 0.25, top: PLANTILLA.alto - PLANTILLA.top + 0.25, bottom: PLANTILLA.alto - (PLANTILLA.top + PLANTILLA.tarjetaH) - 0.25 })
  const artFrente = await pdf.embedPage(pagOrigen, caja(PLANTILLA.frenteX))
  const artDorso = await pdf.embedPage(pagOrigen, caja(PLANTILLA.dorsoX))
  const escudo = d.escudo ? await pdf.embedPng(d.escudo).catch(() => null) : null

  const W = PLANTILLA.tarjetaW
  const H = PLANTILLA.tarjetaH
  const x0 = (A4.w - (3 * W + 2 * SEPARACION)) / 2
  const y0 = (A4.h - (3 * H + 2 * SEPARACION)) / 2
  const club = seguro(fu.numero, nombreClubCarnet(d.club))

  for (let i = 0; i < d.jugadores.length; i += 9) {
    const lote = d.jugadores.slice(i, i + 9)
    const pf = pdf.addPage([A4.w, A4.h])
    const pd = pdf.addPage([A4.w, A4.h])
    for (let k = 0; k < lote.length; k++) {
      const r = Math.floor(k / 3)
      const c = k % 3
      const top = y0 + r * (H + SEPARACION)
      await dibujarFrente(pdf, pf, artFrente, x0 + c * (W + SEPARACION), top, lote[k], L, fu, escudo, club)
      await dibujarDorso(pdf, pd, artDorso, x0 + (2 - c) * (W + SEPARACION), top, lote[k], L, fu, escudo)
    }
  }
  if (!d.jugadores.length) pdf.addPage([A4.w, A4.h])
  return pdf.save()
}

type Origen = { x: number; top: number }
const yPdf = (o: Origen, relTop: number) => A4.h - (o.top + relTop)

function texto(p: PDFPage, o: Origen, f: PDFFont, t: string, cx: number, base: number, tam: number, color = NAVY) {
  const s = seguro(f, t)
  p.drawText(s, { x: o.x + cx - f.widthOfTextAtSize(s, tam) / 2, y: yPdf(o, base), size: tam, font: f, color })
}
function contener(img: PDFImage, w: number, h: number) {
  const k = Math.min(w / img.width, h / img.height)
  return { w: img.width * k, h: img.height * k }
}
function rectRedondeado(p: PDFPage, x: number, y: number, w: number, h: number, r: number) {
  const k = 0.5523 * r
  p.pushOperators(
    pushGraphicsState(),
    moveTo(x + r, y), lineTo(x + w - r, y), appendBezierCurve(x + w - r + k, y, x + w, y + r - k, x + w, y + r),
    lineTo(x + w, y + h - r), appendBezierCurve(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h),
    lineTo(x + r, y + h), appendBezierCurve(x + r - k, y + h, x, y + h - r + k, x, y + h - r),
    lineTo(x, y + r), appendBezierCurve(x, y + r - k, x + r - k, y, x + r, y),
    closePath(), clip(), endPath()
  )
}

async function dibujarFrente(pdf: PDFDocument, p: PDFPage, art: Awaited<ReturnType<PDFDocument['embedPage']>>, x: number, top: number, j: JugadorCarnet, L: Layout, f: Fuentes, escudo: PDFImage | null, club: string) {
  const o: Origen = { x, top }
  p.drawPage(art, { x: x - 0.25, y: A4.h - top - PLANTILLA.tarjetaH - 0.25 })

  // Foto recortada al marco redondeado
  const F = L.foto
  const iw = F.w - 2 * F.inset
  const ih = F.h - 2 * F.inset
  if (j.selfie) {
    try {
      let base = sharp(j.selfie).rotate()
      if (j.crop) {
        const norm = await sharp(j.selfie).rotate().toBuffer({ resolveWithObject: true })
        const r = recorteAPixeles(j.crop, norm.info.width, norm.info.height)
        base = sharp(norm.data).extract(r)
      }
      const jpg = await base.resize(Math.round(iw * 10), Math.round(ih * 10), { fit: 'cover', position: 'attention' }).jpeg({ quality: 88 }).toBuffer()
      const img = await pdf.embedJpg(jpg)
      rectRedondeado(p, x + F.x + F.inset, yPdf(o, F.y + F.inset + ih), iw, ih, Math.max(F.radio - F.inset, 1))
      p.drawImage(img, { x: x + F.x + F.inset, y: yPdf(o, F.y + F.inset + ih), width: iw, height: ih })
      p.pushOperators(popGraphicsState())
    } catch { /* sin foto */ }
  }

  // Datos: nombres (negrita), apellidos, cédula y fecha de nacimiento
  const T = L.texto
  const lineas: [string, PDFFont][] = [
    [j.nombres, f.negrita], [j.apellidos, f.normal], [j.cedula || '', f.normal], [fechaDMY(j.fechaNacimiento), f.normal],
  ]
  lineas.forEach(([t, fu], i) => {
    if (!t) return
    const s = seguro(fu, t)
    texto(p, o, fu, s, T.cx, T.base[i], ajustarTam(fu, s, T.tam, T.maxW))
  })

  // Escudo del club (PNG sin fondo)
  if (escudo) {
    const E = L.escudoFrente
    const s = contener(escudo, E.w, E.h)
    p.drawImage(escudo, { x: x + E.cx - s.w / 2, y: yPdf(o, E.cy) - s.h / 2, width: s.w, height: s.h })
  }

  // Número grande (rojo)
  if (j.numero !== null) {
    const N = L.numero
    const t = String(j.numero)
    const tam = ajustarTam(f.numero, t, N.cap / capRatio(f.numero), N.maxW)
    texto(p, o, f.numero, t, N.cx, N.base, tam, ROJO)
  }

  // Franja: nombre del club sin «Fútbol Club», «Sporting Club», «FC»…; si es largo se reduce para que quepa
  const B = L.banda
  const tamB = ajustarTam(f.numero, club, B.cap / capRatio(f.numero), B.maxW, 8)
  texto(p, o, f.numero, club, B.cx, B.base, tamB, BLANCO)
}

async function dibujarDorso(pdf: PDFDocument, p: PDFPage, art: Awaited<ReturnType<PDFDocument['embedPage']>>, x: number, top: number, j: JugadorCarnet, L: Layout, f: Fuentes, escudo: PDFImage | null) {
  const o: Origen = { x, top }
  p.drawPage(art, { x: x - 0.25, y: A4.h - top - PLANTILLA.tarjetaH - 0.25 })

  if (escudo) {
    const E = L.escudoDorso
    const s = contener(escudo, E.w, E.h)
    p.drawImage(escudo, { x: x + E.cx - s.w / 2, y: yPdf(o, E.cy) - s.h / 2, width: s.w, height: s.h })
  }

  // QR vectorial (negro sobre blanco) dentro del marco
  const qr = QRCode.create(urlCarnet(j.qrToken), { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const lado = L.qr.lado
  const cell = lado / n
  const qx = x + L.qr.cx - lado / 2
  const qTop = L.qr.cy - lado / 2
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.modules.get(r, c)) p.drawRectangle({ x: qx + c * cell - 0.05, y: yPdf(o, qTop + (r + 1) * cell) - 0.05, width: cell + 0.1, height: cell + 0.1, color: rgb(0, 0, 0) })
  }

  // Tapa el nombre de ejemplo de la plantilla con el gris de la franja
  const C = L.cubrirDorso
  p.drawRectangle({ x: x + C.x0, y: yPdf(o, C.y1), width: C.x1 - C.x0, height: C.y1 - C.y0, color: GRIS_FRANJA })

  // Identificación para el corte: "Nombre Apellido - Número"
  const nombre = `${primera(j.nombres)} ${primera(j.apellidos)}`.trim() + (j.numero !== null ? ` - ${j.numero}` : '')
  const D = L.nombreDorso
  const s = seguro(f.negrita, nombre)
  texto(p, o, f.negrita, s, D.cx, D.base, ajustarTam(f.negrita, s, D.tam, D.maxW), NAVY)
}
