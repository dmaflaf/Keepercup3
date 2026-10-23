'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Conc = { cargado: number; pagado: number }
interface Fila { teamId: string; club: string; porConcepto: Record<string, Conc>; cargado: number; pagado: number; saldo: number }
interface Cargo { id: string; teamId: string; club: string; concepto: string; detalle: string | null; monto: number; anulado: boolean; fecha: string }
interface Pago { id: string; teamId: string; club: string; concepto: string; monto: number; nota: string | null; comprobante: string | null; fechaPago: string | null; anulado: boolean; usuario: string }
interface Datos { torneoId: string; porDefecto?: Record<string, number>; filas: Fila[]; cargos: Cargo[]; pagos: Pago[] }

const CONC: [string, string][] = [['multas', 'Multas'], ['inscripcion', 'Inscripción'], ['garantia', 'Garantía'], ['carnets', 'Carnets'], ['otro', 'Otro']]
const NOMBRE = Object.fromEntries(CONC)
const inp = 'px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm'
const btn = 'px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm'
const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2)
const hoy = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)

export default function Finanzas() {
  const [torneos, setTorneos] = useState<{ id: string; nombre: string }[]>([])
  const [tid, setTid] = useState('')
  const [d, setD] = useState<Datos | null>(null)
  const [msg, setMsg] = useState('Cargando…')
  const [filtro, setFiltro] = useState('')
  const [cg, setCg] = useState({ teamId: '', todos: false, concepto: 'inscripcion', detalle: '', monto: '' })
  const [pg, setPg] = useState({ teamId: '', concepto: 'inscripcion', monto: '', comprobante: '', fechaPago: hoy(), nota: '' })

  const cargar = useCallback(async (id?: string) => {
    const r = await fetch('/api/admin/finanzas' + (id ? `?torneoId=${id}` : ''), { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setMsg(r?.message || 'No se pudo cargar (solo el administrador)'); return }
    setTorneos(r.torneos); setD(r.datos); setMsg(r.datos ? '' : 'Todavía no hay un torneo.')
    if (r.datos) setTid(r.datos.torneoId)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const post = async (b: Record<string, unknown>, ok: string) => {
    const r = await fetch('/api/admin/finanzas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ torneoId: tid, ...b }) }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Error de conexión' }))
    setMsg(r.ok ? ok : r.message || 'Error'); if (r.ok) await cargar(tid); return r
  }
  const filas = (d?.filas || []).filter((f) => !filtro || f.club.toLowerCase().includes(filtro.toLowerCase()))
  const tot = (d?.filas || []).reduce((a, f) => ({ c: a.c + f.cargado, p: a.p + f.pagado }), { c: 0, p: 0 })

  const csv = () => {
    const l = [['Club', ...CONC.map((c) => c[1] + ' (cargado)'), ...CONC.map((c) => c[1] + ' (pagado)'), 'Total', 'Pagado', 'Saldo'].join(',')]
    for (const f of d?.filas || []) l.push([`"${f.club}"`, ...CONC.map((c) => f.porConcepto[c[0]].cargado.toFixed(2)), ...CONC.map((c) => f.porConcepto[c[0]].pagado.toFixed(2)), f.cargado.toFixed(2), f.pagado.toFixed(2), f.saldo.toFixed(2)].join(','))
    l.push('', 'Pagos'); l.push('Fecha,Club,Concepto,Monto,Comprobante,Nota,Anulado')
    for (const p of d?.pagos || []) l.push([p.fechaPago || '', `"${p.club}"`, NOMBRE[p.concepto] || p.concepto, p.monto.toFixed(2), `"${p.comprobante || ''}"`, `"${p.nota || ''}"`, p.anulado ? 'sí' : ''].join(','))
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + l.join('\n')], { type: 'text/csv' })); a.download = 'finanzas-keeper-cup.csv'; a.click()
  }

  const clubes = (d?.filas || []).map((f) => ({ id: f.teamId, n: f.club }))
  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm">← Inicio</Link>
        <h1 className="text-3xl font-bold mt-2">💵 Finanzas</h1>
        <p className="text-slate-400 mb-4">Cargos por club (inscripción, garantía, carnets, otros), multas por tarjetas y pagos con número de comprobante y fecha. Solo administrador.</p>
        {torneos.length > 1 && <select className={inp + ' mb-3'} value={tid} onChange={(e) => { setTid(e.target.value); cargar(e.target.value) }}>{torneos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select>}
        {msg && <div className="bg-slate-700 border border-slate-500 rounded-lg p-3 mb-4 text-sm" onClick={() => setMsg('')}>{msg}</div>}
        {d && (
          <>
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <h2 className="font-bold mb-2">➕ Registrar un cargo</h2>
                <div className="grid grid-cols-2 gap-2">
                  <select className={inp + ' col-span-2'} value={cg.todos ? '*' : cg.teamId} onChange={(e) => setCg({ ...cg, todos: e.target.value === '*', teamId: e.target.value === '*' ? '' : e.target.value })}>
                    <option value="">— Elige el club —</option><option value="*">★ Todos los clubes</option>{clubes.map((c) => <option key={c.id} value={c.id}>{c.n}</option>)}
                  </select>
                  <select className={inp} value={cg.concepto} onChange={(e) => setCg({ ...cg, concepto: e.target.value })}>{CONC.slice(1).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
                  <input className={inp} placeholder="Monto $" inputMode="decimal" value={cg.monto} onChange={(e) => setCg({ ...cg, monto: e.target.value })} />
                  <input className={inp + ' col-span-2'} placeholder="Detalle (opcional)" value={cg.detalle} onChange={(e) => setCg({ ...cg, detalle: e.target.value })} />
                </div>
                <button className={btn + ' mt-3'} disabled={(!cg.teamId && !cg.todos) || !cg.monto}
                  onClick={async () => { if (cg.todos && !confirm(`¿Cargar ${usd(Number(cg.monto.replace(',', '.')) || 0)} de ${NOMBRE[cg.concepto]} a TODOS los clubes?`)) return; const r = await post({ accion: 'cargo', ...cg }, 'Cargo registrado'); if (r.ok) setCg({ ...cg, monto: '', detalle: '' }) }}>Registrar cargo</button>
              </section>
              <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <h2 className="font-bold mb-2">💳 Registrar un pago</h2>
                <div className="grid grid-cols-2 gap-2">
                  <select className={inp + ' col-span-2'} value={pg.teamId} onChange={(e) => setPg({ ...pg, teamId: e.target.value })}><option value="">— Elige el club —</option>{clubes.map((c) => <option key={c.id} value={c.id}>{c.n}</option>)}</select>
                  <select className={inp} value={pg.concepto} onChange={(e) => setPg({ ...pg, concepto: e.target.value })}>{CONC.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
                  <input className={inp} placeholder="Monto $" inputMode="decimal" value={pg.monto} onChange={(e) => setPg({ ...pg, monto: e.target.value })} />
                  <input className={inp} placeholder="N.º de comprobante *" value={pg.comprobante} onChange={(e) => setPg({ ...pg, comprobante: e.target.value })} />
                  <input className={inp} type="date" value={pg.fechaPago} onChange={(e) => setPg({ ...pg, fechaPago: e.target.value })} />
                  <input className={inp + ' col-span-2'} placeholder="Nota (opcional): transferencia, efectivo…" value={pg.nota} onChange={(e) => setPg({ ...pg, nota: e.target.value })} />
                </div>
                <button className={btn + ' mt-3'} disabled={!pg.teamId || !pg.monto || !pg.comprobante || !pg.fechaPago}
                  onClick={async () => { const r = await post({ accion: 'pago', ...pg }, 'Pago registrado'); if (r.ok) setPg({ ...pg, monto: '', comprobante: '', nota: '' }) }}>Registrar pago</button>
              </section>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h2 className="font-bold text-lg">Estado por club</h2>
              <input className={inp} placeholder="Buscar club…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
              <button className="px-3 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm" onClick={csv}>⬇ Descargar Excel (CSV)</button>
              <span className="text-sm text-slate-300 ml-auto">Cargado {usd(tot.c)} · Pagado <b className="text-green-400">{usd(tot.p)}</b> · Pendiente <b className="text-yellow-300">{usd(tot.c - tot.p)}</b></span>
            </div>
            <div className="overflow-x-auto bg-slate-800 border border-slate-700 rounded-xl mb-6">
              <table className="w-full text-sm">
                <thead className="text-slate-400"><tr><th className="text-left p-2">Club</th>{CONC.map(([k, n]) => <th key={k} className="p-2">{n}</th>)}<th className="p-2">Total</th><th className="p-2">Pagado</th><th className="p-2">Saldo</th></tr></thead>
                <tbody>{filas.map((f) => (
                  <tr key={f.teamId} className="border-t border-slate-700 text-center">
                    <td className="text-left p-2 font-semibold">{f.club}</td>
                    {CONC.map(([k]) => { const c = f.porConcepto[k]; return <td key={k} className="p-2 text-xs">{c.cargado || c.pagado ? <>{usd(c.cargado)}<br /><span className="text-green-400">{usd(c.pagado)}</span></> : <span className="text-slate-600">–</span>}</td> })}
                    <td className="p-2">{usd(f.cargado)}</td><td className="p-2 text-green-400">{usd(f.pagado)}</td><td className={`p-2 font-bold ${f.saldo > 0 ? 'text-yellow-300' : 'text-green-400'}`}>{usd(f.saldo)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 -mt-4 mb-2">Por defecto, todos los clubes tienen cargados <b>{usd(d.porDefecto?.inscripcion ?? 0)} de inscripción</b> y <b>{usd(d.porDefecto?.garantia ?? 0)} de garantía</b>, y <b>{usd(d.porDefecto?.carnet ?? 0)} por cada jugador habilitado</b> en carnets (se actualiza solo al habilitar jugadores). Si registras un cargo de ese concepto a un club, reemplaza el valor por defecto de ese club (por ejemplo, para un descuento).</p>
            <p className="text-xs text-slate-400 mb-6">En cada concepto: arriba lo cargado, abajo (verde) lo pagado. Las multas por tarjetas se calculan solas desde las tarjetas; sus pagos también se registran aquí con «Multas».</p>

            <div className="grid md:grid-cols-2 gap-4">
              <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <h3 className="font-bold mb-2">Pagos registrados</h3>
                {d.pagos.length === 0 && <p className="text-slate-400 text-sm">Todavía no hay pagos.</p>}
                {d.pagos.map((p) => (
                  <div key={p.id} className={`flex items-center gap-2 text-sm py-2 border-t border-slate-700 ${p.anulado ? 'opacity-40 line-through' : ''}`}>
                    <span className="flex-1"><b>{p.club}</b> · {NOMBRE[p.concepto] || p.concepto}<br /><span className="text-slate-400 text-xs">{p.fechaPago || 'sin fecha'} · comp. {p.comprobante || 's/n'}{p.nota ? ' · ' + p.nota : ''}</span></span>
                    <b className="text-green-400">{usd(p.monto)}</b>
                    <button className="text-xs text-red-300" onClick={() => confirm(p.anulado ? '¿Restaurar este pago?' : '¿Anular este pago?') && post({ accion: 'anular_pago', id: p.id, anulado: !p.anulado }, p.anulado ? 'Pago restaurado' : 'Pago anulado')}>{p.anulado ? 'Restaurar' : 'Anular'}</button>
                  </div>
                ))}
              </section>
              <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <h3 className="font-bold mb-2">Cargos registrados</h3>
                {d.cargos.length === 0 && <p className="text-slate-400 text-sm">Todavía no hay cargos.</p>}
                {d.cargos.map((c) => (
                  <div key={c.id} className={`flex items-center gap-2 text-sm py-2 border-t border-slate-700 ${c.anulado ? 'opacity-40 line-through' : ''}`}>
                    <span className="flex-1"><b>{c.club}</b> · {NOMBRE[c.concepto] || c.concepto}{c.detalle ? <span className="text-slate-400 text-xs"> · {c.detalle}</span> : null}</span>
                    <b>{usd(c.monto)}</b>
                    <button className="text-xs text-red-300" onClick={() => confirm(c.anulado ? '¿Restaurar este cargo?' : '¿Anular este cargo?') && post({ accion: 'anular_cargo', id: c.id, anulado: !c.anulado }, c.anulado ? 'Cargo restaurado' : 'Cargo anulado')}>{c.anulado ? 'Restaurar' : 'Anular'}</button>
                  </div>
                ))}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
