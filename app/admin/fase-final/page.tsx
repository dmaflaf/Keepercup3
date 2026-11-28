'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface Plan { copa: string; faseNombre: string; faseId: string | null; crearFase: boolean; crear: { id: string; ronda: string; jornadaNum: number; local: string; visitante: string }[]; esperando: string[]; hechos: string[] }
interface Datos { torneos: { id: string; nombre: string }[]; torneoId: string; planes: { copa: string; plan: Plan | { error: string }; ultimo: boolean }[] }

const card = 'bg-slate-800 border border-slate-700 rounded-xl p-5 mb-5'
const btn = 'px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-40'

export default function FaseFinal() {
  const [d, setD] = useState<Datos | null>(null)
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const cargar = useCallback(async (tid?: string) => {
    const r = await fetch('/api/admin/fase-final' + (tid ? `?torneoId=${tid}` : ''), { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setMsg(r?.message || 'No se pudo cargar (¿eres administrador?)'); return }
    setD(r)
  }, [])
  useEffect(() => { cargar() }, [cargar])
  async function post(b: Record<string, unknown>, pregunta: string) {
    if (!window.confirm(pregunta)) return
    setOcupado(true)
    const r = await fetch('/api/admin/fase-final', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...b, torneoId: d?.torneoId }) }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Error de conexión' }))
    setOcupado(false)
    setMsg(r.ok ? (b.accion === 'deshacer' ? `Listo: se quitaron ${r.borrados} partido(s).` : `Listo: se crearon ${r.creados} partido(s). Ponles fecha, hora y cancha en Programación.`) : r.message)
    cargar(d?.torneoId)
  }
  if (!d) return <div className="min-h-screen bg-slate-900 text-white p-8">{msg || 'Cargando…'}</div>
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">🏆 Fase Final (llaves)</h1>
        <p className="text-slate-400 mb-4">Crea los partidos de cuartos, semifinales, final y tercer puesto de cada copa según el Art. 41: <b>1.º G1 vs 2.º G3, 1.º G2 vs 2.º G4, 1.º G3 vs 2.º G1, 1.º G4 vs 2.º G2</b>. Úsala por rondas: al terminar la Fase 2 crea los cuartos; cuando haya ganadores, vuelve aquí para crear las semis, y luego la final y el 3.er puesto. Solo crea los cruces con sus dos clubes definidos. Después pon fecha, hora y cancha en Programación. En la página pública, la pestaña «Llaves» se actualiza sola.</p>
        {msg && <p className="bg-slate-800 border border-slate-600 rounded-lg p-3 mb-4 text-sm" onClick={() => setMsg('')}>{msg}</p>}
        {d.torneos.length > 1 && <select className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm mb-4" value={d.torneoId} onChange={(e) => cargar(e.target.value)}>{d.torneos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select>}
        {d.planes.map(({ copa, plan, ultimo }) => (
          <div key={copa} className={card}>
            <h2 className="text-xl font-bold mb-2">{copa === 'Copa Oro' ? '🥇' : '🥈'} {copa}</h2>
            {'error' in plan ? <p className="text-sm text-yellow-300">{plan.error}</p> : <>
              <p className="text-sm text-slate-400 mb-3">Fase: <b className="text-slate-200">{plan.faseNombre}</b>{plan.crearFase ? ' (se creará como fase eliminatoria)' : ''}</p>
              {plan.crear.length > 0 ? <>
                <p className="font-semibold text-green-300 mb-1">Simulación: se crearían {plan.crear.length} partido(s)</p>
                {plan.crear.map((c) => <p key={c.id} className="text-sm py-1 border-t border-slate-700"><b className="text-yellow-300">{c.id}</b> · {c.ronda} (Fecha {c.jornadaNum}): <b>{c.local}</b> vs <b>{c.visitante}</b></p>)}
                <button className={btn + ' bg-green-600 hover:bg-green-700 mt-3'} disabled={ocupado} onClick={() => post({ copa }, `¿Crear ${plan.crear.length} partido(s) de la ${copa}?`)}>✔ Crear estos partidos</button>
              </> : <p className="text-sm text-slate-300">No hay cruces listos para crear ahora.</p>}
              {plan.esperando.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer text-slate-400">Esperando ({plan.esperando.length})</summary>{plan.esperando.map((x) => <p key={x} className="text-slate-400 py-0.5">• {x}</p>)}</details>}
              {plan.hechos.length > 0 && <details className="mt-2 text-sm"><summary className="cursor-pointer text-slate-400">Ya creados ({plan.hechos.length})</summary>{plan.hechos.map((x) => <p key={x} className="text-slate-300 py-0.5">✔ {x}</p>)}</details>}
              {ultimo && <button className={btn + ' bg-slate-600 hover:bg-slate-500 mt-3'} disabled={ocupado} onClick={() => post({ copa, accion: 'deshacer' }, `¿Deshacer la última creación de la ${copa}? Solo se puede si esos partidos no se han jugado.`)}>↩ Deshacer la última creación</button>}
            </>}
          </div>))}
        <FichajeOro />
        <p className="text-xs text-slate-500">Empates: en cuartos y semifinales se definen directo por penales; en la final, tiempo extra y luego penales (Art. 41). El ganador sube solo a la siguiente llave.</p>
      </div>
    </div>
  )
}

