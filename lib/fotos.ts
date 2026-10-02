import { PrismaClient } from '@prisma/client'
import { driveId, obtenerImagenReducida, TipoFoto } from './drive'

const CAMPOS: { tipo: TipoFoto; campo: 'selfieUrl' | 'cedulaFrontUrl' | 'cedulaBackUrl' }[] = [
  { tipo: 'selfie', campo: 'selfieUrl' },
  { tipo: 'cedula_front', campo: 'cedulaFrontUrl' },
  { tipo: 'cedula_back', campo: 'cedulaBackUrl' },
]

export interface FalloFoto {
  id: string
  nombre: string
  equipo: string
  tipo: string
  motivo: string
}

export async function copiarFotos(
  prisma: PrismaClient,
  opts: { soloIds?: string[]; omitir?: string[]; limiteJugadores?: number; paralelo?: number; presupuestoMs?: number } = {}
) {
  const omitir = new Set<string>(opts.omitir ?? [])
  const limite = opts.limiteJugadores ?? 8
  const paralelo = opts.paralelo ?? 4
  const presupuesto = opts.presupuestoMs ?? 45000
  const inicio = Date.now()

  const jugadores = await prisma.player.findMany({
    where: {
      ...(opts.soloIds && { id: { in: opts.soloIds } }),
      OR: [{ selfieUrl: { not: null } }, { cedulaFrontUrl: { not: null } }, { cedulaBackUrl: { not: null } }],
    },
    select: {
      id: true, firstName: true, lastName: true, team: { select: { name: true } },
      selfieUrl: true, cedulaFrontUrl: true, cedulaBackUrl: true,
      images: { select: { kind: true, sourceId: true } },
    },
  })

  const pendientes = jugadores
    .map((j) => ({
      j,
      faltan: CAMPOS.filter((c) => {
        const id = driveId(j[c.campo])
        return id && !j.images.some((i) => i.kind === c.tipo && i.sourceId === id)
      }),
    }))
    .filter((p) => p.faltan.length > 0 && !omitir.has(p.j.id))

  const lote = pendientes.slice(0, limite)
  const tareas = lote.flatMap((p) => p.faltan.map((f) => ({ j: p.j, ...f })))

  const fallos: FalloFoto[] = []
  let copiadas = 0
  let cola = 0
  const sinTocar = new Set<string>()
  const trabajador = async () => {
    while (cola < tareas.length) {
      const t = tareas[cola++]
      if (Date.now() - inicio > presupuesto) {
        sinTocar.add(t.j.id)
        continue
      }
      try {
        const id = driveId(t.j[t.campo])
        if (!id) throw new Error('Enlace de Drive no reconocido')
        const img = await obtenerImagenReducida(id, t.tipo)
        await prisma.playerImage.upsert({
          where: { playerId_kind: { playerId: t.j.id, kind: t.tipo } },
          create: { playerId: t.j.id, kind: t.tipo, sourceId: id, mime: img.mime, data: img.data, bytes: img.data.length },
          update: { sourceId: id, mime: img.mime, data: img.data, bytes: img.data.length },
        })
        copiadas++
      } catch (e) {
        fallos.push({
          id: t.j.id,
          nombre: `${t.j.firstName} ${t.j.lastName}`,
          equipo: t.j.team.name,
          tipo: t.tipo,
          motivo: e instanceof Error ? e.message : 'error',
        })
      }
    }
  }
  await Promise.all(Array.from({ length: paralelo }, trabajador))

  return {
    copiadas,
    fallos,
    restantes: Math.max(0, pendientes.length - lote.length) + sinTocar.size,
    totalJugadores: jugadores.length,
  }
}
