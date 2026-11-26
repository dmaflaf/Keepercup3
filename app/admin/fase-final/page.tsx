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
        <p className="text-xs text-slate-500">Empates: en cuartos y semifinales se definen directo por penales; en la final, tiempo extra y luego penales (Art. 41). El ganador sube solo a la siguiente llave.</p>
      </div>
    </div>
  )
}
