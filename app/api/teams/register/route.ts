import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()

    const {
      teamName,
      city,
      dtName,
      dtCedula,
      asistenteName,
      phone,
      email,
      logo,
      nomina,
      nominaNombre,
      fotos = [],
    } = payload

    // Validar datos requeridos
    if (!teamName || !city || !dtName || !dtCedula) {
      return NextResponse.json(
        { ok: false, message: 'Faltan datos requeridos' },
        { status: 400 }
      )
    }

    // Verificar si el equipo ya existe
    const existingTeam = await prisma.team.findUnique({
      where: { name: teamName },
    })

    if (existingTeam) {
      return NextResponse.json(
        { ok: false, message: 'Este equipo ya está registrado' },
        { status: 400 }
      )
    }

    // Crear equipo con jugadores
    const team = await prisma.team.create({
      data: {
        name: teamName,
        city,
        logo,
        directorName: dtName,
        directorCedula: dtCedula,
        assistantName: asistenteName,
        assistantPhone: phone,
        assistantEmail: email,
        nominaFile: nomina,
        nominaNombre,
        players: {
          create: fotos.map((foto: any, idx: number) => ({
            firstName: `Jugador ${idx + 1}`,
            lastName: teamName,
            photo: foto.data,
          })),
        },
      },
      include: { players: true },
    })

    return NextResponse.json({
      ok: true,
      message: 'Equipo registrado exitosamente',
      codigoEquipo: team.codigoEquipo,
      teamId: team.id,
    })
  } catch (error) {
    console.error('Error registrando equipo:', error)
    return NextResponse.json(
      { ok: false, message: 'Error al registrar el equipo' },
      { status: 500 }
    )
  }
}
