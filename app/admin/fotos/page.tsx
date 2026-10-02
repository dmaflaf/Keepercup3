'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Fallo { id: string; nombre: string; equipo: string; tipo: string; motivo: string }

const NOMBRE_TIPO: Record<string, string> = { selfie: 'selfie', cedula_front: 'cédula frente', cedula_back: 'cédula reverso' }

export default function FotosPage() {
  const [corriendo, setCorriendo] = useState(false)
  const [copiadas, setCopiadas] = useState(0)
  const [restantes, setRestantes] = useState<number | null>(null)
  const [fallos, setFallos] = useState<Fallo[]>([])
  const [mensaje, setMensaje] = useState('')

  async function iniciar() {
    setCorriendo(true)
    setMensaje('')
    setFallos([])
    setCopiadas(0)
    const omitir = new Set<string>()
    const todosFallos: Fallo[] = []
    let total = 0
    try {
      for (let vuelta = 0; vuelta < 200; vuelta++) {
        const res = await fetch('/api/admin/fotos/migrar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ omitir: Array.from(omitir) }),
        })
        const r = await res.json()
        if (!r.ok) {
          setMensaje(r.message || 'Error al copiar fotos')
          return
        }
        total += r.copiadas
        setCopiadas(total)
        setRestantes(r.restantes)
        for (const f of r.fallos as Fallo[]) {
          omitir.add(f.id)
          todosFallos.push(f)
        }
        setFallos([...todosFallos])
        if (r.restantes === 0) break
      }
      setMensaje(todosFallos.length ? 'Terminó, pero algunas fotos no se pudieron copiar (ver abajo).' : 'Terminó: todas las fotos fueron copiadas.')
    } catch {
      setMensaje('Se cortó la conexión. Puedes volver a pulsar el botón: continúa donde quedó.')
    } finally {
      setCorriendo(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Volver al panel</Link>
        <h1 className="text-3xl font-bold mt-3 mb-2">Copiar fotos desde Drive</h1>
        <p className="text-slate-400 mb-6">
          Copia la selfie y las cédulas de cada jugador a tu sistema (reducidas de tamaño). Las cédulas solo se ven con sesión de administrador.
          Se puede repetir sin problema: solo copia lo que falte.
        </p>

        <button onClick={iniciar} disabled={corriendo} className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-bold disabled:opacity-50">
          {corriendo ? 'Copiando… no cierres esta página' : 'Copiar fotos'}
        </button>

        {(corriendo || copiadas > 0) && (
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center"><div className="text-3xl font-bold">{copiadas}</div><div className="text-slate-400 text-sm">Fotos copiadas</div></div>
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center"><div className="text-3xl font-bold">{restantes ?? '…'}</div><div className="text-slate-400 text-sm">Jugadores por procesar</div></div>
          </div>
        )}

        {mensaje && <div className="mt-4 rounded-lg p-4 border bg-slate-800 border-slate-600">{mensaje}</div>}

        {fallos.length > 0 && (
          <div className="mt-6 bg-slate-800 border border-slate-700 rounded-xl p-4">
            <h2 className="font-bold mb-2">Resumen por equipo ({fallos.length} fotos con problema)</h2>
            <ul className="text-sm text-slate-300 columns-1 md:columns-2">
              {Object.entries(fallos.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.equipo]: (acc[f.equipo] || 0) + 1 }), {}))
                .sort((a, b) => b[1] - a[1])
                .map(([eq, n]) => <li key={eq}>{eq}: {n}</li>)}
            </ul>
            <h2 className="font-bold mt-4 mb-2">Motivos</h2>
            <ul className="text-sm text-amber-300">
              {Object.entries(fallos.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.motivo]: (acc[f.motivo] || 0) + 1 }), {}))
                .map(([m, n]) => <li key={m}>{n} × {m}</li>)}
            </ul>
          </div>
        )}

        {fallos.length > 0 && (
          <div className="mt-6 bg-slate-800 border border-slate-700 rounded-xl max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-400 text-left sticky top-0 bg-slate-800"><tr><th className="p-2">Jugador</th><th className="p-2">Equipo</th><th className="p-2">Foto</th><th className="p-2">Motivo</th></tr></thead>
              <tbody>
                {fallos.map((f, i) => (
                  <tr key={i} className="border-t border-slate-700"><td className="p-2">{f.nombre}</td><td className="p-2">{f.equipo}</td><td className="p-2">{NOMBRE_TIPO[f.tipo] || f.tipo}</td><td className="p-2 text-amber-300">{f.motivo}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
