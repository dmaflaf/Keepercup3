'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Carnet {
  ok: boolean; message?: string; nombres: string; apellidos: string; numero: number | null; posicion: string | null; club: string
  escudo: string | null; estado: string; suspendidoPorSancion: boolean; tieneFoto: boolean
  control: { rol: string; sancion: { suspendidoProximo: number; amarillas: number; rojas: number; precaucion: boolean } | null } | null
}

const COLOR: Record<string, { bg: string; txt: string; fg: string }> = {
  habilitado: { bg: '#2fb344', txt: 'JUGADOR HABILITADO', fg: '#04210a' },
  pendiente: { bg: '#f2b81a', txt: 'PENDIENTE DE DOCUMENTOS', fg: '#2b2000' },
  suspendido: { bg: '#d93636', txt: 'SUSPENDIDO', fg: '#fff' },
}

export default function CarnetDigital() {
  const { token } = useParams<{ token: string }>()
  const [c, setC] = useState<Carnet | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetch(`/api/carnet/${token}`).then((r) => r.json()).then((r) => (r.ok ? setC(r) : setError(r.message || 'Carnet no encontrado'))).catch(() => setError('No se pudo cargar el carnet'))
  }, [token])

  const est = c ? COLOR[c.estado] || COLOR.pendiente : COLOR.pendiente
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(900px 500px at 50% -10%,#12305a 0%,#051225 62%)', color: '#F3F6F8', fontFamily: "'Work Sans',system-ui,sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px 40px' }}>
      <style dangerouslySetInnerHTML={{ __html: "@import url('https://fonts.googleapis.com/css2?family=League+Spartan:wght@700;900&family=Work+Sans:wght@400;600;700&display=swap');" }} />
      {error && <p style={{ marginTop: 80, fontSize: 18 }}>{error}</p>}
      {!c && !error && <p style={{ marginTop: 80 }}>Cargando…</p>}
      {c && (
        <>
          <div style={{ width: 300, background: '#061326', borderRadius: 18, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,.5)', position: 'relative', paddingBottom: 56 }}>
            <div style={{ height: 4, margin: '0 28px', background: '#D9A93A' }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-kc3.png" alt="Keeper Cup 3" style={{ display: 'block', height: 26, margin: '18px auto 14px' }} />
            <div style={{ width: 190, height: 228, margin: '0 auto', borderRadius: 12, overflow: 'hidden', background: '#13294a' }}>
              {c.tieneFoto
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/api/carnet/${token}/foto`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8fa1b6' }}>Sin foto</div>}
            </div>
            <div style={{ textAlign: 'center', fontFamily: "'League Spartan',sans-serif", fontWeight: 900, fontSize: 52, lineHeight: 1, color: '#D9A93A', marginTop: 12 }}>{c.numero ?? '–'}</div>
            <div style={{ textAlign: 'center', fontFamily: "'League Spartan',sans-serif", fontWeight: 900, fontSize: 20, lineHeight: 1.1, textTransform: 'uppercase', marginTop: 8, padding: '0 14px' }}>{c.nombres}<br /><span style={{ color: '#D9A93A' }}>{c.apellidos}</span></div>
            <div style={{ textAlign: 'center', fontSize: 12, color: '#8fa1b6', letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.escudo && <img src={c.escudo} alt="" style={{ height: 22 }} />}{c.club}{c.posicion ? ` · ${c.posicion}` : ''}
            </div>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 44, background: est.bg, color: est.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'League Spartan',sans-serif", fontWeight: 900, letterSpacing: '.08em', fontSize: 14 }}>
              {c.estado === 'habilitado' ? '✔ ' : c.estado === 'suspendido' ? '⛔ ' : '⚠ '}{est.txt}
            </div>
          </div>
          {c.suspendidoPorSancion && <p style={{ marginTop: 14, color: '#ff8a7a', fontWeight: 700, textAlign: 'center' }}>Suspendido por tarjetas para su próximo partido</p>}
          {c.control && (
            <div style={{ marginTop: 18, width: 300, background: '#0F223D', border: '1px solid rgba(224,232,240,.2)', borderRadius: 12, padding: 14, fontSize: 14 }}>
              <b style={{ color: '#D9A93A' }}>Control ({c.control.rol})</b>
              <p style={{ margin: '6px 0 0', color: '#cdd6e2' }}>
                {c.control.sancion
                  ? <>🟨 {c.control.sancion.amarillas} · 🟥 {c.control.sancion.rojas}<br />{c.control.sancion.suspendidoProximo > 0 ? `Suspendido ${c.control.sancion.suspendidoProximo} partido(s)` : c.control.sancion.precaucion ? 'En precaución: una amarilla más = suspensión' : 'Sin sanciones pendientes'}</>
                  : 'Sin tarjetas registradas'}
              </p>
              <p style={{ margin: '8px 0 0', color: '#8fa1b6', fontSize: 12 }}>Compara la foto con el jugador antes de autorizar.</p>
            </div>
          )}
          <p style={{ marginTop: 20, color: '#8fa1b6', fontSize: 12 }}>Keeper Cup Series — By NIX</p>
        </>
      )}
    </div>
  )
}
