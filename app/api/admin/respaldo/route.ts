import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Copia de los datos del sistema (solo administrador): Excel para revisar o JSON completo para restaurar.
// No incluye: claves cifradas de usuarios, escudos ni fotos (las fotos se bajan por club en ZIP).
const TABLAS: { nombre: string; leer: () => Promise<Record<string, unknown>[]> }[] = [
  { nombre: 'Clubes', leer: () => prisma.team.findMany({ select: { id: true, name: true, city: true, estado: true, directorName: true, directorCedula: true, contactPhone: true, contactEmail: true, assistantName: true, assistantPhone: true, assistantEmail: true, codigoEquipo: true, folderUrl: true, createdAt: true }, orderBy: { name: 'asc' } }) },
  { nombre: 'Jugadores', leer: async () => (await prisma.player.findMany({ select: { id: true, teamId: true, firstName: true, lastName: true, cedula: true, number: true, position: true, birthDate: true, email: true, phone: true, estado: true, qrToken: true, editadoManual: true, createdAt: true, team: { select: { name: true } } }, orderBy: [{ team: { name: 'asc' } }, { lastName: 'asc' }] })).map(({ team, ...j }) => ({ club: team.name, ...j })) },
  { nombre: 'Fotos (datos)', leer: () => prisma.playerImage.findMany({ select: { id: true, playerId: true, kind: true, bytes: true, cropEstado: true, cropMotivo: true, createdAt: true } }) },
  { nombre: 'Traspasos', leer: () => prisma.traspaso.findMany({ orderBy: { createdAt: 'asc' } }) },
  { nombre: 'Torneos', leer: () => prisma.torneo.findMany() },
  { nombre: 'Fases', leer: () => prisma.fase.findMany({ orderBy: { orden: 'asc' } }) },
  { nombre: 'Grupos', leer: () => prisma.grupo.findMany({ orderBy: { orden: 'asc' } }) },
  { nombre: 'Equipos en grupos', leer: () => prisma.grupoEquipo.findMany() },
  { nombre: 'Partidos', leer: () => prisma.partido.findMany({ orderBy: [{ jornadaNum: 'asc' }, { fecha: 'asc' }] }) },
  { nombre: 'Eventos', leer: () => prisma.evento.findMany({ orderBy: [{ partidoId: 'asc' }, { createdAt: 'asc' }] }) },
  { nombre: 'Usuarios', leer: () => prisma.user.findMany({ select: { id: true, email: true, nombre: true, rol: true, activo: true, createdAt: true } }) },
  { nombre: 'Ajustes', leer: () => prisma.ajuste.findMany() },
  { nombre: 'Alias cedulas', leer: () => prisma.playerAlias.findMany() },
  { nombre: 'Sorteo premios', leer: () => prisma.sorteoPremio.findMany() },
  { nombre: 'Sorteo numeros', leer: () => prisma.sorteoNumero.findMany() },
  { nombre: 'Sorteo boletos', leer: () => prisma.sorteoBoleto.findMany() },
  { nombre: 'Sorteo config', leer: () => prisma.sorteoConfig.findMany() },
  { nombre: 'Sorteo bloqueos', leer: () => prisma.sorteoBloqueo.findMany() },
]

const celda = (v: unknown) => (v instanceof Date ? v.toISOString() : v !== null && typeof v === 'object' ? JSON.stringify(v) : v)

export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const formato = req.nextUrl.searchParams.get('formato') === 'json' ? 'json' : 'xlsx'
  const sello = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)
  const datos: Record<string, Record<string, unknown>[]> = {}
  for (const t of TABLAS) datos[t.nombre] = await t.leer()

  if (formato === 'json') {
    const cuerpo = JSON.stringify({ sistema: 'Keeper Cup 3', generado: new Date().toISOString(), version: 1, tablas: datos }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
    return new NextResponse(cuerpo, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="keeper-cup-datos-${sello}.json"`, 'Cache-Control': 'no-store' } })
  }

  const wb = XLSX.utils.book_new()
  const resumen = [['Respaldo de datos · Keeper Cup 3'], ['Generado', new Date().toISOString()], [], ['Hoja', 'Filas'], ...Object.entries(datos).map(([n, f]) => [n, f.length]), [], ['Contiene datos personales: guárdalo en un lugar privado.'], ['No incluye claves de usuarios, escudos ni fotos (las fotos se descargan por club).']]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'LEEME')
  for (const [nombre, filas] of Object.entries(datos)) {
    const limpias = filas.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, celda(v)])))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(limpias.length ? limpias : [{ '(vacío)': '' }], { header: Array.from(new Set(limpias.flatMap((f) => Object.keys(f)))) }), nombre.slice(0, 31))
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="keeper-cup-datos-${sello}.xlsx"`, 'Cache-Control': 'no-store' } })
}
