# NiX — Plan del producto y decisiones

> Documento de referencia para continuar en otros chats. Resume qué es el sistema, cómo funciona, las decisiones
> tomadas para venderlo como **NiX** y lo que queda pendiente. Última actualización: 26 de noviembre de 2026.

---

## 1. Qué es el sistema

Una **aplicación web de gestión de torneos de fútbol**, hecha a la medida de la Keeper Cup 3 (KC3). Se usa desde el
navegador del teléfono o la PC, sin instalar nada.

| Pieza | Qué es | Dónde está |
|---|---|---|
| Página pública | Resultados, fixture, tablas, goleadores, fair play, estadísticas, sanciones, ficha del QR | keeper.com.ec / /torneo |
| Panel de administración | Todo lo que cambia datos (usuarios admin y vocal) | keeper.com.ec/admin |
| Servidor | Revisa la sesión y aplica las reglas del torneo | Vercel |
| Base de datos | Clubes, jugadores, fotos, partidos, eventos, pagos | Railway (PostgreSQL) |
| Código | Next.js 14 + Prisma; cada cambio en `main` se publica solo | GitHub `dmaflaf/Keepercup3` |
| Formularios de inscripción | Guardan en la Hoja de Google; una sincronización (Apps Script) pasa los datos cada 5 min | Google |
| Herramienta del sorteo | Sorteo de horarios de la Fase 2 | GitHub Pages `dmaflaf/appskc3` (debe seguir público) |

### Módulos que ya funcionan
- **Clubes y jugadores:** nóminas, fotos (con encuadre), cédulas, números, traspasos (límite por torneo), carnets con QR,
  alta y baja de jugadores con clave de admin, cierre de inscripciones con autorización por club (`/admin/inscripciones`).
- **Torneo:** fases (grupos o eliminatoria), grupos, fixture, numeración de fechas continua entre fases, sorteo de la
  Fase 2, «Adicionar fase» y «Subir JSON» en Programación.
- **Programación:** casillas por estadio, día y hora, días y horas por fecha, diferidos y adelantados, imagen del horario.
- **Partidos:** planilla en vivo (funciona sin señal), alineaciones, cambios, goles, tarjetas, penales, editar partido
  cerrado, **suspender partido** (fallo de mesa / reanudar / jugar de nuevo), sanción adicional en rojas.
- **Resultados:** tablas por fase, goleadores, fair play, estadísticas, página en vivo, Resultados y Fixture por fase y fecha.
- **Disciplina (reglas KC3):** 3 amarillas = 1 fecha; doble amarilla = 1; roja directa = 2 (+ sanción adicional);
  Art. 50: al cambiar de fase de grupos, las amarillas sueltas se anulan y **la suspensión por 3 amarillas no cumplida
  en la Fase 1 se anula**; las de doble amarilla y roja **sí pasan** a la Fase 2. Las tarjetas de un partido suspendido
  cuentan; ese partido no sirve para cumplir. Multas y estadísticas cuentan todas las tarjetas.
- **Finanzas:** inscripción ($125) y garantía ($45) por defecto, carnets ($0,50 por habilitado), multas automáticas
  ($1 amarilla / $2 roja), pagos con comprobante y fecha, exoneraciones (cargo de $0 con motivo, ej. garantía),
  reportes PDF por club (con la fecha de cada tarjeta).
- **Control:** auditoría de goleadores (`/admin/auditoria-goles`), cargas masivas con «simular → aplicar → deshacer»,
  aviso de seguridad y lista de administradores en el panel.

---

## 2. Decisión: cómo venderlo (NiX)

### Ahora (2 a 7 ligas): un solo código, una instalación por liga
```
                        ┌→ Vercel KC3          → Railway KC3          → keeper.com.ec
Repositorio NiX (uno) ──┼→ Vercel San Miguel   → Railway San Miguel   → dominio de San Miguel
                        └→ Vercel San Antonio  → Railway San Antonio  → dominio de San Antonio
```
- Cada liga con **su propia base de datos**: separación total, nunca ven la KC3 ni entre ellas.
- **Un solo repositorio**: una corrección se publica en todas a la vez. **No** hacer un repositorio por liga.
- Personalización **solo por configuración** (nombre, logo, colores, precios, estadios, horarios, reglamento, plantilla
  del carnet). Nada de código aparte para una liga; si una pide algo útil, se agrega como opción para todas.
- Una **instalación demo** con datos ficticios para mostrar a clientes y probar cambios antes de publicarlos.

### Después (8 a 10 ligas o más): plataforma única `nix.com.ec`
- Cada liga entra con su usuario y ve solo lo suyo (`sanmiguel.nix.com.ec`). Tú apruebas las ligas nuevas.
- Niveles: **dueño de la plataforma** (tú) → **administrador de liga** → **vocal** → **público**.
- La separación de datos debe ser **automática y central** (por ejemplo, regla de la base de datos), con pruebas que
  intenten espiar otra liga y fallen siempre. Fotos en almacenamiento aparte (R2/S3).
