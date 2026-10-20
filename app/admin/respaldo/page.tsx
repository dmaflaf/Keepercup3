'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import JSZip from 'jszip'

interface Jug { id: string; nombre: string; cedula: string | null; numero: number | null; selfie: boolean; frente: boolean; reverso: boolean }
const btn = 'px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm'
const btn2 = 'px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg text-sm'
const sec = 'bg-slate-800 border border-slate-700 rounded-xl p-5 mb-5'
const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9 _-]+/g, '').replace(/\s+/g, ' ').trim()

export default function Respaldo() {
  const [clubes, setClubes] = useState<string[]>([])
  const [club, setClub] = useState('')
  const [msg, setMsg] = useState('')
  const [progreso, setProgreso] = useState<{ texto: string; hechas: number; total: number } | null>(null)
  const parar = useRef(false)

  useEffect(() => { fetch('/api/admin/cargar/club').then((r) => r.json()).then((r) => r.ok && setClubes(r.equipos)).catch(() => setMsg('No se pudo cargar la lista de clubes (¿eres administrador?)')) }, [])

  async function zipDeClub(nombre: string, etiqueta: string): Promise<{ blob: Blob; fotos: number; faltan: number } | null> {
    const r = await fetch('/api/admin/cargar/club?equipo=' + encodeURIComponent(nombre)).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setMsg(`No se pudo leer el club ${nombre}`); return null }
    const jugadores: Jug[] = r.jugadores
    const zip = new JSZip()
    const tareas: { id: string; kind: string; ruta: string }[] = []
    for (const j of jugadores) {
      const base = `${limpio(nombre)}/${String(j.numero ?? 'sn').padStart(2, '0')} ${limpio(j.nombre)} ${j.cedula || 'sin-cedula'}`
      if (j.selfie) tareas.push({ id: j.id, kind: 'selfie', ruta: `${base}/selfie.jpg` })
      if (j.frente) tareas.push({ id: j.id, kind: 'cedula_front', ruta: `${base}/cedula-frente.jpg` })
      if (j.reverso) tareas.push({ id: j.id, kind: 'cedula_back', ruta: `${base}/cedula-reverso.jpg` })
    }
    let hechas = 0, faltan = 0, i = 0
    const trabajador = async () => {
      while (i < tareas.length && !parar.current) {
        const t = tareas[i++]
        try {
          const x = await fetch(`/api/admin/fotos/${t.id}/${t.kind}`)
          if (!x.ok) throw new Error('x')
          zip.file(t.ruta, await x.blob())
        } catch { faltan++ }
        hechas++
        setProgreso({ texto: `${etiqueta}: ${nombre}`, hechas, total: tareas.length })
      }
    }
    await Promise.all([trabajador(), trabajador(), trabajador(), trabajador()])
    if (parar.current) return null
    return { blob: await zip.generateAsync({ type: 'blob', compression: 'STORE' }), fotos: tareas.length - faltan, faltan }
  }

  const bajar = (blob: Blob, nombre: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000) }
  const sello = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)

  async function fotosClub(nombre: string) {
    parar.current = false; setMsg('')
    const r = await zipDeClub(nombre, 'Preparando fotos')
    setProgreso(null)
    if (!r) { if (parar.current) setMsg('Detenido.'); return }
    bajar(r.blob, `fotos-${limpio(nombre).replace(/ /g, '-')}-${sello()}.zip`)
    setMsg(`✔ ${nombre}: ${r.fotos} fotos descargadas${r.faltan ? ` (${r.faltan} no se pudieron leer)` : ''}.`)
  }
  async function fotosTodos() {
    if (!confirm(`Se descargará un ZIP por cada club (${clubes.length}). El navegador puede pedirte permiso para descargar varios archivos: acéptalo. ¿Continuar?`)) return
    parar.current = false; setMsg('')
    let total = 0
    for (const c of clubes) {
      if (parar.current) break
      const r = await zipDeClub(c, `Club ${clubes.indexOf(c) + 1} de ${clubes.length}`)
      if (r && r.fotos > 0) { bajar(r.blob, `fotos-${limpio(c).replace(/ /g, '-')}-${sello()}.zip`); total += r.fotos }
      await new Promise((ok) => setTimeout(ok, 800))
    }
    setProgreso(null); setMsg(parar.current ? 'Detenido.' : `✔ Listo: ${total} fotos en ${clubes.length} ZIP.`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">⚙️ Respaldo de datos</h1>
        <p className="text-slate-400 mb-5">Descarga una copia de tus datos y fotos. <b>Guárdala en un lugar privado</b> (tu computador, un USB y Drive): contiene datos personales. Es una segunda red de seguridad; el respaldo principal es el de Railway.</p>
        {msg && <div className="bg-slate-700 border border-slate-500 rounded-lg p-3 mb-4 text-sm" onClick={() => setMsg('')}>{msg}</div>}

        <section className={sec}>
          <h2 className="font-bold mb-1">1. Datos del sistema</h2>
          <p className="text-slate-400 text-sm mb-3">Clubes, jugadores, torneo, partidos, eventos, traspasos, usuarios (sin claves), sorteo y ajustes.</p>
          <div className="flex flex-wrap gap-2">
            <a className={btn + ' inline-block'} href="/api/admin/respaldo?formato=xlsx">⬇ Descargar en Excel</a>
            <a className={btn2 + ' inline-block'} href="/api/admin/respaldo?formato=json">⬇ Descargar completo (JSON, para restaurar)</a>
          </div>
        </section>

        <section className={sec}>
          <h2 className="font-bold mb-1">2. Fotos y cédulas</h2>
          <p className="text-slate-400 text-sm mb-3">Un ZIP por club con la selfie y las cédulas de cada jugador, en carpetas con su número, nombre y cédula.</p>
          <div className="flex flex-wrap gap-2 items-center">
            <select className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm" value={club} onChange={(e) => setClub(e.target.value)}>
              <option value="">Elige un club…</option>{clubes.map((c) => <option key={c}>{c}</option>)}
            </select>
            <button className={btn} disabled={!club || !!progreso} onClick={() => fotosClub(club)}>⬇ Descargar fotos del club</button>
            <button className={btn2} disabled={!clubes.length || !!progreso} onClick={fotosTodos}>⬇ Todos los clubes (un ZIP por club)</button>
            {progreso && <button className={btn2} onClick={() => { parar.current = true }}>Detener</button>}
          </div>
          {progreso && (
            <div className="mt-3"><div className="h-2 bg-slate-700 rounded"><div className="h-2 bg-green-500 rounded" style={{ width: `${progreso.total ? (progreso.hechas / progreso.total) * 100 : 0}%` }} /></div>
              <p className="text-sm text-slate-300 mt-1">{progreso.texto} · {progreso.hechas} de {progreso.total} fotos</p></div>
          )}
        </section>

        <section className={sec}>
          <h2 className="font-bold mb-2">Lo que NO incluye (se respalda aparte)</h2>
          <ul className="text-sm text-slate-300 list-disc pl-5 space-y-1">
            <li>El <b>código del sistema</b>: ZIP y bundle de GitHub (guía en <code>docs/RESPALDO_Y_RESTAURACION.md</code>).</li>
            <li>Las <b>claves</b> de usuarios (cifradas) y las variables de Vercel: guárdalas en un gestor de contraseñas.</li>
            <li>Los <b>escudos</b> de los clubes y los archivos originales de Drive.</li>
            <li>El <b>respaldo de la base en Railway</b> (Backups): es el único que restaura todo tal cual.</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
