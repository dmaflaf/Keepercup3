'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { aBlob, cargarCV, CEDULA, detectarCedula, Esquinas, esquinasDeMarco, girar, Marco, marcoDesdeEsquinas, recortarMarco } from '@/lib/cedula'

interface Lado { estado: string | null; motivo: string | null; esquinas: Esquinas | null }
interface J { id: string; nombre: string; numero: number | null; equipo: string; frente: Lado | null; reverso: Lado | null }
type Kind = 'cedula_front' | 'cedula_back'
type Detector = { detect: (img: ImageBitmap | HTMLCanvasElement) => { detections: { boundingBox?: { originX: number; originY: number; width: number; height: number }; categories: { score: number }[] }[] } }

const inp = 'px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm'
const btn = 'px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm'
const btn2 = 'px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg text-sm'
const mini = 'px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded text-xs'
const sec = 'bg-slate-800 border border-slate-700 rounded-xl p-5 mb-5'
const ETIQ: Record<string, string> = { auto: 'Automática', manual: 'Ajustada a mano', revisar: 'Revisar', otra_foto: 'Pedir otra foto' }
const COLOR: Record<string, string> = { auto: 'text-green-400', manual: 'text-slate-300', revisar: 'text-yellow-300', otra_foto: 'text-red-400' }

const urlImg = (id: string, kind: Kind, original = false, v = 0) => `/api/admin/cedulas/${id}/${kind}?${original ? 'v=original&' : ''}t=${v}`
async function cargarBitmap(id: string, kind: Kind, original = true): Promise<ImageBitmap> {
  const r = await fetch(urlImg(id, kind, original))
  if (!r.ok) throw new Error('No se pudo leer la foto')
  return createImageBitmap(await r.blob(), { imageOrientation: 'from-image' })
}
async function subir(playerId: string, kind: Kind, estado: string, motivo: string, c?: HTMLCanvasElement, esquinas?: Esquinas | null) {
  const f = new FormData()
  f.set('playerId', playerId); f.set('kind', kind); f.set('estado', estado); f.set('motivo', motivo)
  if (esquinas) f.set('esquinas', JSON.stringify(esquinas))
  if (c) f.set('archivo', await aBlob(c), 'cedula.jpg')
  const r = await fetch('/api/admin/cedulas', { method: 'POST', body: f }).then((x) => x.json()).catch(() => null)
  if (!r?.ok) throw new Error(r?.message || 'No se pudo guardar')
}

