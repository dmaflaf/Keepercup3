// Depuración de datos: revisa clubes, jugadores y torneo y lista lo que hay que corregir.
export type Gravedad = 'alta' | 'media' | 'baja'
export interface Problema { id: string; titulo: string; gravedad: Gravedad; ayuda: string; total: number; items: { texto: string; enlace?: string }[] }

/** Cédula ecuatoriana: 10 dígitos, provincia 01–24 o 30, tercer dígito < 6 y dígito verificador (módulo 10). */
export function cedulaValida(c: string | null | undefined): boolean {
  const s = (c || '').replace(/\D/g, '')
  if (s.length !== 10) return false
  const prov = Number(s.slice(0, 2))
  if (!((prov >= 1 && prov <= 24) || prov === 30)) return false
  if (Number(s[2]) >= 6) return false
  let suma = 0
  for (let i = 0; i < 9; i++) { let v = Number(s[i]) * (i % 2 === 0 ? 2 : 1); if (v > 9) v -= 9; suma += v }
  return (10 - (suma % 10)) % 10 === Number(s[9])
}

export const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
/** Nombre de club sin palabras comunes, para detectar duplicados escritos distinto (América / Club América / America FC). */
export const claveClub = (t: string) => normalizar(t).split(' ').filter((w) => !['club', 'deportivo', 'fc', 'cd', 'cf', 'sc', 'de', 'del', 'la', 'el', 'academia', 'escuela', 'futbol'].includes(w)).join(' ')

export function nombreSospechoso(n: string): string | null {
  if (n !== n.trim() || /\s{2,}/.test(n)) return 'espacios de más'
  if (/\d/.test(n)) return 'tiene números'
  if (n.length > 3 && n === n.toLowerCase()) return 'todo en minúsculas'
  if (n.length > 3 && n === n.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(n)) return null // MAYÚSCULAS es el formato esperado
  return null
}
