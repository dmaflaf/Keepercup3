'use client'

import { useEffect, useState } from 'react'

interface Fila { teamId: string; equipo: string; pj: number; pg: number; pe: number; pp: number; gf: number; gc: number; dg: number; pts: number; pos: number }
interface Grupo { id: string; nombre: string; tabla: Fila[] }
interface Fase { id: string; nombre: string; tipo: string; grupos: Grupo[] }
interface Partido { id: string; faseId: string; grupoId: string | null; jornada: string; jornadaNum: number; fecha: string | null; hora: string | null; escenario: string | null; estado: string; local: string; visitante: string; golesLocal: number | null; golesVisitante: number | null; penalesLocal: number | null; penalesVisitante: number | null }
interface Gol { playerId: string; jugador: string; numero: number | null; equipo: string; goles: number }
interface San { playerId: string; jugador: string; numero: number | null; equipo: string; totalAmarillas: number; rojas: number; suspendidoProximo: number; precaucion: boolean }
interface Datos { ok: boolean; torneos: { id: string; nombre: string }[]; torneo: { id: string; nombre: string; amarillasSuspension: number } | null; fases: Fase[]; partidos: Partido[]; goleadores: Gol[]; sanciones: San[] }

const TABS = ['Fixture', 'Tablas', 'Goleadores', 'Sanciones'] as const

