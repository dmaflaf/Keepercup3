// Nómina oficial de un club en PDF (A4): encabezado Keeper Cup 3 con escudo grande, datos del club y tabla de jugadores con foto pequeña.
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

export interface JugadorNomina { numero: number | null; apellidos: string; nombres: string; cedula: string; nacimiento: string | null; edad: number | null; posicion: string; telefono: string; estado: string; foto: Buffer | null }
export interface DatosNomina { club: string; ciudad: string; director: string; telefono: string; escudo: Buffer | null; jugadores: JugadorNomina[]; generado: string; fuentes: { normal: Uint8Array; negrita: Uint8Array } }

const AZUL = rgb(0.043, 0.071, 0.106), ORO = rgb(0.949, 0.718, 0.02), GRIS = rgb(0.38, 0.42, 0.48), LINEA = rgb(0.88, 0.9, 0.93), ROJO = rgb(0.75, 0.1, 0.17), VERDE = rgb(0.1, 0.55, 0.25), AMBAR = rgb(0.7, 0.45, 0.02), BLANCO = rgb(1, 1, 1)
const W = 595.28, H = 841.89, M = 40
const COLS = [{ t: 'N.º', w: 26, a: 'c' }, { t: 'Foto', w: 38, a: 'c' }, { t: 'Apellidos y nombres', w: 142, a: 'l' }, { t: 'Cédula', w: 64, a: 'l' }, { t: 'F. nacimiento', w: 56, a: 'c' }, { t: 'Edad', w: 26, a: 'c' }, { t: 'Posición', w: 58, a: 'l' }, { t: 'Teléfono', w: 60, a: 'l' }, { t: 'Estado', w: 45, a: 'c' }] as const

