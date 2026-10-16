'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface Club { id: string; nombre: string; ciudad: string; estado: string; escudo: boolean; director: string; telefono: string; total: number; habilitados: number; conFoto: number; conCedulas: number }

export default function Clubes() {
  const [clubes, setClubes] = useState<Club[]>([])
  const [msg, setMsg] = useState('Cargando…')
  const [q, setQ] = useState('')

  const [version, setVersion] = useState(0) // cambia al subir un escudo para recargar la imagen
  const [edit, setEdit] = useState<{ id: string; nombre: string; ciudad: string; director: string; telefono: string; correo: string; estado: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(() => {
    fetch('/api/admin/clubes', { cache: 'no-store' }).then((r) => r.json()).then((r) => { if (r.ok) { setClubes(r.clubes); setMsg('') } else setMsg(r.message || 'No autorizado') }).catch(() => setMsg('Sin conexión'))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function abrirEditor(id: string) {
    const r = await fetch(`/api/admin/clubes/${id}`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { alert(r?.message || 'No se pudo abrir el club'); return }
    const c = r.club
    setEdit({ id: c.id, nombre: c.name, ciudad: c.city === '-' ? '' : c.city, director: c.directorName === '-' ? '' : c.directorName, telefono: c.contactPhone || '', correo: c.contactEmail || '', estado: c.estado })
  }
  async function guardar() {
    if (!edit) return
    setOcupado(true)
    const r = await fetch(`/api/admin/clubes/${edit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edit) }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Error de conexión' }))
    setOcupado(false)
    if (!r.ok) { alert(r.message || 'No se pudo guardar'); return }
    setEdit(null); setMsg('Club guardado.'); cargar()
  }
  async function subirEscudo(id: string, file: File | undefined) {
    if (!file) return
    const fd = new FormData(); fd.append('file', file)
    const r = await fetch(`/api/admin/clubes/${id}/escudo`, { method: 'POST', body: fd }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Error de conexión' }))
    if (!r.ok) { alert(r.message || 'No se pudo subir el escudo'); return }
    setVersion(Date.now()); cargar()
  }
  async function quitarEscudo(id: string) {
    if (!confirm('¿Quitar el escudo de este club?')) return
    await fetch(`/api/admin/clubes/${id}/escudo`, { method: 'DELETE' }); setVersion(Date.now()); cargar()
  }
  async function eliminar(c: Club) {
    if (!confirm(`¿Eliminar el club ${c.nombre}?\n\nEsta acción no se puede deshacer.`)) return
    let cuerpo: Record<string, unknown> = {}
    if (c.total > 0) {
      const t = prompt(`${c.nombre} tiene ${c.total} jugador(es) y SE ELIMINARÁN TAMBIÉN (con sus fotos).\n\nPara confirmar escribe el nombre exacto del club:`)
      if (t === null) return
      cuerpo = { eliminarJugadores: true, confirmarNombre: t }
    }
    setOcupado(true)
    const r = await fetch(`/api/admin/clubes/${c.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Error de conexión' }))
    setOcupado(false)
    if (!r.ok) { alert(r.message || 'No se pudo eliminar'); return }
    setMsg(`Club eliminado: ${r.nombre}${r.jugadoresEliminados ? ` (y ${r.jugadoresEliminados} jugadores)` : ''}.`); cargar()
  }

  const vis = clubes.filter((c) => c.nombre.toLowerCase().includes(q.toLowerCase()) || (c.director || '').toLowerCase().includes(q.toLowerCase()))
  const suma = (k: 'total' | 'habilitados' | 'conFoto' | 'conCedulas') => vis.reduce((n, c) => n + c[k], 0)

  const csv = () => {
    const filas = [['N.º', 'Club', 'Ciudad', 'Director', 'Teléfono', 'Jugadores', 'Habilitados', 'Con foto', 'Con cédulas', 'Escudo'], ...vis.map((c, i) => [String(i + 1), c.nombre, c.ciudad, c.director, c.telefono, String(c.total), String(c.habilitados), String(c.conFoto), String(c.conCedulas), c.escudo ? 'Sí' : 'No'])]
    const blob = new Blob(['﻿' + filas.map((f) => f.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'clubes-keeper-cup.csv'; a.click()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">🏟️ Clubes registrados ({clubes.length})</h1>
        <p className="text-slate-400 mb-4">Todos los clubes del sistema con el avance de su nómina.</p>
        <div className="flex gap-2 flex-wrap mb-4">
          <input className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm flex-1 min-w-[14rem]" placeholder="Buscar club o director" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm" onClick={csv} disabled={!vis.length}>⬇ Descargar listado (Excel/CSV)</button>
        </div>
        {msg && <p className="text-slate-300">{msg}</p>}
        {!!clubes.length && (
          <div className="overflow-x-auto bg-slate-800 border border-slate-700 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-400"><tr><th className="p-3">#</th><th>Club</th><th>Ciudad</th><th>Director</th><th>Teléfono</th><th className="text-center">Jugadores</th><th className="text-center">Habilitados</th><th className="text-center">Fotos</th><th className="text-center">Cédulas</th><th className="text-center">Escudo</th><th></th></tr></thead>
              <tbody>
                {vis.map((c, i) => (
                  <tr key={c.id} className="border-t border-slate-700">
                    <td className="p-3 text-slate-400">{i + 1}</td><td className="font-semibold"><span className="inline-flex items-center gap-3"><Escudo id={c.id} tiene={c.escudo} nombre={c.nombre} v={version} />{c.nombre}</span></td><td>{c.ciudad}</td><td>{c.director}</td><td>{c.telefono}</td>
                    <td className={`text-center ${c.total === 0 ? 'text-red-400' : c.total < 11 ? 'text-yellow-300' : ''}`}>{c.total}</td>
                    <td className="text-center">{c.habilitados}</td><td className="text-center">{c.conFoto}</td><td className="text-center">{c.conCedulas}</td>
                    <td className="text-center">{c.escudo ? <span className="text-green-400">✔</span> : <span className="text-red-400">✖</span>}</td>
                    <td className="text-right whitespace-nowrap pr-3"><button className="px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded text-xs mr-1" onClick={() => abrirEditor(c.id)}>✏️ Editar</button><button className="px-2 py-1 bg-slate-600 hover:bg-red-700 rounded text-xs" disabled={ocupado} onClick={() => eliminar(c)}>🗑 Eliminar</button></td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-500 font-bold"><td className="p-3" colSpan={5}>Totales ({vis.length} clubes)</td><td className="text-center">{suma('total')}</td><td className="text-center">{suma('habilitados')}</td><td className="text-center">{suma('conFoto')}</td><td className="text-center">{suma('conCedulas')}</td><td /><td /></tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-slate-500 text-xs mt-3">Rojo: club sin jugadores · Amarillo: menos de 11 jugadores.</p>
      </div>
      {edit && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center overflow-auto p-4" onClick={() => setEdit(null)}>
          <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 w-full max-w-lg mt-8" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Editar club</h2>
            <div className="flex items-center gap-4 mb-4">
              <Escudo id={edit.id} tiene nombre={edit.nombre} v={version} grande />
              <div className="flex flex-wrap gap-2 text-sm">
                <label className="px-3 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg cursor-pointer">Cambiar escudo<input type="file" accept="image/*" className="hidden" onChange={(e) => subirEscudo(edit.id, e.target.files?.[0])} /></label>
                <button className="px-3 py-2 text-red-400 underline" onClick={() => quitarEscudo(edit.id)}>Quitar</button>
              </div>
            </div>
            {([['nombre', 'Nombre del club'], ['ciudad', 'Ciudad'], ['director', 'Director técnico / dirigente'], ['telefono', 'Teléfono'], ['correo', 'Correo']] as const).map(([k, t]) => (
              <label key={k} className="block text-sm mb-3">{t}
                <input className="w-full mt-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg" value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
              </label>
            ))}
            <label className="block text-sm mb-3">Estado
              <select className="w-full mt-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg" value={edit.estado} onChange={(e) => setEdit({ ...edit, estado: e.target.value })}><option value="aprobado">Aprobado</option><option value="pendiente">Pendiente</option><option value="rechazado">Rechazado</option></select>
            </label>
            <p className="text-yellow-200/90 text-xs mb-4">Si cambias el nombre, las hojas de Excel o de Google deben usar el nombre nuevo para que los jugadores sigan asignados a este club.</p>
            <div className="flex gap-2"><button className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm" disabled={ocupado} onClick={guardar}>Guardar</button><button className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm" onClick={() => setEdit(null)}>Cancelar</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

function Escudo({ id, tiene, nombre, v, grande }: { id: string; tiene: boolean; nombre: string; v: number; grande?: boolean }) {
  const [falla, setFalla] = useState(false)
  const lado = grande ? 'w-20 h-20' : 'w-10 h-10'
  const iniciales = nombre.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  // eslint-disable-next-line @next/next/no-img-element
  if (tiene && !falla) return <img src={`/api/admin/clubes/${id}/escudo?t=${v}`} alt="" loading="lazy" onError={() => setFalla(true)} className={`${lado} object-contain`} />
  return <span className={`${lado} rounded-full border border-dashed border-slate-500 text-slate-400 text-xs font-bold flex items-center justify-center`}>{iniciales}</span>
}
