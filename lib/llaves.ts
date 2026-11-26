// Llaves de la Fase Final (Art. 41 del reglamento), por copa. Puro: se arma con las tablas de la Fase 2 y los partidos.
//   Cuartos:  C1 = 1.º G1 vs 2.º G3 · C2 = 1.º G2 vs 2.º G4 · C3 = 1.º G3 vs 2.º G1 · C4 = 1.º G4 vs 2.º G2
//   Semis:    S1 = ganador C1 vs ganador C2 · S2 = ganador C3 vs ganador C4
//   Final:    ganador S1 vs ganador S2 · Tercer puesto: perdedor S1 vs perdedor S2
// Mientras un grupo se juega, sus clasificados salen como PROVISIONALES (posición actual). El ganador de cada cruce sale del
// partido de eliminatoria entre esos dos clubes (goles y, si empatan, penales).

export interface EqLlave { teamId: string; nombre: string; provisional: boolean }
export interface Cruce {
  id: 'C1' | 'C2' | 'C3' | 'C4' | 'S1' | 'S2' | 'F' | 'T'
  local: EqLlave | null; visitante: EqLlave | null
  origenLocal: string; origenVisitante: string
  gl: number | null; gv: number | null; pl: number | null; pv: number | null
  ganador: 'local' | 'visitante' | null
  partidoId: string | null; fecha: string | null; hora: string | null; escenario: string | null; estado: string | null
}
export interface LlaveCopa { copa: string; cruces: Cruce[]; campeon: EqLlave | null; gruposTerminados: number }

interface Fila { teamId: string; equipo: string }
interface FaseIn { id: string; tipo: string; grupos: { id: string; nombre: string; tabla: Fila[] }[] }
interface PartidoIn { id: string; faseId: string; grupoId: string | null; localId: string; visitanteId: string; estado: string; golesLocal: number | null; golesVisitante: number | null; penalesLocal: number | null; penalesVisitante: number | null; fecha: string | null; hora: string | null; escenario: string | null }

const copaDe = (t: string) => (/\boro\b/i.test(t) ? 'Copa Oro' : /\bplata\b/i.test(t) ? 'Copa Plata' : null)
const numGrupo = (n: string) => Number(n.match(/grupo\s*(\d+)/i)?.[1] ?? n.match(/\d+/)?.[0] ?? 99)

export function construirLlaves(fases: FaseIn[], partidos: PartidoIn[], nombreEquipo: Map<string, string>): LlaveCopa[] {
  const elim = new Set(fases.filter((f) => f.tipo === 'eliminatoria').map((f) => f.id))
  const out: LlaveCopa[] = []
  for (const copa of ['Copa Oro', 'Copa Plata']) {
    // Fase de grupos más reciente que tenga grupos de esta copa (la Fase 2)
    const fase = [...fases].reverse().find((f) => f.tipo === 'grupos' && f.grupos.some((g) => copaDe(g.nombre) === copa))
    if (!fase) continue
    const grupos = fase.grupos.filter((g) => copaDe(g.nombre) === copa).sort((a, b) => numGrupo(a.nombre) - numGrupo(b.nombre))
    if (grupos.length !== 4) continue // el esquema del reglamento es para 4 grupos
    const terminado = grupos.map((g) => { const ps = partidos.filter((p) => p.grupoId === g.id); return ps.length > 0 && ps.every((p) => p.estado === 'finalizado') })
    const pos = (gi: number, k: number): EqLlave | null => {
      const f = grupos[gi].tabla[k - 1]
      return f ? { teamId: f.teamId, nombre: f.equipo, provisional: !terminado[gi] } : null
    }
    const cruce = (id: Cruce['id'], a: EqLlave | null, b: EqLlave | null, oa: string, ob: string): Cruce => {
      const base: Cruce = { id, local: a, visitante: b, origenLocal: oa, origenVisitante: ob, gl: null, gv: null, pl: null, pv: null, ganador: null, partidoId: null, fecha: null, hora: null, escenario: null, estado: null }
      if (!a || !b || a.provisional || b.provisional) return base
      const p = partidos.find((x) => elim.has(x.faseId) && ((x.localId === a.teamId && x.visitanteId === b.teamId) || (x.localId === b.teamId && x.visitanteId === a.teamId)))
      if (!p) return base
      const [loc, vis, ol, ov] = p.localId === a.teamId ? [a, b, oa, ob] : [b, a, ob, oa]
      const c: Cruce = { ...base, local: loc, visitante: vis, origenLocal: ol, origenVisitante: ov, gl: p.golesLocal, gv: p.golesVisitante, pl: p.penalesLocal, pv: p.penalesVisitante, partidoId: p.id, fecha: p.fecha, hora: p.hora, escenario: p.escenario, estado: p.estado }
      if (p.estado === 'finalizado' && p.golesLocal != null && p.golesVisitante != null) {
        if (p.golesLocal !== p.golesVisitante) c.ganador = p.golesLocal > p.golesVisitante ? 'local' : 'visitante'
        else if (p.penalesLocal != null && p.penalesVisitante != null && p.penalesLocal !== p.penalesVisitante) c.ganador = p.penalesLocal > p.penalesVisitante ? 'local' : 'visitante'
      }
      return c
    }
    const gana = (c: Cruce) => (c.ganador ? (c.ganador === 'local' ? c.local : c.visitante) : null)
    const pierde = (c: Cruce) => (c.ganador ? (c.ganador === 'local' ? c.visitante : c.local) : null)
    const G = (i: number) => `Grupo ${numGrupo(grupos[i].nombre) === 99 ? i + 1 : numGrupo(grupos[i].nombre)}`
    const c1 = cruce('C1', pos(0, 1), pos(2, 2), `1.º ${G(0)}`, `2.º ${G(2)}`)
    const c2 = cruce('C2', pos(1, 1), pos(3, 2), `1.º ${G(1)}`, `2.º ${G(3)}`)
    const c3 = cruce('C3', pos(2, 1), pos(0, 2), `1.º ${G(2)}`, `2.º ${G(0)}`)
    const c4 = cruce('C4', pos(3, 1), pos(1, 2), `1.º ${G(3)}`, `2.º ${G(1)}`)
    const s1 = cruce('S1', gana(c1), gana(c2), 'Ganador C1', 'Ganador C2')
    const s2 = cruce('S2', gana(c3), gana(c4), 'Ganador C3', 'Ganador C4')
    const fi = cruce('F', gana(s1), gana(s2), 'Ganador S1', 'Ganador S2')
    const te = cruce('T', pierde(s1), pierde(s2), 'Perdedor S1', 'Perdedor S2')
    void nombreEquipo
    out.push({ copa, cruces: [c1, c2, c3, c4, s1, s2, fi, te], campeon: gana(fi), gruposTerminados: terminado.filter(Boolean).length })
  }
  return out
}
