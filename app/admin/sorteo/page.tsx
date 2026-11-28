'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface Num { id: string; color: string; numero: number; origen: string; estado: string; codigoCobro: string | null; ganador: { nombres: string; correo: string; telefono: string | null } | null }
interface Premio { id: string; nombre: string; categoria: string; periodo: string; lugar: string; numeros: Num[] }
interface Cfg { coloresActivos: string[]; rangoMax: number; desde: number; hasta: number; maxPorSemana: number; instagram: string; tiktok: string; rangos: Record<string, { desde: number; hasta: number }> }
interface ColorEst { color: string; activo: boolean; desde: number; hasta: number; enRango: number; total: number; premiosPendientes: number }
type Pest = 'boletos' | 'premios' | 'cobrar' | 'tombola' | 'ajustes'

const inp = 'px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white'
const btn = 'px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold'
const pad = (n: number) => String(n).padStart(4, '0')

async function api(url: string, body?: unknown, method = 'POST') {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  return r.json().catch(() => ({ ok: false, message: 'Respuesta inválida' }))
}

export default function SorteoAdmin() {
  const [datos, setDatos] = useState<{ config: Cfg; colores: ColorEst[]; premios: Premio[]; boletos: Record<string, number>; ganadores: number; bloqueos: { id: string; telefono: string; motivo: string }[]; clubes: { club: string; total: number }[] } | null>(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [pest, setPest] = useState<Pest>('boletos')

  const cargar = useCallback(async () => {
    const r = await fetch('/api/admin/sorteo').then((x) => x.json()).catch(() => null)
    if (!r || !r.ok) setError(r?.message || 'No se pudo cargar (¿eres administrador?)')
    else { setDatos(r); setError('') }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  // ---- config
  const [ig, setIg] = useState('')
  const [tk, setTk] = useState('')
  const [rg, setRg] = useState<Record<string, { desde: string; hasta: string }>>({})
  useEffect(() => { if (datos) { setIg(datos.config.instagram); setTk(datos.config.tiktok); setRg(Object.fromEntries(datos.colores.map((c) => [c.color, { desde: String(c.desde), hasta: String(c.hasta) }]))) } }, [datos])
  const activar = (color: string, on: boolean) => {
    const nuevo = on ? Array.from(new Set([...datos!.config.coloresActivos, color])) : datos!.config.coloresActivos.filter((x) => x !== color)
    if (!nuevo.length) { setMsg('Debe quedar al menos un color activo.'); return }
    if (!window.confirm(on ? `¿ACTIVAR los boletos ${color.toUpperCase()}? Desde ya se pueden registrar.` : `¿DESACTIVAR los boletos ${color.toUpperCase()}? Ya no se podrán registrar (los registrados siguen participando en la tómbola).`)) return
    guardarCfg({ coloresActivos: nuevo })
  }
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
      if (r.fueraDeSemana?.length) t += ` ⚠ Fuera del rango de esta semana (no podrán ganar hasta que cambies el rango): ${r.fueraDeSemana.join(', ')}.`
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
  const [chk, setChk] = useState([false, false, false])
  const [bloqTel, setBloqTel] = useState('')
  const buscar = async () => { setChk([false, false, false]); const r = await api('/api/admin/sorteo/cobrar', { codigo }); setCobroErr(r.ok ? '' : r.message); setCobro(r.ok ? r.info : null) }
  const entregar = async () => { const r = await api('/api/admin/sorteo/cobrar', { codigo, confirmar: true, verificado: true }); setCobroErr(r.ok ? '' : r.message); if (r.ok) setCobro(r.info); cargar() }

  const bloquear = async (tel: string) => {
    if (!confirm(`¿Bloquear el teléfono ${tel} durante todo el torneo y liberar sus números?`)) return
    const r = await api('/api/admin/sorteo/bloqueos', { telefono: tel, liberar: true })
    setMsg(r.ok ? `Bloqueado. Boletos suyos liberados: ${r.liberados}` : r.message)
    setCobro(null); cargar()
  }
  const [claveRein, setClaveRein] = useState('')
  const [reinicios, setReinicios] = useState<{ fecha: string; quien: string; boletos: number; premiosReiniciados: number; copia: string }[]>([])
  const cargarReinicios = useCallback(async () => { const r = await fetch('/api/admin/sorteo/reiniciar', { cache: 'no-store' }).then((x) => x.json()).catch(() => null); if (r?.ok) setReinicios(r.reinicios) }, [])
  useEffect(() => { cargarReinicios() }, [cargarReinicios])
  const reiniciar = async () => {
    if (!claveRein) { setMsg('Escribe tu contraseña de administrador para reiniciar.'); return }
    const total = Object.values(datos?.boletos || {}).reduce((a, n) => a + n, 0)
    const t = prompt(`Esto BORRA los ${total} boletos registrados, los bloqueos y los ganadores de la tómbola, y deja los premios como nuevos.\n\nAntes se guarda una copia de todo (descargable abajo).\n\nEscribe BORRAR para confirmar:`)
    if (t !== 'BORRAR') return
    const r = await api('/api/admin/sorteo/reiniciar', { confirmar: 'BORRAR', password: claveRein })
    setClaveRein('')
    setMsg(r.ok ? `Sorteo reiniciado. Boletos borrados: ${r.boletos} (quedó una copia). Premios devueltos a pendiente: ${r.premiosReiniciados}.` : r.message)
    cargar(); cargarReinicios()
  }
  const desbloquear = async (id: string) => { await api('/api/admin/sorteo/bloqueos?id=' + id, undefined, 'DELETE'); cargar() }

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
        <p className="text-slate-400 mb-4 text-sm">
          Registrados: {Object.entries(datos.boletos).map(([c, n]) => `${c} ${n}`).join(' · ') || '0'} · Premios ganados: {datos.ganadores} ·{' '}
          <Link className="underline text-yellow-300 font-semibold" href="/admin/sorteo/participantes">Ver participantes</Link> ·{' '}
          <a className="underline" href="/api/admin/sorteo/export">Descargar boletos (Excel/CSV)</a>
        </p>
        <nav className="flex flex-wrap gap-2 mb-5 sticky top-0 z-10 bg-slate-900/90 backdrop-blur py-2">
          {([['boletos', '🎟 Boletos activos'], ['premios', '🎁 Premios'], ['cobrar', '💵 Cobrar'], ['tombola', '🎰 Tómbola'], ['ajustes', '⚙ Ajustes']] as [Pest, string][]).map(([k, t]) => (
            <button key={k} onClick={() => setPest(k)} className={`px-4 py-2 rounded-lg font-semibold text-sm border ${pest === k ? 'bg-yellow-500 text-black border-yellow-400' : 'bg-slate-800 border-slate-600 hover:bg-slate-700'}`}>{t}</button>))}
        </nav>
        {msg && <div className="bg-slate-700 border border-slate-500 rounded-lg p-3 mb-4 text-sm" onClick={() => setMsg('')}>{msg}</div>}

        {pest === 'boletos' && <>
          <p className="text-slate-300 text-sm mb-4">Activa cada color y pon qué números participan. Puedes tener <b>los dos colores a la vez</b> (ej. se acaban los negros y empiezan los rojos el mismo fin de semana): cada uno con su propio rango. Solo se pueden registrar los colores activos y los números dentro de su rango; los premios al azar también salen de ese rango.</p>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            {datos.colores.map((c) => {
              const r = rg[c.color] || { desde: String(c.desde), hasta: String(c.hasta) }
              const pct = c.total ? Math.round((c.enRango / c.total) * 100) : 0
              const negro = c.color === 'negro'
              return (
                <div key={c.color} className={`rounded-2xl p-5 border-2 ${c.activo ? (negro ? 'border-slate-200 bg-slate-950' : 'border-red-500 bg-red-950/40') : 'border-slate-700 bg-slate-800/60 opacity-80'}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`w-8 h-8 rounded-full border-2 border-white/40 ${negro ? 'bg-black' : 'bg-red-600'}`} />
                    <h2 className="text-2xl font-black flex-1">Boletos {c.color.toUpperCase()}</h2>
                    <button onClick={() => activar(c.color, !c.activo)} className={`px-4 py-2 rounded-full text-sm font-black ${c.activo ? 'bg-green-500 text-black' : 'bg-slate-600 text-white'}`}>{c.activo ? '● ACTIVO' : '○ APAGADO'}</button>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs text-slate-400">Participan del<input type="number" min={1} max={datos.config.rangoMax} className={inp + ' block w-28 mt-1'} value={r.desde} onChange={(e) => setRg({ ...rg, [c.color]: { ...r, desde: e.target.value } })} /></label>
                    <label className="text-xs text-slate-400">al<input type="number" min={1} max={datos.config.rangoMax} className={inp + ' block w-28 mt-1'} value={r.hasta} onChange={(e) => setRg({ ...rg, [c.color]: { ...r, hasta: e.target.value } })} /></label>
                    <button className={btn} disabled={r.desde === String(c.desde) && r.hasta === String(c.hasta)} onClick={() => guardarCfg({ color: c.color, desde: Number(r.desde), hasta: Number(r.hasta) } as Partial<Cfg>)}>Guardar rango</button>
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-sm"><span>Registrados en este rango</span><b>{c.enRango} de {c.total} ({pct}%)</b></div>
                    <div className="h-2.5 bg-slate-700 rounded-full mt-1 overflow-hidden"><div className={`h-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-400' : 'bg-green-500'}`} style={{ width: `${pct}%` }} /></div>
                    {pct >= 90 && c.activo && <p className="text-xs text-yellow-300 mt-1">⚠ Este rango casi se llenó: amplíalo o activa el otro color.</p>}
                    <p className="text-sm text-slate-400 mt-2">Premios instantáneos por salir en {c.color}: <b className="text-slate-200">{c.premiosPendientes}</b></p>
                  </div>
                </div>)
            })}
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-sm text-slate-300">
            <b>Ejemplo de mix:</b> se acaban los negros y el mismo fin de semana empiezan los rojos → deja <b>NEGRO activo</b> con el rango que queda (ej. 5201 al 6000) y <b>activa ROJO</b> del 1 al 800. Ambos se pueden registrar. Cuando ya no circulen negros, apaga NEGRO.
            <p className="mt-2 text-slate-400">Boletos impresos de cada color: 1 a {datos.config.rangoMax}. Tope por teléfono: {datos.config.maxPorSemana} por semana (en ⚙ Ajustes).</p>
          </div>
        </>}

        {pest === 'premios' && <>
        <section className={sec}>
          <h2 className="text-xl font-bold mb-3">🎁 Premios y números ganadores</h2>
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
        </>}
        {pest === 'cobrar' && <>
        <section className={sec}>
          <h2 className="text-xl font-bold mb-3">💵 Cobrar un premio</h2>
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
              {cobro.estado === 'entregado' ? <p className="text-green-400 mt-2">✔ Entregado</p> : (
                <div className="mt-3 space-y-2">
                  {[`Tiene el BOLETO FÍSICO y coincide: ${cobro.boleto}`, 'Muestra el CÓDIGO (celular o comprobante)', `Es el TELÉFONO de registro (termina en ${String(cobro.telefono || '').slice(-4) || '----'})`].map((t, i) => (
                    <label key={i} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={chk[i]} onChange={(e) => setChk(chk.map((v, j) => (j === i ? e.target.checked : v)))} /> {t}</label>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button className={btn} disabled={!chk.every(Boolean)} onClick={entregar}>Marcar como ENTREGADO</button>
                    {cobro.telefono && <button className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg" onClick={() => bloquear(cobro.telefono)}>No coincide: bloquear</button>}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
        </>}
        {pest === 'tombola' && <>
        <section className={sec}>
          <h2 className="text-xl font-bold mb-3">🎰 Gran sorteo (tómbola en vivo)</h2>
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
        </>}
        {pest === 'ajustes' && <>
        <section className={sec}>
          <h2 className="text-xl font-bold mb-3">⚙ Ajustes del sorteo</h2>
          <label className="text-sm text-slate-300 flex items-center gap-2 mb-4">Boletos por semana y teléfono:
            <input type="number" min={1} className={inp + ' w-20'} defaultValue={datos.config.maxPorSemana} onBlur={(e) => guardarCfg({ maxPorSemana: Number(e.target.value) })} />
          </label>
          <p className="text-sm text-slate-300 mb-2">Redes que deben seguir para participar:</p>
          <div className="grid md:grid-cols-2 gap-3">
            <input className={inp} placeholder="https://instagram.com/..." value={ig} onChange={(e) => setIg(e.target.value)} />
            <input className={inp} placeholder="https://tiktok.com/@..." value={tk} onChange={(e) => setTk(e.target.value)} />
          </div>
          <button className={btn + ' mt-3'} onClick={() => guardarCfg({ instagram: ig, tiktok: tk })}>Guardar enlaces</button>
          {datos.clubes.length > 0 && <p className="text-slate-400 text-sm mt-4">Club que apoyan: {datos.clubes.slice(0, 8).map((c) => `${c.club} (${c.total})`).join(' · ')}</p>}
        </section>
        <section className={sec}>
          <h2 className="text-xl font-bold mb-3">Teléfonos bloqueados</h2>
          <div className="flex gap-2 mb-3">
            <input className={inp} placeholder="09XXXXXXXX" value={bloqTel} onChange={(e) => setBloqTel(e.target.value)} />
            <button className={btn} onClick={() => { bloquear(bloqTel); setBloqTel('') }}>Bloquear y liberar sus números</button>
          </div>
          {datos.bloqueos.length === 0 ? <p className="text-slate-500 text-sm">Ninguno.</p> : datos.bloqueos.map((x) => (
            <div key={x.id} className="flex justify-between text-sm py-1 border-b border-slate-700"><span>{x.telefono} · {x.motivo}</span><button className="text-green-400" onClick={() => desbloquear(x.id)}>Desbloquear</button></div>
          ))}
        </section>
        <section className={sec + ' border-red-900'}>
          <h2 className="text-xl font-bold mb-2">Reiniciar después de las pruebas</h2>
          <p className="text-slate-400 text-sm mb-3">Borra TODOS los boletos registrados y deja los premios como nuevos. Solo para después de las pruebas, antes de dar el QR al público. <b className="text-red-300">Con el sorteo en marcha, NO lo uses.</b> Pide tu contraseña y guarda antes una copia de lo que borra.</p>
          <div className="flex flex-wrap gap-2 items-center">
            <input type="password" autoComplete="current-password" className={inp + ' w-56'} placeholder="Tu contraseña de admin" value={claveRein} onChange={(e) => setClaveRein(e.target.value)} />
            <button className="px-4 py-2 bg-slate-600 hover:bg-red-700 rounded-lg disabled:opacity-40" disabled={!claveRein} onClick={reiniciar}>Reiniciar sorteo…</button>
          </div>
          <div className="mt-4">
            <p className="text-sm font-semibold mb-1">Historial de reinicios</p>
            {!reinicios.length && <p className="text-slate-500 text-sm">Sin reinicios registrados (el historial empezó a guardarse con esta versión).</p>}
            {reinicios.map((x) => (
              <div key={x.copia} className="flex flex-wrap gap-2 text-sm py-1 border-t border-slate-700">
                <span>{new Date(x.fecha).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'medium', timeStyle: 'short' })} · {x.quien} · borró {x.boletos} boleto(s)</span>
                <a className="underline text-yellow-300 ml-auto" href={`/api/admin/sorteo/reiniciar?copia=${encodeURIComponent(x.copia)}`}>Descargar copia (CSV)</a>
              </div>))}
          </div>
        </section>
        </>}
      </div>
    </div>
  )
}
