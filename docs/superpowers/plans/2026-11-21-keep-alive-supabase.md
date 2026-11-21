# Keep-alive de Supabase — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el proyecto Supabase gratuito de cada negocio no se pause: Vercel Cron diario escribe un latido en la base y Configuración lo muestra.

**Architecture:** `vercel.json` programa un `GET /api/keep-alive` diario. La ruta llama al RPC `wm.keep_alive()` con el cliente admin; el RPC escribe en `wm.heartbeat` como máximo una vez por hora. Las reglas puras (autorización y estado del latido) viven en `lib/keep-alive.ts` con tests de vitest; Configuración → Empresa lee `wm.heartbeat` y pinta el estado.

**Tech Stack:** Next.js 16 Route Handler, Supabase (`createAdminClient`), Postgres (plpgsql), vitest, Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-11-21-keep-alive-supabase-design.md`

## Global Constraints

- Intervalo mínimo entre escrituras: **1 hora** (`interval '1 hour'`).
- Cron: `"0 9 * * *"` (diario, 09:00 UTC), ruta `/api/keep-alive`.
- Umbral de aviso del indicador: **más de 3 días** sin latido.
- `CRON_SECRET` opcional: si está definida (no vacía), se exige `Authorization: Bearer <CRON_SECRET>`; si no, la ruta queda abierta.
- La ruta responde sólo `{ ok: boolean, lastBeatAt: string | null }`; nunca detalles de error.
- `execute` de `wm.keep_alive()` sólo para `service_role`; `wm.heartbeat` sólo se lee (miembros activos).
- SQL idempotente (re-ejecutable), estilo de `supabase/daily_closures.sql`.
- Textos de UI en español (es-VE). Nada de credenciales en el repo.

## Review Focus

- `CRON_SECRET` definida pero vacía o con espacios → se trata como no definida (ruta abierta), no como «todo rechazado». Test en Task 2.
- Header `Authorization` con el secreto correcto pero sin `Bearer `, o con otro secreto de igual largo → 401. Test en Task 2.
- Negocio desplegado sin aplicar `keep_alive.sql` (tabla/RPC inexistentes) → la ruta responde 500 `{ ok: false }` sin filtrar el error, y Configuración no muestra la línea ni se rompe. Verificación en Tasks 3 y 4.
- Fila `id = 1` borrada a mano → `wm.keep_alive()` la recrea en vez de devolver `null` para siempre. Test en Task 1.
- Latido justo en el umbral (exactamente 3 días) → todavía «ok»; sólo «stale» si es **más** de 3 días. Test en Task 2.

---

### Task 1: Tabla `wm.heartbeat` y RPC `wm.keep_alive()`

**Files:**
- Create: `supabase/keep_alive.sql`
- Create: `supabase/tests/keep_alive_rollback.sql`
- Modify: `supabase/bootstrap/01_schema.sql` (añadir `\ir ../keep_alive.sql` justo antes de `notify pgrst, 'reload schema';`)
- Modify: `supabase/apply_pending.sh` (paso nuevo `run supabase/keep_alive.sql` antes del bloque `ANALYZE`)
- Modify: `lib/database.types.ts` (tipo `Heartbeat`, `heartbeat: Tbl<Heartbeat>` en Tables, `keep_alive` en Functions)
- Modify: conteo esperado de tablas **45 → 46** en `docs/NUEVO-NEGOCIO.md`, `.claude/commands/nuevo-negocio.md`, `supabase/bootstrap/README.md`

**Interfaces:**
- Produces: tabla `wm.heartbeat (id smallint pk = 1, last_beat_at timestamptz null, beats bigint not null default 0)`; función `wm.keep_alive() returns timestamptz` (devuelve el `last_beat_at` vigente); tipos TS `Heartbeat = { id: number; last_beat_at: string | null; beats: number }` y `Functions.keep_alive: { Args: Record<string, never>; Returns: string | null }`.

- [ ] **Step 1: Escribir el test SQL** `supabase/tests/keep_alive_rollback.sql` (patrón de `catalog_taxonomy_rollback.sql`: `begin; … rollback;`, `\set ON_ERROR_STOP 1`). Dentro: `\ir ../keep_alive.sql`; luego aserciones con `do $$ … raise exception … $$`:
  - dos llamadas seguidas a `wm.keep_alive()` → `beats = 1` y ambas devuelven el mismo valor no nulo;
  - `update wm.heartbeat set last_beat_at = now() - interval '2 hours'` y otra llamada → `beats = 2`;
  - `delete from wm.heartbeat` y otra llamada → devuelve no nulo y existe la fila `id = 1`;
  - `has_function_privilege('anon', 'wm.keep_alive()', 'execute')` y el de `authenticated` → `false`; el de `service_role` → `true`;
  - `has_table_privilege('authenticated', 'wm.heartbeat', 'insert')` → `false`.
- [ ] **Step 2: Correrlo contra «Tienda de Pruebas» y verlo fallar** (aún no existe el archivo):
  `PGHOST=aws-0-us-west-2.pooler.supabase.com PGPORT=5432 PGUSER=postgres.hgsfxeuvsufithhrqpak PGDATABASE=postgres PGPASSWORD=<de .env.cliente-pruebas> psql -X -f supabase/tests/keep_alive_rollback.sql`
  Expected: error `could not open file … keep_alive.sql`. **Nunca contra producción.**
- [ ] **Step 3: Escribir `supabase/keep_alive.sql`**: `create table if not exists`, fila inicial `on conflict do nothing`, RLS con policy `heartbeat_select` (`for select to authenticated using (wm.is_member())`, `drop policy if exists` antes), `revoke all … from anon, authenticated` + `grant select … to authenticated`. Función `security definer`, `set search_path = wm, public`, cuerpo:
  ```sql
  insert into wm.heartbeat as h (id, last_beat_at, beats) values (1, now(), 1)
  on conflict (id) do update set last_beat_at = now(), beats = h.beats + 1
   where h.last_beat_at is null or h.last_beat_at < now() - interval '1 hour';
  return (select last_beat_at from wm.heartbeat where id = 1);
  ```
  `revoke all on function wm.keep_alive() from public, anon, authenticated; grant execute … to service_role;`
  Terminar con `notify pgrst, 'reload schema';` para que la API vea el RPC sin reiniciar.
- [ ] **Step 4: Correr el test** (mismo comando). Expected: termina con `ROLLBACK`, sin `ERROR`.
- [ ] **Step 5: Plegar** en `01_schema.sql` y `apply_pending.sh`; añadir los tipos; cambiar 45 → 46 en los tres docs. Run: `npx tsc --noEmit -p .` → sin errores.
- [ ] **Step 6: Aplicar de verdad a «Tienda de Pruebas»**: `psql -X -v ON_ERROR_STOP=1 -f supabase/keep_alive.sql` (mismas variables). Expected: sin `ERROR`; `select count(*) from pg_tables where schemaname='wm'` → 46.
- [ ] **Step 7: Commit**
  ```bash
  git add supabase/keep_alive.sql supabase/tests/keep_alive_rollback.sql supabase/bootstrap/01_schema.sql supabase/apply_pending.sh lib/database.types.ts docs/NUEVO-NEGOCIO.md .claude/commands/nuevo-negocio.md supabase/bootstrap/README.md
  git commit -m "feat(keep-alive): tabla wm.heartbeat y RPC wm.keep_alive()"
  ```

### Task 2: Reglas puras en `lib/keep-alive.ts`

**Files:**
- Create: `lib/keep-alive.ts`
- Test: `lib/keep-alive.test.ts`

**Interfaces:**
- Produces:
  - `isKeepAliveAuthorized(authorization: string | null, secret: string | undefined): boolean`
  - `heartbeatStatus(lastBeatAt: string | null, now?: number): "ok" | "stale" | "never"`
  - `export const STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000`

- [ ] **Step 1: Escribir los tests** en `lib/keep-alive.test.ts`:
  - `isKeepAliveAuthorized(null, undefined)` → `true`; `(null, "")` → `true`; `(null, "   ")` → `true`.
  - `("Bearer s3cr3t", "s3cr3t")` → `true`; `(null, "s3cr3t")` → `false`; `("s3cr3t", "s3cr3t")` → `false`; `("Bearer s3cr3x", "s3cr3t")` → `false`; `("Bearer s3cr3t-extra", "s3cr3t")` → `false`.
  - `heartbeatStatus(null)` → `"never"`.
  - con `now = Date.parse("2026-11-21T12:00:00Z")`: hace 1 h → `"ok"`; exactamente 3 días → `"ok"`; 3 días + 1 min → `"stale"`.
- [ ] **Step 2: Run** `npx vitest run lib/keep-alive.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** en `lib/keep-alive.ts`. El secreto se trata con `trim()`; vacío ⇒ abierto. La comparación del token usa `timingSafeEqual` de `node:crypto` sobre `Buffer`s, devolviendo `false` antes si los largos difieren.
- [ ] **Step 4: Run** `npx vitest run lib/keep-alive.test.ts` → PASS.
- [ ] **Step 5: Commit** `git add lib/keep-alive.ts lib/keep-alive.test.ts && git commit -m "feat(keep-alive): reglas de autorización y estado del latido"`

