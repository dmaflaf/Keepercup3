'use client'

import { useCallback, useEffect, useState } from 'react'

interface Jugador { id: string; numero: number | null; nombre: string; posicion: string | null; cedula: string; estado: string; sancion: string | null; faltaFoto: boolean; faltaCedula: boolean; carnetListo: boolean }
interface Datos {
  club: { nombre: string; ciudad: string | null; dt: string | null }; torneo: string | null
  jugadores: Jugador[]
  proximos: { jornada: string; fecha: string | null; hora: string | null; escenario: string | null; rival: string; local: boolean; estado: string }[]
  jugados: { id: string; jornada: string; rival: string; gf: number; gc: number }[]
  cuenta: { conceptos: { concepto: string; detalle: string | null; cargado: number; pagado: number }[]; cargado: number; pagado: number; saldo: number; pagos: { fecha: string | null; concepto: string; comprobante: string | null; monto: number }[] } | null
  solicitudes: { id: string; texto: string; estado: string; respuesta: string | null; fecha: string }[]
  equipo: {
    tablas: { fase: string; grupo: string; tipo: string; filas: { pos: number; equipo: string; mio: boolean; pj: number; pg: number; pe: number; pp: number; gf: number; gc: number; dg: number; pts: number }[] }[]
    resumen: { pj: number; pg: number; pe: number; pp: number; gf: number; gc: number }
    goleadores: { nombre: string; numero: number | null; goles: number; penales: number }[]
    tarjetas: { nombre: string; numero: number | null; amarillas: number; dobles: number; rojas: number; detalle: { fecha: string; tipo: string; rival: string }[] }[]
    fairplay: { puntos: number; pos: number; de: number }
  } | null
}
type Tab = 'inicio' | 'nomina' | 'equipo' | 'cuenta' | 'pedidos'

const usd = (n: number) => `$${n.toFixed(2)}`
const card = 'bg-[#13254a] border border-[#24407a] rounded-2xl p-4 mb-4'
const h2 = 'text-lg font-bold text-[#f5c542] mb-2'
const fechaTxt = (f: string | null) => f ? new Date(f.length <= 10 ? f + 'T12:00:00' : f).toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Guayaquil' }) : 'Por programar'

