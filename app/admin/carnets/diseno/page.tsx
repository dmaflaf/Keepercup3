'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Layout = Record<string, Record<string, number | number[]>>

const NOMBRES: Record<string, string> = {
  foto: 'Foto (marco)', texto: 'Nombres, apellidos, cédula y fecha', escudoFrente: 'Escudo del frente', numero: 'Número grande', banda: 'Franja roja (club)',
  qr: 'QR (dorso)', escudoDorso: 'Escudo del dorso', nombreDorso: 'Nombre en la franja gris (dorso)', cubrirDorso: 'Tapa del nombre de ejemplo (dorso)',
}
const CAMPOS: Record<string, string> = {
  x: 'X (desde la izquierda)', y: 'Y (desde arriba)', w: 'Ancho', h: 'Alto', inset: 'Margen interno', radio: 'Redondeo', cx: 'Centro X', cy: 'Centro Y', maxW: 'Ancho máximo',
  tam: 'Tamaño de letra', cap: 'Altura de letra', base: 'Línea base (Y)', lado: 'Lado', x0: 'X inicio', x1: 'X fin', y0: 'Y inicio', y1: 'Y fin',
}
const inp = 'px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm w-24'
const btn = 'px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-sm'

export default function DisenoCarnet() {
  const [layout, setLayout] = useState<Layout | null>(null)
  const [msg, setMsg] = useState('')
  const [club, setClub] = useState('')
  const [equipos, setEquipos] = useState<string[]>([])
  const [ver, setVer] = useState(0)

  useEffect(() => {
    fetch('/api/admin/carnets/diseno').then((r) => r.json()).then((r) => (r.ok ? setLayout(r.layout) : setMsg(r.message || 'No autorizado')))
    fetch('/api/admin/carnets/club').then((r) => r.json()).then((r) => r.ok && setEquipos(r.equipos))
  }, [])

  const set = (g: string, k: string, v: number, i?: number) => {
    if (!layout) return
    const copia = JSON.parse(JSON.stringify(layout)) as Layout
    if (i !== undefined) (copia[g][k] as number[])[i] = v
    else copia[g][k] = v
    setLayout(copia)
  }
  const guardar = async () => {
    const r = await fetch('/api/admin/carnets/diseno', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout }) }).then((x) => x.json())
    setMsg(r.ok ? 'Medidas guardadas.' : r.message)
    setVer((v) => v + 1)
  }
  const restaurar = async () => {
    if (!confirm('¿Volver a las medidas originales de la plantilla?')) return
    await fetch('/api/admin/carnets/diseno', { method: 'DELETE' })
    const r = await fetch('/api/admin/carnets/diseno').then((x) => x.json())
    setLayout(r.layout); setMsg('Medidas originales restauradas.'); setVer((v) => v + 1)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <Link href="/admin/carnets" className="text-slate-400 text-sm hover:text-white">← Volver a Carnets</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">Diseño del carnet</h1>
        <p className="text-slate-400 mb-4">Ajusta la posición y el tamaño de cada dato sobre tu plantilla. Medidas en puntos (1 pt = 0,35 mm), desde la esquina superior izquierda de cada tarjeta. Guarda y mira la vista previa.</p>
        {msg && <div className="bg-slate-700 border border-slate-500 rounded-lg p-3 mb-4 text-sm" onClick={() => setMsg('')}>{msg}</div>}
        <div className="grid lg:grid-cols-2 gap-6">
          <div>
            <div className="flex gap-2 mb-4"><button className={btn} onClick={guardar}>Guardar y actualizar vista previa</button><button className="px-4 py-2 bg-slate-600 rounded-lg text-sm" onClick={restaurar}>Restaurar originales</button></div>
            {layout && Object.keys(layout).map((g) => (
              <details key={g} className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-3" open={g === 'foto'}>
                <summary className="cursor-pointer font-semibold">{NOMBRES[g] || g}</summary>
                <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                  {Object.entries(layout[g]).map(([k, v]) => Array.isArray(v)
                    ? v.map((n, i) => <label key={k + i} className="flex items-center justify-between gap-2">Línea base {i + 1}<input type="number" step="0.1" className={inp} value={n} onChange={(e) => set(g, k, Number(e.target.value), i)} /></label>)
                    : <label key={k} className="flex items-center justify-between gap-2">{CAMPOS[k] || k}<input type="number" step="0.1" className={inp} value={v} onChange={(e) => set(g, k, Number(e.target.value))} /></label>)}
                </div>
              </details>
            ))}
          </div>
          <div>
            <div className="flex gap-2 mb-2 items-center">
              <select className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm" value={club} onChange={(e) => { setClub(e.target.value); setVer((v) => v + 1) }}>
                <option value="">Club de ejemplo (Legacy FC)</option>{equipos.map((e) => <option key={e}>{e}</option>)}
              </select>
              <span className="text-slate-400 text-xs">Vista previa con un jugador ficticio</span>
              <a className="text-yellow-300 underline text-xs ml-auto" target="_blank" href={`/api/admin/carnets/pdf?muestra=1${club ? '&equipo=' + encodeURIComponent(club) : ''}`}>Abrir en pestaña nueva</a>
            </div>
            <iframe key={ver} src={`/api/admin/carnets/pdf?muestra=1${club ? '&equipo=' + encodeURIComponent(club) : ''}#toolbar=0&zoom=130`} className="w-full bg-white rounded-lg" style={{ height: 760 }} />
          </div>
        </div>
      </div>
    </div>
  )
}