- Se construye **a partir de este código**, en un proyecto aparte, sin tocar la KC3. La KC3 se muda al cerrar su temporada.

---

## 3. Precios de referencia

| Costo por liga | Valor aproximado |
|---|---|
| Railway (base de datos) | USD 5 – 10 al mes |
| Vercel **Pro** (obligatorio para uso comercial; uno para todas) | USD 20 al mes en total |
| Dominio propio (opcional) | USD 12 al año |
| Tiempo de configuración, capacitación y soporte | Lo más caro: cobrarlo |

| Concepto | Precio sugerido |
|---|---|
| Instalación (una vez): configuración, carga de clubes y jugadores, usuarios, capacitación | USD 150 – 250 |
| Por torneo: página pública, planilla en vivo, tablas, sanciones, finanzas, reportes, soporte | USD 6 – 10 por equipo |
| Carnets digitales con QR | USD 0,50 – 1 por jugador |
| Extras (afiches, reportes especiales, cargas desde Excel) | Por pedido |

- **No darlo gratis.** Piloto con descuento (ej. instalación USD 100 y primer torneo a USD 5 por equipo) a cambio de
  referencia y opinión. Del segundo torneo en adelante, precio normal.
- Confirmar los precios actuales de Vercel y Railway antes de cotizar.

---

## 4. Contrato con cada liga (1–2 hojas)
- Qué incluye y qué no; pago **por adelantado** al inicio de cada torneo.
- Soporte: horario y canal; un solo administrador por liga como contacto.
- La liga carga sus datos y es **responsable** de ellos; tú eres el **encargado** del tratamiento
  (Ley Orgánica de Protección de Datos Personales del Ecuador: cédulas, fotos, posibles menores de edad).
- El sistema es de NiX: la liga lo usa, no lo compra. Si deja de pagar, se pausa la página y se le entregan sus datos.
- Revisar en el SENADI el registro de la marca **NiX**.

---

## 5. Pasos para arrancar con Liga San Miguel y Liga San Antonio
1. Cerrar la seguridad pendiente de la KC3 (sección 6).
2. Preparar NiX: convertir «Keeper Cup» en configuración (hoy está escrito en unos 28 archivos) y quitar lo exclusivo de
   la KC3 (cargas del Excel de goles y alineaciones de las Fechas 1–5, sorteo E9C9RI). La KC3 queda igual. ~2–3 días.
3. Montar la instalación **demo**.
4. Mostrar la demo, acordar precio y firmar.
5. Por cada liga (~1 día): base de datos en Railway, proyecto en Vercel apuntando al repositorio NiX, configuración,
   dominio, `JWT_SECRET` propia y distinta, su administrador y tu usuario de soporte.
6. La liga carga su torneo y arranca. Capacitación de 1–2 horas a su administrador y vocales.

---

## 6. Seguridad (revisión del 26/11/2026)

### Corregido (commit `b6932c7`)
- `/api/auth/create-admin` creaba un **administrador sin iniciar sesión**: desactivada.
- `/api/teams/register` (antigua) creaba clubes y jugadores sin control: desactivada.
- Inicio de sesión: límite de intentos (10 por IP y 30 por correo cada 15 min); el token ya no se devuelve ni se guarda en el navegador.
- Las acciones del panel se rechazan si vienen de otro sitio web.
- Panel: aviso si falta o es débil `JWT_SECRET` y lista de administradores.

### Pendiente (lo hace el dueño)
- [ ] Revisar en el panel «🔐 Administradores del sistema» que todos sean propios; desactivar los desconocidos y cambiar la clave.
- [ ] Confirmar `JWT_SECRET` en Vercel (texto al azar de 40+ caracteres). Si el panel muestra el aviso rojo, crearla y volver a publicar.
- [ ] Poner **Keepercup3 en privado** (GitHub → Settings → Danger Zone). Vercel sigue funcionando. `appskc3` debe seguir público por GitHub Pages.
- [ ] Revisar que la Hoja de Google con cédulas no esté compartida «con cualquiera que tenga el enlace».
- [ ] Descargar el respaldo del panel cada semana y antes de cargas grandes.
- [ ] Usar contraseñas distintas por vocal y desactivar sus cuentas al terminar el torneo.

### Riesgos conocidos (bajos)
- Las sesiones duran 7 días: para cerrarlas todas, cambiar `JWT_SECRET`.
- No hay registro de todas las acciones (sí de eliminaciones, traspasos y suspensiones).
- Lo que se copió mientras el repositorio fue público no se puede recuperar.

---

## 7. Cómo seguir trabajando con Claude
- **Un chat por tema:** «NiX – desarrollo» (cambios del sistema), «KC3 – soporte», uno por cada liga, y uno de asesoría.
- Los chats de trabajo se abren **sobre este repositorio**: leen `CLAUDE.md` y este documento al empezar.
- Claude no entra a las bases de datos de los clientes: las cargas se hacen con enlaces que abre el administrador
  (`?simular=1` → aplicar → `?deshacer=1`).
- Ningún cambio se publica sin pedirlo; con varias ligas, primero se prueba en la demo.
