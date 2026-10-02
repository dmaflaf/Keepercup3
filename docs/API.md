# 📡 API Reference - Keeper Cup 3

## Base URL
```
http://localhost:3000  (desarrollo)
https://keeper.com.ec  (producción)
```

## Autenticación

Todas las APIs protegidas requieren:
- JWT token en cookie `auth-token`
- O header: `Authorization: Bearer {token}`

---

## 🔐 Authentication APIs

### POST /api/auth/login
Iniciar sesión

**Request:**
```json
{
  "email": "admin@keeper.ec",
  "password": "<contraseña>"
}
```

**Response (200):**
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "usuario": {
    "id": "cuid123",
    "email": "admin@keeper.ec",
    "nombre": "Administrador",
    "rol": "admin"
  }
}
```

**Response (401):**
```json
{
  "ok": false,
  "message": "Credenciales inválidas"
}
```

---

### POST /api/auth/logout
Cerrar sesión

**Response (200):**
```json
{
  "ok": true,
  "message": "Logout exitoso"
}
```

---

### POST /api/auth/create-admin
Crear nuevo usuario (requiere admin)

**Request:**
```json
{
  "email": "vocal@keeper.ec",
  "password": "<contraseña>",
  "nombre": "Vocal 1"
}
```

**Response (200):**
```json
{
  "ok": true,
  "message": "Admin creado exitosamente",
  "usuario": {
    "id": "cuid123",
    "email": "vocal@keeper.ec",
    "nombre": "Vocal 1",
    "rol": "admin"
  }
}
```

---

### POST /api/setup/init-admin
Setup inicial (crea admin + vocal de prueba)

**Solo funciona si NO hay usuarios en BD**

**Response (200):**
```json
{
  "ok": true,
  "usuarios": [
    {
      "email": "admin@keeper.ec",
      "password": "<contraseña>",
      "rol": "admin"
    },
    {
      "email": "vocal@keeper.ec",
      "password": "<contraseña>",
      "rol": "vocal"
    }
  ]
}
```

---

## 👕 Teams APIs

### GET /api/teams
Listar equipos (pública)

**Query params:**
- `limit`: número de resultados (default: 20)
- `offset`: para paginación (default: 0)

**Response (200):**
```json
{
  "ok": true,
  "teams": [
    {
      "id": "cuid123",
      "name": "Águilas",
      "city": "Quito",
      "logo": "data:image/png;base64,...",
      "codigoEquipo": "AGL001",
      "directorName": "Juan Pérez",
      "playerCount": 20
    }
  ],
  "total": 32
}
```

---

### POST /api/teams
Crear equipo (requiere admin)

**Request:**
```json
{
  "nombre": "Águilas",
  "ciudad": "Quito",
  "logo": "data:image/png;base64,...",
  "directorName": "Juan Pérez",
  "directorCedula": "1234567890"
}
```

**Response (200):**
```json
{
  "ok": true,
  "team": {
    "id": "cuid123",
    "name": "Águilas",
    "city": "Quito",
    "codigoEquipo": "AGL001"
  }
}
```

---

## 👥 Players APIs

### GET /api/players
Listar jugadores (pública)

**Query params:**
- `teamId`: filtrar por equipo
- `limit`: número de resultados
- `offset`: paginación

**Response (200):**
```json
{
  "ok": true,
  "players": [
    {
      "id": "cuid456",
      "firstName": "Juan",
      "lastName": "Pérez",
      "number": 10,
      "position": "Delantero",
      "teamName": "Águilas",
      "photo": "data:image/png;base64,..."
    }
  ],
  "total": 345
}
```

---

### POST /api/players
Crear jugador (requiere admin)

**Request:**
```json
{
  "firstName": "Juan",
  "lastName": "Pérez",
  "cedula": "1234567890",
  "number": 10,
  "position": "Delantero",
  "birthDate": "1995-05-15",
  "photo": "data:image/png;base64,...",
  "teamId": "cuid123"
}
```

**Response (200):**
```json
{
  "ok": true,
  "player": {
    "id": "cuid456",
    "firstName": "Juan",
    "lastName": "Pérez",
    "number": 10
  }
}
```

---

### POST /api/players/import
Importar masivamente desde Excel (requiere admin)

**Request:** FormData
```
Field: "file" → Excel file
Field: "teamId" → ID del equipo (opcional)
```

**Response (200):**
```json
{
  "ok": true,
  "imported": 20,
  "errors": [
    {
      "row": 5,
      "error": "Email duplicado"
    }
  ]
}
```

---

## ⚽ Fixture APIs

### GET /api/fixtures
Listar partidos (pública)

**Query params:**
- `serie`: filtrar por división
- `fecha`: filtrar por fecha
- `estado`: programado|en_vivo|finalizado

**Response (200):**
```json
{
  "ok": true,
  "fixtures": [
    {
      "id": "cuid789",
      "fecha": "2026-10-15T15:00:00Z",
      "fase": "Fecha 1",
      "local": { "name": "Águilas", "logo": "..." },
      "visitante": { "name": "Tigres", "logo": "..." },
      "resultado": {
        "localGoles": 2,
        "visitanteGoles": 1,
        "estado": "finalizado"
      }
    }
  ]
}
```

---

### POST /api/fixtures
Crear partido (requiere admin)

**Request:**
```json
{
  "fecha": "2026-10-15T15:00:00Z",
  "fase": "Fecha 1",
  "horario": "15:00",
  "serie": "División A",
  "escenario": "Estadio Bellavista",
  "veedor": "Carlos López",
  "localId": "cuid123",
  "visitanteId": "cuid124",
  "observaciones": "Partido importante"
}
```

**Response (200):**
```json
{
  "ok": true,
  "fixture": {
    "id": "cuid789",
    "fecha": "2026-10-15T15:00:00Z",
    "fase": "Fecha 1"
  }
}
```

---

## 📊 Results APIs

### GET /api/results/:fixtureId
Obtener resultado de un partido

**Response (200):**
```json
{
  "ok": true,
  "result": {
    "id": "cuid999",
    "fixtureId": "cuid789",
    "localGoles": 2,
    "visitanteGoles": 1,
    "estado": "finalizado",
    "goles": [
      {
        "id": "goal1",
        "jugador": "Juan Pérez",
        "minuto": 15,
        "equipo": "local",
        "tipo": "gol"
      }
    ]
  }
}
```

---

### POST /api/results
Crear/actualizar resultado (requiere admin/vocal)

**Request:**
```json
{
  "fixtureId": "cuid789",
  "localGoles": 2,
  "visitanteGoles": 1,
  "estado": "finalizado"
}
```

**Response (200):**
```json
{
  "ok": true,
  "result": {
    "id": "cuid999",
    "localGoles": 2,
    "visitanteGoles": 1
  }
}
```

---

## ⚽ Goals APIs

### POST /api/goals
Agregar gol (requiere admin/vocal)

**Request:**
```json
{
  "resultadoId": "cuid999",
  "playerId": "cuid456",
  "minuto": 15,
  "equipo": "local",
  "tipo": "gol"
}
```

**Response (200):**
```json
{
  "ok": true,
  "goal": {
    "id": "goal1",
    "minuto": 15,
    "jugador": "Juan Pérez",
    "tipo": "gol"
  }
}
```

---

### DELETE /api/goals/:id
Eliminar gol (requiere admin)

**Response (200):**
```json
{
  "ok": true,
  "message": "Gol eliminado"
}
```

---

## 🏆 Standings APIs

### GET /api/standings
Obtener tabla de posiciones (pública)

**Query params:**
- `serie`: filtrar por división

**Response (200):**
```json
{
  "ok": true,
  "standings": [
    {
      "pos": 1,
      "team": "Águilas",
      "partidos": 5,
      "ganados": 4,
      "empatados": 1,
      "perdidos": 0,
      "golesAFavor": 15,
      "golesEnContra": 3,
      "diferencia": 12,
      "puntos": 13
    },
    {
      "pos": 2,
      "team": "Tigres",
      "partidos": 5,
      "ganados": 3,
      "empatados": 2,
      "perdidos": 0,
      "golesAFavor": 12,
      "golesEnContra": 5,
      "diferencia": 7,
      "puntos": 11
    }
  ]
}
```

---

## ⚠️ Sanctions APIs

### GET /api/sanciones
Listar sanciones (protegida)

**Response (200):**
```json
{
  "ok": true,
  "sanciones": [
    {
      "id": "sanc1",
      "jugador": "Juan Pérez",
      "equipo": "Águilas",
      "tipo": "amarilla",
      "fecha": "2026-10-15T15:00:00Z",
      "razon": "Falta táctica"
    }
  ]
}
```

---

### POST /api/sanciones
Agregar sanción (requiere admin/vocal)

**Request:**
```json
{
  "fixtureId": "cuid789",
  "playerId": "cuid456",
  "tipo": "amarilla",
  "razon": "Falta táctica"
}
```

**Response (200):**
```json
{
  "ok": true,
  "sancion": {
    "id": "sanc1",
    "tipo": "amarilla"
  }
}
```

---

## Códigos de Error

| Código | Significado |
|--------|-----------|
| 200 | OK - Éxito |
| 400 | Bad Request - Datos inválidos |
| 401 | Unauthorized - Sin autenticación |
| 403 | Forbidden - Sin permisos |
| 404 | Not Found - Recurso no existe |
| 500 | Server Error - Error en servidor |

---

## Rate Limiting

- Vercel: 10,000 requests/día por defecto
- Cloudflare: 1,000 requests/segundo
- Exceder limita a 429 Too Many Requests

