// Ejecutar: npx tsx lib/encuadre.test.ts
import { calcularRecorte, recorteAPixeles, ENCUADRE } from './encuadre'
let ok = 0, mal = 0
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { mal++; console.log('FALLA', m, JSON.stringify(a), '!=', JSON.stringify(b)) } }
const cerca = (a: number, b: number, tol: number, m: string) => { if (Math.abs(a - b) <= tol) ok++; else { mal++; console.log('FALLA', m, a, 'vs', b) } }

// Reproduce la foto de referencia (125x154, cara 71x71 en (27,50), ojos a 70.4): el recorte debe ser casi toda la imagen
const ref = calcularRecorte(125, 154, { x: 27, y: 50, w: 71, h: 71 }, 70.4)
cerca(ref.crop!.w, 1, 0.03, 'ref ancho'); cerca(ref.crop!.h, 1, 0.02, 'ref alto'); eq(ref.estado === 'auto' || ref.motivos.every((m) => m.startsWith('Resolución')), true, 'ref sin banderas (salvo resolución por ser miniatura)')

// Foto grande de cuerpo entero con la cara pequeña arriba: acerca y centra
const g = calcularRecorte(800, 1000, { x: 320, y: 120, w: 160, h: 160 }, 190)
cerca((g.crop!.h * 1000) / 160 * ENCUADRE.caraFrac, 1, 0.01, 'la cara ocupa 46 % del recorte')
eq(g.estado, 'auto', 'cuerpo entero grande = auto')
cerca(g.crop!.x * 800 + (g.crop!.w * 800) / 2, 400, 1, 'centrado en x')

// Cara cortada abajo -> revisar
eq(calcularRecorte(300, 400, { x: 90, y: 250, w: 120, h: 200 }, 300).motivos.includes('Rostro cortado en la foto original'), true, 'cara cortada')
// Resolución baja
eq(calcularRecorte(200, 260, { x: 70, y: 70, w: 30, h: 30 }, 80).motivos.some((m) => m.startsWith('Resolución')), true, 'resolución baja')
// Cabeza pegada al borde superior -> revisar
eq(calcularRecorte(600, 800, { x: 250, y: 5, w: 100, h: 100 }, 40).estado, 'revisar', 'cabeza en el borde')
// El recorte nunca se sale de la imagen
for (const [w, h, c] of [[500, 700, { x: 10, y: 10, w: 60, h: 60 }], [500, 700, { x: 440, y: 600, w: 60, h: 60 }], [300, 300, { x: 100, y: 100, w: 150, h: 150 }]] as const) {
  const r = calcularRecorte(w, h, c).crop!
  eq(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001, true, 'dentro de la imagen')
}
// A píxeles
eq(recorteAPixeles({ x: 0.1, y: 0.2, w: 0.5, h: 0.6 }, 800, 1000), { left: 80, top: 200, width: 400, height: 600 }, 'a píxeles')
console.log(`OK ${ok}  FALLAS ${mal}`)
