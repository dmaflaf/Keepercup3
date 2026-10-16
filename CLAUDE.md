# 🏆 Keeper Cup 3 - Sistema de Gestión de Torneos

**Última actualización:** 2026-10-01  
**Estado:** Autenticación ✅ · Importador de equipos/jugadores ✅ (probado con BD local) · Landing original en /public

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


---

## Decisiones vigentes (2026-10)

- La landing y los formularios originales (HTML) viven en `public/` y se sirven en la raíz; Next.js solo se usa para `/admin` y `/api`. Los formularios envían a Google Apps Script (hoja "Datops KC3").
- Cuentas: definidas por la variable privada `USUARIOS_JSON` + `SETUP_KEY` en Vercel (`/api/setup/reset-admin`). Borrar ambas variables después de usarlas. Nunca guardar contraseñas en el repo.
- Importador: `/admin/importar` (solo admin) lee el Excel descargado de la hoja (pestañas Equipos y Jugadores). Valida y limpia en `lib/importar.ts`. Cédula única global; cédulas de 9 dígitos se corrigen con cero inicial.
- Jugadores importados quedan en estado `pendiente`; habilitar es decisión del organizador.
- Privacidad: público = solo carnet digital (por hacer, vía QR con `qrToken` aleatorio). Admin ve ficha completa y cédulas. Vocales NO ven cédulas.
- Pendiente: copiar selfies/cédulas desde Drive a almacenamiento propio (cédulas privadas), ficha de jugador, QR + página pública del carnet, modo verificación iPad, fixture/resultados/tabla.
- Riesgo: Railway en período de prueba; pasar a plan de pago antes de que se acabe el crédito.

## Sincronización automática desde la hoja (2026-10)

- Apps Script (`docs/apps-script/Sync.gs`, archivo NUEVO en el proyecto de Codigo.gs; no modifica el registro) corre cada 5 min y envía a `POST /api/sync/ingest` solo filas nuevas/cambiadas (hash por fila en hoja oculta `_SyncEstado`). Filas rechazadas se reportan en la hoja `Sync Errores` y se reintentan.
- Auth: header `x-sync-key` = variable `SYNC_KEY` en Vercel (mínimo 16 caracteres). En Apps Script va en Propiedades del script (`PANEL_URL`, `SYNC_KEY`), nunca en el código.
- El endpoint copia las fotos de los jugadores tocados (hasta 10 por lote) mientras los enlaces de Drive sean accesibles. Si las carpetas pasan a privadas, hay que enviar las imágenes desde el script (pendiente).
- Los números de camiseta los guardan los DT desde la página pública (`guardarNumeros` en Codigo.gs escribe en la hoja), por eso la hoja es la fuente de los números.
- Lógica compartida: `lib/importar.ts` (validación), `lib/importar-db.ts` (escritura), `lib/fotos.ts` (copia de fotos). La usan `/api/admin/import`, `/api/admin/fotos/migrar` y `/api/sync/ingest`.

## Inscripción manual (carpetas de Drive) — Carpetas.gs (2026-10)

- `docs/apps-script/Carpetas.gs` (archivo NUEVO en Apps Script, junto a Codigo.gs y Sync.gs): `REPORTE_CARPETAS_EQUIPOS()` (solo lectura) y `IMPORTAR_NOMINAS_TODOS()` recorren todos los equipos de la hoja, leen la nómina de su carpeta (Hoja de Google / Excel / CSV), agregan jugadores nuevos a "Jugadores" y completan solo vacíos (número, enlaces de fotos nombradas `cédula.jpg`, `cédula CI Frente.jpg`, `cédula CI Reverso.jpg`). Idempotente, con reanudación (`CARP_IDX`). Luego Sync.gs lleva todo al panel.
- Lo único no verificado contra Drive real: conversión de Excel con `Drive.Files.copy` (v3). Si falla, el resultado lo anota por club.
- Archivos que el DT sube con su propia cuenta pueden quedar sin permiso de lectura para el panel (`Archivo privado`); reparar con `repararPermisosFotos` de Codigo.gs.

---

## 📌 **PLAN ACORDADO (pendiente): dos vías de entrada, una sola base**

