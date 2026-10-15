import { PDFDocument, PDFFont, PDFImage, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'
import sharp from 'sharp'

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://keeper.com.ec').replace(/\/+$/, '')
export const urlCarnet = (token: string) => `${siteUrl()}/j/${token}`

export interface JugadorCarnet {
  nombres: string
  apellidos: string
  numero: number | null
  estado: string
  qrToken: string
  selfie: Buffer | null
}
export interface DatosPdf {
  club: string
  escudo: Buffer | null // PNG
  auspicios: Buffer[] // PNG
  logoTorneo: Buffer | null // PNG
  jugadores: JugadorCarnet[]
}

const MM = 72 / 25.4
const mm = (n: number) => n * MM
const NAVY = rgb(0.024, 0.075, 0.149)
const GOLD = rgb(0.851, 0.663, 0.227)
const GREEN = rgb(0.184, 0.702, 0.267)
const AMBER = rgb(0.95, 0.72, 0.1)
const RED = rgb(0.85, 0.2, 0.2)
const DIM = rgb(0.56, 0.63, 0.71)
const W = 54
const H = 85.6
const GAP = 4
const A4 = { w: 210, h: 297 }

const sinTildesRaros = (s: string) => s.replace(/[^ -ÿ]/g, '')

function colorEstado(e: string) {
  return e === 'habilitado' ? GREEN : e === 'suspendido' ? RED : AMBER
}

/** Hoja A4 con 9 carnets (3x3). Primero las hojas de frentes y, tras cada una, la de dorsos con columnas espejadas (impresión a doble cara, voltear por el lado largo). */
export async function construirPdf(d: DatosPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const normal = await pdf.embedFont(StandardFonts.Helvetica)
  const emb = async (b: Buffer | null) => (b ? await pdf.embedPng(b).catch(() => null) : null)
  const escudo = await emb(d.escudo)
  const logo = await emb(d.logoTorneo)
  const aus = (await Promise.all(d.auspicios.slice(0, 4).map(emb))).filter(Boolean) as PDFImage[]

  const x0 = (A4.w - (3 * W + 2 * GAP)) / 2
  const y0 = (A4.h - (3 * H + 2 * GAP)) / 2
  const porHoja = 9

  for (let i = 0; i < d.jugadores.length; i += porHoja) {
    const lote = d.jugadores.slice(i, i + porHoja)
    const frente = pdf.addPage([mm(A4.w), mm(A4.h)])
    const dorso = pdf.addPage([mm(A4.w), mm(A4.h)])
    for (let k = 0; k < lote.length; k++) {
      const r = Math.floor(k / 3)
      const c = k % 3
      const top = y0 + r * (H + GAP)
      await dibujarFrente(pdf, frente, x0 + c * (W + GAP), top, lote[k], { bold, logo })
      await dibujarDorso(pdf, dorso, x0 + (2 - c) * (W + GAP), top, lote[k], { bold, normal, escudo, logo, aus, club: d.club })
    }
  }
  if (!d.jugadores.length) pdf.addPage([mm(A4.w), mm(A4.h)])
  return pdf.save()
}

type Pag = ReturnType<PDFDocument['addPage']>
const Y = (top: number, alto = 0) => mm(A4.h - top - alto)

function ajustar(font: PDFFont, texto: string, maxMm: number, tam: number, min = 6) {
  let t = tam
  while (t > min && font.widthOfTextAtSize(texto, t) > mm(maxMm)) t -= 0.5
  return t
}
function centrado(p: Pag, font: PDFFont, texto: string, cx: number, top: number, tam: number, color = rgb(1, 1, 1)) {
  const w = font.widthOfTextAtSize(texto, tam)
  p.drawText(texto, { x: mm(cx) - w / 2, y: Y(top), size: tam, font, color })
}
function contener(img: PDFImage, boxW: number, boxH: number) {
  const k = Math.min(mm(boxW) / img.width, mm(boxH) / img.height)
  return { w: img.width * k, h: img.height * k }
}

async function dibujarFrente(pdf: PDFDocument, p: Pag, x: number, top: number, j: JugadorCarnet, f: { bold: PDFFont; logo: PDFImage | null }) {
  p.drawRectangle({ x: mm(x), y: Y(top, H), width: mm(W), height: mm(H), color: NAVY })
  p.drawRectangle({ x: mm(x + 6), y: Y(top, 0.8), width: mm(W - 12), height: mm(0.8), color: GOLD })
  if (f.logo) {
    const s = contener(f.logo, 30, 8)
    p.drawImage(f.logo, { x: mm(x + W / 2) - s.w / 2, y: Y(top + 3, 0) - s.h, width: s.w, height: s.h })
  } else centrado(p, f.bold, 'KEEPER CUP 3', x + W / 2, top + 8, 9, GOLD)

  // Foto (recorte exacto 36 x 43 mm)
  const fw = 36, fh = 43
  if (j.selfie) {
    try {
      const jpg = await sharp(j.selfie).rotate().resize(432, 516, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82 }).toBuffer()
      const img = await pdf.embedJpg(jpg)
      p.drawImage(img, { x: mm(x + (W - fw) / 2), y: Y(top + 14, fh), width: mm(fw), height: mm(fh) })
    } catch { /* sin foto */ }
  } else {
    p.drawRectangle({ x: mm(x + (W - fw) / 2), y: Y(top + 14, fh), width: mm(fw), height: mm(fh), color: rgb(0.08, 0.16, 0.29) })
    centrado(p, f.bold, 'SIN FOTO', x + W / 2, top + 37, 7, DIM)
  }

  centrado(p, f.bold, j.numero !== null ? String(j.numero) : '-', x + W / 2, top + 66, 26, GOLD)
  const l1 = sinTildesRaros(j.nombres.toUpperCase())
  const l2 = sinTildesRaros(j.apellidos.toUpperCase())
  centrado(p, f.bold, l1, x + W / 2, top + 72.5, ajustar(f.bold, l1, W - 6, 9.5), rgb(1, 1, 1))
  centrado(p, f.bold, l2, x + W / 2, top + 77, ajustar(f.bold, l2, W - 6, 9.5), GOLD)
  p.drawRectangle({ x: mm(x), y: Y(top, H), width: mm(W), height: mm(2.2), color: colorEstado(j.estado) })
}

