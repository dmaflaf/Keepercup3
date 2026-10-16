'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { etiquetaMinuto, mmss, periodoNumero, segundos, Periodo } from '@/lib/planilla'

interface Ev { tipo: string; teamId: string; minuto: number | null; periodo: number | null; nombre?: string; numero?: number | null }
interface Datos {
  servidor: number
  partido: { torneo: string; jornada: string; fecha: string | null; hora: string | null; escenario: string | null; estado: string; periodo: Periodo; local: string; visitante: string; localId: string; golesLocal: number; golesVisitante: number; penalesLocal: number | null; penalesVisitante: number | null; relojBase: number; relojDesde: number | null; dur: number }
  eventos: Ev[]
}
const ICONO: Record<string, string> = { gol: '⚽', gol_penal: '⚽ (p)', autogol: '⚽ (a.g.)', amarilla: '🟨', doble_amarilla: '🟨🟨', roja: '🟥', entra: '⬆', sale: '⬇' }
const TXT: Record<string, string> = { gol: 'Gol', gol_penal: 'Gol de penal', autogol: 'Autogol', amarilla: 'Amarilla', doble_amarilla: 'Doble amarilla', roja: 'Roja', entra: 'Entra', sale: 'Sale' }
const PERIODO: Record<string, string> = { previo: 'Por comenzar', t1: '1.er tiempo', descanso: 'Descanso', t2: '2.º tiempo', fin: 'Fin del partido', penales: 'Penales' }

export default function Vivo() {
  const { id } = useParams<{ id: string }>()
  const [d, setD] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const [salto, setSalto] = useState(0) // diferencia entre el reloj del servidor y el de este teléfono
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    let vivo = true
    const traer = async () => {
      const r = await fetch(`/api/torneo/vivo/${id}`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
      if (!vivo || !r) return
      if (!r.ok) { setError(r.message || 'No disponible'); return }
      setSalto(r.servidor - Date.now()); setD(r)
    }
    traer()
    const t = setInterval(traer, 4000)
    const c = setInterval(() => setAhora(Date.now()), 500)
    return () => { vivo = false; clearInterval(t); clearInterval(c) }
  }, [id])

  if (error) return <Pagina><p style={{ textAlign: 'center', paddingTop: 80 }}>{error}</p></Pagina>
  if (!d) return <Pagina><p style={{ textAlign: 'center', paddingTop: 80 }}>Cargando…</p></Pagina>
  const p = d.partido
  const fin = p.estado === 'finalizado'
  const seg = segundos({ periodo: p.periodo, base: p.relojBase, desde: p.relojDesde }, ahora + salto)
  const enJuego = !fin && (p.periodo === 't1' || p.periodo === 't2')
  const minuto = Math.floor(seg / 60) + 1
  const anadido = (p.periodo === 't1' && seg > p.dur * 60) || (p.periodo === 't2' && seg > 2 * p.dur * 60)
  const eventos = [...d.eventos].filter((e) => e.tipo !== 'falta').reverse()

  return (
    <Pagina>
      <p style={{ textAlign: 'center', color: '#D9A93A', fontSize: 13, margin: '4px 0 12px' }}>{p.torneo} · {p.jornada}{p.escenario ? ' · ' + p.escenario : ''}</p>
      <div style={{ background: '#0f1b2e', border: '1px solid #1f3150', borderRadius: 18, padding: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center', textAlign: 'center' }}>
          <b style={{ fontSize: 18 }}>{p.local}</b>
          <div style={{ fontSize: 46, fontWeight: 900, color: '#D9A93A', lineHeight: 1 }}>{p.golesLocal} - {p.golesVisitante}</div>
          <b style={{ fontSize: 18 }}>{p.visitante}</b>
        </div>
        {p.penalesLocal !== null && <p style={{ textAlign: 'center', margin: '6px 0 0', color: '#93A4B8' }}>Penales {p.penalesLocal} - {p.penalesVisitante}</p>}
        <p style={{ textAlign: 'center', margin: '14px 0 0' }}>
          {fin ? <b style={{ color: '#2fb344' }}>FINALIZADO</b> : p.periodo === 'previo' ? <span style={{ color: '#93A4B8' }}>Comienza {p.hora || 'pronto'}</span>
            : <>{enJuego && <span style={{ color: '#fff', background: '#bf1b2c', borderRadius: 6, padding: '2px 8px', fontWeight: 800, marginRight: 8 }}>EN VIVO</span>}
              <b style={{ fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{enJuego ? `${anadido ? etiquetaMinuto(minuto, periodoNumero(p.periodo), p.dur) : mmss(seg)}` : ''}</b>
              <span style={{ color: '#93A4B8', marginLeft: 8 }}>{PERIODO[p.periodo]}</span></>}
        </p>
      </div>

      <h3 style={{ margin: '20px 0 8px', color: '#D9A93A', letterSpacing: 1 }}>QUÉ PASÓ</h3>
      {!eventos.length && <p style={{ color: '#93A4B8' }}>Todavía no hay eventos.</p>}
      {eventos.map((e, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: '1px solid #1f3150', alignItems: 'center', textAlign: e.teamId === p.localId ? 'left' : 'right', flexDirection: e.teamId === p.localId ? 'row' : 'row-reverse' }}>
          <b style={{ color: '#D9A93A', minWidth: 44, textAlign: 'center' }}>{etiquetaMinuto(e.minuto, e.periodo, p.dur)}</b>
          <span style={{ fontSize: 20 }}>{ICONO[e.tipo] || ''}</span>
          <span style={{ flex: 1 }}>{e.numero != null && <b>{e.numero} </b>}{e.nombre}<small style={{ color: '#93A4B8', display: 'block' }}>{TXT[e.tipo] || e.tipo}</small></span>
        </div>
      ))}
      <p style={{ textAlign: 'center', color: '#5d6877', fontSize: 12, marginTop: 24 }}>Se actualiza solo · Keeper Cup Series — By NIX</p>
    </Pagina>
  )
}

function Pagina({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', background: '#0a121b', color: '#fff', fontFamily: 'system-ui, sans-serif' }}><div style={{ maxWidth: 520, margin: '0 auto', padding: '16px 14px 40px' }}>
    <p style={{ textAlign: 'center', fontWeight: 900, letterSpacing: 2, margin: '4px 0' }}>KEEPER CUP <span style={{ color: '#2fb344' }}>3</span></p>{children}</div></div>
}
