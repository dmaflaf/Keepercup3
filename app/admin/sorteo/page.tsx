'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface Num { id: string; color: string; numero: number; origen: string; estado: string; codigoCobro: string | null; ganador: { nombres: string; correo: string; telefono: string | null } | null }
interface Premio { id: string; nombre: string; categoria: string; periodo: string; lugar: string; numeros: Num[] }
interface Cfg { coloresActivos: string[]; rangoMax: number; instagram: string; tiktok: string }

const inp = 'px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white'
const btn = 'px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold'
const pad = (n: number) => String(n).padStart(4, '0')

async function api(url: string, body?: unknown, method = 'POST') {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  return r.json().catch(() => ({ ok: false, message: 'Respuesta inválida' }))
}

export default function SorteoAdmin() {
  const [datos, setDatos] = useState<{ config: Cfg; premios: Premio[]; boletos: Record<string, number>; ganadores: number } | null>(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const cargar = useCallback(async () => {
    const r = await fetch('/api/admin/sorteo').then((x) => x.json()).catch(() => null)
    if (!r || !r.ok) setError(r?.message || 'No se pudo cargar (¿eres administrador?)')
    else { setDatos(r); setError('') }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  // ---- config
  const [ig, setIg] = useState('')
  const [tk, setTk] = useState('')
  useEffect(() => { if (datos) { setIg(datos.config.instagram); setTk(datos.config.tiktok) } }, [datos])
  const guardarCfg = async (c: Partial<Cfg>) => { const r = await api('/api/admin/sorteo/config', c); setMsg(r.ok ? 'Guardado' : r.message); cargar() }

  // ---- premio nuevo
  const [np, setNp] = useState({ nombre: '', categoria: 'semanal', periodo: '', lugar: '' })
  const crearPremio = async () => {
    const r = await api('/api/admin/sorteo/premios', np)
    setMsg(r.ok ? 'Premio creado' : r.message)
    if (r.ok) setNp({ ...np, nombre: '' })
    cargar()
  }

  // ---- números por premio
  const [carga, setCarga] = useState<Record<string, { color: string; numeros: string; azar: string }>>({})
  const cd = (id: string) => carga[id] || { color: datos?.config.coloresActivos[0] || 'negro', numeros: '', azar: '' }
  const setC = (id: string, v: Partial<{ color: string; numeros: string; azar: string }>) => setCarga({ ...carga, [id]: { ...cd(id), ...v } })
  const cargarNumeros = async (id: string) => {
    const c = cd(id)
    const r = await api('/api/admin/sorteo/numeros', { premioId: id, color: c.color, numeros: c.numeros, azar: c.azar ? Number(c.azar) : undefined })
    if (!r.ok) setMsg(r.message)
    else {
      let t = `Cargados: ${r.creados}.`
      if (r.repetidos.length) t += ` Ya existían: ${r.repetidos.join(', ')}.`
      if (r.yaRegistrados.length) t += ` ¡Ya estaban registrados y GANAN ahora!: ${r.yaRegistrados.map((y: any) => `${pad(y.numero)} (${y.nombres}, ${y.correo}, código ${y.codigoCobro})`).join('; ')}`
      setMsg(t)
      setC(id, { numeros: '', azar: '' })
    }
    cargar()
  }
  const quitar = async (id: string) => { const r = await api('/api/admin/sorteo/numeros?id=' + id, undefined, 'DELETE'); if (!r.ok) setMsg(r.message); cargar() }
  const borrarPremio = async (id: string) => { if (!confirm('¿Borrar este premio y sus números?')) return; const r = await api('/api/admin/sorteo/premios?id=' + id, undefined, 'DELETE'); if (!r.ok) setMsg(r.message); cargar() }

  // ---- cobrar
  const [codigo, setCodigo] = useState('')
  const [cobro, setCobro] = useState<any>(null)
  const [cobroErr, setCobroErr] = useState('')
  const buscar = async () => { const r = await api('/api/admin/sorteo/cobrar', { codigo }); setCobroErr(r.ok ? '' : r.message); setCobro(r.ok ? r.info : null) }
  const entregar = async () => { const r = await api('/api/admin/sorteo/cobrar', { codigo, confirmar: true }); setCobroErr(r.ok ? '' : r.message); if (r.ok) setCobro(r.info); cargar() }

  // ---- tómbola
  const [tp, setTp] = useState('')
  const [tc, setTc] = useState('')
  const [girando, setGirando] = useState(false)
  const [pantalla, setPantalla] = useState('----')
  const [ganador, setGanador] = useState<any>(null)
  const [tmsg, setTmsg] = useState('')
  const sortear = async () => {
    if (!tp) { setTmsg('Elige un premio'); return }
    setGirando(true); setGanador(null); setTmsg('')
    const r = await api('/api/admin/sorteo/tombola', { premioId: tp, color: tc || undefined })
    if (!r.ok) { setTmsg(r.message); setGirando(false); return }
    const muestra: string[] = r.muestra.length ? r.muestra : ['0000']
    const total = 55
    for (let i = 0; i < total; i++) {
      setPantalla(muestra[Math.floor(Math.random() * muestra.length)])
      await new Promise((ok) => setTimeout(ok, 40 + Math.pow(i / total, 3) * 380))
    }
    setPantalla(r.ganador.boleto); setGanador(r.ganador); setGirando(false); cargar()
  }

  if (error) return <div className="min-h-screen bg-slate-900 text-white p-10">{error} <Link href="/admin/dashboard" className="underline">Volver</Link></div>
  if (!datos) return <div className="min-h-screen bg-slate-900 text-white p-10">Cargando...</div>

  const sec = 'bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Volver al panel</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">🎟️ Sorteo</h1>
        <p className="text-slate-400 mb-4">
          Boletos registrados: {Object.entries(datos.boletos).map(([c, n]) => `${c}: ${n}`).join(' · ') || '0'} · Premios ganados: {datos.ganadores} ·{' '}
          <a className="underline" href="/api/admin/sorteo/export">Descargar boletos (Excel/CSV)</a>
        </p>
        {msg && <div className="bg-slate-700 border border-slate-500 rounded-lg p-3 mb-4 text-sm" onClick={() => setMsg('')}>{msg}</div>}

        <section className={sec}>
          <h2 className="text-xl font-bold mb-3">1. Configuración</h2>
          <div className="flex flex-wrap gap-4 items-center mb-3">
            <span className="text-slate-300 text-sm">Color de boleto que participa ahora:</span>
            {['negro', 'rojo'].map((c) => (
              <label key={c} className="flex items-center gap-2">
                <input type="checkbox" checked={datos.config.coloresActivos.includes(c)} onChange={(e) => {
                  const nuevo = e.target.checked ? [...datos.config.coloresActivos, c] : datos.config.coloresActivos.filter((x) => x !== c)
                  guardarCfg({ coloresActivos: nuevo })
                }} /> {c}
              </label>
            ))}
            <span className="text-slate-400 text-sm">Rango de números: 1 a {datos.config.rangoMax}</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <input className={inp} placeholder="https://instagram.com/..." value={ig} onChange={(e) => setIg(e.target.value)} />
            <input className={inp} placeholder="https://tiktok.com/@..." value={tk} onChange={(e) => setTk(e.target.value)} />
          </div>
          <button className={btn + ' mt-3'} onClick={() => guardarCfg({ instagram: ig, tiktok: tk })}>Guardar enlaces</button>
        </section>

        <section className={sec}>
          <h2 className="text-xl font-bold mb-3">2. Premios y números ganadores</h2>
          <div className="grid md:grid-cols-5 gap-2 mb-4">
            <input className={inp + ' md:col-span-2'} placeholder="Premio (ej. 3 órdenes en el bar)" value={np.nombre} onChange={(e) => setNp({ ...np, nombre: e.target.value })} />
            <select className={inp} value={np.categoria} onChange={(e) => setNp({ ...np, categoria: e.target.value })}>
              <option value="semanal">Semanal</option><option value="mensual">Mensual</option><option value="final">Final</option>
            </select>
            <input className={inp} placeholder="Semana 3 / Octubre" value={np.periodo} onChange={(e) => setNp({ ...np, periodo: e.target.value })} />
            <input className={inp} placeholder="Dónde se reclama" value={np.lugar} onChange={(e) => setNp({ ...np, lugar: e.target.value })} />
          </div>
          <button className={btn + ' mb-5'} onClick={crearPremio}>Crear premio</button>

          {datos.premios.map((p) => (
            <div key={p.id} className="border border-slate-600 rounded-lg p-4 mb-4">
              <div className="flex justify-between gap-2">
                <div><b>{p.nombre}</b> <span className="text-slate-400 text-sm">· {p.categoria} {p.periodo && `· ${p.periodo}`} · {p.lugar}</span></div>
                <button className="text-red-400 text-sm" onClick={() => borrarPremio(p.id)}>Borrar</button>
              </div>
              <div className="flex flex-wrap gap-2 my-3">
                {p.numeros.length === 0 && <span className="text-slate-500 text-sm">Sin números todavía (los premios de la final se sacan en la tómbola).</span>}
                {p.numeros.map((n) => (
                  <span key={n.id} className={`px-2 py-1 rounded text-sm border ${n.estado === 'pendiente' ? 'border-slate-500' : n.estado === 'ganado' ? 'border-yellow-400 text-yellow-300' : 'border-green-500 text-green-400'}`}
                    title={n.ganador ? `${n.ganador.nombres} · ${n.ganador.correo} · ${n.ganador.telefono || ''} · código ${n.codigoCobro}` : 'Esperando que se registre'}>
                    {n.color === 'rojo' ? '🔴' : '⚫'} {pad(n.numero)} {n.estado === 'ganado' && '· ganó'}{n.estado === 'entregado' && '· entregado'}
                    {n.estado === 'pendiente' && <button className="ml-2 text-red-400" onClick={() => quitar(n.id)}>×</button>}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 items-start">
                <select className={inp} value={cd(p.id).color} onChange={(e) => setC(p.id, { color: e.target.value })}><option value="negro">Negro</option><option value="rojo">Rojo</option></select>
                <input className={inp + ' flex-1 min-w-[200px]'} placeholder="Pega números: 1250, 33, 4021" value={cd(p.id).numeros} onChange={(e) => setC(p.id, { numeros: e.target.value, azar: '' })} />
                <span className="self-center text-slate-400 text-sm">o al azar:</span>
                <input className={inp + ' w-24'} type="number" placeholder="cantidad" value={cd(p.id).azar} onChange={(e) => setC(p.id, { azar: e.target.value, numeros: '' })} />
                <button className={btn} onClick={() => cargarNumeros(p.id)}>Cargar</button>
              </div>
            </div>
          ))}
        </section>

        <section className={sec}>
          <h2 className="text-xl font-bold mb-3">3. Cobrar un premio</h2>
          <p className="text-slate-400 text-sm mb-3">El ganador muestra su código y su boleto físico. Compara que el boleto (color y número) coincida y entrega el premio.</p>
          <div className="flex gap-2">
            <input className={inp + ' uppercase'} placeholder="Código de cobro" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            <button className={btn} onClick={buscar}>Buscar</button>
          </div>
          {cobroErr && <p className="text-red-400 mt-3">{cobroErr}</p>}
          {cobro && (
            <div className="mt-4 bg-slate-700/60 rounded-lg p-4">
              <p className="text-2xl font-bold">{cobro.boleto}</p>
              <p>{cobro.premio} <span className="text-slate-400">({cobro.categoria} {cobro.periodo})</span></p>
              <p className="text-slate-300 text-sm">{cobro.nombres} · {cobro.telefono || cobro.correo}</p>
              {cobro.estado === 'entregado' ? <p className="text-green-400 mt-2">✔ Entregado</p> : <button className={btn + ' mt-3'} onClick={entregar}>Marcar como ENTREGADO</button>}
            </div>
          )}
        </section>

        <section className={sec}>
          <h2 className="text-xl font-bold mb-3">4. Gran sorteo (tómbola en vivo)</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <select className={inp} value={tp} onChange={(e) => setTp(e.target.value)}>
              <option value="">— Premio —</option>
              {datos.premios.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.categoria})</option>)}
            </select>
            <select className={inp} value={tc} onChange={(e) => setTc(e.target.value)}>
              <option value="">Todos los colores</option><option value="negro">Solo negro</option><option value="rojo">Solo rojo</option>
            </select>
            <button className={btn} disabled={girando} onClick={sortear}>{girando ? 'Sorteando…' : 'SORTEAR'}</button>
          </div>
          <p className="text-slate-400 text-sm">Participan los boletos registrados que aún no han ganado. El ganador queda fuera de los siguientes sorteos.</p>
          <div className="my-5 border-2 border-yellow-500 rounded-2xl py-8 text-center bg-slate-900">
            <div className="text-6xl md:text-8xl font-black text-yellow-400 tracking-wider">{pantalla}</div>
            {ganador && (
              <div className="mt-4">
                <p className="text-2xl">🏆 {ganador.nombres}</p>
                <p className="text-slate-300">{ganador.premio} · código de cobro <b>{ganador.codigoCobro}</b></p>
                <p className="text-slate-400 text-sm">{ganador.telefono || ''} {ganador.correo}</p>
              </div>
            )}
            {tmsg && <p className="text-red-400 mt-3">{tmsg}</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