export async function construirNomina(d: DatosNomina): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const normal = await pdf.embedFont(d.fuentes.normal, { subset: true })
  const negrita = await pdf.embedFont(d.fuentes.negrita, { subset: true })
  const escudo: PDFImage | null = d.escudo ? await pdf.embedPng(d.escudo).catch(() => null) : null
  const corta = (t: string, w: number, f: PDFFont, s: number) => { let x = t; if (f.widthOfTextAtSize(x, s) <= w) return x; while (x.length > 1 && f.widthOfTextAtSize(x + '…', s) > w) x = x.slice(0, -1); return x + '…' }
  const fechaCorta = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')

  let page!: PDFPage, y = 0
  const cabeceraTabla = () => {
    page.drawRectangle({ x: M, y: y - 20, width: W - 2 * M, height: 20, color: AZUL })
    let x = M
    for (const c of COLS) { const tw = negrita.widthOfTextAtSize(c.t, 8.5); page.drawText(c.t, { x: c.a === 'c' ? x + (c.w - tw) / 2 : x + 4, y: y - 14, size: 8.5, font: negrita, color: BLANCO }); x += c.w }
    y -= 20
  }
  const primera = () => {
    page = pdf.addPage([W, H])
    page.drawRectangle({ x: 0, y: H - 150, width: W, height: 150, color: AZUL })
    page.drawRectangle({ x: 0, y: H - 154, width: W, height: 4, color: ORO })
    page.drawText('KEEPER CUP 3', { x: M, y: H - 70, size: 36, font: negrita, color: ORO })
    page.drawText('NÓMINA OFICIAL DE JUGADORES', { x: M + 2, y: H - 96, size: 14, font: negrita, color: BLANCO })
    page.drawText(d.generado, { x: M + 2, y: H - 118, size: 9.5, font: normal, color: rgb(0.7, 0.75, 0.82) })
    // Escudo grande sobre un círculo blanco para que se vea con cualquier color
    const cx = W - M - 62, cy = H - 77
    page.drawCircle({ x: cx, y: cy, size: 62, color: BLANCO, borderColor: ORO, borderWidth: 3 })
    if (escudo) { const k = Math.min(86 / escudo.width, 86 / escudo.height); page.drawImage(escudo, { x: cx - (escudo.width * k) / 2, y: cy - (escudo.height * k) / 2, width: escudo.width * k, height: escudo.height * k }) }
    else { const ini = d.club.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase(); const tw = negrita.widthOfTextAtSize(ini, 34); page.drawText(ini, { x: cx - tw / 2, y: cy - 12, size: 34, font: negrita, color: AZUL }) }
    page.drawText(corta(d.club.toUpperCase(), W - 2 * M, negrita, 28), { x: M, y: H - 196, size: 28, font: negrita, color: AZUL })
    const info = [d.ciudad && `Ciudad: ${d.ciudad}`, d.director && `Director: ${d.director}`, d.telefono && `Teléfono: ${d.telefono}`].filter(Boolean).join('   ·   ')
    if (info) page.drawText(corta(info, W - 2 * M, normal, 10.5), { x: M, y: H - 214, size: 10.5, font: normal, color: GRIS })
    const hab = d.jugadores.filter((j) => j.estado === 'habilitado').length
    const chips = [`${d.jugadores.length} jugadores`, `${hab} habilitados`, `${d.jugadores.length - hab} pendientes`]
    let cxx = M
    for (const t of chips) { const w = negrita.widthOfTextAtSize(t, 10) + 20; page.drawRectangle({ x: cxx, y: H - 246, width: w, height: 20, color: rgb(0.94, 0.95, 0.97), borderColor: LINEA, borderWidth: 0.6 }); page.drawText(t, { x: cxx + 10, y: H - 240, size: 10, font: negrita, color: AZUL }); cxx += w + 8 }
    y = H - 262
  }
  const siguiente = () => {
    page = pdf.addPage([W, H])
    page.drawRectangle({ x: 0, y: H - 44, width: W, height: 44, color: AZUL })
    page.drawText('KEEPER CUP 3', { x: M, y: H - 29, size: 15, font: negrita, color: ORO })
    const t = `Nómina · ${d.club}`; page.drawText(corta(t, 300, negrita, 11), { x: W - M - Math.min(300, negrita.widthOfTextAtSize(t, 11)) - (escudo ? 30 : 0), y: H - 28, size: 11, font: negrita, color: BLANCO })
    if (escudo) { const k = Math.min(26 / escudo.width, 26 / escudo.height); page.drawCircle({ x: W - M - 12, y: H - 22, size: 15, color: BLANCO }); page.drawImage(escudo, { x: W - M - 12 - (escudo.width * k) / 2, y: H - 22 - (escudo.height * k) / 2, width: escudo.width * k, height: escudo.height * k }) }
    y = H - 62
  }

  primera(); cabeceraTabla()
  const RH = 38
  for (let i = 0; i < d.jugadores.length; i++) {
    if (y - RH < 70) { siguiente(); cabeceraTabla() }
    const j = d.jugadores[i]
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - RH, width: W - 2 * M, height: RH, color: rgb(0.965, 0.972, 0.98) })
    let x = M
    const celda = (k: number, t: string, o: { f?: PDFFont; c?: ReturnType<typeof rgb>; s?: number } = {}) => { const c = COLS[k], f = o.f ?? normal, s = o.s ?? 9; const tx = corta(t, c.w - 8, f, s); const tw = f.widthOfTextAtSize(tx, s); page.drawText(tx, { x: c.a === 'c' ? x + (c.w - tw) / 2 : x + 4, y: y - RH / 2 - s / 3, size: s, font: f, color: o.c ?? AZUL }) }
    celda(0, j.numero === null ? '–' : String(j.numero), { f: negrita, s: 11, c: ROJO }); x += COLS[0].w
    if (j.foto) { try { const img = await pdf.embedJpg(j.foto); page.drawImage(img, { x: x + 5, y: y - RH + 2, width: 28, height: 34 }) } catch { /* sin foto */ } }
    else { page.drawRectangle({ x: x + 5, y: y - RH + 2, width: 28, height: 34, color: rgb(0.9, 0.92, 0.95) }); page.drawText('sin foto', { x: x + 8, y: y - RH / 2 - 2, size: 5.5, font: normal, color: GRIS }) }
    x += COLS[1].w
    // Apellidos en negrita y nombres debajo
    { const c = COLS[2]; page.drawText(corta(j.apellidos.toUpperCase(), c.w - 8, negrita, 9.5), { x: x + 4, y: y - 16, size: 9.5, font: negrita, color: AZUL }); page.drawText(corta(j.nombres, c.w - 8, normal, 9), { x: x + 4, y: y - 28, size: 9, font: normal, color: GRIS }); x += c.w }
    celda(3, j.cedula || '—', { s: 9 }); x += COLS[3].w
    celda(4, fechaCorta(j.nacimiento), { s: 8.5 }); x += COLS[4].w
    celda(5, j.edad === null ? '—' : String(j.edad), { s: 9 }); x += COLS[5].w
    celda(6, j.posicion || '—', { s: 8.5 }); x += COLS[6].w
    celda(7, j.telefono || '—', { s: 8.5 }); x += COLS[7].w
    const ok = j.estado === 'habilitado'
    celda(8, ok ? 'Habilitado' : j.estado === 'suspendido' ? 'Suspendido' : 'Pendiente', { f: negrita, s: 7.5, c: ok ? VERDE : j.estado === 'suspendido' ? ROJO : AMBAR })
    page.drawLine({ start: { x: M, y: y - RH }, end: { x: W - M, y: y - RH }, thickness: 0.4, color: LINEA })
    y -= RH
  }
  if (!d.jugadores.length) page.drawText('Este club todavía no tiene jugadores cargados.', { x: M, y: y - 30, size: 11, font: normal, color: GRIS })

  // Firmas
  if (y < 120) siguiente()
  const yf = y - 55 // firmas justo debajo de la tabla (o al inicio de una hoja nueva)
  for (const [i, t] of ['Director / delegado del club', 'Organización Keeper Cup'].entries()) {
    const x0 = M + i * 270
    page.drawLine({ start: { x: x0, y: yf }, end: { x: x0 + 215, y: yf }, thickness: 0.8, color: AZUL })
    page.drawText(t, { x: x0, y: yf - 13, size: 9, font: normal, color: GRIS })
  }
  const n = pdf.getPageCount()
  pdf.getPages().forEach((p, i) => p.drawText(`Keeper Cup 3 · Nómina de ${d.club} · Página ${i + 1} de ${n}`, { x: M, y: 24, size: 8, font: normal, color: GRIS }))
  return pdf.save()
}
