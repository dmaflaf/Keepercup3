// Nombre del club como va impreso en el carnet: sin «Club», «Fútbol Club», «Sporting Club», «FC»…, pero conservando
// las palabras que completan el nombre ("Barcelona Fútbol Club" → BARCELONA; "Barrio Fino Sporting Club" → BARRIO FINO).
const GENERICAS = new Set(['club', 'futbol', 'fc', 'sporting', 'sc', 'cd', 'cf', 'ca', 'cs'])
const CONECTORES = new Set(['de', 'del'])
const sinTilde = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.]/g, '')

export function nombreClubCarnet(nombre: string | null | undefined): string {
  const original = (nombre || '').trim().replace(/\s+/g, ' ')
  if (!original) return ''
  let palabras = original.split(' ').filter((w) => !GENERICAS.has(sinTilde(w)))
  while (palabras.length > 1 && CONECTORES.has(sinTilde(palabras[0]))) palabras = palabras.slice(1)
  while (palabras.length > 1 && CONECTORES.has(sinTilde(palabras[palabras.length - 1]))) palabras = palabras.slice(0, -1)
  const r = palabras.join(' ')
  return (r || original).toUpperCase()
}
