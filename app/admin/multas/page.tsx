'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

interface Multa { teamId: string; nombre: string; grupo: string; y: number; dobles: number; r: number; total: number; pagado: number; pendiente: number }
interface Sancion { playerId: string; teamId: string; jugador: string; numero: number | null; club: string; grupo: string; y: number; r: number; dobles: number; total: number; cumplidos: number; pendientes: number[]; fuera: number; acum: number; motivo: string; estado: string }
interface Pago { id: string; teamId: string; club: string; monto: number; nota: string | null; usuario: string; anulado: boolean; createdAt: string }
interface Datos { torneo: { id: string; nombre: string; precioAmarilla: number; precioRoja: number; amarillasSuspension: number }; grupos: { id: string; nombre: string }[]; multas: Multa[]; sanciones: Sancion[]; pagos: Pago[]; jornadasJugadas: number }

const inp = 'px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm'
const btn = 'px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm'
const btn2 = 'px-3 py-1.5 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg text-xs'
const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2)

export default function Multas() {
  const [torneos, setTorneos] = useState<{ id: string; nombre: string }[]>([])
  const [tid, setTid] = useState('')
  const [d, setD] = useState<Datos | null>(null)
  const [rol, setRol] = useState('')
  const [tab, setTab] = useState<'multas' | 'sanciones' | 'pagos'>('sanciones')
  const [msg, setMsg] = useState('Cargando…')
  const [club, setClub] = useState('')
  const [soloSusp, setSoloSusp] = useState(false)
  const [pagar, setPagar] = useState<Multa | null>(null)
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')

  const cargar = useCallback(async (id?: string) => {
    const r = await fetch('/api/admin/multas' + (id ? `?torneoId=${id}` : ''), { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setMsg(r?.message || 'No se pudo cargar'); return }
    setTorneos(r.torneos); setRol(r.rol); setD(r.datos); setMsg(r.datos ? '' : 'Todavía no hay un torneo.')
    if (r.datos) setTid(r.datos.torneo.id)
    if (r.rol === 'admin') setTab((t) => (t === 'sanciones' ? 'multas' : t))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const esAdmin = rol === 'admin'
  const post = (b: Record<string, unknown>) => fetch('/api/admin/multas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Error de conexión' }))
  const totales = useMemo(() => (d?.multas || []).reduce((a, m) => ({ y: a.y + m.y, r: a.r + m.r, dobles: a.dobles + m.dobles, total: a.total + m.total, pagado: a.pagado + m.pagado, pendiente: a.pendiente + m.pendiente }), { y: 0, r: 0, dobles: 0, total: 0, pagado: 0, pendiente: 0 }), [d])
  const clubes = useMemo(() => Array.from(new Set((d?.sanciones || []).map((s) => s.club))).sort(), [d])
  const sanc = (d?.sanciones || []).filter((s) => (!club || s.club === club) && (!soloSusp || s.estado === 'SUSPENDIDO')).sort((a, b) => (b.estado === 'SUSPENDIDO' ? 1 : 0) - (a.estado === 'SUSPENDIDO' ? 1 : 0) || b.total - a.total || b.r - a.r || b.y - a.y || a.club.localeCompare(b.club))

  async function registrarPago() {
    if (!pagar || !d) return
    const r = await post({ accion: 'pago', torneoId: d.torneo.id, teamId: pagar.teamId, monto, nota })
    if (!r.ok) { alert(r.message); return }
    setPagar(null); setMonto(''); setNota(''); cargar(tid)
  }
  async function cambiarPrecios() {
    if (!d) return
    const a = prompt('Precio de cada amarilla (USD):', String(d.torneo.precioAmarilla)); if (a === null) return
    const r = prompt('Precio de cada roja directa (USD):', String(d.torneo.precioRoja)); if (r === null) return
    const x = await post({ accion: 'precios', torneoId: d.torneo.id, amarilla: a.replace(',', '.'), roja: r.replace(',', '.') })
    if (!x.ok) alert(x.message); cargar(tid)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">🟨🟥 Tarjetas, sanciones y multas</h1>
        <p className="text-slate-400 mb-4">Quién está suspendido y en qué fechas, y cuánto debe cada club por sus tarjetas. Reglas: {d ? `${d.torneo.amarillasSuspension} amarillas acumuladas = 1 partido · 2 amarillas en un partido = 1 partido · roja directa = 2 partidos` : '…'}.</p>
        {msg && <p className="text-slate-300 mb-4">{msg}</p>}
        {torneos.length > 1 && <select className={inp + ' mb-4'} value={tid} onChange={(e) => cargar(e.target.value)}>{torneos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select>}
        {d && (<>
          <div className="flex gap-2 flex-wrap mb-4">
            {esAdmin && <button className={`px-4 py-2 rounded-lg text-sm ${tab === 'multas' ? 'bg-yellow-500 text-black font-semibold' : 'bg-slate-700'}`} onClick={() => setTab('multas')}>💵 Multas por club</button>}
            <button className={`px-4 py-2 rounded-lg text-sm ${tab === 'sanciones' ? 'bg-yellow-500 text-black font-semibold' : 'bg-slate-700'}`} onClick={() => setTab('sanciones')}>🚫 Sancionados</button>
            {esAdmin && <a className="px-4 py-2 rounded-lg text-sm bg-slate-700" href="/admin/reportes">📄 Reportes PDF</a>}
            {esAdmin && <button className={`px-4 py-2 rounded-lg text-sm ${tab === 'pagos' ? 'bg-yellow-500 text-black font-semibold' : 'bg-slate-700'}`} onClick={() => setTab('pagos')}>🧾 Pagos</button>}
          </div>

          {tab === 'multas' && esAdmin && (
            <div>
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4 text-sm flex flex-wrap gap-x-6 gap-y-1 items-center">
                <span>🟨 {totales.y} amarillas ({totales.dobles} dobles) · 🟥 {totales.r} rojas</span>
                <span>Total a pagar <b>{usd(totales.total)}</b></span><span>Pagado <b className="text-green-300">{usd(totales.pagado)}</b></span><span>Pendiente <b className="text-red-300">{usd(totales.pendiente)}</b></span>
                <button className={btn2 + ' ml-auto'} onClick={cambiarPrecios}>Precios: 🟨 {usd(d.torneo.precioAmarilla)} · 🟥 {usd(d.torneo.precioRoja)} ✏️</button>
              </div>
              {d.grupos.map((g) => (
                <div key={g.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
                  <h2 className="font-bold mb-2">{g.nombre}</h2>
                  <table className="w-full text-sm"><thead className="text-left text-slate-400"><tr><th className="py-1">Club</th><th className="text-center">🟨</th><th className="text-center">Dobles</th><th className="text-center">🟥</th><th className="text-right">Total</th><th className="text-right">Pagado</th><th className="text-right">Pendiente</th><th></th></tr></thead>
                    <tbody>{d.multas.filter((m) => m.grupo === g.nombre).sort((a, b) => b.pendiente - a.pendiente || a.nombre.localeCompare(b.nombre)).map((m) => (
                      <tr key={m.teamId} className="border-t border-slate-700"><td className="py-2">{m.nombre}</td><td className="text-center">{m.y}</td><td className="text-center">{m.dobles}</td><td className="text-center">{m.r}</td><td className="text-right">{usd(m.total)}</td><td className="text-right text-green-300">{usd(m.pagado)}</td><td className={`text-right font-bold ${m.pendiente > 0 ? 'text-red-300' : 'text-green-300'}`}>{usd(m.pendiente)}</td>
                        <td className="text-right"><button className={btn2} onClick={() => { setPagar(m); setMonto(m.pendiente > 0 ? m.pendiente.toFixed(2) : ''); setNota('') }}>💵 Pago</button></td></tr>))}</tbody></table>
                </div>
              ))}
            </div>
          )}

          {tab === 'sanciones' && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="flex gap-3 flex-wrap items-center mb-3 text-sm">
                <select className={inp} value={club} onChange={(e) => setClub(e.target.value)}><option value="">Todos los clubes</option>{clubes.map((c) => <option key={c}>{c}</option>)}</select>
                <label className="flex items-center gap-2"><input type="checkbox" checked={soloSusp} onChange={(e) => setSoloSusp(e.target.checked)} /> Solo suspendidos</label>
                <span className="text-slate-400">{sanc.length} jugadores</span>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-400"><tr><th className="py-1">Jugador</th><th>Club</th><th className="text-center">🟨</th><th className="text-center">🟥</th><th>Motivo</th><th>Estado</th></tr></thead>
                <tbody>{sanc.map((s) => (
                  <tr key={s.playerId} className="border-t border-slate-700"><td className="py-2"><b>{s.numero ?? '–'}</b> {s.jugador}</td><td>{s.club}</td><td className="text-center">{s.y}</td><td className="text-center">{s.r}</td><td className="text-slate-300">{s.motivo}</td>
                    <td>{s.estado === 'SUSPENDIDO' ? <span className="px-2 py-0.5 rounded bg-red-700 text-xs font-bold">SUSPENDIDO {s.pendientes.map((f) => `F${f}`).join(', ')}{s.fuera ? ` +${s.fuera} sig. etapa` : ''}</span> : s.estado === 'Cumplida' ? <span className="text-green-300">Cumplida</span> : s.estado === 'Acumula' ? <span className="text-yellow-300">Acumula {s.acum}/{d.torneo.amarillasSuspension}</span> : '—'}</td></tr>))}</tbody></table></div>
            </div>
          )}

          {tab === 'pagos' && esAdmin && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              {!d.pagos.length && <p className="text-slate-400 text-sm">Todavía no hay pagos registrados.</p>}
              {d.pagos.map((p) => (
                <div key={p.id} className={`flex items-center gap-3 flex-wrap border-t border-slate-700 py-2 text-sm ${p.anulado ? 'opacity-50 line-through' : ''}`}>
                  <b className="w-20">{usd(p.monto)}</b><span className="flex-1 min-w-[10rem]">{p.club}{p.nota && <span className="text-slate-400"> · {p.nota}</span>}</span>
                  <span className="text-slate-400 text-xs">{new Date(p.createdAt).toLocaleDateString('es-EC')} · {p.usuario}</span>
                  <button className={btn2} onClick={async () => { await post({ accion: 'anular', id: p.id, anulado: !p.anulado }); cargar(tid) }}>{p.anulado ? 'Restaurar' : 'Anular'}</button>
                </div>))}
            </div>
          )}
        </>)}

        {pagar && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-auto" onClick={() => setPagar(null)}>
            <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 w-full max-w-md mt-10" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-bold mb-1">💵 Pago · {pagar.nombre}</h2>
              <p className="text-sm text-slate-300 mb-3">🟨 {pagar.y} + 🟥 {pagar.r} = {usd(pagar.total)} · Pagado {usd(pagar.pagado)} · <b className={pagar.pendiente > 0 ? 'text-red-300' : 'text-green-300'}>Pendiente {usd(pagar.pendiente)}</b></p>
              <label className="block text-sm mb-3">Monto (USD)<input className={inp + ' w-full mt-1'} inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} /></label>
              <label className="block text-sm mb-4">Nota (opcional)<input className={inp + ' w-full mt-1'} placeholder="quién pagó, recibo…" value={nota} onChange={(e) => setNota(e.target.value)} /></label>
              <div className="flex gap-2"><button className={btn} onClick={registrarPago}>Registrar pago</button><button className={btn2 + ' !py-2'} onClick={() => setPagar(null)}>Cancelar</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
