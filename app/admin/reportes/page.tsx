'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Eq { id: string; nombre: string; grupo: string }
const btn = 'px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm'
const btn2 = 'px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg text-sm'
const sec = 'bg-slate-800 border border-slate-700 rounded-xl p-5 mb-4'

export default function Reportes() {
  const [torneos, setTorneos] = useState<{ id: string; nombre: string }[]>([])
  const [tid, setTid] = useState('')
  const [equipos, setEquipos] = useState<Eq[]>([])
  const [club, setClub] = useState('')
  const [dinero, setDinero] = useState(true)
  const [generando, setGenerando] = useState('')
  const [vista, setVista] = useState<{ url: string; nombre: string } | null>(null)
  const [msg, setMsg] = useState('')

  async function cargar(id?: string) {
    const r = await fetch('/api/admin/multas' + (id ? `?torneoId=${id}` : ''), { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setMsg(r?.message || 'No se pudo cargar'); return }
    setTorneos(r.torneos)
    if (r.datos) { setTid(r.datos.torneo.id); setEquipos(r.datos.grupos.flatMap((g: { nombre: string; equipos: { id: string; nombre: string }[] }) => g.equipos.map((e) => ({ id: e.id, nombre: e.nombre, grupo: g.nombre })))) }
    else setMsg('Todavía no hay un torneo con partidos.')
  }
  useEffect(() => { cargar() }, [])

  async function generar(tipo: string, nombre: string, extra = '') {
    setGenerando(tipo); setMsg('')
    try {
      const r = await fetch(`/api/admin/reportes?tipo=${tipo}&torneoId=${tid}${extra}`)
      if (!r.ok || !(r.headers.get('content-type') || '').includes('pdf')) { const e = await r.json().catch(() => null); setMsg(e?.message || 'No se pudo generar el PDF'); return }
      setVista({ url: URL.createObjectURL(await r.blob()), nombre })
    } catch { setMsg('No se pudo generar el PDF') } finally { setGenerando('') }
  }
  const cerrar = () => { if (vista) URL.revokeObjectURL(vista.url); setVista(null) }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">📄 Reportes PDF</h1>
        <p className="text-slate-400 mb-5">Documentos listos para enviar a los clubes o para uso interno. Primero ves la <b>vista previa</b>; solo se descarga cuando pulses el botón.</p>
        {msg && <div className="bg-slate-700 border border-slate-500 rounded-lg p-3 mb-4 text-sm" onClick={() => setMsg('')}>{msg}</div>}
        {torneos.length > 1 && <select className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm mb-4" value={tid} onChange={(e) => cargar(e.target.value)}>{torneos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select>}

        <section className={sec}>
          <h2 className="font-bold mb-1">Para los clubes</h2>
          <p className="text-slate-400 text-sm mb-3">Una hoja por grupo con la tabla de posiciones y los resultados de cada fecha.</p>
          <div className="flex flex-wrap gap-2">
            <button className={btn} disabled={!!generando || !tid} onClick={() => generar('resultados', 'resultados-y-posiciones.pdf')}>{generando === 'resultados' ? 'Generando…' : '📊 Resultados y posiciones'}</button>
            <button className={btn2} disabled={!!generando || !tid} onClick={() => generar('sancionados', 'sancionados.pdf')}>{generando === 'sancionados' ? 'Generando…' : '🟨 Sancionados'}</button>
          </div>
        </section>

        <section className={sec}>
          <h2 className="font-bold mb-1">Informe por club (para enviarle a cada club)</h2>
          <p className="text-slate-400 text-sm mb-3">Sus partidos y resultados, su posición, sus jugadores con tarjetas y quién está suspendido.</p>
          <div className="flex flex-wrap gap-2 items-center">
            <select className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm" value={club} onChange={(e) => setClub(e.target.value)}><option value="">Elige un club…</option>{equipos.map((e) => <option key={e.id} value={e.id}>{e.nombre} ({e.grupo})</option>)}</select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dinero} onChange={(e) => setDinero(e.target.checked)} /> Incluir valores a pagar</label>
            <button className={btn} disabled={!!generando || !club} onClick={() => generar('club', `informe-${equipos.find((e) => e.id === club)?.nombre || 'club'}.pdf`, `&equipo=${club}&dinero=${dinero ? 1 : 0}`)}>{generando === 'club' ? 'Generando…' : 'Informe de este club'}</button>
            <button className={btn2} disabled={!!generando || !tid} onClick={() => generar('clubes', 'informes-todos-los-clubes.pdf', `&dinero=${dinero ? 1 : 0}`)}>{generando === 'clubes' ? 'Generando…' : '📚 Todos los clubes (una hoja por club)'}</button>
          </div>
        </section>

        <section className={sec}>
          <h2 className="font-bold mb-1">Uso interno</h2>
          <p className="text-slate-400 text-sm mb-3">Tarjetas y valores a pagar por club, con lo pagado y lo pendiente. No lo envíes a los clubes.</p>
          <button className={btn2} disabled={!!generando || !tid} onClick={() => generar('interno', 'tarjetas-y-valores-interno.pdf')}>{generando === 'interno' ? 'Generando…' : '💵 Tarjetas y valores'}</button>
        </section>
        <p className="text-slate-400 text-sm">¿Quieres la imagen del horario de una fecha para WhatsApp? Está en <Link className="underline text-yellow-300" href="/admin/programacion">🗓️ Programación → Imagen del horario</Link>.</p>
      </div>

      {vista && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col p-3">
          <div className="flex items-center gap-3 flex-wrap bg-slate-800 border border-slate-600 rounded-t-xl px-4 py-3">
            <b>Vista previa</b><span className="text-slate-400 text-sm">Revisa el documento. Solo se descarga cuando pulses el botón.</span>
            <span className="ml-auto flex gap-2">
              <a className={btn + ' inline-block'} href={vista.url} download={vista.nombre}>⬇ Descargar PDF</a>
              <a className={btn2 + ' inline-block'} href={vista.url} target="_blank" rel="noreferrer">Abrir en pestaña nueva</a>
              <button className={btn2} onClick={cerrar}>Cerrar</button>
            </span>
          </div>
          <iframe src={vista.url} title="Vista previa" className="flex-1 w-full bg-white rounded-b-xl" />
        </div>
      )}
    </div>
  )
}
