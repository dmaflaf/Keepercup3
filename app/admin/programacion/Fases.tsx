'use client'

import { useState } from 'react'
import { crucesPrimeroSegundo, repartir } from '@/lib/fases-prog'

export interface FaseInfo { id: string; nombre: string; tipo: string; fechas: number[]; pendientes: number; grupos: { nombre: string; tabla: string[] }[] }
type Post = (b: Record<string, unknown>) => Promise<Record<string, any>> // eslint-disable-line @typescript-eslint/no-explicit-any
interface Vista { ok: boolean; message?: string; aplicado?: boolean; errores: string[]; avisos: string[]; jugados: string[]; cuentas: Record<string, number>; resumen: { fase: string; tipo: string; nueva: boolean; grupos: { nombre: string; equipos: string[] }[]; fechas: number[]; partidos: number }[] }

const inp = 'px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm'
const btn = 'px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm'
const btn2 = 'px-3 py-1.5 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg text-xs'

const EJEMPLO = {
  fases: [
    {
      nombre: 'Copa Oro', tipo: 'grupos',
      grupos: [{ nombre: 'Oro A', equipos: ['Club 1', 'Club 2', 'Club 3', 'Club 4'] }],
      partidos: [
        { fecha: 8, grupo: 'Oro A', local: 'Club 1', visitante: 'Club 2', dia: '2026-11-13', hora: '19:00', estadio: 'San Miguel' },
        { fecha: 8, grupo: 'Oro A', local: 'Club 3', visitante: 'Club 4', dia: '2026-11-14', hora: '17:00', estadio: 'Los Sauces' },
      ],
    },
    { nombre: 'Copa Oro · Cuartos', tipo: 'eliminatoria', partidos: [{ fecha: 11, etiqueta: 'Cuartos de final', local: 'Club 1', visitante: 'Club 5' }] },
  ],
}

