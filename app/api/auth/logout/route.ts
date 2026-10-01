import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const response = NextResponse.json({
    ok: true,
    message: 'Logout exitoso'
  })

  response.cookies.delete('auth-token')
  return response
}
