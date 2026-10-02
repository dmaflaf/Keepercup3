'use client'

import { useState } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'

interface Incidencia {
  hoja: string
  fila: number
  nivel: 'error' | 'aviso'
  mensaje: string
  detalle?: string
}
interface Resumen {
  equiposValidos: number
  jugadoresValidos: number
  errores: number
  avisos: number
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export default function ImportarPage() {
  const [datos, setDatos] = useState<{ equipos: unknown[]; jugadores: unknown[] } | null>(null)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [incidencias, setIncidencias] = useState<Incidencia[]>([])
  const [filtro, setFiltro] = useState<'todas' | 'error' | 'aviso'>('error')
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [hecho, setHecho] = useState(false)

  async function llamar(confirmar: boolean, d = datos) {
    const res = await fetch('/api/admin/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...d, confirmar }),
    })
    return res.json()
  }

  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setMensaje('')
    setHecho(false)
    setResumen(null)
    setCargando(true)
    try {
      const wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array' })
      const hoja = (n: string) => wb.SheetNames.find((s) => norm(s) === n)
      const hEquipos = hoja('equipos')
      const hJugadores = hoja('jugadores')
      if (!hEquipos && !hJugadores) {
        setMensaje('No encontré las hojas "Equipos" ni "Jugadores" en el archivo.')
        return
      }
      const leer = (n?: string) =>
        n ? XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: false }) : []
      const d = { equipos: leer(hEquipos), jugadores: leer(hJugadores) }
      setDatos(d)
      setNombreArchivo(archivo.name)
      const r = await llamar(false, d)
      if (!r.ok) {
        setMensaje(r.message || 'No se pudo revisar el archivo')
        return
      }
      setResumen(r.resumen)
      setIncidencias(r.incidencias)
      setFiltro(r.resumen.errores > 0 ? 'error' : 'aviso')
    } catch {
      setMensaje('No pude leer el archivo. Debe ser un Excel (.xlsx).')
    } finally {
      setCargando(false)
    }
  }

  async function confirmar() {
    setCargando(true)
    setMensaje('')
    try {
      const r = await llamar(true)
      if (!r.ok) {
        setMensaje(r.message || 'Error al importar')
        return
      }
      const x = r.resultado
      setMensaje(
        `Listo: ${x.jugadoresCreados} jugadores nuevos, ${x.jugadoresActualizados} actualizados.` +
          (x.equiposFallidos.length ? ` Equipos con problema: ${x.equiposFallidos.join(', ')}.` : '') +
          (x.jugadoresFallidos?.length ? ` No se pudo guardar a ${x.jugadoresFallidos.length} jugador(es): ${x.jugadoresFallidos.slice(0, 5).map((f: { nombre: string; motivo: string }) => `${f.nombre} (${f.motivo})`).join('; ')}.` : '') +
          (x.numerosOmitidos?.length ? ` Entraron sin número (ya estaba tomado): ${x.numerosOmitidos.slice(0, 5).join(', ')}.` : '')
      )
      setHecho(true)
    } finally {
      setCargando(false)
    }
  }

  const visibles = incidencias.filter((i) => filtro === 'todas' || i.nivel === filtro)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">
          ← Volver al panel
        </Link>
        <h1 className="text-3xl font-bold mt-3 mb-2">Importar equipos y jugadores</h1>
        <p className="text-slate-400 mb-6">
          Sube el Excel descargado de tu hoja (Archivo → Descargar → Microsoft Excel). Debe tener las
          pestañas <b>Equipos</b> y <b>Jugadores</b>. Primero se revisa; no se guarda nada hasta que confirmes.
        </p>

        <label className="block bg-slate-800 border border-dashed border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-red-500">
          <input type="file" accept=".xlsx,.xls" onChange={alElegirArchivo} className="hidden" />
          <span className="text-lg">{nombreArchivo || 'Elegir archivo Excel'}</span>
        </label>

        {cargando && <p className="mt-4 text-slate-300">Procesando…</p>}
        {mensaje && (
          <div className={`mt-4 rounded-lg p-4 border ${hecho ? 'bg-green-900/30 border-green-700 text-green-100' : 'bg-red-900/30 border-red-700 text-red-100'}`}>
            {mensaje}
          </div>
        )}

        {resumen && !hecho && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              {[
                ['Equipos listos', resumen.equiposValidos],
                ['Jugadores listos', resumen.jugadoresValidos],
                ['Errores (se omiten)', resumen.errores],
                ['Avisos (se importan)', resumen.avisos],
              ].map(([t, n]) => (
                <div key={t as string} className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold">{n}</div>
                  <div className="text-slate-400 text-sm">{t}</div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-6">
              {(['error', 'aviso', 'todas'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  className={`px-3 py-1 rounded-lg text-sm ${filtro === f ? 'bg-red-600' : 'bg-slate-700'}`}
                >
                  {f === 'error' ? 'Errores' : f === 'aviso' ? 'Avisos' : 'Todo'}
                </button>
              ))}
            </div>

            <div className="mt-3 bg-slate-800 border border-slate-700 rounded-xl max-h-96 overflow-auto">
              {visibles.length === 0 ? (
                <p className="p-4 text-slate-400">Nada que mostrar en esta vista.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-slate-400 text-left sticky top-0 bg-slate-800">
                    <tr><th className="p-2">Hoja</th><th className="p-2">Fila</th><th className="p-2">Problema</th><th className="p-2">Quién</th></tr>
                  </thead>
                  <tbody>
                    {visibles.map((i, k) => (
                      <tr key={k} className="border-t border-slate-700">
                        <td className="p-2">{i.hoja}</td>
                        <td className="p-2">{i.fila}</td>
                        <td className={`p-2 ${i.nivel === 'error' ? 'text-red-300' : 'text-amber-300'}`}>{i.mensaje}</td>
                        <td className="p-2 text-slate-400">{i.detalle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <button
              onClick={confirmar}
              disabled={cargando || (resumen.equiposValidos === 0 && resumen.jugadoresValidos === 0)}
              className="mt-6 px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-bold disabled:opacity-50"
            >
              Confirmar importación ({resumen.equiposValidos} equipos, {resumen.jugadoresValidos} jugadores)
            </button>
            <p className="text-slate-500 text-sm mt-2">
              Se pueden repetir las veces que quieras: los jugadores se identifican por cédula y se actualizan, no se duplican.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
