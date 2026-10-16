// Encuadre automático de la foto del carnet a partir del rostro detectado.
// Calibrado con la foto de referencia aprobada por la organización: la cara (caja del detector) ocupa ~46 % de la altura
// del marco, centrada horizontalmente, y la línea de los ojos queda a ~46 % desde arriba.

export const ENCUADRE = {
  aspecto: 74.5 / 94.3, // ancho / alto del marco de la foto en el carnet
  caraFrac: 0.461, // alto de la caja de la cara / alto del recorte
  ojosY: 0.457, // posición vertical de los ojos dentro del recorte
  ojosEnCaja: 0.287, // ojos dentro de la caja de la cara (si el detector no los da)
  minPx: 240, // ancho mínimo del recorte para imprimir bien (~230 ppp a 26 mm)
}

export interface CajaCara { x: number; y: number; w: number; h: number } // en píxeles de la imagen
export interface Recorte { x: number; y: number; w: number; h: number } // fracciones 0..1 de la imagen

export interface ResultadoEncuadre {
  crop: Recorte | null
  estado: 'auto' | 'revisar'
  motivos: string[]
}

const r4 = (n: number) => Math.round(n * 10000) / 10000

/** Calcula el recorte para una imagen (imgW x imgH) con la cara detectada. ojosY en píxeles (opcional). */
export function calcularRecorte(imgW: number, imgH: number, cara: CajaCara, ojosYpx?: number | null): ResultadoEncuadre {
  const motivos: string[] = []
  const cx = cara.x + cara.w / 2
  const ojos = ojosYpx ?? cara.y + ENCUADRE.ojosEnCaja * cara.h

  // Cara cortada por el borde de la foto original
  const fuera = Math.max(-cara.x, -cara.y, cara.x + cara.w - imgW, cara.y + cara.h - imgH)
  if (fuera > 0.08 * cara.h) motivos.push('Rostro cortado en la foto original')

  let H = cara.h / ENCUADRE.caraFrac
  let W = ENCUADRE.aspecto * H
  let escalaLimitada = false
  if (H > imgH) { H = imgH; W = ENCUADRE.aspecto * H; escalaLimitada = true }
  if (W > imgW) { W = imgW; H = W / ENCUADRE.aspecto; escalaLimitada = true }

  let top = ojos - ENCUADRE.ojosY * H
  let left = cx - W / 2
  const pasoTop = top < 0 ? -top : top + H > imgH ? top + H - imgH : 0
  const pasoLeft = left < 0 ? -left : left + W > imgW ? left + W - imgW : 0
  top = Math.min(Math.max(top, 0), imgH - H)
  left = Math.min(Math.max(left, 0), imgW - W)
  if (pasoTop > 0.12 * H) motivos.push('Cabeza o cuerpo demasiado cerca del borde de la foto')
  if (pasoLeft > 0.12 * W) motivos.push('Rostro muy descentrado en la foto')
  if (escalaLimitada && cara.h / H > 0.62) motivos.push('Foto muy cerrada: la cara ocupa casi todo el cuadro')
  if (W < ENCUADRE.minPx) motivos.push(`Resolución baja (${Math.round(W)} px de ancho útil)`)

  return {
    crop: { x: r4(left / imgW), y: r4(top / imgH), w: r4(W / imgW), h: r4(H / imgH) },
    estado: motivos.length ? 'revisar' : 'auto',
    motivos,
  }
}

/** Convierte el recorte normalizado a píxeles seguros dentro de la imagen. */
export function recorteAPixeles(c: Recorte, imgW: number, imgH: number) {
  const left = Math.max(0, Math.min(imgW - 2, Math.round(c.x * imgW)))
  const top = Math.max(0, Math.min(imgH - 2, Math.round(c.y * imgH)))
  const width = Math.max(2, Math.min(imgW - left, Math.round(c.w * imgW)))
  const height = Math.max(2, Math.min(imgH - top, Math.round(c.h * imgH)))
  return { left, top, width, height }
}
