import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NIX - Sistema de Torneos',
  description: 'Gestión profesional de torneos, carnets y resultados',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className="font-inter bg-gradient-to-br from-dark via-darker to-dark text-slate-100">
        {children}
      </body>
    </html>
  )
}
