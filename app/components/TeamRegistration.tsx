'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

interface FormData {
  teamName: string
  city: string
  dtName: string
  dtCedula: string
  asistenteName: string
  phone: string
  email: string
  logo: string | null
  fotos: Array<{ nombre: string; data: string }>
}

export default function TeamRegistration() {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<FormData>({
    teamName: '',
    city: '',
    dtName: '',
    dtCedula: '',
    asistenteName: '',
    phone: '',
    email: '',
    logo: null,
    fotos: [],
  })

  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)

  useEffect(() => {
    setAlreadyRegistered(!!localStorage.getItem('kc3_equipo_registrado'))
  }, [])

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const resizeImage = (
    dataUrl: string,
    maxDim: number,
    quality: number
  ): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image()
      img.onload = () => {
        let { width, height } = img
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else if (height >= width && height > maxDim) {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = dataUrl
    })
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'logo' | 'fotos'
  ) => {
    const files = e.target.files
    if (!files) return

    if (field === 'logo') {
      const file = files[0]
      const base64 = await fileToBase64(file)
      const resized = await resizeImage(base64, 1100, 0.82)
      setFormData((prev) => ({ ...prev, logo: resized }))
    } else {
      const fotosArray = await Promise.all(
        Array.from(files).map(async (file) => ({
          nombre: file.name,
          data: await resizeImage(
            await fileToBase64(file),
            1100,
            0.82
          ),
        }))
      )
      setFormData((prev) => ({ ...prev, fotos: fotosArray }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/teams/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (!result.ok) {
        setError(result.message || 'Error al registrar')
        return
      }

      setSuccess(true)
      localStorage.setItem('kc3_equipo_registrado', '1')
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } catch (err) {
      setError('Error de conexión. Intenta de nuevo.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-3xl font-bold text-white mb-2">
            ¡Registro Exitoso!
          </h2>
          <p className="text-slate-300 mb-6">
            {formData.teamName} ha sido registrado exitosamente
          </p>
          <p className="text-slate-400 text-sm">
            Revisa tu correo para más detalles
          </p>
        </div>
      </div>
    )
  }

  if (alreadyRegistered) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-6xl mb-4">ℹ️</div>
          <h2 className="text-3xl font-bold text-white mb-2">
            Ya te registraste
          </h2>
          <p className="text-slate-300">
            Tu equipo ya está registrado en este dispositivo
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-12 px-4">
      <div className="max-width-1040 mx-auto">
        <h1 className="text-4xl font-bold text-white mb-2 text-center">
          Inscripción de Equipos
        </h1>
        <p className="text-slate-400 text-center mb-12">
          Keeper Cup 3 - Pre-Temporada
        </p>

        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto card">
          {/* Step 1: Team Info */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white mb-6">
                Datos del Equipo
              </h2>

              <div>
                <label className="block text-slate-300 mb-2 font-semibold">
                  Nombre del Equipo *
                </label>
                <input
                  type="text"
                  name="teamName"
                  value={formData.teamName}
                  onChange={handleInputChange}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-2 font-semibold">
                  Ciudad *
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-2 font-semibold">
                  Logo del Equipo
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, 'logo')}
                  className="input-field"
                />
                {formData.logo && (
                  <img
                    src={formData.logo}
                    alt="Logo"
                    className="mt-4 h-24 w-24 rounded"
                  />
                )}
              </div>

              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-primary w-full"
              >
                Siguiente →
              </button>
            </div>
          )}

          {/* Step 2: Director Info */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white mb-6">
                Datos del Dirigente
              </h2>

              <div>
                <label className="block text-slate-300 mb-2 font-semibold">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  name="dtName"
                  value={formData.dtName}
                  onChange={handleInputChange}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-2 font-semibold">
                  Cédula *
                </label>
                <input
                  type="text"
                  name="dtCedula"
                  value={formData.dtCedula}
                  onChange={handleInputChange}
                  className="input-field"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="btn-secondary"
                >
                  ← Atrás
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="btn-primary"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Assistant & Fotos */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white mb-6">
                Asistente y Fotos
              </h2>

              <div>
                <label className="block text-slate-300 mb-2 font-semibold">
                  Nombre Asistente
                </label>
                <input
                  type="text"
                  name="asistenteName"
                  value={formData.asistenteName}
                  onChange={handleInputChange}
                  className="input-field"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 mb-2 font-semibold">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-2 font-semibold">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="input-field"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-2 font-semibold">
                  Fotos de Jugadores
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, 'fotos')}
                  className="input-field"
                />
                <p className="text-slate-400 text-sm mt-2">
                  {formData.fotos.length} fotos seleccionadas
                </p>
              </div>

              {error && (
                <div className="bg-red-900 bg-opacity-30 border border-red-700 rounded-lg p-4 text-red-200">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="btn-secondary"
                >
                  ← Atrás
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Cargando...' : 'Registrar Equipo'}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
