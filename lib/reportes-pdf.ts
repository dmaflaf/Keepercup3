// Reportes en PDF (A4) para clubes y uso interno. Texto con Roboto Condensed (incrustada) para tildes y eñes.
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const AZUL = rgb(0.043, 0.071, 0.106), ORO = rgb(0.949, 0.718, 0.02), GRIS = rgb(0.38, 0.42, 0.48), LINEA = rgb(0.88, 0.9, 0.93), ROJO = rgb(0.75, 0.1, 0.17), VERDE = rgb(0.1, 0.55, 0.25)
export interface Col { t: string; w: number; al?: 'l' | 'r' | 'c' }
const A4 = { w: 595.28, h: 841.89 }, M = 40

export class Reporte {
  pdf!: PDFDocument; normal!: PDFFont; negrita!: PDFFont; page!: PDFPage; y = 0; paginaTitulo = ''; subtituloPie = ''
  static async crear(fuentes: { normal: Uint8Array; negrita: Uint8Array }, pie: string) {
    const r = new Reporte(); r.pdf = await PDFDocument.create(); r.pdf.registerFontkit(fontkit)
    r.normal = await r.pdf.embedFont(fuentes.normal, { subset: true }); r.negrita = await r.pdf.embedFont(fuentes.negrita, { subset: true }); r.subtituloPie = pie
    return r
  }
  private corta(t: string, w: number, f: PDFFont, size: number) { let s = String(t ?? ''); if (f.widthOfTextAtSize(s, size) <= w) return s; while (s.length > 1 && f.widthOfTextAtSize(s + '…', size) > w) s = s.slice(0, -1); return s + '…' }
  hoja(titulo: string, sub?: string) {
    this.page = this.pdf.addPage([A4.w, A4.h]); this.paginaTitulo = titulo
    this.page.drawRectangle({ x: 0, y: A4.h - 62, width: A4.w, height: 62, color: AZUL })
    this.page.drawText('KEEPER CUP 3', { x: M, y: A4.h - 38, size: 22, font: this.negrita, color: ORO })
    this.page.drawText(this.corta(titulo, 300, this.negrita, 15), { x: A4.w - M - Math.min(300, this.negrita.widthOfTextAtSize(titulo, 15)), y: A4.h - 36, size: 15, font: this.negrita, color: rgb(1, 1, 1) })
    if (sub) this.page.drawText(this.corta(sub, A4.w - 2 * M, this.normal, 10), { x: M, y: A4.h - 80, size: 10, font: this.normal, color: GRIS })
    this.y = A4.h - (sub ? 100 : 86)
  }
  pie() {
    const n = this.pdf.getPageCount()
    this.pdf.getPages().forEach((p, i) => { p.drawText(`${this.subtituloPie}  ·  Página ${i + 1} de ${n}`, { x: M, y: 22, size: 8, font: this.normal, color: GRIS }) })
  }
  titulo(t: string) { this.espacio(30); this.page.drawText(t, { x: M, y: this.y - 14, size: 14, font: this.negrita, color: AZUL }); this.page.drawRectangle({ x: M, y: this.y - 20, width: 36, height: 2.5, color: ORO }); this.y -= 30 }
  linea(t: string, size = 10, color = AZUL, bold = false) { this.espacio(size + 6); this.page.drawText(this.corta(t, A4.w - 2 * M, bold ? this.negrita : this.normal, size), { x: M, y: this.y - size, size, font: bold ? this.negrita : this.normal, color }); this.y -= size + 6 }
  espacio(h: number) { if (this.y - h < 50) this.hoja(this.paginaTitulo + ' (cont.)') }
  tabla(cols: Col[], filas: (string | { t: string; color?: 'rojo' | 'verde' | 'gris'; negrita?: boolean })[][], opts: { size?: number; zebra?: boolean } = {}) {
    const size = opts.size ?? 9.5, rowH = size + 8
    const dibujaCab = () => {
      this.espacio(rowH * 2)
      this.page.drawRectangle({ x: M, y: this.y - rowH, width: A4.w - 2 * M, height: rowH, color: AZUL })
      let x = M
      for (const c of cols) { const tw = this.negrita.widthOfTextAtSize(c.t, size); this.page.drawText(c.t, { x: c.al === 'r' ? x + c.w - tw - 4 : c.al === 'c' ? x + (c.w - tw) / 2 : x + 4, y: this.y - rowH + 5, size, font: this.negrita, color: rgb(1, 1, 1) }); x += c.w }
      this.y -= rowH
    }
    dibujaCab()
    filas.forEach((f, i) => {
      if (this.y - rowH < 50) { this.hoja(this.paginaTitulo + ' (cont.)'); dibujaCab() }
      if (opts.zebra !== false && i % 2 === 1) this.page.drawRectangle({ x: M, y: this.y - rowH, width: A4.w - 2 * M, height: rowH, color: rgb(0.965, 0.972, 0.98) })
      let x = M
      cols.forEach((c, k) => {
        const cel = f[k]; const t = typeof cel === 'string' ? cel : cel.t
        const color = typeof cel === 'object' && cel.color === 'rojo' ? ROJO : typeof cel === 'object' && cel.color === 'verde' ? VERDE : typeof cel === 'object' && cel.color === 'gris' ? GRIS : AZUL
        const font = typeof cel === 'object' && cel.negrita ? this.negrita : this.normal
        const s = this.corta(t, c.w - 8, font, size); const tw = font.widthOfTextAtSize(s, size)
        this.page.drawText(s, { x: c.al === 'r' ? x + c.w - tw - 4 : c.al === 'c' ? x + (c.w - tw) / 2 : x + 4, y: this.y - rowH + 5, size, font, color }); x += c.w
      })
      this.page.drawLine({ start: { x: M, y: this.y - rowH }, end: { x: A4.w - M, y: this.y - rowH }, thickness: 0.4, color: LINEA })
      this.y -= rowH
    })
    this.y -= 8
  }
  async bytes() { this.pie(); return this.pdf.save() }
}
export const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2)
