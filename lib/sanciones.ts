// Sanciones por tarjetas (reglas del torneo): amarillas acumuladas, doble amarilla en un partido y roja directa.
// A diferencia del cálculo rápido de lib/torneo.ts, este reparte los partidos de sanción en las siguientes fechas del equipo
// y dice cuáles ya se cumplieron y cuáles están pendientes. Puro: lo usan las pantallas y los PDFs.
export interface PartidoSan { id: string; jornadaNum: number; fecha: string | null; localId: string; visitanteId: string; estado: string; eventos: { teamId: string; playerId: string | null; tipo: string }[] }
export interface CfgSan { amarillasSuspension: number; partidosDobleAmarilla: number; partidosRojaDirecta: number }
export interface FilaSancion {
  playerId: string; teamId: string
  y: number // amarillas (la doble cuenta como 2)
  r: number // rojas directas
  dobles: number
  total: number // partidos de sanción generados
  cumplidos: number
  pendientes: number[] // jornadas (fechas) que aún debe cumplir
  fuera: number // partidos que pasan a la siguiente etapa
  acum: number // amarillas sueltas acumuladas
  motivo: string
  estado: 'SUSPENDIDO' | 'Cumplida' | 'Acumula' | '—'
}

export function calcularSanciones(partidos: PartidoSan[], cfg: CfgSan): FilaSancion[] {
  const filas = new Map<string, { playerId: string; teamId: string; y: number; r: number; dobles: number; cards: { m: PartidoSan; t: 'A' | 'D' | 'R' }[] }>()
  for (const m of partidos) {
    for (const e of m.eventos) {
      if (!e.playerId || !['amarilla', 'doble_amarilla', 'roja'].includes(e.tipo)) continue
      const f = filas.get(e.playerId) || { playerId: e.playerId, teamId: e.teamId, y: 0, r: 0, dobles: 0, cards: [] }
      if (e.tipo === 'roja') f.r++
      else if (e.tipo === 'doble_amarilla') { f.y += 2; f.dobles++ } else f.y++
      f.cards.push({ m, t: e.tipo === 'roja' ? 'R' : e.tipo === 'doble_amarilla' ? 'D' : 'A' })
      filas.set(e.playerId, f)
    }
  }
  const fechasDe = new Map<string, PartidoSan[]>()
  for (const m of partidos) for (const t of [m.localId, m.visitanteId]) fechasDe.set(t, [...(fechasDe.get(t) || []), m])
  fechasDe.forEach((l) => l.sort((a, b) => a.jornadaNum - b.jornadaNum || (a.fecha || '').localeCompare(b.fecha || '')))

  return Array.from(filas.values()).map((r) => {
    const events: { jornada: number; n: number }[] = []
    const motivos = new Set<string>()
    const porPartido = new Map<string, { m: PartidoSan; n: number }>()
    for (const { m, t } of r.cards) {
      if (t === 'R') { events.push({ jornada: m.jornadaNum, n: cfg.partidosRojaDirecta }); motivos.add('Roja directa'); continue }
      const x = porPartido.get(m.id) || { m, n: 0 }
      x.n += t === 'D' ? 2 : 1
      porPartido.set(m.id, x)
    }
    let sueltas = 0
    Array.from(porPartido.values()).sort((a, b) => a.m.jornadaNum - b.m.jornadaNum).forEach(({ m, n }) => {
      if (n >= 2) { events.push({ jornada: m.jornadaNum, n: cfg.partidosDobleAmarilla }); motivos.add('Doble amarilla'); n -= 2 }
      for (let i = 0; i < n; i++) { sueltas++; if (sueltas % cfg.amarillasSuspension === 0) { events.push({ jornada: m.jornadaNum, n: 1 }); motivos.add(`${cfg.amarillasSuspension} amarillas`) } }
    })
    events.sort((a, b) => a.jornada - b.jornada)
    const tf = fechasDe.get(r.teamId) || []
    let idx = 0, total = 0, cumplidos = 0, fuera = 0
    const pendientes: number[] = []
    for (const ev of events) {
      let start = tf.findIndex((p) => p.jornadaNum > ev.jornada)
      if (start < 0) start = tf.length
      start = Math.max(start, idx)
      for (let k = 0; k < ev.n; k++) {
        total++
        const p = tf[start + k]
        if (!p) fuera++
        else if (p.estado === 'finalizado') cumplidos++
        else pendientes.push(p.jornadaNum)
      }
      idx = start + ev.n
    }
    const acum = sueltas % cfg.amarillasSuspension
    const estado: FilaSancion['estado'] = pendientes.length || fuera ? 'SUSPENDIDO' : total ? 'Cumplida' : acum ? 'Acumula' : '—'
    return { playerId: r.playerId, teamId: r.teamId, y: r.y, r: r.r, dobles: r.dobles, total, cumplidos, pendientes, fuera, acum, motivo: Array.from(motivos).join(' + ') || '—', estado }
  })
}

export interface FilaMulta { teamId: string; y: number; dobles: number; r: number; total: number; pagado: number; pendiente: number }
/** Multas por club: amarilla (la doble vale 2) y roja directa, menos lo pagado. */
export function calcularMultas(partidos: PartidoSan[], equipos: string[], precios: { amarilla: number; roja: number }, pagadoPorEquipo: Map<string, number>): FilaMulta[] {
  const m = new Map<string, FilaMulta>(equipos.map((t) => [t, { teamId: t, y: 0, dobles: 0, r: 0, total: 0, pagado: 0, pendiente: 0 }]))
  for (const p of partidos) for (const e of p.eventos) {
    const f = m.get(e.teamId); if (!f) continue
    if (e.tipo === 'amarilla') f.y++
    else if (e.tipo === 'doble_amarilla') { f.y += 2; f.dobles++ } else if (e.tipo === 'roja') f.r++
  }
  return Array.from(m.values()).map((f) => {
    const total = Math.round((f.y * precios.amarilla + f.r * precios.roja) * 100) / 100
    const pagado = Math.round((pagadoPorEquipo.get(f.teamId) || 0) * 100) / 100
    return { ...f, total, pagado, pendiente: Math.round((total - pagado) * 100) / 100 }
  })
}
