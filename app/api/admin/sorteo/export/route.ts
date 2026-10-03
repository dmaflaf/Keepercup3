import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'

export const dynamic = 'force-dynamic'

function csv(v: unknown) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export async function GET() {
  const no = await exigirAdmin()
  if (no) return no
  const filas = await prisma.sorteoBoleto.findMany({ orderBy: { createdAt: 'asc' }, include: { ganador: { include: { premio: true } } } })
  const lineas = ['Fecha,Color,Numero,Nombres,Correo,Telefono,Club,Codigo,Premio,Estado premio']
  filas.forEach((f) =>
    lineas.push([f.createdAt.toISOString(), f.color, f.numero, f.nombres, f.correo, f.telefono, f.club, f.codigo, f.ganador?.premio.nombre, f.ganador?.estado].map(csv).join(','))
  )
  return new NextResponse('﻿' + lineas.join('\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="boletos-sorteo.csv"' },
  })
}