function Revision({ v }: { v: Vista }) {
  const c = v.cuentas || {}
  return (
    <div className="mt-4 text-sm space-y-2">
      {v.resumen?.map((f) => (
        <div key={f.fase} className="bg-slate-900/60 rounded-lg p-3">
          <b>{f.fase}</b> <span className="text-slate-400">· {f.tipo === 'grupos' ? 'por grupos' : 'eliminatoria'} · {f.nueva ? 'fase nueva' : 'ya existe (se completa)'} · {f.partidos} partidos{f.fechas.length ? ` · Fecha${f.fechas.length > 1 ? 's' : ''} ${f.fechas.join(', ')}` : ''}</span>
          {f.grupos.length > 0 && <div className="grid sm:grid-cols-2 gap-x-4 mt-1">{f.grupos.map((g) => <p key={g.nombre} className="text-xs"><b className="text-yellow-300">{g.nombre}:</b> {g.equipos.join(', ') || '—'}</p>)}</div>}
        </div>))}
      <p className="text-slate-300">Se crearán <b>{c.fases || 0}</b> fase(s), <b>{c.grupos || 0}</b> grupo(s) y <b>{c.crear || 0}</b> partido(s). Se actualizarán <b>{c.actualizar || 0}</b>. Sin cambios: {c.sinCambio || 0}.{c.jugados ? ` Ya jugados (no se tocan): ${c.jugados}.` : ''}</p>
      {v.errores?.length > 0 && <div className="bg-red-900/40 border border-red-700 rounded-lg p-3"><b>⛔ Hay que corregir:</b>{v.errores.slice(0, 40).map((t) => <p key={t} className="text-red-200 text-xs mt-1">• {t}</p>)}</div>}
      {v.avisos?.length > 0 && <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3"><b>⚠ Revisa:</b>{v.avisos.slice(0, 40).map((t) => <p key={t} className="text-yellow-200 text-xs mt-1">• {t}</p>)}</div>}
      <p className="text-xs text-slate-400">No se toca ningún partido jugado, ni resultados, tarjetas o tablas de la Fase 1.</p>
    </div>
  )
}

function Marco({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-auto" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-600 rounded-xl p-5 w-full max-w-2xl mt-8" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-1">{titulo}</h2>
        {children}
      </div>
    </div>
  )
}

/** Revisar → Aplicar, compartido por «Subir JSON» y «Adicionar fase». */
function useCarga(post: Post, tid: string, onDone: () => void) {
  const [vista, setVista] = useState<Vista | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [hecho, setHecho] = useState('')
  async function revisar(datos: unknown) {
    setOcupado(true); setHecho('')
    const r = await post({ accion: 'fases_vista', torneoId: tid, datos })
    setOcupado(false)
    if (!r.resumen) { alert(r.message || 'No se pudo revisar'); setVista(null); return }
    setVista(r as Vista)
  }
  async function aplicar(datos: unknown) {
    if (!confirm('¿Cargar esto en el torneo? Podrás deshacerlo con «Deshacer última carga» mientras no se jueguen esos partidos.')) return
    setOcupado(true)
    const r = await post({ accion: 'fases_aplicar', torneoId: tid, datos })
    setOcupado(false)
    if (r.resumen) setVista(r as Vista)
    if (!r.ok) { alert(r.message || 'No se pudo cargar'); return }
    setHecho(r.aplicado ? '✅ Cargado. Ya puedes programar o revisar las nuevas fechas.' : r.message || 'Nada nuevo')
    onDone()
  }
  return { vista, setVista, ocupado, hecho, revisar, aplicar }
}

export function SubirJson({ tid, post, onDone, onClose }: { tid: string; post: Post; onDone: () => void; onClose: () => void }) {
  const [texto, setTexto] = useState('')
  const [err, setErr] = useState('')
  const c = useCarga(post, tid, onDone)
  const datos = () => { try { setErr(''); return JSON.parse(texto) } catch { setErr('El texto no es un JSON válido. Revisa comas, comillas y llaves.'); return null } }
  return (
    <Marco titulo="📤 Subir JSON" onClose={onClose}>
      <p className="text-sm text-slate-400 mb-3">Carga fases, grupos y partidos (con día, hora y estadio si los trae). Si un partido ya existe se actualiza su horario; los jugados no se tocan. Primero se revisa, después se aplica.</p>
      <div className="flex flex-wrap gap-2 items-center mb-2">
        <input type="file" accept=".json,application/json" className="text-sm" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setTexto(await f.text()); c.setVista(null) } }} />
        <button className={btn2} onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(EJEMPLO, null, 2)], { type: 'application/json' })); a.download = 'ejemplo-fases.json'; a.click() }}>⬇ Descargar ejemplo</button>
      </div>
      <textarea className={inp + ' w-full h-48 font-mono text-xs'} placeholder='{ "fases": [ { "nombre": "Copa Oro", "tipo": "grupos", "grupos": [...], "partidos": [...] } ] }' value={texto} onChange={(e) => { setTexto(e.target.value); c.setVista(null) }} />
      <details className="text-xs text-slate-400 mt-1"><summary className="cursor-pointer">Formato del archivo</summary>
        <p className="mt-1">• <b>fases</b>: lista. Cada fase: <b>nombre</b>, <b>tipo</b> («grupos» o «eliminatoria»), <b>grupos</b> (nombre y equipos) y <b>partidos</b>.</p>
        <p>• Cada partido: <b>fecha</b> (número: 8, 9, 10… siguiendo a la Fase 1), <b>local</b>, <b>visitante</b>, y opcional <b>grupo</b>, <b>etiqueta</b> (ej. «Cuartos de final»), <b>dia</b> (AAAA-MM-DD), <b>hora</b> (19:00 o 19h00) y <b>estadio</b>.</p>
        <p>• Sin «partidos», con <b>&quot;generar&quot;: {`{ "primeraFecha": 8 }`}</b> se crean todos contra todos en cada grupo.</p>
        <p>• Los clubes se buscan por nombre (acepta «Sub 21» = «Sub21», «Libert» = «Libert S.C.»).</p></details>
      {err && <p className="text-red-300 text-sm mt-2">{err}</p>}
      {c.vista && <Revision v={c.vista} />}
      {c.hecho && <p className="text-green-300 text-sm mt-3">{c.hecho}</p>}
      <div className="flex gap-2 mt-4 flex-wrap">
        <button className={btn2 + ' !py-2'} disabled={!texto.trim() || c.ocupado} onClick={() => { const d = datos(); if (d) c.revisar(d) }}>🔍 Revisar</button>
        <button className={btn} disabled={!c.vista || c.vista.errores.length > 0 || c.ocupado || !!c.hecho} onClick={() => { const d = datos(); if (d) c.aplicar(d) }}>Aplicar</button>
        <button className={btn2 + ' !py-2'} onClick={onClose}>Cerrar</button>
        <Deshacer tid={tid} post={post} onDone={onDone} />
      </div>
    </Marco>
  )
}