export default function PortalDT({ params }: { params: { token: string } }) {
  const t = params.token
  const [d, setD] = useState<Datos | null>(null)
  const [entrar, setEntrar] = useState<string | null>(null) // nombre del club cuando hay que entrar con cédula
  const [error, setError] = useState('')
  const [cedula, setCedula] = useState('')
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'suspendido' | 'faltan'>('todos')
  const [tab, setTabE] = useState<Tab>('inicio')
  const setTab = (x: Tab) => { setTabE(x); setAviso(''); window.scrollTo({ top: 0 }) }

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/portal/${t}`, { cache: 'no-store' })
    const j = await r.json().catch(() => null)
    if (j?.ok) { setD(j); setEntrar(null); setError('') }
    else if (j?.entrar) { setEntrar(j.club); setD(null) }
    else setError(j?.message || 'No se pudo cargar')
  }, [t])
  useEffect(() => { cargar() }, [cargar])

  async function post(b: Record<string, unknown>) {
    setOcupado(true)
    const r = await fetch(`/api/portal/${t}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Sin conexión' }))
    setOcupado(false)
    return r as { ok: boolean; message?: string }
  }

  const fondo = 'min-h-screen bg-gradient-to-b from-[#0b1733] to-[#081026] text-white'
  if (error) return <div className={fondo + ' p-6 text-center'}><p className="mt-20 text-lg">⚠️ {error}</p></div>
  if (entrar !== null) return (
    <div className={fondo + ' flex items-center justify-center p-5'}>
      <form className="w-full max-w-sm bg-[#13254a] border border-[#24407a] rounded-2xl p-6 text-center" onSubmit={async (e) => {
        e.preventDefault(); setAviso('')
        const r = await post({ accion: 'entrar', cedula })
        if (r.ok) cargar(); else setAviso(r.message || 'No se pudo entrar')
      }}>
        <p className="text-4xl">🏆</p>
        <p className="text-xs tracking-widest text-[#f5c542] mt-2">KEEPER CUP · PORTAL DEL DT</p>
        <h1 className="text-2xl font-bold mt-1">{entrar}</h1>
        <p className="text-sm text-slate-300 mt-3">Para ver tu nómina, escribe tu número de cédula (la que registraste como director técnico).</p>
        <input inputMode="numeric" autoComplete="off" className="mt-4 w-full text-center text-xl tracking-widest px-3 py-3 rounded-xl bg-[#0b1733] border border-[#24407a] focus:border-[#f5c542] outline-none" placeholder="Cédula" value={cedula} onChange={(e) => setCedula(e.target.value.replace(/[^\d-]/g, ''))} />
        {aviso && <p className="text-red-300 text-sm mt-2">{aviso}</p>}
        <button disabled={ocupado || cedula.length < 9} className="mt-4 w-full py-3 rounded-xl bg-[#f5c542] text-[#0b1733] font-bold disabled:opacity-40">Entrar</button>
      </form>
    </div>)
  if (!d) return <div className={fondo + ' p-6 text-center'}><p className="mt-20">Cargando…</p></div>

  const susp = d.jugadores.filter((j) => j.estado === 'suspendido')
  const faltan = d.jugadores.filter((j) => j.faltaFoto || j.faltaCedula)
  const habil = d.jugadores.filter((j) => j.estado === 'habilitado').length
  const lista = filtro === 'suspendido' ? susp : filtro === 'faltan' ? faltan : d.jugadores
  const badge = (j: Jugador) => j.estado === 'suspendido' ? ['Suspendido', 'bg-red-600'] : j.estado === 'habilitado' ? ['Habilitado', 'bg-green-600'] : [j.estado.charAt(0).toUpperCase() + j.estado.slice(1), 'bg-slate-500']
  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-xs font-semibold border ${on ? 'bg-[#f5c542] text-[#0b1733] border-[#f5c542]' : 'border-[#24407a] text-slate-200'}`

  return (
    <div className={fondo}>
      <div className="max-w-xl mx-auto px-4 pb-10">
        <header className="pt-6 pb-4 flex items-start gap-3">
          <div className="flex-1">
            <p className="text-xs tracking-widest text-[#f5c542]">PORTAL DEL DT{d.torneo ? ` · ${d.torneo.toUpperCase()}` : ''}</p>
            <h1 className="text-2xl font-bold leading-tight">{d.club.nombre}</h1>
            {d.club.dt && <p className="text-sm text-slate-300">DT: {d.club.dt}</p>}
          </div>
          <button className="text-xs text-slate-300 border border-[#24407a] rounded-lg px-3 py-1.5" onClick={async () => { await post({ accion: 'salir' }); setCedula(''); cargar() }}>Salir</button>
        </header>
        <nav className="sticky top-0 z-10 -mx-4 px-4 py-2 mb-3 bg-[#0b1733]/95 backdrop-blur flex gap-1 overflow-x-auto">
          {([['inicio', 'Inicio'], ['nomina', 'Nómina'], ['equipo', 'Mi equipo'], ['cuenta', 'Cuenta'], ['pedidos', 'Pedidos']] as [Tab, string][]).map(([k, n]) => (
            <button key={k} onClick={() => setTab(k)} className={`shrink-0 px-2.5 py-2 rounded-full text-[13px] font-semibold ${tab === k ? 'bg-[#f5c542] text-[#0b1733]' : 'bg-[#13254a] text-slate-200'}`}>{n}</button>))}
        </nav>

        {tab === 'inicio' && <>
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          <div className="bg-[#13254a] rounded-xl p-3"><p className="text-2xl font-bold">{d.jugadores.length}</p><p className="text-[11px] text-slate-300">Jugadores</p></div>
          <div className="bg-[#13254a] rounded-xl p-3"><p className="text-2xl font-bold text-green-400">{habil}</p><p className="text-[11px] text-slate-300">Habilitados</p></div>
          <div className="bg-[#13254a] rounded-xl p-3"><p className={`text-2xl font-bold ${susp.length ? 'text-red-400' : ''}`}>{susp.length}</p><p className="text-[11px] text-slate-300">Suspendidos</p></div>
        </div>

        {susp.length > 0 && (
          <div className="bg-red-900/40 border border-red-600 rounded-2xl p-4 mb-4">
            <p className="font-bold mb-1">🟥 No pueden jugar</p>
            {susp.map((j) => <p key={j.id} className="text-sm"><b>#{j.numero ?? '–'} {j.nombre}</b> — {j.sancion?.replace(/^Suspendido: /, '')}</p>)}
          </div>)}

        {(() => { const prec = d.jugadores.filter((j) => j.sancion && j.estado !== 'suspendido'); return prec.length > 0 && (
          <div className="bg-yellow-900/30 border border-yellow-600 rounded-2xl p-4 mb-4">
            <p className="font-bold mb-1">🟨 Cuidado: con una amarilla más se suspenden</p>
            {prec.map((j) => <p key={j.id} className="text-sm">#{j.numero ?? '–'} {j.nombre} · {j.sancion?.replace(/^En precaución: /, '')}</p>)}
          </div>) })()}
        </>}
        {tab === 'nomina' && <section className={card}>
          <h2 className={h2}>📋 Mi nómina</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            <button className={chip(filtro === 'todos')} onClick={() => setFiltro('todos')}>Todos ({d.jugadores.length})</button>
            <button className={chip(filtro === 'suspendido')} onClick={() => setFiltro('suspendido')}>Suspendidos ({susp.length})</button>
            <button className={chip(filtro === 'faltan')} onClick={() => setFiltro('faltan')}>Les falta algo ({faltan.length})</button>
          </div>
          {!lista.length && <p className="text-sm text-slate-300">Nadie en esta lista. 👍</p>}
          {lista.map((j) => {
            const [b, c] = badge(j)
            return (
              <div key={j.id} className="flex gap-3 py-2.5 border-t border-[#24407a] first:border-0">
                <Foto t={t} j={j} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold leading-tight"><span className="text-[#f5c542]">#{j.numero ?? '–'}</span> {j.nombre}</p>
                  <p className="text-xs text-slate-400">{[j.posicion, j.cedula && `C.I. ${j.cedula}`].filter(Boolean).join(' · ')}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${c}`}>{b}</span>
                    {j.carnetListo && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-700">🪪 Carnet listo</span>}
                    {j.faltaFoto && <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-700">Falta foto</span>}
                    {j.faltaCedula && <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-700">Falta cédula</span>}
                  </div>
                  {j.sancion && j.estado !== 'suspendido' && <p className="text-xs text-yellow-300 mt-1">🟨 {j.sancion}</p>}
                </div>
              </div>)
          })}
        </section>}

        {tab === 'inicio' && <section className={card}>
          <h2 className={h2}>📅 Próximos partidos</h2>
          {!d.proximos.length && <p className="text-sm text-slate-300">No hay partidos pendientes.</p>}
          {d.proximos.map((p, i) => (
            <div key={i} className="py-2 border-t border-[#24407a] first:border-0">
              <p className="text-xs text-slate-400">{p.jornada}</p>
              <p className="font-semibold">{p.local ? 'vs' : '@'} {p.rival}</p>
              <p className="text-sm text-slate-300">{fechaTxt(p.fecha)}{p.hora ? ` · ${p.hora}` : ''}{p.escenario ? ` · ${p.escenario}` : ''}</p>
            </div>))}
          {d.jugados.length > 0 && <>
            <p className="text-sm font-semibold mt-3 mb-1">Últimos resultados</p>
            {d.jugados.map((p) => {
              const r = p.gf > p.gc ? ['G', 'bg-green-600'] : p.gf < p.gc ? ['P', 'bg-red-600'] : ['E', 'bg-slate-500']
              return <a key={p.id} href={`/torneo/partido/${p.id}`} className="flex items-center gap-2 py-1 text-sm"><span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${r[1]}`}>{r[0]}</span><span className="flex-1">{p.rival} <span className="text-slate-400 text-xs">· {p.jornada}</span></span><b>{p.gf} – {p.gc}</b></a>
            })}
          </>}
        </section>}

        {tab === 'equipo' && <MiEquipo d={d} />}

        {tab === 'cuenta' && !d.cuenta && <p className="text-sm text-slate-300">Sin cuenta registrada.</p>}
        {tab === 'cuenta' && d.cuenta && (
          <section className={card}>
            <h2 className={h2}>💰 Cuenta del club</h2>
            <div className={`rounded-xl p-3 mb-3 text-center ${d.cuenta.saldo > 0.005 ? 'bg-red-900/40 border border-red-600' : 'bg-green-900/40 border border-green-600'}`}>
              <p className="text-xs text-slate-300">{d.cuenta.saldo > 0.005 ? 'Saldo pendiente' : 'Al día'}</p>
              <p className="text-3xl font-bold">{usd(Math.max(0, d.cuenta.saldo))}</p>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-slate-400"><th className="text-left font-normal">Concepto</th><th className="text-right font-normal">Valor</th><th className="text-right font-normal">Pagado</th></tr></thead>
              <tbody>{d.cuenta.conceptos.map((c) => (
                <tr key={c.concepto} className="border-t border-[#24407a]"><td className="py-1.5">{c.concepto}{c.detalle && <span className="block text-[11px] text-green-300">{c.detalle}</span>}</td><td className="text-right">{usd(c.cargado)}</td><td className="text-right">{usd(c.pagado)}</td></tr>))}
                <tr className="border-t-2 border-[#f5c542] font-bold"><td className="py-1.5">Total</td><td className="text-right">{usd(d.cuenta.cargado)}</td><td className="text-right">{usd(d.cuenta.pagado)}</td></tr>
              </tbody>
            </table>
            {d.cuenta.pagos.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer text-slate-300">Pagos registrados ({d.cuenta.pagos.length})</summary>
              {d.cuenta.pagos.map((p, i) => <p key={i} className="flex justify-between py-1 border-t border-[#24407a] text-xs"><span>{p.fecha ? fechaTxt(p.fecha) : '—'} · {p.concepto}{p.comprobante ? ` · ${p.comprobante}` : ''}</span><b>{usd(p.monto)}</b></p>)}
            </details>}
          </section>)}

        {(tab === 'inicio' || tab === 'nomina') && <section className={card}>
          <h2 className={h2}>⬇️ Descargas</h2>
          <div className="grid grid-cols-2 gap-2">
            <a className="text-center py-3 rounded-xl bg-[#f5c542] text-[#0b1733] font-bold text-sm" href={`/api/portal/${t}/nomina`} target="_blank" rel="noopener">Nómina (PDF)</a>
            <a className="text-center py-3 rounded-xl border border-[#f5c542] text-[#f5c542] font-bold text-sm" href={`/api/portal/${t}/reporte`} target="_blank" rel="noopener">Reporte del club (PDF)</a>
          </div>
        </section>}

        {tab === 'pedidos' && <section className={card}>
          <h2 className={h2}>✍️ Pedir un cambio</h2>
          <p className="text-sm text-slate-300 mb-2">¿Un nombre mal escrito, un número equivocado o falta un jugador? Escríbelo aquí y la organización lo revisa. Tú no cambias nada directamente.</p>
          <textarea className="w-full h-24 p-3 rounded-xl bg-[#0b1733] border border-[#24407a] focus:border-[#f5c542] outline-none text-sm" maxLength={1000} placeholder="Ej.: El #8 se llama Juan Pérez, no Juan Peres" value={texto} onChange={(e) => setTexto(e.target.value)} />
          {aviso && <p className="text-sm mt-1 text-yellow-300">{aviso}</p>}
          <button disabled={ocupado || texto.trim().length < 5} className="mt-2 w-full py-3 rounded-xl bg-[#f5c542] text-[#0b1733] font-bold disabled:opacity-40" onClick={async () => {
            const r = await post({ accion: 'solicitud', texto })
            if (r.ok) { setTexto(''); setAviso('✔ Pedido enviado. Te avisamos aquí cuando lo revisen.'); cargar() } else setAviso(r.message || 'No se pudo enviar')
          }}>Enviar pedido</button>
          {d.solicitudes.length > 0 && <div className="mt-4">
            <p className="text-sm font-semibold mb-1">Mis pedidos</p>
            {d.solicitudes.map((s) => (
              <div key={s.id} className="py-2 border-t border-[#24407a] text-sm">
                <div className="flex gap-2 items-start"><p className="flex-1 whitespace-pre-wrap">{s.texto}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${s.estado === 'atendida' ? 'bg-green-600' : s.estado === 'rechazada' ? 'bg-red-600' : 'bg-slate-500'}`}>{s.estado === 'atendida' ? 'Atendido' : s.estado === 'rechazada' ? 'Rechazado' : 'Pendiente'}</span></div>
                {s.respuesta && <p className="text-xs text-[#f5c542] mt-1">Organización: {s.respuesta}</p>}
                <p className="text-[11px] text-slate-400">{new Date(s.fecha).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>))}
          </div>}
        </section>}
        <p className="text-center text-[11px] text-slate-500">Solo tú ves esta página. No compartas el enlace.</p>
      </div>
    </div>
  )
}

