'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

interface Boleto {
  id: string; fecha: string; color: string; numero: number; nombres: string; correo: string; telefono: string | null
  club: string | null; codigo: string; semana: string | null
  premio: { nombre: string; categoria: string; estado: string } | null
}

const inp = 'px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white'
const pad = (n: number) => String(n).padStart(4, '0')

export default function ParticipantesPage() {
  const [lista, setLista] = useState<Boleto[]>([])
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState('')
  const [club, setClub] = useState('')
  const [color, setColor] = useState('')
  const [semana, setSemana] = useState('')
  const [soloGanadores, setSoloGanadores] = useState(false)

  useEffect(() => {
    fetch('/api/admin/sorteo/boletos').then((r) => r.json()).then((d) => {
      if (!d.ok) setError(d.message || 'No se pudo cargar (¿eres administrador?)')
      else setLista(d.boletos)
    }).catch(() => setError('Error de conexión')).finally(() => setCargando(false))
  }, [])

  const clubes = useMemo(() => Array.from(new Set(lista.map((b) => b.club || '(sin club)'))).sort(), [lista])
  const semanas = useMemo(() => Array.from(new Set(lista.map((b) => b.semana || ''))).filter(Boolean).sort().reverse(), [lista])
  const visibles = lista.filter((b) => {
    if (club && (b.club || '(sin club)') !== club) return false
    if (color && b.color !== color) return false
    if (semana && b.semana !== semana) return false
    if (soloGanadores && !b.premio) return false
    const t = q.trim().toLowerCase()
    return !t || b.nombres.toLowerCase().includes(t) || b.correo.toLowerCase().includes(t) || (b.telefono || '').includes(t) || String(b.numero).padStart(4, '0').includes(t) || b.codigo.toLowerCase().includes(t)
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <Link href="/admin/sorteo" className="text-slate-400 text-sm hover:text-white">← Volver a Sorteo</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">Participantes del sorteo</h1>
        <p className="text-slate-400 mb-4">
          {visibles.length} de {lista.length} boletos · Ganadores: {lista.filter((b) => b.premio).length} ·{' '}
          <a className="underline" href="/api/admin/sorteo/export">Descargar todo (Excel/CSV)</a>
        </p>
        {error && <p className="text-red-400 mb-4">{error}</p>}
        <div className="flex flex-wrap gap-3 mb-4">
          <input className={inp} placeholder="Buscar nombre, teléfono, número, código" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={inp} value={club} onChange={(e) => setClub(e.target.value)}><option value="">Todos los clubes</option>{clubes.map((c) => <option key={c}>{c}</option>)}</select>
          <select className={inp} value={color} onChange={(e) => setColor(e.target.value)}><option value="">Todos los colores</option><option value="negro">Negro</option><option value="rojo">Rojo</option></select>
          <select className={inp} value={semana} onChange={(e) => setSemana(e.target.value)}><option value="">Todas las semanas</option>{semanas.map((s) => <option key={s} value={s}>Semana del {s}</option>)}</select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={soloGanadores} onChange={(e) => setSoloGanadores(e.target.checked)} /> Solo ganadores</label>
        </div>
        {cargando ? <p>Cargando...</p> : (
          <div className="overflow-x-auto bg-slate-800 border border-slate-700 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-400 border-b border-slate-700">
                <tr><th className="p-3">Fecha</th><th className="p-3">Boleto</th><th className="p-3">Nombre</th><th className="p-3">Club</th><th className="p-3">Teléfono</th><th className="p-3">Correo</th><th className="p-3">Código</th><th className="p-3">Premio</th></tr>
              </thead>
              <tbody>
                {visibles.map((b) => (
                  <tr key={b.id} className={`border-b border-slate-700/50 ${b.premio ? 'bg-yellow-500/10' : ''}`}>
                    <td className="p-3 whitespace-nowrap">{new Date(b.fecha).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="p-3 whitespace-nowrap font-semibold">{b.color === 'rojo' ? '🔴' : '⚫'} {pad(b.numero)}</td>
                    <td className="p-3">{b.nombres}</td>
                    <td className="p-3">{b.club || '—'}</td>
                    <td className="p-3 whitespace-nowrap">{b.telefono || '—'}</td>
                    <td className="p-3">{b.correo}</td>
                    <td className="p-3 whitespace-nowrap text-slate-400">{b.codigo}</td>
                    <td className="p-3">{b.premio ? <span className={b.premio.estado === 'entregado' ? 'text-green-400' : 'text-yellow-300'}>🏆 {b.premio.nombre} · {b.premio.estado === 'entregado' ? 'entregado' : 'sin cobrar'}</span> : '—'}</td>
                  </tr>
                ))}
                {!visibles.length && <tr><td colSpan={8} className="p-6 text-center text-slate-500">Sin resultados</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
