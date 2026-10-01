# 🚀 Guía de Deployment - Keeper Cup 3

## Flujo Automático (Recomendado)

### 1. Hacer cambios localmente
```bash
npm run dev
# Testear en http://localhost:3000
```

### 2. Commit y Push
```bash
git add .
git commit -m "feat: descripción del cambio"
git push origin claude/quirky-ramanujan-lcfqj5
```

### 3. Vercel detecta automáticamente
- ✅ Webhook de GitHub activa
- ✅ Vercel clona código
- ✅ Ejecuta build (`npm run build`)
- ✅ Ejecuta migraciones (`npx prisma migrate deploy`)
- ✅ Desploya en keeper.com.ec

### 4. Ver progreso
1. Ve a: https://vercel.com/dashboard
2. Abre proyecto "keepercup3"
3. Ve la sección "Deployments"
4. Espera estado ✅ (2-3 minutos)

### 5. Verificar en vivo
```bash
# Ir a keeper.com.ec/admin/login
# Probar con credenciales
```

---

## Configuración Inicial (Ya Hecha)

### 1. Conectar GitHub
- ✅ Repo: dmaflaf/appskc3
- ✅ Branch: claude/quirky-ramanujan-lcfqj5
- ✅ Auto-deploy: activo

### 2. Variables de Entorno en Vercel
```
DATABASE_URL=postgresql://[railway]
JWT_SECRET=keeper-secret-key-change-in-production
GOOGLE_SHEETS_ID=1O1JZQWsUkVu7FxffB3craCbAGHBjIaUrh9C5XHCC6Yw
ADMIN_EMAIL=ainteligencia075@gmail.com
```

> Ir a: Vercel Dashboard → Settings → Environment Variables

### 3. Dominio DNS
```
keeper.com.ec → Vercel CNAME
www.keeper.com.ec → Vercel CNAME
```

> Configurado en Cloudflare

---

## Solucionar Deployments Fallidos

### Error: "Build failed"

**1. Ver logs:**
- Vercel Dashboard → Deployments → Click en el fallido
- Ver sección "Build Logs"

**2. Errores comunes:**

**"Cannot find module"**
```bash
# Solución:
npm install
git add package-lock.json
git commit -m "fix: reinstall dependencies"
git push
```

**"Prisma migration failed"**
```bash
# Solución local:
npx prisma migrate resolve --rolled-back 001_init
npx prisma migrate dev --name init
git add prisma/migrations/
git commit -m "fix: reset migrations"
git push
```

**"DATABASE_URL not found"**
- Verificar en Vercel Settings → Environment Variables
- Agregar si falta

### Error: "502 Bad Gateway"

**Significado:** App está corriendo pero BD no responde

**Solución:**
1. Verificar Railway status (railway.app)
2. Esperar 5 minutos
3. Hacer request de nuevo
4. Si persiste, contactar Railway support

### Error: "404 Not Found"

**Si ves esto en keeper.com.ec:**
- DNS no propagó todavía (esperar 15-30 min)
- O no está deployado aún

**Verificar:**
```bash
# En terminal
nslookup keeper.com.ec
dig keeper.com.ec
```

---

## Rollback (Volver a versión anterior)

### Opción 1: Desde Vercel
1. Dashboard → Deployments
2. Encontrar deployment anterior ✅
3. Click en "..." → Redeploy

### Opción 2: Desde Git
```bash
# Ver commits
git log --oneline

# Volver a commit anterior
git reset --soft HEAD~1

# Editar y commit de nuevo
git add .
git commit -m "revert: volver a versión anterior"
git push
```

---

## Checks Pre-Deploy

Antes de hacer `git push`:

```bash
# 1. Verificar cambios
git status

# 2. Lint
npm run lint

# 3. Build local
npm run build

# 4. Si todo OK → push
git push origin claude/quirky-ramanujan-lcfqj5
```

---

## Monitorear en Vivo

### Vercel Analytics
- Dashboard → Analytics
- Ver: requests, performance, errors

### Database
- Railway Dashboard → PostgreSQL
- Ver: connections, queries, storage

### Errors
- Vercel → Deployments → Logs
- Ver: build errors, runtime errors

---

## Agregar Nuevas Variables

### 1. En local (.env.local)
```env
NUEVA_VAR="valor"
```

### 2. Test local
```bash
npm run dev
# Verificar que funciona
```

### 3. Agregar a Vercel
- Dashboard → Settings → Environment Variables
- Agregar NUEVA_VAR

### 4. Commit y push
```bash
git add .env.example  # (si cambió el ejemplo)
git commit -m "chore: add new env var"
git push
```

---

## Backup BD

### Automático (Railway)
- Railway hace backup diario
- Ver en: Railway Dashboard → PostgreSQL → Backups

### Manual
```bash
# Descargar respaldo
pg_dump DATABASE_URL > backup.sql

# Restaurar
psql DATABASE_URL < backup.sql
```

---

## Optimizaciones Post-Deploy

### Performance
1. Habilitar caching (Vercel → Settings → Caching)
2. Optimizar imágenes (Next.js Image)
3. Minificar CSS/JS (automático con build)

### Seguridad
1. Cambiar JWT_SECRET en producción
2. Habilitar 2FA en GitHub
3. Auditar permisos en Railway

### Monitoreo
1. Configurar alertas en Vercel
2. Configurar alertas en Railway
3. Monitorear logs regularmente

---

## Checklista de Deployment

- [ ] Code pushed a GitHub
- [ ] Vercel detectó el push
- [ ] Build en progreso
- [ ] Migraciones ejecutadas
- [ ] Deploy completado ✅
- [ ] DNS resuelve
- [ ] App responde en keeper.com.ec
- [ ] Login funciona
- [ ] API responde
- [ ] BD conecta correctamente

