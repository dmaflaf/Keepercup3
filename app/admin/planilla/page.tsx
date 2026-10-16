'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface P { id: string; jornada: string; fecha: string | null; hora: string | null; escenario: string | null; local: string; visitante: string; estado: string; golesLocal: number | null; golesVisitante: number | null }

export default function ListaPlanilla() {
  const [partidos, setPartidos] = useState<P[]>([])
  const [msg, setMsg] = useState('Cargando…')
  const [ver, setVer] = useState<'pendientes' | 'todos'>('pendientes')

  useEffect(() => {
    fetch('/api/torneo/admin').then((r) => r.json()).then((r) => {
      if (!r.ok) { setMsg(r.message || 'No autorizado'); return }
      setPartidos(r.torneo?.partidos || []); setMsg(r.torneo ? '' : 'Todavía no hay torneo ni partidos.')
    }).catch(() => setMsg('Sin conexión'))
  }, [])

  const hoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)
  const visibles = partidos.filter((p) => ver === 'todos' || p.estado !== 'finalizado').sort((a, b) => (a.fecha === hoy ? -1 : 0) - (b.fecha === hoy ? -1 : 0) || (a.fecha || '9').localeCompare(b.fecha || '9') || (a.hora || '').localeCompare(b.hora || ''))

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">📋 Planilla de juego</h1>
        <p className="text-slate-400 mb-4">Elige el partido que vas a registrar. Funciona en iPad y celular, y guarda todo aunque se pierda la señal.</p>
        <div className="flex gap-2 mb-4">
          {(['pendientes', 'todos'] as const).map((k) => <button key={k} className={`px-4 py-2 rounded-xl text-sm ${ver === k ? 'bg-yellow-500 text-black font-semibold' : 'bg-slate-700'}`} onClick={() => setVer(k)}>{k === 'pendientes' ? 'Por jugar' : 'Todos'}</button>)}
        </div>
        {msg && <p className="text-slate-300">{msg}</p>}
        <div className="space-y-3">
          {visibles.map((p) => (
            <Link key={p.id} href={`/admin/planilla/${p.id}`} className="block bg-slate-800 border border-slate-700 rounded-2xl p-4 active:bg-slate-700">
              <p className="text-yellow-300 text-xs">{p.jornada} · {p.fecha === hoy ? 'HOY' : p.fecha || 'sin fecha'} {p.hora || ''} {p.escenario ? '· ' + p.escenario : ''}</p>
              <p className="text-lg font-bold mt-1">{p.local} <span className="text-yellow-400">{p.estado === 'finalizado' ? `${p.golesLocal}-${p.golesVisitante}` : 'vs'}</span> {p.visitante}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
