'use client'

import { useEffect, useState } from 'react'

interface Impacto { goles: number; tarjetas: number; alineaciones: number; partidos: number; marcadoresAfectados: number }

/** Ventana para eliminar a un jugador: muestra sus registros en partidos y pide motivo y contraseña del administrador. */
export default function EliminarJugador({ id, nombre, club, onCerrar, onEliminado }: { id: string; nombre: string; club: string; onCerrar: () => void; onEliminado: (nombre: string) => void }) {
  const [impacto, setImpacto] = useState<Impacto | null>(null)
  const [motivo, setMotivo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    fetch(`/api/admin/jugadores/${id}?resumen=1`, { method: 'DELETE' }).then((x) => x.json()).then((r) => (r.ok ? setImpacto(r.impacto) : setError(r.message || 'No se pudo revisar'))).catch(() => setError('Error de conexión'))
  }, [id])
  async function confirmar() {
    setOcupado(true); setError('')
    const r = await fetch(`/api/admin/jugadores/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: clave, motivo }) }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Error de conexión' }))
    setOcupado(false)
    if (!r.ok) { setError(r.message || 'No se pudo eliminar'); return }
    onEliminado(r.nombre)
  }
  const inp = 'w-full mt-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white'
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-slate-800 border border-slate-600 rounded-xl p-5 w-full max-w-md mt-16 text-white" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-1">🗑 Eliminar a {nombre}</h2>
        <p className="text-sm text-slate-300 mb-3">{club ? `De ${club}. ` : ''}Se borran sus fotos y su carnet deja de funcionar. No se puede deshacer.</p>
        {!impacto && !error && <p className="text-sm text-slate-400 mb-3">Revisando sus registros…</p>}
        {impacto && (impacto.partidos > 0 ? (
          <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-3 text-sm mb-3">
            Tiene registros en <b>{impacto.partidos}</b> partido(s): {impacto.alineaciones} alineación(es), {impacto.goles} gol(es) y {impacto.tarjetas} tarjeta(s). <b>Se borrarán</b> y dejarán de contar en goleadores, sanciones y multas.
            {impacto.marcadoresAfectados > 0 && <span className="block mt-1 text-red-300">⚠ En {impacto.marcadoresAfectados} partido(s) el marcador sale de los goles y bajará.</span>}
          </div>) : <p className="text-sm text-green-300 mb-3">No tiene registros en partidos.</p>)}
        <label className="block text-sm mb-3">Motivo
          <input className={inp} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ej. jugador duplicado, se retiró del club" /></label>
        <label className="block text-sm mb-3">Tu contraseña de administrador
          <input type="password" autoComplete="current-password" className={inp} value={clave} onChange={(e) => setClave(e.target.value)} /></label>
        {error && <p className="text-sm text-red-300 mb-2">{error}</p>}
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg font-semibold text-sm" disabled={ocupado || !impacto || !motivo.trim() || !clave} onClick={confirmar}>{ocupado ? 'Eliminando…' : 'Eliminar definitivamente'}</button>
          <button className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm" onClick={onCerrar}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
