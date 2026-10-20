'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { nombreClubCarnet } from '@/lib/club-nombre'

interface Ficha {
  torneo: string; goles: number; penales: number; amarillas: number; rojas: number
  suspendidoPartidos: number; suspensionesCumplidas: number; motivos: string[]; amarillasParaSuspension: number; enCiclo: number
  partidosJugados: number | null; golesPorPartido: number | null; minutosJugados: number | null; portero: { partidos: number; golesRecibidos: number; vallasInvictas: number; promedio: number; ranking: number | null } | null; sinTarjetas: boolean; rankingGoleador: number | null
  proximo: { jornada: string; rival: string; local: boolean; fecha: string | null; hora: string | null; escenario: string | null } | null
  ultimos: { jornada: string; rival: string; gf: number; gc: number; res: 'V' | 'E' | 'D' }[]
  tabla: { fase: string; grupo: string; miPos: number; filas: { pos: number; equipo: string; pj: number; dg: number; pts: number; mio: boolean }[] } | null
  historial: { tipo: string; minuto: number | null; jornada: string; rival: string; fecha: string | null }[]
}
interface Carnet {
  ok: boolean; message?: string; nombres: string; apellidos: string; numero: number | null; posicion: string | null; club: string; edad: number | null
  escudo: string | null; estado: string; suspendidoPorSancion: boolean; tieneFoto: boolean; crop: { x: number; y: number; w: number; h: number } | null
  cedulaOculta: string; ficha: Ficha | null
  control: { rol: string; fechaNacimiento: string | null; traspasoPendiente?: { deClub: string; aClub: string } | null; documentos: { selfie: boolean; cedulaFrente: boolean; cedulaReverso: boolean }; cedula?: string; jugadorId?: string; usuario?: string } | null
}