### Task 3: Ruta `/api/keep-alive` y cron de Vercel

**Files:**
- Create: `app/api/keep-alive/route.ts`
- Create: `vercel.json`
- Modify: `lib/supabase/middleware.ts:13` (añadir `"/api/keep-alive"` a `PUBLIC_PATHS`)
- Modify: `scripts/dev-cliente.sh` (exportar `CRON_SECRET="$(value CRON_SECRET)"` junto a los de Resend, para no heredar el de `.env.local`)
- Modify: `docs/NUEVO-NEGOCIO.md` (§6: qué hace el keep-alive, `CRON_SECRET` opcional en Vercel, cómo comprobarlo en Vercel → Settings → Cron Jobs y en Configuración → Empresa; recordar que corre sólo en producción y que un proyecto ya pausado se restaura a mano)

**Interfaces:**
- Consumes: `isKeepAliveAuthorized` (Task 2), RPC `keep_alive` (Task 1), `createAdminClient()` de `lib/supabase/admin.ts`.
- Produces: `GET /api/keep-alive` → `200 { ok: true, lastBeatAt }` | `401 { ok: false, lastBeatAt: null }` | `500 { ok: false, lastBeatAt: null }`, siempre con `cache-control: no-store`.

- [ ] **Step 1: Implementar la ruta**: `export const runtime = "nodejs"`, `dynamic = "force-dynamic"`. Orden: autorización (`request.headers.get("authorization")`, `process.env.CRON_SECRET`) → 401; `createAdminClient()` dentro de `try` (lanza si falta la llave) y `rpc("keep_alive")` → error o excepción ⇒ `console.error` con un mensaje fijo y 500; éxito ⇒ 200.
- [ ] **Step 2: `vercel.json`**: `{ "crons": [{ "path": "/api/keep-alive", "schedule": "0 9 * * *" }] }`; añadir la ruta a `PUBLIC_PATHS`; el cambio en `dev-cliente.sh`.
- [ ] **Step 3: Verificar contra «Tienda de Pruebas»**: `scripts/dev-cliente.sh .env.cliente-pruebas 3200` (en segundo plano) y:
  - `curl -s localhost:3200/api/keep-alive` dos veces → ambas `{"ok":true,"lastBeatAt":"…"}` con el **mismo** valor; en la base `beats` subió sólo 1.
  - Añadir `CRON_SECRET=prueba` al archivo y reiniciar el script (lo lee del archivo, no del entorno): sin header → 401; con `-H "Authorization: Bearer prueba"` → 200. Quitar la línea al terminar.
  - Caso «negocio sin migrar»: en una transacción de psql que **no** se confirma no se puede probar vía HTTP, así que se simula renombrando la función: `alter function wm.keep_alive() rename to keep_alive_tmp;` → `curl` → `500 {"ok":false,"lastBeatAt":null}` sin texto del error en la respuesta → `alter function wm.keep_alive_tmp() rename to keep_alive; notify pgrst, 'reload schema';` y `curl` → 200 otra vez (cada rename va seguido de `notify pgrst, 'reload schema'`). (Sólo en «Tienda de Pruebas».)