export default function Cedulas() {
  const [equipos, setEquipos] = useState<string[]>([])
  const [club, setClub] = useState('')
  const [lista, setLista] = useState<J[]>([])
  const [msg, setMsg] = useState('')
  const [proceso, setProceso] = useState<{ hechas: number; total: number; revisar: number } | null>(null)
  const [filtro, setFiltro] = useState<'revisar' | 'todos' | 'auto' | 'manual' | 'otra_foto' | 'sin'>('revisar')
  const [rehacer, setRehacer] = useState(false)
  const [editar, setEditar] = useState<{ cola: { j: J; kind: Kind }[]; inicio: number } | null>(null)
  const [version, setVersion] = useState(0)
  const detector = useRef<Detector | null>(null)
  const parar = useRef(false)

  const cargar = useCallback(async (nombre: string) => {
    const r = await fetch('/api/admin/cedulas' + (nombre ? '?equipo=' + encodeURIComponent(nombre) : '')).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setMsg(r?.message || 'No se pudo cargar (¿eres administrador?)'); return }
    setEquipos(r.equipos); setLista(r.jugadores); setVersion((v) => v + 1)
  }, [])
  useEffect(() => { cargar(club) }, [club, cargar])

  async function obtenerDetectorRostro(): Promise<Detector | null> {
    if (detector.current) return detector.current
    try {
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
      detector.current = (await FaceDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: '/mediapipe/blaze_face_short_range.tflite', delegate: 'CPU' }, runningMode: 'IMAGE', minDetectionConfidence: 0.4 })) as unknown as Detector
    } catch { detector.current = null }
    return detector.current
  }

  // Un lado de la cédula: detecta, endereza, comprueba orientación y guarda. Devuelve true si quedó para revisar.
  async function procesarLado(cv: unknown, det: Detector | null, j: J, kind: Kind): Promise<boolean> {
    let bm: ImageBitmap
    try { bm = await cargarBitmap(j.id, kind) } catch { await subir(j.id, kind, 'revisar', 'No se pudo leer la foto'); return true }
    try {
      const d = detectarCedula(cv, bm)
      if (!d.esquinas) { await subir(j.id, kind, 'revisar', d.motivos.join(' · ')); return true }
      // Solo se gira y se recorta (sin deformar): el marco usa la proporción real de la cédula
      const marco = marcoDesdeEsquinas(d.esquinas)
      marco.ancho *= 1.02
      let out = recortarMarco(bm, marco)
      const motivos = [...d.motivos]
      if (det) {
        const caras = det.detect(out).detections.filter((x) => x.boundingBox && x.categories[0]?.score > 0.6)
        const cara = caras.sort((a, b) => b.boundingBox!.width * b.boundingBox!.height - a.boundingBox!.width * a.boundingBox!.height)[0]
        if (kind === 'cedula_front' && cara) {
          const cy = cara.boundingBox!.originY + cara.boundingBox!.height / 2
          if (cy > CEDULA.alto * 0.6) out = girar(out, 180) // el retrato debe quedar en la mitad de arriba
        } else if (kind === 'cedula_back' && cara && cara.categories[0].score > 0.75) motivos.push('Parece el FRENTE (¿frente y reverso invertidos?)')
      }
      const revisar = motivos.length > 0
      await subir(j.id, kind, revisar ? 'revisar' : 'auto', motivos.join(' · '), out, esquinasDeMarco(marco))
      return revisar
    } catch (e) {
      await subir(j.id, kind, 'revisar', 'Error al procesar: ' + (e instanceof Error ? e.message : '')).catch(() => null)
      return true
    } finally { bm.close() }
  }

  async function procesar(limite: number) {
    const todos: { j: J; kind: Kind }[] = []
    for (const j of lista) {
      if (j.frente && (rehacer || !j.frente.estado)) todos.push({ j, kind: 'cedula_front' })
      if (j.reverso && (rehacer || !j.reverso.estado)) todos.push({ j, kind: 'cedula_back' })
    }
    const tareas = limite ? todos.slice(0, limite * 2) : todos
    if (!tareas.length) { setMsg('No hay cédulas pendientes de encuadrar.'); return }
    parar.current = false
    setMsg('Cargando el detector de cédulas (primera vez: unos segundos)…')
    let cv: unknown
    try { cv = await cargarCV() } catch { setMsg('No se pudo cargar el detector. Revisa tu conexión y vuelve a intentar.'); return }
    const det = await obtenerDetectorRostro()
    setMsg('')
    let revisar = 0
    setProceso({ hechas: 0, total: tareas.length, revisar })
    for (let i = 0; i < tareas.length; i++) {
      if (parar.current) break
      if (await procesarLado(cv, det, tareas[i].j, tareas[i].kind)) revisar++
      setProceso({ hechas: i + 1, total: tareas.length, revisar })
    }
    setProceso(null)
    setMsg(parar.current ? 'Proceso detenido.' : 'Listo. Revisa las cédulas marcadas.')
    cargar(club)
  }

  const est = (j: J) => [j.frente, j.reverso].filter(Boolean) as Lado[]
  const peor = (j: J) => { const e = est(j).map((x) => x.estado); return e.includes('otra_foto') ? 'otra_foto' : e.includes('revisar') ? 'revisar' : e.some((x) => !x) ? null : e.includes('manual') ? 'manual' : 'auto' }
  const cuenta = (e: string | null) => lista.filter((j) => peor(j) === e).length
  const visibles = lista.filter((j) => filtro === 'todos' || (filtro === 'sin' ? peor(j) === null : peor(j) === filtro))

  // Cola de revisión: todas las fotos de la lista actual que están por revisar (para pasar de una a otra con Enter)
  const pendientesRevision = () => visibles.flatMap((j) => ([['cedula_front', j.frente], ['cedula_back', j.reverso]] as const).filter(([, l]) => l && l.estado !== 'auto' && l.estado !== 'manual').map(([kind]) => ({ j, kind: kind as Kind })))

  async function accion(j: J, kind: Kind, a: 'restaurar' | 'otra' | 'girar') {
    try {
      if (a === 'restaurar') {
        const r = await fetch('/api/admin/cedulas', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId: j.id, kind }) }).then((x) => x.json())
        if (!r.ok) { setMsg(r.message); return }
      } else if (a === 'otra') await subir(j.id, kind, 'otra_foto', 'Pedir otra foto')
      else {
        const bm = await cargarBitmap(j.id, kind, false)
        await subir(j.id, kind, 'manual', 'Girada a mano', girar(bm, 90))
        bm.close()
      }
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Error') }
    cargar(club)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <Link href="/admin/carnets" className="text-slate-400 text-sm hover:text-white">← Volver a Carnets</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">🪪 Encuadrar cédulas</h1>
        <p className="text-slate-400 mb-5">El sistema encuentra la cédula en cada foto, la gira y la recorta con su proporción real, sin deformarla (frente y reverso). La foto original que subió el jugador siempre se conserva y puedes volver a ella. Las dudosas quedan marcadas: con ✂ Recortar las ajustas en segundos (arrastrar, rueda del mouse para zoom, Enter para guardar y pasar a la siguiente).</p>
        {msg && <div className="bg-slate-700 border border-slate-500 rounded-lg p-3 mb-4 text-sm" onClick={() => setMsg('')}>{msg}</div>}

        <section className={sec}>
          <div className="flex flex-wrap items-center gap-3">
            <select className={inp} value={club} onChange={(e) => setClub(e.target.value)}>
              <option value="">Todos los clubes</option>{equipos.map((e) => <option key={e}>{e}</option>)}
            </select>
            <button className={btn2} disabled={!!proceso || !lista.length} onClick={() => procesar(20)}>Probar con 20 jugadores</button>
            <button className={btn} disabled={!!proceso || !lista.length} onClick={() => procesar(0)}>Encuadrar todas las pendientes</button>
            {proceso && <button className={btn2} onClick={() => { parar.current = true }}>Detener</button>}
            <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={rehacer} onChange={(e) => setRehacer(e.target.checked)} /> Rehacer también las ya encuadradas</label>
          </div>
          {proceso && (
            <div className="mt-3"><div className="h-2 bg-slate-700 rounded"><div className="h-2 bg-green-500 rounded" style={{ width: `${(proceso.hechas / proceso.total) * 100}%` }} /></div>
              <p className="text-sm text-slate-300 mt-1">{proceso.hechas} de {proceso.total} fotos · a revisar: {proceso.revisar}</p></div>
          )}
          <p className="text-sm text-slate-400 mt-3">Sin encuadrar: <b>{cuenta(null)}</b> · Automáticas: <b className="text-green-400">{cuenta('auto')}</b> · A revisar: <b className="text-yellow-300">{cuenta('revisar')}</b> · A mano: <b>{cuenta('manual')}</b> · Pedir otra foto: <b className="text-red-400">{cuenta('otra_foto')}</b></p>
        </section>

        <div className="flex flex-wrap gap-2 mb-4">
          {([['revisar', 'A revisar'], ['otra_foto', 'Pedir otra foto'], ['auto', 'Automáticas'], ['manual', 'A mano'], ['sin', 'Sin encuadrar'], ['todos', 'Todas']] as const).map(([k, t]) => (
            <button key={k} className={`px-3 py-1.5 rounded-lg text-sm ${filtro === k ? 'bg-yellow-500 text-black font-semibold' : 'bg-slate-700'}`} onClick={() => setFiltro(k)}>{t}</button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibles.slice(0, 60).map((j) => (
            <div key={j.id} className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs">
              <p className="font-semibold text-sm truncate">{j.numero ?? '–'} · {j.nombre} <span className="text-slate-400 font-normal">· {j.equipo}</span></p>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {([['Frente', 'cedula_front', j.frente], ['Reverso', 'cedula_back', j.reverso]] as const).map(([t, kind, lado]) => (
                  <div key={kind}>
                    <p className="text-slate-400 mb-1">{t}</p>
                    {lado ? (<>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img loading="lazy" src={urlImg(j.id, kind, false, version)} alt="" className="w-full rounded bg-slate-700 object-contain" style={{ aspectRatio: String(CEDULA.ratio) }} />
                      <p className={COLOR[lado.estado || ''] || 'text-slate-300'}>{ETIQ[lado.estado || ''] || 'Sin encuadrar'}</p>
                      {lado.motivo && <p className="text-yellow-200/80">{lado.motivo}</p>}
                      <div className="flex flex-wrap gap-1 mt-1">
                        <button className={mini} onClick={() => setEditar({ cola: pendientesRevision(), inicio: Math.max(0, pendientesRevision().findIndex((x) => x.j.id === j.id && x.kind === kind)) })}>✂ Recortar</button>
                        <button className={mini} onClick={() => accion(j, kind, 'girar')}>⟳ Girar</button>
                        {lado.estado && lado.estado !== 'revisar' ? null : lado.estado === 'revisar' && <button className={mini} onClick={() => subir(j.id, kind, 'manual', 'Aceptada').then(() => cargar(club))}>Aceptar</button>}
                        {lado.estado && <button className={mini} onClick={() => accion(j, kind, 'restaurar')}>Volver al original</button>}
                        {lado.estado !== 'otra_foto' && <button className="text-red-400 underline" onClick={() => accion(j, kind, 'otra')}>Otra foto</button>}
                      </div>
                    </>) : <p className="text-slate-500">No subió esta foto</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {visibles.length > 60 && <p className="text-slate-400 text-sm mt-3">Se muestran 60 de {visibles.length}. Filtra por club para ver el resto.</p>}
        {!visibles.length && <p className="text-slate-500">Nada en esta lista.</p>}
      </div>
      {editar && <Editor {...editar} alCerrar={(recargar) => { setEditar(null); if (recargar) cargar(club) }} />}
    </div>
  )
}

// Cortador rápido: marco con la proporción de la cédula. Arrastra para mover, rueda del mouse para acercar/alejar, deslizador para inclinar.
function Editor({ cola, inicio, alCerrar }: { cola: { j: J; kind: Kind }[]; inicio: number; alCerrar: (recargar: boolean) => void }) {
  const [i, setI] = useState(inicio)
  const [hechas, setHechas] = useState(0)
  const { j, kind } = cola[i] ?? cola[0]
  const lado = kind === 'cedula_front' ? j.frente : j.reverso
  const cv = useRef<HTMLCanvasElement>(null)
  const vista = useRef<HTMLCanvasElement>(null)
  const [bm, setBm] = useState<ImageBitmap | null>(null)
  const [m, setM] = useState<Marco | null>(null)
  const [aviso, setAviso] = useState('Cargando…')
  const modo = useRef<{ tipo: 'mover' | 'esquina'; dx: number; dy: number } | null>(null)
  const ANCHO = 860

  useEffect(() => {
    let vivo = true
    setBm(null); setM(null); setAviso('Cargando…')
    ;(async () => {
      const b = await cargarBitmap(j.id, kind)
      if (!vivo) return
      setBm(b)
      setM(lado?.esquinas ? marcoDesdeEsquinas(lado.esquinas) : { cx: b.width / 2, cy: b.height / 2, ancho: Math.min(b.width * 0.85, b.height * 0.85 * CEDULA.ratio), angulo: 0 })
      setAviso('')
    })().catch(() => setAviso('No se pudo leer la foto'))
    return () => { vivo = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.id, kind])

  const esc = bm ? Math.min(ANCHO, bm.width) / bm.width : 1
  const fino = m ? m.angulo - Math.round(m.angulo / (Math.PI / 2)) * (Math.PI / 2) : 0 // inclinación respecto al giro de 90° más cercano

  useEffect(() => {
    if (!bm || !m || !cv.current) return
    const c = cv.current
    c.width = Math.round(bm.width * esc); c.height = Math.round(bm.height * esc)
    const g = c.getContext('2d')!
    g.drawImage(bm, 0, 0, c.width, c.height)
    const q = esquinasDeMarco(m).map(([x, y]) => [x * esc, y * esc])
    g.save(); g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.rect(0, 0, c.width, c.height)
    q.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill('evenodd'); g.restore()
    g.strokeStyle = '#22c55e'; g.lineWidth = 2; g.beginPath(); q.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke()
    q.forEach(([x, y]) => { g.fillStyle = '#facc15'; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke() })
    if (vista.current) { const r = recortarMarco(bm, m, 360); vista.current.width = r.width; vista.current.height = r.height; vista.current.getContext('2d')!.drawImage(r, 0, 0) }
  }, [bm, m, esc])

  const zoom = useCallback((f: number) => setM((mm) => (mm ? { ...mm, ancho: Math.min(Math.max(mm.ancho * f, 80), (bm?.width ?? 4000) * 3) } : mm)), [bm])
  const rotar = useCallback((rad: number) => setM((mm) => (mm ? { ...mm, angulo: mm.angulo + rad } : mm)), [])

  // La rueda del mouse acerca/aleja el marco sin desplazar la página
  useEffect(() => {
    const c = cv.current
    if (!c) return
    const f = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.06 : 1 / 1.06) }
    c.addEventListener('wheel', f, { passive: false })
    return () => c.removeEventListener('wheel', f)
  }, [zoom, bm])

  const punto = (e: React.PointerEvent): [number, number] => { const r = cv.current!.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * cv.current!.width / esc, ((e.clientY - r.top) / r.height) * cv.current!.height / esc] }
  const abajo = (e: React.PointerEvent) => {
    if (!m) return
    const [x, y] = punto(e)
    const q = esquinasDeMarco(m)
    const cerca = q.some(([qx, qy]) => Math.hypot(qx - x, qy - y) * esc < 16)
    modo.current = cerca ? { tipo: 'esquina', dx: 0, dy: 0 } : { tipo: 'mover', dx: m.cx - x, dy: m.cy - y }
    cv.current!.setPointerCapture(e.pointerId)
  }
  const mover = (e: React.PointerEvent) => {
    if (!modo.current || !m) return
    const [x, y] = punto(e)
    if (modo.current.tipo === 'mover') setM({ ...m, cx: x + modo.current.dx, cy: y + modo.current.dy })
    else {
      const semidiag = Math.hypot(x - m.cx, y - m.cy)
      setM({ ...m, ancho: Math.max(80, (2 * semidiag) / Math.sqrt(1 + 1 / CEDULA.ratio ** 2)) })
    }
  }

  async function guardar(siguiente: boolean) {
    if (!bm || !m) return
    setAviso('Guardando…')
    try {
      await subir(j.id, kind, 'manual', 'Recortada a mano', recortarMarco(bm, m), esquinasDeMarco(m))
      setHechas((h) => h + 1)
      if (siguiente && i + 1 < cola.length) setI(i + 1)
      else alCerrar(true)
    } catch (e) { setAviso(e instanceof Error ? e.message : 'Error') }
  }
  async function buscar() {
    if (!bm) return
    setAviso('Buscando la cédula…')
    try {
      const d = detectarCedula(await cargarCV(), bm)
      if (d.esquinas) { const mm = marcoDesdeEsquinas(d.esquinas); mm.ancho *= 1.02; setM(mm) }
      setAviso(d.motivos.join(' · '))
    } catch { setAviso('No se pudo cargar el detector') }
  }
  const saltar = () => { if (i + 1 < cola.length) setI(i + 1); else alCerrar(hechas > 0) }

  // Atajos: Enter guarda y pasa a la siguiente, Esc cierra, flechas mueven, +/- zoom, [ ] inclinan
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); guardar(true) }
      else if (e.key === 'Escape') alCerrar(hechas > 0)
      else if (e.key === '+' || e.key === '=') zoom(1 / 1.04)
      else if (e.key === '-') zoom(1.04)
      else if (e.key === '[') rotar(-0.005)
      else if (e.key === ']') rotar(0.005)
      else if (e.key === 'ArrowRight') setM((mm) => mm && { ...mm, cx: mm.cx + 4 })
      else if (e.key === 'ArrowLeft') setM((mm) => mm && { ...mm, cx: mm.cx - 4 })
      else if (e.key === 'ArrowUp') { e.preventDefault(); setM((mm) => mm && { ...mm, cy: mm.cy - 4 }) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setM((mm) => mm && { ...mm, cy: mm.cy + 4 }) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  return (
    <div className="fixed inset-0 bg-black/85 z-50 overflow-auto p-3 flex justify-center">
      <div className="bg-slate-800 border border-slate-600 rounded-xl p-4 w-full max-w-[920px] h-fit">
        <div className="flex justify-between items-baseline gap-3 flex-wrap">
          <p className="font-semibold">{j.nombre} · {kind === 'cedula_front' ? 'Frente' : 'Reverso'} <span className="text-slate-400 font-normal text-sm">· {i + 1} de {cola.length}</span></p>
          <p className="text-slate-400 text-xs">Arrastra para mover · rueda del mouse = zoom · esquinas = tamaño · Enter = guardar y siguiente · Esc = cerrar</p>
        </div>
        <div className="flex gap-3 mt-2 flex-wrap md:flex-nowrap">
          <canvas ref={cv} className="w-full md:w-[600px] rounded touch-none cursor-move bg-slate-900" onPointerDown={abajo} onPointerMove={mover} onPointerUp={() => { modo.current = null }} />
          <div className="flex-1 min-w-[200px]">
            <p className="text-xs text-slate-400 mb-1">Así quedará</p>
            <canvas ref={vista} className="w-full rounded bg-white" style={{ aspectRatio: String(CEDULA.ratio) }} />
            <label className="block text-xs text-slate-400 mt-3">Inclinación fina: {(fino * 180 / Math.PI).toFixed(1)}°
              <input type="range" min={-45} max={45} step={0.1} className="w-full" value={(fino * 180) / Math.PI} onChange={(e) => setM((mm) => (mm ? { ...mm, angulo: Math.round(mm.angulo / (Math.PI / 2)) * (Math.PI / 2) + (Number(e.target.value) * Math.PI) / 180 } : mm))} />
            </label>
            <div className="flex gap-1 flex-wrap mt-2">
              <button className={mini} onClick={() => zoom(1 / 1.1)}>＋ Acercar</button><button className={mini} onClick={() => zoom(1.1)}>－ Alejar</button>
              <button className={mini} onClick={() => rotar(-Math.PI / 2)}>⟲ 90°</button><button className={mini} onClick={() => rotar(Math.PI / 2)}>⟳ 90°</button>
              <button className={mini} onClick={() => rotar(Math.PI)}>180°</button>
              <button className={mini} onClick={buscar} disabled={!bm}>🔍 Buscar sola</button>
            </div>
          </div>
        </div>
        {aviso && <p className="text-yellow-200 text-sm mt-2">{aviso}</p>}
        <div className="flex gap-2 mt-3 flex-wrap">
          <button className={btn} onClick={() => guardar(true)} disabled={!m}>Guardar y siguiente</button>
          <button className={btn2} onClick={saltar}>Saltar</button>
          <button className={btn2} onClick={() => alCerrar(hechas > 0)}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
