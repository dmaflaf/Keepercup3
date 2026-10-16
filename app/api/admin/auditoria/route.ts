import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { cedulaValida, claveClub, nombreSospechoso, normalizar, Problema } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const TOPE = 300

// Revisión de datos para depurar: solo administrador. Solo lee; no cambia nada.
export async function GET() {
  const no = await exigirAdmin()
  if (no) return no

  const [equipos, jugadores] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true, logo: true, logoUrl: true, estado: true }, orderBy: { name: 'asc' } }),
    prisma.player.findMany({
      select: { id: true, firstName: true, lastName: true, cedula: true, number: true, position: true, birthDate: true, estado: true, teamId: true, selfieUrl: true, cedulaFrontUrl: true, cedulaBackUrl: true, images: { select: { kind: true } } },
    }),
  ])
  const club = new Map(equipos.map((t) => [t.id, t.name]))
  const nom = (j: (typeof jugadores)[number]) => `${j.firstName} ${j.lastName}`.trim()
  const fila = (j: (typeof jugadores)[number], extra = '') => ({ texto: `${club.get(j.teamId) || '?'} · ${j.number ?? 's/n'} · ${nom(j)}${extra}`, enlace: `/admin/jugadores/${j.id}` })
  const problemas: Problema[] = []
  const add = (p: Omit<Problema, 'total' | 'items'> & { items: Problema['items'] }) => { if (p.items.length) problemas.push({ ...p, total: p.items.length, items: p.items.slice(0, TOPE) }) }

  // ---- Clubes ----
  const porClub = new Map<string, number>()
  for (const j of jugadores) porClub.set(j.teamId, (porClub.get(j.teamId) || 0) + 1)
  add({ id: 'club_sin_jugadores', titulo: 'Clubes sin jugadores cargados', gravedad: 'alta', ayuda: 'Falta subir la nómina de estos clubes (Cargar club o importar desde Drive).', items: equipos.filter((t) => !porClub.get(t.id)).map((t) => ({ texto: t.name })) })
  add({ id: 'club_pocos', titulo: 'Clubes con menos de 11 jugadores', gravedad: 'alta', ayuda: 'No alcanzan para una alineación completa. Revisa si falta parte de la nómina.', items: equipos.filter((t) => (porClub.get(t.id) || 0) > 0 && (porClub.get(t.id) || 0) < 11).map((t) => ({ texto: `${t.name} · ${porClub.get(t.id)} jugadores` })) })
  add({ id: 'club_sin_escudo', titulo: 'Clubes sin escudo', gravedad: 'baja', ayuda: 'El carnet y la ficha muestran las iniciales. Sube el escudo en Carnets → Escudos.', items: equipos.filter((t) => !t.logo && !t.logoUrl).map((t) => ({ texto: t.name })) })
  const grupos = new Map<string, string[]>()
  for (const t of equipos) { const k = claveClub(t.name); if (k) grupos.set(k, [...(grupos.get(k) || []), t.name]) }
  add({ id: 'club_duplicado', titulo: 'Clubes con nombre parecido (posibles duplicados)', gravedad: 'media', ayuda: 'Pueden ser el mismo club escrito distinto. Unifícalos para que no se reparta la nómina.', items: Array.from(grupos.values()).filter((v) => v.length > 1).map((v) => ({ texto: v.join('  ≈  ') })) })

  // ---- Jugadores ----
  add({ id: 'sin_cedula', titulo: 'Jugadores sin cédula', gravedad: 'alta', ayuda: 'Sin cédula no se puede verificar identidad ni evitar duplicados.', items: jugadores.filter((j) => !(j.cedula || '').trim()).map((j) => fila(j)) })
  add({ id: 'cedula_invalida', titulo: 'Cédula con formato o dígito verificador inválido', gravedad: 'media', ayuda: 'Probablemente un error de digitación (o un pasaporte). Corrígela con ✏️ Editar.', items: jugadores.filter((j) => (j.cedula || '').trim() && !cedulaValida(j.cedula)).map((j) => fila(j, ` · cédula con ${(j.cedula || '').replace(/\D/g, '').length} dígitos`)) })

  const porCedula = new Map<string, typeof jugadores>()
  for (const j of jugadores) { const c = (j.cedula || '').replace(/\D/g, ''); if (c.length >= 6) porCedula.set(c, [...(porCedula.get(c) || []), j]) }
  add({ id: 'cedula_repetida', titulo: 'Misma cédula en más de un club', gravedad: 'alta', ayuda: 'Un jugador no puede estar inscrito en dos clubes. Decide en cuál se queda y elimina o corrige el otro.', items: Array.from(porCedula.values()).filter((v) => new Set(v.map((x) => x.teamId)).size > 1).flatMap((v) => v.map((j) => fila(j))) })

  // Mismo nombre aunque esté en otro orden («Darwin Javier Noquez» / «Noquez Darwin Javier»): útil cuando unos se registran por la web y otros por la nómina
  const claveNombre = (j: (typeof jugadores)[number]) => normalizar(nom(j)).split(' ').filter(Boolean).sort().join(' ')
  const porNombre = new Map<string, typeof jugadores>()
  for (const j of jugadores) { if (!j.birthDate) continue; const k = `${claveNombre(j)}|${j.birthDate}`; porNombre.set(k, [...(porNombre.get(k) || []), j]) }
  add({ id: 'nombre_repetido', titulo: 'Mismo nombre y fecha de nacimiento en distintos clubes', gravedad: 'alta', ayuda: 'Posible jugador inscrito dos veces con cédulas distintas.', items: Array.from(porNombre.values()).filter((v) => new Set(v.map((x) => x.teamId)).size > 1).flatMap((v) => v.map((j) => fila(j))) })
  const porNombreClub = new Map<string, typeof jugadores>()
  for (const j of jugadores) { const k = `${j.teamId}|${claveNombre(j)}`; porNombreClub.set(k, [...(porNombreClub.get(k) || []), j]) }
  add({ id: 'nombre_repetido_club', titulo: 'Jugador repetido dentro del mismo club (mismo nombre, otra cédula o registro)', gravedad: 'alta', ayuda: 'Suele pasar cuando alguien se registró por la web y también viene en la nómina con la cédula mal escrita. Deja un solo registro.', items: Array.from(porNombreClub.values()).filter((v) => v.length > 1).flatMap((v) => v.map((j) => fila(j, ` · cédula ${j.cedula || 'sin dato'}`))) })

  add({ id: 'sin_numero', titulo: 'Jugadores sin número de camiseta', gravedad: 'media', ayuda: 'El carnet y la planilla necesitan el número.', items: jugadores.filter((j) => j.number === null).map((j) => fila(j)) })
  add({ id: 'sin_nacimiento', titulo: 'Jugadores sin fecha de nacimiento', gravedad: 'media', ayuda: 'No se puede calcular la edad.', items: jugadores.filter((j) => !j.birthDate).map((j) => fila(j)) })
  const hoy = Date.now()
  add({ id: 'edad_rara', titulo: 'Edad fuera de lo normal (menor de 10 o mayor de 60)', gravedad: 'media', ayuda: 'Probable error al escribir la fecha de nacimiento.', items: jugadores.filter((j) => { if (!j.birthDate) return false; const t = new Date(j.birthDate + 'T12:00:00').getTime(); if (!Number.isFinite(t)) return true; const e = (hoy - t) / 31557600000; return e < 10 || e > 60 }).map((j) => fila(j, ` · nació ${j.birthDate}`)) })
  add({ id: 'sin_posicion', titulo: 'Jugadores sin posición', gravedad: 'baja', ayuda: 'Hace falta sobre todo para identificar a los porteros.', items: jugadores.filter((j) => !(j.position || '').trim()).map((j) => fila(j)) })
  add({ id: 'nombre_formato', titulo: 'Nombres mal escritos (espacios, números, minúsculas)', gravedad: 'baja', ayuda: 'Se verán mal en el carnet.', items: jugadores.map((j) => ({ j, m: nombreSospechoso(`${j.firstName} ${j.lastName}`) || nombreSospechoso(j.firstName) || nombreSospechoso(j.lastName) })).filter((x) => x.m).map((x) => fila(x.j, ` · ${x.m}`)) })

  const tiene = (j: (typeof jugadores)[number], kind: string) => j.images.some((i) => i.kind === kind)
  add({ id: 'sin_foto', titulo: 'Jugadores sin foto', gravedad: 'media', ayuda: 'Sin foto no se puede imprimir el carnet.', items: jugadores.filter((j) => !tiene(j, 'selfie')).map((j) => fila(j, j.selfieUrl ? ' · tiene enlace de Drive (falta copiarla)' : '')) })
  add({ id: 'sin_cedula_img', titulo: 'Sin foto de cédula (frente o reverso)', gravedad: 'media', ayuda: 'Se necesita para verificar al jugador.', items: jugadores.filter((j) => !tiene(j, 'cedula_front') || !tiene(j, 'cedula_back')).map((j) => fila(j, ` · falta ${[!tiene(j, 'cedula_front') && 'frente', !tiene(j, 'cedula_back') && 'reverso'].filter(Boolean).join(' y ')}`)) })
  add({ id: 'pendientes', titulo: 'Jugadores pendientes de habilitar', gravedad: 'baja', ayuda: 'Aún no están habilitados para jugar.', items: jugadores.filter((j) => j.estado !== 'habilitado').map((j) => fila(j, ` · ${j.estado}`)) })

  // ---- Torneo activo ----
  const torneo = await prisma.torneo.findFirst({ orderBy: [{ activo: 'desc' }, { createdAt: 'desc' }] })
  let torneoInfo: { nombre: string; fases: number; grupos: number; partidos: number } | null = null
  if (torneo) {
    const [fases, partidos] = await Promise.all([prisma.fase.findMany({ where: { torneoId: torneo.id }, select: { id: true, nombre: true } }), prisma.partido.findMany({ where: { torneoId: torneo.id } })])
    const gr = await prisma.grupo.findMany({ where: { faseId: { in: fases.map((f) => f.id) } }, select: { id: true, nombre: true, faseId: true } })
    const miembros = await prisma.grupoEquipo.findMany({ where: { grupoId: { in: gr.map((g) => g.id) } } })
    torneoInfo = { nombre: torneo.nombre, fases: fases.length, grupos: gr.length, partidos: partidos.length }
    const fase = new Map(fases.map((f) => [f.id, f.nombre]))
    const enGrupo = new Set(miembros.map((m) => m.teamId))
    add({ id: 'sin_grupo', titulo: 'Clubes que no están en ningún grupo del torneo', gravedad: 'alta', ayuda: 'Asígnalos en Torneo → Grupos.', items: gr.length ? equipos.filter((t) => !enGrupo.has(t.id)).map((t) => ({ texto: t.name, enlace: '/admin/torneo' })) : [] })
    add({ id: 'grupo_tamano', titulo: 'Grupos con distinta cantidad de equipos', gravedad: 'media', ayuda: 'Si todos deberían tener 8, falta o sobra alguno.', items: (() => { const n = gr.map((g) => ({ g, n: miembros.filter((m) => m.grupoId === g.id).length })); const mayoria = n.sort((a, b) => b.n - a.n)[Math.floor(n.length / 2)]?.n; return n.filter((x) => x.n !== mayoria).map((x) => ({ texto: `${fase.get(x.g.faseId)} · ${x.g.nombre}: ${x.n} equipos (lo común es ${mayoria})`, enlace: '/admin/torneo' })) })() })
    const nombrePartido = (p: (typeof partidos)[number]) => `${p.jornada} · ${club.get(p.localId) || '?'} vs ${club.get(p.visitanteId) || '?'}`
    add({ id: 'partido_sin_fecha', titulo: 'Partidos sin fecha u hora', gravedad: 'media', ayuda: 'Completa el horario en Torneo → Fixture.', items: partidos.filter((p) => !p.fecha || !p.hora).map((p) => ({ texto: nombrePartido(p), enlace: '/admin/torneo' })) })
    add({ id: 'partido_consigo', titulo: 'Partidos de un equipo contra sí mismo', gravedad: 'alta', ayuda: 'Error al crear el partido.', items: partidos.filter((p) => p.localId === p.visitanteId).map((p) => ({ texto: nombrePartido(p), enlace: '/admin/torneo' })) })
    const mismoDia = new Map<string, typeof partidos>()
    for (const p of partidos) if (p.fecha) for (const t of [p.localId, p.visitanteId]) mismoDia.set(`${t}|${p.fecha}`, [...(mismoDia.get(`${t}|${p.fecha}`) || []), p])
    add({ id: 'equipo_dos_partidos', titulo: 'Un equipo con dos partidos el mismo día', gravedad: 'alta', ayuda: 'Revisa el fixture.', items: Array.from(mismoDia.entries()).filter(([, v]) => v.length > 1).map(([k, v]) => ({ texto: `${club.get(k.split('|')[0])} · ${v[0].fecha}: ${v.map((p) => p.hora || 's/h').join(' y ')}`, enlace: '/admin/torneo' })) })
    const cancha = new Map<string, typeof partidos>()
    for (const p of partidos) if (p.fecha && p.hora && p.escenario) cancha.set(`${p.escenario}|${p.fecha}|${p.hora}`, [...(cancha.get(`${p.escenario}|${p.fecha}|${p.hora}`) || []), p])
    add({ id: 'cancha_doble', titulo: 'Misma cancha, fecha y hora para dos partidos', gravedad: 'alta', ayuda: 'Hay un cruce de horarios.', items: Array.from(cancha.entries()).filter(([, v]) => v.length > 1).map(([k, v]) => ({ texto: `${k.replace(/\|/g, ' · ')}: ${v.map(nombrePartido).join('  /  ')}`, enlace: '/admin/torneo' })) })
    const hoyEc = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)
    add({ id: 'sin_resultado', titulo: 'Partidos con fecha pasada y sin resultado', gravedad: 'media', ayuda: 'Registra el resultado o márcalo como suspendido.', items: partidos.filter((p) => p.fecha && p.fecha < hoyEc && p.estado === 'programado').map((p) => ({ texto: `${p.fecha} · ${nombrePartido(p)}`, enlace: `/admin/planilla/${p.id}` })) })
  }

  const orden = { alta: 0, media: 1, baja: 2 }
  problemas.sort((a, b) => orden[a.gravedad] - orden[b.gravedad])
  return NextResponse.json({
    ok: true,
    resumen: {
      clubes: equipos.length, jugadores: jugadores.length,
      habilitados: jugadores.filter((j) => j.estado === 'habilitado').length,
      conFoto: jugadores.filter((j) => tiene(j, 'selfie')).length,
      conCedulaCompleta: jugadores.filter((j) => tiene(j, 'cedula_front') && tiene(j, 'cedula_back')).length,
      torneo: torneoInfo,
    },
    problemas,
  })
}