function MiEquipo({ d }: { d: Datos }) {
  const e = d.equipo
  const [verTj, setVerTj] = useState<string | null>(null)
  if (!e) return <p className="text-sm text-slate-300">Todavía no hay datos del torneo.</p>
  const r = e.resumen
  const celda = 'py-1.5 text-center'
  return (<>
    <section className={card}>
      <h2 className={h2}>📈 Resumen del torneo</h2>
      <div className="grid grid-cols-4 gap-2 text-center">
        {([['PJ', r.pj, ''], ['G', r.pg, 'text-green-400'], ['E', r.pe, ''], ['P', r.pp, 'text-red-400'], ['GF', r.gf, ''], ['GC', r.gc, ''], ['DG', r.gf - r.gc, r.gf - r.gc >= 0 ? 'text-green-400' : 'text-red-400'], ['Fair play', `${e.fairplay.pos}.º`, '']] as [string, string | number, string][]).map(([k, v, c]) => (
          <div key={k} className="bg-[#0b1733] rounded-xl py-2"><p className={`text-xl font-bold ${c}`}>{typeof v === 'number' && k === 'DG' && v > 0 ? `+${v}` : v}</p><p className="text-[10px] text-slate-400">{k}</p></div>))}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">Fair play: {e.fairplay.puntos} punto(s) por tarjetas (amarilla 1, doble o roja 3), puesto {e.fairplay.pos} de {e.fairplay.de}. Menos es mejor.</p>
    </section>

    {e.tablas.map((t) => (
      <section key={t.fase + t.grupo} className={card}>
        <h2 className={h2}>🏆 {t.fase} · {t.grupo}</h2>
        <table className="w-full text-xs">
          <thead><tr className="text-slate-400"><th className="text-left font-normal py-1">#</th><th className="text-left font-normal">Club</th><th className="font-normal">PJ</th><th className="font-normal">DG</th><th className="font-normal">PTS</th></tr></thead>
          <tbody>{t.filas.map((f) => (
            <tr key={f.equipo} className={`border-t border-[#24407a] ${f.mio ? 'bg-[#f5c542]/15 font-bold text-[#f5c542]' : ''}`}>
              <td className="py-1.5 pl-1">{f.pos}</td><td>{f.equipo}</td><td className={celda}>{f.pj}</td><td className={celda}>{f.dg > 0 ? `+${f.dg}` : f.dg}</td><td className={celda + ' font-bold'}>{f.pts}</td></tr>))}</tbody>
        </table>
      </section>))}

    <section className={card}>
      <h2 className={h2}>⚽ Goleadores del club</h2>
      {!e.goleadores.length && <p className="text-sm text-slate-300">Aún no hay goles registrados con jugador.</p>}
      {e.goleadores.map((g, i) => (
        <div key={i} className="flex items-center gap-2 py-1.5 border-t border-[#24407a] first:border-0 text-sm">
          <span className="w-5 text-slate-400">{i + 1}</span><span className="flex-1"><span className="text-[#f5c542]">#{g.numero ?? '–'}</span> {g.nombre}{g.penales ? <span className="text-xs text-slate-400"> ({g.penales} de penal)</span> : null}</span><b className="text-lg">{g.goles}</b></div>))}
    </section>

    <section className={card}>
      <h2 className={h2}>🟨 Tarjetas por jugador</h2>
      {!e.tarjetas.length && <p className="text-sm text-slate-300">Ningún jugador tiene tarjetas. 👏</p>}
      {e.tarjetas.map((t) => (
        <div key={t.nombre + t.numero} className="py-1.5 border-t border-[#24407a] first:border-0 text-sm">
          <button className="w-full flex items-center gap-2 text-left" onClick={() => setVerTj(verTj === t.nombre ? null : t.nombre)}>
            <span className="flex-1"><span className="text-[#f5c542]">#{t.numero ?? '–'}</span> {t.nombre}</span>
            {t.amarillas > 0 && <span className="px-1.5 rounded bg-yellow-400 text-black text-xs font-bold">{t.amarillas}</span>}
            {t.dobles > 0 && <span className="px-1.5 rounded bg-orange-500 text-black text-xs font-bold">2A×{t.dobles}</span>}
            {t.rojas > 0 && <span className="px-1.5 rounded bg-red-600 text-xs font-bold">{t.rojas}</span>}
            <span className="text-slate-400 text-xs">{verTj === t.nombre ? '▲' : '▼'}</span>
          </button>
          {verTj === t.nombre && t.detalle.map((x, i) => <p key={i} className="text-xs text-slate-300 pl-4 mt-1">{x.fecha} · vs {x.rival} · {x.tipo === 'amarilla' ? '🟨 amarilla' : x.tipo === 'doble' ? '🟨🟥 doble amarilla' : '🟥 roja'}</p>)}
        </div>))}
      <p className="text-[11px] text-slate-400 mt-2">Cuenta todas las tarjetas del torneo. La suspensión por amarillas se calcula según el reglamento (ver Inicio).</p>
    </section>
  </>)
}

function Foto({ t, j }: { t: string; j: Jugador }) {
  const [mal, setMal] = useState(false)
  const ini = j.nombre.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()
  if (j.faltaFoto || mal) return <div className="w-12 h-12 rounded-full bg-[#24407a] flex items-center justify-center font-bold text-slate-300 shrink-0">{ini}</div>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/portal/${t}/foto/${j.id}`} alt="" loading="lazy" className="w-12 h-12 rounded-full object-cover shrink-0 bg-[#24407a]" onError={() => setMal(true)} />
}
