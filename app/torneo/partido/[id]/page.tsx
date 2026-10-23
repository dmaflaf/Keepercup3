'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Jug { nombre: string; numero: number | null; posicion: string | null }
interface Ev extends Jug { tipo: string; teamId: string; minuto: number | null }
interface Ali { titulares: (Jug & { sale: boolean })[]; ingresos: (Jug & { minuto: number | null })[] }
interface Det {
  ok: boolean; message?: string
  partido: { torneo: string; jornada: string; fecha: string | null; hora: string | null; escenario: string | null; estado: string; local: string; visitante: string; localId: string; visitanteId: string; golesLocal: number | null; golesVisitante: number | null }
  eventos: Ev[]; cambios: Ev[]; alineaciones: { local: Ali; visitante: Ali }
}
const ICONO: Record<string, string> = { gol: '⚽', gol_penal: '⚽ (penal)', autogol: '⚽ (autogol)', amarilla: '🟨', doble_amarilla: '🟨🟨', roja: '🟥' }

export default function PartidoPublico() {
  const { id } = useParams<{ id: string }>()
  const [d, setD] = useState<Det | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { fetch(`/api/torneo/partido/${id}`).then((r) => r.json()).then((r) => (r.ok ? setD(r) : setError(r.message || 'No disponible'))).catch(() => setError('No disponible')) }, [id])
  const fecha = (f: string | null) => (f ? new Date(f + 'T12:00:00').toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' }) : '')
  const min = (m: number | null) => (m === null ? '' : `${m}' `)
  const lado = (e: Ev, d: Det) => (e.teamId === d.partido.localId ? 'local' : 'visitante')

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(900px 500px at 50% -10%,#12305a 0%,#051225 62%)', color: '#F3F6F8', fontFamily: "'Work Sans',system-ui,sans-serif" }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px 60px' }}>
        <a href="/torneo" style={{ color: '#93A4B8', fontSize: 14 }}>← Torneo</a>
        {error && <p>{error}</p>}
        {d && (
          <>
            <p style={{ color: '#93A4B8', margin: '14px 0 4px' }}>{d.partido.torneo} · {d.partido.jornada}</p>
            <div style={{ ...card, textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <a href={`/torneo/club/${d.partido.localId}`} style={{ flex: 1, textAlign: 'right', fontWeight: 800, fontSize: 18, color: 'inherit', textDecoration: 'none' }}>{d.partido.local}</a>
                <b style={{ fontSize: 38, color: '#D9A93A', minWidth: 100 }}>{d.partido.golesLocal ?? '-'} - {d.partido.golesVisitante ?? '-'}</b>
                <a href={`/torneo/club/${d.partido.visitanteId}`} style={{ flex: 1, textAlign: 'left', fontWeight: 800, fontSize: 18, color: 'inherit', textDecoration: 'none' }}>{d.partido.visitante}</a>
              </div>
              <p style={{ color: '#93A4B8', fontSize: 13, margin: '8px 0 0' }}>{fecha(d.partido.fecha)}{d.partido.hora ? ' · ' + d.partido.hora : ''}{d.partido.escenario ? ' · ' + d.partido.escenario : ''}</p>
            </div>

            <div style={card}>
              <h3 style={h3}>Goles y tarjetas</h3>
              {d.eventos.length === 0 && <p style={{ color: '#93A4B8', margin: 0 }}>Sin detalle registrado todavía.</p>}
              {d.eventos.map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: lado(e, d) === 'local' ? 'flex-start' : 'flex-end', padding: '7px 0', borderTop: '1px solid #1f3150', fontSize: 14 }}>
                  <span>{min(e.minuto)}{ICONO[e.tipo] || e.tipo} <b>{e.nombre}</b>{e.numero !== null ? <span style={{ color: '#93A4B8' }}> #{e.numero}</span> : null}</span>
                </div>
              ))}
            </div>

            {(['local', 'visitante'] as const).map((l) => {
              const a = d.alineaciones[l]
              if (!a.titulares.length && !a.ingresos.length) return null
              return (
                <div key={l} style={card}>
                  <h3 style={h3}>Alineación · {d.partido[l]}</h3>
                  {a.titulares.map((j, i) => <div key={i} style={fila}><b style={num}>{j.numero ?? '–'}</b>{j.nombre}{j.sale && <span style={{ color: '#ff8a7a' }}> ⬇</span>}</div>)}
                  {a.ingresos.length > 0 && <p style={{ color: '#93A4B8', fontSize: 12, margin: '10px 0 2px' }}>Ingresaron de cambio</p>}
                  {a.ingresos.map((j, i) => <div key={i} style={fila}><b style={num}>{j.numero ?? '–'}</b>{j.nombre}<span style={{ color: '#7CE08A' }}> ⬆{j.minuto !== null ? ` ${j.minuto}'` : ''}</span></div>)}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
const card: React.CSSProperties = { background: '#0F223D', border: '1px solid rgba(224,232,240,.14)', borderRadius: 12, padding: 16, marginBottom: 14 }
const h3: React.CSSProperties = { margin: '0 0 8px', fontSize: 17, fontWeight: 900 }
const fila: React.CSSProperties = { padding: '6px 0', borderTop: '1px solid #1f3150', fontSize: 14 }
const num: React.CSSProperties = { display: 'inline-block', width: 30, color: '#D9A93A' }