1. **Vía automática:** formulario → Sheet → panel (Sync cada 5 min). Ya funciona.
2. **Vía manual desde PC (HECHA: `/admin/cargar`):** página admin "Cargar club": elegir club, subir Excel de nómina + fotos nombradas por cédula (`cédula.jpg`, `cédula CI Frente.jpg`, `cédula CI Reverso.jpg`) directo a la BD (sin pasar por Drive). Reutilizar `lib/importar*.ts` y `PlayerImage`. Subir fotos en lotes pequeños (límite 4.5 MB por request en Vercel Hobby), redimensionar en el navegador.
3. **Base maestra (por construir):** página admin con TODOS los jugadores (ambas vías), filtros y botón Descargar Excel; opcional: llenar un Sheet desde el panel.
4. **Reglas:** la cédula es clave única; las fotos subidas desde PC mandan sobre enlaces del Sheet (verificar que Sync no las pise); sin carpetas públicas de Drive.
5. Después: carnet digital con QR, NIX (fixture, resultados, tabla).
Pregunta abierta al usuario: cuántos clubes tiene en su PC y en qué formato (¿fotos nombradas por cédula?).

---

## 🎟️ **SORTEO (rifa de boletos)**

- Público: `public/keeper-cup-sorteo.html` (QR) → `POST /api/sorteo/registrar`. Obligatorio marcar que sigue IG/TikTok (no verificable por API; se verifica al cobrar). Boletos impresos 0001–6000 en dos colores (negro primero, luego rojo): la clave única es **color + número**.
- Premios instantáneos: admin carga números ganadores por premio (semanal/mensual) pegando lista o al azar; se revisan en el servidor al registrar. Al ganar: código de cobro de un solo uso + imagen descargable; el premio se entrega contra el boleto físico.
- Gran sorteo (final): tómbola en `/admin/sorteo` (el servidor elige entre boletos registrados que no han ganado). Ganadores no repiten.
- Panel: `/admin/sorteo` (solo admin): configuración (colores activos, rango, enlaces IG/TikTok), premios y números, cobrar, tómbola, export CSV.
- Correo con código: opcional con env `RESEND_API_KEY` (+ `SORTEO_FROM`); sin eso, el código solo se muestra en pantalla.
- Pendiente: poner en el panel los enlaces reales de IG/TikTok; dominio verificado en Resend para enviar correos; `public/sorteo-demo.html` es solo demo.
- Reglas vigentes: máx. **4 boletos por semana** por teléfono y por dispositivo (configurable en el panel; semana lunes-domingo hora Ecuador); varios números en un solo registro; teléfono y club obligatorios. **Cobro: boleto físico + código + teléfono de registro** (el panel exige verificar los 3). Quien registre números ajenos se bloquea todo el torneo (panel: "Teléfonos bloqueados"; al bloquear se liberan sus números y un premio no entregado vuelve a quedar pendiente).
- **Rango semanal:** el admin define en Configuración qué boletos participan esa semana (ej. 0001–0800); fuera de ese rango no se puede registrar y los números al azar se eligen dentro de él. Cambiarlo cada semana.

- **Cargar club desde PC (`/admin/cargar`)**: elegir club (o nuevo) → subir Excel de nómina (hoja Nómina; salta la fila de ejemplo) con revisión previa → subir fotos nombradas por cédula (el navegador las reduce; se guardan en `PlayerImage` con `sourceId='manual'`, que manda sobre los enlaces de Drive del Sheet). Pendiente: Base maestra (listado único con descarga Excel).

---

## ⚽ **MÓDULO TORNEO (configurable)**

- Modelo: `Torneo` → `Fase` (grupos | eliminatoria; criterios de ubicación ordenables) → `Grupo` → `GrupoEquipo` (+ `posManual`) → `Partido` → `Evento` (gol, gol_penal, autogol, amarilla, doble_amarilla, roja). Tablas, goleadores y sanciones se **calculan al vuelo** (`lib/torneo.ts`, pruebas en `lib/torneo.test.ts`, `npx tsx lib/torneo.test.ts`); `lib/torneo-data.ts` carga y arma todo.
- Panel: `/admin/torneo` (admin crea fases/grupos/equipos/fixture, edita partidos; vocal solo ve) y `/admin/torneo/partido/[id]` (planilla: goles y tarjetas por jugador; vocal permitido; jugador suspendido bloqueado salvo admin con confirmación). Público: `/torneo` (fixture, tablas, goleadores, sanciones; sin datos personales) vía `/api/torneo/publico`.
- Keeper Cup 3: 4 grupos de 8; pasan 1°–4° a Copa Oro y 5°–8° a Copa Plata ("Traer clasificados" por posiciones). Puntos 3-1-0. Sanción: 3 amarillas acumuladas = 1 partido (doble amarilla 1, roja directa 2; configurables en Reglas).
- PENDIENTE: criterios de ubicación oficiales (el usuario los tiene definidos; default puntos, dg, gf, h2h), generador de cruces eliminatorios, planilla imprimible, Excel/PDF.

