'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { calcularRecorte, ENCUADRE, Recorte } from '@/lib/encuadre'

interface J { id: string; nombre: string; numero: number | null; equipo: string; crop: Recorte | null; estado: string | null; motivo: string | null }
type Detector = { detect: (img: ImageBitmap) => { detections: { boundingBox?: { originX: number; originY: number; width: number; height: number }; categories: { score: number }[]; keypoints: { x: number; y: number }[] }[] } }

const inp = 'px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm'
const btn = 'px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm'
const btn2 = 'px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg text-sm'
const sec = 'bg-slate-800 border border-slate-700 rounded-xl p-5 mb-5'
const ETIQ: Record<string, string> = { auto: 'Automático', manual: 'Ajustado a mano', revisar: 'Revisar', otra_foto: 'Pedir otra foto' }

async function cargarImagen(id: string): Promise<ImageBitmap> {
  const r = await fetch(`/api/admin/fotos/${id}/selfie`)
  if (!r.ok) throw new Error('No se pudo leer la foto')
  return createImageBitmap(await r.blob())
}

function dibujarRecorte(canvas: HTMLCanvasElement, img: ImageBitmap, c: Recorte | null, ancho: number) {
  const alto = Math.round(ancho / ENCUADRE.aspecto)
  canvas.width = ancho; canvas.height = alto
  const g = canvas.getContext('2d')!
  g.fillStyle = '#e5e7eb'; g.fillRect(0, 0, ancho, alto)
  if (c) g.drawImage(img, c.x * img.width, c.y * img.height, c.w * img.width, c.h * img.height, 0, 0, ancho, alto)
  else g.drawImage(img, 0, 0, ancho, alto)
}

