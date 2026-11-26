import { NextResponse } from 'next/server'

// DESACTIVADO por seguridad: esta ruta permitía crear un administrador sin iniciar sesión.
// Los usuarios (administradores y vocales) se crean en el panel: /admin/usuarios (solo administrador).
export async function POST() {
  return NextResponse.json({ ok: false, message: 'No disponible' }, { status: 404 })
}
export const GET = POST
