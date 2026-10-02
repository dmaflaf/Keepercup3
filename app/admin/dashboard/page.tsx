'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Usuario {
  id: string
  email: string
  nombre: string
  rol: string
}

export default function AdminDashboard() {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Recuperar usuario del localStorage
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/admin/login')
      return
    }

    setUsuario(JSON.parse(userData))
    setLoading(false)
  }, [router])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    localStorage.removeItem('auth-token')
    localStorage.removeItem('user')
    router.push('/admin/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Cargando...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">🏆 Keeper Cup 3 - Admin</h1>
            <p className="text-slate-400 text-sm">Sistema de Gestión</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-white font-semibold">{usuario?.nombre}</p>
              <p className="text-slate-400 text-sm capitalize">{usuario?.rol}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Bienvenida */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-xl p-8 text-white mb-12">
          <h2 className="text-3xl font-bold mb-2">¡Bienvenido, {usuario?.nombre}!</h2>
          <p className="text-red-100">Sistema de gestión completo de la Keeper Cup 3</p>
        </div>

        {/* Menu de opciones */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icono: '📥', titulo: 'Importar', texto: 'Cargar equipos y jugadores desde Excel', ruta: '/admin/importar', solo: 'admin' },
            { icono: '👥', titulo: 'Jugadores', texto: 'Ver y revisar fichas de jugadores', ruta: '/admin/jugadores' },
            { icono: '⚽', titulo: 'Fixture', texto: 'Próximamente', solo: 'admin' },
            { icono: '📊', titulo: 'Resultados', texto: 'Próximamente' },
            { icono: '🏆', titulo: 'Tabla', texto: 'Próximamente' },
            { icono: '⚠️', titulo: 'Sanciones', texto: 'Próximamente', solo: 'admin' },
          ]
            .filter((c) => !c.solo || c.solo === usuario?.rol)
            .map((c) =>
              c.ruta ? (
                <div
                  key={c.titulo}
                  onClick={() => router.push(c.ruta!)}
                  className="bg-slate-800 border border-slate-700 rounded-xl p-6 hover:border-red-500 transition cursor-pointer"
                >
                  <div className="text-4xl mb-3">{c.icono}</div>
                  <h3 className="text-xl font-bold text-white mb-2">{c.titulo}</h3>
                  <p className="text-slate-400 text-sm mb-4">{c.texto}</p>
                  <span className="text-red-400 text-sm font-semibold">Ir →</span>
                </div>
              ) : (
                <div key={c.titulo} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 opacity-60">
                  <div className="text-4xl mb-3">{c.icono}</div>
                  <h3 className="text-xl font-bold text-white mb-2">{c.titulo}</h3>
                  <p className="text-slate-400 text-sm">{c.texto}</p>
                </div>
              )
            )}
        </div>

        {/* Info */}
        <div className="mt-12 bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h3 className="text-white font-bold mb-3">ℹ️ Información del Sistema</h3>
          <ul className="text-slate-400 text-sm space-y-2">
            <li>✅ 32 equipos registrados</li>
            <li>✅ 1000+ jugadores (En progreso)</li>
            <li>✅ Sistema de autenticación activo</li>
            <li>✅ Roles: Admin (control total) y Vocal (agregar resultados)</li>
          </ul>
        </div>
      </main>
    </div>
  )
}