---

## 🪪 **MÓDULO CARNETS**

- Cada jugador tiene `qrToken` secreto (se crea al importar o al habilitar). El QR del carnet es `https://keeper.com.ec/j/<qrToken>` (env `NEXT_PUBLIC_SITE_URL` para cambiar la base). Generar QR no tiene costo (librería `qrcode`).
- Público `/j/[token]`: carnet digital (foto, nombre, número, club, estado: habilitado verde / pendiente amarillo / suspendido rojo, también por tarjetas). Con sesión admin/vocal muestra además "Control" (amarillas, rojas, suspensión). Nunca expone cédula, correo ni teléfono. API: `/api/carnet/[token]` y `/api/carnet/[token]/foto`.
- Admin `/admin/carnets`: auspiciantes (4 logos, tabla `Ajuste` claves `aus_1..4`), escudo por club (`Team.logo` PNG base64; sin escudo sale con iniciales), habilitar jugadores (en bloque a los que tienen foto y cédulas) y **PDF A4** por club (`lib/carnet.ts`, pdf-lib): 9 carnets 54×85,6 mm por hoja; tras cada hoja de frentes va su hoja de dorsos con columnas espejadas (doble cara, voltear por el lado largo). Solo jugadores `habilitado` salvo selección manual.
- Pendiente: quitar fondo de fotos (modelo gratuito en el navegador + pantalla de revisión), modo iPad de verificación en cancha, regenerar QR de un jugador, subir escudos desde Cargar club.

### Carnet con plantilla de Illustrator (vigente)
- Arte: `public/plantillas/carnet-26.pdf` (PDF vectorial del usuario, frente y dorso vacíos; tarjeta 55,03 × 85,00 mm). `lib/carnet.ts` lo incrusta como fondo y pone encima solo lo variable: foto (recortada al marco redondeado), escudo PNG sin fondo (`Team.logo`), nombres/apellidos/cédula/fecha de nacimiento, número rojo, franja con la **primera palabra del club**, QR vectorial y, en el dorso, "Nombre Apellido - Número" (el dorso trae un nombre de ejemplo en la plantilla: se tapa con un rectángulo gris `#7b7979`).
- Hoja A4: 9 carnets (3×3) con **2 mm** entre ellos; hoja de dorsos con columnas espejadas (doble cara, voltear por el lado largo). Colores en RGB (impresora CMYK casera).
- Medidas editables en `/admin/carnets/diseno` (guardadas en `Ajuste` clave `carnet_layout`; vista previa con jugador ficticio). Fuentes gratuitas en `public/fonts/` (Roboto Condensed y Barlow Condensed ExtraBold) como sustitutas de Acumin Variable Concept y FB Rush del diseño original; si el usuario entrega los archivos TTF/OTF originales, reemplazarlos.
- Escudos: PNG sin fondo por club; carga en lote en `/admin/carnets` nombrando cada archivo como el club.
- Pendiente: que la página pública `/j/[token]` copie este diseño; quitar fondo de fotos (el usuario dijo que el fondo no importa por ahora).

### Encuadre automático de fotos (carnets)
- `/admin/encuadre`: detecta el rostro en el navegador (MediaPipe BlazeFace, gratuito; modelo en `public/mediapipe/`, wasm autoalojado en `public/mediapipe/wasm`) y calcula el recorte con `lib/encuadre.ts` (calibrado con el carnet de referencia aprobado: cara = 46 % de la altura del marco, ojos a 46 % desde arriba, centrada). Pruebas: `npx tsx lib/encuadre.test.ts`.
- Se guarda en `PlayerImage` (selfie): `crop` (fracciones 0..1), `cropEstado` (auto | revisar | manual | otra_foto), `cropMotivo`. La foto original no se toca. Al reemplazar la selfie, el encuadre se borra. El PDF de carnets usa el recorte si existe (si no, recorte por atención).
- Se marcan a revisar: sin rostro, más de una persona, rostro cortado, cabeza pegada al borde, resolución baja (< 240 px de ancho útil). En la pantalla se puede aceptar, ajustar (mover/acercar) o marcar "pedir otra foto".
- Pendiente: ejecutarlo automáticamente al subir fotos desde Cargar club; subir el tope de 800 px de las selfies nuevas si hay muchas fotos lejanas.

