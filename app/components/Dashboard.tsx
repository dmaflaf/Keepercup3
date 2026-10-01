'use client'

import Link from 'next/link'

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-dark via-darker to-dark text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-darker/80 border-b border-slate-700/50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-3xl font-bold text-primary">⚽</div>
            <div>
              <h1 className="text-2xl font-bold text-white">Keeper Cup 3</h1>
              <p className="text-xs text-slate-400">Pre-Temporada</p>
            </div>
          </div>
          <Link
            href="/registro"
            className="btn-primary px-6 py-2 text-sm font-semibold"
          >
            Inscribir Equipo
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-6 text-center">
        <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">
          La Pretemporada se juega acá
        </h2>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
          Torneo draft de pre-temporada interclubes. Prepara tu club y llévalo al siguiente nivel. No te quedes fuera.
        </p>
        <Link
          href="/registro"
          className="inline-block btn-primary px-8 py-4 text-lg font-semibold"
        >
          Inscribir Mi Equipo →
        </Link>
      </section>

      {/* Features Grid */}
      <section className="py-16 px-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Torneos */}
          <Link href="#" className="card group hover:border-primary/50 transition">
            <div className="text-4xl mb-4">🏆</div>
            <h3 className="text-xl font-bold text-white mb-2">Torneos</h3>
            <p className="text-slate-400">
              Accede a información completa sobre los torneos, fechas y regulaciones
            </p>
          </Link>

          {/* Reglamento */}
          <Link href="#" className="card group hover:border-primary/50 transition">
            <div className="text-4xl mb-4">📋</div>
            <h3 className="text-xl font-bold text-white mb-2">Reglamento</h3>
            <p className="text-slate-400">
              Conoce todas las normas y regulaciones de la competición
            </p>
          </Link>

          {/* Galería */}
          <Link href="#" className="card group hover:border-primary/50 transition">
            <div className="text-4xl mb-4">🎨</div>
            <h3 className="text-xl font-bold text-white mb-2">Galería</h3>
            <p className="text-slate-400">
              Revisa fotos y momentos de los torneos anteriores
            </p>
          </Link>

          {/* Soy Jugador */}
          <Link href="#" className="card group hover:border-primary/50 transition">
            <div className="text-4xl mb-4">⚽</div>
            <h3 className="text-xl font-bold text-white mb-2">Soy Jugador</h3>
            <p className="text-slate-400">
              Inscríbete como jugador individual para los torneos
            </p>
          </Link>

          {/* Carnets */}
          <Link href="/carnets" className="card group hover:border-primary/50 transition">
            <div className="text-4xl mb-4">🎴</div>
            <h3 className="text-xl font-bold text-white mb-2">Generar Carnets</h3>
            <p className="text-slate-400">
              Crea credenciales profesionales para tus jugadores
            </p>
          </Link>

          {/* Fixture */}
          <Link href="#" className="card group hover:border-primary/50 transition">
            <div className="text-4xl mb-4">📅</div>
            <h3 className="text-xl font-bold text-white mb-2">Fixture</h3>
            <p className="text-slate-400">
              Consulta el calendario de partidos y resultados en vivo
            </p>
          </Link>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 px-6 bg-darker/50 border-y border-slate-700/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Números que hablan
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-5xl font-bold text-primary mb-2">32</div>
              <p className="text-slate-400">Equipos registrados</p>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-primary mb-2">345</div>
              <p className="text-slate-400">Jugadores inscritos</p>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-primary mb-2">7</div>
              <p className="text-slate-400">Fechas de competición</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-slate-700/50 text-center text-slate-500 text-sm">
        <p>© 2026 Keeper Cup. Todos los derechos reservados.</p>
      </footer>
    </div>
  )
}
