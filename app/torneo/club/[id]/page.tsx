'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Pl { id: string; nombre: string; numero: number | null; posicion: string | null; goles: number; amarillas: number; rojas: number; partidos: number; suspendido: number }
interface Pa { id: string; jornada: string; fecha: string | null; hora: string | null; escenario: string | null; estado: string; local: string; visitante: string; golesLocal: number | null; golesVisitante: number | null; esLocal: boolean }
interface Det { ok: boolean; torneo: string; club: { id: string; nombre: string; escudo: string | null }; posicion: { pos: number; pj: number; pg: number; pe: number; pp: number; gf: number; gc: number; dg: number; pts: number } | null; grupo: string; partidos: Pa[]; plantel: Pl[] }

export default function ClubPublico() {
  const { id } = useParams<{ id: string }>()
  const [d, setD] = useState<Det | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { fetch(`/api/torneo/club/${id}`).then((r) => r.json()).then((r) => (r.ok ? setD(r) : setError(r.message || 'No disponible'))).catch(() => setError('No disponible')) }, [id])
  const fecha = (f: string | null) => (f ? new Date(f + 'T12:00:00').toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Por definir')
  const res = (p: Pa) => { if (p.estado !== 'finalizado' || p.golesLocal === null || p.golesVisitante === null) return null; const gf = p.esLocal ? p.golesLocal : p.golesVisitante; const gc = p.esLocal ? p.golesVisitante : p.golesLocal; return gf > gc ? 'G' : gf < gc ? 'P' : 'E' }
  const color = { G: '#2fb344', E: '#f2b81a', P: '#d93636' } as const
  const goleadores = d ? [...d.plantel].filter((j) => j.goles > 0).sort((a, b) => b.goles - a.goles) : []

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(900px 500px at 50% -10%,#12305a 0%,#051225 62%)', color: '#F3F6F8', fontFamily: "'Work Sans',system-ui,sans-serif" }}>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px 16px 60px' }}>
        <a href="/torneo" style={{ color: '#93A4B8', fontSize: 14 }}>← Torneo</a>
        {error && <p>{error}</p>}
        {d && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '14px 0' }}>
              {d.club.escudo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={d.club.escudo} alt="" style={{ width: 72, height: 72, objectFit: 'contain' }} />}
              <div><h1 style={{ fontSize: 30, fontWeight: 900, margin: 0 }}>{d.club.nombre}</h1><p style={{ color: '#93A4B8', margin: '2px 0 0' }}>{d.torneo}{d.grupo ? ' · ' + d.grupo : ''}</p></div>
            </div>
            {d.posicion && (
              <div style={{ ...card, display: 'flex', gap: 14, flexWrap: 'wrap', textAlign: 'center' }}>
                {[['Pos', d.posicion.pos], ['PJ', d.posicion.pj], ['PG', d.posicion.pg], ['PE', d.posicion.pe], ['PP', d.posicion.pp], ['GF', d.posicion.gf], ['GC', d.posicion.gc], ['DG', d.posicion.dg], ['PTS', d.posicion.pts]].map(([k, v]) => (
                  <div key={String(k)} style={{ minWidth: 48 }}><b style={{ fontSize: 24, color: k === 'PTS' ? '#D9A93A' : '#F3F6F8' }}>{v}</b><div style={{ color: '#93A4B8', fontSize: 11 }}>{k}</div></div>
                ))}
              </div>
            )}

            <div style={card}>
              <h3 style={h3}>Partidos</h3>
              {d.partidos.map((p) => {
                const r = res(p)
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderTop: '1px solid #1f3150', fontSize: 14, flexWrap: 'wrap' }}>
                    <span style={{ width: 62, color: '#93A4B8', fontSize: 12 }}>{p.jornada.replace('Fecha ', 'F')}</span>
                    <span style={{ flex: 1, minWidth: 180 }}>{p.local} <b style={{ color: '#D9A93A' }}>{p.estado === 'finalizado' ? `${p.golesLocal} - ${p.golesVisitante}` : 'vs'}</b> {p.visitante}</span>
                    {r ? <b style={{ background: color[r], color: '#111', borderRadius: 4, padding: '1px 7px' }}>{r}</b> : <span style={{ color: '#93A4B8', fontSize: 12 }}>{fecha(p.fecha)}{p.hora ? ' · ' + p.hora : ''}</span>}
                    {p.estado === 'finalizado' && <a href={`/torneo/partido/${p.id}`} style={{ color: '#D9A93A', fontSize: 12 }}>Detalle</a>}
                  </div>
                )
              })}
            </div>

            {goleadores.length > 0 && (
              <div style={card}>
                <h3 style={h3}>Goleadores del club</h3>
                {goleadores.map((j) => <div key={j.id} style={fila}><b style={num}>{j.numero ?? '–'}</b><span style={{ flex: 1 }}>{j.nombre}</span><b style={{ color: '#D9A93A' }}>⚽ {j.goles}</b></div>)}
              </div>
            )}

            <div style={card}>
              <h3 style={h3}>Plantel</h3>
              {d.plantel.map((j) => (
                <div key={j.id} style={fila}>
                  <b style={num}>{j.numero ?? '–'}</b><span style={{ flex: 1 }}>{j.nombre}{j.posicion && <small style={{ color: '#93A4B8' }}> · {j.posicion}</small>}</span>
                  <span style={{ color: '#93A4B8', fontSize: 12 }}>{j.goles > 0 && `⚽${j.goles} `}{j.amarillas > 0 && `🟨${j.amarillas} `}{j.rojas > 0 && `🟥${j.rojas} `}{j.suspendido > 0 && <b style={{ color: '#ff8a7a' }}>Suspendido</b>}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
const card: React.CSSProperties = { background: '#0F223D', border: '1px solid rgba(224,232,240,.14)', borderRadius: 12, padding: 16, marginBottom: 14 }
const h3: React.CSSProperties = { margin: '0 0 8px', fontSize: 17, fontWeight: 900 }
const fila: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid #1f3150', fontSize: 14 }
const num: React.CSSProperties = { display: 'inline-block', width: 30, color: '#D9A93A' }
