'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface Caso { partidoId: string; jornada: number; fechaNombre: string; fecha: string | null; club: string; jugador: string; numero: number | null; motivo: string; partido: string; mesa: boolean; aparece: string[] }
interface Datos { torneos: { id: string; nombre: string }[]; torneoId: string; casos: Caso[] }

export default function AlineacionesIndebidas() {
  const [d, setD] = useState<Datos | null>(null)
  const [msg, setMsg] = useState('')
  const cargar = useCallback(async (tid?: string) => {
    const r = await fetch('/api/admin/alineaciones-indebidas' + (tid ? `?torneoId=${tid}` : ''), { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setMsg(r?.message || 'No se pudo cargar (¿eres administrador?)'); return }
    setD(r)
  }, [])
  useEffect(() => { cargar() }, [cargar])
  if (!d) return <div className="min-h-screen bg-slate-900 text-white p-8">{msg || 'Revisando todos los partidos…'}</div>
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">🚫 Alineaciones indebidas</h1>
        <p className="text-slate-400 mb-4">Jugadores que aparecen en la planilla (alineación, cambio, gol o tarjeta) de un partido en el que debían cumplir sanción. Ese partido <b>no cuenta</b> como fecha cumplida: la suspensión se corre a la siguiente. Esta página solo informa; no cambia nada. La sanción al club la decides tú según el reglamento (por ejemplo, fallo de mesa desde la planilla del partido).</p>
        {d.torneos.length > 1 && <select className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm mb-4" value={d.torneoId} onChange={(e) => cargar(e.target.value)}>{d.torneos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select>}
        {!d.casos.length
          ? <div className="bg-green-900/30 border border-green-700 rounded-xl p-5 text-green-200 text-lg">✔ No hay ningún caso: ningún jugador sancionado aparece en un partido que debía cumplir.</div>
          : <div className="bg-red-900/30 border border-red-600 rounded-xl p-4 mb-4"><b className="text-lg">{d.casos.length} caso(s) encontrados</b> en {new Set(d.casos.map((c) => c.club)).size} club(es).</div>}
        {d.casos.map((c, i) => (
          <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-3">
            <div className="flex flex-wrap gap-2 items-start">
              <div className="flex-1 min-w-[16rem]">
                <p className="text-xs text-slate-400">{c.fechaNombre}{c.fecha ? ` · ${c.fecha}` : ''}{c.mesa ? ' · ya resuelto con fallo de mesa' : ''}</p>
                <p className="font-bold text-lg">{c.numero != null ? `#${c.numero} ` : ''}{c.jugador} <span className="text-slate-400 font-normal">· {c.club}</span></p>
                <p className="text-sm">Partido: <b>{c.partido}</b></p>
                <p className="text-sm text-red-300">Aparece en la planilla: {c.aparece.join(', ') || '—'}</p>
                <p className="text-xs text-slate-400 mt-1">Su sanción: {c.motivo}</p>
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <Link className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded-lg text-center" href={`/admin/planilla/${c.partidoId}`}>Abrir planilla</Link>
                <a className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-center" href={`/torneo/partido/${c.partidoId}`} target="_blank" rel="noopener">Ver partido ↗</a>
              </div>
            </div>
          </div>))}
      </div>
    </div>
  )
}
