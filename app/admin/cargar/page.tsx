'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'

interface JugadorClub { id: string; nombre: string; cedula: string | null; numero: number | null; selfie: boolean; frente: boolean; reverso: boolean }
interface Incidencia { hoja: string; fila: number; nivel: 'error' | 'aviso'; mensaje: string; detalle?: string }
type Tipo = 'selfie' | 'cedula_front' | 'cedula_back'
interface Foto { archivo: File; cedula: string; tipo: Tipo }

const sinAcentos = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const CEDULA_EJEMPLO = '1003399134'
const RE_FOTO = /(?:^|[\s_\-.])(\d{9,10})(?:[\s_\-]*(?:ci[\s_\-]*)?(frente|front|anverso|reverso|atras|posterior|back))?\s*\.(?:jpe?g|png|webp|heic|heif|gif)$/i

function clasificar(nombre: string): { cedula: string; tipo: Tipo } | null {
  const m = nombre.match(RE_FOTO)
  if (!m) return null
  const cedula = m[1].padStart(10, '0')
  const marca = sinAcentos(m[2])
  const tipo: Tipo = !marca ? 'selfie' : /^(frente|front|anverso)$/.test(marca) ? 'cedula_front' : 'cedula_back'
  return { cedula, tipo }
}

function fechaTexto(v: unknown): string {
  if (v instanceof Date) {
    const d = new Date(v.getTime() + 12 * 3600 * 1000)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }
  return String(v ?? '').trim()
}

async function reducir(archivo: File, tipo: Tipo): Promise<Blob> {
  const lado = tipo === 'selfie' ? 800 : 1200
  const bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  const k = Math.min(1, lado / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('No se pudo reducir'))), 'image/jpeg', 0.85))
}