const EVENTO: Record<string, [string, string]> = { gol: ['gol', 'Gol'], gol_penal: ['gol', 'Gol de penal'], autogol: ['ro', 'Autogol'], amarilla: ['am', 'Tarjeta amarilla'], doble_amarilla: ['ro', 'Doble amarilla (expulsión)'], roja: ['ro', 'Tarjeta roja'] }
const fechaCorta = (f: string | null) => (f ? new Date(f + 'T12:00:00').toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Fecha por definir')

const CSS = `
@font-face{font-family:'RC';src:url('/fonts/RobotoCondensed_400Regular.ttf');font-weight:400}
@font-face{font-family:'RC';src:url('/fonts/RobotoCondensed_700Bold.ttf');font-weight:700}
@font-face{font-family:'BC';src:url('/fonts/BarlowCondensed_800ExtraBold.ttf');font-weight:800}
.fd{--navy:#0a121b;--rojo:#bf1b2c;--verde:#2fb344;--ambar:#f2b81a;--borde:#e3e6eb;--dim:#5d6877;min-height:100vh;background:#eef1f5;font-family:'RC',system-ui,sans-serif;color:var(--navy)}
.fd *{box-sizing:border-box}
.fd .wrap{max-width:430px;margin:0 auto;padding:0 14px 48px}
.fd .topbar{display:flex;align-items:center;justify-content:space-between;padding:14px 2px 10px}
.fd .topbar img{height:26px;background:var(--navy);padding:4px 10px;border-radius:6px}
.fd .topbar span{font-size:12px;color:var(--dim)}
.fd .carnet{--u:2.06px;position:relative;width:calc(155.98*var(--u));height:calc(240.94*var(--u));margin:6px auto 0;border-radius:calc(11*var(--u));overflow:hidden;background:#fff url('/plantillas/carnet-frente.png') center/100% 100% no-repeat;box-shadow:0 10px 30px rgba(10,18,27,.25)}
.fd .carnet>*{position:absolute}
.fd .c-foto{left:calc(11.5*var(--u));top:calc(49.3*var(--u));width:calc(74.5*var(--u));height:calc(94.3*var(--u));border-radius:calc(6*var(--u));overflow:hidden;background:#d7dde6}
.fd .c-foto img{display:block}
.fd .c-esc{left:calc((118.1 - 26)*var(--u));top:calc((94.8 - 27.5)*var(--u));width:calc(52*var(--u));height:calc(55*var(--u));display:flex;align-items:center;justify-content:center}
.fd .c-esc img{max-width:100%;max-height:100%}
.fd .c-txt{left:calc((48.8 - 38)*var(--u));width:calc(76*var(--u));text-align:center;line-height:1;white-space:nowrap;font-size:calc(11.2*var(--u));overflow:hidden}
.fd .c-num{left:calc((116.5 - 30)*var(--u));width:calc(60*var(--u));top:calc((190.5 - 40.6)*var(--u));text-align:center;font-family:'BC';font-weight:800;color:var(--rojo);font-size:calc(58*var(--u));line-height:.86}
.fd .c-club{left:0;right:0;top:calc((210.9 - 11.6)*var(--u));text-align:center;font-family:'BC';font-weight:800;color:#fff;font-size:calc(16.2*var(--u));line-height:1}
.fd .estado{margin-top:14px;border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:12px;color:#fff}
.fd .estado .ic{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;font-size:20px;flex:none}
.fd .estado b{font-family:'BC';font-weight:800;font-size:20px;letter-spacing:.04em;display:block;line-height:1.05}
.fd .estado small{font-size:12.5px;opacity:.95}
.fd .e-ok{background:linear-gradient(90deg,#1f8f35,var(--verde))}.fd .e-pend{background:linear-gradient(90deg,#d99a00,var(--ambar));color:#2b2000}.fd .e-susp{background:linear-gradient(90deg,#a81f1f,#d93636)}
.fd .insig{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.fd .insig span{background:#fff;border:1px solid var(--borde);border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:700}
.fd .insig .oro{background:linear-gradient(90deg,#fff3c4,#ffe27a);border-color:#e6c04a}
.fd .card{background:#fff;border:1px solid var(--borde);border-radius:14px;padding:16px;margin-top:14px;box-shadow:0 1px 2px rgba(10,18,27,.05)}
.fd .card h2{font-family:'BC';font-weight:800;font-size:20px;letter-spacing:.05em;margin:0 0 12px;text-transform:uppercase;display:flex;align-items:center;gap:8px}
.fd .card h2::before{content:"";width:4px;height:18px;background:var(--rojo);border-radius:2px}
.fd .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.fd .stat{background:#f6f7f9;border-radius:10px;padding:10px 6px;text-align:center}
.fd .stat b{display:block;font-family:'BC';font-weight:800;font-size:34px;line-height:1}
.fd .stat.rojo b{color:var(--rojo)}
.fd .stat span{font-size:11.5px;color:var(--dim);letter-spacing:.03em;text-transform:uppercase}
.fd .barra{display:flex;gap:6px;margin:6px 0 8px}.fd .barra i{flex:1;height:12px;border-radius:6px;background:#e3e6eb}.fd .barra i.on{background:var(--ambar)}.fd .barra i.full{background:var(--rojo)}
.fd .nota{font-size:13px;color:var(--dim);line-height:1.4;margin:0}
.fd .proximo{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:center}
.fd .eq{flex:1;font-weight:700;font-size:15px;line-height:1.15}.fd .eq small{display:block;font-weight:400;color:var(--dim);font-size:11px}
.fd .vs{font-family:'BC';font-weight:800;font-size:26px;color:var(--rojo)}
.fd .cuando{margin-top:10px;background:var(--navy);color:#fff;border-radius:10px;padding:10px 12px;font-size:13px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.fd .racha{display:flex;gap:8px;margin-bottom:10px}
.fd .chip{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'BC';font-weight:800;font-size:17px;color:#fff}
.fd .V{background:var(--verde)}.fd .E{background:#98a2b3}.fd .D{background:var(--rojo)}
.fd .res{display:flex;justify-content:space-between;font-size:13.5px;padding:7px 0;border-top:1px solid var(--borde)}.fd .res b{font-family:'BC';font-weight:800;font-size:17px}
.fd table{width:100%;border-collapse:collapse;font-size:13px}.fd th{color:var(--dim);font-weight:400;text-align:center;padding:4px 2px;font-size:11px}
.fd td{padding:7px 2px;text-align:center;border-top:1px solid var(--borde)}.fd td:nth-child(2){text-align:left;font-weight:700}
.fd tr.mio td{background:#fdecee;color:var(--rojo)}
.fd .linea{position:relative;margin-left:8px;padding-left:18px;border-left:2px solid var(--borde)}
.fd .ev{position:relative;padding:0 0 14px;font-size:13.5px}
.fd .ev::before{content:"";position:absolute;left:-26px;top:3px;width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid var(--navy)}
.fd .ev.gol::before{border-color:var(--verde)}.fd .ev.am::before{border-color:var(--ambar)}.fd .ev.ro::before{border-color:var(--rojo)}
.fd .ev small{display:block;color:var(--dim);font-size:11.5px}
.fd .ficha{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}
.fd .ficha div{background:#fff;border:1px solid var(--borde);border-radius:10px;padding:8px 4px;text-align:center}
.fd .ficha b{display:block;font-family:'BC';font-weight:800;font-size:20px;line-height:1.1}.fd .ficha span{font-size:10.5px;color:var(--dim);text-transform:uppercase}
.fd .control{background:#0a121b;color:#fff;border-radius:14px;padding:14px 16px;margin-top:14px}
.fd .control h3{font-family:'BC';font-weight:800;font-size:15px;letter-spacing:.08em;margin:0 0 8px;color:var(--ambar)}
.fd .control ul{margin:0;padding:0;list-style:none;font-size:13.5px;line-height:1.9}
.fd .btn{display:inline-block;margin-top:10px;background:var(--rojo);color:#fff;border:none;border-radius:10px;padding:10px 14px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;text-decoration:none}
.fd .btn.sec{background:#fff;color:var(--navy);margin-left:8px}
.fd .pie{text-align:center;color:var(--dim);font-size:11.5px;margin-top:18px;line-height:1.5}
.fd .modal{position:fixed;inset:0;background:rgba(5,10,18,.94);z-index:50;display:flex;flex-direction:column;align-items:center;padding:16px;overflow:auto;color:#fff}
.fd .doc{position:relative;width:100%;max-width:420px;margin-top:10px;border-radius:10px;overflow:hidden}
.fd .doc img{width:100%;display:block}
.fd .doc .marca{position:absolute;inset:0;display:flex;flex-wrap:wrap;align-content:space-around;justify-content:space-around;pointer-events:none;overflow:hidden}
.fd .doc .marca i{font-style:normal;font-size:12px;font-weight:700;color:rgba(255,255,255,.55);text-shadow:0 0 2px rgba(0,0,0,.8);transform:rotate(-25deg);padding:18px 6px;white-space:nowrap}
`

export default function FichaDeportiva() {
  const { token } = useParams<{ token: string }>()
  const [c, setC] = useState<Carnet | null>(null)
  const [error, setError] = useState('')
  const [docs, setDocs] = useState<{ frente: string | null; reverso: string | null; segundos: number } | null>(null)
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(`/api/carnet/${token}`).then((r) => r.json()).then((r) => (r.ok ? setC(r) : setError(r.message || 'Carnet no encontrado'))).catch(() => setError('No se pudo cargar el carnet'))
  }, [token])

  // Con la ficha abierta, se refresca sola cada 20 s (solo si la pantalla está visible) para ver goles y tarjetas recién anotados
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      fetch(`/api/carnet/${token}`, { cache: 'no-store' }).then((r) => r.json()).then((r) => { if (r.ok) setC(r) }).catch(() => null)
    }, 20000)
    return () => clearInterval(t)
  }, [token])

  // Sesión del personal: se cierra sola tras 5 minutos sin uso (equipos compartidos en la cancha)
  const esPersonal = !!c?.control
  useEffect(() => {
    if (!esPersonal) return
    const reiniciar = () => {
      if (idle.current) clearTimeout(idle.current)
      idle.current = setTimeout(async () => { await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null); window.location.reload() }, 5 * 60 * 1000)
    }
    const evs = ['pointerdown', 'keydown', 'scroll', 'touchstart']
    evs.forEach((e) => window.addEventListener(e, reiniciar, { passive: true }))
    reiniciar()
    return () => { evs.forEach((e) => window.removeEventListener(e, reiniciar)); if (idle.current) clearTimeout(idle.current) }
  }, [esPersonal])

  // Documentos: solo tras tocar el botón; se cierran solos a los 30 s
  const cerrarDocs = useCallback(() => { setDocs((d) => { if (d?.frente) URL.revokeObjectURL(d.frente); if (d?.reverso) URL.revokeObjectURL(d.reverso); return null }) }, [])
  async function verDocumentos() {
    const id = c?.control?.jugadorId
    if (!id) return
    const bajar = async (k: string) => { const r = await fetch(`/api/admin/documentos/${id}/${k}`); return r.ok ? URL.createObjectURL(await r.blob()) : null }
    const [frente, reverso] = await Promise.all([bajar('cedula_front'), bajar('cedula_back')])
    setDocs({ frente, reverso, segundos: 30 })
  }
  useEffect(() => {
    if (!docs) return
    if (docs.segundos <= 0) { cerrarDocs(); return }
    const t = setTimeout(() => setDocs((d) => (d ? { ...d, segundos: d.segundos - 1 } : d)), 1000)
    return () => clearTimeout(t)
  }, [docs, cerrarDocs])

  if (error) return <div className="fd"><style dangerouslySetInnerHTML={{ __html: CSS }} /><div className="wrap" style={{ paddingTop: 80, textAlign: 'center' }}>{error}</div></div>
  if (!c) return <div className="fd"><style dangerouslySetInnerHTML={{ __html: CSS }} /><div className="wrap" style={{ paddingTop: 80, textAlign: 'center' }}>Cargando…</div></div>

  const f = c.ficha
  const est = c.estado === 'habilitado' ? { cls: 'e-ok', ic: '✔', t: 'JUGADOR HABILITADO', s: 'Puede jugar el próximo partido' }
    : c.estado === 'suspendido' ? { cls: 'e-susp', ic: '⛔', t: f && f.suspendidoPartidos > 0 ? `SUSPENDIDO · ${f.suspendidoPartidos} PARTIDO${f.suspendidoPartidos > 1 ? 'S' : ''}` : 'SUSPENDIDO', s: 'No puede jugar su próximo partido' }
      : { cls: 'e-pend', ic: '⚠', t: 'PENDIENTE DE DOCUMENTOS', s: 'Falta completar su inscripción para jugar' }
  const primera = nombreClubCarnet(c.club)
  const crop = c.crop
  const iniciales = c.club.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  const ciclo = f ? (f.suspendidoPartidos > 0 ? f.amarillasParaSuspension : f.enCiclo) : 0

  return (
    <div className="fd">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="wrap">
        <div className="topbar">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/logo-kc3.png" alt="Keeper Cup 3" /><span>{f?.torneo || 'Keeper Cup'}</span></div>

        <div className="carnet">
          <div className="c-foto">
            {c.tieneFoto
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={`/api/carnet/${token}/foto`} alt="" style={crop ? { position: 'absolute', left: `${(-crop.x / crop.w) * 100}%`, top: `${(-crop.y / crop.h) * 100}%`, width: `${100 / crop.w}%`, height: `${100 / crop.h}%`, maxWidth: 'none' } : { width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8fa1b6', fontSize: 12 }}>Sin foto</div>}
          </div>
          <div className="c-esc">{/* eslint-disable-next-line @next/next/no-img-element */}
            {c.escudo ? <img src={c.escudo} alt="" /> : <svg viewBox="0 0 52 60" width="100%" height="100%"><path d="M26 2 48 9v22c0 13-9 22-22 27C13 53 4 44 4 31V9z" fill="#0a121b" /><path d="M26 7 43 12.5V31c0 10-7 17-17 21.5C16 48 9 41 9 31V12.5z" fill="none" stroke="#D9A93A" strokeWidth="2" /><text x="26" y="36" textAnchor="middle" fontFamily="Arial" fontWeight="900" fontSize="15" fill="#fff">{iniciales}</text></svg>}
          </div>
          <div className="c-txt" style={{ top: `${(158.6 - 8.2) * 2.06}px`, fontWeight: 700 }}>{c.nombres}</div>
          <div className="c-txt" style={{ top: `${(168.6 - 8.2) * 2.06}px` }}>{c.apellidos}</div>
          <div className="c-txt" style={{ top: `${(178.9 - 8.2) * 2.06}px` }}>{c.cedulaOculta}</div>
          <div className="c-txt" style={{ top: `${(188.8 - 8.2) * 2.06}px` }}>{c.edad !== null ? `${c.edad} años` : ''}</div>
          <div className="c-num">{c.numero ?? '–'}</div>
          <div className="c-club">{primera}</div>
        </div>

        <div className={`estado ${est.cls}`}><div className="ic">{est.ic}</div><div><b>{est.t}</b><small>{est.s}</small></div></div>

        {f && (f.rankingGoleador !== null && f.rankingGoleador <= 10 || f.sinTarjetas || (f.portero?.ranking != null && f.portero.ranking <= 5)) && (
          <div className="insig">
            {f.rankingGoleador !== null && f.rankingGoleador <= 10 && <span className={f.rankingGoleador <= 3 ? 'oro' : ''}>⚽ N.º {f.rankingGoleador} entre los goleadores</span>}
            {f.portero?.ranking != null && f.portero.ranking <= 5 && <span className={f.portero.ranking <= 3 ? 'oro' : ''}>🧤 N.º {f.portero.ranking} entre los porteros</span>}
            {f.sinTarjetas && <span>🤝 Juego limpio: sin tarjetas</span>}
          </div>
        )}

        <div className="ficha">
          <div><b>{c.edad ?? '–'}</b><span>Edad</span></div>
          <div><b>{(c.posicion || '–').slice(0, 10)}</b><span>Posición</span></div>
          <div><b>{c.numero ?? '–'}</b><span>Número</span></div>
          <div><b style={{ fontSize: primera.length > 8 ? 14 : undefined }}>{primera}</b><span>Club</span></div>
        </div>

        {f && (
          <>
            <div className="card"><h2>Estadísticas del torneo</h2>
              <div className="grid">
                {f.partidosJugados !== null && <div className="stat"><b>{f.partidosJugados}</b><span>Partidos jugados</span></div>}
                <div className="stat rojo"><b>{f.goles}</b><span>Goles</span></div>
                <div className="stat"><b>{f.penales}</b><span>De penal</span></div>
                <div className="stat"><b>{f.amarillas}</b><span>Amarillas</span></div>
                <div className="stat"><b>{f.rojas}</b><span>Rojas</span></div>
                {f.golesPorPartido !== null && <div className="stat"><b>{f.golesPorPartido}</b><span>Goles por partido</span></div>}
                {f.minutosJugados !== null && <div className="stat"><b>{f.minutosJugados}</b><span>Minutos jugados</span></div>}
                {f.portero && <div className="stat"><b>{f.portero.golesRecibidos}</b><span>Goles recibidos</span></div>}
                {f.portero && <div className="stat"><b>{f.portero.vallasInvictas}</b><span>Vallas invictas</span></div>}
              </div>
            </div>

            <div className="card"><h2>Disciplina</h2>
              <div className="barra">{Array.from({ length: f.amarillasParaSuspension }).map((_, i) => <i key={i} className={f.suspendidoPartidos > 0 ? 'full' : i < ciclo ? 'on' : ''} />)}</div>
              <p className="nota"><b>{f.suspendidoPartidos > 0 ? `Suspensión: ${f.suspendidoPartidos} partido(s)` : `${ciclo} de ${f.amarillasParaSuspension} amarillas acumuladas`}</b>
                {f.suspendidoPartidos > 0 && f.motivos.length ? ` · ${f.motivos[f.motivos.length - 1]}` : ciclo === f.amarillasParaSuspension - 1 ? ' · Una amarilla más y se suspende 1 partido.' : ''}
                {f.suspensionesCumplidas > 0 && ` Suspensiones cumplidas: ${f.suspensionesCumplidas}.`}</p>
            </div>

            <div className="card"><h2>Próximo partido</h2>
              {f.proximo ? (<>
                <div className="proximo"><div className="eq">{f.proximo.local ? c.club : f.proximo.rival}<small>{f.proximo.jornada}</small></div><div className="vs">VS</div><div className="eq">{f.proximo.local ? f.proximo.rival : c.club}</div></div>
                <div className="cuando"><span>📅 {fechaCorta(f.proximo.fecha)}{f.proximo.hora ? ` · ${f.proximo.hora}` : ''}</span>{f.proximo.escenario && <span>📍 {f.proximo.escenario}</span>}</div>
              </>) : <p className="nota">No hay partidos programados por ahora.</p>}
            </div>

            {f.ultimos.length > 0 && (
              <div className="card"><h2>Últimos partidos de su club</h2>
                <div className="racha">{f.ultimos.map((u, i) => <div key={i} className={`chip ${u.res}`}>{u.res}</div>)}</div>
                {f.ultimos.slice(0, 3).map((u, i) => <div key={i} className="res"><span>{u.jornada} · vs {u.rival}</span><b>{u.gf} - {u.gc}</b></div>)}
              </div>
            )}

            {f.tabla && (
              <div className="card"><h2>Tabla · {f.tabla.grupo}</h2>
                <table><thead><tr><th></th><th></th><th>PJ</th><th>DG</th><th>PTS</th></tr></thead><tbody>
                  {f.tabla.filas.filter((r, i) => i < 5 || r.mio).map((r) => <tr key={r.pos} className={r.mio ? 'mio' : ''}><td>{r.pos}</td><td>{r.equipo}</td><td>{r.pj}</td><td>{r.dg > 0 ? `+${r.dg}` : r.dg}</td><td><b>{r.pts}</b></td></tr>)}
                </tbody></table>
                <p className="nota" style={{ marginTop: 8 }}>{f.tabla.fase}</p>
              </div>
            )}

            <div className="card"><h2>Su historial en el torneo</h2>
              {f.historial.length ? <div className="linea">{f.historial.map((h, i) => { const [cls, nombre] = EVENTO[h.tipo] || ['', h.tipo]; return <div key={i} className={`ev ${cls}`}>{nombre}{h.minuto !== null ? ` · min ${h.minuto}` : ''}<small>{h.jornada} · vs {h.rival}</small></div> })}</div> : <p className="nota">Todavía no registra goles ni tarjetas.</p>}
            </div>
          </>
        )}

        {c.control && (
          <div className="control"><h3>CONTROL · SOLO PERSONAL ({c.control.rol})</h3>
            <ul>
              <li>{c.control.documentos.selfie ? '✔' : '✖'} Foto registrada · compárala con el jugador</li>
              <li>{c.control.documentos.cedulaFrente && c.control.documentos.cedulaReverso ? '✔ Cédula verificada (frente y reverso)' : '✖ Cédula incompleta: no habilitar sin documentos'}</li>
              {c.control.traspasoPendiente && <li style={{ color: '#fbbf24', fontWeight: 700 }}>🔁 CARNET DESACTUALIZADO: pasó de {c.control.traspasoPendiente.deClub} a {c.control.traspasoPendiente.aClub}. El carnet impreso puede mostrar el club anterior; reimprimir.</li>}
              <li>🎂 Nació el {c.control.fechaNacimiento ? fechaCorta(c.control.fechaNacimiento).replace(/^\S+\s/, '') + ' ' + c.control.fechaNacimiento.slice(0, 4) : 'sin dato'}</li>
              <li>{f && f.suspendidoPartidos > 0 ? '⛔ SUSPENDIDO: no autorizar para el próximo partido' : f && f.enCiclo === f.amarillasParaSuspension - 1 ? '⚠ En precaución: una amarilla más y se suspende' : '✔ Sin sanciones pendientes'}</li>
              {c.control.cedula !== undefined && <li>🪪 Cédula: <b>{c.control.cedula || 'sin dato'}</b></li>}
            </ul>
            {c.control.jugadorId && (<>
              <button className="btn" onClick={verDocumentos}>Ver documentos</button>
              <a className="btn sec" href="/admin/carnets">Editar jugador</a>
              <p style={{ fontSize: 11.5, opacity: 0.7, margin: '10px 0 0' }}>Cada vez que abres los documentos queda registrado. Se cierran solos a los 30 segundos.</p>
            </>)}
          </div>
        )}

        <p className="pie">Información oficial del torneo, actualizada al cerrar cada partido.<br />Keeper Cup Series — By NIX · keeper.com.ec</p>
      </div>

      {docs && (
        <div className="modal">
          <b>Documentos de {c.nombres} {c.apellidos} · se cierran en {docs.segundos} s</b>
          {[['Cédula · frente', docs.frente], ['Cédula · reverso', docs.reverso]].map(([t, src]) => src ? (
            <div key={t as string} style={{ width: '100%', maxWidth: 420 }}><p style={{ margin: '12px 0 0', fontSize: 13 }}>{t}</p>
              <div className="doc">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={src as string} alt="" /><div className="marca">{Array.from({ length: 12 }).map((_, i) => <i key={i}>KEEPER CUP · {c.control?.usuario} · {new Date().toLocaleString('es-EC')}</i>)}</div></div></div>
          ) : <p key={t as string} style={{ marginTop: 14 }}>{t}: no hay imagen cargada.</p>)}
          <button className="btn" onClick={cerrarDocs}>Cerrar ahora</button>
        </div>
      )}
    </div>
  )
}
