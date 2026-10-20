'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  aplicarOp, amarillasEnPartido, cambiosHechos, enCancha, etiquetaMinuto, faltasDe, jugaron, marcadorDe, minutoActual, mmss,
  Op, periodoNumero, segundos, SnapshotP, tanda, AccionReloj,
} from '@/lib/planilla'

type OpSinMeta = Op extends infer O ? (O extends unknown ? Omit<O, 'id' | 'en'> : never) : never
interface Guardado { snap: SnapshotP; cola: Op[] }

const NOMBRE: Record<string, string> = { gol: '⚽ Gol', gol_penal: '⚽ Gol de penal', autogol: '⚽ Autogol', amarilla: '🟨 Amarilla', doble_amarilla: '🟨🟨 Doble amarilla', roja: '🟥 Roja', falta: '✋ Falta', tanda_gol: '✅ Penal convertido', tanda_fallo: '❌ Penal fallado', sale: '⬇ Sale', entra: '⬆ Entra', titular: 'Titular' }
const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
const btn = 'px-4 py-3 rounded-xl text-base font-semibold bg-slate-700 hover:bg-slate-600 border border-slate-600 disabled:opacity-40 active:scale-95'
const rojo = 'px-4 py-3 rounded-xl text-base font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 active:scale-95'
const verde = 'px-4 py-3 rounded-xl text-base font-bold bg-green-600 hover:bg-green-700 text-white disabled:opacity-40 active:scale-95'

