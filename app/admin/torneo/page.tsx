'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

interface Equipo { id: string; name: string }
interface Fila { teamId: string; equipo: string; pj: number; pg: number; pe: number; pp: number; gf: number; gc: number; dg: number; pts: number; pos: number }
interface Grupo { id: string; nombre: string; equipos: (Equipo & { posManual: number | null })[]; tabla: Fila[] }
interface Fase { id: string; orden: number; nombre: string; tipo: string; criterios: string[]; grupos: Grupo[] }
interface Partido { id: string; faseId: string; grupoId: string | null; jornada: string; jornadaNum: number; fecha: string | null; hora: string | null; escenario: string | null; veedor: string | null; estado: string; localId: string; visitanteId: string; local: string; visitante: string; golesLocal: number | null; golesVisitante: number | null }
interface Torneo { id: string; nombre: string; publico: boolean; puntosVictoria: number; puntosEmpate: number; puntosDerrota: number; amarillasSuspension: number; partidosDobleAmarilla: number; partidosRojaDirecta: number; fases: Fase[]; partidos: Partido[] }

const CRIT: Record<string, string> = { puntos: 'Puntos', dg: 'Diferencia de gol', gf: 'Goles a favor', gc: 'Goles en contra (menos es mejor)', ganados: 'Partidos ganados', h2h: 'Enfrentamiento directo', fairplay: 'Juego limpio (menos tarjetas)' }
const inp = 'px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm'
const btn = 'px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm'
const btn2 = 'px-3 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm'
const sec = 'bg-slate-800 border border-slate-700 rounded-xl p-5 mb-5'

export default function TorneoAdmin() {
  const [torneos, setTorneos] = useState<{ id: string; nombre: string }[]>([])
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [t, setT] = useState<Torneo | null>(null)
  const [rol, setRol] = useState('')
  const [tid, setTid] = useState('')
  const [msg, setMsg] = useState('')
  const [nuevoT, setNuevoT] = useState('')
  const esAdmin = rol === 'admin'

  const cargar = useCallback(async (id?: string) => {
    const r = await fetch('/api/torneo/admin' + (id ?? tid ? `?torneoId=${id ?? tid}` : '')).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setMsg(r?.message || 'No se pudo cargar'); return }
    setTorneos(r.torneos); setEquipos(r.equipos); setRol(r.rol); setT(r.torneo); if (r.torneo && !tid) setTid(r.torneo.id)
  }, [tid])
  useEffect(() => { cargar() }, [cargar])

  const act = async (accion: string, datos: Record<string, unknown> = {}, ok = '') => {
    const r = await fetch('/api/torneo/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion, ...datos }) }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Error de conexión' }))
    setMsg(r.ok ? ok : r.message || 'Error')
    await cargar()
    return r
  }

  if (!t && !esAdmin && rol) return <Shell><p>Todavía no hay un torneo creado.</p></Shell>

  return (
    <Shell>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-3xl font-bold">🏆 Torneo</h1>
        {torneos.length > 0 && (
          <select className={inp} value={tid} onChange={(e) => { setTid(e.target.value); cargar(e.target.value) }}>
            {torneos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        )}
        {t && <a className="underline text-sm text-yellow-300" href="/torneo" target="_blank">Ver página pública ↗</a>}
      </div>
      {msg && <div className="bg-slate-700 border border-slate-500 rounded-lg p-3 mb-4 text-sm" onClick={() => setMsg('')}>{msg}</div>}

      {esAdmin && (
        <section className={sec}>
          <h2 className="font-bold mb-2">Crear un torneo nuevo</h2>
          <div className="flex gap-2">
            <input className={inp} placeholder="Ej. Keeper Cup 3" value={nuevoT} onChange={(e) => setNuevoT(e.target.value)} />
            <button className={btn} onClick={async () => { const r = await act('crear_torneo', { nombre: nuevoT }, 'Torneo creado'); if (r.ok) { setNuevoT(''); setTid(r.id); cargar(r.id) } }}>Crear</button>
          </div>
        </section>
      )}

      {t && esAdmin && <Reglas t={t} act={act} />}
      {t && <Fases t={t} equipos={equipos} esAdmin={esAdmin} act={act} />}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Volver al panel</Link>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  )
}

