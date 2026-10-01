# 🛠️ Guía de Desarrollo - Keeper Cup 3

## Setup Local

### Requisitos
- Node.js 18+
- Git
- PostgreSQL 14+ (local o Railway)

### Instalación
```bash
# Clonar repo
git clone https://github.com/dmaflaf/appskc3.git
cd appskc3

# Checkout rama correcta
git checkout claude/quirky-ramanujan-lcfqj5

# Instalar dependencias
npm install

# Copiar .env
cp .env.example .env.local

# Editar DATABASE_URL si necesitas local
nano .env.local

# Generar cliente Prisma
npx prisma generate

# Hacer migraciones
npx prisma migrate dev

# Iniciar servidor
npm run dev
```

## Estructura de Archivos

```
appskc3/
├── app/
│   ├── admin/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── dashboard/
│   │       └── page.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts
│   │   │   ├── logout/route.ts
│   │   │   └── create-admin/route.ts
│   │   └── setup/
│   │       └── init-admin/route.ts
│   ├── components/
│   │   ├── AdminLogin.tsx
│   │   ├── Dashboard.tsx
│   │   ├── TeamRegistration.tsx
│   │   └── CredentialGenerator.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   └── auth.ts
├── middleware.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEVELOPMENT.md
│   ├── DEPLOYMENT.md
│   └── API.md
├── .env.local
├── .env.example
├── .gitignore
├── package.json
├── next.config.js
├── tsconfig.json
└── CLAUDE.md
```

## Workflow de Desarrollo

### 1. Crear rama (si es necesario)
```bash
git checkout -b feature/nueva-feature
```

### 2. Hacer cambios
```bash
# Editar archivos
# Testear en localhost:3000
npm run dev
```

### 3. Verificar cambios
```bash
# Lint
npm run lint

# Build local
npm run build
```

### 4. Commit y Push
```bash
git add .
git commit -m "descripción clara"
git push origin claude/quirky-ramanujan-lcfqj5
```

## Agregar Nueva API

### Ejemplo: POST /api/teams

```typescript
// app/api/teams/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { verifyAuth } from '@/lib/auth'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticación
    const user = await verifyAuth()
    if (!user || user.rol !== 'admin') {
      return NextResponse.json(
        { ok: false, message: 'No autorizado' },
        { status: 401 }
      )
    }

    const { nombre, ciudad, logo } = await request.json()

    // Validar
    if (!nombre || !ciudad) {
      return NextResponse.json(
        { ok: false, message: 'Campos requeridos' },
        { status: 400 }
      )
    }

    // Crear
    const team = await prisma.team.create({
      data: {
        name: nombre,
        city: ciudad,
        logo: logo || null,
        directorName: 'Por definir',
        directorCedula: 'Por definir'
      }
    })

    return NextResponse.json({
      ok: true,
      team
    })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { ok: false, message: 'Error al crear equipo' },
      { status: 500 }
    )
  }
}
```

## Agregar Nuevo Componente

```typescript
// app/components/MiComponente.tsx
'use client'

import { useState } from 'react'

interface Props {
  prop1: string
}

export default function MiComponente({ prop1 }: Props) {
  const [state, setState] = useState('')

  return (
    <div className="bg-slate-800 rounded-lg p-6">
      <h2 className="text-2xl font-bold text-white">{prop1}</h2>
      {/* contenido */}
    </div>
  )
}
```

## Testing

### Test de API
```bash
# Con curl
curl -X POST http://localhost:3000/api/teams \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Águilas","ciudad":"Quito"}'

# Con fetch en navegador console
fetch('/api/teams', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nombre: 'Águilas', ciudad: 'Quito' })
}).then(r => r.json()).then(console.log)
```

### Test de componente
```bash
# Verificar que renderiza sin errores
npm run dev
# Abre en navegador y verifica
```

## Variables de Entorno

```env
# .env.local
DATABASE_URL="postgresql://user:pass@localhost:5432/keeper"
JWT_SECRET="keeper-secret-key-change-in-production"
GOOGLE_SHEETS_ID="1O1JZQWsUkVu7FxffB3craCbAGHBjIaUrh9C5XHCC6Yw"
ADMIN_EMAIL="ainteligencia075@gmail.com"
NODE_ENV="development"
```

## Debugging

### Logs de BD
```typescript
// En cualquier archivo
const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
})
```

### Logs de API
```typescript
console.error('Error:', error)
console.log('Data:', data)
```

### Verificar JWT
```javascript
// En console del navegador
localStorage.getItem('auth-token')
// Copiar y pegar en jwt.io para verificar
```

## Convenciones

### Nombres
- **Archivos componentes:** PascalCase (Button.tsx)
- **Archivos utilidades:** camelCase (utils.ts)
- **Variables:** camelCase
- **Constantes:** UPPER_SNAKE_CASE

### Styling
- Usar Tailwind CSS
- Dark theme: `bg-slate-800`, `text-white`
- Colores brand: `bg-red-600` (#E10600)
- Responsive: mobile-first

### Git Commits
```
Formato: "Tipo: descripción breve"

Tipos:
- feat:  nueva funcionalidad
- fix:   corrección de bug
- docs:  documentación
- style: formato/style (no afecta código)
- refactor: refactorización
- perf:  mejora performance
- test:  agregar tests
- chore: tareas/dependencias
```

## Troubleshooting

### Error: "Module not found"
```bash
npm install
npx prisma generate
```

### Error: "Database connection failed"
- Verificar DATABASE_URL en .env.local
- Verificar que PostgreSQL está corriendo
- Verificar credenciales

### Error: "JWT inválido"
- Borrar cookies: DevTools → Application → Cookies
- Borrar localStorage
- Hacer login de nuevo

### Build falla
```bash
# Limpiar caché
rm -rf .next
rm -rf node_modules
npm install
npm run build
```

## Próximos Pasos

1. **Agregar endpoints teams/players**
2. **Agregar componentes admin**
3. **Integrar Google Sheets API**
4. **WebSocket para live updates**
5. **Componentes NIX v7.2**

