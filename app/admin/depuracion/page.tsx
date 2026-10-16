'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface Problema { id: string; titulo: string; gravedad: 'alta' | 'media' | 'baja'; ayuda: string; total: number; items: { texto: string; enlace?: string }[] }
interface Datos { resumen: { clubes: number; jugadores: number; habilitados: number; conFoto: number; conCedulaCompleta: number; torneo: { nombre: string; fases: number; grupos: number; partidos: number } | null }; problemas: Problema[] }
const COLOR = { alta: 'border-red-500 bg-red-900/20', media: 'border-yellow-500 bg-yellow-900/10', baja: 'border-slate-600 bg-slate-800' }
const ETIQ = { alta: '🔴 Urgente', media: '🟡 Importante', baja: '⚪ Menor' }

export default function Depuracion() {
  const [d, setD] = useState<Datos | null>(null)
  const [msg, setMsg] = useState('Revisando datos…')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  const revisar = useCallback(async () => {
    setMsg('Revisando datos…')
    const r = await fetch('/api/admin/auditoria', { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setMsg(r?.message || 'No se pudo revisar (¿eres administrador?)'); return }
    setD(r); setMsg('')
  }, [])
  useEffect(() => { revisar() }, [revisar])

  const resumenTexto = d ? `Clubes ${d.resumen.clubes} · Jugadores ${d.resumen.jugadores} · Habilitados ${d.resumen.habilitados} · Con foto ${d.resumen.conFoto} · Con cédula completa ${d.resumen.conCedulaCompleta}\n` + d.problemas.map((p) => `${ETIQ[p.gravedad]} ${p.titulo}: ${p.total}`).join('\n') : ''
  const csv = () => {
    if (!d) return
    const filas = [['Gravedad', 'Problema', 'Detalle'], ...d.problemas.flatMap((p) => p.items.map((i) => [p.gravedad, p.titulo, i.texto]))]
    const blob = new Blob(['﻿' + filas.map((f) => f.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pendientes-keeper-cup.csv'; a.click()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">🧹 Depuración de datos</h1>
        <p className="text-slate-400 mb-5">Revisa clubes, jugadores y torneo y te dice qué hay que corregir, ordenado por urgencia. Solo lee: no cambia nada. Toca cada problema para ver la lista y corregirlo.</p>
        {msg && <p className="text-slate-300 mb-4">{msg}</p>}
        {d && (<>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            {([['Clubes', d.resumen.clubes], ['Jugadores', d.resumen.jugadores], ['Habilitados', d.resumen.habilitados], ['Con foto', d.resumen.conFoto], ['Cédula completa', d.resumen.conCedulaCompleta]] as const).map(([t, n]) => (
              <div key={t} className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center"><p className="text-3xl font-bold">{n}</p><p className="text-slate-400 text-xs uppercase">{t}</p></div>
            ))}
          </div>
          <p className="text-sm text-slate-400 mb-4">Torneo: {d.resumen.torneo ? `${d.resumen.torneo.nombre} · ${d.resumen.torneo.fases} fase(s) · ${d.resumen.torneo.grupos} grupo(s) · ${d.resumen.torneo.partidos} partido(s)` : 'todavía no hay un torneo creado (créalo en Torneo)'}</p>
          <div className="flex gap-2 mb-4 flex-wrap">
            <button className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm" onClick={revisar}>↻ Volver a revisar</button>
            <button className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm" onClick={csv}>⬇ Descargar lista (Excel/CSV)</button>
            <button className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm" onClick={() => { navigator.clipboard?.writeText(resumenTexto); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }}>{copiado ? '✔ Copiado' : '📋 Copiar resumen (sin datos personales)'}</button>
          </div>
          {!d.problemas.length && <p className="text-green-400 text-lg">✔ No se encontraron problemas.</p>}
          <div className="space-y-3">
            {d.problemas.map((p) => (
              <div key={p.id} className={`border rounded-xl ${COLOR[p.gravedad]}`}>
                <button className="w-full text-left px-4 py-3 flex items-center justify-between gap-3" onClick={() => setAbierto(abierto === p.id ? null : p.id)}>
                  <span><span className="text-xs mr-2">{ETIQ[p.gravedad]}</span><b>{p.titulo}</b></span>
                  <span className="text-xl font-bold">{p.total}</span>
                </button>
                {abierto === p.id && (
                  <div className="px-4 pb-4">
                    <p className="text-slate-300 text-sm mb-2">{p.ayuda}</p>
                    <div className="max-h-96 overflow-auto text-sm">
                      {p.items.map((i, k) => <div key={k} className="py-1.5 border-t border-slate-700/60 flex justify-between gap-2"><span>{i.texto}</span>{i.enlace && <Link className="text-yellow-300 whitespace-nowrap underline" href={i.enlace}>Corregir →</Link>}</div>)}
                      {p.total > p.items.length && <p className="text-slate-400 pt-2">Se muestran {p.items.length} de {p.total}. Descarga la lista completa en CSV.</p>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>)}
      </div>
    </div>
  )
}
