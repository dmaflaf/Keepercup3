'use client'

import { useState, useRef } from 'react'
import html2canvas from 'html2canvas'
import JSZip from 'jszip'

interface CredentialData {
  torneo: string
  club: string
  numero: string
  nombres: string
  apellidos: string
  cedula: string
  fechaNacimiento: string
  foto: string | null
}

export default function CredentialGenerator() {
  const [data, setData] = useState<CredentialData>({
    torneo: 'LIGA SAN MIGUEL',
    club: 'ATHLAS FC',
    numero: '10',
    nombres: 'ESTEBAN ARMANDO',
    apellidos: 'PAREDES ORTEGA',
    cedula: '1001234567',
    fechaNacimiento: '2002-01-01',
    foto: null,
  })

  const [bulkData, setBulkData] = useState<CredentialData[]>([])
  const credentialRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setData((prev) => ({ ...prev, [name]: value }))
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setData((prev) => ({ ...prev, foto: event.target?.result as string }))
      }
      reader.readAsDataURL(file)
    }
  }

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const csv = event.target?.result as string
      const lines = csv.split('\n').slice(1)
      const credentials = lines
        .filter((line) => line.trim())
        .map((line) => {
          const [torneo, club, numero, nombres, apellidos, cedula, fechaNacimiento] =
            line.split(',').map((s) => s.trim())
          return {
            torneo,
            club,
            numero,
            nombres,
            apellidos,
            cedula,
            fechaNacimiento,
            foto: null,
          }
        })
      setBulkData(credentials)
    }
    reader.readAsText(file)
  }

  const downloadCredential = async () => {
    if (!credentialRef.current) return

    try {
      const canvas = await html2canvas(credentialRef.current, {
        backgroundColor: '#fff',
        scale: 2,
      })
      const link = document.createElement('a')
      link.href = canvas.toDataURL('image/png')
      link.download = `${data.nombres}-${data.apellidos}.png`
      link.click()
    } catch (error) {
      console.error('Error descargando credencial:', error)
    }
  }

  const downloadAllAsZip = async () => {
    if (bulkData.length === 0) return

    const zip = new JSZip()
    const promises = bulkData.map(async (cred, index) => {
      const div = document.createElement('div')
      div.innerHTML = renderCredential(cred)
      div.style.position = 'absolute'
      div.style.left = '-9999px'
      document.body.appendChild(div)

      try {
        const canvas = await html2canvas(div, {
          backgroundColor: '#fff',
          scale: 2,
        })
        const png = canvas.toDataURL('image/png')
        zip.file(
          `${cred.nombres}-${cred.apellidos}-${index + 1}.png`,
          png.split(',')[1],
          { base64: true }
        )
      } finally {
        document.body.removeChild(div)
      }
    })

    await Promise.all(promises)
    const blob = await zip.generateAsync({ type: 'blob' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'credenciales.zip'
    link.click()
  }

  const renderCredential = (cred: CredentialData) => {
    const birthDate = new Date(cred.fechaNacimiento)
    const formattedDate = `${String(birthDate.getDate()).padStart(2, '0')}-${String(
      birthDate.getMonth() + 1
    ).padStart(2, '0')}-${birthDate.getFullYear()}`

    return `
      <div style="width: 203px; height: 127px; background: linear-gradient(135deg, #e10600 0%, #c70500 100%); border-radius: 8px; padding: 12px; position: relative; overflow: hidden; font-family: Inter, sans-serif; color: white; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
        <div style="position: absolute; top: 0; right: 0; width: 50px; height: 50px; background: rgba(255,255,255,0.1); border-radius: 0 8px 0 20px;"></div>

        <div>
          <div style="font-size: 8px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">${cred.torneo}</div>
          <div style="font-size: 12px; font-weight: 700;">${cred.club}</div>
        </div>

        <div style="display: flex; gap: 8px; align-items: flex-end;">
          ${
            cred.foto
              ? `<img src="${cred.foto}" style="width: 35px; height: 45px; border-radius: 3px; object-fit: cover; border: 2px solid white;">`
              : `<div style="width: 35px; height: 45px; background: rgba(255,255,255,0.2); border-radius: 3px; display: flex; align-items: center; justify-content: center;">📷</div>`
          }

          <div style="flex: 1;">
            <div style="font-size: 6px; color: rgba(255,255,255,0.8);">
              <div><strong>#${cred.numero}</strong></div>
              <div style="font-weight: 600; line-height: 1.2;">${cred.nombres}</div>
              <div style="font-weight: 600; line-height: 1.2;">${cred.apellidos}</div>
              <div style="font-size: 5px; margin-top: 1px;">DNI: ${cred.cedula}</div>
              <div style="font-size: 5px;">${formattedDate}</div>
            </div>
          </div>
        </div>
      </div>
    `
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-8 border-b border-slate-700 pb-6">
        <h1 className="text-4xl font-bold text-primary mb-2">🎨 NIX Carnets</h1>
        <p className="text-slate-400">Generador profesional de credenciales deportivas</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Panel de control */}
        <div className="lg:col-span-2 space-y-8">
          {/* Tab 1: Individual */}
          <div className="card">
            <h2 className="text-xl font-bold mb-6 text-primary">📝 Credencial Individual</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <input
                type="text"
                name="torneo"
                value={data.torneo}
                onChange={handleInputChange}
                placeholder="Torneo"
                className="input-field"
              />
              <input
                type="text"
                name="club"
                value={data.club}
                onChange={handleInputChange}
                placeholder="Club"
                className="input-field"
              />
              <input
                type="text"
                name="numero"
                value={data.numero}
                onChange={handleInputChange}
                placeholder="Número"
                className="input-field"
              />
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="input-field"
              />
              <input
                type="text"
                name="nombres"
                value={data.nombres}
                onChange={handleInputChange}
                placeholder="Nombres"
                className="input-field"
              />
              <input
                type="text"
                name="apellidos"
                value={data.apellidos}
                onChange={handleInputChange}
                placeholder="Apellidos"
                className="input-field"
              />
              <input
                type="text"
                name="cedula"
                value={data.cedula}
                onChange={handleInputChange}
                placeholder="Cédula"
                className="input-field"
              />
              <input
                type="date"
                name="fechaNacimiento"
                value={data.fechaNacimiento}
                onChange={handleInputChange}
                className="input-field"
              />
            </div>

            <button onClick={downloadCredential} className="btn-primary w-full">
              📥 Descargar Credencial
            </button>
          </div>

          {/* Tab 2: Masivo */}
          <div className="card">
            <h2 className="text-xl font-bold mb-6 text-primary">📦 Generación Masiva</h2>

            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm mb-2 text-slate-300">
                  📄 Archivo CSV (nombre,apellidos,club,numero,cedula,fecha_nacimiento)
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  className="input-field"
                />
              </div>
            </div>

            {bulkData.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-slate-400">
                  ✅ {bulkData.length} credenciales cargadas
                </p>
              </div>
            )}

            <button
              onClick={downloadAllAsZip}
              disabled={bulkData.length === 0}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              📦 Descargar todas en ZIP
            </button>
          </div>
        </div>

        {/* Vista previa */}
        <div className="lg:col-span-1">
          <div className="sticky top-4">
            <h2 className="text-xl font-bold mb-4 text-primary">👁️ Vista Previa</h2>
            <div
              ref={credentialRef}
              dangerouslySetInnerHTML={{ __html: renderCredential(data) }}
              className="mb-4"
            />
            <p className="text-xs text-slate-500 text-center">8cm × 5cm</p>
          </div>
        </div>
      </div>
    </div>
  )
}
