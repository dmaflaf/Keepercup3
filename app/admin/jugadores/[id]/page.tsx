'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Ficha {
  id: string
  nombre: string
  equipo: string
  numero: number | null
  posicion: string | null
  estado: string
  fechaNacimiento: string | null
  cedula: string | null
  correo: string | null
  telefono: string | null
  fotos: { selfie: boolean; cedula_front: boolean; cedula_back: boolean }
}

export default function FichaPage({ params }: { params: { id: string } }) {
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [rol, setRol] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState('')
  const [version, setVersion] = useState(0) // para que el navegador muestre la foto nueva

  const cargar = () =>
    fetch(`/api/admin/jugadores/${params.id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) setError(d.message || 'No se pudo cargar')
        else {
          setFicha(d.jugador)
          setRol(d.rol)
        }
      })
      .catch(() => setError('Error de conexión'))
  useEffect(() => { cargar() }, [params.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reduce la foto en el navegador (las del teléfono pesan varios MB) y la sube
  async function subir(kind: string, archivo: File) {
    setSubiendo(kind)
    try {
      const img = await new Promise<HTMLImageElement>((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = URL.createObjectURL(archivo) })
      const max = kind === 'selfie' ? 1200 : 1600, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.88))
      if (!blob) throw new Error()
      const fd = new FormData(); fd.append('playerId', params.id); fd.append('kind', kind); fd.append('file', blob, 'foto.jpg')
      const r = await fetch('/api/admin/cargar/foto', { method: 'POST', body: fd }).then((x) => x.json())
      if (!r.ok) alert(r.message || 'No se pudo subir la foto')
      else { setVersion((v) => v + 1); await cargar() }
    } catch { alert('No se pudo leer la foto. Usa una imagen JPG o PNG.') }
    setSubiendo('')
  }
  const botonSubir = (kind: string, hay: boolean) => rol === 'admin' && (
    <label className={`inline-block mt-3 px-3 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer ${subiendo === kind ? 'bg-slate-600 opacity-60' : hay ? 'bg-slate-600 hover:bg-slate-500' : 'bg-red-600 hover:bg-red-700'}`}>
      {subiendo === kind ? 'Subiendo…' : hay ? '🔄 Cambiar foto' : '📷 Subir foto'}
      <input type="file" accept="image/*" className="hidden" disabled={!!subiendo} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subir(kind, f) }} />
    </label>
  )

  async function cambiarEstado(estado: string) {
    setGuardando(true)
    const r = await fetch(`/api/admin/jugadores/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    }).then((x) => x.json())
    if (r.ok && ficha) setFicha({ ...ficha, estado })
    setGuardando(false)
  }

  const foto = (tipo: string, titulo: string) => (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
      <div className="text-slate-400 text-sm mb-2">{titulo}</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/admin/fotos/${params.id}/${tipo}?v=${version}`} alt={titulo} className="w-full rounded-lg bg-slate-900 min-h-24"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
      {botonSubir(tipo, true)}
    </div>
  )

  const dato = (t: string, v: string | number | null) => (
    <div><div className="text-slate-400 text-xs uppercase">{t}</div><div>{v ?? '—'}</div></div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Link href="/admin/jugadores" className="text-slate-400 text-sm hover:text-white">← Volver a jugadores</Link>
        {error && <p className="mt-4 text-red-300">{error}</p>}
        {ficha && (
          <>
            <h1 className="text-3xl font-bold mt-3">{ficha.nombre}</h1>
            <p className="text-slate-400 mb-6">{ficha.equipo}</p>

            <div className="grid md:grid-cols-3 gap-6">
              <div>{ficha.fotos.selfie ? foto('selfie', 'Foto carnet') : <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-slate-400">Foto carnet pendiente<br />{botonSubir('selfie', false)}</div>}</div>
              <div className="md:col-span-2 grid grid-cols-2 gap-4 content-start bg-slate-800 border border-slate-700 rounded-xl p-5">
                {dato('Número', ficha.numero)}
                {dato('Posición', ficha.posicion)}
                {dato('Fecha de nacimiento', ficha.fechaNacimiento)}
                {rol === 'admin' && dato('Cédula', ficha.cedula)}
                {rol === 'admin' && dato('Correo', ficha.correo)}
                {rol === 'admin' && dato('Teléfono', ficha.telefono)}
                <div className="col-span-2">
                  <div className="text-slate-400 text-xs uppercase mb-1">Estado</div>
                  {rol === 'admin' ? (
                    <div className="flex gap-2">
                      {['pendiente', 'habilitado', 'suspendido'].map((e) => (
                        <button key={e} disabled={guardando} onClick={() => cambiarEstado(e)}
                          className={`px-3 py-1 rounded-lg text-sm capitalize ${ficha.estado === e ? (e === 'habilitado' ? 'bg-green-600' : e === 'suspendido' ? 'bg-red-600' : 'bg-amber-600') : 'bg-slate-700'}`}>
                          {e}
                        </button>
                      ))}
                    </div>
                  ) : <span className="capitalize">{ficha.estado}</span>}
                </div>
              </div>
            </div>

            {rol === 'admin' && (
              <div className="grid md:grid-cols-2 gap-6 mt-6">
                {ficha.fotos.cedula_front ? foto('cedula_front', 'Cédula (frente)') : <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-slate-400">Cédula frente pendiente<br />{botonSubir('cedula_front', false)}</div>}
                {ficha.fotos.cedula_back ? foto('cedula_back', 'Cédula (reverso)') : <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-slate-400">Cédula reverso pendiente<br />{botonSubir('cedula_back', false)}</div>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