### Corrección manual de jugadores (Carnets → ✏️ Editar)
- `/admin/carnets`: botón Editar por jugador (nombres, apellidos, cédula, número, fecha de nacimiento, posición, correo, teléfono, estado y "generar QR nuevo"). API `PATCH /api/admin/carnets/jugador` (solo admin). Valida cédula de 10 dígitos (avisa si no pasa la validación oficial), cédula y número únicos, fecha válida.
- **El panel manda sobre la hoja:** al editar se marca `Player.editadoManual = true`; la sincronización (`lib/importar-db.ts`) ya no pisa sus datos (solo acepta enlaces de fotos). Si se cambia la cédula, la anterior queda en `PlayerAlias` para que la sync no cree un duplicado con la cédula errónea. Los cambios NO se escriben de vuelta en la Hoja de Google.
- Regenerar el QR invalida el carnet impreso anterior (`/j/<token viejo>` responde 404).

---

## 📋 **PENDIENTE (NO OLVIDAR): PLANILLA DE JUEGO EN VIVO**
Pedido del usuario (2026-10): una **hoja en vivo como planilla de juego** para usar desde **iPad o celular** durante el partido, que reemplace la casilla "jugó":
- Registrar la **alineación**: titulares y suplentes de cada equipo (con número y posición).
- Registrar **cambios** (quién sale y quién entra) **con el minuto**.
- Registrar **goles, tarjetas y sanciones al minuto**, en tiempo real.
- De ahí salen solos: **partidos jugados**, minutos, quién fue reemplazado, goles recibidos y vallas invictas de porteros, mejores porteros, y el marcador/tabla en vivo.
- Hoy el módulo de torneo (`/admin/torneo/partido/[id]`) solo registra goles y tarjetas (eventos `gol, gol_penal, autogol, amarilla, doble_amarilla, roja`). Extender `Evento` con `titular`, `entra`, `sale` (con minuto) y mostrar "Partidos jugados" en la ficha del carnet cuando haya alineaciones (`lib/ficha.ts` ya cuenta `titular`/`entra` si existen).
- Hasta entonces la ficha NO muestra "partidos jugados" ni datos de porteros (para no mostrar cifras incorrectas).

## 🪪 **FICHA DEPORTIVA (carnet digital /j/[token])**
- Ver `lib/ficha.ts`. Público: carnet con el mismo arte del impreso, estado, edad, posición, goles/penales, amarillas/rojas con barra hacia la suspensión, suspensión actual y cumplidas, próximo partido, últimos resultados, tabla del grupo, historial al minuto, insignias (goleador top, sin tarjetas). Árbitro/vocal con sesión: panel de control (fecha de nacimiento, documentos ✔/✖, sanción). Admin: cédula completa y "Ver documentos" (foto de la cédula solo tras tocar el botón, con marca de agua, cierre automático y registro en `AccesoDocumento`). Sesión de personal se cierra sola tras 5 min sin uso en esta página.

---

## 🪪 ENCUADRE DE CÉDULAS (frente y reverso)

- Panel: `/admin/cedulas` (botón en Carnets). OpenCV.js autoalojado en `public/opencv/opencv.js` (~10 MB, solo se descarga al usarlo).
- Detecta la cédula (tarjeta ID-1, proporción 1,586) y la gira/recorta SIN deformar (la corrección de perspectiva deformaba) dejando una imagen horizontal de 1200 px. Cortador rápido ✂ Recortar: marco de proporción fija, arrastrar, rueda = zoom, esquinas = tamaño, deslizador de inclinación, Enter = guardar y siguiente (`lib/cedula.ts`). Frente: si el retrato queda abajo la gira 180°; reverso con rostro → "¿invertidos?".
- La foto original del jugador se conserva en `PlayerImage.original`; `data` pasa a ser la versión enderezada (la que ve el admin en la ficha). "Volver al original" la restaura.
- Estados (`cropEstado`): auto / revisar / manual / otra_foto. Dudosas (no se halló, muy pequeña, borrosa, forma rara) van a la cola "A revisar" con edición de 4 esquinas arrastrables.
- "Probar con 20 jugadores" para calibrar antes de procesar todo. Si el jugador sube otra foto, se reinicia el estado y el original.
- Pendiente: ejecutar automáticamente al subir desde Cargar club / registro.
