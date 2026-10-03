// Envío de correos opcional con Resend (https://resend.com). Si no hay RESEND_API_KEY, no hace nada.
export async function enviarCorreo(para: string, asunto: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.SORTEO_FROM || 'Keeper Cup <onboarding@resend.dev>', to: [para], subject: asunto, html }),
    })
    return res.ok
  } catch {
    return false
  }
}
