'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

interface Ev { id: string; tipo: string; minuto: number | null; teamId: string; jugador: string | null; numero: number | null }
interface Part { id: string; local: string; visitante: string; localId: string; visitanteId: string; golesLocal: number | null; golesVisitante: number | null; estado: string; jornada: string; fecha: string | null; hora: string | null; escenario: string | null; marcadorManual: boolean; eventos: Ev[] }
interface Jug { id: string; nombre: string; numero: number | null; teamId: string; suspendido: number }

const TIPO: Record<string, string> = { gol: '⚽ Gol', gol_penal: '⚽ Gol de penal', autogol: '⚽ Autogol', amarilla: '🟨 Amarilla', doble_amarilla: '🟨🟨 Doble amarilla', roja: '🟥 Roja directa' }
const btn = 'px-2 py-1.5 rounded-lg text-sm bg-slate-700 hover:bg-slate-600 border border-slate-600 disabled:opacity-40'

export default function PlanillaPartido() {
  const { id } = useParams<{ id: string }>()
  const [p, setP] = useState<Part | null>(null)
  const [jug, setJug] = useState<Jug[]>([])
  const [rol, setRol] = useState('')
  const [msg, setMsg] = useState('')
  const [minuto, setMinuto] = useState('')
  const [man, setMan] = useState({ l: '', v: '' })

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/torneo/admin?partidoId=${id}`).then((x) => x.json()).catch(() => null)
    if (!r?.ok || !r.planilla) { setMsg(r?.message || 'No se encontró el partido'); return }
    setRol(r.rol); setP(r.planilla.partido); setJug(r.planilla.jugadores)
  }, [id])
  useEffect(() => { cargar() }, [cargar])

  const act = async (accion: string, datos: Record<string, unknown>) => {
    const r = await fetch('/api/torneo/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion, ...datos }) }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Error de conexión' }))
    setMsg(r.ok ? '' : r.message || 'Error')
    await cargar()
    return r
  }
  const evento = (teamId: string, playerId: string, tipo: string, forzar = false) => act('evento_agregar', { partidoId: id, teamId, playerId, tipo, minuto: minuto === '' ? null : Number(minuto), forzar })

  if (!p) return <div className="min-h-screen bg-slate-900 text-white p-8">{msg || 'Cargando...'} <Link className="underline" href="/admin/torneo">Volver</Link></div>
  const esAdmin = rol === 'admin'
  const finalizado = p.estado === 'finalizado'

  const Columna = ({ teamId, nombre }: { teamId: string; nombre: string }) => (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <h2 className="font-bold text-lg mb-2">{nombre}</h2>
      {jug.filter((j) => j.teamId === teamId).map((j) => (
        <div key={j.id} className={`py-2 border-t border-slate-700 ${j.suspendido ? 'bg-red-900/20' : ''}`}>
          <div className="flex justify-between text-sm"><span><b>{j.numero ?? '–'}</b> {j.nombre}</span>{j.suspendido > 0 && <span className="text-red-300">SUSPENDIDO</span>}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {(['gol', 'gol_penal', 'autogol', 'amarilla', 'doble_amarilla', 'roja'] as const).map((t) => (
              <button key={t} className={btn} disabled={!!j.suspendido && !esAdmin} title={TIPO[t]} onClick={async () => {
                const r = await evento(teamId, j.id, t)
                if (r.suspendido && esAdmin && confirm('Este jugador está suspendido. ¿Registrar de todas formas?')) await evento(teamId, j.id, t, true)
              }}>{TIPO[t].split(' ')[0]}{t === 'gol_penal' ? 'P' : t === 'autogol' ? 'AG' : ''}</button>
            ))}
          </div>
        </div>
      ))}
      {!jug.some((j) => j.teamId === teamId) && <p className="text-slate-400 text-sm">Este club todavía no tiene jugadores cargados.</p>}
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link href="/admin/torneo" className="text-slate-400 text-sm hover:text-white">← Volver al torneo</Link>
        <p className="text-yellow-300 mt-3 text-sm">{p.jornada} · {p.fecha || 'sin fecha'} {p.hora || ''} {p.escenario ? '· ' + p.escenario : ''}</p>
        <div className="flex items-center justify-center gap-4 my-4 text-center">
          <span className="text-xl md:text-2xl font-bold flex-1 text-right">{p.local}</span>
          <span className="text-4xl md:text-5xl font-black text-yellow-400 px-4">{p.golesLocal ?? 0} - {p.golesVisitante ?? 0}</span>
          <span className="text-xl md:text-2xl font-bold flex-1 text-left">{p.visitante}</span>
        </div>
        <p className="text-center text-sm mb-3">Estado: <b className={finalizado ? 'text-green-400' : p.estado === 'suspendido' ? 'text-orange-300' : 'text-slate-300'}>{p.estado}</b>{p.marcadorManual && ' · marcador manual'}</p>
        {msg && <div className="bg-red-900/40 border border-red-500 rounded-lg p-3 mb-3 text-sm" onClick={() => setMsg('')}>{msg}</div>}

        <div className="flex flex-wrap gap-2 items-center justify-center mb-4">
          <label className="text-sm">Minuto <input type="number" min={0} max={130} className="w-20 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg ml-1" value={minuto} onChange={(e) => setMinuto(e.target.value)} /></label>
          {!finalizado ? <button className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold" onClick={() => confirm('¿Finalizar el partido con este marcador?') && act('estado_partido', { partidoId: id, estado: 'finalizado' })}>Finalizar partido</button>
            : <button className={btn} onClick={() => act('estado_partido', { partidoId: id, estado: 'programado' })}>Reabrir</button>}
          {!finalizado && p.estado !== 'suspendido' && <button className={btn} onClick={() => act('estado_partido', { partidoId: id, estado: 'suspendido' })}>Marcar suspendido</button>}
        </div>
        <p className="text-center text-slate-400 text-xs mb-4">⚽ gol · ⚽P gol de penal · ⚽AG autogol · 🟨 amarilla · 🟨🟨 doble amarilla · 🟥 roja directa. Toca el botón junto al jugador; se anota con el minuto escrito arriba.</p>

        <div className="grid md:grid-cols-2 gap-4">
          <Columna teamId={p.localId} nombre={p.local} />
          <Columna teamId={p.visitanteId} nombre={p.visitante} />
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mt-4">
          <h2 className="font-bold mb-2">Eventos del partido</h2>
          {p.eventos.length === 0 && <p className="text-slate-400 text-sm">Sin eventos todavía.</p>}
          {p.eventos.map((e) => (
            <div key={e.id} className="flex justify-between text-sm py-1.5 border-t border-slate-700">
              <span>{e.minuto !== null ? `${e.minuto}' ` : ''}{TIPO[e.tipo]} · <b>{e.numero ?? ''}</b> {e.jugador} <span className="text-slate-400">({e.teamId === p.localId ? p.local : p.visitante})</span></span>
              <button className="text-red-400" onClick={() => confirm('¿Borrar este evento?') && act('evento_borrar', { id: e.id })}>Borrar</button>
            </div>
          ))}
        </div>

        {esAdmin && (
          <details className="bg-slate-800 border border-slate-700 rounded-xl p-4 mt-4 text-sm">
            <summary className="cursor-pointer font-semibold">Marcador manual (cuando no hay detalle de goles)</summary>
            <div className="flex gap-2 mt-3 items-center">
              <input type="number" min={0} className="w-20 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg" placeholder="Local" value={man.l} onChange={(e) => setMan({ ...man, l: e.target.value })} /> -
              <input type="number" min={0} className="w-20 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg" placeholder="Visita" value={man.v} onChange={(e) => setMan({ ...man, v: e.target.value })} />
              <button className={btn} onClick={() => act('marcador_manual', { partidoId: id, golesLocal: man.l, golesVisitante: man.v })}>Guardar marcador</button>
            </div>
            <p className="text-slate-400 mt-2">Con marcador manual, los goles que registres ya no cambian el resultado. Úsalo para partidos jugados sin detalle.</p>
          </details>
        )}
      </div>
    </div>
  )
}
