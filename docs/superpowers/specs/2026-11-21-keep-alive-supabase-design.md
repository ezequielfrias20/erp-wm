# Keep-alive de Supabase por negocio — diseño corto

Fecha: 2026-11-21 · Tamaño: cambio chico

## Por qué

El ERP es multi-negocio: cada negocio tiene su propio proyecto Supabase, casi todos en el
**plan gratuito**, y su propio proyecto en Vercel administrado por Ezequiel. Supabase pausa un
proyecto gratuito tras **7 días sin actividad real en la base**, y una vez pausado nada lo
despierta solo: hay que restaurarlo a mano desde el panel. Un negocio que cierra unos días, o
una instancia poco usada, no debe encontrarse el ERP caído al volver.

## Objetivos

- Que ningún proyecto de un negocio desplegado se pause por inactividad.
- Que cada negocio nuevo lo traiga **sin pasos extra**: basta con desplegar el código.
- Poder ver, dentro del ERP, que el latido está funcionando.

## No-objetivos

- Respaldos de la base (el plan gratuito no los tiene): proyecto aparte, después.
- Despertar un proyecto **ya pausado** (no es posible por API; se restaura en el panel).
- Negocios sin app desplegada en Vercel (p. ej. instancias de prueba locales).

## Anti-objetivos

- Un endpoint público que permita escribir en la base sin control o filtrar datos.
- Depender de un servicio externo más o de una lista central de negocios que mantener a mano.

## Enfoques considerados

- **A. Cada app se mantiene despierta sola (elegido).** Vercel Cron diario → ruta propia →
  escritura real en la base. Va en el código, así que todo negocio nuevo lo trae. Contra: si
  falla, Vercel no avisa → se compensa con el indicador «último latido».
- **B. Vigilante central en GitHub Actions.** Avisa por correo si falla y es buen lugar para
  respaldos, pero exige registrar cada negocio y sus llaves en GitHub. Descartado por ahora.
- Monitores externos (UptimeRobot) y `pg_cron` dentro de la base: descartados (otro servicio
  por negocio; Supabase no confirma que la actividad interna cuente).

## Diseño

**Base de datos** — `supabase/keep_alive.sql` (idempotente):
- Tabla `wm.heartbeat` de una sola fila (`id = 1`, `last_beat_at timestamptz`, `beats bigint`).
  Lectura para miembros activos (`wm.is_member()`), como el resto del esquema; nadie escribe
  directo.
- Función `wm.keep_alive()` (`SECURITY DEFINER`, `search_path` fijo) que actualiza la fila
  **sólo si el último latido tiene más de 1 hora** y devuelve `last_beat_at`. Así es una
  escritura real (lo que mide Supabase) pero no se puede usar para martillar la base.
  `execute` sólo para `service_role`.
- Se pliega en `bootstrap/01_schema.sql` (vía `\ir`) y en `apply_pending.sh`.

**Ruta** — `app/api/keep-alive/route.ts` (`GET`, `nodejs`, `no-store`):
- Llama `wm.keep_alive()` con el cliente admin (`SUPABASE_SECRET_KEY`, ya obligatoria).
- Responde sólo `{ ok, lastBeatAt }`; ningún otro dato.
- Si existe la variable `CRON_SECRET`, exige `Authorization: Bearer <CRON_SECRET>` (es lo que
  envía Vercel Cron). Si no existe, funciona igual: es segura por diseño (escritura acotada a
  una por hora, sin datos). Así un negocio nuevo funciona sin configurar nada, y quien quiera
  cerrarla del todo agrega `CRON_SECRET` en Vercel.
- Se añade `/api/keep-alive` a las rutas públicas del proxy (el cron no trae sesión).

**Programación** — `vercel.json` con un cron diario (`0 9 * * *`, 09:00 UTC ≈ 05:00 en
Venezuela). Es la frecuencia máxima del plan Hobby y deja 6 días de margen frente a los 7.
Vercel Cron sólo corre en despliegues de **producción**.

**Indicador** — Configuración → **Empresa**: línea «Base de datos activa · último latido hace
X». Si pasan más de 3 días, aviso en color warning («revisa el cron en Vercel»); si nunca hubo
latido, lo dice.

**Documentación** — `docs/NUEVO-NEGOCIO.md` (qué es, `CRON_SECRET` opcional, cómo comprobarlo
en Vercel → Cron Jobs), `CLAUDE.md` y `lib/database.types.ts`.

## Verificación

- Test unitario de la regla de autorización de la ruta (con y sin `CRON_SECRET`).
- Contra «Tienda de Pruebas»: aplicar `keep_alive.sql`, llamar la ruta dos veces (la segunda no
  escribe), ver el indicador en Configuración.

## Decisiones mías (revisables)

- Ruta abierta cuando no hay `CRON_SECRET`, protegida por el límite de una escritura por hora.
- Indicador en la sección Empresa, umbral de aviso en 3 días.
- Horario 09:00 UTC.
