# 🏗️ Arquitectura - Keeper Cup 3

## Sistema Completo

### Frontend (React + Next.js 14)
```
pages/
├── / (landing pública)
├── /registro (registro equipos/jugadores - pública)
├── /carnets (generador credenciales - pública)
└── /admin (protegida por JWT)
    ├── /login
    ├── /dashboard
    ├── /fixture
    ├── /equipos
    ├── /jugadores
    ├── /usuarios
    ├── /resultados
    ├── /tabla-posiciones
    └── /sanciones

components/
├── AdminLogin.tsx
├── Dashboard.tsx
├── TeamRegistration.tsx (existente)
├── CredentialGenerator.tsx (existente)
└── [nuevos componentes]
```

### Backend APIs (Next.js Route Handlers)
```
/api/
├── auth/
│   ├── login (POST) - Genera JWT
│   ├── logout (POST) - Limpia cookie
│   └── create-admin (POST) - Crea usuario
├── setup/
│   └── init-admin (POST) - Setup inicial
├── teams/
│   ├── GET - Listar equipos
│   ├── POST - Crear equipo
│   ├── PUT/:id - Editar equipo
│   └── DELETE/:id - Eliminar equipo
├── players/
│   ├── GET - Listar jugadores
│   ├── POST - Crear jugador
│   ├── POST/import - Importar desde Excel
│   ├── PUT/:id - Editar jugador
│   └── DELETE/:id - Eliminar jugador
├── fixtures/
│   ├── GET - Listar partidos
│   ├── POST - Crear partido
│   ├── PUT/:id - Editar partido
│   └── DELETE/:id - Eliminar partido
├── results/
│   ├── GET/:fixtureId - Resultado de partido
│   └── POST - Crear/actualizar resultado
├── goals/
│   ├── POST - Agregar gol
│   ├── PUT/:id - Editar gol
│   └── DELETE/:id - Eliminar gol
├── sanciones/
│   ├── GET - Listar sanciones
│   ├── POST - Crear sanción
│   └── DELETE/:id - Eliminar sanción
└── standings/
    └── GET - Tabla posiciones (pública)
```

### Database (PostgreSQL via Prisma)

#### Modelo de Datos
```
User
├── id (CUID)
├── email (unique)
├── passwordHash (bcrypt)
├── nombre
├── rol (admin|vocal)
├── activo (boolean)
└── timestamps

Team
├── id (CUID)
├── name (unique)
├── city
├── logo (base64)
├── codigoEquipo
├── directorName
├── directorCedula
├── assistantName
├── assistantPhone
├── assistantEmail
├── nominaFile
├── players (relation)
├── fixtures_local (relation)
├── fixtures_visitante (relation)
├── standing (relation)
└── timestamps

Player
├── id (CUID)
├── firstName
├── lastName
├── cedula (unique per team)
├── number (unique per team)
├── position
├── birthDate
├── photo (base64)
├── teamId (FK)
├── goles (relation)
├── sanciones (relation)
└── timestamps

Fixture
├── id (CUID)
├── fecha (date)
├── fase (string)
├── horario (string)
├── serie (string)
├── escenario (string)
├── veedor (string)
├── observaciones
├── localId (FK Team)
├── visitanteId (FK Team)
├── resultado (relation)
├── sanciones (relation)
└── timestamps

Result
├── id (CUID)
├── fixtureId (unique FK)
├── localGoles (int)
├── visitanteGoles (int)
├── estado (programado|en_vivo|finalizado)
├── registradoPor (FK User)
├── goles (relation)
└── updatedAt

Goal
├── id (CUID)
├── resultadoId (FK)
├── jugadorId (FK Player)
├── minuto (int)
├── equipo (local|visitante)
├── tipo (gol|autogol)
└── createdAt

Sanction
├── id (CUID)
├── fixtureId (FK)
├── jugadorId (FK)
├── tipo (amarilla|roja)
├── razon (string)
└── createdAt

Standing
├── id (CUID)
├── teamId (unique FK)
├── serie (string)
├── partidos (int)
├── ganados (int)
├── empatados (int)
├── perdidos (int)
├── golesAFavor (int)
├── golesEnContra (int)
├── puntos (int)
├── diferencia (int)
└── updatedAt
```

### Autenticación

#### Flujo Login
```
Usuario
  ↓
POST /api/auth/login { email, password }
  ↓
Prisma.user.findUnique({ email })
  ↓
bcrypt.compare(password, passwordHash)
  ↓
Si válido:
  ├─ Generar JWT (exp: 7 días)
  ├─ Set cookie httpOnly
  └─ Return { token, usuario }
  ↓
Cliente guarda en localStorage + cookies
  ↓
Middleware verifica en cada request /admin/*
```

#### Middleware
```typescript
// middleware.ts verifica todas las rutas
Si pathname.startsWith('/admin'):
  ├─ Leer token de cookie
  ├─ Verificar con jose.jwtVerify()
  └─ Si inválido → redirect a /admin/login
```

#### Permisos
```typescript
// lib/auth.ts funciones helper
- isAdmin(rol) → boolean
- isVocal(rol) → boolean
- canManageGoles(rol) → boolean
- canEditFixture(rol) → boolean
- canDeleteFixture(rol) → boolean
```

### Seguridad

1. **Contraseñas:** Hasheadas con bcryptjs (10 rounds)
2. **Sesiones:** JWT con expiración 7 días
3. **Cookies:** httpOnly, secure, sameSite=lax
4. **CORS:** Vercel auto-configura
5. **Validación:** Zod (cuando se agregue)
6. **Rate limiting:** Cloudflare (en Vercel)

### Deployment

```
GitHub (dmaflaf/appskc3)
  ↓
  └─ Branch: claude/quirky-ramanujan-lcfqj5
  
  ↓ (git push)
  
Vercel Webhook (automático)
  ├─ npm install
  ├─ npx prisma migrate deploy
  ├─ npm run build
  └─ Deploy a keeper.com.ec
  
  ↓
Railway (PostgreSQL)
  └─ BD en vivo
```

### Flujo de Datos en Vivo

```
Admin ingresa gol en /admin/resultados
  ↓
POST /api/goals
  ↓
Prisma.goal.create()
  ↓
Prisma.standing.update() (recalcula)
  ↓
Response { gol, standing actualizado }
  ↓
Público ve en /tabla-posiciones
  (Con polling cada 3s o WebSocket)
```

### Stack Técnico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| **Frontend** | React + Next.js | 18 + 14 |
| **Backend** | Node.js + Next.js API Routes | 20 LTS |
| **BD** | PostgreSQL | 14+ |
| **ORM** | Prisma | 5.22 |
| **Auth** | JWT (jsonwebtoken) | - |
| **Password** | bcryptjs | 2.4+ |
| **Styling** | Tailwind CSS | 3.3 |
| **Hosting** | Vercel | - |
| **DNS** | Cloudflare | - |

### Escalabilidad

**Actual (MVP):** Polling cada 3 segundos
**Después (v2):** WebSocket con Socket.io
**Después (v3):** Redis para caché de standings

### Performance

- Next.js Image Optimization ✅
- Static exports donde sea posible ✅
- API response caching ✅
- DB indexes en fields frecuentes ✅

