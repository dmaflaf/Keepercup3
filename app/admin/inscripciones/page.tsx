'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface Aut { id: string; teamId: string; equipo: string; codigo: string; hasta: string; nota?: string }
interface Ret { cedula: string; tipo: 'nuevo' | 'cambio'; equipo: string; nombre: string; numero: number | null; numeroPrevio?: number | null; equipoPrevio?: string | null; recibido: string }
interface Datos { abiertas: boolean; cierre: string | null; autorizaciones: Aut[]; clubes: { id: string; name: string }[]; retenidos: Ret[]; recientes: { id: string; nombre: string; numero: number | null; equipo: string; creado: string; manual: boolean }[] }

const card = 'bg-slate-800 border border-slate-700 rounded-xl p-5 mb-5'
const inp = 'px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm'
const btn = 'px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm'
const btn2 = 'px-3 py-1.5 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg text-xs'
const cuando = (s: string) => new Date(s).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'medium', timeStyle: 'short' })

export default function Inscripciones() {
  const [d, setD] = useState<Datos | null>(null)
  const [msg, setMsg] = useState('')
  const [clave, setClave] = useState('')
  const [aut, setAut] = useState({ teamId: '', horas: '24', nota: '' })
  const [nuevo, setNuevo] = useState<Aut | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/admin/inscripciones', { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setMsg(r?.message || 'No se pudo cargar (¿eres administrador?)'); return }
    setD(r)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function post(b: Record<string, unknown>) {
    if (!clave) { alert('Escribe tu contraseña de administrador arriba.'); return null }
    const r = await fetch('/api/admin/inscripciones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...b, password: clave }) }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Error de conexión' }))
    if (!r.ok) alert(r.message || 'No se pudo')
    else { if (r.message) setMsg(r.message); await cargar() }
    return r
  }
  const enlace = (a: Aut, pagina: string) => `${location.origin}/${pagina}?codigo=${a.codigo}`

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-4xl mx-auto px-5 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">🔒 Inscripciones</h1>
        <p className="text-slate-400 mb-5">Controla los formularios de inscripción de equipos, jugadores y números de camiseta. Con las inscripciones cerradas, lo que alguien envíe NO entra al sistema: queda en «Por aprobar» hasta que tú lo apruebes.</p>
        {msg && <p className="bg-slate-800 border border-slate-600 rounded-lg p-3 mb-4 text-sm" onClick={() => setMsg('')}>{msg}</p>}
        <label className="block text-sm mb-5">Tu contraseña de administrador (para cualquier cambio en esta página)
          <input type="password" autoComplete="current-password" className={inp + ' block mt-1 w-full max-w-xs'} value={clave} onChange={(e) => setClave(e.target.value)} /></label>

        {d && (<>
          <div className={card + (d.abiertas ? ' !border-green-600' : ' !border-red-600')}>
            <h2 className="text-xl font-bold">{d.abiertas ? '🟢 Inscripciones ABIERTAS' : '🔴 Inscripciones CERRADAS'}</h2>
            <p className="text-sm text-slate-300 mt-1">{d.abiertas ? 'Cualquiera con el enlace puede inscribir jugadores y cambiar números.' : `Los formularios muestran «Inscripciones cerradas». Nada nuevo entra al sistema sin tu aprobación.${d.cierre ? ` Cerradas desde el ${cuando(d.cierre)}.` : ''}`}</p>
            <button className={btn + ' mt-3'} onClick={() => confirm(d.abiertas ? '¿Cerrar las inscripciones?' : '¿Abrir las inscripciones para TODOS?') && post({ accion: d.abiertas ? 'cerrar' : 'abrir' })}>{d.abiertas ? '🔒 Cerrar inscripciones' : '🔓 Abrir para todos'}</button>
          </div>

          <div className={card}>
            <h2 className="text-xl font-bold mb-1">✅ Autorizar a un club</h2>
            <p className="text-sm text-slate-400 mb-3">Para que un DT inscriba o cambie números por un tiempo. Se genera un código y un enlace que solo abre los formularios para ese club; lo que envíe ese club entra directo mientras dure la autorización.</p>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-xs">Club<select className={inp + ' block mt-1'} value={aut.teamId} onChange={(e) => setAut({ ...aut, teamId: e.target.value })}><option value="">— Elige —</option>{d.clubes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="text-xs">Horas<input type="number" min={1} max={168} className={inp + ' block mt-1 w-20'} value={aut.horas} onChange={(e) => setAut({ ...aut, horas: e.target.value })} /></label>
              <label className="text-xs flex-1 min-w-40">Nota (opcional)<input className={inp + ' block mt-1 w-full'} placeholder="ej. 2 jugadores aprobados por la organización" value={aut.nota} onChange={(e) => setAut({ ...aut, nota: e.target.value })} /></label>
              <button className={btn} disabled={!aut.teamId} onClick={async () => { const r = await post({ accion: 'autorizar', ...aut, horas: Number(aut.horas) }); if (r?.ok) setNuevo(r.autorizacion) }}>Autorizar</button>
            </div>
            {nuevo && (
              <div className="mt-3 p-3 rounded-lg bg-green-900/30 border border-green-700 text-sm">
                <p><b>{nuevo.equipo}</b> autorizado hasta el {cuando(nuevo.hasta)}. Código: <b className="text-yellow-300 text-lg">{nuevo.codigo}</b></p>
                <p className="mt-1">Envía al DT el enlace que necesite:</p>
                {[['keeper-cup-jugador.html', 'Inscripción de jugadores'], ['keeper-cup-numeros.html', 'Números de camiseta']].map(([pg, t]) => (
                  <p key={pg} className="mt-1 break-all"><span className="text-slate-300">{t}:</span> <a className="underline text-yellow-300" href={enlace(nuevo, pg)} target="_blank" rel="noopener">{enlace(nuevo, pg)}</a> <button className={btn2} onClick={() => navigator.clipboard?.writeText(enlace(nuevo, pg))}>Copiar</button></p>
                ))}
              </div>
            )}
            {d.autorizaciones.length > 0 && <div className="mt-4">
              <p className="text-sm font-semibold mb-1">Autorizaciones vigentes</p>
              {d.autorizaciones.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-2 py-2 border-t border-slate-700 text-sm">
                  <b>{a.equipo}</b><span className="text-yellow-300">{a.codigo}</span><span className="text-slate-400">hasta {cuando(a.hasta)}{a.nota ? ` · ${a.nota}` : ''}</span>
                  <button className={btn2 + ' ml-auto'} onClick={() => navigator.clipboard?.writeText(enlace(a, 'keeper-cup-jugador.html'))}>Copiar enlace</button>
                  <button className={btn2} onClick={() => confirm(`¿Quitar la autorización de ${a.equipo}?`) && post({ accion: 'revocar', id: a.id })}>Quitar</button>
                </div>))}
            </div>}
          </div>

          <div className={card}>
            <h2 className="text-xl font-bold mb-1">⏳ Por aprobar ({d.retenidos.length})</h2>
            <p className="text-sm text-slate-400 mb-3">Lo que llegó de los formularios con las inscripciones cerradas. No está en el sistema hasta que lo apruebes. «Rechazar» lo descarta.</p>
            {!d.retenidos.length && <p className="text-sm text-slate-400">No hay nada pendiente.</p>}
            {d.retenidos.map((r) => (
              <div key={r.cedula + r.tipo} className="flex flex-wrap items-center gap-2 py-2 border-t border-slate-700 text-sm">
                <span className={`text-xs px-2 py-0.5 rounded ${r.tipo === 'nuevo' ? 'bg-blue-700' : 'bg-orange-700'}`}>{r.tipo === 'nuevo' ? 'Jugador nuevo' : r.equipoPrevio && r.equipoPrevio !== r.equipo ? 'Cambio de club' : 'Cambio de número'}</span>
                <span><b>{r.nombre}</b> · {r.equipo}{r.tipo === 'nuevo' ? (r.numero != null ? ` · #${r.numero}` : '') : r.equipoPrevio && r.equipoPrevio !== r.equipo ? ` (antes en ${r.equipoPrevio})` : ` · #${r.numeroPrevio ?? '—'} → #${r.numero ?? '—'}`}</span>
                <span className="text-xs text-slate-400">{cuando(r.recibido)}</span>
                <span className="ml-auto flex gap-1">
                  <button className={btn2 + ' !bg-green-700'} onClick={() => confirm(`¿Aprobar: ${r.nombre}?`) && post({ accion: 'aprobar', cedula: r.cedula, tipo: r.tipo })}>Aprobar</button>
                  <button className={btn2} onClick={() => confirm(`¿Rechazar: ${r.nombre}?`) && post({ accion: 'rechazar', cedula: r.cedula, tipo: r.tipo })}>Rechazar</button>
                </span>
              </div>))}
          </div>

          <div className={card}>
            <h2 className="text-xl font-bold mb-1">🕵️ Jugadores que entraron después del cierre ({d.recientes.length})</h2>
            <p className="text-sm text-slate-400 mb-3">{d.cierre ? `Creados después del ${cuando(d.cierre)}. Revisa los que no autorizaste: desde su ficha puedes eliminarlos (con tu contraseña y el motivo).` : 'Al cerrar las inscripciones puedes elegir la fecha de cierre; aquí aparecerán los jugadores creados después.'}</p>
            {d.recientes.map((j) => (
              <div key={j.id} className="flex flex-wrap items-center gap-2 py-2 border-t border-slate-700 text-sm">
                <Link className="underline" href={`/admin/jugadores/${j.id}`}>{j.nombre}</Link><span className="text-slate-300">{j.equipo}{j.numero != null ? ` · #${j.numero}` : ''}</span>
                <span className="text-xs text-slate-400 ml-auto">{cuando(j.creado)}{j.manual ? ' · creado o editado en el panel' : ' · desde el formulario'}</span>
              </div>))}
            <FechaCierre onFijar={(f) => post({ accion: 'cerrar', cierre: f })} />
          </div>
        </>)}
      </div>
    </div>
  )
}

function FechaCierre({ onFijar }: { onFijar: (f: string) => void }) {
  const [f, setF] = useState('')
  return (
    <div className="flex flex-wrap gap-2 items-end mt-4 pt-3 border-t border-slate-700">
      <label className="text-xs">Fecha de cierre de inscripciones (para revisar lo que entró después)<input type="date" className={inp + ' block mt-1'} value={f} onChange={(e) => setF(e.target.value)} /></label>
      <button className={btn2 + ' !py-2'} disabled={!f} onClick={() => confirm(`¿Cerrar las inscripciones con fecha ${f}?`) && onFijar(f + 'T23:59:59-05:00')}>Fijar fecha de cierre</button>
    </div>
  )
}