export default function TorneoPublico() {
  const [d, setD] = useState<Datos | null>(null)
  const [tab, setTab] = useState<(typeof TABS)[number]>('Tablas')
  const [error, setError] = useState('')
  const cargar = (id?: string) =>
    fetch('/api/torneo/publico' + (id ? `?torneoId=${id}` : '')).then((r) => r.json()).then((r) => (r.ok ? setD(r) : setError('No disponible'))).catch(() => setError('No disponible'))
  useEffect(() => { cargar(); const t = setInterval(() => cargar(d?.torneo?.id), 30000); return () => clearInterval(t) }, [d?.torneo?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fecha = (f: string | null) => (f ? new Date(f + 'T12:00:00').toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Por definir')

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(900px 500px at 50% -10%,#12305a 0%,#051225 62%)', color: '#F3F6F8', fontFamily: "'Work Sans',system-ui,sans-serif" }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 60px' }}>
        <a href="/" style={{ color: '#93A4B8', fontSize: 14 }}>← Keeper Cup</a>
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: '10px 0 4px' }}>{d?.torneo?.nombre || 'Torneo'}</h1>
        {d && d.torneos.length > 1 && (
          <select value={d.torneo?.id} onChange={(e) => cargar(e.target.value)} style={{ background: '#0B1B33', color: '#fff', border: '1px solid #345', padding: 8, borderRadius: 6, marginBottom: 8 }}>
            {d.torneos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        )}
        {error && <p>{error}</p>}
        {d && !d.torneo && <p style={{ color: '#93A4B8' }}>El torneo se publicará muy pronto.</p>}
        {d?.torneo && (
          <>
            <div style={{ display: 'flex', gap: 8, margin: '14px 0 18px', flexWrap: 'wrap' }}>
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid ' + (tab === t ? '#D9A93A' : '#2a3b55'), background: tab === t ? '#D9A93A' : '#0F223D', color: tab === t ? '#211603' : '#F3F6F8', fontWeight: 700, cursor: 'pointer' }}>{t}</button>
              ))}
            </div>

            {tab === 'Tablas' && d.fases.map((f) => f.grupos.filter((g) => g.tabla.length).map((g) => (
              <div key={g.id} style={card}>
                <h3 style={h3}>{f.nombre} · {g.nombre}</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
                    <thead><tr style={{ color: '#93A4B8', textAlign: 'center' }}><th style={{ textAlign: 'left' }}>#</th><th style={{ textAlign: 'left' }}>Equipo</th>{['PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DG', 'PTS'].map((h) => <th key={h} style={{ padding: '6px 4px' }}>{h}</th>)}</tr></thead>
                    <tbody>{g.tabla.map((r) => (
                      <tr key={r.teamId} style={{ borderTop: '1px solid #1f3150', textAlign: 'center' }}>
                        <td style={{ textAlign: 'left', padding: '8px 4px' }}>{r.pos}</td><td style={{ textAlign: 'left', fontWeight: 600 }}>{r.equipo}</td>
                        <td>{r.pj}</td><td>{r.pg}</td><td>{r.pe}</td><td>{r.pp}</td><td>{r.gf}</td><td>{r.gc}</td><td>{r.dg}</td><td style={{ fontWeight: 900, color: '#D9A93A' }}>{r.pts}</td>
                      </tr>))}</tbody>
                  </table>
                </div>
              </div>
            )))}

            {tab === 'Fixture' && d.fases.map((f) => {
              const ps = d.partidos.filter((p) => p.faseId === f.id)
              if (!ps.length) return null
              const jornadas = Array.from(new Set(ps.map((p) => p.jornada)))
              return (
                <div key={f.id}>
                  <h2 style={{ fontSize: 22, fontWeight: 900, margin: '18px 0 8px', color: '#D9A93A' }}>{f.nombre}</h2>
                  {jornadas.map((j) => (
                    <div key={j} style={card}>
                      <h3 style={h3}>{j}</h3>
                      {ps.filter((p) => p.jornada === j).map((p) => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderTop: '1px solid #1f3150', fontSize: 14 }}>
                          <span style={{ flex: 1, textAlign: 'right', fontWeight: 600 }}>{p.local}</span>
                          <span style={{ minWidth: 70, textAlign: 'center', fontWeight: 900, color: p.estado === 'finalizado' ? '#D9A93A' : '#93A4B8', fontSize: p.estado === 'finalizado' ? 18 : 13 }}>
                            {p.estado === 'finalizado' ? `${p.golesLocal} - ${p.golesVisitante}` : p.hora || 'vs'}
                          </span>
                          <span style={{ flex: 1, fontWeight: 600 }}>{p.visitante}</span>
                          <span style={{ width: 120, color: '#93A4B8', fontSize: 12, textAlign: 'right' }}>{fecha(p.fecha)}{p.escenario ? ' · ' + p.escenario : ''}{p.estado === 'suspendido' ? ' · suspendido' : ''}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )
            })}

            {tab === 'Goleadores' && (
              <div style={card}>
                <h3 style={h3}>Tabla de goleadores</h3>
                {d.goleadores.length === 0 && <p style={{ color: '#93A4B8' }}>Todavía no hay goles registrados.</p>}
                {d.goleadores.slice(0, 50).map((g, i) => (
                  <div key={g.playerId} style={{ display: 'flex', gap: 12, padding: '9px 0', borderTop: '1px solid #1f3150', fontSize: 14, alignItems: 'center' }}>
                    <b style={{ width: 24, color: '#93A4B8' }}>{i + 1}</b><span style={{ flex: 1 }}><b>{g.jugador}</b> <span style={{ color: '#93A4B8' }}>· {g.equipo}</span></span><b style={{ color: '#D9A93A', fontSize: 18 }}>{g.goles}</b>
                  </div>
                ))}
              </div>
            )}

            {tab === 'Sanciones' && (
              <div style={card}>
                <h3 style={h3}>Sanciones y tarjetas</h3>
                <p style={{ color: '#93A4B8', fontSize: 13, marginTop: 0 }}>{d.torneo.amarillasSuspension} amarillas acumuladas = 1 partido de suspensión.</p>
                {d.sanciones.length === 0 && <p style={{ color: '#93A4B8' }}>Sin tarjetas registradas.</p>}
                {d.sanciones.map((s) => (
                  <div key={s.playerId} style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: '1px solid #1f3150', fontSize: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 180 }}><b>{s.jugador}</b> <span style={{ color: '#93A4B8' }}>· {s.equipo}</span></span>
                    <span>🟨 {s.totalAmarillas}</span><span>🟥 {s.rojas}</span>
                    {s.suspendidoProximo > 0 ? <b style={{ color: '#ff8a7a' }}>Suspendido {s.suspendidoProximo} partido(s)</b> : s.precaucion ? <b style={{ color: '#D9A93A' }}>En precaución</b> : <span style={{ color: '#93A4B8' }}>Habilitado</span>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const card: React.CSSProperties = { background: '#0F223D', border: '1px solid rgba(224,232,240,.14)', borderRadius: 12, padding: 16, marginBottom: 14 }
const h3: React.CSSProperties = { margin: '0 0 8px', fontSize: 17, fontWeight: 900 }
