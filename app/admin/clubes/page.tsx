'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Club { id: string; nombre: string; ciudad: string; estado: string; escudo: boolean; director: string; telefono: string; total: number; habilitados: number; conFoto: number; conCedulas: number }

export default function Clubes() {
  const [clubes, setClubes] = useState<Club[]>([])
  const [msg, setMsg] = useState('Cargando…')
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/api/admin/clubes', { cache: 'no-store' }).then((r) => r.json()).then((r) => { if (r.ok) { setClubes(r.clubes); setMsg('') } else setMsg(r.message || 'No autorizado') }).catch(() => setMsg('Sin conexión'))
  }, [])

  const vis = clubes.filter((c) => c.nombre.toLowerCase().includes(q.toLowerCase()) || (c.director || '').toLowerCase().includes(q.toLowerCase()))
  const suma = (k: 'total' | 'habilitados' | 'conFoto' | 'conCedulas') => vis.reduce((n, c) => n + c[k], 0)

  const csv = () => {
    const filas = [['N.º', 'Club', 'Ciudad', 'Director', 'Teléfono', 'Jugadores', 'Habilitados', 'Con foto', 'Con cédulas', 'Escudo'], ...vis.map((c, i) => [String(i + 1), c.nombre, c.ciudad, c.director, c.telefono, String(c.total), String(c.habilitados), String(c.conFoto), String(c.conCedulas), c.escudo ? 'Sí' : 'No'])]
    const blob = new Blob(['﻿' + filas.map((f) => f.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'clubes-keeper-cup.csv'; a.click()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">🏟️ Clubes registrados ({clubes.length})</h1>
        <p className="text-slate-400 mb-4">Todos los clubes del sistema con el avance de su nómina.</p>
        <div className="flex gap-2 flex-wrap mb-4">
          <input className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm flex-1 min-w-[14rem]" placeholder="Buscar club o director" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm" onClick={csv} disabled={!vis.length}>⬇ Descargar listado (Excel/CSV)</button>
        </div>
        {msg && <p className="text-slate-300">{msg}</p>}
        {!!clubes.length && (
          <div className="overflow-x-auto bg-slate-800 border border-slate-700 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-400"><tr><th className="p-3">#</th><th>Club</th><th>Ciudad</th><th>Director</th><th>Teléfono</th><th className="text-center">Jugadores</th><th className="text-center">Habilitados</th><th className="text-center">Fotos</th><th className="text-center">Cédulas</th><th className="text-center">Escudo</th></tr></thead>
              <tbody>
                {vis.map((c, i) => (
                  <tr key={c.id} className="border-t border-slate-700">
                    <td className="p-3 text-slate-400">{i + 1}</td><td className="font-semibold">{c.nombre}</td><td>{c.ciudad}</td><td>{c.director}</td><td>{c.telefono}</td>
                    <td className={`text-center ${c.total === 0 ? 'text-red-400' : c.total < 11 ? 'text-yellow-300' : ''}`}>{c.total}</td>
                    <td className="text-center">{c.habilitados}</td><td className="text-center">{c.conFoto}</td><td className="text-center">{c.conCedulas}</td>
                    <td className="text-center">{c.escudo ? <span className="text-green-400">✔</span> : <span className="text-red-400">✖</span>}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-500 font-bold"><td className="p-3" colSpan={5}>Totales ({vis.length} clubes)</td><td className="text-center">{suma('total')}</td><td className="text-center">{suma('habilitados')}</td><td className="text-center">{suma('conFoto')}</td><td className="text-center">{suma('conCedulas')}</td><td /></tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-slate-500 text-xs mt-3">Rojo: club sin jugadores · Amarillo: menos de 11 jugadores.</p>
      </div>
    </div>
  )
}
