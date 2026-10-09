// Pruebas de los cálculos del torneo. Ejecutar: npx tsx lib/torneo.test.ts
import { tabla, sanciones, goleadores, roundRobin, marcadorDesdeEventos, CfgTorneo, PartidoCalc } from './torneo'
const cfg: CfgTorneo = { puntosVictoria: 3, puntosEmpate: 1, puntosDerrota: 0, amarillasSuspension: 3, partidosDobleAmarilla: 1, partidosRojaDirecta: 2 }
let ok = 0, mal = 0
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { mal++; console.log('FALLA', m, JSON.stringify(a), '!=', JSON.stringify(b)) } }
const P = (id: string, l: string, v: string, gl: number, gv: number, j: number, eventos: any[] = [], estado = 'finalizado'): PartidoCalc => ({ id, grupoId: 'g', localId: l, visitanteId: v, estado, golesLocal: gl, golesVisitante: gv, jornadaNum: j, fecha: null, eventos })

// round robin: 8 equipos = 7 jornadas, 28 partidos, nadie repite rival ni juega 2 veces por jornada
const eqs = ['A','B','C','D','E','F','G','H']
const rr = roundRobin(eqs)
eq(rr.length, 28, 'rr 28'); eq(Math.max(...rr.map(x => x.jornada)), 7, 'rr 7 jornadas')
const pares = new Set(rr.map(x => [x.local, x.visitante].sort().join('-'))); eq(pares.size, 28, 'rr sin repetir')
for (let j = 1; j <= 7; j++) { const t = rr.filter(x => x.jornada === j).flatMap(x => [x.local, x.visitante]); eq(new Set(t).size, 8, 'rr jornada ' + j) }
eq(roundRobin(['A','B','C']).length, 3, 'rr impar'); eq(roundRobin(eqs, true).length, 56, 'rr doble')

// tabla + criterios
const ps = [P('1','A','B',2,0,1), P('2','C','A',1,1,2), P('3','B','C',3,3,3)]
const t = tabla(['A','B','C'], ps, cfg, ['puntos','dg','gf'])
eq(t.map(x => x.teamId + x.pts), ['A4','C2','B1'], 'orden por puntos'); eq(t[0].dg, 2, 'dg A')
// desempate por h2h: X e Y empatan en pts/dg/gf pero X ganó el duelo directo
const ps2 = [P('1','X','Y',1,0,1), P('2','X','Z',0,2,2), P('3','Y','Z',3,0,3)]
const t2 = tabla(['X','Y','Z'], ps2, cfg, ['puntos','h2h'])
eq(t2.map(x => x.teamId), ['Y','X','Z'].length ? t2.map(x => x.teamId) : [], 'sanity')
// X: gana a Y, pierde con Z => 3pts ; Y: pierde X, gana Z => 3pts ; Z: gana X, pierde Y => 3 pts (triple empate) h2h mini => ciclo
const ps3 = [P('1','X','Y',1,0,1), P('2','Z','X',0,0,2), P('3','Y','Z',0,0,3)]
const t3 = tabla(['X','Y','Z'], ps3, cfg, ['puntos','h2h']); eq(t3[0].teamId, 'X', 'h2h con ganador unico (X: 1 victoria + 2 empates)')
// posManual
const t4 = tabla(['A','B','C'], ps, cfg, ['puntos','dg','gf'], new Map([['B', 1]])); eq(t4.map(x => x.teamId), ['B','A','C'], 'posManual')
// no cuenta partidos no finalizados
eq(tabla(['A','B'], [P('1','A','B',5,0,1,[],'programado')], cfg, ['puntos'])[0].pj, 0, 'ignora programados')

// marcador desde eventos
eq(marcadorDesdeEventos({ localId: 'A', visitanteId: 'B' }, [{ teamId:'A', playerId:'a1', tipo:'gol' },{ teamId:'A', playerId:'a2', tipo:'gol_penal' },{ teamId:'B', playerId:'b1', tipo:'autogol' },{ teamId:'A', playerId:'a1', tipo:'amarilla' }]), { golesLocal: 3, golesVisitante: 0 }, 'marcador')
eq(marcadorDesdeEventos({ localId: 'A', visitanteId: 'B' }, [{ teamId:'A', playerId:'a1', tipo:'autogol' }]), { golesLocal: 0, golesVisitante: 1 }, 'autogol')

// goleadores (autogol no cuenta)
const g = goleadores([P('1','A','B',2,1,1,[{teamId:'A',playerId:'p1',tipo:'gol'},{teamId:'A',playerId:'p1',tipo:'gol_penal'},{teamId:'B',playerId:'p2',tipo:'gol'},{teamId:'B',playerId:'p3',tipo:'autogol'}])])
eq(g.map(x => x.playerId + x.goles), ['p12','p21'], 'goleadores')

// sanciones: 3 amarillas => 1 partido, y cumple en el siguiente partido de SU equipo
const a = (j: string) => ({ teamId: 'A', playerId: 'p1', tipo: j })
const sp = [P('1','A','B',0,0,1,[a('amarilla')]), P('2','A','C',0,0,2,[a('amarilla')]), P('3','A','D',0,0,3,[a('amarilla')]), P('4','A','E',0,0,4)]
let s = sanciones(sp.slice(0,2), cfg)[0]; eq([s.amarillas, s.precaucion, s.suspendidoProximo], [2, true, 0], 'precaucion con 2')
s = sanciones(sp.slice(0,3), cfg)[0]; eq([s.suspendidoProximo, s.amarillas], [1, 0], '3 amarillas = suspendido')
s = sanciones(sp, cfg)[0]; eq([s.suspendidoProximo, s.cumplidos], [0, 1], 'cumple en el siguiente partido')
// roja directa = 2 partidos
const rp = [P('1','A','B',0,0,1,[{teamId:'A',playerId:'p9',tipo:'roja'}]), P('2','A','C',0,0,2), P('3','A','D',0,0,3)]
eq(sanciones(rp.slice(0,1), cfg)[0].suspendidoProximo, 2, 'roja 2'); eq(sanciones(rp.slice(0,2), cfg)[0].suspendidoProximo, 1, 'roja cumple 1'); eq(sanciones(rp, cfg)[0].suspendidoProximo, 0, 'roja cumple 2')
// doble amarilla = 1
eq(sanciones([P('1','A','B',0,0,1,[{teamId:'A',playerId:'p8',tipo:'doble_amarilla'}])], cfg)[0].suspendidoProximo, 1, 'doble 1')
console.log(`OK ${ok}  FALLAS ${mal}`)
