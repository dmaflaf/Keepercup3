import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { PrismaClient } from '@prisma/client'
import { verifyAuth } from '@/lib/auth'
import { procesar } from '@/lib/importar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const prisma = new PrismaClient()
const token = () => randomBytes(16).toString('base64url')

export async function POST(request: NextRequest) {
  const user = await verifyAuth()
  if (!user || user.rol !== 'admin') {
    return NextResponse.json({ ok: false, message: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const equipos = Array.isArray(body.equipos) ? body.equipos : []
    const jugadores = Array.isArray(body.jugadores) ? body.jugadores : []
    const confirmar = body.confirmar === true
    if (equipos.length > 500 || jugadores.length > 5000) {
      return NextResponse.json({ ok: false, message: 'Archivo demasiado grande' }, { status: 400 })
    }

    const equiposDB = await prisma.team.findMany({ select: { id: true, name: true } })
    const jugadoresDB = await prisma.player.findMany({
      where: { cedula: { not: null } },
      select: { id: true, cedula: true, qrToken: true, number: true, team: { select: { name: true } } },
    })
    const cedulasExistentes = new Map<string, string>()
    for (const j of jugadoresDB) if (j.cedula) cedulasExistentes.set(j.cedula, j.team.name)

    const r = procesar(equipos, jugadores, {
      equiposExistentes: equiposDB.map((e) => e.name),
      cedulasExistentes,
    })

    const resumen = {
      equiposValidos: r.equipos.length,
      jugadoresValidos: r.jugadores.length,
      errores: r.incidencias.filter((i) => i.nivel === 'error').length,
      avisos: r.incidencias.filter((i) => i.nivel === 'aviso').length,
    }

    if (!confirmar) {
      return NextResponse.json({ ok: true, resumen, incidencias: r.incidencias })
    }

    const fallosEquipo: string[] = []
    for (const e of r.equipos) {
      const datos: Record<string, string> = {
        city: e.city,
        directorName: e.directorName,
        directorCedula: e.directorCedula,
        assistantName: e.assistantName,
        contactPhone: e.contactPhone,
        contactEmail: e.contactEmail,
        logoUrl: e.logoUrl,
        nominaUrl: e.nominaUrl,
        folderUrl: e.folderUrl,
        estado: e.estado,
        codigoEquipo: e.codigoEquipo,
      }
      const conValor = Object.fromEntries(Object.entries(datos).filter(([, v]) => v))
      try {
        await prisma.team.upsert({
          where: { name: e.name },
          create: { name: e.name, city: e.city, directorName: e.directorName, directorCedula: e.directorCedula, ...conValor },
          update: conValor,
        })
      } catch (err) {
        console.error('Equipo fallido', e.name, err)
        fallosEquipo.push(e.name)
      }
    }

    const idPorEquipo = new Map((await prisma.team.findMany({ select: { id: true, name: true } })).map((t) => [t.name, t.id]))
    const existentes = new Map(jugadoresDB.map((j) => [j.cedula as string, j]))

    const nuevos: {
      firstName: string; lastName: string; position: string | null; birthDate: string | null
      email: string | null; phone: string | null; cedula: string; number: number | null
      teamId: string; qrToken: string; selfieUrl?: string; cedulaFrontUrl?: string; cedulaBackUrl?: string
    }[] = []
    const actualizaciones: { id: string; nombre: string; data: Record<string, unknown>; numeroNuevo: number | null; numeroPrevio: number | null }[] = []
    for (const j of r.jugadores) {
      const teamId = idPorEquipo.get(j.equipo)
      if (!teamId) continue
      const base = {
        firstName: j.firstName,
        lastName: j.lastName,
        position: j.position || null,
        birthDate: j.birthDate || null,
        email: j.email || null,
        phone: j.phone || null,
      }
      const fotos = {
        ...(j.selfieUrl && { selfieUrl: j.selfieUrl }),
        ...(j.cedulaFrontUrl && { cedulaFrontUrl: j.cedulaFrontUrl }),
        ...(j.cedulaBackUrl && { cedulaBackUrl: j.cedulaBackUrl }),
      }
      const previo = existentes.get(j.cedula)
      if (previo) {
        actualizaciones.push({
          id: previo.id,
          nombre: `${j.firstName} ${j.lastName}`,
          numeroNuevo: j.number,
          numeroPrevio: previo.number,
          data: { ...base, ...fotos, teamId, ...(j.number !== null && { number: j.number }), ...(!previo.qrToken && { qrToken: token() }) },
        })
      } else {
        nuevos.push({ ...base, ...fotos, cedula: j.cedula, number: j.number, teamId, qrToken: token() })
      }
    }

    // Liberar primero los números que cambian, para permitir intercambios (A<->B) sin choques transitorios
    const cambian = actualizaciones.filter((a) => a.numeroNuevo !== null && a.numeroPrevio !== null && a.numeroNuevo !== a.numeroPrevio).map((a) => a.id)
    if (cambian.length) await prisma.player.updateMany({ where: { id: { in: cambian } }, data: { number: null } })

    let actualizados = 0
    const jugadoresFallidos: { nombre: string; motivo: string }[] = []
    const motivo = (e: unknown) =>
      e instanceof Error && e.message.includes('Unique constraint') ? 'Ese número ya lo tiene otro jugador del equipo' : 'No se pudo guardar'
    for (let i = 0; i < actualizaciones.length; i += 50) {
      const lote = actualizaciones.slice(i, i + 50)
      try {
        await prisma.$transaction(lote.map((a) => prisma.player.update({ where: { id: a.id }, data: a.data })))
        actualizados += lote.length
      } catch {
        for (const a of lote) {
          try {
            await prisma.player.update({ where: { id: a.id }, data: a.data })
            actualizados++
          } catch (e) {
            console.error('Jugador fallido', a.nombre, e)
            jugadoresFallidos.push({ nombre: a.nombre, motivo: motivo(e) })
            if (a.numeroPrevio !== null) {
              await prisma.player.update({ where: { id: a.id }, data: { number: a.numeroPrevio } }).catch(() => null)
            }
          }
        }
      }
    }

    // Jugadores nuevos: si su número ya está tomado en el equipo, se crean sin número
    const usados = new Set(
      (await prisma.player.findMany({ where: { number: { not: null } }, select: { teamId: true, number: true } })).map((p) => `${p.teamId}#${p.number}`)
    )
    const numerosOmitidos: string[] = []
    for (const n of nuevos) {
      if (n.number === null) continue
      const k = `${n.teamId}#${n.number}`
      if (usados.has(k)) {
        numerosOmitidos.push(`${n.firstName} ${n.lastName}`)
        n.number = null
      } else usados.add(k)
    }
    const creados = nuevos.length ? await prisma.player.createMany({ data: nuevos, skipDuplicates: true }) : { count: 0 }

    return NextResponse.json({
      ok: true,
      resumen,
      resultado: {
        equiposFallidos: fallosEquipo,
        jugadoresCreados: creados.count,
        jugadoresActualizados: actualizados,
        jugadoresFallidos,
        numerosOmitidos,
      },
    })
  } catch (error) {
    console.error('Error en importación:', error)
    return NextResponse.json(
      { ok: false, message: 'Error al importar. Verifica que la base de datos tenga las tablas actualizadas.' },
      { status: 500 }
    )
  }
}
