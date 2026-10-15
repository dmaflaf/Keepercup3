'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface J { id: string; nombre: string; numero: number | null; estado: string; tieneQr: boolean; selfie: boolean; cedulas: boolean }
interface Aus { slot: number; imagen: string }

const inp = 'px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm'
const btn = 'px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm'
const btn2 = 'px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg text-sm'
const sec = 'bg-slate-800 border border-slate-700 rounded-xl p-5 mb-5'

export default function Carnets() {
  const [equipos, setEquipos] = useState<string[]>([])
  const [club, setClub] = useState('')
  const [jug, setJug] = useState<J[]>([])
  const [escudo, setEscudo] = useState<string | null>(null)
  const [aus, setAus] = useState<Aus[]>([])
  const [sel, setSel] = useState<string[]>([])
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async (nombre: string) => {
    const r = await fetch('/api/admin/carnets/club' + (nombre ? '?equipo=' + encodeURIComponent(nombre) : '')).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setMsg(r?.message || 'No se pudo cargar (¿eres administrador?)'); return }
    setEquipos(r.equipos); setAus(r.auspicios || [])
    if (nombre) { setJug(r.jugadores || []); setEscudo(r.escudo || null) }
  }, [])
  useEffect(() => { cargar('') }, [cargar])
  useEffect(() => { setSel([]); if (club) cargar(club); else { setJug([]); setEscudo(null) } }, [club, cargar])

  const completos = jug.filter((j) => j.selfie && j.cedulas && j.estado !== 'habilitado' && j.estado !== 'suspendido')
  const habilitados = jug.filter((j) => j.estado === 'habilitado')

  async function habilitar(ids: string[], estado: 'habilitado' | 'pendiente') {
    if (!ids.length) return
    setOcupado(true)
    const r = await fetch('/api/admin/carnets/habilitar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, estado }) }).then((x) => x.json())
    setOcupado(false)
    setMsg(r.ok ? `${r.actualizados} jugador(es) ${estado === 'habilitado' ? 'habilitados' : 'devueltos a pendiente'}.` : r.message)
    cargar(club)
  }

  async function subir(url: string, campos: Record<string, string>, archivo: File) {
    setOcupado(true)
    const fd = new FormData()
    Object.entries(campos).forEach(([k, v]) => fd.append(k, v))
    fd.append('file', archivo)
    const r = await fetch(url, { method: 'POST', body: fd }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Error de conexión' }))
    setOcupado(false)
    setMsg(r.ok ? 'Imagen guardada.' : r.message)
    cargar(club)
  }

  const pdf = (ids: string[], todos = false) => window.open(`/api/admin/carnets/pdf?equipo=${encodeURIComponent(club)}${ids.length ? '&ids=' + ids.join(',') : ''}${todos ? '&todos=1' : ''}`, '_blank')
  const badge = (e: string) => (e === 'habilitado' ? 'text-green-400' : e === 'suspendido' ? 'text-red-400' : 'text-yellow-300')

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Volver al panel</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">🪪 Carnets</h1>
        <p className="text-slate-400 mb-5">Genera los carnets de un club en PDF (hoja A4, 9 por hoja, con QR). Solo se imprimen los jugadores <b>habilitados</b>.</p>
        {msg && <div className="bg-slate-700 border border-slate-500 rounded-lg p-3 mb-4 text-sm" onClick={() => setMsg('')}>{msg}</div>}

        <section className={sec}>
          <h2 className="font-bold mb-3">Auspiciantes (se repiten en todos los carnets, hasta 4)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((slot) => {
              const a = aus.find((x) => x.slot === slot)
              return (
                <div key={slot} className="bg-slate-900/60 rounded-lg p-3 text-center text-sm">
                  <div className="h-16 flex items-center justify-center bg-white/90 rounded mb-2">{a ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={a.imagen} alt="" className="max-h-14 max-w-full" /> : <span className="text-slate-500">Auspicio {slot}</span>}</div>
                  <label className="cursor-pointer underline text-yellow-300">{a ? 'Cambiar' : 'Subir logo'}<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && subir('/api/admin/carnets/auspicios', { slot: String(slot) }, e.target.files[0])} /></label>
                  {a && <button className="ml-3 text-red-400" onClick={async () => { await fetch('/api/admin/carnets/auspicios?slot=' + slot, { method: 'DELETE' }); cargar(club) }}>Quitar</button>}
                </div>
              )
            })}
          </div>
        </section>

        <section className={sec}>
          <h2 className="font-bold mb-3">Club</h2>
          <select className={inp} value={club} onChange={(e) => setClub(e.target.value)}>
            <option value="">— Elige el club —</option>{equipos.map((e) => <option key={e}>{e}</option>)}
          </select>
        </section>

        {club && (
          <>
            <section className={sec}>
              <h2 className="font-bold mb-3">Escudo de {club}</h2>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-white/90 rounded flex items-center justify-center">{escudo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={escudo} alt="" className="max-h-[72px] max-w-[72px]" /> : <span className="text-slate-500 text-xs text-center">Sin escudo<br />(sale con iniciales)</span>}</div>
                <label className={btn2 + ' cursor-pointer'}>{escudo ? 'Cambiar escudo' : 'Subir escudo'}<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && subir('/api/admin/carnets/escudo', { equipo: club }, e.target.files[0])} /></label>
                {escudo && <button className="text-red-400 text-sm" onClick={async () => { await fetch('/api/admin/carnets/escudo?equipo=' + encodeURIComponent(club), { method: 'DELETE' }); cargar(club) }}>Quitar</button>}
              </div>
            </section>

            <section className={sec}>
              <h2 className="font-bold mb-2">Jugadores ({jug.length}) · habilitados: {habilitados.length}</h2>
              <div className="flex flex-wrap gap-2 mb-3">
                <button className={btn2} disabled={ocupado || !completos.length} onClick={() => habilitar(completos.map((j) => j.id), 'habilitado')}>Habilitar a los que tienen foto y cédulas ({completos.length})</button>
                <button className={btn2} disabled={ocupado || !sel.length} onClick={() => habilitar(sel, 'habilitado')}>Habilitar seleccionados</button>
                <button className={btn2} disabled={ocupado || !sel.length} onClick={() => habilitar(sel, 'pendiente')}>Pasar a pendiente</button>
                <button className={btn} disabled={!habilitados.length} onClick={() => pdf([])}>Descargar PDF de habilitados ({habilitados.length})</button>
                <button className={btn2} disabled={!sel.length} onClick={() => pdf(sel, true)}>PDF de seleccionados</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-400"><tr><th className="py-2"><input type="checkbox" checked={sel.length === jug.length && jug.length > 0} onChange={(e) => setSel(e.target.checked ? jug.map((j) => j.id) : [])} /></th><th>N.º</th><th>Jugador</th><th className="text-center">Foto</th><th className="text-center">Cédulas</th><th>Estado</th></tr></thead>
                  <tbody>{jug.map((j) => (
                    <tr key={j.id} className="border-t border-slate-700">
                      <td className="py-2"><input type="checkbox" checked={sel.includes(j.id)} onChange={(e) => setSel(e.target.checked ? [...sel, j.id] : sel.filter((x) => x !== j.id))} /></td>
                      <td>{j.numero ?? '–'}</td><td>{j.nombre}</td>
                      <td className="text-center">{j.selfie ? <span className="text-green-400">✔</span> : <span className="text-red-400">✖</span>}</td>
                      <td className="text-center">{j.cedulas ? <span className="text-green-400">✔</span> : <span className="text-red-400">✖</span>}</td>
                      <td className={badge(j.estado)}>{j.estado}</td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
              <p className="text-slate-400 text-xs mt-3">Impresión a doble cara: cada hoja de frentes va seguida de su hoja de dorsos (columnas ya espejadas). En la impresora elige &quot;voltear por el lado largo&quot; y tamaño real (100%).</p>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