async function dibujarDorso(pdf: PDFDocument, p: Pag, x: number, top: number, j: JugadorCarnet, f: { bold: PDFFont; normal: PDFFont; escudo: PDFImage | null; logo: PDFImage | null; aus: PDFImage[]; club: string }) {
  p.drawRectangle({ x: mm(x), y: Y(top, H), width: mm(W), height: mm(H), color: rgb(1, 1, 1), borderColor: rgb(0.85, 0.87, 0.9), borderWidth: 0.5 })
  const cx = x + W / 2
  // Escudo (o iniciales)
  if (f.escudo) {
    const s = contener(f.escudo, 13, 13)
    p.drawImage(f.escudo, { x: mm(cx) - s.w / 2, y: Y(top + 4) - s.h, width: s.w, height: s.h })
  } else {
    p.drawCircle({ x: mm(cx), y: Y(top + 10.5), size: mm(6.2), color: NAVY, borderColor: GOLD, borderWidth: 1 })
    const ini = f.club.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'KC'
    centrado(p, f.bold, sinTildesRaros(ini), cx, top + 12, 9, rgb(1, 1, 1))
  }
  const club = sinTildesRaros(f.club.toUpperCase())
  centrado(p, f.bold, club, cx, top + 21.5, ajustar(f.bold, club, W - 6, 8), NAVY)

  // QR (vectorial, negro sobre blanco)
  const qr = QRCode.create(urlCarnet(j.qrToken), { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const lado = 30
  const cell = lado / n
  const qx = cx - lado / 2
  const qy = top + 25
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.modules.get(r, c)) p.drawRectangle({ x: mm(qx + c * cell), y: Y(qy + r * cell, cell) - 0.15, width: mm(cell) + 0.3, height: mm(cell) + 0.3, color: rgb(0, 0, 0) })
  }
  centrado(p, f.bold, 'ESCANEA PARA VERIFICAR', cx, top + 60, 5.2, rgb(0.4, 0.43, 0.5))
  p.drawRectangle({ x: mm(x + 6), y: Y(top + 66, 0.2), width: mm(W - 12), height: mm(0.2), color: rgb(0.88, 0.9, 0.93) })

  // Logo del torneo sobre franja azul
  p.drawRectangle({ x: mm(cx - 11), y: Y(top + 67.5, 6.2), width: mm(22), height: mm(6.2), color: NAVY })
  if (f.logo) {
    const s = contener(f.logo, 18, 4)
    p.drawImage(f.logo, { x: mm(cx) - s.w / 2, y: Y(top + 68.6) - s.h, width: s.w, height: s.h })
  }
  // Auspicios (hasta 4)
  const bw = 11, bh = 7, gap = 1.3
  const total = Math.min(4, Math.max(f.aus.length, 0))
  if (total) {
    const ancho = total * bw + (total - 1) * gap
    f.aus.slice(0, 4).forEach((img, i) => {
      const s = contener(img, bw - 1, bh - 1)
      const bx = cx - ancho / 2 + i * (bw + gap)
      p.drawImage(img, { x: mm(bx + bw / 2) - s.w / 2, y: Y(top + 75.8 + bh / 2) - s.h / 2, width: s.w, height: s.h })
    })
  }
}
