import { NextResponse } from 'next/server'

// DESACTIVADO: inscripción antigua de equipos (creaba clubes y jugadores sin control). Las inscripciones van por los
// formularios y la sincronización, que respetan el cierre de inscripciones (/admin/inscripciones).
export async function POST() {
  return NextResponse.json({ ok: false, message: 'Las inscripciones están cerradas.' }, { status: 403 })
}
