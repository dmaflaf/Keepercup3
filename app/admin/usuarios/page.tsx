'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface U { id: string; email: string; nombre: string; rol: string; activo: boolean; createdAt: string }
const inp = 'px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm'
const btn = 'px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm'
const btn2 = 'px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg text-xs'

export default function Usuarios() {
  const [lista, setLista] = useState<U[]>([])
  const [msg, setMsg] = useState('')
  const [nuevo, setNuevo] = useState({ nombre: '', email: '', rol: 'vocal', password: '' })
  const [entregada, setEntregada] = useState<{ email: string; clave: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/admin/usuarios', { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setMsg(r?.message || 'No se pudo cargar (¿eres administrador?)'); return }
    setLista(r.usuarios)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const post = (b: Record<string, unknown>) => fetch('/api/admin/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Error de conexión' }))

  async function crear() {
    const r = await post({ accion: 'crear', ...nuevo })
    if (!r.ok) { alert(r.message); return }
    setEntregada({ email: r.email, clave: r.clave }); setNuevo({ nombre: '', email: '', rol: 'vocal', password: '' }); cargar()
  }
  async function restablecer(u: U) {
    if (!confirm(`¿Generar una clave nueva para ${u.nombre}?\n\nLa clave anterior dejará de funcionar y todos sus dispositivos tendrán que volver a entrar.`)) return
    const r = await post({ accion: 'clave', id: u.id })
    if (!r.ok) { alert(r.message); return }
    setEntregada({ email: r.email, clave: r.clave })
  }
  async function activar(u: U, activo: boolean) {
    if (!activo && !confirm(`¿Desactivar a ${u.nombre}? Su sesión se cierra de inmediato en todos los dispositivos.`)) return
    const r = await post({ accion: 'activo', id: u.id, activo })
    if (!r.ok) alert(r.message)
    cargar()
  }
  async function cambiarRol(u: U) {
    const rol = u.rol === 'admin' ? 'vocal' : 'admin'
    if (!confirm(`¿Cambiar a ${u.nombre} a ${rol === 'admin' ? 'ADMINISTRADOR (control total)' : 'vocal'}?`)) return
    const r = await post({ accion: 'editar', id: u.id, nombre: u.nombre, rol })
    if (!r.ok) alert(r.message)
    cargar()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">🔑 Usuarios y dispositivos</h1>
        <p className="text-slate-400 mb-5">Crea una cuenta de <b>vocal</b> por cada iPad o celular de la cancha (o por cada persona). Las claves se guardan cifradas: <b>nadie puede verlas después</b>, solo restablecerlas. Si pierdes un dispositivo, desactiva su cuenta y la sesión se cierra al instante.</p>
        {msg && <div className="bg-slate-700 border border-slate-500 rounded-lg p-3 mb-4 text-sm" onClick={() => setMsg('')}>{msg}</div>}

        {entregada && (
          <div className="border-2 border-yellow-400 bg-yellow-900/20 rounded-xl p-5 mb-5">
            <p className="font-bold text-yellow-200">Anota estos datos ahora: la clave no se vuelve a mostrar</p>
            <p className="mt-2 text-lg font-mono">Usuario: <b>{entregada.email}</b></p>
            <p className="text-lg font-mono">Clave: <b>{entregada.clave}</b></p>
            <div className="flex gap-2 mt-3">
              <button className={btn2} onClick={() => { navigator.clipboard?.writeText(`Usuario: ${entregada.email}\nClave: ${entregada.clave}`); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }}>{copiado ? '✔ Copiado' : '📋 Copiar'}</button>
              <button className={btn2} onClick={() => setEntregada(null)}>Ya la anoté</button>
            </div>
          </div>
        )}

        <section className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-5">
          <h2 className="font-bold mb-3">Crear usuario</h2>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <label>Nombre (persona o dispositivo)<input className={inp + ' w-full mt-1'} placeholder="ej. iPad cancha 1" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></label>
            <label>Usuario (correo)<input className={inp + ' w-full mt-1'} placeholder="ej. vocal1@keeper.ec" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} /></label>
            <label>Rol<select className={inp + ' w-full mt-1'} value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}><option value="vocal">Vocal (planilla, goles, ver tabla)</option><option value="admin">Administrador (control total)</option></select></label>
            <label>Clave (déjala vacía para generar una segura)<input className={inp + ' w-full mt-1'} placeholder="mínimo 8 caracteres" value={nuevo.password} onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })} /></label>
          </div>
          <button className={btn + ' mt-4'} onClick={crear}>Crear usuario</button>
        </section>

        <section className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 className="font-bold mb-3">Usuarios ({lista.length})</h2>
          {lista.map((u) => (
            <div key={u.id} className={`border-t border-slate-700 py-3 flex items-center gap-3 flex-wrap ${u.activo ? '' : 'opacity-60'}`}>
              <span className="flex-1 min-w-[14rem]"><b>{u.nombre}</b> <span className={`text-xs ml-1 px-2 py-0.5 rounded ${u.rol === 'admin' ? 'bg-red-700' : 'bg-slate-600'}`}>{u.rol === 'admin' ? 'Administrador' : 'Vocal'}</span>{!u.activo && <span className="text-xs ml-2 text-red-300">DESACTIVADO</span>}<span className="block text-slate-400 text-sm">{u.email}</span></span>
              <button className={btn2} onClick={() => restablecer(u)}>🔄 Restablecer clave</button>
              <button className={btn2} onClick={() => cambiarRol(u)}>Cambiar rol</button>
              <button className={btn2} onClick={() => activar(u, !u.activo)}>{u.activo ? 'Desactivar' : 'Activar'}</button>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
