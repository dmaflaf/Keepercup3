'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

interface Jugador {
  id: string
  nombre: string
  equipo: string
  numero: number | null
  posicion: string | null
  estado: string
  cedula: string | null
  tieneSelfie: boolean
  tieneCedulaFrente: boolean
  tieneCedulaReverso: boolean
}

export default function JugadoresPage() {
  const [lista, setLista] = useState<Jugador[]>([])
  const [rol, setRol] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [equipo, setEquipo] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(false)

  useEffect(() => {
    fetch('/api/admin/jugadores')
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) setError(d.message || 'No se pudo cargar')
        else {
          setLista(d.jugadores)
          setRol(d.rol)
        }
      })
      .catch(() => setError('Error de conexión'))
      .finally(() => setCargando(false))
  }, [])

  const equipos = useMemo(() => Array.from(new Set(lista.map((j) => j.equipo))).sort(), [lista])
  const visibles = lista.filter((j) => {
    if (equipo && j.equipo !== equipo) return false
    if (soloPendientes && j.tieneSelfie && j.tieneCedulaFrente && j.tieneCedulaReverso) return false
    const t = q.trim().toLowerCase()
    return !t || j.nombre.toLowerCase().includes(t) || (j.cedula || '').includes(t)
  })

  const marca = (ok: boolean) => (ok ? <span className="text-green-400">✔</span> : <span className="text-red-400">✖</span>)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Volver al panel</Link>
        <h1 className="text-3xl font-bold mt-3 mb-4">Jugadores ({visibles.length} de {lista.length})</h1>

        <div className="flex flex-wrap gap-3 mb-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={rol === 'admin' ? 'Buscar por nombre o cédula' : 'Buscar por nombre'} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg" />
          <select value={equipo} onChange={(e) => setEquipo(e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg">
            <option value="">Todos los equipos</option>
            {equipos.map((e) => <option key={e}>{e}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
            Solo con fotos pendientes
          </label>
        </div>

        {cargando && <p className="text-slate-300">Cargando…</p>}
        {error && <p className="text-red-300">{error}</p>}

        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="text-slate-400 text-left">
              <tr>
                <th className="p-3">Jugador</th><th className="p-3">Equipo</th><th className="p-3">#</th>
                <th className="p-3">Posición</th>{rol === 'admin' && <th className="p-3">Cédula</th>}
                <th className="p-3">Selfie</th><th className="p-3">Céd. frente</th><th className="p-3">Céd. reverso</th><th className="p-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((j) => (
                <tr key={j.id} className="border-t border-slate-700">
                  <td className="p-3"><Link href={`/admin/jugadores/${j.id}`} className="text-white hover:text-red-400 underline-offset-2 hover:underline">{j.nombre}</Link></td><td className="p-3">{j.equipo}</td><td className="p-3">{j.numero ?? '—'}</td>
                  <td className="p-3">{j.posicion ?? '—'}</td>{rol === 'admin' && <td className="p-3">{j.cedula}</td>}
                  <td className="p-3">{marca(j.tieneSelfie)}</td><td className="p-3">{marca(j.tieneCedulaFrente)}</td><td className="p-3">{marca(j.tieneCedulaReverso)}</td>
                  <td className="p-3 capitalize">{j.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
