'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

interface Club { id: string; nombre: string; total: number; numeros: number[] }
const inp = 'w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm'
const btn = 'px-5 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold'
const POS = ['Portero', 'Defensa', 'Mediocampista', 'Delantero']

export default function NuevoJugador() {
  const [clubes, setClubes] = useState<Club[]>([])
  const [max, setMax] = useState(40)
  const [msg, setMsg] = useState('Cargando…')
  const [ok, setOk] = useState<{ id: string; qr: string; nombre: string; club: string; fotos: number } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [f, setF] = useState({ equipoId: '', nombres: '', apellidos: '', cedula: '', extranjero: false, nacimiento: '', numero: '', posicion: '', telefono: '', password: '', superarTope: false })
  const [fotos, setFotos] = useState<Record<string, File | null>>({ selfie: null, cedula_front: null, cedula_back: null })

  const cargar = () => fetch('/api/admin/jugadores/nuevo', { cache: 'no-store' }).then((r) => r.json()).then((r) => { if (!r.ok) { setMsg(r.message || 'Solo el administrador'); return } setClubes(r.clubes); setMax(r.max); setMsg('') }).catch(() => setMsg('Sin conexión'))
  useEffect(() => { cargar() }, [])
  const club = useMemo(() => clubes.find((c) => c.id === f.equipoId), [clubes, f.equipoId])
  const numOcupado = club && f.numero !== '' && club.numeros.includes(Number(f.numero))
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }))

  async function guardar() {
    setEnviando(true); setMsg('')
    const d = new FormData()
    for (const [k, v] of Object.entries(f)) d.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : v)
    for (const [k, v] of Object.entries(fotos)) if (v) d.append(k, v)
    const r = await fetch('/api/admin/jugadores/nuevo', { method: 'POST', body: d }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Sin conexión' }))
    setEnviando(false)
    if (!r.ok) { setMsg(r.message); return }
    setOk(r); setF({ ...f, nombres: '', apellidos: '', cedula: '', nacimiento: '', numero: '', posicion: '', telefono: '', password: '', superarTope: false }); setFotos({ selfie: null, cedula_front: null, cedula_back: null }); cargar()
  }

  const Foto = ({ k, t }: { k: string; t: string }) => (
    <label className="block bg-slate-900/50 border border-dashed border-slate-600 rounded-lg p-3 text-sm cursor-pointer hover:border-yellow-400">
      <span className="font-semibold">{t}</span>
      <span className="block text-xs text-slate-400 mt-1">{fotos[k] ? `✓ ${fotos[k]!.name}` : 'Toca para elegir (opcional)'}</span>
      <input type="file" accept="image/*" className="hidden" onChange={(e) => setFotos({ ...fotos, [k]: e.target.files?.[0] || null })} />
    </label>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-2xl mx-auto px-5 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">➕ Agregar jugador</h1>
        <p className="text-slate-400 mb-5">Inscribe a un jugador nuevo en un club, en cualquier fase. Queda <b>pendiente</b> hasta que lo habilites. Solo el administrador, confirmando con su contraseña.</p>

        {ok && (
          <div className="bg-green-900/40 border border-green-600 rounded-xl p-4 mb-5 text-sm">
            <b>{ok.nombre}</b> quedó inscrito en <b>{ok.club}</b> ({ok.fotos} foto{ok.fotos === 1 ? '' : 's'}).
            <div className="flex gap-3 mt-2 flex-wrap">
              <Link className="underline text-yellow-300" href={`/admin/jugadores/${ok.id}`}>Ver ficha y habilitar</Link>
              <a className="underline text-yellow-300" href={`/j/${ok.qr}`} target="_blank">Ver carnet / QR ↗</a>
              <Link className="underline text-yellow-300" href="/admin/encuadre">Encuadrar la foto</Link>
            </div>
          </div>
        )}
        {msg && <div className="bg-red-900/40 border border-red-600 rounded-lg p-3 mb-4 text-sm">{msg}</div>}

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
          <label className="block text-sm">Club
            <select className={inp + ' mt-1'} value={f.equipoId} onChange={(e) => set('equipoId', e.target.value)}>
              <option value="">— Elige el club —</option>
              {clubes.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.total} jugadores)</option>)}
            </select>
          </label>
          {club && club.total >= max && (
            <label className="flex items-center gap-2 text-sm text-yellow-300"><input type="checkbox" checked={f.superarTope} onChange={(e) => set('superarTope', e.target.checked)} /> {club.nombre} ya tiene {club.total} jugadores (tope {max}). Superar el tope (autorizado).</label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Nombres<input className={inp + ' mt-1'} value={f.nombres} onChange={(e) => set('nombres', e.target.value)} /></label>
            <label className="block text-sm">Apellidos<input className={inp + ' mt-1'} value={f.apellidos} onChange={(e) => set('apellidos', e.target.value)} /></label>
            <label className="block text-sm">{f.extranjero ? 'Pasaporte / documento' : 'Cédula'}<input className={inp + ' mt-1'} inputMode={f.extranjero ? 'text' : 'numeric'} value={f.cedula} onChange={(e) => set('cedula', e.target.value)} /></label>
            <label className="block text-sm">Fecha de nacimiento<input type="date" className={inp + ' mt-1'} value={f.nacimiento} onChange={(e) => set('nacimiento', e.target.value)} /></label>
            <label className="block text-sm">Número de camiseta<input className={inp + ' mt-1'} inputMode="numeric" value={f.numero} onChange={(e) => set('numero', e.target.value.replace(/\D/g, ''))} />
              {numOcupado && <span className="text-xs text-red-300">Ese número ya está ocupado en {club!.nombre}.</span>}
              {club && !numOcupado && <span className="text-xs text-slate-400">Ocupados: {club.numeros.slice(0, 40).join(', ') || 'ninguno'}</span>}
            </label>
            <label className="block text-sm">Posición<select className={inp + ' mt-1'} value={f.posicion} onChange={(e) => set('posicion', e.target.value)}><option value="">—</option>{POS.map((p) => <option key={p}>{p}</option>)}</select></label>
            <label className="block text-sm col-span-2">Teléfono (opcional)<input className={inp + ' mt-1'} inputMode="tel" value={f.telefono} onChange={(e) => set('telefono', e.target.value)} /></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.extranjero} onChange={(e) => set('extranjero', e.target.checked)} /> Pasaporte / documento extranjero (no valida la cédula ecuatoriana)</label>
          <div className="grid grid-cols-3 gap-3">
            <Foto k="selfie" t="Foto (selfie)" />
            <Foto k="cedula_front" t="Cédula frente" />
            <Foto k="cedula_back" t="Cédula reverso" />
          </div>
          <label className="block text-sm">Tu contraseña de administrador (para confirmar)
            <input type="password" autoComplete="current-password" className={inp + ' mt-1'} value={f.password} onChange={(e) => set('password', e.target.value)} />
          </label>
          <button className={btn} disabled={enviando || !f.equipoId || !f.nombres || !f.apellidos || !f.cedula || !f.nacimiento || !f.password || !!numOcupado} onClick={guardar}>{enviando ? 'Guardando…' : 'Inscribir jugador'}</button>
        </div>
      </div>
    </div>
  )
}