export default function Planilla() {
  const { id } = useParams<{ id: string }>()
  const [snap, setSnap] = useState<SnapshotP | null>(null)
  const [cola, setCola] = useState<Op[]>([])
  const [rol, setRol] = useState('')
  const [ahora, setAhora] = useState(() => Date.now())
  const [msg, setMsg] = useState('')
  const [enLinea, setEnLinea] = useState(true)
  const [editMin, setEditMin] = useState<string | null>(null)
  const [hoja, setHoja] = useState<{ teamId: string; playerId: string; paso: 'accion' | 'cambio'; minuto: number } | null>(null)
  const [banca, setBanca] = useState<Record<string, boolean>>({})
  const sincronizando = useRef(false)
  const clave = `planilla:${id}`

  // Reloj en pantalla
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 500); return () => clearInterval(t) }, [])

  // Recuperar lo guardado en el dispositivo (por si se cerró la pestaña o no había señal)
  useEffect(() => {
    try { const g = localStorage.getItem(clave); if (g) { const v = JSON.parse(g) as Guardado; setSnap(v.snap); setCola(v.cola) } } catch { /* sin almacenamiento */ }
  }, [clave])
  useEffect(() => {
    if (!snap) return
    try { localStorage.setItem(clave, JSON.stringify({ snap, cola } satisfies Guardado)) } catch { /* lleno o bloqueado */ }
  }, [snap, cola, clave])

  const traer = useCallback(async () => {
    const r = await fetch(`/api/torneo/planilla?partidoId=${id}`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r) { setEnLinea(false); return }
    setEnLinea(true)
    if (!r.ok) { setMsg(r.message || 'No se encontró el partido'); return }
    setRol(r.rol)
    setCola((c) => { if (!c.length) setSnap(r.snapshot); return c })
  }, [id])
  useEffect(() => { traer(); const t = setInterval(traer, 8000); return () => clearInterval(t) }, [traer])

  // Envío de lo pendiente: en orden, y se reintenta solo cuando vuelve la señal
  const enviar = useCallback(async () => {
    if (sincronizando.current || !cola.length) return
    sincronizando.current = true
    const lote = cola.slice(0, 50)
    try {
      const r = await fetch('/api/torneo/planilla', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partidoId: id, ops: lote }) }).then((x) => (x.ok ? x.json() : null)).catch(() => null)
      if (!r?.ok) { setEnLinea(false); return }
      setEnLinea(true)
      const hechos = new Set<string>()
      const rechazos: string[] = []
      for (const x of r.resultados as { id: string; ok: boolean; message?: string }[]) {
        if (x.ok) hechos.add(x.id)
        else if (x.message && !x.message.startsWith('Error del servidor')) { hechos.add(x.id); rechazos.push(x.message) }
      }
      if (rechazos.length) setMsg(rechazos.join(' · '))
      setCola((c) => {
        const resto = c.filter((o) => !hechos.has(o.id))
        if (!resto.length) setSnap(r.snapshot)
        return resto
      })
    } finally { sincronizando.current = false }
  }, [cola, id])
  useEffect(() => { enviar() }, [cola, enviar])
  useEffect(() => { const t = setInterval(enviar, 5000); return () => clearInterval(t) }, [enviar])

  const op = (o: OpSinMeta) => {
    if (!snap) return
    const completa = { ...o, id: uid(), en: Date.now() } as Op
    setSnap((actual) => (actual ? aplicarOp(actual, completa) : actual)) // función: varias operaciones seguidas no se pisan
    setCola((c) => [...c, completa])
  }
  const reloj = (a: AccionReloj) => op({ t: 'reloj', a })

  if (!snap) return <div className="min-h-screen bg-slate-900 text-white p-8">{msg || 'Cargando…'} <Link className="underline" href="/admin/planilla">Volver</Link></div>

  const p = snap.partido
  const esAdmin = rol === 'admin'
  const cerrado = p.estado === 'finalizado'
  const relojP = { periodo: p.periodo, base: p.relojBase, desde: p.relojDesde }
  const seg = segundos(relojP, ahora)
  const corre = p.relojDesde !== null
  const m = marcadorDe(snap)
  const minNow = p.periodo === 'previo' ? 0 : minutoActual(relojP, ahora)
  const perNum = periodoNumero(p.periodo) || 2
  const tiempoAnadido = (p.periodo === 't1' && seg > p.dur * 60) || (p.periodo === 't2' && seg > 2 * p.dur * 60)
  const etiquetaPeriodo = cerrado ? 'FINALIZADO' : { previo: 'ANTES DE JUGAR', t1: '1.er TIEMPO', descanso: 'DESCANSO', t2: '2.º TIEMPO', fin: 'FIN DE TIEMPOS', penales: 'PENALES' }[p.periodo]
  const jug = new Map(snap.jugadores.map((j) => [j.id, j]))
  const tnd = tanda(snap)

  const marcarTitular = (teamId: string, playerId: string, on: boolean) => {
    const j = jug.get(playerId)
    if (on && j && j.suspendido > 0) {
      if (!esAdmin) { setMsg(`${j.nombre} está SUSPENDIDO y no puede jugar.`); return }
      if (!confirm(`${j.nombre} está SUSPENDIDO. ¿Habilitarlo de todas formas?`)) return
    }
    if (on && p.periodo === 'previo' && snap.eventos.filter((e) => e.teamId === teamId && e.tipo === 'titular').length >= p.titulares) { setMsg(`Ya hay ${p.titulares} titulares.`); return }
    op({ t: 'titular', teamId, playerId, on })
  }

  const evento = (tipo: string, teamId: string, playerId: string | null, minuto: number) => op({ t: 'evento', tipo, teamId, playerId, minuto, periodo: perNum })
  const registrar = (tipo: string) => {
    if (!hoja) return
    const { teamId, playerId, minuto } = hoja
    if (tipo === 'amarilla' && amarillasEnPartido(snap.eventos, playerId) >= 1) {
      // 2.ª amarilla = expulsión: se reemplaza la primera por una sola «doble amarilla» (así cuenta bien para la sanción)
      const primera = snap.eventos.find((e) => e.playerId === playerId && e.tipo === 'amarilla')
      if (primera) op({ t: 'borrar', cid: primera.cid })
      evento('doble_amarilla', teamId, playerId, minuto)
    } else evento(tipo, teamId, playerId, minuto)
    setHoja(null)
  }

  const Fila = ({ teamId, jugadorId }: { teamId: string; jugadorId: string }) => {
    const j = jug.get(jugadorId)!
    const ev = snap.eventos.filter((e) => e.playerId === jugadorId)
    const goles = ev.filter((e) => e.tipo === 'gol' || e.tipo === 'gol_penal').length
    const am = ev.filter((e) => e.tipo === 'amarilla').length
    const ro = ev.filter((e) => e.tipo === 'roja' || e.tipo === 'doble_amarilla').length
    const sale = ev.some((e) => e.tipo === 'sale')
    return (
      <button className={`w-full flex items-center gap-3 px-3 py-3 border-t border-slate-700 text-left active:bg-slate-700 ${j.suspendido ? 'bg-red-900/20' : ''}`} disabled={cerrado && !esAdmin}
        onClick={() => setHoja({ teamId, playerId: jugadorId, paso: 'accion', minuto: Math.max(1, minNow) })}>
        <span className="w-9 text-center text-xl font-black text-yellow-300">{j.numero ?? '–'}</span>
        <span className="flex-1 text-base">{j.nombre}{j.posicion && <small className="text-slate-400"> · {j.posicion}</small>}</span>
        <span className="text-base whitespace-nowrap">
          {goles > 0 && <>⚽{goles > 1 ? `×${goles}` : ''} </>}{am > 0 && '🟨'}{ro > 0 && '🟥'}{sale && '⬇'}
        </span>
      </button>
    )
  }

  const Equipo = ({ teamId, nombre }: { teamId: string; nombre: string }) => {
    const todos = snap.jugadores.filter((j) => j.teamId === teamId)
    const titulares = snap.eventos.filter((e) => e.teamId === teamId && e.tipo === 'titular').length
    const campo = enCancha(snap.eventos, teamId)
    const jugo = jugaron(snap.eventos, teamId)
    const previo = p.periodo === 'previo'
    const enCampo = todos.filter((j) => campo.has(j.id))
    const salieron = todos.filter((j) => jugo.has(j.id) && !campo.has(j.id))
    const resto = todos.filter((j) => !jugo.has(j.id))
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-3 py-3 bg-slate-900/60 gap-2 flex-wrap">
          <h2 className="font-bold text-lg">{nombre}</h2>
          <div className="flex items-center gap-2 text-sm text-slate-300">
            {!previo && <span>🔄 {cambiosHechos(snap.eventos, teamId)}/{p.cambiosMax}</span>}
            <button className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 font-semibold disabled:opacity-40" disabled={previo || (cerrado && !esAdmin)}
              onClick={() => evento('falta', teamId, null, Math.max(1, minNow))}>✋ Faltas: {faltasDe(snap.eventos, teamId)} +</button>
          </div>
        </div>
        {previo ? (
          <>
            <p className="px-3 py-2 text-sm text-slate-300">Toca para marcar a los titulares: <b className={titulares === p.titulares ? 'text-green-400' : 'text-yellow-300'}>{titulares}/{p.titulares}</b></p>
            {todos.map((j) => {
              const on = snap.eventos.some((e) => e.tipo === 'titular' && e.playerId === j.id)
              return (
                <button key={j.id} className={`w-full flex items-center gap-3 px-3 py-3 border-t border-slate-700 text-left ${on ? 'bg-green-900/30' : ''} ${j.suspendido ? 'bg-red-900/20' : ''}`} onClick={() => marcarTitular(teamId, j.id, !on)}>
                  <span className={`w-7 h-7 rounded-md border-2 flex items-center justify-center ${on ? 'bg-green-500 border-green-500 text-black' : 'border-slate-500'}`}>{on ? '✓' : ''}</span>
                  <span className="w-9 text-center text-xl font-black text-yellow-300">{j.numero ?? '–'}</span>
                  <span className="flex-1 text-base">{j.nombre}{j.posicion && <small className="text-slate-400"> · {j.posicion}</small>}</span>
                  {j.suspendido > 0 && <span className="text-red-300 text-sm font-bold">SUSPENDIDO</span>}
                </button>
              )
            })}
            {!todos.length && <p className="px-3 py-3 text-slate-400 text-sm">Este club no tiene jugadores cargados.</p>}
          </>
        ) : (
          <>
            <p className="px-3 pt-2 text-xs uppercase tracking-wider text-slate-400">En la cancha ({enCampo.length})</p>
            {enCampo.map((j) => <Fila key={j.id} teamId={teamId} jugadorId={j.id} />)}
            {salieron.length > 0 && <p className="px-3 pt-3 text-xs uppercase tracking-wider text-slate-400">Ya salieron</p>}
            {salieron.map((j) => <div key={j.id} className="opacity-60"><Fila teamId={teamId} jugadorId={j.id} /></div>)}
            <button className="w-full px-3 py-3 border-t border-slate-700 text-sm text-slate-300 text-left" onClick={() => setBanca((b) => ({ ...b, [teamId]: !b[teamId] }))}>{banca[teamId] ? '▾' : '▸'} Banca / sin jugar ({resto.length})</button>
            {banca[teamId] && resto.map((j) => <div key={j.id} className="opacity-80"><Fila teamId={teamId} jugadorId={j.id} /></div>)}
          </>
        )}
      </div>
    )
  }

  const hojaJ = hoja ? jug.get(hoja.playerId) : null
  const pendientes = cola.length
  const lista = [...snap.eventos].filter((e) => e.tipo !== 'titular').sort((a, b) => (a.periodo ?? 0) - (b.periodo ?? 0) || (a.minuto ?? 0) - (b.minuto ?? 0))

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white pb-24">
      <div className="max-w-6xl mx-auto px-3 py-4">
        <div className="flex items-center justify-between text-sm">
          <Link href="/admin/planilla" className="text-slate-400 hover:text-white">← Partidos</Link>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${pendientes ? 'bg-yellow-500 text-black' : enLinea ? 'bg-green-700' : 'bg-red-700'}`}>
            {pendientes ? `⏳ ${pendientes} por enviar${enLinea ? '…' : ' · sin señal'}` : enLinea ? '✔ Todo guardado' : '⚠ Sin señal'}
          </span>
        </div>
        <p className="text-yellow-300 text-sm mt-2">{p.jornada} · {p.fecha || 'sin fecha'} {p.hora || ''} {p.escenario ? '· ' + p.escenario : ''}</p>

        <div className="bg-slate-900/70 border border-slate-700 rounded-2xl p-4 mt-2">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
            <p className="text-lg md:text-2xl font-bold">{p.local}</p>
            <div>
              <p className="text-4xl md:text-6xl font-black text-yellow-400 leading-none">{m.golesLocal} - {m.golesVisitante}</p>
              {(p.periodo === 'penales' || p.penalesLocal !== null) && <p className="text-sm text-slate-300">Penales {p.penalesLocal ?? tnd.local} - {p.penalesVisitante ?? tnd.visitante}</p>}
            </div>
            <p className="text-lg md:text-2xl font-bold">{p.visitante}</p>
          </div>
          <div className="text-center mt-3">
            <p className="text-5xl md:text-7xl font-black tabular-nums tracking-wider">{mmss(seg)}</p>
            <p className="text-sm text-slate-300 mt-1">{etiquetaPeriodo}{!corre && (p.periodo === 't1' || p.periodo === 't2') && ' · ⏸ PAUSADO'}
              {tiempoAnadido && <b className="text-red-400"> · tiempo añadido {etiquetaMinuto(minNow, perNum, p.dur)}</b>}</p>
          </div>
          {!cerrado && (
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              {p.periodo === 'previo' && <button className={verde} onClick={() => {
                const faltan = [p.localId, p.visitanteId].some((t) => snap.eventos.filter((e) => e.teamId === t && e.tipo === 'titular').length !== p.titulares)
                if (!faltan || confirm(`No están los ${p.titulares} titulares de cada equipo. ¿Iniciar de todas formas?`)) reloj('iniciar')
              }}>▶ Iniciar partido</button>}
              {(p.periodo === 't1' || p.periodo === 't2') && (corre ? <button className={btn} onClick={() => reloj('pausar')}>⏸ Pausar reloj</button> : <button className={verde} onClick={() => reloj('reanudar')}>▶ Reanudar</button>)}
              {p.periodo === 't1' && <button className={btn} onClick={() => confirm('¿Terminó el primer tiempo?') && reloj('descanso')}>Fin del 1.er tiempo</button>}
              {p.periodo === 'descanso' && <button className={verde} onClick={() => reloj('t2')}>▶ Iniciar 2.º tiempo</button>}
              {p.periodo === 't2' && <button className={btn} onClick={() => confirm('¿Terminó el segundo tiempo?') && reloj('fin')}>Fin del 2.º tiempo</button>}
              {p.periodo === 'fin' && <button className={btn} onClick={() => reloj('penales')}>Ir a penales</button>}
              {(p.periodo === 'fin' || p.periodo === 'penales') && <button className={rojo} onClick={() => confirm('¿Finalizar el partido y cerrar la planilla?') && reloj('finalizar')}>Finalizar partido</button>}
            </div>
          )}
          {cerrado && esAdmin && <div className="text-center mt-3"><button className={btn} onClick={() => confirm('¿Reabrir la planilla?') && reloj('reabrir')}>Reabrir planilla</button></div>}
        </div>

        {msg && <div className="bg-red-900/50 border border-red-500 rounded-xl p-3 mt-3 text-sm" onClick={() => setMsg('')}>{msg} <span className="text-slate-300">(toca para cerrar)</span></div>}

        {p.periodo === 'penales' && !cerrado && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 mt-3">
            <h2 className="font-bold mb-2">Tanda de penales</h2>
            <div className="grid grid-cols-2 gap-3">
              {([[p.localId, p.local, tnd.local, tnd.falloL], [p.visitanteId, p.visitante, tnd.visitante, tnd.falloV]] as const).map(([tid, nom, ok, mal]) => (
                <div key={tid} className="text-center">
                  <p className="font-semibold">{nom}</p>
                  <p className="text-3xl font-black text-yellow-300">{ok} <small className="text-slate-400 text-base">({ok + mal} tirados)</small></p>
                  <div className="flex gap-2 justify-center mt-2">
                    <button className={verde} onClick={() => evento('tanda_gol', tid, null, 0)}>✅ Gol</button>
                    <button className={rojo} onClick={() => evento('tanda_fallo', tid, null, 0)}>❌ Falló</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <Equipo teamId={p.localId} nombre={p.local} />
          <Equipo teamId={p.visitanteId} nombre={p.visitante} />
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 mt-3">
          <h2 className="font-bold mb-2">Qué pasó en el partido</h2>
          {!lista.length && <p className="text-slate-400 text-sm">Todavía no hay eventos.</p>}
          {lista.map((e) => {
            const j = e.playerId ? jug.get(e.playerId) : null
            const equipo = e.teamId === p.localId ? p.local : p.visitante
            return (
              <div key={e.cid} className="flex justify-between items-center gap-2 text-sm py-2 border-t border-slate-700">
                <span><b className="text-yellow-300">{e.tipo.startsWith('tanda') ? 'Penales' : etiquetaMinuto(e.minuto, e.periodo, p.dur)}</b> {NOMBRE[e.tipo] || e.tipo}{j && <> · <b>{j.numero ?? ''}</b> {j.nombre}</>} <span className="text-slate-400">({equipo})</span></span>
                {!(e.tipo === 'sale' || e.tipo === 'entra') && !(cerrado && !esAdmin) && <button className="text-red-400 px-2 py-1" onClick={() => confirm('¿Borrar este evento?') && op({ t: 'borrar', cid: e.cid })}>Borrar</button>}
                {(e.tipo === 'sale' || e.tipo === 'entra') && e.tipo === 'entra' && !(cerrado && !esAdmin) && <button className="text-red-400 px-2 py-1" onClick={() => confirm('¿Deshacer este cambio?') && op({ t: 'borrar', cid: e.cid.replace(/-e$/, '') })}>Deshacer</button>}
              </div>
            )
          })}
        </div>
      </div>

      {hoja && hojaJ && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end md:items-center justify-center" onClick={() => setHoja(null)}>
          <div className="bg-slate-800 border border-slate-600 rounded-t-3xl md:rounded-3xl p-5 w-full max-w-lg max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start gap-3">
              <p className="text-xl font-bold"><span className="text-yellow-300">{hojaJ.numero ?? '–'}</span> {hojaJ.nombre}</p>
              <button className="text-slate-400 text-2xl leading-none" onClick={() => setHoja(null)}>×</button>
            </div>
            <div className="flex items-center gap-3 mt-3 text-base">
              <span className="text-slate-300">Minuto</span>
              <BotonRepetir texto="−" onPaso={() => setHoja((h) => h && { ...h, minuto: Math.max(0, h.minuto - 1) })} />
              {editMin === null ? (
                <button className="text-2xl font-bold w-20 text-center underline decoration-dotted decoration-slate-500" onClick={() => setEditMin(String(hoja.minuto))}>{etiquetaMinuto(hoja.minuto, perNum, p.dur)}</button>
              ) : (
                <input autoFocus type="number" inputMode="numeric" min={0} max={200} className="w-20 text-2xl font-bold text-center rounded-lg bg-slate-900 border border-yellow-400 py-1"
                  value={editMin} onChange={(e) => setEditMin(e.target.value)} onFocus={(e) => e.target.select()}
                  onBlur={() => { const n = Math.round(Number(editMin)); if (Number.isFinite(n) && editMin !== '') setHoja((h) => h && { ...h, minuto: Math.min(200, Math.max(0, n)) }); setEditMin(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
              )}
              <BotonRepetir texto="+" onPaso={() => setHoja((h) => h && { ...h, minuto: Math.min(200, h.minuto + 1) })} />
              <span className="text-xs text-slate-400">Mantén pulsado o toca el número para escribirlo</span>
            </div>
            {hoja.paso === 'accion' ? (
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button className={verde} onClick={() => registrar('gol')}>⚽ Gol</button>
                <button className={verde} onClick={() => registrar('gol_penal')}>⚽ Gol de penal</button>
                <button className={btn} onClick={() => registrar('autogol')}>⚽ Autogol</button>
                <button className={btn} onClick={() => registrar('falta')}>✋ Falta</button>
                <button className={btn + ' !bg-yellow-500 !text-black !border-yellow-400'} onClick={() => registrar('amarilla')}>{amarillasEnPartido(snap.eventos, hoja.playerId) >= 1 ? '🟨🟨 2.ª amarilla' : '🟨 Amarilla'}</button>
                <button className={rojo} onClick={() => registrar('roja')}>🟥 Roja directa</button>
                {!jugaron(snap.eventos, hoja.teamId).has(hoja.playerId) && (
                  <button className={verde + ' col-span-2'} onClick={() => { marcarTitular(hoja.teamId, hoja.playerId, true); setHoja(null) }}>✅ Ponerlo en la cancha (titular)</button>
                )}
                {snap.eventos.some((e) => e.playerId === hoja.playerId && e.tipo === 'sale') && (
                  <button className={btn + ' col-span-2'} onClick={() => { snap.eventos.filter((e) => e.playerId === hoja.playerId && e.tipo === 'sale').forEach((e) => op({ t: 'borrar', cid: e.cid })); setHoja(null) }}>↩ Volver a la cancha (anular su salida)</button>
                )}
                {snap.eventos.some((e) => e.playerId === hoja.playerId && e.tipo === 'titular') && !snap.eventos.some((e) => e.playerId === hoja.playerId && e.tipo === 'sale') && (
                  <button className={btn + ' col-span-2'} onClick={() => { marcarTitular(hoja.teamId, hoja.playerId, false); setHoja(null) }}>✖ Quitarlo de la cancha (marcado por error)</button>
                )}
                {enCancha(snap.eventos, hoja.teamId).has(hoja.playerId) && !cerrado && (
                  <button className={btn + ' col-span-2'} disabled={cambiosHechos(snap.eventos, hoja.teamId) >= p.cambiosMax} onClick={() => setHoja({ ...hoja, paso: 'cambio' })}>🔄 Cambio: sale este jugador</button>
                )}
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-sm text-slate-300 mb-2">¿Quién entra?</p>
                {snap.jugadores.filter((j) => j.teamId === hoja.teamId && !jugaron(snap.eventos, hoja.teamId).has(j.id)).map((j) => (
                  <button key={j.id} className="w-full flex items-center gap-3 px-3 py-3 border-t border-slate-700 text-left active:bg-slate-700 disabled:opacity-40" disabled={j.suspendido > 0 && !esAdmin}
                    onClick={() => { op({ t: 'cambio', teamId: hoja.teamId, sale: hoja.playerId, entra: j.id, minuto: hoja.minuto, periodo: perNum }); setHoja(null) }}>
                    <span className="w-9 text-center text-xl font-black text-yellow-300">{j.numero ?? '–'}</span>
                    <span className="flex-1">{j.nombre}{j.posicion && <small className="text-slate-400"> · {j.posicion}</small>}</span>
                    {j.suspendido > 0 && <span className="text-red-300 text-xs font-bold">SUSPENDIDO</span>}
                  </button>
                ))}
                <button className={btn + ' mt-3'} onClick={() => setHoja({ ...hoja, paso: 'accion' })}>← Volver</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Botón que repite el paso mientras se mantiene pulsado (acelera poco a poco). */
function BotonRepetir({ texto, onPaso }: { texto: string; onPaso: () => void }) {
  const paso = useRef(onPaso)
  paso.current = onPaso
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  const parar = () => { if (t.current) clearTimeout(t.current); t.current = null }
  const ciclo = (n: number) => { paso.current(); t.current = setTimeout(() => ciclo(n + 1), n > 12 ? 40 : n > 5 ? 80 : 160) }
  useEffect(() => parar, [])
  return (
    <button className={btn + ' !px-5 select-none touch-none'} onPointerDown={(e) => { e.preventDefault(); parar(); paso.current(); t.current = setTimeout(() => ciclo(0), 400) }}
      onPointerUp={parar} onPointerLeave={parar} onPointerCancel={parar} onContextMenu={(e) => e.preventDefault()}>{texto}</button>
  )
}
