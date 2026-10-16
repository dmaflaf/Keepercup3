// Detección y enderezado de cédulas (frente/reverso) con OpenCV.js, en el navegador.
// La cédula es una tarjeta ID-1 (85,6 × 54 mm): proporción 1,586. Se busca el cuadrilátero más grande con esa proporción,
// se corrige la perspectiva y se entrega una imagen horizontal de ANCHO × ALTO.

export const CEDULA = { ratio: 85.6 / 54, ancho: 1200, alto: Math.round(1200 / (85.6 / 54)), tolerancia: 0.2, areaMin: 0.12 }

export type Punto = [number, number] // píxeles de la imagen original
export type Esquinas = [Punto, Punto, Punto, Punto] // arriba-izq, arriba-der, abajo-der, abajo-izq

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CV = any
let promesa: Promise<CV> | null = null

/** Carga OpenCV.js (autoalojado en /opencv/opencv.js, ~10 MB, solo la primera vez). */
export function cargarCV(): Promise<CV> {
  if (promesa) return promesa
  promesa = new Promise((resolve, reject) => {
    const w = window as unknown as { cv?: CV }
    // El módulo de OpenCV es «thenable»: hay que quitarle `then` o la promesa se resuelve a sí misma sin fin
    const listo = (cv: CV) => { try { delete cv.then } catch { /* ya liberado */ } resolve(cv) }
    const s = document.createElement('script')
    s.src = '/opencv/opencv.js'
    s.async = true
    s.onerror = () => { promesa = null; reject(new Error('No se pudo cargar OpenCV')) }
    s.onload = () => {
      const cv = w.cv
      if (!cv) { promesa = null; return reject(new Error('OpenCV no disponible')) }
      if (typeof cv.then === 'function') cv.then((m: CV) => listo(m))
      else if (cv.Mat) listo(cv)
      else cv.onRuntimeInitialized = () => listo(w.cv)
    }
    document.head.appendChild(s)
  })
  return promesa
}

const dist = (a: Punto, b: Punto) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Ordena 4 puntos como arriba-izq, arriba-der, abajo-der, abajo-izq. */
export function ordenar(p: Punto[]): Esquinas {
  const suma = p.map((q) => q[0] + q[1]), dif = p.map((q) => q[0] - q[1])
  const tl = p[suma.indexOf(Math.min(...suma))], br = p[suma.indexOf(Math.max(...suma))]
  const tr = p[dif.indexOf(Math.max(...dif))], bl = p[dif.indexOf(Math.min(...dif))]
  return [tl, tr, br, bl]
}

/** Proporción lado largo / lado corto del cuadrilátero (siempre ≥ 1). */
export function proporcion(e: Esquinas): number {
  const a = (dist(e[0], e[1]) + dist(e[3], e[2])) / 2, b = (dist(e[0], e[3]) + dist(e[1], e[2])) / 2
  return Math.max(a, b) / Math.max(1, Math.min(a, b))
}

export function areaPoligono(e: Punto[]): number {
  let s = 0
  for (let i = 0; i < e.length; i++) { const [x1, y1] = e[i], [x2, y2] = e[(i + 1) % e.length]; s += x1 * y2 - x2 * y1 }
  return Math.abs(s) / 2
}

export interface Deteccion { esquinas: Esquinas | null; confianza: number; motivos: string[]; nitidez: number }

/** Busca la cédula en la imagen. Devuelve las esquinas en píxeles de la imagen original. */
export function detectarCedula(cv: CV, fuente: ImageBitmap): Deteccion {
  const esc = Math.min(1, 900 / Math.max(fuente.width, fuente.height))
  const c = document.createElement('canvas')
  c.width = Math.round(fuente.width * esc); c.height = Math.round(fuente.height * esc)
  c.getContext('2d')!.drawImage(fuente, 0, 0, c.width, c.height)
  const src = cv.imread(c)
  try { return detectarMat(cv, src, esc) } finally { src.delete() }
}

