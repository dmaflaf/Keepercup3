# Respaldo y restauración de Keeper Cup 3

Este documento explica cómo recuperar TODO el sistema (código y funcionamiento) si GitHub, Vercel o cualquier servicio falla o te bloquean la cuenta.

## 1. Qué contiene el respaldo

| Archivo | Para qué sirve |
|---|---|
| `keeper-cup-codigo-AAAA-MM-DD.zip` | Todo el código fuente listo para usar (sin historial). Es lo más sencillo para volver a publicar el sistema. |
| `keeper-cup-historial-AAAA-MM-DD.bundle` | El repositorio completo con TODO el historial de cambios (cada commit). Se restaura con `git`. |

Ninguno contiene claves ni contraseñas: esas viven en las variables de entorno de Vercel (ver sección 4).
Los **datos** (jugadores, fotos, resultados) están en la base de datos de Railway y se respaldan aparte (Railway → PostgreSQL → Backups).

## 2. Restaurar desde el ZIP (lo más fácil)

1. Descomprime el ZIP en una carpeta.
2. Instala Node.js 20 o superior (nodejs.org).
3. En la carpeta, ejecuta: `npm install`
4. Crea un archivo `.env.local` con las variables de la sección 4.
5. Prueba en tu computador: `npx prisma db push` y luego `npm run dev` → abre http://localhost:3000
6. Para publicar: crea una cuenta en Vercel (o cualquier alojamiento de Node.js), sube la carpeta con `npx vercel` y agrega las mismas variables de entorno. El dominio `keeper.com.ec` se vuelve a apuntar desde su proveedor de dominio (DNS) al nuevo servicio.

## 3. Restaurar el repositorio con historial (si quieres volver a GitHub u otro sitio)

1. `git clone keeper-cup-historial-AAAA-MM-DD.bundle keeper-cup`
2. Entra a la carpeta: `cd keeper-cup`
3. Crea un repositorio vacío nuevo (GitHub con otra cuenta, GitLab o Bitbucket).
4. Conéctalo y súbelo: `git remote set-url origin https://URL-DEL-NUEVO-REPOSITORIO.git` y `git push --all origin`
5. En Vercel, conecta el nuevo repositorio (Add New → Project).

## 4. Variables de entorno necesarias (guárdalas aparte, en un gestor de contraseñas)

| Variable | Para qué | Obligatoria |
|---|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL (Railway u otro) | Sí |
| `JWT_SECRET` | Firma las sesiones. Si cambia, todos deben volver a entrar | Sí |
| `NEXT_PUBLIC_SITE_URL` | Dirección pública (https://keeper.com.ec) | Sí |
| `SYNC_KEY` | Clave que usa Google Apps Script para sincronizar | Si usas la hoja de Google |
| `SETUP_KEY`, `USUARIOS_JSON` | Solo para crear/restablecer usuarios la primera vez. Bórralas después | No |
| `RESEND_API_KEY`, `SORTEO_FROM` | Envío de correos del sorteo | Opcional |
| `DRIVE_DOWNLOAD_BASE` | Descarga de fotos desde Drive | Opcional |

## 5. Otras piezas que NO están en el código

- **Base de datos (Railway)**: las tablas se crean solas con `npx prisma db push`; los datos se restauran desde el respaldo de Railway.
- **Google Apps Script**: los scripts están en `docs/apps-script/` (Carpetas.gs, Enlaces.gs, Sync.gs). Se vuelven a pegar en Google Sheets.
- **Dominio**: se configura en el proveedor del dominio (DNS).
- **Cuentas de usuario**: están en la base de datos. Si se pierden, se crean con `/api/setup/init-admin` y luego desde el panel (🔑 Usuarios).

## 6. Buenas prácticas

- Guarda este respaldo en **tres lugares**: tu computador, un disco externo/USB y un almacenamiento en la nube (Drive).
- Actualiza el respaldo después de cada bloque grande de cambios.
- Activa la verificación en dos pasos (2FA) en GitHub, Vercel, Railway, Google y en el proveedor del dominio.
- Mantén una segunda copia remota del repositorio en otro servicio (GitLab/Bitbucket).
- Trata estos archivos como privados: el historial incluye el trabajo completo del sistema.
