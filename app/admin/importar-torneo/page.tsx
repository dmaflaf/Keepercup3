'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ClubSistema, cotejarTarjetas, DatosKC3, enlazarClubes, JugadorSistema, numeroDe, Resolucion, validarDatos } from '@/lib/importar-kc3'

const inp = 'px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm'
const btn = 'px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm'
const btn2 = 'px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg text-sm'
const sec = 'bg-slate-800 border border-slate-700 rounded-xl p-5 mb-5'
interface Resumen { clubesEnlazados: number; clubesSinEnlazar: string[]; clubesRepetidos: number; partidos: number; jugados: number; tarjetas: number; auto: number; manual: number; ignoradas: number; cuerpo: number; sinCotejo: number; eventos: number; dobles: number; pagos: number }

export default function ImportarTorneo() {
  const [clubes, setClubes] = useState<ClubSistema[]>([])
  const [jugadores, setJugadores] = useState<JugadorSistema[]>([])
  const [previa, setPrevia] = useState<{ id: string; nombre: string } | null>(null)
  const [datos, setDatos] = useState<DatosKC3 | null>(null)
  const [mapa, setMapa] = useState<Record<string, string>>({})
  const [manual, setManual] = useState<Record<string, Resolucion>>({})
  const [filtro, setFiltro] = useState<'sin' | 'ok' | 'todas'>('sin')
  const [nombre, setNombre] = useState('Keeper Cup 3')
  const [conf, setConf] = useState('')
  const [msg, setMsg] = useState('')
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [hecho, setHecho] = useState<{ torneoId: string; partidos: number; eventos: number; pagos: number } | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/admin/importar-torneo', { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { setMsg(r?.message || 'No se pudo cargar (¿eres administrador?)'); return }
    setClubes(r.clubes); setJugadores(r.jugadores); setPrevia(r.importacionPrevia)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function leerArchivo(f: File | undefined) {
    if (!f) return
    try {
      const d = JSON.parse(await f.text())
      const e = validarDatos(d)
      if (e) { setMsg(e); return }
      setDatos(d); setMsg(''); setResumen(null); setHecho(null); setManual({})
      setMapa(enlazarClubes(Array.from(new Set((d as DatosKC3).equipos.map((x) => x.nombre))), clubes))
    } catch { setMsg('No se pudo leer el archivo. Debe ser el datos.json descargado de la herramienta.') }
  }
  // Si el archivo se cargó antes que los clubes, se enlaza otra vez
  useEffect(() => { if (datos && clubes.length && !Object.keys(mapa).length) setMapa(enlazarClubes(Array.from(new Set(datos.equipos.map((x) => x.nombre))), clubes)) }, [datos, clubes, mapa])

  const nombresEq = useMemo(() => (datos ? Array.from(new Set(datos.equipos.map((e) => e.nombre))) : []), [datos])
  const cot = useMemo(() => (datos ? cotejarTarjetas(datos, mapa, jugadores, manual) : []), [datos, mapa, jugadores, manual])
  const grupos = useMemo(() => {
    const m = new Map<string, { k: string; equipo: string; jugador: string; a: number; r: number; fechas: Set<number>; estado: string; playerId: string | null }>()
    cot.forEach((t, i) => {
      const k = `${t.equipo}|${t.jugadorRaw}`
      const g = m.get(k) || { k, equipo: t.equipo, jugador: t.jugadorRaw, a: 0, r: 0, fechas: new Set<number>(), estado: t.estado, playerId: t.playerId }
      t.tipo === 'amarilla' ? g.a++ : g.r++
      g.fechas.add(datos?.tarjetas[i].fecha ?? 0)
      m.set(k, g)
    })
    return Array.from(m.values()).sort((a, b) => a.equipo.localeCompare(b.equipo) || (numeroDe(a.jugador) ?? 999) - (numeroDe(b.jugador) ?? 999))
  }, [cot, datos])
  const sin = grupos.filter((g) => g.estado === 'sin')
  const vis = grupos.filter((g) => (filtro === 'todas' ? true : filtro === 'sin' ? g.estado === 'sin' : g.estado !== 'sin'))
  const clubesDe = (teamId: string | undefined) => jugadores.filter((j) => j.teamId === teamId).sort((a, b) => (a.numero ?? 999) - (b.numero ?? 999))
  const faltanClubes = nombresEq.filter((n) => !mapa[n])

  async function llamar(accion: 'vista' | 'aplicar') {
    setOcupado(true)
    const r = await fetch('/api/admin/importar-torneo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion, datos, nombre, mapaClubes: mapa, manual, confirmacion: conf }) }).then((x) => x.json()).catch(() => ({ ok: false, message: 'Error de conexión' }))
    setOcupado(false)
    if (!r.ok) { alert(r.message || 'No se pudo completar'); return null }
    return r
  }
  async function revisar() { const r = await llamar('vista'); if (r) { setResumen(r.resumen); setMsg('') } }
  async function aplicar() {
    if (!window.confirm(`Se creará el torneo «${nombre}» como NUEVO, sin tocar tus torneos anteriores. ¿Continuar?`)) return
    const r = await llamar('aplicar')
    if (r) { setHecho(r); cargar() }
  }
  async function deshacer() {
    if (!previa || !window.confirm(`¿Deshacer la importación? Se borra SOLO el torneo «${previa.nombre}» creado por ella, con sus partidos, tarjetas y pagos. Tus otros torneos no se tocan.`)) return
    const r = await fetch('/api/admin/importar-torneo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'deshacer', torneoId: previa.id }) }).then((x) => x.json()).catch(() => null)
    if (!r?.ok) { alert(r?.message || 'No se pudo deshacer'); return }
    setMsg('Importación deshecha.'); setHecho(null); cargar()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/admin/torneo" className="text-slate-400 text-sm hover:text-white">← Torneo</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">📥 Importar torneo desde la herramienta de GitHub Pages</h1>
        <p className="text-slate-400 mb-5">Crea un torneo <b>nuevo</b> con los grupos, fixture, horarios, resultados, tarjetas y pagos de la herramienta. <b>No modifica ningún torneo ni dato anterior.</b> Primero ves todo en vista previa, y no se guarda nada hasta que confirmes.</p>
        {msg && <div className="bg-slate-700 border border-slate-500 rounded-lg p-3 mb-4 text-sm" onClick={() => setMsg('')}>{msg}</div>}

        {previa && (
          <div className="border border-yellow-500 bg-yellow-900/20 rounded-xl p-4 mb-5 text-sm">
            <p><b>Ya hay una importación hecha:</b> torneo «{previa.nombre}». Para evitar duplicados no se puede importar otra vez.</p>
            <button className={btn2 + ' mt-2'} onClick={deshacer}>↩ Deshacer esa importación</button>
          </div>
        )}

        <section className={sec}>
          <h2 className="font-bold mb-2">1. Archivo de la herramienta</h2>
          <p className="text-slate-400 text-sm mb-3">En la herramienta pulsa «📦 Descargar todos los datos» y sube aquí el <code>datos.json</code> del ZIP.</p>
          <input type="file" accept=".json,application/json" onChange={(e) => leerArchivo(e.target.files?.[0])} />
          {datos && <p className="text-sm mt-2 text-green-300">✔ {datos.equipos.length} equipos · {datos.partidos.length} partidos · {datos.tarjetas.length} tarjetas · {datos.pagos.length} pagos</p>}
        </section>

        {datos && (<>
          <section className={sec}>
            <h2 className="font-bold mb-2">2. Grupos y clubes</h2>
            <p className="text-slate-400 text-sm mb-3">Cada equipo se enlaza con el club ya registrado en el panel. Los que no se encuentran solos, los eliges tú. {faltanClubes.length ? <b className="text-red-300">Faltan {faltanClubes.length} por enlazar.</b> : <b className="text-green-300">Todos enlazados.</b>}</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {datos.torneo.grupos.map((g) => (
                <div key={g.id}><p className="font-semibold mb-1">{g.nombre}</p>
                  {g.equipos.map((e) => (
                    <div key={e} className="flex items-center justify-between gap-2 py-1 text-sm border-t border-slate-700">
                      <span>{e}</span>
                      {mapa[e] ? <span className="text-green-300 text-xs">✔ {clubes.find((c) => c.id === mapa[e])?.name}</span>
                        : <select className={inp + ' !py-1 max-w-[9rem]'} value="" onChange={(ev) => ev.target.value && setMapa({ ...mapa, [e]: ev.target.value })}><option value="">elegir club…</option>{clubes.filter((c) => !Object.values(mapa).includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className={sec}>
            <h2 className="font-bold mb-2">3. Tarjetas: cotejo por número de camiseta</h2>
            <p className="text-slate-400 text-sm mb-3">Las tarjetas de la herramienta traen solo el número. Se enlazan con el jugador que tiene ese número en el club. Si no coincide, eliges tú al jugador correcto, o lo ignoras (por ejemplo, el cuerpo técnico).</p>
            <div className="flex gap-2 flex-wrap mb-3">
              {([['sin', `Sin coincidencia (${sin.length})`], ['ok', `Cotejadas (${grupos.length - sin.length})`], ['todas', `Todas (${grupos.length})`]] as const).map(([k, t]) => <button key={k} className={`px-3 py-1.5 rounded-lg text-sm ${filtro === k ? 'bg-yellow-500 text-black font-semibold' : 'bg-slate-700'}`} onClick={() => setFiltro(k)}>{t}</button>)}
            </div>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-left text-slate-400"><tr><th className="py-2">Club</th><th>N.º</th><th>Tarjetas</th><th>Fechas</th><th>Jugador en el panel</th></tr></thead>
              <tbody>{vis.slice(0, 250).map((g) => {
                const teamId = mapa[g.equipo]
                return (
                  <tr key={g.k} className="border-t border-slate-700">
                    <td className="py-2">{g.equipo}</td><td><b>{g.jugador}</b></td>
                    <td>{g.a > 0 && <span className="text-yellow-300">{g.a}🟨 </span>}{g.r > 0 && <span className="text-red-400">{g.r}🟥</span>}</td>
                    <td className="text-slate-400">{Array.from(g.fechas).sort().join(', ')}</td>
                    <td>{g.estado === 'sin' || g.estado === 'manual' || g.estado === 'ignorada' || g.estado === 'cuerpo' ? (
                      !teamId ? <span className="text-red-300 text-xs">enlaza primero el club</span> :
                      <select className={inp + ' !py-1 max-w-[16rem]'} value={manual[g.k] === 'ignorar' ? '__ign' : manual[g.k] === 'cuerpo' ? '__cuerpo' : (manual[g.k] as string) || ''} onChange={(ev) => { const v = ev.target.value; const m = { ...manual }; if (!v) delete m[g.k]; else m[g.k] = v === '__ign' ? 'ignorar' : v === '__cuerpo' ? 'cuerpo' : v; setManual(m) }}>
                        <option value="">⚠ elegir jugador…</option>
                        {clubesDe(teamId).map((j) => <option key={j.id} value={j.id}>N.º {j.numero ?? 's/n'} · {j.nombre}</option>)}
                        <option value="__cuerpo">Cuerpo técnico (cobrar multa al club)</option>
                        <option value="__ign">Ignorar (no se importa)</option>
                      </select>
                    ) : <span className="text-green-300">✔ {jugadores.find((j) => j.id === g.playerId)?.nombre}</span>}</td>
                  </tr>)
              })}</tbody>
            </table></div>
            {vis.length > 250 && <p className="text-slate-400 text-xs mt-2">Se muestran 250 de {vis.length}.</p>}
          </section>

          <section className={sec}>
            <h2 className="font-bold mb-2">4. Vista previa y confirmación</h2>
            <label className="block text-sm mb-3">Nombre del torneo nuevo<input className={inp + ' w-full mt-1 max-w-sm'} value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
            <button className={btn2} disabled={ocupado} onClick={revisar}>Revisar con el servidor (no guarda nada)</button>
            {resumen && (
              <div className="mt-4 text-sm space-y-1">
                <p>Clubes enlazados: <b>{resumen.clubesEnlazados}</b> · Partidos: <b>{resumen.partidos}</b> ({resumen.jugados} con resultado) · Pagos: <b>{resumen.pagos}</b></p>
                <p>Tarjetas: <b>{resumen.tarjetas}</b> · cotejadas solas {resumen.auto} · a mano {resumen.manual} · ignoradas {resumen.ignoradas} · cuerpo técnico {resumen.cuerpo} · <b className={resumen.sinCotejo ? 'text-red-300' : 'text-green-300'}>sin cotejar {resumen.sinCotejo}</b></p>
                <p>Se crearán <b>{resumen.eventos}</b> eventos de tarjeta, de los cuales <b>{resumen.dobles}</b> son dobles amarillas (2 amarillas en un partido).</p>
                <p className="text-slate-400">El torneo se crea <b>oculto al público</b>: lo muestras después con la casilla «Mostrar este torneo en la página pública».</p>
                {(resumen.clubesSinEnlazar.length > 0 || resumen.sinCotejo > 0) && <p className="text-red-300">⚠ Aún no se puede importar: completa los clubes y las tarjetas pendientes.</p>}
              </div>
            )}
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <input className={inp} placeholder="Escribe IMPORTAR" value={conf} onChange={(e) => setConf(e.target.value)} />
              <button className={btn} disabled={ocupado || !!previa || !resumen || conf !== 'IMPORTAR' || resumen.sinCotejo > 0 || resumen.clubesSinEnlazar.length > 0} onClick={aplicar}>Aplicar importación</button>
            </div>
            {hecho && <div className="mt-4 border border-green-500 bg-green-900/20 rounded-lg p-3 text-sm">✔ Listo. Torneo creado con {hecho.partidos} partidos, {hecho.eventos} eventos de tarjeta y {hecho.pagos} pagos. <Link className="underline text-yellow-300" href="/admin/torneo">Ir al torneo →</Link></div>}
          </section>
        </>)}
      </div>
    </div>
  )
}