interface Ped { id: string; estado: string; motivo: string | null; pedidoPor: string; fecha: string; club: string; origen: string; partidos: number; jugador: string; numero: number | null; posicion: string | null; goles: number | null }
interface DatF { cfg: { abierta: boolean; minPartidos: number; hastaFecha: number } | null; copasListas: string[]; clasificados: { teamId: string; nombre: string; copa: string }[]; eliminados: number; elegibles: number; listaElegibles: { playerId: string; nombre: string; origen: string; partidos: number }[]; pedidos: Ped[] }

function FichajeOro() {
  const [d, setD] = useState<DatF | null>(null)
  const [min, setMin] = useState(''); const [hasta, setHasta] = useState('')
  const [asig, setAsig] = useState({ teamId: '', playerId: '' })
  const cargar = useCallback(async () => {
    const r = await fetch('/api/admin/fichaje', { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (r?.ok && r.cfg) { setD(r); setMin(String(r.cfg.minPartidos)); setHasta(String(r.cfg.hastaFecha)) }
  }, [])
  useEffect(() => { cargar() }, [cargar])
  async function post(b: Record<string, unknown>, pregunta?: string) {
    if (pregunta && !window.confirm(pregunta)) return
    const r = await fetch('/api/admin/fichaje', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Error de conexión' }))
    if (!r.ok) alert(r.message); cargar()
  }
  if (!d?.cfg) return null
  const pend = d.pedidos.filter((p) => p.estado === 'pendiente')
  const conFichaje = new Set(d.pedidos.filter((p) => p.estado !== 'rechazado').map((p) => p.club))
  return (
    <div className="bg-slate-800 border-2 border-yellow-600 rounded-xl p-5 mb-5">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h2 className="text-xl font-bold">⭐ Fichaje de Oro {d.cfg.abierta ? <span className="text-sm text-green-300">· ABIERTO</span> : <span className="text-sm text-slate-400">· cerrado</span>}</h2>
        <button className={`ml-auto px-4 py-2 rounded-lg font-semibold text-sm ${d.cfg.abierta ? 'bg-slate-600 hover:bg-slate-500' : 'bg-yellow-500 hover:bg-yellow-400 text-black'}`} onClick={() => post({ accion: 'config', abierta: !d.cfg!.abierta }, d.cfg!.abierta ? '¿Cerrar el Fichaje de Oro? Los DT ya no podrán pedir.' : '¿Abrir el Fichaje de Oro? Los DT de los clubes clasificados podrán pedir su refuerzo desde su portal.')}>{d.cfg.abierta ? 'Cerrar' : 'Abrir para los DT'}</button>
      </div>
      <p className="text-sm text-slate-300">Cada club clasificado a cuartos pide desde su Portal del DT <b>un</b> jugador de un club eliminado en la Fase 2 (de cualquier copa). Tú apruebas: revisa que sea barrial o amateur (no profesional, futsal ni extranjero). Aprobado, el jugador aparece en la planilla de su club nuevo solo en la Fase Final; su historial sigue con su club de origen. Gratis y sin cambios.</p>
      <div className="flex flex-wrap gap-3 items-end mt-3 text-sm">
        <label className="text-xs">Mínimo de partidos jugados<input type="number" min={1} className="block mt-1 w-24 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg" value={min} onChange={(e) => setMin(e.target.value)} /></label>
        <label className="text-xs">Contando hasta la Fecha<input type="number" min={1} className="block mt-1 w-24 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        <button className="px-3 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg disabled:opacity-40" disabled={min === String(d.cfg.minPartidos) && hasta === String(d.cfg.hastaFecha)} onClick={() => post({ accion: 'config', minPartidos: Number(min), hastaFecha: Number(hasta) })}>Guardar</button>
        <span className="text-slate-400">{d.copasListas.length ? `${d.clasificados.length} clubes pueden fichar · ${d.elegibles} jugadores elegibles de ${d.eliminados} clubes eliminados` : 'Se calcula cuando termine la Fase 2 (los 4 grupos de cada copa).'}</span>
      </div>
      {pend.length > 0 && <p className="mt-4 font-semibold text-yellow-300">⏳ Por aprobar ({pend.length})</p>}
      {d.pedidos.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-2 py-2 border-t border-slate-700 text-sm mt-1">
          <span className={`text-xs px-2 py-0.5 rounded ${p.estado === 'aprobado' ? 'bg-green-700' : p.estado === 'rechazado' ? 'bg-red-800' : 'bg-yellow-700'}`}>{p.estado}</span>
          <span className="flex-1 min-w-[16rem]"><b>{p.club}</b> ficha a <b>{p.numero != null ? `#${p.numero} ` : ''}{p.jugador}</b> <span className="text-slate-400">({p.posicion || 'sin posición'} · viene de {p.origen} · {p.partidos} PJ{p.goles ? ` · ${p.goles} goles` : ''}{p.pedidoPor === 'admin' ? ' · asignado por la organización' : ''})</span>{p.motivo && <span className="text-red-300"> · {p.motivo}</span>}</span>
          {p.estado === 'pendiente' && <><button className="px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded-lg text-xs" onClick={() => post({ accion: 'aprobar', id: p.id }, `¿Aprobar a ${p.jugador} como Fichaje de Oro de ${p.club}? Revisaste que es barrial o amateur.`)}>✔ Aprobar</button>
            <button className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded-lg text-xs" onClick={() => { const m = window.prompt('Motivo del rechazo (lo verá el DT):'); if (m !== null) post({ accion: 'rechazar', id: p.id, motivo: m }) }}>Rechazar</button></>}
          {p.estado === 'aprobado' && <button className="px-3 py-1.5 bg-slate-700 hover:bg-red-800 rounded-lg text-xs" onClick={() => { const m = window.prompt('Motivo para anular este Fichaje de Oro (solo si hubo un error):'); if (m) post({ accion: 'anular', id: p.id, motivo: m }) }}>Anular</button>}
        </div>))}
      {d.copasListas.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-slate-400">Asignar directamente (si un DT no tiene acceso al portal)</summary>
          <div className="flex flex-wrap gap-2 mt-2">
            <select className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg" value={asig.teamId} onChange={(e) => setAsig({ ...asig, teamId: e.target.value })}><option value="">— Club que ficha —</option>{d.clasificados.filter((c) => !conFichaje.has(c.nombre)).map((c) => <option key={c.teamId} value={c.teamId}>{c.nombre} ({c.copa})</option>)}</select>
            <select className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg flex-1 min-w-[14rem]" value={asig.playerId} onChange={(e) => setAsig({ ...asig, playerId: e.target.value })}><option value="">— Jugador elegible —</option>{d.listaElegibles.map((x) => <option key={x.playerId} value={x.playerId}>{x.nombre} · {x.origen} · {x.partidos} PJ</option>)}</select>
            <button className="px-3 py-2 bg-yellow-500 text-black font-semibold rounded-lg disabled:opacity-40" disabled={!asig.teamId || !asig.playerId} onClick={() => post({ accion: 'asignar', ...asig }, '¿Asignar y aprobar este Fichaje de Oro?')}>Asignar</button>
          </div>
        </details>)}
    </div>)
}