function Deshacer({ tid, post, onDone }: { tid: string; post: Post; onDone: () => void }) {
  return <button className={btn2 + ' !py-2 ml-auto'} onClick={async () => {
    if (!confirm('¿Deshacer la última carga (JSON o fase adicionada)? Se borran los partidos que creó y vuelven los horarios anteriores.')) return
    const r = await post({ accion: 'fases_deshacer', torneoId: tid }); alert(r.message || (r.ok ? 'Listo' : 'No se pudo')); if (r.ok) onDone()
  }}>↩ Deshacer última carga</button>
}

const LETRAS = 'ABCDEFGHIJKLMNOP'
export function AdicionarFase({ tid, post, onDone, onClose, fases, clubes, siguiente }: { tid: string; post: Post; onDone: () => void; onClose: () => void; fases: FaseInfo[]; clubes: string[]; siguiente: number }) {
  const conGrupos = fases.filter((f) => f.tipo === 'grupos' && f.grupos.length)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<'grupos' | 'eliminatoria'>('grupos')
  const [primera, setPrimera] = useState(siguiente)
  const [idaVuelta, setIdaVuelta] = useState(false)
  const [etiqueta, setEtiqueta] = useState('Cuartos de final')
  const [grupos, setGrupos] = useState<{ nombre: string; equipos: string[] }[]>([])
  const [cruces, setCruces] = useState<[string, string][]>([['', ''], ['', ''], ['', ''], ['', '']])
  const [origen, setOrigen] = useState(conGrupos[0]?.id || '')
  const [desde, setDesde] = useState(1), [hasta, setHasta] = useState(4), [nGrupos, setNGrupos] = useState(4)
  const c = useCarga(post, tid, onDone)
  const fo = fases.find((f) => f.id === origen)
  const prefijo = (nombre.replace(/^copa\s+/i, '').trim() || 'Grupo')

  const datos = () => tipo === 'grupos'
    ? { fases: [{ nombre: nombre.trim(), tipo, grupos: grupos.map((g) => ({ nombre: g.nombre.trim(), equipos: g.equipos.filter(Boolean) })), generar: { primeraFecha: primera, idaYVuelta: idaVuelta } }] }
    : { fases: [{ nombre: nombre.trim(), tipo, partidos: cruces.filter(([a, b]) => a && b).map(([a, b]) => ({ fecha: primera, etiqueta: etiqueta.trim() || `Fecha ${primera}`, local: a, visitante: b })) }] }
  const listo = nombre.trim() && primera >= 1 && (tipo === 'grupos' ? grupos.length > 0 && grupos.every((g) => g.nombre.trim() && g.equipos.filter(Boolean).length >= 2) : cruces.some(([a, b]) => a && b))
  const nFechas = tipo === 'grupos' && grupos.length ? (Math.max(...grupos.map((g) => g.equipos.filter(Boolean).length)) - 1 + (Math.max(...grupos.map((g) => g.equipos.filter(Boolean).length)) % 2)) * (idaVuelta ? 2 : 1) : 1
  const Sel = ({ v, on }: { v: string; on: (x: string) => void }) => <select className={inp + ' w-full'} value={v} onChange={(e) => { on(e.target.value); c.setVista(null) }}><option value="">— club —</option>{clubes.map((n) => <option key={n}>{n}</option>)}</select>

  return (
    <Marco titulo="➕ Adicionar fase" onClose={onClose}>
      <p className="text-sm text-slate-400 mb-3">Crea una fase nueva (ej. Copa Oro, Copa Plata o sus cuartos de final). Sus fechas siguen la numeración del torneo: la Fase 1 usó hasta la Fecha {siguiente - 1}, así que la siguiente es la <b>Fecha {siguiente}</b>.</p>
      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        <label className="text-sm">Nombre<input className={inp + ' w-full mt-1'} placeholder="ej. Copa Oro" value={nombre} onChange={(e) => { setNombre(e.target.value); c.setVista(null) }} /></label>
        <label className="text-sm">Tipo<select className={inp + ' w-full mt-1'} value={tipo} onChange={(e) => { setTipo(e.target.value as 'grupos' | 'eliminatoria'); c.setVista(null) }}><option value="grupos">Grupos (todos contra todos)</option><option value="eliminatoria">Eliminatoria (cuartos, semis…)</option></select></label>
        <label className="text-sm">{tipo === 'grupos' ? 'Primera fecha' : 'Fecha N°'}<input type="number" min={1} className={inp + ' w-full mt-1'} value={primera} onChange={(e) => { setPrimera(Number(e.target.value)); c.setVista(null) }} /></label>
      </div>

      {tipo === 'grupos' ? (<>
        {conGrupos.length > 0 && (
          <div className="bg-slate-900/60 rounded-lg p-3 mb-3 text-sm">
            <b>Llenar con la tabla</b> <span className="text-slate-400 text-xs">(puestos de cada grupo; con 4 grupos y 4 puestos se cruzan como en el sorteo: cada grupo nuevo recibe un 1°, 2°, 3° y 4° de grupos distintos)</span>
            <div className="flex flex-wrap gap-2 items-end mt-2">
              <label className="text-xs">De la fase<select className={inp + ' block mt-1'} value={origen} onChange={(e) => setOrigen(e.target.value)}>{conGrupos.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></label>
              <label className="text-xs">Puestos del<input type="number" min={1} className={inp + ' block mt-1 w-20'} value={desde} onChange={(e) => setDesde(Number(e.target.value))} /></label>
              <label className="text-xs">al<input type="number" min={1} className={inp + ' block mt-1 w-20'} value={hasta} onChange={(e) => setHasta(Number(e.target.value))} /></label>
              <label className="text-xs">Grupos nuevos<input type="number" min={1} max={16} className={inp + ' block mt-1 w-20'} value={nGrupos} onChange={(e) => setNGrupos(Number(e.target.value))} /></label>
              <button className={btn2 + ' !py-2'} disabled={!fo || hasta < desde || nGrupos < 1} onClick={() => {
                const r = repartir(fo!.grupos.map((g) => g.tabla), desde, hasta, nGrupos)
                setGrupos(r.map((eq, i) => ({ nombre: `${prefijo} ${LETRAS[i]}`, equipos: eq }))); c.setVista(null)
              }}>Llenar</button>
            </div>
            {fo && fo.pendientes > 0 && <p className="text-yellow-300 text-xs mt-2">⚠ «{fo.nombre}» tiene {fo.pendientes} partido(s) sin terminar: la tabla aún no es definitiva.</p>}
          </div>)}
        {grupos.map((g, i) => (
          <div key={i} className="border-t border-slate-700 py-2">
            <div className="flex gap-2 items-center mb-1"><input className={inp + ' w-40'} value={g.nombre} onChange={(e) => { setGrupos(grupos.map((x, k) => (k === i ? { ...x, nombre: e.target.value } : x))); c.setVista(null) }} />
              <button className={btn2} onClick={() => setGrupos(grupos.map((x, k) => (k === i ? { ...x, equipos: [...x.equipos, ''] } : x)))}>＋ club</button>
              <button className={btn2 + ' ml-auto'} onClick={() => { setGrupos(grupos.filter((_, k) => k !== i)); c.setVista(null) }}>🗑 Quitar grupo</button></div>
            <div className="grid sm:grid-cols-2 gap-1">{g.equipos.map((t, j) => <div key={j} className="flex gap-1"><Sel v={t} on={(x) => setGrupos(grupos.map((y, k) => (k === i ? { ...y, equipos: y.equipos.map((z, m) => (m === j ? x : z)) } : y)))} /><button className={btn2} onClick={() => setGrupos(grupos.map((y, k) => (k === i ? { ...y, equipos: y.equipos.filter((_, m) => m !== j) } : y)))}>✕</button></div>)}</div>
          </div>))}
        <div className="flex gap-3 items-center flex-wrap mt-2 text-sm">
          <button className={btn2} onClick={() => setGrupos([...grupos, { nombre: `${prefijo} ${LETRAS[grupos.length] || grupos.length + 1}`, equipos: ['', '', '', ''] }])}>＋ Agregar grupo</button>
          <label className="flex items-center gap-1"><input type="checkbox" checked={idaVuelta} onChange={(e) => { setIdaVuelta(e.target.checked); c.setVista(null) }} /> Ida y vuelta</label>
          {grupos.length > 0 && <span className="text-slate-400 text-xs">Se generan todos contra todos: Fecha{nFechas > 1 ? `s ${primera} a ${primera + nFechas - 1}` : ` ${primera}`}, sin horario (los programas aquí o con «Subir JSON»).</span>}
        </div>
      </>) : (<>
        <label className="text-sm block mb-2">Nombre de la ronda<input className={inp + ' w-full mt-1'} value={etiqueta} onChange={(e) => { setEtiqueta(e.target.value); c.setVista(null) }} /></label>
        {conGrupos.length > 0 && (
          <div className="bg-slate-900/60 rounded-lg p-3 mb-3 text-sm flex flex-wrap gap-2 items-end">
            <label className="text-xs">Armar 1° vs 2° con la tabla de<select className={inp + ' block mt-1'} value={origen} onChange={(e) => setOrigen(e.target.value)}>{conGrupos.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></label>
            <button className={btn2 + ' !py-2'} disabled={!fo} onClick={() => { setCruces(crucesPrimeroSegundo(fo!.grupos.map((g) => g.tabla))); c.setVista(null) }}>Armar cruces (1A-2B, 1B-2A…)</button>
            {fo && fo.pendientes > 0 && <p className="text-yellow-300 text-xs w-full">⚠ «{fo.nombre}» tiene {fo.pendientes} partido(s) sin terminar: la tabla aún no es definitiva.</p>}
          </div>)}
        {cruces.map(([a, b], i) => (
          <div key={i} className="flex gap-2 items-center py-1"><span className="text-xs text-slate-400 w-6">{i + 1}.</span><Sel v={a} on={(x) => setCruces(cruces.map((y, k) => (k === i ? [x, y[1]] : y)))} /><span className="text-slate-400 text-sm">vs</span><Sel v={b} on={(x) => setCruces(cruces.map((y, k) => (k === i ? [y[0], x] : y)))} /><button className={btn2} onClick={() => setCruces(cruces.filter((_, k) => k !== i))}>✕</button></div>))}
        <button className={btn2 + ' mt-1'} onClick={() => setCruces([...cruces, ['', '']])}>＋ Agregar cruce</button>
      </>)}

      {c.vista && <Revision v={c.vista} />}
      {c.hecho && <p className="text-green-300 text-sm mt-3">{c.hecho}</p>}
      <div className="flex gap-2 mt-4 flex-wrap">
        <button className={btn2 + ' !py-2'} disabled={!listo || c.ocupado} onClick={() => c.revisar(datos())}>🔍 Revisar</button>
        <button className={btn} disabled={!c.vista || c.vista.errores.length > 0 || c.ocupado || !!c.hecho} onClick={() => c.aplicar(datos())}>Crear fase</button>
        <button className={btn2 + ' !py-2'} onClick={onClose}>Cerrar</button>
        <Deshacer tid={tid} post={post} onDone={onDone} />
      </div>
    </Marco>
  )
}
