// Pruebas de los cálculos del torneo. Ejecutar: npx tsx lib/torneo.test.ts
import { tabla, sanciones, goleadores, roundRobin, marcadorDesdeEventos, CfgTorneo, PartidoCalc } from './torneo'
import { calcularSanciones } from './sanciones'
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
// Art. 50: las amarillas se reinician al cambiar de fase de grupos; la suspensión pendiente se mantiene
const C = (x: PartidoCalc, ciclo: string): PartidoCalc => ({ ...x, ciclo })
const ca = [C(P('1','A','B',0,0,1,[a('amarilla')]),'f1'), C(P('2','A','C',0,0,2,[a('amarilla')]),'f1'), C(P('8','A','D',0,0,8,[a('amarilla')]),'f2')]
s = sanciones(ca, cfg)[0]; eq([s.amarillas, s.suspendidoProximo, s.totalAmarillas], [1, 0, 3], 'reinicio: 2 de F1 + 1 de F2 = 1, sin suspensión')
s = sanciones([...ca.slice(0, 2), C(P('8','A','D',0,0,8,[],'programado'),'f2')], cfg)[0]; eq([s.amarillas, s.precaucion], [0, false], 'al terminar F1 la precaución se anula')
s = sanciones(ca.slice(0, 2), cfg)[0]; eq([s.amarillas, s.precaucion], [2, true], 'durante F1 sigue la precaución')
const cs = [C(P('1','A','B',0,0,1,[a('amarilla')]),'f1'), C(P('2','A','C',0,0,2,[a('amarilla')]),'f1'), C(P('3','A','D',0,0,3,[a('amarilla')]),'f1'), C(P('8','A','E',0,0,8),'f2')]
s = sanciones(cs.slice(0, 3), cfg)[0]; eq(s.suspendidoProximo, 1, 'suspendido al final de F1 (sin partidos de F2 aún)')
s = sanciones([...cs.slice(0, 3), C(P('8','A','E',0,0,8,[],'programado'),'f2')], cfg)[0]; eq(s.suspendidoProximo, 0, '3 amarillas de F1 no pasan a F2')
s = sanciones(cs, cfg)[0]; eq([s.suspendidoProximo, s.cumplidos, s.totalAmarillas], [0, 0, 3], 'no la cumple en F2 (anulada), totales intactos')
const r1 = { teamId: 'A', playerId: 'p7', tipo: 'roja' }, d1 = { teamId: 'A', playerId: 'p6', tipo: 'doble_amarilla' }
const cr = [C(P('7','A','B',0,0,7,[r1, d1]),'f1'), C(P('8','A','C',0,0,8,[],'programado'),'f2')]
const sr = sanciones(cr, cfg); eq([sr.find((x) => x.playerId === 'p7')!.suspendidoProximo, sr.find((x) => x.playerId === 'p6')!.suspendidoProximo], [2, 1], 'roja y doble de F1 pasan a F2')
const cr2 = [C(P('7','A','B',0,0,7,[r1]),'f1'), C(P('8','A','C',0,0,8),'f2'), C(P('9','A','D',0,0,9,[],'programado'),'f2')]
eq(sanciones(cr2, cfg)[0].suspendidoProximo, 1, 'roja de F1 cumple 1 en F2, queda 1')
const mix = [C(P('6','A','B',0,0,6,[a('amarilla'), a('amarilla'), a('amarilla')]),'f1'), C(P('7','A','C',0,0,7,[{ teamId: 'A', playerId: 'p1', tipo: 'roja' }]),'f1'), C(P('8','A','D',0,0,8,[],'programado'),'f2')]
eq(sanciones(mix, cfg)[0].suspendidoProximo, 2, 'jugó en F1 sin cumplir las amarillas: esa se anula, la roja pasa entera')
const c3 = [C(P('8','A','B',0,0,8,[a('amarilla')]),'f2'), C(P('9','A','C',0,0,9,[a('amarilla')]),'f2'), C(P('10','A','D',0,0,10,[a('amarilla')]),'f2')]
eq(sanciones(c3, cfg)[0].suspendidoProximo, 1, '3 amarillas en F2 = 1 fecha')
eq(sanciones([...c3.slice(0, 2), C(P('11','A','D',0,0,11,[a('amarilla')]),'f2')], cfg)[0].suspendidoProximo, 1, 'cuartos siguen el ciclo de su fase')
// Partido SUSPENDIDO: sus tarjetas cuentan, pero no sirve para cumplir; sanción adicional en la roja
const rx = { teamId: 'A', playerId: 'p5', tipo: 'roja', extra: 4 }
const su = [P('7','A','B',0,1,7,[rx],'suspendido'), C(P('8','A','C',0,0,8),'f2'), C(P('9','A','D',0,0,9,[],'programado'),'f2')]
const s5 = sanciones(su, cfg).find((x) => x.playerId === 'p5')!
eq([s5.suspendidoProximo, s5.cumplidos], [5, 1], 'roja (2) + 4 adicionales en partido suspendido: cumple 1, quedan 5')
const su2 = [P('7','A','B',0,0,7,[],'suspendido'), P('6','A','C',0,0,6,[{ teamId: 'A', playerId: 'p4', tipo: 'roja' }])]
eq(sanciones(su2, cfg)[0].suspendidoProximo, 2, 'un partido suspendido no cuenta como cumplido')
const sd = sanciones([P('1','A','B',0,0,1,[{ teamId: 'A', playerId: 'p3', tipo: 'doble_amarilla', extra: 2 }])], cfg)[0]
eq(sd.suspendidoProximo, 3, 'doble amarilla (1) + 2 adicionales')
// Fase Final (eliminatoria): ciclo nuevo y las amarillas sueltas no suspenden; doble = 1 y roja = 2 sí; la de 3 amarillas de F2 se anula
const E = (x: PartidoCalc): PartidoCalc => ({ ...x, ciclo: 'fin', acumula: false })
const f2a = [C(P('8','A','B',0,0,8,[a('amarilla')]),'f2'), C(P('9','A','C',0,0,9,[a('amarilla')]),'f2')]
s = sanciones([...f2a, E(P('11','A','D',1,0,11,[a('amarilla')])), E(P('12','A','E',1,0,12,[a('amarilla')])), E(P('13','A','F',0,0,13,[a('amarilla')]))], cfg)[0]
eq([s.suspendidoProximo, s.precaucion, s.totalAmarillas], [0, false, 5], 'Fase Final: 3 amarillas sueltas no suspenden; totales intactos')
s = sanciones([...f2a, E(P('11','A','D',0,0,11,[],'programado'))], cfg)[0]; eq(s.precaucion, false, 'al entrar a la Fase Final no hay precaución')
s = sanciones([...f2a, C(P('10','A','B',0,0,10,[a('amarilla')]),'f2'), E(P('11','A','D',0,0,11,[],'programado'))], cfg)[0]
eq(s.suspendidoProximo, 0, '3.ª amarilla al final de F2: se anula al pasar a cuartos')
const rj = { teamId: 'A', playerId: 'p7', tipo: 'roja' }
s = sanciones([C(P('10','A','B',0,0,10,[rj]),'f2'), E(P('11','A','D',1,0,11)), E(P('12','A','E',0,0,12,[],'programado'))], cfg).find((x) => x.playerId === 'p7')!
eq([s.suspendidoProximo, s.cumplidos], [1, 1], 'roja en F2 pasa a la Fase Final: cumple cuartos y le falta la semi')
const dj = { teamId: 'A', playerId: 'p6', tipo: 'doble_amarilla' }
s = sanciones([E(P('11','A','D',1,0,11,[dj])), E(P('12','A','E',0,0,12,[],'programado'))], cfg).find((x) => x.playerId === 'p6')!
eq(s.suspendidoProximo, 1, 'doble amarilla en cuartos = 1 partido (semi)')
// El mismo criterio en el cálculo de multas / portal / reportes
const PS = (x: PartidoCalc) => ({ id: x.id, jornadaNum: x.jornadaNum, fecha: x.fecha, localId: x.localId, visitanteId: x.visitanteId, estado: x.estado, eventos: x.eventos, ciclo: x.ciclo, acumula: x.acumula })
const cfgS = { amarillasSuspension: 3, partidosDobleAmarilla: 1, partidosRojaDirecta: 2 }
let fsn = calcularSanciones([...f2a, E(P('11','A','D',1,0,11,[a('amarilla')])), E(P('12','A','E',1,0,12,[a('amarilla')])), E(P('13','A','F',0,0,13,[a('amarilla')])), E(P('14','A','G',0,0,14,[],'programado'))].map(PS), cfgS)[0]
eq([fsn.estado, fsn.total, fsn.acum], ['—', 0, 0], 'multas/portal: en la Fase Final las amarillas no suspenden')
fsn = calcularSanciones([...f2a, C(P('10','A','B',0,0,10,[a('amarilla')]),'f2'), E(P('11','A','D',0,0,11,[],'programado'))].map(PS), cfgS)[0]
eq([fsn.estado, fsn.anulados], ['—', 1], 'multas/portal: 3.ª amarilla de F2 anulada en cuartos')
fsn = calcularSanciones([C(P('10','A','B',0,0,10,[rj]),'f2'), E(P('11','A','D',1,0,11)), E(P('12','A','E',0,0,12,[],'programado'))].map(PS), cfgS).find((x) => x.playerId === 'p7')!
eq([fsn.estado, fsn.cumplidos, fsn.pendientes], ['SUSPENDIDO', 1, [12]], 'multas/portal: roja de F2 se cumple en cuartos y semi')
console.log(`OK ${ok}  FALLAS ${mal}`)
