import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirAdmin } from '@/lib/sorteo'
import { verifyAuth } from '@/lib/auth'
import { calcularFinanzas } from '@/lib/finanzas-data'

export const dynamic = 'force-dynamic'

// Exonera la garantía ($45 por defecto) a los clubes que NO la pagaron (pagado de garantía = $0): les registra un cargo de
// garantía de $0 con el detalle «NO PAGA GARANTIA · Valor a devolución 0». No inventa pagos. Solo administrador.
//   ?simular=1 → muestra a qué clubes · (sin parámetros) → aplica (no repite) · ?deshacer=1 → quita esas exoneraciones
const DETALLE = 'NO PAGA GARANTIA · Valor a devolución 0'
const CLAVE = 'respaldo:exonerar-garantia'
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
const usd = (n: number) => `$${n.toFixed(2)}`
const pagina = (t: string, cuerpo: string) => new NextResponse(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t)}</title><body style="font-family:system-ui;max-width:780px;margin:24px auto;padding:0 14px;line-height:1.45;background:#0f172a;color:#e2e8f0"><h1 style="font-size:22px">${esc(t)}</h1>${cuerpo}</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })

export async function GET(req: NextRequest) {
  const no = await exigirAdmin()
  if (no) return no
  const u = await verifyAuth()
  const q = req.nextUrl.searchParams
  // El mismo torneo que muestra Finanzas
  const torneo = await prisma.torneo.findFirst({ orderBy: [{ activo: 'desc' }, { createdAt: 'desc' }] })
  if (!torneo) return pagina('Exonerar garantía', '<p>No hay torneo.</p>')

  if (q.get('deshacer')) {
    const a = await prisma.ajuste.findUnique({ where: { key: CLAVE } })
    if (!a) return pagina('Nada que deshacer', '<p>No hay exoneraciones hechas con este enlace.</p>')
    const r = JSON.parse(a.value) as { creados: string[]; anulados: string[] }
    await prisma.$transaction([
      prisma.cargo.deleteMany({ where: { id: { in: r.creados } } }),
      prisma.cargo.updateMany({ where: { id: { in: r.anulados } }, data: { anulado: false } }),
      prisma.ajuste.delete({ where: { key: CLAVE } }),
    ])
    return pagina('Exoneraciones deshechas', `<p>Se quitaron <b>${r.creados.length}</b> exoneración(es). Esos clubes vuelven a deber la garantía.</p>`)
  }

  const f = await calcularFinanzas(torneo.id)
  const cargos = await prisma.cargo.findMany({ where: { torneoId: torneo.id, concepto: 'garantia', anulado: false } })
  const aplicar: { teamId: string; club: string; previos: { id: string; monto: number }[] }[] = []
  const pagaron: string[] = [], parcial: string[] = [], ya: string[] = []
  for (const x of f.filas) {
    const g = x.porConcepto.garantia
    const suyos = cargos.filter((c) => c.teamId === x.teamId)
    if (suyos.some((c) => c.monto === 0 && c.detalle === DETALLE)) { ya.push(x.club); continue }
    if (g.pagado >= g.cargado && g.pagado > 0) { pagaron.push(`${x.club} (${usd(g.pagado)})`); continue }
    if (g.pagado > 0) { parcial.push(`${x.club} (pagó ${usd(g.pagado)} de ${usd(g.cargado)})`); continue }
    aplicar.push({ teamId: x.teamId, club: x.club, previos: suyos.map((c) => ({ id: c.id, monto: c.monto })) })
  }

  const simular = !!q.get('simular')
  if (!simular && aplicar.length) {
    const previo = await prisma.ajuste.findUnique({ where: { key: CLAVE } })
    const r = previo ? (JSON.parse(previo.value) as { creados: string[]; anulados: string[] }) : { creados: [], anulados: [] }
    await prisma.$transaction(async (tx) => {
      for (const a of aplicar) {
        // Si el club tenía un cargo de garantía propio (no el de por defecto), se anula para que mande la exoneración
        if (a.previos.length) { await tx.cargo.updateMany({ where: { id: { in: a.previos.map((p) => p.id) } }, data: { anulado: true } }); r.anulados.push(...a.previos.map((p) => p.id)) }
        const c = await tx.cargo.create({ data: { torneoId: torneo.id, teamId: a.teamId, concepto: 'garantia', monto: 0, detalle: DETALLE, usuario: u?.email || '' } })
        r.creados.push(c.id)
      }
      await tx.ajuste.upsert({ where: { key: CLAVE }, create: { key: CLAVE, value: JSON.stringify(r) }, update: { value: JSON.stringify(r) } })
    })
  }
  const li = (xs: string[]) => (xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p style="color:#94a3b8">Ninguno.</p>')
  return pagina(simular ? 'Simulación: exonerar garantía (no se guardó nada)' : 'Garantía exonerada',
    `<p>${simular ? 'Se exoneraría' : 'Se exoneró'} la garantía a <b>${aplicar.length}</b> club(es) que no la pagaron: su garantía queda en <b>$0</b> con el detalle «${esc(DETALLE)}». No se registra ningún pago.</p>
     ${li(aplicar.map((a) => a.club + (a.previos.length ? ` (tenía un cargo de garantía de ${a.previos.map((p) => usd(p.monto)).join(' + ')}: se anula)` : '')))}
     <h2 style="font-size:17px">No se tocan</h2>
     <p><b>Pagaron la garantía</b> (se les devuelve al final):</p>${li(pagaron)}
     <p><b>Pagaron una parte</b> (revísalos a mano en Finanzas):</p>${li(parcial)}
     ${ya.length ? `<p><b>Ya estaban exonerados:</b></p>${li(ya)}` : ''}
     <p style="color:#94a3b8;font-size:13px">Repetirlo no duplica nada.${simular ? ' Para aplicarlo, abre este mismo enlace sin <code>?simular=1</code>.' : ' Para volver atrás: <code>?deshacer=1</code>. También puedes anular la exoneración de un club en Finanzas (vuelve a deber $45).'}</p>`)
}