function Reglas({ t, act }: { t: Torneo; act: (a: string, d?: Record<string, unknown>, ok?: string) => Promise<{ ok: boolean; pendientes?: number }> }) {
  const campos: [keyof Torneo, string][] = [['puntosVictoria', 'Puntos victoria'], ['puntosEmpate', 'Puntos empate'], ['puntosDerrota', 'Puntos derrota'], ['amarillasSuspension', 'Amarillas = 1 partido de suspensión'], ['partidosDobleAmarilla', 'Partidos por doble amarilla'], ['partidosRojaDirecta', 'Partidos por roja directa']]
  return (
    <details className={sec}>
      <summary className="font-bold cursor-pointer">Reglas del torneo (puntos y sanciones)</summary>
      <div className="grid md:grid-cols-3 gap-3 mt-3">
        {campos.map(([k, l]) => (
          <label key={k} className="text-sm text-slate-300 flex flex-col gap-1">{l}
            <input type="number" min={0} className={inp} defaultValue={t[k] as number} key={t.id + k + t[k]} onBlur={(e) => act('editar_torneo', { id: t.id, [k]: Number(e.target.value) }, 'Reglas guardadas')} />
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" checked={t.publico} onChange={(e) => act('editar_torneo', { id: t.id, publico: e.target.checked })} /> Mostrar este torneo en la página pública</label>
    </details>
  )
}

function Fases({ t, equipos, esAdmin, act }: { t: Torneo; equipos: Equipo[]; esAdmin: boolean; act: (a: string, d?: Record<string, unknown>, ok?: string) => Promise<{ ok: boolean; pendientes?: number }> }) {
  const [nf, setNf] = useState({ nombre: '', tipo: 'grupos' })
  return (
    <>
      {t.fases.map((f) => <FaseCard key={f.id} f={f} t={t} equipos={equipos} esAdmin={esAdmin} act={act} />)}
      {esAdmin && (
        <section className={sec}>
          <h2 className="font-bold mb-2">Agregar fase</h2>
          <p className="text-slate-400 text-sm mb-2">Ejemplo: "Fase de grupos", "Super grupos", "Copa Oro", "Copa Plata". Cada fase tiene sus grupos, sus equipos y sus partidos.</p>
          <div className="flex flex-wrap gap-2">
            <input className={inp} placeholder="Nombre de la fase" value={nf.nombre} onChange={(e) => setNf({ ...nf, nombre: e.target.value })} />
            <select className={inp} value={nf.tipo} onChange={(e) => setNf({ ...nf, tipo: e.target.value })}><option value="grupos">Por grupos (todos contra todos)</option><option value="eliminatoria">Eliminatoria (cruces)</option></select>
            <button className={btn} onClick={async () => { const r = await act('crear_fase', { torneoId: t.id, ...nf }, 'Fase creada'); if (r.ok) setNf({ ...nf, nombre: '' }) }}>Agregar fase</button>
          </div>
        </section>
      )}
    </>
  )
}

function FaseCard({ f, t, equipos, esAdmin, act }: { f: Fase; t: Torneo; equipos: Equipo[]; esAdmin: boolean; act: (a: string, d?: Record<string, unknown>, ok?: string) => Promise<{ ok: boolean; pendientes?: number }> }) {
  const [ng, setNg] = useState('')
  const [abierta, setAbierta] = useState(true)
  const [crit, setCrit] = useState(f.criterios)
  const mover = (i: number, d: number) => { const c = [...crit]; const j = i + d; if (j < 0 || j >= c.length) return;[c[i], c[j]] = [c[j], c[i]]; setCrit(c) }
  const partidos = t.partidos.filter((p) => p.faseId === f.id)
  return (
    <section className={sec}>
      <div className="flex flex-wrap justify-between gap-2 items-center">
        <h2 className="text-xl font-bold cursor-pointer" onClick={() => setAbierta(!abierta)}>{abierta ? '▾' : '▸'} Fase {f.orden}: {f.nombre} <span className="text-slate-400 text-sm font-normal">({f.tipo === 'grupos' ? 'por grupos' : 'eliminatoria'} · {partidos.length} partidos)</span></h2>
        {esAdmin && <button className="text-red-400 text-sm" onClick={() => confirm(`¿Borrar la fase "${f.nombre}" con todos sus grupos, partidos y resultados?`) && act('borrar_fase', { id: f.id }, 'Fase borrada')}>Borrar fase</button>}
      </div>
      {abierta && (
        <>
          {esAdmin && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-slate-300">Criterios para ubicar equipos en la tabla (en este orden)</summary>
              <ol className="mt-2 space-y-1">
                {crit.map((c, i) => (
                  <li key={c} className="flex items-center gap-2">{i + 1}. {CRIT[c]} <button className={btn2} onClick={() => mover(i, -1)}>▲</button><button className={btn2} onClick={() => mover(i, 1)}>▼</button><button className="text-red-400" onClick={() => setCrit(crit.filter((x) => x !== c))}>quitar</button></li>
                ))}
              </ol>
              <div className="flex gap-2 mt-2 items-center">
                <select className={inp} value="" onChange={(e) => e.target.value && setCrit([...crit, e.target.value])}><option value="">+ Agregar criterio…</option>{Object.keys(CRIT).filter((c) => !crit.includes(c)).map((c) => <option key={c} value={c}>{CRIT[c]}</option>)}</select>
                <button className={btn} onClick={() => act('editar_fase', { id: f.id, criterios: crit.join(',') }, 'Criterios guardados')}>Guardar criterios</button>
              </div>
            </details>
          )}
          {f.grupos.map((g) => <GrupoCard key={g.id} g={g} f={f} t={t} equipos={equipos} esAdmin={esAdmin} act={act} partidos={partidos.filter((p) => p.grupoId === g.id)} />)}
          {esAdmin && (
            <div className="flex gap-2 mt-4">
              <input className={inp} placeholder={f.tipo === 'grupos' ? 'Nombre del grupo (ej. Grupo A)' : 'Nombre (ej. Copa Oro)'} value={ng} onChange={(e) => setNg(e.target.value)} />
              <button className={btn} onClick={async () => { const r = await act('crear_grupo', { faseId: f.id, nombre: ng }, 'Grupo creado'); if (r.ok) setNg('') }}>Agregar grupo</button>
            </div>
          )}
          <PartidosFase partidos={partidos.filter((p) => !p.grupoId || !f.grupos.some((g) => g.id === p.grupoId))} f={f} t={t} esAdmin={esAdmin} act={act} equipos={equipos} sueltos />
        </>
      )}
    </section>
  )
}

function GrupoCard({ g, f, t, equipos, esAdmin, act, partidos }: { g: Grupo; f: Fase; t: Torneo; equipos: Equipo[]; esAdmin: boolean; act: (a: string, d?: Record<string, unknown>, ok?: string) => Promise<{ ok: boolean; pendientes?: number }>; partidos: Partido[] }) {
  const [asignar, setAsignar] = useState(false)
  const [sel, setSel] = useState<string[]>(g.equipos.map((e) => e.id))
  const [q, setQ] = useState('')
  const [tr, setTr] = useState({ fase: '', desde: 1, hasta: 4 })
  const [doble, setDoble] = useState(false)
  const otras = t.fases.filter((x) => x.id !== f.id)
  const filtrados = equipos.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="mt-5 border border-slate-600 rounded-lg p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-bold text-lg">{g.nombre} <span className="text-slate-400 text-sm font-normal">· {g.equipos.length} equipos</span></h3>
        {esAdmin && (
          <div className="flex flex-wrap gap-2 text-sm">
            <button className={btn2} onClick={() => { setSel(g.equipos.map((e) => e.id)); setAsignar(!asignar) }}>Equipos</button>
            <button className="text-red-400" onClick={() => confirm(`¿Borrar "${g.nombre}" con sus partidos?`) && act('borrar_grupo', { id: g.id }, 'Grupo borrado')}>Borrar</button>
          </div>
        )}
      </div>

      {esAdmin && asignar && (
        <div className="mt-3 bg-slate-900/60 rounded-lg p-3">
          <input className={inp + ' mb-2'} placeholder="Buscar equipo…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1 max-h-56 overflow-auto text-sm">
            {filtrados.map((e) => <label key={e.id} className="flex gap-2"><input type="checkbox" checked={sel.includes(e.id)} onChange={(ev) => setSel(ev.target.checked ? [...sel, e.id] : sel.filter((x) => x !== e.id))} />{e.name}</label>)}
          </div>
          <button className={btn + ' mt-3'} onClick={async () => { const r = await act('asignar_equipos', { grupoId: g.id, teamIds: sel }, 'Equipos guardados'); if (r.ok) setAsignar(false) }}>Guardar ({sel.length} equipos)</button>
          {otras.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-700 text-sm flex flex-wrap gap-2 items-center">
              Traer clasificados de
              <select className={inp} value={tr.fase} onChange={(e) => setTr({ ...tr, fase: e.target.value })}><option value="">— fase —</option>{otras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select>
              posiciones <input type="number" min={1} className={inp + ' w-16'} value={tr.desde} onChange={(e) => setTr({ ...tr, desde: Number(e.target.value) })} /> a <input type="number" min={1} className={inp + ' w-16'} value={tr.hasta} onChange={(e) => setTr({ ...tr, hasta: Number(e.target.value) })} /> de cada grupo
              <button className={btn} disabled={!tr.fase} onClick={async () => { const datos = { grupoId: g.id, desdeFaseId: tr.fase, desde: tr.desde, hasta: tr.hasta }; let r = await act('traer_clasificados', datos, 'Clasificados agregados'); if (!r.ok && (r as { pendientes?: number }).pendientes && confirm('Todavía hay partidos sin finalizar en esa fase, así que las posiciones no son definitivas. ¿Traer los equipos de todas formas?')) r = await act('traer_clasificados', { ...datos, forzar: true }, 'Clasificados agregados'); if (r.ok) setAsignar(false) }}>Traer</button>
            </div>
          )}
        </div>
      )}

      {g.tabla.length > 0 && (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead className="text-slate-400 text-left"><tr><th className="py-1">#</th><th>Equipo</th><th className="text-center">PJ</th><th className="text-center">PG</th><th className="text-center">PE</th><th className="text-center">PP</th><th className="text-center">GF</th><th className="text-center">GC</th><th className="text-center">DG</th><th className="text-center">Pts</th>{esAdmin && <th className="text-center">Pos. manual</th>}</tr></thead>
            <tbody>{g.tabla.map((r) => (
              <tr key={r.teamId} className="border-t border-slate-700"><td className="py-1">{r.pos}</td><td>{r.equipo}</td><td className="text-center">{r.pj}</td><td className="text-center">{r.pg}</td><td className="text-center">{r.pe}</td><td className="text-center">{r.pp}</td><td className="text-center">{r.gf}</td><td className="text-center">{r.gc}</td><td className="text-center">{r.dg}</td><td className="text-center font-bold">{r.pts}</td>
                {esAdmin && <td className="text-center"><input type="number" min={1} className={inp + ' w-16 py-1'} defaultValue={g.equipos.find((e) => e.id === r.teamId)?.posManual ?? ''} key={r.teamId + r.pos} onBlur={(e) => act('pos_manual', { grupoId: g.id, teamId: r.teamId, pos: e.target.value === '' ? null : Number(e.target.value) })} /></td>}
              </tr>))}</tbody>
          </table>
        </div>
      )}

      {esAdmin && f.tipo === 'grupos' && partidos.length === 0 && g.equipos.length >= 2 && (
        <div className="mt-3 flex items-center gap-3 text-sm">
          <button className={btn} onClick={() => act('generar_fixture', { grupoId: g.id, dobleVuelta: doble }, 'Fixture generado')}>Generar fixture (todos contra todos)</button>
          <label className="flex items-center gap-2"><input type="checkbox" checked={doble} onChange={(e) => setDoble(e.target.checked)} /> ida y vuelta</label>
        </div>
      )}
      <PartidosFase partidos={partidos} f={f} t={t} esAdmin={esAdmin} act={act} equipos={equipos} grupo={g} />
    </div>
  )
}

function PartidosFase({ partidos, f, t, esAdmin, act, equipos, grupo, sueltos }: { partidos: Partido[]; f: Fase; t: Torneo; esAdmin: boolean; act: (a: string, d?: Record<string, unknown>, ok?: string) => Promise<{ ok: boolean; pendientes?: number }>; equipos: Equipo[]; grupo?: Grupo; sueltos?: boolean }) {
  const [editando, setEditando] = useState<string | null>(null)
  const [np, setNp] = useState({ jornada: '', jornadaNum: 1, localId: '', visitanteId: '', fecha: '', hora: '', escenario: '' })
  const [abierto, setAbierto] = useState(false)
  const porJornada = useMemo(() => { const m = new Map<string, Partido[]>(); for (const p of partidos) m.set(p.jornada, [...(m.get(p.jornada) || []), p]); return Array.from(m.entries()) }, [partidos])
  const candidatos = grupo ? grupo.equipos : equipos
  if (sueltos && !esAdmin && !partidos.length) return null
  return (
    <div className="mt-3">
      {porJornada.length > 0 && (
        <>
          <button className="text-sm text-slate-300 underline" onClick={() => setAbierto(!abierto)}>{abierto ? 'Ocultar' : 'Ver'} partidos ({partidos.length})</button>
          {abierto && porJornada.map(([j, ps]) => (
            <div key={j} className="mt-2">
              <p className="text-yellow-300 text-sm font-semibold">{j}</p>
              {ps.map((p) => (
                <div key={p.id} className="border-b border-slate-700 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-3 justify-between">
                    <span><b>{p.local}</b> {p.estado === 'finalizado' || p.golesLocal !== null ? <b className="text-yellow-300">{p.golesLocal ?? 0} - {p.golesVisitante ?? 0}</b> : 'vs'} <b>{p.visitante}</b>
                      <span className="text-slate-400"> · {p.fecha || 'sin fecha'} {p.hora || ''} {p.escenario ? '· ' + p.escenario : ''}</span>
                      {p.estado === 'finalizado' && <span className="text-green-400"> ✔</span>}{p.estado === 'suspendido' && <span className="text-orange-300"> suspendido</span>}</span>
                    <span className="flex gap-2">
                      <Link className={btn2} href={`/admin/torneo/partido/${p.id}`}>Resultado</Link>
                      {esAdmin && <button className={btn2} onClick={() => setEditando(editando === p.id ? null : p.id)}>Editar</button>}
                    </span>
                  </div>
                  {esAdmin && editando === p.id && <EditarPartido p={p} act={act} cerrar={() => setEditando(null)} />}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
      {esAdmin && (f.tipo === 'eliminatoria' || sueltos || grupo) && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-slate-300">+ Agregar un partido a mano</summary>
          <div className="flex flex-wrap gap-2 mt-2">
            <input className={inp} placeholder="Ronda (ej. Cuartos de final)" value={np.jornada} onChange={(e) => setNp({ ...np, jornada: e.target.value })} />
            <input type="number" className={inp + ' w-20'} min={1} title="N.º de jornada (para ordenar)" value={np.jornadaNum} onChange={(e) => setNp({ ...np, jornadaNum: Number(e.target.value) })} />
            <select className={inp} value={np.localId} onChange={(e) => setNp({ ...np, localId: e.target.value })}><option value="">Local…</option>{candidatos.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
            <select className={inp} value={np.visitanteId} onChange={(e) => setNp({ ...np, visitanteId: e.target.value })}><option value="">Visitante…</option>{candidatos.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
            <input type="date" className={inp} value={np.fecha} onChange={(e) => setNp({ ...np, fecha: e.target.value })} />
            <input type="time" className={inp} value={np.hora} onChange={(e) => setNp({ ...np, hora: e.target.value })} />
            <input className={inp} placeholder="Cancha / escenario" value={np.escenario} onChange={(e) => setNp({ ...np, escenario: e.target.value })} />
            <button className={btn} onClick={async () => { const r = await act('crear_partido', { faseId: f.id, grupoId: grupo?.id, ...np }, 'Partido creado'); if (r.ok) setAbierto(true) }}>Crear partido</button>
          </div>
        </details>
      )}
      {void t}
    </div>
  )
}

function EditarPartido({ p, act, cerrar }: { p: Partido; act: (a: string, d?: Record<string, unknown>, ok?: string) => Promise<{ ok: boolean; pendientes?: number }>; cerrar: () => void }) {
  const [v, setV] = useState({ fecha: p.fecha || '', hora: p.hora || '', escenario: p.escenario || '', veedor: p.veedor || '', jornada: p.jornada, jornadaNum: p.jornadaNum })
  return (
    <div className="flex flex-wrap gap-2 mt-2 bg-slate-900/60 p-3 rounded-lg">
      <input type="date" className={inp} value={v.fecha} onChange={(e) => setV({ ...v, fecha: e.target.value })} />
      <input type="time" className={inp} value={v.hora} onChange={(e) => setV({ ...v, hora: e.target.value })} />
      <input className={inp} placeholder="Cancha" value={v.escenario} onChange={(e) => setV({ ...v, escenario: e.target.value })} />
      <input className={inp} placeholder="Veedor" value={v.veedor} onChange={(e) => setV({ ...v, veedor: e.target.value })} />
      <input className={inp} placeholder="Jornada" value={v.jornada} onChange={(e) => setV({ ...v, jornada: e.target.value })} />
      <input type="number" className={inp + ' w-20'} value={v.jornadaNum} onChange={(e) => setV({ ...v, jornadaNum: Number(e.target.value) })} />
      <button className={btn} onClick={async () => { const r = await act('editar_partido', { id: p.id, ...v }, 'Partido guardado'); if (r.ok) cerrar() }}>Guardar</button>
      <button className="text-red-400 text-sm" onClick={() => confirm('¿Borrar este partido y sus eventos?') && act('borrar_partido', { id: p.id }, 'Partido borrado')}>Borrar partido</button>
    </div>
  )
}
