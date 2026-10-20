// Programación del fixture: casillas por estadio, día y hora. Funciones puras (pantalla y servidor).
export interface ConfigProg { estadios: string[]; inicio: string; horarios: Record<string, string[]> } // inicio = viernes de la fecha 1; horarios por día de la semana (0=domingo … 6=sábado)
export const CONFIG_DEFECTO: ConfigProg = {
  estadios: ['San Miguel', 'Los Sauces'],
  inicio: '2026-09-18',
  horarios: { '5': ['19:00', '21:00'], '6': ['11:00', '14:00', '16:00', '18:00', '20:00'], '0': ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00'] },
}
export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const DIA3 = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export const sumarDias = (iso: string, n: number) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10)
export const diaSemana = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay()
export const fechaLarga = (iso: string) => { const d = new Date(iso + 'T00:00:00Z'); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}` }
export const horaValida = (h: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h)

/** Viernes, sábado y domingo de la fecha (jornada) n. */
export const diasDeJornada = (cfg: ConfigProg, n: number) => { const v = sumarDias(cfg.inicio, 7 * (n - 1)); return [v, sumarDias(v, 1), sumarDias(v, 2)] }

export interface PartidoProg { id: string; jornadaNum: number; grupo: string | null; localId: string; visitanteId: string; local: string; visitante: string; fecha: string | null; hora: string | null; escenario: string | null; estado: string; golesLocal: number | null; golesVisitante: number | null }

/** Etiqueta «Sáb 14:00» para contar repeticiones de horario. */
export const etiquetaSlot = (p: { fecha: string | null; hora: string | null }) => (p.fecha && p.hora ? `${DIA3[diaSemana(p.fecha)]} ${p.hora}` : '')

export interface AvisoProg { choque: string[]; repite: string[]; estadios: { equipo: string; sm: number; otro: number }[] }
/** Avisos al colocar `p` en (fecha, hora, estadio): choque de horario del mismo equipo (bloquea) y repeticiones de día/hora o desbalance de estadios (avisan). */
export function avisosPara(p: PartidoProg, fecha: string, hora: string, estadio: string, todos: PartidoProg[], estadios: string[]): AvisoProg {
  const otros = todos.filter((x) => x.id !== p.id && x.fecha && x.hora)
  const choque: string[] = [], repite: string[] = []
  const slot = `${DIA3[diaSemana(fecha)]} ${hora}`
  for (const [id, nombre] of [[p.localId, p.local], [p.visitanteId, p.visitante]] as const) {
    const suyos = otros.filter((x) => x.localId === id || x.visitanteId === id)
    if (suyos.some((x) => x.fecha === fecha && x.hora === hora)) choque.push(`${nombre} ya juega ese día a esa hora`)
    const n = suyos.filter((x) => etiquetaSlot(x) === slot).length
    if (n > 0) repite.push(`${nombre} ya jugó ${slot} (${n}×)`)
  }
  const est = [[p.localId, p.local], [p.visitanteId, p.visitante]].map(([id, nombre]) => {
    const suyos = otros.filter((x) => (x.localId === id || x.visitanteId === id) && x.escenario)
    return { equipo: nombre, sm: suyos.filter((x) => x.escenario === estadio).length, otro: suyos.filter((x) => x.escenario !== estadio && estadios.includes(x.escenario || '')).length }
  })
  return { choque, repite, estadios: est }
}

/** Balance por grupo: cuántas veces juega cada equipo en cada estadio y en cada día de la semana, y sus horarios. */
export function balance(partidos: PartidoProg[], equipos: { id: string; nombre: string }[], estadios: string[]) {
  return equipos.map((e) => {
    const suyos = partidos.filter((p) => (p.localId === e.id || p.visitanteId === e.id) && p.fecha && p.hora && p.escenario)
    const porEstadio = Object.fromEntries(estadios.map((s) => [s, suyos.filter((p) => p.escenario === s).length]))
    const dias: Record<string, number> = { Vie: 0, 'Sáb': 0, Dom: 0 }
    const slots: Record<string, number> = {}
    for (const p of suyos) { const d = DIA3[diaSemana(p.fecha as string)]; if (d in dias) dias[d]++; const l = etiquetaSlot(p); slots[l] = (slots[l] || 0) + 1 }
    return { id: e.id, nombre: e.nombre, total: suyos.length, porEstadio, dias, slots }
  })
}