export default function CargarClub() {
  const [equipos, setEquipos] = useState<string[]>([])
  const [club, setClub] = useState('')
  const [nuevo, setNuevo] = useState({ activo: false, nombre: '', ciudad: '' })
  const [jugadores, setJugadores] = useState<JugadorClub[]>([])
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)

  // nómina
  const [filas, setFilas] = useState<Record<string, string>[] | null>(null)
  const [archivoNomina, setArchivoNomina] = useState('')
  const [resumen, setResumen] = useState<{ jugadoresValidos: number; errores: number; avisos: number } | null>(null)
  const [incid, setIncid] = useState<Incidencia[]>([])
  const [importado, setImportado] = useState(false)

  // fotos
  const [fotos, setFotos] = useState<Foto[]>([])
  const [sinNombre, setSinNombre] = useState<string[]>([])
  const [progreso, setProgreso] = useState<{ hechas: number; total: number; fallos: string[] } | null>(null)

  const nombreClub = nuevo.activo ? nuevo.nombre.trim() : club

  const cargarClub = useCallback(async (nombre: string) => {
    if (!nombre) { setJugadores([]); return }
    const r = await fetch('/api/admin/cargar/club?equipo=' + encodeURIComponent(nombre)).then((x) => x.json()).catch(() => null)
    if (r?.ok) setJugadores(r.jugadores || [])
  }, [])

  useEffect(() => {
    fetch('/api/admin/cargar/club').then((r) => r.json()).then((r) => { if (r.ok) setEquipos(r.equipos); else setMsg(r.message || 'No autorizado') }).catch(() => setMsg('Error de conexión'))
  }, [])
  useEffect(() => { if (!nuevo.activo) cargarClub(club) }, [club, nuevo.activo, cargarClub])

  const llamar = async (confirmar: boolean, f = filas) => {
    const equiposFila = nuevo.activo ? [{ Equipo: nombreClub, Ciudad: nuevo.ciudad }] : []
    const jugadoresFila = (f || []).map((x) => ({ ...x, Equipo: nombreClub }))
    const r = await fetch('/api/admin/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ equipos: equiposFila, jugadores: jugadoresFila, confirmar }) })
    return r.json()
  }

  async function alElegirNomina(e: React.ChangeEvent<HTMLInputElement>) {
    const arch = e.target.files?.[0]
    if (!arch) return
    setMsg(''); setResumen(null); setImportado(false)
    if (!nombreClub) { setMsg('Primero elige el club (o escribe el nombre del club nuevo).'); return }
    try {
      const wb = XLSX.read(await arch.arrayBuffer(), { type: 'array', cellDates: true })
      const tieneCedula = (m: unknown[][]) => m.slice(0, 10).findIndex((f) => f.some((c) => sinAcentos(c).includes('cedula')))
      const hojas = wb.SheetNames.map((n) => ({ n, m: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: '', raw: true }) }))
      const elegida = hojas.find((h) => sinAcentos(h.n).includes('nomina') && !sinAcentos(h.n).includes('instruc') && tieneCedula(h.m) > -1) || hojas.find((h) => tieneCedula(h.m) > -1)
      if (!elegida) { setMsg('No encontré una hoja con la columna "Cédula". Usa la plantilla de nómina.'); return }
      const iEnc = tieneCedula(elegida.m)
      const enc = elegida.m[iEnc].map(sinAcentos)
      const col = (claves: string[], resp: number) => { const i = enc.findIndex((h) => claves.some((c) => h.includes(c))); return i > -1 ? i : resp }
      const cN = col(['nombre'], 0), cA = col(['apellido'], 1), cC = col(['cedula'], 2), cF = col(['nacimiento', 'fecha'], 3), cP = col(['posicion'], 4), cE = col(['correo', 'email', 'mail'], 5), cT = col(['telefono', 'celular'], 6)
      const cNum = col(['camiseta', 'dorsal', 'numero'], -1)
      const lista: Record<string, string>[] = []
      for (const f of elegida.m.slice(iEnc + 1)) {
        const nombres = String(f[cN] ?? '').trim()
        const apellidos = String(f[cA] ?? '').trim()
        const cedula = String(f[cC] ?? '').replace(/\D/g, '')
        if (!nombres && !apellidos && !cedula) continue
        if (cedula.padStart(10, '0') === CEDULA_EJEMPLO && /^juan carlos$/i.test(nombres)) continue // fila de ejemplo de la plantilla
        lista.push({
          Nombres: nombres, Apellidos: apellidos, 'Cédula': cedula, 'Fecha nacimiento': fechaTexto(f[cF]),
          'Posición': String(f[cP] ?? '').trim(), Correo: String(f[cE] ?? '').trim(), 'Teléfono': String(f[cT] ?? '').replace(/\s/g, ''),
          ...(cNum > -1 && { 'Número': String(f[cNum] ?? '').trim() }),
        })
      }
      if (!lista.length) { setMsg('La nómina no tiene jugadores.'); return }
      setFilas(lista); setArchivoNomina(arch.name)
      setOcupado(true)
      const r = await llamar(false, lista)
      if (!r.ok) { setMsg(r.message || 'No se pudo revisar la nómina'); return }
      setResumen(r.resumen); setIncid(r.incidencias)
    } catch {
      setMsg('No pude leer el archivo. Debe ser un Excel (.xlsx).')
    } finally { setOcupado(false) }
  }

  async function confirmarNomina() {
    setOcupado(true); setMsg('')
    const r = await llamar(true)
    setOcupado(false)
    if (!r.ok) { setMsg(r.message || 'Error al importar'); return }
    const x = r.resultado
    setMsg(`Listo: ${x.jugadoresCreados} jugadores nuevos, ${x.jugadoresActualizados} actualizados.` + (x.jugadoresFallidos?.length ? ` No se pudo guardar a ${x.jugadoresFallidos.length}.` : ''))
    setImportado(true)
    if (nuevo.activo) { setEquipos([...equipos, nombreClub].sort()); setClub(nombreClub); setNuevo({ activo: false, nombre: '', ciudad: '' }) }
    else cargarClub(nombreClub)
  }

  function alElegirFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const lista = Array.from(e.target.files || [])
    const porClave = new Map<string, Foto>()
    const raras: string[] = []
    for (const a of lista) {
      const c = clasificar(a.name)
      if (!c) { raras.push(a.name); continue }
      const k = `${c.cedula}|${c.tipo}`
      const previa = porClave.get(k)
      if (!previa || a.lastModified > previa.archivo.lastModified) porClave.set(k, { archivo: a, ...c })
    }
    setFotos(Array.from(porClave.values())); setSinNombre(raras); setProgreso(null)
  }

  const porCedula = useMemo(() => new Map(jugadores.filter((j) => j.cedula).map((j) => [j.cedula as string, j])), [jugadores])
  const aSubir = fotos.filter((f) => porCedula.has(f.cedula))
  const ajenas = fotos.filter((f) => !porCedula.has(f.cedula))
  const enCola = (j: JugadorClub, t: Tipo) => aSubir.some((f) => f.cedula === j.cedula && f.tipo === t)
  const marca = (ya: boolean, nueva: boolean) => (nueva ? <span className="text-yellow-300" title="Se subirá">⬆</span> : ya ? <span className="text-green-400">✔</span> : <span className="text-red-400">✖</span>)

  async function subirFotos() {
    setOcupado(true)
    const fallos: string[] = []
    let hechas = 0
    setProgreso({ hechas: 0, total: aSubir.length, fallos })
    let i = 0
    const trabajador = async () => {
      while (i < aSubir.length) {
        const f = aSubir[i++]
        try {
          const blob = await reducir(f.archivo, f.tipo)
          const fd = new FormData()
          fd.append('cedula', f.cedula); fd.append('kind', f.tipo); fd.append('equipo', nombreClub); fd.append('file', blob, 'foto.jpg')
          const r = await fetch('/api/admin/cargar/foto', { method: 'POST', body: fd }).then((x) => x.json())
          if (!r.ok) throw new Error(r.message)
        } catch (e) {
          fallos.push(`${f.archivo.name}: ${e instanceof Error ? e.message : 'error'}`)
        }
        hechas++
        setProgreso({ hechas, total: aSubir.length, fallos: [...fallos] })
      }
    }
    await Promise.all([trabajador(), trabajador(), trabajador()])
    setOcupado(false)
    setFotos([]); setSinNombre([])
    cargarClub(nombreClub)
  }

  const btn = 'px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold'
  const inp = 'px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white'
  const sec = 'bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/admin/dashboard" className="text-slate-400 text-sm hover:text-white">← Volver al panel</Link>
        <h1 className="text-3xl font-bold mt-3 mb-1">Cargar club desde mi computador</h1>
        <p className="text-slate-400 mb-6">Sube la nómina (Excel) y las fotos de un club, sin pasar por Drive. Las fotos se nombran con la cédula: <code>1003399134.jpg</code>, <code>1003399134 CI Frente.jpg</code>, <code>1003399134 CI Reverso.jpg</code>.</p>
        {msg && <div className="bg-slate-700 border border-slate-500 rounded-lg p-3 mb-4 text-sm" onClick={() => setMsg('')}>{msg}</div>}

        <section className={sec}>
          <h2 className="text-xl font-bold mb-3">1. Club</h2>
          <div className="flex flex-wrap gap-3 items-center">
            <select className={inp} disabled={nuevo.activo} value={club} onChange={(e) => { setClub(e.target.value); setFilas(null); setResumen(null); setFotos([]) }}>
              <option value="">— Elige el club —</option>{equipos.map((e) => <option key={e}>{e}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={nuevo.activo} onChange={(e) => setNuevo({ ...nuevo, activo: e.target.checked })} /> Es un club nuevo</label>
            {nuevo.activo && (<>
              <input className={inp} placeholder="Nombre del club" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
              <input className={inp} placeholder="Ciudad" value={nuevo.ciudad} onChange={(e) => setNuevo({ ...nuevo, ciudad: e.target.value })} />
            </>)}
          </div>
        </section>

        <section className={sec}>
          <h2 className="text-xl font-bold mb-3">2. Nómina (Excel)</h2>
          <label className="block border border-dashed border-slate-600 rounded-xl p-6 text-center cursor-pointer hover:border-red-500">
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={alElegirNomina} />
            {archivoNomina || 'Elegir el Excel de la nómina'}
          </label>
          {ocupado && <p className="text-slate-300 mt-3">Procesando…</p>}
          {resumen && !importado && (
            <div className="mt-4">
              <p>Jugadores válidos: <b>{resumen.jugadoresValidos}</b> · Errores: <b className="text-red-400">{resumen.errores}</b> · Avisos: <b className="text-yellow-300">{resumen.avisos}</b></p>
              <div className="max-h-56 overflow-auto text-sm mt-2 space-y-1">
                {incid.filter((i) => i.nivel === 'error').map((i, k) => <p key={k} className="text-red-300">Fila {i.fila}: {i.mensaje} {i.detalle && <span className="text-slate-400">({i.detalle})</span>}</p>)}
                {incid.filter((i) => i.nivel === 'aviso').slice(0, 30).map((i, k) => <p key={'a' + k} className="text-yellow-200/80">Fila {i.fila}: {i.mensaje} {i.detalle && <span className="text-slate-400">({i.detalle})</span>}</p>)}
              </div>
              <button className={btn + ' mt-3'} disabled={ocupado || resumen.jugadoresValidos === 0} onClick={confirmarNomina}>Guardar {resumen.jugadoresValidos} jugadores</button>
              <span className="text-slate-400 text-sm ml-3">Las filas con error no se guardan.</span>
            </div>
          )}
        </section>

        <section className={sec}>
          <h2 className="text-xl font-bold mb-3">3. Fotos</h2>
          {!jugadores.length ? <p className="text-slate-400 text-sm">Elige un club que ya tenga jugadores (o guarda primero su nómina).</p> : (<>
            <label className="block border border-dashed border-slate-600 rounded-xl p-6 text-center cursor-pointer hover:border-red-500">
              <input type="file" accept="image/*" multiple className="hidden" onChange={alElegirFotos} />
              Elegir las fotos (puedes seleccionar toda la carpeta con Ctrl+A)
            </label>
            {(sinNombre.length > 0 || ajenas.length > 0) && (
              <div className="mt-3 text-sm text-yellow-200/90 space-y-1">
                {sinNombre.length > 0 && <p>⚠ {sinNombre.length} archivo(s) no tienen la cédula en el nombre y se ignoran: {sinNombre.slice(0, 5).join(', ')}{sinNombre.length > 5 && '…'}</p>}
                {ajenas.length > 0 && <p>⚠ {ajenas.length} foto(s) son de cédulas que no están en este club y se ignoran.</p>}
              </div>
            )}
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-400"><tr><th className="py-2">Jugador</th><th>Cédula</th><th className="text-center">Selfie</th><th className="text-center">Ced. frente</th><th className="text-center">Ced. reverso</th></tr></thead>
                <tbody>{jugadores.map((j) => (
                  <tr key={j.id} className="border-t border-slate-700">
                    <td className="py-2">{j.nombre}</td><td className="text-slate-400">{j.cedula}</td>
                    <td className="text-center">{marca(j.selfie, enCola(j, 'selfie'))}</td>
                    <td className="text-center">{marca(j.frente, enCola(j, 'cedula_front'))}</td>
                    <td className="text-center">{marca(j.reverso, enCola(j, 'cedula_back'))}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
            <button className={btn + ' mt-4'} disabled={ocupado || !aSubir.length} onClick={subirFotos}>Subir {aSubir.length} foto(s)</button>
            {progreso && (
              <div className="mt-3 text-sm">
                <p>Subidas: {progreso.hechas} de {progreso.total}</p>
                {progreso.fallos.map((f, k) => <p key={k} className="text-red-300">✖ {f}</p>)}
              </div>
            )}
          </>)}
        </section>
      </div>
    </div>
  )
}
