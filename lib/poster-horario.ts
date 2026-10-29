// Imagen del horario de una fecha, con el diseño oficial de Keeper Cup 3 (dos estadios lado a lado, días y horas).
// Solo navegador (canvas). Usa la tipografía Barlow de Google Fonts; si no carga, usa la del sistema.
import { diaSemana, DIAS, MESES } from '@/lib/programacion'

export interface ItemPoster { fecha: string; hora: string; escenario: string; local: string; visitante: string; marca?: string }

async function cargarFuentes() {
  if (typeof document === 'undefined') return
  if (!document.getElementById('fuente-barlow')) {
    const l = document.createElement('link'); l.id = 'fuente-barlow'; l.rel = 'stylesheet'
    l.href = 'https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,500;0,600;0,700;1,800;1,900&display=swap'
    document.head.appendChild(l)
  }
  try { await Promise.race([Promise.all(['500 30px Barlow', '600 30px Barlow', '700 30px Barlow', 'italic 800 40px Barlow', 'italic 900 100px Barlow'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]) } catch { /* sin red: fuente del sistema */ }
}
const imagen = (src: string) => new Promise<HTMLImageElement | null>((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src })
const hh = (h: string) => h.replace(':', 'h')

export async function posterHorario(jornada: number, estadios: string[], items: ItemPoster[]): Promise<Blob | null> {
  await cargarFuentes()
  const F = (peso: string, px: number, it = false) => `${it ? 'italic ' : ''}${peso} ${px}px Barlow, 'Arial Narrow', system-ui, sans-serif`
  const cols = estadios.slice(0, 2).length ? estadios.slice(0, 2) : ['San Miguel']
  const dias = Array.from(new Set(items.map((i) => i.fecha))).sort()
  const horasDe = (d: string) => Array.from(new Set(items.filter((i) => i.fecha === d).map((i) => i.hora))).sort()
  const FILA = 50, CAB_DIA = 40
  const W = 1600, panelY = 228, cuerpoY = panelY + 110
  const altoCuerpo = dias.reduce((n, d) => n + CAB_DIA + horasDe(d).length * FILA + 16, 0)
  const H = Math.max(900, cuerpoY + altoCuerpo + 70)
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d'); if (!g) return null

  // Fondo: degradado azul con cuadrícula
  const bg = g.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H * 0.45, W * 0.75)
  bg.addColorStop(0, '#2b2fa8'); bg.addColorStop(0.55, '#1a1f86'); bg.addColorStop(1, '#0c1150')
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  g.strokeStyle = 'rgba(120,150,255,0.07)'; g.lineWidth = 1
  for (let x = 0; x < W; x += 56) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke() }
  for (let y = 0; y < H; y += 56) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke() }

  // Títulos
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'
  g.fillStyle = '#2fd3f7'; g.font = F('800', 44, true); g.fillText('KEEPER CUP 3', W / 2, 84)
  g.save(); g.shadowColor = 'rgba(110,190,255,0.9)'; g.shadowBlur = 28
  g.fillStyle = '#ffffff'; g.font = F('900', 112, true); g.fillText(`HORARIOS FECHA ${jornada}`, W / 2, 182); g.restore()

  // Panel con borde luminoso
  const px = 75, pw = W - 150, ph = H - panelY - 40, r = 38
  const rr = () => { g.beginPath(); g.moveTo(px + r, panelY); g.arcTo(px + pw, panelY, px + pw, panelY + ph, r); g.arcTo(px + pw, panelY + ph, px, panelY + ph, r); g.arcTo(px, panelY + ph, px, panelY, r); g.arcTo(px, panelY, px + pw, panelY, r); g.closePath() }
  rr(); g.fillStyle = 'rgba(14,24,92,0.55)'; g.fill()
  g.save(); g.shadowColor = '#3fd2ff'; g.shadowBlur = 24; g.strokeStyle = '#43d4ff'; g.lineWidth = 5; rr(); g.stroke(); g.restore()

  // Marca de agua: logo
  const logo = await imagen('/logo-kc3.png')
  if (logo) { g.save(); g.globalAlpha = 0.07; const lw = 520, lh = (logo.height / logo.width) * lw; g.drawImage(logo, W / 2 - lw / 2, panelY + ph / 2 - lh / 2, lw, lh); g.restore() }

  // Línea vertical entre estadios
  const mid = W / 2
  g.strokeStyle = 'rgba(120,170,255,0.35)'; g.lineWidth = 2
  if (cols.length > 1) { g.beginPath(); g.moveTo(mid, panelY + 40); g.lineTo(mid, panelY + ph - 20); g.stroke() }

  // Columnas: x de hora, fecha, borde derecho del local, «vs» y visitante
  const colX = (i: number) => { const o = i === 0 ? 0 : mid - 75 + 2; return { hora: 115 + o, fecha: 275 + o, local: 495 + o, vs: 522 + o, visita: 548 + o } }
  const naranja = '#f7a35c'
  cols.forEach((e, i) => { const x = colX(i); g.textAlign = 'left'; g.fillStyle = naranja; g.font = F('700', 34); g.fillText(`ESTADIO ${e.toUpperCase()}`, x.fecha, panelY + 85) })

  let y = cuerpoY
  dias.forEach((d, k) => {
    const dt = new Date(d + 'T00:00:00Z')
    if (k > 0) { g.strokeStyle = 'rgba(120,170,255,0.18)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(100, y - 12); g.lineTo(W - 100, y - 12); g.stroke() }
    y += 34
    cols.forEach((_, i) => { const x = colX(i); g.textAlign = 'left'; g.fillStyle = naranja; g.font = F('600', 31); g.fillText(DIAS[diaSemana(d)], x.hora, y); g.fillText(`${dt.getUTCDate()} de ${MESES[dt.getUTCMonth()]}`, x.fecha, y) })
    y += CAB_DIA - 34
    for (const h of horasDe(d)) {
      y += FILA
      cols.forEach((e, i) => {
        const x = colX(i)
        const it = items.find((m) => m.fecha === d && m.hora === h && m.escenario === e)
        if (!it) { g.textAlign = 'center'; g.fillStyle = 'rgba(200,210,240,0.45)'; g.font = F('500', 30); g.fillText('-', x.vs - 85, y - 6); return }
        g.textAlign = 'left'; g.fillStyle = '#ffffff'; g.font = F('700', 31); g.fillText(hh(h), x.hora, y - 6)
        g.font = F('500', 31); g.textAlign = 'right'; g.fillText(it.local, x.local, y - 6)
        g.textAlign = 'center'; g.fillStyle = '#2fd3f7'; g.font = F('800', 20, true); g.fillText('vs', x.vs, y - 8)
        g.textAlign = 'left'; g.fillStyle = '#ffffff'; g.font = F('500', 31); g.fillText(it.visitante, x.visita, y - 6)
        if (it.marca) { g.fillStyle = naranja; g.font = F('700', 15); g.textAlign = 'right'; g.fillText(it.marca.toUpperCase(), x.local, y - 38) }
      })
    }
    y += 16
  })
  return new Promise((ok) => c.toBlob((b) => ok(b), 'image/png'))
}
