# 🏆 Keeper Cup 3 - Sistema de Gestión de Torneos

**Última actualización:** 2026-10-01  
**Estado:** Fase 1 completada - Autenticación ✅

---

## 📋 **RESUMEN EJECUTIVO**

**Proyecto:** Sistema completo de gestión de torneos de fútbol  
**Usuario:** dmaflaf@gmail.com  
**Dominio:** keeper.com.ec  
**Hosting:** Vercel  
**BD:** PostgreSQL (Railway)  
**Datos:** 32 equipos, 1000+ jugadores

---

## 🎯 **ESTADO ACTUAL**

### **✅ Completado (Fase 1)**
- Sistema de autenticación con JWT
- Roles (admin/vocal) con permisos específicos
- Protección de rutas `/admin`
- API login/logout
- Dashboard admin básico
- BD schema con todas las tablas necesarias

### **🚀 En Desarrollo**
- CRUD Equipos/Jugadores
- Importación masiva desde Google Sheets/Drive
- APIs de fixture y resultados
- Tabla de posiciones automática

### **📅 Pendiente**
- WebSocket para actualizaciones en vivo
- Componentes NIX v7.2 (convertir HTML a React)
- Integración con Google Drive API

---

## 👥 **USUARIOS**

Usuarios: `admin@keeper.ec` (admin) y `vocal@keeper.ec` (vocal). Las contraseñas NO se guardan en el repo: se generan con `/api/setup/reset-admin?key=SETUP_KEY` (requiere la variable SETUP_KEY en Vercel).

---

## 🏗️ **ARQUITECTURA**

```
keeper.com.ec (Vercel)
├── /                    → Landing pública
├── /registro            → Registro equipos/jugadores
├── /carnets             → Generador credenciales
│
└── /admin               → Panel protegido (JWT)
    ├── /login           → Autenticación
    ├── /dashboard       → Menú principal
    ├── /fixture         → Gestionar partidos (admin)
    ├── /equipos         → Gestionar equipos (admin)
    ├── /jugadores       → Gestionar jugadores (admin)
    ├── /usuarios        → Crear vocales (admin)
    ├── /resultados      → Ingresar goles (admin/vocal)
    ├── /tabla-posiciones → Ver tabla (todos)
    └── /sanciones       → Tarjetas (admin)

APIs (/api)
├── /auth/login          → POST login con JWT
├── /auth/logout         → POST cerrar sesión
├── /auth/create-admin   → POST crear usuario
├── /setup/init-admin    → POST crear usuarios prueba
├── /teams/*             → CRUD equipos
├── /players/*           → CRUD jugadores
├── /fixtures/*          → CRUD partidos
├── /results/*           → CRUD resultados
├── /goals/*             → CRUD goles
└── /standings           → GET tabla (pública)

BD (PostgreSQL)
├── User                 → Usuarios admin/vocal
├── Team                 → Equipos (32)
├── Player               → Jugadores (1000+)
├── Fixture              → Partidos programados
├── Result               → Resultado partido
├── Goal                 → Goles individuales
├── Sanction             → Tarjetas/sanciones
└── Standing             → Tabla posiciones
```

---

## 📝 **DECISIONES TÉCNICAS**

| Aspecto | Solución | Razón |
|---------|----------|-------|
| **Auth** | JWT + HttpOnly cookies | Seguro, sin CSRF |
| **Roles** | admin/vocal en BD | Flexible, fácil de escalar |
| **Live updates** | Polling primero, WebSocket después | MVP rápido |
| **Fotos** | Base64 + Cloudinary (después) | Simple inicialmente |
| **Importación** | Google Sheets API | Usuario ya tiene datos ahí |

---

## 🔐 **ROLES Y PERMISOS**

### **ADMIN**
- ✅ Crear/editar/borrar partidos
- ✅ Crear/editar equipos
- ✅ Crear/editar/importar jugadores
- ✅ Ingresar resultados y goles
- ✅ Crear usuarios (vocales)
- ✅ Gestionar sanciones
- ✅ Ver todo

### **VOCAL**
- ✅ Agregar goles EN VIVO
- ✅ Editar goles (mismo partido)
- ✅ Ver tabla posiciones
- ✅ Ver resultados
- ❌ Crear/borrar partidos
- ❌ Cambiar nombres jugadores
- ❌ Crear equipos/usuarios

---

## 📊 **PRÓXIMAS FASES**

### **Fase 2: CRUD Equipos/Jugadores**
```
- GET /api/teams
- POST /api/teams
- POST /api/players
- POST /api/players/import-excel
```

### **Fase 3: Fixture y Resultados**
```
- POST /api/fixtures
- POST /api/results
- POST /api/goals
- GET /api/standings (cálculo automático)
```

### **Fase 4: NIX v7.2 Integration**
```
- Convertir HTML a componentes React
- WebSocket para updates en vivo
- Exportar PDF/Excel
```

---

## 🚀 **CÓMO DESPLEGAR**

```bash
# Local development
npm install
npm run dev

# Push a GitHub (automático deploy a Vercel)
git add .
git commit -m "descripción"
git push origin claude/quirky-ramanujan-lcfqj5
```

**Vercel hace:**
1. Detecta el push
2. Ejecuta `npm install`
3. Ejecuta `npx prisma migrate deploy`
4. Ejecuta `npm run build`
5. Desploya en keeper.com.ec

---

## 📞 **CONTACTO**

**Desarrollador:** Claude Haiku 4.5  
**Email usuario:** dmaflaf@gmail.com  
**Repo:** https://github.com/dmaflaf/appskc3  
**Branch:** claude/quirky-ramanujan-lcfqj5  

---

## 📚 **DOCUMENTACIÓN COMPLETA**

Ver carpeta `/docs`:
- `ARCHITECTURE.md` - Detalle técnico
- `DEVELOPMENT.md` - Guía de desarrollo
- `DEPLOYMENT.md` - Despliegue paso a paso
- `API.md` - Endpoints disponibles