- [ ] **Step 4: Run** `npx eslint app/api/keep-alive lib/supabase/middleware.ts && npx tsc --noEmit -p . && npx vitest run` → todo en verde.
- [ ] **Step 5: Commit** `git add app/api/keep-alive vercel.json lib/supabase/middleware.ts scripts/dev-cliente.sh docs/NUEVO-NEGOCIO.md && git commit -m "feat(keep-alive): ruta /api/keep-alive y cron diario de Vercel"`

### Task 4: Indicador en Configuración → Empresa

**Files:**
- Modify: `app/(app)/configuracion/page.tsx` (leer `heartbeat` en el `Promise.all`)
- Modify: `components/configuracion/configuracion-view.tsx` (prop nueva y línea de estado en `EmpresaSection`)
- Modify: `CLAUDE.md` (convención «Keep-alive» y `heartbeat` en la lista de tablas), `docs/PROGRESS.md` (fila nueva)

**Interfaces:**
- Consumes: `heartbeatStatus`, `fmtRelative` (`lib/format.ts`), tabla `heartbeat`.
- Produces: prop `heartbeat: { lastBeatAt: string | null } | null` en `ConfiguracionView` (`null` = la consulta falló: tabla sin migrar).

- [ ] **Step 1: Página**: `supabase.from("heartbeat").select("last_beat_at").eq("id", 1).maybeSingle()`; si `error` ⇒ `heartbeat = null`, si no ⇒ `{ lastBeatAt: data?.last_beat_at ?? null }`.
- [ ] **Step 2: Vista**: en `EmpresaSection`, debajo de la tarjeta «Información de la empresa», una fila (no se pinta si `heartbeat === null`) con estos textos exactos según `heartbeatStatus`:
  - `ok`: «Base de datos activa · último latido {fmtRelative(lastBeatAt)}» (`text-success`)
  - `stale`: «Sin latido desde {fmtRelative(lastBeatAt)} · revisa el cron en Vercel (Settings → Cron Jobs)» (`text-warning`, fondo `bg-warning-soft`)
  - `never`: «Aún no hay latido · se registra una vez al día desde Vercel» (`text-text-3`)
- [ ] **Step 3: Run** `npx eslint "app/(app)/configuracion" components/configuracion && npx tsc --noEmit -p . && npx vitest run` → verde.
- [ ] **Step 4: Verificar en el navegador** con `scripts/dev-cliente.sh .env.cliente-pruebas`: el usuario entra a Configuración → Empresa y ve «Base de datos activa · último latido hace …».
- [ ] **Step 5: Docs** en `CLAUDE.md` y `docs/PROGRESS.md`.
- [ ] **Step 6: Commit** `git add "app/(app)/configuracion/page.tsx" components/configuracion/configuracion-view.tsx CLAUDE.md docs/PROGRESS.md && git commit -m "feat(keep-alive): indicador de último latido en Configuración"`

## Despliegue (después de las tareas)

1. Aplicar `supabase/keep_alive.sql` a **producción WM** con `scripts/catalogo/psql.sh -X -v ON_ERROR_STOP=1 -f supabase/keep_alive.sql` **antes** de desplegar (si no, la ruta da 500 hasta aplicarlo).
2. Push a `main` → Vercel despliega y registra el cron (visible en Vercel → Settings → Cron Jobs).
3. Opcional: `CRON_SECRET` en las variables de cada proyecto Vercel.