/** Núcleo de la detección sobre una imagen RGBA ya reducida (esc = tamaño reducido / original). */
export function detectarMat(cv: CV, src: CV, esc: number): Deteccion {
  const motivos: string[] = []
  const objetos: { delete: () => void }[] = []
  const nuevo = <T extends { delete: () => void }>(o: T): T => { objetos.push(o); return o }
  try {
    const gris = nuevo(new cv.Mat())
    cv.cvtColor(src, gris, cv.COLOR_RGBA2GRAY)
    const areaImg = src.cols * src.rows

    // Nitidez: varianza del laplaciano (foto movida/borrosa = valor bajo)
    const lap = nuevo(new cv.Mat()), m = nuevo(new cv.Mat()), sd = nuevo(new cv.Mat())
    cv.Laplacian(gris, lap, cv.CV_64F)
    cv.meanStdDev(lap, m, sd)
    const nitidez = sd.doubleAt(0, 0) ** 2

    const candidatos: { e: Esquinas; puntaje: number }[] = []
    const probar = (bin: CV) => {
      const contornos = nuevo(new cv.MatVector()), jer = nuevo(new cv.Mat())
      cv.findContours(bin, contornos, jer, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
      for (let i = 0; i < contornos.size(); i++) {
        const cnt = contornos.get(i)
        const area = cv.contourArea(cnt)
        if (area < areaImg * CEDULA.areaMin || area > areaImg * 0.985) { cnt.delete(); continue }
        const hull = new cv.Mat(); cv.convexHull(cnt, hull)
        const peri = cv.arcLength(hull, true)
        let pts: Punto[] | null = null
        const aprox = new cv.Mat(); cv.approxPolyDP(hull, aprox, 0.03 * peri, true)
        if (aprox.rows === 4) { pts = []; for (let k = 0; k < 4; k++) pts.push([aprox.intAt(k, 0), aprox.intAt(k, 1)]) }
        else {
          // Bordes redondeados o ruido: rectángulo mínimo girado, si el contorno lo llena bien
          const r = cv.minAreaRect(hull)
          const v = cv.RotatedRect.points(r) as { x: number; y: number }[]
          const rp: Punto[] = v.map((q) => [q.x, q.y])
          if (cv.contourArea(hull) / Math.max(1, areaPoligono(rp)) > 0.85) pts = rp
        }
        hull.delete(); aprox.delete(); cnt.delete()
        if (!pts) continue
        const e = ordenar(pts)
        const err = Math.abs(proporcion(e) - CEDULA.ratio) / CEDULA.ratio
        if (err > CEDULA.tolerancia) continue
        candidatos.push({ e, puntaje: (areaPoligono(e) / areaImg) * (1 - err) })
      }
    }

    const k5 = nuevo(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)))
    const k9 = nuevo(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9)))
    // Fondos con textura (madera, tela): un desenfoque fuerte quita el grano y deja los bordes grandes
    for (const [ks, bajo] of [[5, 0], [11, 0]] as const) {
      const blur = nuevo(new cv.Mat())
      if (ks === 5) cv.GaussianBlur(gris, blur, new cv.Size(5, 5), 0)
      else cv.medianBlur(gris, blur, ks)
      // Canny con umbrales automáticos a partir de la mediana de brillo
      const med = nuevo(new cv.Mat()); cv.resize(blur, med, new cv.Size(64, 64))
      const vals = Array.from(med.data as Uint8Array).sort((a, b) => a - b), mediana = vals[vals.length >> 1]
      const lo = Math.max(10, 0.66 * mediana + bajo), hi = Math.max(40, 1.33 * mediana)
      const bordes = nuevo(new cv.Mat())
      cv.Canny(blur, bordes, lo, hi)
      cv.dilate(bordes, bordes, k5)
      cv.morphologyEx(bordes, bordes, cv.MORPH_CLOSE, k9)
      probar(bordes)
      if (candidatos.length) break
      // Umbral automático (Otsu), con ambos sentidos (cédula clara sobre fondo oscuro o al revés)
      const bin = nuevo(new cv.Mat())
      cv.threshold(blur, bin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
      cv.morphologyEx(bin, bin, cv.MORPH_OPEN, k9)
      probar(bin)
      const inv = nuevo(new cv.Mat()); cv.bitwise_not(bin, inv); probar(inv)
      if (candidatos.length) break
    }

    if (!candidatos.length) return { esquinas: null, confianza: 0, motivos: ['No se encontró la cédula en la foto'], nitidez }
    candidatos.sort((a, b) => b.puntaje - a.puntaje)
    const mejor = candidatos[0]
    const frac = areaPoligono(mejor.e) / areaImg
    if (frac < 0.15) motivos.push('La cédula se ve muy pequeña en la foto')
    if (Math.abs(proporcion(mejor.e) - CEDULA.ratio) / CEDULA.ratio > 0.1) motivos.push('La forma no parece una cédula completa (revisa las esquinas)')
    if (nitidez < 60) motivos.push('Foto borrosa')
    const esquinas = mejor.e.map(([x, y]) => [x / esc, y / esc]) as Esquinas
    return { esquinas, confianza: Math.min(1, frac * 1.4), motivos, nitidez }
  } finally {
    objetos.forEach((o) => { try { o.delete() } catch { /* ya liberado */ } })
  }
}

