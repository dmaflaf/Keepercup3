'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

interface Gol { id: string; tipo: string; minuto: number | null; jugador: string; numero: number | null; propio: boolean }
interface Lado { teamId: string; club: string; marcador: number; registrados: number; faltan: number; sobran: number; goles: Gol[]; titulares: number }
interface Partido { id: string; faseId: string; jornada: string; jornadaNum: number; fecha: string | null; mesa: boolean; local: Lado; visitante: Lado }
interface Jugador { id: string; teamId: string; numero: number | null; nombre: string }
interface Datos { torneos: { id: string; nombre: string }[]; torneoId: string; fases: { id: string; nombre: string }[]; partidos: Partido[]; jugadores: Jugador[] }

const card = 'bg-slate-800 border border-slate-700 rounded-xl p-4 mb-3'
const chip = (on: boolean) => `px-3 py-1.5 rounded-lg text-sm font-semibold border ${on ? 'bg-yellow-500 text-black border-yellow-400' : 'bg-slate-700 border-slate-600 hover:bg-slate-600'}`

export default function AuditoriaGoles() {
  const [d, setD] = useState<Datos | null>(null)
  const [msg, setMsg] = useState('')
  const [fase, setFase] = useState('')
  const [club, setClub] = useState('')
  const [solo, setSolo] = useState(true)
  const [tipo, setTipo] = useState<'gol' | 'gol_penal' | 'autogol'>('gol')
  const [abierto, setAbierto] = useState<string | null>(null) // `${partidoId}|${teamId}` que se está completando
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async (tid?: string) => {
    const r = await fetch('/api/admin/auditoria-goles' + (tid ? `?torneoId=${tid}` : ''), { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setMsg(r?.message || 'No se pudo cargar (¿eres administrador?)'); return }
    setD(r)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function post(b: Record<string, unknown>) {
    setOcupado(true)
    const r = await fetch('/api/admin/auditoria-goles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Error de conexión' }))
    setOcupado(false)
    if (!r.ok) { alert(r.message); return }
    await cargar(d?.torneoId)
  }

  const nombreClub = useMemo(() => new Map((d?.partidos || []).flatMap((p) => [[p.local.teamId, p.local.club], [p.visitante.teamId, p.visitante.club]] as [string, string][])), [d])
  if (!d) return <div className="min-h-screen bg-slate-900 text-white p-8">{msg || 'Cargando…'}</div>

  const deFase = d.partidos.filter((p) => !fase || p.faseId === fase)
  const conFalta = (p: Partido) => p.local.faltan + p.visitante.faltan + p.local.sobran + p.visitante.sobran > 0 && !p.mesa
  const visibles = deFase.filter((p) => (!club || p.local.teamId === club || p.visitante.teamId === club) && (!solo || conFalta(p)))
  const faltanTot = deFase.filter((p) => !p.mesa).reduce((n, p) => n + p.local.faltan + p.visitante.faltan, 0)
  const porClub = Array.from(nombreClub.entries()).map(([id, nom]) => {
    const lados = deFase.filter((p) => !p.mesa).flatMap((p) => [p.local, p.visitante]).filter((l) => l.teamId === id)
    return { id, nom, partidos: lados.filter((l) => l.faltan > 0).length, goles: lados.reduce((n, l) => n + l.faltan, 0), sinAli: lados.filter((l) => !l.titulares).length }
  }).filter((x) => x.goles > 0).sort((a, b) => b.goles - a.goles)
  const fechas = Array.from(new Set(visibles.map((p) => p.jornadaNum))).sort((a, b) => a - b)

  const Lado = ({ p, l, rival }: { p: Partido; l: Lado; rival: Lado }) => {
    const k = `${p.id}|${l.teamId}`
    const plantel = d.jugadores.filter((j) => j.teamId === (tipo === 'autogol' ? rival.teamId : l.teamId))
    return (
      <div className="flex-1 min-w-[260px]">
        <p className="font-bold">{l.club} <span className="text-yellow-300">{l.marcador}</span>
          {l.faltan > 0 && !p.mesa && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-red-700">faltan {l.faltan}</span>}
          {l.sobran > 0 && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-orange-700">sobran {l.sobran}</span>}
          {l.faltan === 0 && l.sobran === 0 && l.marcador > 0 && <span className="ml-2 text-xs text-green-400">✔ completo</span>}
          {!l.titulares && <span className="ml-2 text-xs text-slate-400">· sin alineación</span>}</p>
        {l.goles.map((g) => (
          <p key={g.id} className="text-sm text-slate-200 flex items-center gap-2">⚽ {g.numero != null ? <b>#{g.numero}</b> : null} {g.jugador}{g.tipo === 'gol_penal' ? ' (penal)' : g.tipo === 'autogol' ? ' (autogol)' : ''}{g.minuto != null ? ` · ${g.minuto}'` : ''}
            <button className="text-red-400 text-xs" disabled={ocupado} onClick={() => confirm(`¿Quitar el gol de ${g.jugador}?`) && post({ accion: 'quitar', eventoId: g.id })}>✕</button></p>
        ))}
        {l.faltan > 0 && !p.mesa && (abierto === k ? (
          <div className="mt-2 p-2 rounded-lg bg-slate-900/70 border border-slate-600">
            <div className="flex gap-1 mb-2">{([['gol', 'Gol'], ['gol_penal', 'Penal'], ['autogol', 'Autogol del rival']] as const).map(([t, n]) => <button key={t} className={chip(tipo === t) + ' !text-xs'} onClick={() => setTipo(t)}>{n}</button>)}</div>
            <p className="text-xs text-slate-400 mb-1">Toca a quien marcó{tipo === 'autogol' ? ` (jugador de ${rival.club})` : ''}. Faltan {l.faltan}.</p>
            <div className="flex flex-wrap gap-1">
              {plantel.map((j) => <button key={j.id} disabled={ocupado} className="px-2 py-1 rounded bg-slate-700 hover:bg-yellow-500 hover:text-black text-xs disabled:opacity-40" onClick={() => post({ accion: 'agregar', partidoId: p.id, teamId: l.teamId, playerId: j.id, tipo })}><b>{j.numero ?? '–'}</b> {j.nombre.split(' ').slice(0, 2).join(' ')}</button>)}
              {!plantel.length && <span className="text-xs text-slate-400">Este club no tiene jugadores registrados.</span>}
            </div>
            <button className="text-xs text-slate-400 mt-2 underline" onClick={() => setAbierto(null)}>Cerrar</button>
          </div>
        ) : <button className="mt-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold" onClick={() => { setAbierto(k); setTipo('gol') }}>＋ Asignar goles</button>)}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">⚽ Auditoría de goleadores</h1>
        <p className="text-slate-400 mb-4">Compara el marcador de cada partido jugado con los goles que tienen jugador asignado. Toca «Asignar goles» y luego al jugador: no hace falta el minuto. El marcador del partido no cambia.</p>
        {d.torneos.length > 1 && <select className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm mb-3" value={d.torneoId} onChange={(e) => cargar(e.target.value)}>{d.torneos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select>}

        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          <div className={card + ' !mb-0'}><p className="text-xs text-slate-400 uppercase">Partidos jugados</p><p className="text-2xl font-bold">{deFase.length}</p></div>
          <div className={card + ' !mb-0'}><p className="text-xs text-slate-400 uppercase">Con goleadores incompletos</p><p className="text-2xl font-bold text-red-300">{deFase.filter(conFalta).length}</p></div>
          <div className={card + ' !mb-0'}><p className="text-xs text-slate-400 uppercase">Goles sin jugador</p><p className="text-2xl font-bold text-red-300">{faltanTot}</p></div>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <button className={chip(!fase)} onClick={() => setFase('')}>Todas las fases</button>
          {d.fases.map((f) => <button key={f.id} className={chip(fase === f.id)} onClick={() => setFase(f.id)}>{f.nombre}</button>)}
        </div>
        <div className="flex flex-wrap gap-3 items-center mb-4 text-sm">
          <select className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg" value={club} onChange={(e) => setClub(e.target.value)}><option value="">Todos los clubes</option>{Array.from(nombreClub.entries()).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          <label className="flex items-center gap-2"><input type="checkbox" checked={solo} onChange={(e) => setSolo(e.target.checked)} /> Solo partidos con faltantes</label>
        </div>

        {porClub.length > 0 && !club && (
          <details className={card} open>
            <summary className="cursor-pointer font-bold">Por club: goles sin jugador ({porClub.length} clubes)</summary>
            <div className="grid sm:grid-cols-2 gap-x-6 mt-2 text-sm">
              {porClub.map((c) => <button key={c.id} className="flex justify-between py-1 border-t border-slate-700 text-left hover:text-yellow-300" onClick={() => setClub(c.id)}><span>{c.nom}</span><span className="text-slate-300">{c.goles} gol(es) en {c.partidos} partido(s)</span></button>)}
            </div>
          </details>
        )}

        {!visibles.length && <p className="text-green-300">✔ No hay partidos con goleadores incompletos{fase || club ? ' con este filtro' : ''}.</p>}
        {fechas.map((n) => (
          <div key={n}>
            <h2 className="text-lg font-bold text-yellow-300 mt-5 mb-2">{visibles.find((p) => p.jornadaNum === n)?.jornada}</h2>
            {visibles.filter((p) => p.jornadaNum === n).map((p) => (
              <div key={p.id} className={card}>
                <div className="flex justify-between text-xs text-slate-400 mb-2"><span>{p.fecha || ''}{p.mesa ? ' · fallo de mesa (sus goles no cuentan)' : ''}</span><a className="underline" href={`/torneo/partido/${p.id}`} target="_blank" rel="noopener">ver partido ↗</a></div>
                <div className="flex flex-wrap gap-4"><Lado p={p} l={p.local} rival={p.visitante} /><Lado p={p} l={p.visitante} rival={p.local} /></div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
