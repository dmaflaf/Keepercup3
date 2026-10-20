'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { avisosPara, balance, ConfigProg, CONFIG_DEFECTO, diaSemana, diasDeJornada, DIAS, DIA3, etiquetaSlot, fechaLarga, horaValida, PartidoProg } from '@/lib/programacion'

interface Grupo { id: string; nombre: string; equipos: { id: string; nombre: string }[] }
const COL = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6']
const inp = 'px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm'
const btn = 'px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm'
const btn2 = 'px-3 py-1.5 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg text-xs'

export default function Programacion() {
  const [torneos, setTorneos] = useState<{ id: string; nombre: string }[]>([])
  const [tid, setTid] = useState('')
  const [partidos, setPartidos] = useState<PartidoProg[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [cfg, setCfg] = useState<ConfigProg>(CONFIG_DEFECTO)
  const [cerradas, setCerradas] = useState<number[]>([])
  const [jornada, setJornada] = useState(1)
  const [filtro, setFiltro] = useState('')
  const [vista, setVista] = useState<'grilla' | 'balance'>('grilla')
  const [msg, setMsg] = useState('Cargando…')
  const [casilla, setCasilla] = useState<{ fecha: string; hora: string; estadio: string } | null>(null)
  const [prog, setProg] = useState<PartidoProg | null>(null)
  const [pe, setPe] = useState({ estadio: '', fecha: '', hora: '' })
  const [editCfg, setEditCfg] = useState<{ estadios: string; inicio: string; v: string; s: string; d: string } | null>(null)

  const cargar = useCallback(async (id?: string) => {
    const r = await fetch('/api/admin/programacion' + (id ? `?torneoId=${id}` : ''), { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setMsg(r?.message || 'No se pudo cargar (¿eres administrador?)'); return }
    setTorneos(r.torneos); setPartidos(r.partidos); setGrupos(r.grupos); setCfg(r.config); setCerradas(r.cerradas || []); setTid(r.torneoId || '')
    setMsg(r.partidos.length ? '' : 'Este torneo todavía no tiene partidos.')
    if (r.partidos.length) setJornada((j) => (r.partidos.some((p: PartidoProg) => p.jornadaNum === j) ? j : r.partidos[0].jornadaNum))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const post = (b: Record<string, unknown>) => fetch('/api/admin/programacion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Error de conexión' }))
  const jornadas = useMemo(() => Array.from(new Set(partidos.map((p) => p.jornadaNum))).sort((a, b) => a - b), [partidos])
  const colorDe = (g: string | null) => COL[Math.max(0, grupos.findIndex((x) => x.nombre === g)) % COL.length]
  const cerrada = cerradas.includes(jornada)
  const delaJ = partidos.filter((p) => p.jornadaNum === jornada && (!filtro || p.grupo === filtro))
  const pendientes = delaJ.filter((p) => !p.fecha || !p.hora || !p.escenario)
  const dias = useMemo(() => Array.from(new Set([...diasDeJornada(cfg, jornada), ...partidos.filter((p) => p.jornadaNum === jornada && p.fecha).map((p) => p.fecha as string)])).sort(), [cfg, jornada, partidos])

  async function asignar(p: PartidoProg, fecha: string, hora: string, escenario: string) {
    const r = await post({ accion: 'asignar', partidoId: p.id, fecha, hora, escenario })
    if (!r.ok) { alert(r.message); return }
    setCasilla(null); setProg(null); cargar(tid)
  }
  async function liberar(p: PartidoProg) { const r = await post({ accion: 'liberar', partidoId: p.id }); if (!r.ok) alert(r.message); setCasilla(null); cargar(tid) }
  async function cerrarFecha(c: boolean) { await post({ accion: 'cerrar', torneoId: tid, jornada, cerrada: c }); cargar(tid) }

  const celda = (est: string, fecha: string, hora: string) => {
    const p = partidos.find((x) => x.jornadaNum === jornada && x.escenario === est && x.fecha === fecha && x.hora === hora && (!filtro || x.grupo === filtro))
    const base = 'w-full min-h-[3.2rem] rounded-lg text-left px-2 py-1 text-xs'
    if (!p) return <button className={`${base} border border-dashed border-slate-600 text-slate-400 hover:border-yellow-400 disabled:opacity-40`} disabled={cerrada} onClick={() => setCasilla({ fecha, hora, estadio: est })}>+ libre</button>
    return (
      <button className={`${base} bg-slate-700 hover:bg-slate-600 disabled:opacity-80`} disabled={cerrada || p.estado === 'finalizado'} onClick={() => setCasilla({ fecha, hora, estadio: est })}>
        <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: colorDe(p.grupo) }} /><b>{p.local}</b><br />vs {p.visitante}
        {p.estado === 'finalizado' && <b className="text-yellow-300"> · {p.golesLocal}-{p.golesVisitante}</b>}
      </button>
    )
  }

  const opcionesCasilla = casilla ? pendientes.filter((p) => p.estado !== 'finalizado') : []
  const ocupante = casilla ? partidos.find((x) => x.jornadaNum === jornada && x.escenario === casilla.estadio && x.fecha === casilla.fecha && x.hora === casilla.hora) : null

  const Avisos = ({ p, fecha, hora, est }: { p: PartidoProg; fecha: string; hora: string; est: string }) => {
    if (!fecha || !horaValida(hora) || !est) return null
    const a = avisosPara(p, fecha, hora, est, partidos, cfg.estadios)
    return (
      <div className="text-xs mt-1 space-y-0.5">
        {a.choque.map((t) => <p key={t} className="text-red-300">⛔ {t}</p>)}
        {a.repite.map((t) => <p key={t} className="text-yellow-300">⚠ {t}</p>)}
        <p className="text-slate-400">{a.estadios.map((e) => `${e.equipo}: ${e.sm}× aquí, ${e.otro}× en el otro`).join(' · ')}</p>
      </div>
    )
  }

  function poster() {
    const W = 1080, filas: { dia: string; items: { h: string; est: string; t: string }[] }[] = dias.map((d) => ({ dia: fechaLarga(d), items: partidos.filter((p) => p.jornadaNum === jornada && p.fecha === d && p.hora && p.escenario).sort((a, b) => (a.hora as string).localeCompare(b.hora as string) || (a.escenario as string).localeCompare(b.escenario as string)).map((p) => ({ h: p.hora as string, est: p.escenario as string, t: `${p.local}  vs  ${p.visitante}` })) })).filter((f) => f.items.length)
    const alto = 200 + filas.reduce((n, f) => n + 70 + f.items.length * 64, 0) + 80
    const c = document.createElement('canvas'); c.width = W; c.height = alto
    const g = c.getContext('2d')!
    g.fillStyle = '#0b1226'; g.fillRect(0, 0, W, alto)
    g.fillStyle = '#f2b705'; g.font = '800 64px system-ui, sans-serif'; g.fillText('KEEPER CUP 3', 60, 100)
    g.fillStyle = '#ffffff'; g.font = '700 40px system-ui, sans-serif'; g.fillText(`Fecha ${jornada} · programación`, 60, 160)
    let y = 220
    for (const f of filas) {
      g.fillStyle = '#16223f'; g.fillRect(40, y, W - 80, 56); g.fillStyle = '#f2b705'; g.font = '700 30px system-ui, sans-serif'; g.fillText(f.dia, 60, y + 38); y += 70
      for (const it of f.items) {
        g.fillStyle = '#ffffff'; g.font = '700 30px system-ui, sans-serif'; g.fillText(it.h, 60, y + 36)
        g.font = '600 30px system-ui, sans-serif'; g.fillText(it.t.length > 34 ? it.t.slice(0, 33) + '…' : it.t, 190, y + 36)
        g.fillStyle = '#93a4b8'; g.font = '500 26px system-ui, sans-serif'; g.textAlign = 'right'; g.fillText(it.est, W - 60, y + 36); g.textAlign = 'left'
        g.strokeStyle = '#26304d'; g.beginPath(); g.moveTo(60, y + 54); g.lineTo(W - 60, y + 54); g.stroke(); y += 64
      }
      y += 6
    }
    g.fillStyle = '#5b6478'; g.font = '500 22px system-ui, sans-serif'; g.fillText('keeper.com.ec', 60, alto - 36)
    c.toBlob((b) => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `horario-fecha-${jornada}.png`; a.click() }, 'image/png')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-5 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">🗓️ Programación de partidos</h1>
        <p className="text-slate-400 mb-4">Toca una casilla libre para asignarle un partido, o «Programar» en un partido pendiente. Avisa si un equipo ya juega a esa hora o repite día y horario.</p>
        {msg && <p className="text-slate-300 mb-4">{msg}</p>}
        {torneos.length > 1 && <select className={inp + ' mb-3'} value={tid} onChange={(e) => cargar(e.target.value)}>{torneos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select>}
        {!!partidos.length && (<>
          <div className="flex flex-wrap gap-2 mb-3">{jornadas.map((j) => <button key={j} className={`px-3 py-1.5 rounded-lg text-sm ${jornada === j ? 'bg-yellow-500 text-black font-semibold' : 'bg-slate-700'}`} onClick={() => setJornada(j)}>Fecha {j}{cerradas.includes(j) ? ' 🔒' : ''}</button>)}</div>
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            <button className={`px-3 py-1.5 rounded-lg text-sm ${!filtro ? 'bg-slate-500' : 'bg-slate-700'}`} onClick={() => setFiltro('')}>Todos los grupos</button>
            {grupos.map((g) => <button key={g.id} className={`px-3 py-1.5 rounded-lg text-sm ${filtro === g.nombre ? 'bg-slate-500' : 'bg-slate-700'}`} onClick={() => setFiltro(g.nombre)}><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: colorDe(g.nombre) }} />{g.nombre}</button>)}
            <span className="ml-auto flex gap-2 flex-wrap">
              <button className={btn2} onClick={() => setVista(vista === 'grilla' ? 'balance' : 'grilla')}>{vista === 'grilla' ? '⚖️ Ver balance' : '🗓️ Ver casillas'}</button>
              <button className={btn2} onClick={poster}>🖼 Imagen del horario</button>
              <button className={btn2} onClick={() => setEditCfg({ estadios: cfg.estadios.join(', '), inicio: cfg.inicio, v: (cfg.horarios['5'] || []).join(', '), s: (cfg.horarios['6'] || []).join(', '), d: (cfg.horarios['0'] || []).join(', ') })}>⚙️ Estadios y horas</button>
            </span>
          </div>

          {vista === 'grilla' && (<>
            <div className={`rounded-xl p-3 mb-4 text-sm flex items-center gap-3 flex-wrap ${cerrada ? 'bg-yellow-900/30 border border-yellow-600' : 'bg-slate-800 border border-slate-700'}`}>
              {cerrada ? <><b>🔒 Fecha {jornada} cerrada</b><span className="text-slate-300">No se puede modificar hasta que la edites.</span><button className={btn2} onClick={() => cerrarFecha(false)}>✏️ Editar fecha</button></> : <><b>{pendientes.length} por programar</b> · {delaJ.length - pendientes.length} de {delaJ.length} ya tienen horario<button className={btn2 + ' ml-auto'} onClick={() => cerrarFecha(true)}>🔒 Cerrar fecha</button></>}
            </div>
            {!cerrada && pendientes.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 mb-4">
                {pendientes.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 py-1.5 text-sm border-t first:border-t-0 border-slate-700">
                    <span><span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: colorDe(p.grupo) }} />{p.local} <span className="text-slate-400">vs</span> {p.visitante}</span>
                    <button className={btn2} onClick={() => { setProg(p); setPe({ estadio: cfg.estadios[0], fecha: dias[0], hora: '' }) }}>Programar</button>
                  </div>))}
              </div>
            )}
            {dias.map((d) => {
              const usados = partidos.filter((p) => p.jornadaNum === jornada && p.fecha === d && p.hora).map((p) => p.hora as string)
              const horas = Array.from(new Set([...(cfg.horarios[String(diaSemana(d))] || []), ...usados])).sort()
              if (!horas.length) return null
              return (
                <div key={d} className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
                  <h3 className="font-bold mb-2">{fechaLarga(d)}</h3>
                  <div className="grid gap-2" style={{ gridTemplateColumns: `70px repeat(${cfg.estadios.length}, minmax(0, 1fr))` }}>
                    <span />{cfg.estadios.map((e) => <span key={e} className="text-xs text-slate-400 font-semibold">{e}</span>)}
                    {horas.map((h) => (<div key={h} className="contents"><span className="text-sm font-bold pt-3">{h}</span>{cfg.estadios.map((e) => <div key={e}>{celda(e, d, h)}</div>)}</div>))}
                  </div>
                </div>)
            })}
          </>)}

          {vista === 'balance' && grupos.filter((g) => !filtro || g.nombre === filtro).map((g) => {
            const filas = balance(partidos, g.equipos, cfg.estadios)
            return (
              <div key={g.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
                <h3 className="font-bold mb-2"><span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: colorDe(g.nombre) }} />{g.nombre}</h3>
                <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-400"><tr><th className="py-1">Equipo</th>{cfg.estadios.map((e) => <th key={e} className="text-center">{e}</th>)}<th className="text-center">Vie</th><th className="text-center">Sáb</th><th className="text-center">Dom</th><th>Horarios jugados</th></tr></thead>
                  <tbody>{filas.map((f) => (
                    <tr key={f.id} className="border-t border-slate-700"><td className="py-2">{f.nombre}</td>{cfg.estadios.map((e) => <td key={e} className="text-center">{f.porEstadio[e]}</td>)}<td className="text-center">{f.dias.Vie}</td><td className="text-center">{f.dias['Sáb']}</td><td className="text-center">{f.dias.Dom}</td>
                      <td>{Object.entries(f.slots).sort().map(([l, n]) => <span key={l} className={`inline-block text-xs rounded px-1.5 py-0.5 mr-1 mb-1 ${n > 1 ? 'bg-yellow-700' : 'bg-slate-700'}`}>{l}{n > 1 ? ` ×${n}` : ''}</span>)}</td></tr>))}</tbody></table></div>
              </div>)
          })}
        </>)}

        {casilla && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-auto" onClick={() => setCasilla(null)}>
            <div className="bg-slate-800 border border-slate-600 rounded-xl p-5 w-full max-w-lg mt-8" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold">{casilla.estadio} · {DIA3[diaSemana(casilla.fecha)]} {casilla.fecha.slice(8)} · {casilla.hora}</h2>
              {ocupante && <div className="my-3 p-3 bg-slate-700 rounded-lg text-sm">Ahora: <b>{ocupante.local} vs {ocupante.visitante}</b> <button className={btn2 + ' ml-2'} onClick={() => liberar(ocupante)}>Dejar sin horario</button></div>}
              <p className="text-sm text-slate-300 my-2">{ocupante ? 'O elige otro partido para esta casilla (el actual queda sin horario):' : 'Elige el partido:'}</p>
              {opcionesCasilla.filter((p) => p.id !== ocupante?.id).map((p) => {
                const a = avisosPara(p, casilla.fecha, casilla.hora, casilla.estadio, partidos, cfg.estadios)
                return (
                  <div key={p.id} className="border-t border-slate-700 py-2">
                    <button className="w-full text-left disabled:opacity-40" disabled={a.choque.length > 0} onClick={() => asignar(p, casilla.fecha, casilla.hora, casilla.estadio)}>
                      <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: colorDe(p.grupo) }} /><b>{p.local}</b> vs <b>{p.visitante}</b></button>
                    <Avisos p={p} fecha={casilla.fecha} hora={casilla.hora} est={casilla.estadio} />
                  </div>)
              })}
              {!opcionesCasilla.filter((p) => p.id !== ocupante?.id).length && <p className="text-slate-400 text-sm">No quedan partidos por programar en esta fecha.</p>}
              <button className={btn2 + ' !py-2 mt-3'} onClick={() => setCasilla(null)}>Cerrar</button>
            </div>
          </div>
        )}

        {prog && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-auto" onClick={() => setProg(null)}>
            <div className="bg-slate-800 border border-slate-600 rounded-xl p-5 w-full max-w-lg mt-8" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-3">Programar: {prog.local} vs {prog.visitante}</h2>
              <label className="block text-sm mb-3">Estadio<select className={inp + ' w-full mt-1'} value={pe.estadio} onChange={(e) => setPe({ ...pe, estadio: e.target.value })}>{cfg.estadios.map((s) => <option key={s}>{s}</option>)}</select></label>
              <label className="block text-sm mb-3">Día<select className={inp + ' w-full mt-1'} value={pe.fecha} onChange={(e) => setPe({ ...pe, fecha: e.target.value, hora: '' })}>{dias.map((d) => <option key={d} value={d}>{fechaLarga(d)}</option>)}</select></label>
              <label className="block text-sm mb-1">Hora (HH:MM)<input className={inp + ' w-full mt-1'} placeholder="ej. 14:00" value={pe.hora} onChange={(e) => setPe({ ...pe, hora: e.target.value })} /></label>
              <div className="flex gap-1 flex-wrap mb-2">{(cfg.horarios[String(diaSemana(pe.fecha))] || []).map((h) => <button key={h} className={btn2} onClick={() => setPe({ ...pe, hora: h })}>{h}</button>)}</div>
              <Avisos p={prog} fecha={pe.fecha} hora={pe.hora} est={pe.estadio} />
              <div className="flex gap-2 mt-4"><button className={btn} disabled={!horaValida(pe.hora)} onClick={() => asignar(prog, pe.fecha, pe.hora, pe.estadio)}>Programar</button><button className={btn2 + ' !py-2'} onClick={() => setProg(null)}>Cancelar</button></div>
            </div>
          </div>
        )}

        {editCfg && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-auto" onClick={() => setEditCfg(null)}>
            <div className="bg-slate-800 border border-slate-600 rounded-xl p-5 w-full max-w-lg mt-8" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-3">Estadios y horas de cada día</h2>
              <label className="block text-sm mb-3">Estadios (separados por coma)<input className={inp + ' w-full mt-1'} value={editCfg.estadios} onChange={(e) => setEditCfg({ ...editCfg, estadios: e.target.value })} /></label>
              <label className="block text-sm mb-3">Viernes de la Fecha 1<input type="date" className={inp + ' w-full mt-1'} value={editCfg.inicio} onChange={(e) => setEditCfg({ ...editCfg, inicio: e.target.value })} /></label>
              {([['v', 'Horas del viernes'], ['s', 'Horas del sábado'], ['d', 'Horas del domingo']] as const).map(([k, t]) => <label key={k} className="block text-sm mb-3">{t} (HH:MM separadas por coma)<input className={inp + ' w-full mt-1'} value={editCfg[k]} onChange={(e) => setEditCfg({ ...editCfg, [k]: e.target.value })} /></label>)}
              <div className="flex gap-2"><button className={btn} onClick={async () => {
                const lista = (t: string) => t.split(',').map((x) => x.trim()).filter(Boolean)
                const r = await post({ accion: 'config', config: { estadios: lista(editCfg.estadios), inicio: editCfg.inicio, horarios: { '5': lista(editCfg.v), '6': lista(editCfg.s), '0': lista(editCfg.d) } } })
                if (!r.ok) { alert(r.message); return } setEditCfg(null); cargar(tid) }}>Guardar</button><button className={btn2 + ' !py-2'} onClick={() => setEditCfg(null)}>Cancelar</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
