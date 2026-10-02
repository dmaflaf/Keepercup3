import sharp from 'sharp'

export type TipoFoto = 'selfie' | 'cedula_front' | 'cedula_back'
export const TIPOS_FOTO: TipoFoto[] = ['selfie', 'cedula_front', 'cedula_back']

export function driveId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/\/d\/([A-Za-z0-9_-]{10,})/) || url.match(/[?&]id=([A-Za-z0-9_-]{10,})/)
  return m ? m[1] : null
}

export function clasificarRespuestaHtml(texto: string): string {
  const t = texto.toLowerCase()
  if (t.includes('too many users') || t.includes('quota') || t.includes('unusual traffic') || t.includes('demasiados usuarios')) {
    return 'Google limitó las descargas por ahora (reintenta más tarde)'
  }
  if (t.includes('accounts.google.com') || t.includes('servicelogin') || t.includes('sign in') || t.includes('iniciar sesi') || t.includes('request access') || t.includes('solicitar acceso') || t.includes('necesitas acceso')) {
    return 'Archivo privado: Drive pide iniciar sesión o solicitar acceso'
  }
  if (t.includes('virus')) return 'Archivo demasiado grande para descarga directa'
  return 'Drive devolvió una página en lugar de la imagen'
}

const BASE = () => process.env.DRIVE_DOWNLOAD_BASE || 'https://drive.google.com/uc?export=download&id='
const MAX_DESCARGA = 15 * 1024 * 1024

async function descargar(id: string): Promise<Buffer> {
  let ultimo = 'sin respuesta'
  for (let intento = 0; intento < 3; intento++) {
    try {
      const res = await fetch(BASE() + id, { redirect: 'follow' })
      if (!res.ok) {
        ultimo = `Drive respondió ${res.status}`
      } else {
        const tipo = res.headers.get('content-type') || ''
        if (!tipo.startsWith('image/')) {
          const html = (await res.text()).slice(0, 200000)
          throw new Error(`NOIMG:${clasificarRespuestaHtml(html)}`)
        }
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length > MAX_DESCARGA) throw new Error('Imagen demasiado grande')
        return buf
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('NOIMG:')) {
        const motivo = e.message.slice(6)
        if (motivo.startsWith('Google limitó') && intento < 2) {
          ultimo = motivo
          await new Promise((r) => setTimeout(r, 3000 * (intento + 1)))
          continue
        }
        throw new Error(motivo)
      }
      if (e instanceof Error && e.message === 'Imagen demasiado grande') throw e
      ultimo = e instanceof Error ? e.message : 'error de red'
    }
    await new Promise((r) => setTimeout(r, 800 * (intento + 1)))
  }
  throw new Error(ultimo)
}

export async function obtenerImagenReducida(id: string, tipo: TipoFoto) {
  const original = await descargar(id)
  const lado = tipo === 'selfie' ? 800 : 1200
  const data = await sharp(original)
    .rotate()
    .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: tipo === 'selfie' ? 80 : 76 })
    .toBuffer()
  return { data, mime: 'image/jpeg' }
}
