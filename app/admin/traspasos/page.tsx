'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface Eq { id: string; name: string }
interface Jug { id: string; nombre: string; cedula: string | null; numero: number | null; clubId: string; club: string; eventos: number; pases: number }
interface Hist { id: string; jugador: string; deClub: string; aClub: string; numeroAnterior: number | null; numeroNuevo: number | null; motivo: string | null; usuario: string; carnetReimpreso: boolean; createdAt: string }

const inp = 'px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm'
const btn = 'px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm'
const btn2 = 'px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg text-sm'
const sec = 'bg-slate-800 border border-slate-700 rounded-xl p-5 mb-5'

export default function Traspasos() {
  const [equipos, setEquipos] = useState<Eq[]>([])
  const [historial, setHistorial] = useState<Hist[]>([])
  const [ventana, setVentana] = useState<{ abierta: boolean; hasta: string | null; activa: boolean } | null>(null)
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<Jug[] | null>(null)
  const [jug, setJug] = useState<Jug | null>(null)
  const [aClub, setAClub] = useState('')
  const [numero, setNumero] = useState('')
  const [motivo, setMotivo] = useState('')
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/admin/traspasos', { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setMsg(r?.message || 'No se pudo cargar (¿eres administrador?)'); return }
    setEquipos(r.equipos); setHistorial(r.historial); setVentana(r.ventana)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const post = async (datos: Record<string, unknown>) => fetch('/api/admin/traspasos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Error de conexión' }))

  async function buscar() {
    if (q.trim().length < 3) { setMsg('Escribe al menos 3 letras del nombre o 4 números de la cédula.'); return }
    setMsg(''); setJug(null)
    const r = await fetch('/api/admin/traspasos?q=' + encodeURIComponent(q.trim()), { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    setResultados(r?.ok ? r.jugadores : [])
  }

  async function traspasar() {
    if (!jug || !aClub) return
    const destino = equipos.find((e) => e.id === aClub)?.name
    if (!confirm(`¿Pasar a ${jug.nombre} de ${jug.club} a ${destino}?\n\nEs su único traspaso del torneo y no podrá cambiar de nuevo. Su carnet impreso habrá que reimprimirlo.`)) return
    setOcupado(true)
    const r = await post({ accion: 'traspasar', playerId: jug.id, aTeamId: aClub, numero, motivo })
    setOcupado(false)
    if (!r.ok) { alert(r.message || 'No se pudo hacer el traspaso'); return }
    setMsg(`✔ ${r.nombre} pasó de ${r.de} a ${r.a}. Reimprime su carnet (aparece marcado en Carnets y en su ficha).`)
    setJug(null); setResultados(null); setQ(''); setAClub(''); setNumero(''); setMotivo('')
    cargar()
  }

  async function ventanaGuardar(abierta: boolean, hasta: string | null) {
    const r = await post({ accion: 'ventana', abierta, hasta })
    if (!r.ok) setMsg(r.message || 'No se pudo guardar')
    cargar()
  }

  const fecha = (s: string) => new Date(s).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">🔁 Traspasos</h1>
        <p className="text-slate-400 mb-5">Cambia a un jugador de club sin perder su QR, sus fotos ni su historial. <b>Reglas:</b> solo el administrador · solo en la fase preliminar y la Fase 1 · un único traspaso por jugador · quien ya tiene partidos registrados no puede cambiar de club.</p>
        {msg && <div className="bg-slate-700 border border-slate-500 rounded-lg p-3 mb-4 text-sm" onClick={() => setMsg('')}>{msg}</div>}

        {ventana && (
          <section className={sec}>
            <h2 className="font-bold mb-2">Ventana de pases: <span className={ventana.activa ? 'text-green-400' : 'text-red-400'}>{ventana.activa ? 'ABIERTA' : 'CERRADA'}</span></h2>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button className={btn2} onClick={() => ventanaGuardar(!ventana.abierta, ventana.hasta)}>{ventana.abierta ? 'Cerrar ventana' : 'Abrir ventana'}</button>
              <label className="flex items-center gap-2 text-slate-300">Cierra sola el día
                <input type="date" className={inp} value={ventana.hasta || ''} onChange={(e) => ventanaGuardar(ventana.abierta, e.target.value || null)} />
              </label>
              <span className="text-slate-400">Ciérrala al terminar la Fase 1.</span>
            </div>
          </section>
        )}

        <section className={sec}>
          <h2 className="font-bold mb-3">1. Buscar al jugador</h2>
          <div className="flex gap-2 flex-wrap">
            <input className={inp + ' flex-1 min-w-[14rem]'} placeholder="Nombre, apellido o cédula" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} />
            <button className={btn} onClick={buscar}>Buscar</button>
          </div>
          {resultados && !resultados.length && <p className="text-slate-400 text-sm mt-3">No se encontró a nadie con ese dato.</p>}
          {resultados && resultados.map((r) => {
            const bloqueo = r.pases > 0 ? 'Ya tuvo su único traspaso' : r.eventos > 0 ? `Ya tiene ${r.eventos} registro(s) en partidos` : ''
            return (
              <div key={r.id} className={`mt-2 flex items-center gap-3 flex-wrap border rounded-lg px-3 py-2 ${jug?.id === r.id ? 'border-yellow-400 bg-slate-700' : 'border-slate-600'}`}>
                <span className="flex-1 min-w-[12rem]"><b>{r.nombre}</b> <span className="text-slate-400 text-sm">· {r.club} · N.º {r.numero ?? 's/n'} · {r.cedula}</span></span>
                {bloqueo ? <span className="text-red-300 text-sm">⛔ {bloqueo}</span> : <button className={btn2} onClick={() => { setJug(r); setAClub(''); setNumero('') }}>Elegir</button>}
              </div>
            )
          })}
        </section>

        {jug && (
          <section className={sec}>
            <h2 className="font-bold mb-3">2. Pasar a {jug.nombre} <span className="text-slate-400 font-normal">(de {jug.club})</span></h2>
            <div className="grid md:grid-cols-3 gap-3 text-sm">
              <label className="block">Club de destino
                <select className={inp + ' w-full mt-1'} value={aClub} onChange={(e) => setAClub(e.target.value)}>
                  <option value="">— elegir —</option>
                  {equipos.filter((e) => e.id !== jug.clubId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </label>
              <label className="block">Número nuevo (libre en ese club)
                <input className={inp + ' w-full mt-1'} inputMode="numeric" placeholder="ej. 10" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, '').slice(0, 2))} />
              </label>
              <label className="block">Motivo (opcional)
                <input className={inp + ' w-full mt-1'} placeholder="ej. acuerdo entre clubes" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </label>
            </div>
            <div className="flex gap-2 mt-4"><button className={btn} disabled={ocupado || !aClub} onClick={traspasar}>Hacer el traspaso</button><button className={btn2} onClick={() => setJug(null)}>Cancelar</button></div>
          </section>
        )}

        <section className={sec}>
          <h2 className="font-bold mb-3">Historial de traspasos ({historial.length})</h2>
          {!historial.length && <p className="text-slate-400 text-sm">Todavía no hay traspasos.</p>}
          {historial.map((h) => (
            <div key={h.id} className="border-t border-slate-700 py-3 text-sm flex items-center gap-3 flex-wrap">
              <span className="flex-1 min-w-[16rem]">
                <b>{h.jugador}</b> · {h.deClub} {h.numeroAnterior !== null && `(N.º ${h.numeroAnterior})`} → <b>{h.aClub}</b> {h.numeroNuevo !== null && `(N.º ${h.numeroNuevo})`}
                <span className="text-slate-400 block">{fecha(h.createdAt)} · {h.usuario}{h.motivo && ` · ${h.motivo}`}</span>
              </span>
              <label className="flex items-center gap-2"><input type="checkbox" checked={h.carnetReimpreso} onChange={async (e) => { await post({ accion: 'reimpreso', id: h.id, valor: e.target.checked }); cargar() }} /> {h.carnetReimpreso ? <span className="text-green-400">Carnet reimpreso</span> : <span className="text-yellow-300">Falta reimprimir carnet</span>}</label>
              <button className="text-red-400 underline text-xs" onClick={async () => { if (!confirm('¿Deshacer este traspaso y devolver al jugador a su club anterior?')) return; const r = await post({ accion: 'deshacer', id: h.id }); if (!r.ok) alert(r.message); cargar() }}>Deshacer</button>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