export default function Encuadre() {
  const [equipos, setEquipos] = useState<string[]>([])
  const [club, setClub] = useState('')
  const [lista, setLista] = useState<J[]>([])
  const [msg, setMsg] = useState('')
  const [proceso, setProceso] = useState<{ hechas: number; total: number; sinRostro: number } | null>(null)
  const [rehacer, setRehacer] = useState(false)
  const [filtro, setFiltro] = useState<'revisar' | 'todos' | 'auto' | 'manual' | 'otra_foto' | 'sin'>('revisar')
  const detector = useRef<Detector | null>(null)
  const parar = useRef(false)

  const cargar = useCallback(async (nombre: string) => {
    const r = await fetch('/api/admin/encuadre' + (nombre ? '?equipo=' + encodeURIComponent(nombre) : '')).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setMsg(r?.message || 'No se pudo cargar (¿eres administrador?)'); return }
    setEquipos(r.equipos); setLista(r.jugadores)
  }, [])
  useEffect(() => { cargar(club) }, [club, cargar])

  async function obtenerDetector(): Promise<Detector> {
    if (detector.current) return detector.current
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
    const d = await FaceDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: '/mediapipe/blaze_face_short_range.tflite', delegate: 'CPU' }, runningMode: 'IMAGE', minDetectionConfidence: 0.5 })
    detector.current = d as unknown as Detector
    return detector.current
  }

  async function procesar() {
    const pendientes = lista.filter((j) => rehacer || !j.estado)
    if (!pendientes.length) { setMsg('No hay fotos pendientes de encuadrar.'); return }
    parar.current = false
    setMsg('Cargando el detector de rostros (primera vez: unos segundos)…')
    let det: Detector
    try { det = await obtenerDetector() } catch { setMsg('No se pudo cargar el detector de rostros. Revisa tu conexión y vuelve a intentar.'); return }
    setMsg('')
    let sinRostro = 0
    setProceso({ hechas: 0, total: pendientes.length, sinRostro })
    let lote: { playerId: string; crop: Recorte | null; estado: string; motivo: string }[] = []
    const volcar = async () => {
      if (!lote.length) return
      await fetch('/api/admin/encuadre', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: lote }) })
      lote = []
    }
    for (let i = 0; i < pendientes.length; i++) {
      if (parar.current) break
      const j = pendientes[i]
      try {
        const img = await cargarImagen(j.id)
        const res = det.detect(img)
        const caras = res.detections.filter((d) => d.boundingBox).sort((a, b) => b.boundingBox!.width * b.boundingBox!.height - a.boundingBox!.width * a.boundingBox!.height)
        if (!caras.length) {
          sinRostro++
          lote.push({ playerId: j.id, crop: null, estado: 'revisar', motivo: 'No se detectó ningún rostro' })
        } else {
          const c = caras[0]
          const b = c.boundingBox!
          const ojos = c.keypoints.length >= 2 ? ((c.keypoints[0].y + c.keypoints[1].y) / 2) * img.height : null
          const r = calcularRecorte(img.width, img.height, { x: b.originX, y: b.originY, w: b.width, h: b.height }, ojos)
          const motivos = [...r.motivos]
          if (caras.length > 1 && caras[1].categories[0].score > 0.6) motivos.push('Hay más de una persona en la foto')
          lote.push({ playerId: j.id, crop: r.crop, estado: motivos.length ? 'revisar' : 'auto', motivo: motivos.join(' · ') })
        }
        img.close()
      } catch {
        lote.push({ playerId: j.id, crop: null, estado: 'revisar', motivo: 'No se pudo leer la foto' })
      }
      if (lote.length >= 25) await volcar()
      setProceso({ hechas: i + 1, total: pendientes.length, sinRostro })
    }
    await volcar()
    setProceso(null)
    setMsg(parar.current ? 'Proceso detenido.' : 'Listo. Revisa las fotos marcadas.')
    cargar(club)
  }

  const cuenta = (e: string | null) => lista.filter((j) => (e === null ? !j.estado : j.estado === e)).length
  const visibles = lista.filter((j) => filtro === 'todos' || (filtro === 'sin' ? !j.estado : j.estado === filtro))

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <Link href="/admin/carnets" className="text-slate-400 text-sm hover:text-white">← Volver a Carnets</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">📸 Encuadrar fotos</h1>
        <p className="text-slate-400 mb-5">El sistema encuentra el rostro de cada jugador y recorta la foto como en tu carnet de referencia (cara centrada, ojos a mitad de altura, hombros). La foto original nunca se modifica. Las que tengan problemas quedan marcadas para que las revises.</p>
        {msg && <div className="bg-slate-700 border border-slate-500 rounded-lg p-3 mb-4 text-sm" onClick={() => setMsg('')}>{msg}</div>}

        <section className={sec}>
          <div className="flex flex-wrap items-center gap-3">
            <select className={inp} value={club} onChange={(e) => setClub(e.target.value)}>
              <option value="">Todos los clubes</option>{equipos.map((e) => <option key={e}>{e}</option>)}
            </select>
            <button className={btn} disabled={!!proceso || !lista.length} onClick={procesar}>Encuadrar automáticamente ({rehacer ? lista.length : cuenta(null)})</button>
            {proceso && <button className={btn2} onClick={() => { parar.current = true }}>Detener</button>}
            <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={rehacer} onChange={(e) => setRehacer(e.target.checked)} /> Rehacer también las ya encuadradas</label>
          </div>
          {proceso && (
            <div className="mt-3"><div className="h-2 bg-slate-700 rounded"><div className="h-2 bg-green-500 rounded" style={{ width: `${(proceso.hechas / proceso.total) * 100}%` }} /></div>
              <p className="text-sm text-slate-300 mt-1">{proceso.hechas} de {proceso.total} · sin rostro: {proceso.sinRostro}</p></div>
          )}
          <p className="text-sm text-slate-400 mt-3">Sin encuadrar: <b>{cuenta(null)}</b> · Automáticas: <b className="text-green-400">{cuenta('auto')}</b> · A revisar: <b className="text-yellow-300">{cuenta('revisar')}</b> · Ajustadas a mano: <b>{cuenta('manual')}</b> · Pedir otra foto: <b className="text-red-400">{cuenta('otra_foto')}</b></p>
        </section>

        <div className="flex flex-wrap gap-2 mb-4">
          {([['revisar', 'A revisar'], ['otra_foto', 'Pedir otra foto'], ['auto', 'Automáticas'], ['manual', 'A mano'], ['sin', 'Sin encuadrar'], ['todos', 'Todas']] as const).map(([k, t]) => (
            <button key={k} className={`px-3 py-1.5 rounded-lg text-sm ${filtro === k ? 'bg-yellow-500 text-black font-semibold' : 'bg-slate-700'}`} onClick={() => setFiltro(k)}>{t}</button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {visibles.slice(0, 120).map((j) => <Tarjeta key={j.id} j={j} alGuardar={() => cargar(club)} />)}
        </div>
        {visibles.length > 120 && <p className="text-slate-400 text-sm mt-3">Se muestran 120 de {visibles.length}. Filtra por club para ver el resto.</p>}
        {!visibles.length && <p className="text-slate-500">Nada en esta lista.</p>}
      </div>
    </div>
  )
}

function Tarjeta({ j, alGuardar }: { j: J; alGuardar: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const img = useRef<ImageBitmap | null>(null)
  const [editando, setEditando] = useState(false)
  const [crop, setCrop] = useState<Recorte | null>(j.crop)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    let vivo = true
    cargarImagen(j.id).then((b) => { if (!vivo) return; img.current = b; setListo(true) }).catch(() => {})
    return () => { vivo = false }
  }, [j.id])
  useEffect(() => { if (listo && cv.current && img.current) dibujarRecorte(cv.current, img.current, crop, editando ? 300 : 140) }, [listo, crop, editando])

  async function guardar(estado: string, c: Recorte | null, motivo = '') {
    await fetch('/api/admin/encuadre', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ playerId: j.id, crop: c, estado, motivo }] }) })
    setEditando(false); alGuardar()
  }
  const mover = (dx: number, dy: number) => crop && setCrop({ ...crop, x: Math.min(Math.max(crop.x + dx, 0), 1 - crop.w), y: Math.min(Math.max(crop.y + dy, 0), 1 - crop.h) })
  const zoom = (f: number) => {
    if (!crop || !img.current) return
    const w = Math.min(Math.max(crop.w * f, 0.1), 1)
    const hh = (w * img.current.width) / ENCUADRE.aspecto / img.current.height
    if (hh > 1) return
    const cx = crop.x + crop.w / 2, cy = crop.y + crop.h / 2
    setCrop({ x: Math.min(Math.max(cx - w / 2, 0), 1 - w), y: Math.min(Math.max(cy - hh / 2, 0), 1 - hh), w, h: hh })
  }
  const colorEstado = j.estado === 'auto' ? 'text-green-400' : j.estado === 'revisar' ? 'text-yellow-300' : j.estado === 'otra_foto' ? 'text-red-400' : 'text-slate-300'

  return (
    <div className={`bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs ${editando ? 'col-span-2 row-span-2' : ''}`}>
      <canvas ref={cv} className="w-full rounded bg-slate-700" style={{ aspectRatio: String(ENCUADRE.aspecto) }} />
      <p className="mt-1 font-semibold truncate">{j.numero ?? '–'} · {j.nombre}</p>
      <p className="text-slate-400 truncate">{j.equipo}</p>
      <p className={colorEstado}>{ETIQ[j.estado || ''] || 'Sin encuadrar'}</p>
      {j.motivo && <p className="text-yellow-200/80">{j.motivo}</p>}
      {!editando ? (
        <div className="flex flex-wrap gap-1 mt-1">
          {j.estado !== 'auto' && j.crop && <button className={btn2 + ' !py-1 !px-2'} onClick={() => guardar('manual', j.crop, 'Aceptada')}>Aceptar</button>}
          <button className={btn2 + ' !py-1 !px-2'} onClick={() => { setCrop(j.crop ?? { x: 0, y: 0, w: 1, h: Math.min(1, 1) }); setEditando(true) }}>Ajustar</button>
          {j.estado !== 'otra_foto' && <button className="text-red-400 underline" onClick={() => guardar('otra_foto', j.crop, 'Pedir otra foto')}>Otra foto</button>}
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          <div className="flex gap-1 flex-wrap">
            <button className={btn2 + ' !py-1 !px-2'} onClick={() => mover(-0.02, 0)}>◀</button><button className={btn2 + ' !py-1 !px-2'} onClick={() => mover(0.02, 0)}>▶</button>
            <button className={btn2 + ' !py-1 !px-2'} onClick={() => mover(0, -0.02)}>▲</button><button className={btn2 + ' !py-1 !px-2'} onClick={() => mover(0, 0.02)}>▼</button>
            <button className={btn2 + ' !py-1 !px-2'} onClick={() => zoom(0.92)}>＋ Acercar</button><button className={btn2 + ' !py-1 !px-2'} onClick={() => zoom(1.08)}>－ Alejar</button>
          </div>
          <div className="flex gap-1"><button className={btn + ' !py-1 !px-2'} onClick={() => guardar('manual', crop, 'Ajustada a mano')}>Guardar</button><button className={btn2 + ' !py-1 !px-2'} onClick={() => { setCrop(j.crop); setEditando(false) }}>Cancelar</button></div>
        </div>
      )}
    </div>
  )
}
