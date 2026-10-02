'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()

      if (!data.ok) {
        setError(data.message || 'Error al iniciar sesión')
        return
      }

      // Guardar token en localStorage para acceso desde cliente
      localStorage.setItem('auth-token', data.token)
      localStorage.setItem('user', JSON.stringify(data.usuario))

      // Redirigir al panel
      router.push('/admin/dashboard')
    } catch (err) {
      setError('Error de conexión')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🔐</div>
            <h1 className="text-3xl font-bold text-white mb-2">Panel Admin</h1>
            <p className="text-slate-400">Keeper Cup 3</p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-slate-300 text-sm font-semibold mb-2">
                Usuario
              </label>
              <input
                type="text"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-red-500 transition"
                placeholder="Usuario"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-slate-300 text-sm font-semibold mb-2">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-red-500 transition"
                placeholder="••••••••"
                required
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-red-900 bg-opacity-30 border border-red-700 rounded-lg p-3 text-red-200 text-sm">
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Iniciando...' : 'Iniciar Sesión'}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center text-slate-400 text-xs">
            <p>Sistema NIX v7.2 - Keeper Cup 3</p>
          </div>
        </div>

      </div>
    </div>
  )
}