/** Recorte rectangular (con la proporción de la cédula) sobre la foto: centro, ancho y ángulo en píxeles/radianes de la imagen original. */
export interface Marco { cx: number; cy: number; ancho: number; angulo: number }

/** Marco que mejor representa un cuadrilátero: mismo centro, ángulo del lado largo y ancho = lado largo. Nunca deforma la imagen. */
export function marcoDesdeEsquinas(e: Esquinas): Marco {
  const cx = e.reduce((a, p) => a + p[0], 0) / 4, cy = e.reduce((a, p) => a + p[1], 0) / 4
  const top = [e[1][0] - e[0][0], e[1][1] - e[0][1]], bot = [e[2][0] - e[3][0], e[2][1] - e[3][1]]
  const izq = [e[3][0] - e[0][0], e[3][1] - e[0][1]], der = [e[2][0] - e[1][0], e[2][1] - e[1][1]]
  const h = [(top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2], v = [(izq[0] + der[0]) / 2, (izq[1] + der[1]) / 2]
  const largoH = Math.hypot(h[0], h[1]), largoV = Math.hypot(v[0], v[1])
  // Si la cédula está vertical, el «ancho» es el lado más largo y se gira 90°
  const horizontal = largoH >= largoV
  const angulo = horizontal ? Math.atan2(h[1], h[0]) : Math.atan2(-v[0], v[1])
  return { cx, cy, ancho: Math.max(largoH, largoV), angulo }
}

/** Esquinas del marco (arriba-izq, arriba-der, abajo-der, abajo-izq) en la imagen original. */
export function esquinasDeMarco(m: Marco): Esquinas {
  const alto = m.ancho / CEDULA.ratio, c = Math.cos(m.angulo), s = Math.sin(m.angulo)
  const q = (dx: number, dy: number): Punto => [m.cx + dx * c - dy * s, m.cy + dx * s + dy * c]
  return [q(-m.ancho / 2, -alto / 2), q(m.ancho / 2, -alto / 2), q(m.ancho / 2, alto / 2), q(-m.ancho / 2, alto / 2)]
}

/** Recorta y endereza (solo giro y escala, sin deformar) y deja una imagen horizontal de ANCHO × ALTO. */
export function recortarMarco(fuente: ImageBitmap | HTMLCanvasElement, m: Marco, ancho = CEDULA.ancho): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = ancho; out.height = Math.round(ancho / CEDULA.ratio)
  const g = out.getContext('2d')!
  g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height)
  g.imageSmoothingQuality = 'high'
  const k = ancho / m.ancho
  g.translate(out.width / 2, out.height / 2)
  g.rotate(-m.angulo)
  g.scale(k, k)
  g.drawImage(fuente, -m.cx, -m.cy)
  return out
}

/** Gira un canvas 90° (positivo = horario) o 180°. */
export function girar(origen: HTMLCanvasElement | ImageBitmap, grados: 90 | 180 | 270): HTMLCanvasElement {
  const c = document.createElement('canvas')
  const w = origen.width, h = origen.height
  const lado = grados === 180
  c.width = lado ? w : h; c.height = lado ? h : w
  const g = c.getContext('2d')!
  g.translate(c.width / 2, c.height / 2)
  g.rotate((grados * Math.PI) / 180)
  g.drawImage(origen, -w / 2, -h / 2)
  return c
}

export const aBlob = (c: HTMLCanvasElement): Promise<Blob> => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo generar la imagen'))), 'image/jpeg', 0.9))
