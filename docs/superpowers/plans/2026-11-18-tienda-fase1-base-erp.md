# Tienda online — Fase 1: base en el ERP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar en la base del ERP todo lo que la tienda y el módulo «Pedidos online» necesitan: pedidos online con apartados de stock, funciones del personal, `create_sale` que respeta apartados y convierte pedidos, esquema público `shop` con rol `storefront`, función `shop.crear_solicitud`, bucket de fotos sin listado público, y POS/Inventario mostrando lo apartado.

**Architecture:** Todo el estado vive en `wm` y se escribe solo por funciones `SECURITY DEFINER` (sin políticas de escritura directa). La tienda solo ve el esquema `shop` (vistas propiedad de `postgres` + una función) con el rol `storefront`, que no tiene ningún permiso sobre `wm`. Los apartados se **derivan** de las líneas de pedidos vigentes (`expires_at > now()`), así que vencen solos sin tareas programadas.

**Tech Stack:** Postgres (Supabase, esquema `wm`), SQL idempotente aplicado con `psql`, pruebas SQL con `ROLLBACK`, Next.js 16 / React 19 / TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-ecommerce-catalogo-pedidos-online-design.md`
**Contrato para la tienda (se mantiene en sync en cada tarea):** `docs/TIENDA-INTEGRACION.md`

**Fuera de este plan:** Plan 2 = módulo «Pedidos online» en el ERP (pantallas, WhatsApp, convertir en venta desde el POS, configuración). Plan 3 = la tienda (repo aparte), guiada por `docs/TIENDA-INTEGRACION.md`.

## Global Constraints

- Todo SQL nuevo es **idempotente** (`create … if not exists`, `create or replace`, `drop … if exists` antes de policies/triggers, roles creados dentro de `do $$ … if not exists … $$`). Se aplica dos veces en cada prueba.
- Funciones `SECURITY DEFINER` con `set search_path = ''` y nombres totalmente calificados (`wm.`, `shop.`, `pg_catalog.`).
- `revoke all … from public` en cada función nueva; `grant execute` explícito solo al rol que la usa.
- Pruebas SQL: `supabase/tests/<nombre>_rollback.sql`, empiezan con `\set ON_ERROR_STOP 1` + `begin;`, aplican el script **dos veces** con `\i`, comprueban con `raise exception` y terminan en `rollback;`. Se corren contra producción con `scripts/catalogo/psql.sh -X -f supabase/tests/<archivo>`.
- Para actuar como un usuario del ERP dentro de una prueba: `select set_config('request.jwt.claims', json_build_object('sub', <auth user_id del Super Admin>, 'role','authenticated')::text, true); set local role authenticated;` y `reset role;` al terminar.
- Para actuar como la tienda: `grant storefront to postgres;` (dentro de la transacción) y `set local role storefront;`.
- Valores por defecto (spec §11): apartado corto **30 min**, firme **24 h**, **10** u./línea, **30** u./pedido, **20** líneas, **2** solicitudes vigentes por teléfono, tope de exhibición **10**. Número de pedido `W-000001`.
- Estados guardados de `online_orders.status`: `solicitada | aceptada | completada | rechazada | cancelada`. «vencida» **no se guarda**: se calcula.
- Teléfono guardado en E.164: `^\+[1-9][0-9]{7,14}$`.
- Mensajes al usuario en español; nombres SQL en inglés (como el resto de `wm`), salvo `shop.crear_solicitud` (nombre del contrato).
- No se cambia ningún `.sql` ya aplicado: se crean archivos nuevos y luego se pliegan en `bootstrap/` (Task 8).
- Cualquier cambio de nombres/columnas del esquema `shop` se refleja en `docs/TIENDA-INTEGRACION.md` en la misma tarea.

## Review Focus

1. **Dos solicitudes simultáneas por la última unidad** → una gana, la otra recibe `unavailable`. Lo cubre el `for update` en orden estable; prueba manual con dos sesiones en Task 5, Step 6.
2. **Misma variante en dos líneas del carrito del POS** (o del pedido) → la validación de apartados suma las cantidades por variante, no línea por línea. Prueba en Task 2.
3. **Pedido con dos grupos de sucursal, convertir uno** → el otro sigue apartado y el pedido sigue `aceptada`; al convertir el segundo pasa a `completada`. Prueba en Task 2.
4. **Producto que deja de estar publicado (o sucursal que se deshabilita) con una solicitud vigente** → la solicitud sigue apartando (ya fue aceptada por el ERP); `crear_solicitud` nueva lo rechaza con `not_found`. Prueba en Task 5.
5. **Reintento de `crear_solicitud` con el mismo `request_id` después de que el apartado venció** → devuelve la misma solicitud (no crea otra) aunque ya no aparte. Prueba en Task 5.

---

### Task 1: Pedidos online, apartados y configuración (tablas + vistas internas)

**Files:**
- Create: `supabase/online_orders.sql`
- Test: `supabase/tests/online_orders_rollback.sql`

**Interfaces:**
- Produces:
  - `wm.online_settings` (fila única `id = 1`): `soft_hold_minutes int default 30`, `firm_hold_hours int default 24`, `max_units_per_line int default 10`, `max_units_per_order int default 30`, `max_lines int default 20`, `max_open_per_phone int default 2`, `display_stock_cap int default 10`, `store_whatsapp text`, `whatsapp_templates jsonb default '{}'`, `updated_at`. Checks: todos los int > 0.
  - `wm.branches.online_enabled boolean not null default false`.
  - `wm.online_orders`: `id uuid pk`, `number text unique not null default wm.next_online_order()`, `request_id uuid unique not null`, `status text not null default 'solicitada'` (check de los 5 estados), `customer_name text not null`, `customer_phone text not null` (check E.164), `customer_email text`, `customer_document text`, `notes text`, `soft_expires_at timestamptz not null`, `firm_expires_at timestamptz`, `accepted_by uuid → profiles`, `accepted_at timestamptz`, `closed_by uuid → profiles`, `closed_at timestamptz`, `close_reason text`, `customer_id uuid → customers on delete set null`, `source_ip inet`, `created_at`, `updated_at` (trigger `wm.set_updated_at`). Índices: `(status, created_at desc)`, `(customer_phone)`.
  - `wm.online_order_items`: `id uuid pk`, `order_id uuid not null → online_orders on delete cascade`, `variant_id uuid not null → product_variants on delete restrict`, `branch_id uuid not null → branches on delete restrict`, `quantity int not null check (quantity > 0)`, `unit_price numeric(12,2) not null`, `product_name text not null`, `variant_label text not null`, `sku text not null`, `sale_id uuid → sales on delete set null`, `released_at timestamptz`, `created_at`. `unique (order_id, variant_id, branch_id)`. Índice `(variant_id, branch_id) where sale_id is null and released_at is null`.
  - `wm.sales.online_order_id uuid → online_orders on delete set null` + índice parcial.
  - `wm.next_online_order() returns text` → `'W-' || lpad(nextval('wm.online_order_seq')::text, 6, '0')`.
  - Vista `wm.online_holds (variant_id, branch_id, order_id, held int)` — una fila por línea **vigente**: `sale_id is null and released_at is null` y (`status = 'solicitada' and soft_expires_at > now()`) o (`status = 'aceptada' and firm_expires_at > now()`).
  - `wm.online_held(p_variant uuid, p_branch uuid, p_exclude_order uuid default null) returns int` (stable, `SECURITY DEFINER`): suma de `held` excluyendo `p_exclude_order`.
  - Vista `wm.v_online_orders` (`security_invoker`): todas las columnas de `online_orders` + `effective_status` (`'vencida'` si `solicitada` con `soft_expires_at <= now()` o `aceptada` con `firm_expires_at <= now()`; si no, `status`) + `expires_at` (el vencimiento vigente según estado) + `total numeric` + `branch_count int`.
  - RLS: `select` para `wm.is_member()` en `online_orders`, `online_order_items`, `online_settings`; `update` de `online_settings` con `wm.has_module('Configuración', 2)`; **sin** políticas de insert/update/delete en pedidos (solo por funciones).
  - Grants: `select` a `authenticated` en tablas y vistas; `execute` de `wm.online_held` a `authenticated`.
  - Inserta la fila `online_settings (id) values (1) on conflict do nothing`.

- [ ] **Step 1: Write the failing test** `supabase/tests/online_orders_rollback.sql`

Con una variante y una sucursal reales (`select … limit 1`), insertando como `postgres`:
```sql
-- pedido solicitada vigente con 2 u. → online_held = 2
-- soft_expires_at en el pasado → online_held = 0 y effective_status = 'vencida'
-- status 'aceptada' + firm_expires_at futuro → online_held = 2
-- p_exclude_order = ese pedido → 0
-- línea con sale_id → 0 ; línea con released_at → 0
-- next_online_order() ~ '^W-[0-9]{6}$'
-- insert de un pedido con customer_phone '04141234567' → falla el check
-- online_settings tiene exactamente 1 fila con soft_hold_minutes = 30 y display_stock_cap = 10
-- como authenticated (Super Admin): select de wm.online_orders funciona; insert directo falla (RLS)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `scripts/catalogo/psql.sh -X -f supabase/tests/online_orders_rollback.sql`
Expected: FAIL — `supabase/online_orders.sql: No such file or directory`.

- [ ] **Step 3: Implement `supabase/online_orders.sql`** según el bloque Interfaces.

- [ ] **Step 4: Run test to verify it passes**

Run: `scripts/catalogo/psql.sh -X -f supabase/tests/online_orders_rollback.sql`
Expected: termina en `ROLLBACK` sin `ERROR`.

- [ ] **Step 5: Commit**

```bash
git add supabase/online_orders.sql supabase/tests/online_orders_rollback.sql
git commit -m "feat(pedidos-online): tablas de pedidos, apartados derivados y configuración"
```

---

### Task 2: `create_sale` respeta apartados y convierte pedidos

**Files:**
- Create: `supabase/online_orders_sale.sql`
- Modify: `lib/sales/checkout-types.ts` (`CheckoutInput`), `app/api/ventas/checkout/route.ts` (pasar el parámetro)
- Test: `supabase/tests/online_orders_sale_rollback.sql`

**Interfaces:**
- Consumes: `wm.online_held`, `wm.online_orders`, `wm.online_order_items`, `wm.sales.online_order_id` (Task 1).
- Produces:
  - `wm.create_sale(p_branch_id uuid, p_customer_id uuid, p_payments jsonb, p_discount_pct numeric, p_rate numeric, p_items jsonb, p_status text default 'Pagada', p_cashea jsonb default null, p_seller_id uuid default null, p_seller_code text default null, p_online_order_id uuid default null) returns wm.sales`.
  - La firma anterior (10 parámetros) se **elimina** (`drop function if exists wm.create_sale(uuid, uuid, jsonb, numeric, numeric, jsonb, text, jsonb, uuid, text);`) para que PostgREST no vea dos sobrecargas. Mismos `grant execute` que hoy a `authenticated`.
  - `CheckoutInput.online_order_id?: string` y el route envía `p_online_order_id: input.online_order_id ?? null`.

Cuerpo: parte de `supabase/create_sale_tax_included.sql` tal cual y agrega, **después** de la comprobación de idempotencia y del vendedor, y **antes** de insertar la venta:

1. Si `p_online_order_id` no es null: `select … from wm.online_orders where id = p_online_order_id for update`; exige `status = 'aceptada'` (si no: `raise exception 'El pedido online % no está aceptado', number`); exige al menos una línea del pedido con `branch_id = p_branch_id and sale_id is null and released_at is null` (si no: `'El pedido % no tiene productos pendientes en esta sucursal'`).
2. Si `coalesce(p_status,'Pagada') = 'Pagada'`: por cada `variant_id` del ticket (**cantidades sumadas por variante**, en orden de `variant_id`): `select quantity from wm.inventory where variant_id = … and branch_id = p_branch_id for update`; `v_held := wm.online_held(variant, p_branch_id, p_online_order_id)`; si `v_held > 0 and v_qty > coalesce(quantity,0) - v_held` → `raise exception 'Solo puedes vender % de «%»: % unidad(es) están apartadas para pedidos online', greatest(quantity - v_held, 0), descripción, v_held`. Si `v_held = 0`, comportamiento de hoy (`greatest(0, …)`).
3. Tras insertar la venta: `update wm.sales set online_order_id = p_online_order_id` (o incluirlo en el insert).
4. Tras las líneas: en las líneas del pedido de esa sucursal (`sale_id is null and released_at is null`): las que tienen `variant_id` en el ticket → `sale_id = v_sale.id`; las demás → `released_at = now()`. Si ya no quedan líneas del pedido con `sale_id is null and released_at is null` → `status = 'completada', closed_at = now(), closed_by = v_profile`.

- [ ] **Step 1: Write the failing test** `supabase/tests/online_orders_sale_rollback.sql`

Prepara como `postgres`: una variante V con `inventory.quantity = 3` en sucursal A (ajústala dentro de la transacción), otra variante W con stock en sucursal B. Actúa como Super Admin (ver Global Constraints) y llama `wm.create_sale` con un vendedor activo real.
```sql
-- sin apartados: vender 5 de V con quantity 3 → OK y quantity queda 0 (comportamiento de hoy)
-- (restaura quantity = 3) pedido P1 aceptada vigente con 2 de V en A:
--   vender 2 de V sin p_online_order_id → excepción que contiene 'apartadas para pedidos online'
--   vender 1 de V sin p_online_order_id → OK
--   ticket con dos líneas de V (1 + 1) sin pedido, con quantity 3 y held 2 → excepción (suma por variante)
-- pedido P2 aceptada con 2 de V en A y 1 de W en B:
--   create_sale(A, …, p_online_order_id = P2) con 2 de V → OK;
--     líneas de A con sale_id = venta; línea de B sigue pendiente; P2.status = 'aceptada';
--     sales.online_order_id = P2
--   create_sale(B, …, P2) con 1 de W → P2.status = 'completada'
-- pedido P3 aceptada con 2 de V en A, ticket del POS solo con 1 de otra variante X en A + p_online_order_id = P3
--   → la línea de V queda released_at not null y P3 = 'completada'
-- pedido P4 'solicitada' → create_sale con P4 → excepción 'no está aceptado'
-- pedido P5 aceptada con firm_expires_at vencido y stock suficiente → convierte OK
-- mismo request_id dos veces con p_online_order_id → la segunda devuelve la misma venta y no toca el pedido
-- solo existe UNA función wm.create_sale (count en pg_proc = 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `scripts/catalogo/psql.sh -X -f supabase/tests/online_orders_sale_rollback.sql`
Expected: FAIL — falta `supabase/online_orders_sale.sql`.

- [ ] **Step 3: Implement `supabase/online_orders_sale.sql`** — no incluye `online_orders.sql` (lo da por aplicado; la prueba hace `\i supabase/online_orders.sql` antes) y termina con `notify pgrst, 'reload schema';`.

- [ ] **Step 4: Run test to verify it passes**

Run: `scripts/catalogo/psql.sh -X -f supabase/tests/online_orders_sale_rollback.sql`
Expected: `ROLLBACK` sin `ERROR`.

- [ ] **Step 5: Add `online_order_id` to `CheckoutInput` and the route**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add supabase/online_orders_sale.sql supabase/tests/online_orders_sale_rollback.sql lib/sales/checkout-types.ts app/api/ventas/checkout/route.ts
git commit -m "feat(ventas): create_sale no vende unidades apartadas y convierte pedidos online"
```

---

### Task 3: Funciones del personal (aceptar, rechazar, cancelar, extender)

**Files:**
- Create: `supabase/online_orders_staff.sql`
- Test: `supabase/tests/online_orders_staff_rollback.sql`

**Interfaces:**
- Consumes: Task 1.
- Produces (todas `SECURITY DEFINER`, `search_path = ''`, exigen `wm.has_module('Ventas', 2)` → si no: `'No autorizado para gestionar pedidos online'`; bloquean el pedido `for update`; escriben `wm.audit_log` con módulo `'Ventas'`; `grant execute` a `authenticated`):
  - `wm.online_order_accept(p_order_id uuid, p_lines jsonb default '[]') returns wm.online_orders`. `p_lines`: `[{ "item_id": uuid, "branch_id": uuid, "quantity": int }]`; una línea omitida queda igual; `quantity = 0` la quita (se borra la fila). Solo desde `solicitada` (vigente **o** vencida). Revalida **todas** las líneas resultantes: por `(variant, branch)` en orden estable, `for update` en `inventory`, `disponible = quantity − wm.online_held(variant, branch, p_order_id)`; si falta → `raise exception` con el detalle `'«%» en %: pides %, hay %'`. La sucursal nueva debe tener `online_enabled`. Debe quedar ≥ 1 línea (`'El pedido debe conservar al menos un producto'`). Pasa a `aceptada`, `firm_expires_at = now() + firm_hold_hours`, `accepted_by/at`.
  - `wm.online_order_reject(p_order_id uuid, p_reason text default null) returns wm.online_orders`: solo desde `solicitada` → `rechazada`, `closed_by/at`, `close_reason`.
  - `wm.online_order_cancel(p_order_id uuid, p_reason text default null) returns wm.online_orders`: solo desde `aceptada`; marca `released_at = now()` en líneas sin venta; estado `cancelada` si ninguna línea tiene `sale_id`, si no `completada`.
  - `wm.online_order_extend(p_order_id uuid, p_hours int default null) returns wm.online_orders`: solo `aceptada`; `p_hours` null → `firm_hold_hours`; `firm_expires_at = greatest(firm_expires_at, now()) + horas`. Si estaba vencido, revalida disponibilidad como en `accept` antes de extender.

- [ ] **Step 1: Write the failing test** `supabase/tests/online_orders_staff_rollback.sql`

```sql
-- como Super Admin:
-- accept de solicitada vigente → status aceptada, firm_expires_at ≈ now()+24h, online_held igual
-- accept cambiando branch de una línea a una sucursal con stock → línea con branch nuevo
-- accept a una sucursal con online_enabled = false → excepción
-- accept con quantity 0 en la única línea → excepción 'al menos un producto'
-- accept de solicitada vencida con stock suficiente → OK ; sin stock (otro pedido lo apartó) → excepción con detalle
-- reject de aceptada → excepción ; reject de solicitada → rechazada y online_held = 0
-- cancel de aceptada sin ventas → cancelada, online_held = 0
-- extend de aceptada → firm_expires_at aumenta en 24h
-- como un perfil sin Ventas 2 (rol 'Inventario'): accept → 'No autorizado…'
-- cada acción deja una fila en wm.audit_log
```

- [ ] **Step 2: Run test to verify it fails**

Run: `scripts/catalogo/psql.sh -X -f supabase/tests/online_orders_staff_rollback.sql`
Expected: FAIL — falta el archivo.

- [ ] **Step 3: Implement `supabase/online_orders_staff.sql`**

- [ ] **Step 4: Run test to verify it passes** — mismo comando; `ROLLBACK` sin `ERROR`.

- [ ] **Step 5: Commit**

```bash
git add supabase/online_orders_staff.sql supabase/tests/online_orders_staff_rollback.sql
git commit -m "feat(pedidos-online): aceptar, rechazar, cancelar y extender pedidos"
```

---

### Task 4: Esquema `shop` (vistas públicas) y rol `storefront`

**Files:**
- Create: `supabase/shop_schema.sql`
- Test: `supabase/tests/shop_schema_rollback.sql`
- Modify: `docs/TIENDA-INTEGRACION.md` (solo si un nombre cambia)

**Interfaces:**
- Consumes: Task 1 (`online_holds`, `online_settings`, `branches.online_enabled`).
- Produces:
  - Rol `storefront` (`login noinherit nosuperuser nocreatedb nocreaterole nobypassrls`, sin contraseña en el script), `alter role storefront set statement_timeout = '5s'`, `alter role storefront connection limit 20`.
  - Esquema `shop` (owner `postgres`); `revoke all on schema shop from public, anon, authenticated`; `grant usage on schema shop to storefront`.
  - `wm.product_is_shop_ready(p_product_id uuid) returns boolean` (stable, `SECURITY DEFINER`, `revoke` de `public`) — misma regla que `productReadiness` en `lib/catalog/readiness.ts`: categoría con `parent_id` no nulo; marca; descripción no vacía; cada `category_attributes.is_required` con al menos un valor en `product_attribute_values`; por cada `color_id` distinto de variantes activas, una foto de ese color **o** (un solo color y una foto general); sin colores y con variantes activas → al menos una foto; cada variante activa con `price > 0`; si `category.requires_color`, variantes activas con `color_id`; si `category.option_type_id`, variantes activas con `option_value_id` de ese tipo.
  - Vistas (sin `security_invoker`; columnas y nombres **exactamente** los de `docs/TIENDA-INTEGRACION.md` §4): `shop.store_settings`, `shop.branches`, `shop.categories`, `shop.brands`, `shop.color_families`, `shop.option_values`, `shop.products`, `shop.variants`, `shop.availability`.
    - Producto publicado = `is_active and visible_in_catalog and wm.product_is_shop_ready(id)` y categoría, departamento y marca activos, con ≥ 1 variante publicada.
    - Variante publicada = activa, `price > 0`, de un producto publicado.
    - `availability.available = least(quantity − held, display_stock_cap)` por `(variant, branch)` con `branch.is_active and online_enabled`, solo filas `> 0`.
    - `products.main_photo` = primera foto general por `(sort_order, id)`; si no hay, primera foto del primer color con fotos según `(colors.sort_order, colors.name)`.
    - `store_settings` = `wm.settings` (marca) + `wm.online_settings` (`store_whatsapp`, `soft_hold_minutes`, `max_units_per_line`, `max_units_per_order`, `max_lines`, `max_open_per_phone`, `display_stock_cap`).
  - `grant select on all tables in schema shop to storefront`; `revoke all on all tables in schema shop from public, anon, authenticated`.

- [ ] **Step 1: Write the failing test** `supabase/tests/shop_schema_rollback.sql`

```sql
-- como postgres: activa online_enabled en una sucursal con stock (dentro de la transacción)
-- seguridad (has_table_privilege / has_schema_privilege / has_function_privilege):
--   storefront sin USAGE en wm, auth, storage; sin SELECT en ninguna tabla/vista de wm, public, auth, storage
--   anon y authenticated sin USAGE en shop
--   ninguna vista de shop expone columnas llamadas cost, stock_value, supplier_id, rif
--   'shop' no aparece en el valor de pgrst.db_schemas de authenticator
-- como storefront (grant storefront to postgres; set local role storefront):
--   select count(*) from shop.products > 0 ; from shop.variants > 0 ; from shop.availability > 0
--   select from wm.products → error 'permission denied' (atrapado con begin … exception when insufficient_privilege)
-- reset role; reglas:
--   max(available) en shop.availability <= display_stock_cap
--   producto con visible_in_catalog = false no aparece en shop.products
--   producto sin descripción no aparece (product_is_shop_ready = false)
--   variante con price = 0 no aparece en shop.variants
--   un pedido aceptado de 1 u. reduce shop.availability.available en 1 (si estaba bajo el tope)
--   sucursal con online_enabled = false no aparece en shop.branches ni en shop.availability
-- paridad con lib/catalog/readiness.test.ts: un caso por cada tipo de faltante (category, brand,
--   description, attribute, photo por color, photo un solo color con foto general = listo, price,
--   variantColor, variantOption) armado en la transacción → product_is_shop_ready da lo esperado
```

- [ ] **Step 2: Run test to verify it fails**

Run: `scripts/catalogo/psql.sh -X -f supabase/tests/shop_schema_rollback.sql`
Expected: FAIL — falta el archivo.

- [ ] **Step 3: Implement `supabase/shop_schema.sql`**

- [ ] **Step 4: Run test to verify it passes** — mismo comando; `ROLLBACK` sin `ERROR`.

- [ ] **Step 5: Measure** — como `storefront`, `explain analyze` de la consulta «listado de una categoría» y «ficha» de `docs/TIENDA-INTEGRACION.md` §5. Expected: < 300 ms cada una. Si no, añadir índices o una función de readiness por lotes, y repetir.

- [ ] **Step 6: Commit**

```bash
git add supabase/shop_schema.sql supabase/tests/shop_schema_rollback.sql docs/TIENDA-INTEGRACION.md
git commit -m "feat(tienda): esquema shop de solo lectura y rol storefront"
```

---

### Task 5: `shop.crear_solicitud`

**Files:**
- Create: `supabase/shop_crear_solicitud.sql`
- Test: `supabase/tests/shop_crear_solicitud_rollback.sql`

**Interfaces:**
- Consumes: Tasks 1 y 4.
- Produces: `shop.crear_solicitud(p_request jsonb) returns jsonb` (`SECURITY DEFINER`, `search_path = ''`, `revoke all from public, anon, authenticated`, `grant execute to storefront`). Entrada, salida y códigos de error **exactamente** como `docs/TIENDA-INTEGRACION.md` §8.2.

Orden dentro de la función:
1. Si `request_id` no es uuid → `invalid_input`. `pg_advisory_xact_lock(hashtextextended('shop:' || request_id, 0))`; si ya existe un pedido con ese `request_id` → `{ok: true, order: <el existente>}`.
2. Validación de forma → `invalid_input` (nombre 2–120, teléfono E.164, correo con `@` si viene, cantidades enteras ≥ 1, sin `(variant, branch)` repetido, `items` no vacío).
3. Topes de `wm.online_settings` → `too_many_lines`, `too_many_units`.
4. Solicitudes vigentes del teléfono (`effective_status in ('solicitada','aceptada')`) ≥ `max_open_per_phone` → `too_many_open_requests`.
5. Cada línea debe existir en `shop.variants` y su sucursal en `shop.branches` → si no, `not_found` con `lines`.
6. En orden `(variant_id, branch_id)`: `select quantity from wm.inventory … for update`; `disponible = quantity − wm.online_held(variant, branch)`; junta las que no alcanzan → `unavailable` con `lines` (`requested`, `available` = `greatest(disponible, 0)` sin tope).
7. Inserta pedido (`soft_expires_at = now() + soft_hold_minutes`) y líneas con `unit_price = variants.price`, `product_name`, `variant_label` (`color · opción`, omitiendo nulos), `sku`.
8. Devuelve `{ok: true, order}` con `groups` por sucursal ordenados por nombre, `subtotal` y `total` redondeados a 2.

- [ ] **Step 1: Write the failing test** `supabase/tests/shop_crear_solicitud_rollback.sql`

```sql
-- como storefront:
-- solicitud válida de 2 u. → ok = true, number ~ '^W-', status 'solicitada', groups con 1 grupo,
--   unit_price = precio de la variante aunque el payload traiga "unit_price": 0.01
--   wm.online_held(variant, branch) = 2 (consultado como postgres)
-- mismo request_id otra vez → mismo order_id, online_held sigue en 2
-- mismo request_id con soft_expires_at ya vencido (update como postgres) → mismo order_id, ok = true
-- teléfono '04141234567' → code 'invalid_input'
-- línea repetida (misma variante y sucursal) → 'invalid_input'
-- 11 u. en una línea → 'too_many_units' ; 21 líneas → 'too_many_lines'
-- tercera solicitud vigente del mismo teléfono → 'too_many_open_requests'
-- variante de un producto con visible_in_catalog = false → 'not_found'
-- sucursal con online_enabled = false → 'not_found'
-- pedir más que el disponible → 'unavailable' con lines[0].available correcto
-- dos sucursales → groups tiene 2 elementos y total = suma de subtotales
-- storefront no puede ejecutar wm.online_order_accept ni wm.create_sale (has_function_privilege = false)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `scripts/catalogo/psql.sh -X -f supabase/tests/shop_crear_solicitud_rollback.sql`
Expected: FAIL — falta el archivo.

- [ ] **Step 3: Implement `supabase/shop_crear_solicitud.sql`**

- [ ] **Step 4: Run test to verify it passes** — mismo comando; `ROLLBACK` sin `ERROR`.

- [ ] **Step 5: Commit**

```bash
git add supabase/shop_crear_solicitud.sql supabase/tests/shop_crear_solicitud_rollback.sql docs/TIENDA-INTEGRACION.md
git commit -m "feat(tienda): shop.crear_solicitud aparta stock con topes anti-abuso"
```

- [ ] **Step 6: Manual concurrency check** (Review Focus 1) — tras aplicar en producción (Task 8): con una variante de 1 u. disponible, abrir dos `psql` como `storefront`, `begin;` en ambos, llamar `crear_solicitud` con `request_id` distintos en los dos, `commit` en el primero. Expected: el segundo devuelve `unavailable` al desbloquearse. `rollback`/rechazar la solicitud creada.

---

### Task 6: Bucket de fotos sin listado público

**Files:**
- Create: `supabase/storage_no_public_list.sql`
- Test: `supabase/tests/storage_no_public_list_rollback.sql`

**Interfaces:**
- Produces: se elimina la política `"wm_public_read"` de `storage.objects` y se crea `"wm_authenticated_read"` `for select to authenticated using (bucket_id = 'wm-public')`. El bucket sigue `public = true`.

- [ ] **Step 1: Write the failing test** — tras `\i` dos veces: no existe política `select` sobre `storage.objects` para `public`/`anon` con `bucket_id = 'wm-public'`; existe `wm_authenticated_read`; `storage.buckets.public` sigue `true` para `wm-public`.

- [ ] **Step 2: Run test to verify it fails**

Run: `scripts/catalogo/psql.sh -X -f supabase/tests/storage_no_public_list_rollback.sql`
Expected: FAIL.

- [ ] **Step 3: Implement `supabase/storage_no_public_list.sql`**

- [ ] **Step 4: Run test to verify it passes** — `ROLLBACK` sin `ERROR`.

- [ ] **Step 5: Commit**

```bash
git add supabase/storage_no_public_list.sql supabase/tests/storage_no_public_list_rollback.sql
git commit -m "fix(storage): el bucket wm-public ya no se puede listar sin sesión"
```

(La comprobación en la app —subir/borrar foto, logo, avatar; `curl` de una URL pública; `list()` con la anon key vacío— va en Task 8, tras aplicar.)

---

### Task 7: POS e Inventario muestran lo apartado

**Files:**
- Create: `supabase/v_inventory_online_held.sql`, `lib/sales/stock.ts`, `lib/sales/stock.test.ts`
- Modify: `app/(app)/ventas/page.tsx:71-84,139`, `components/ventas/pos-view.tsx` (tipo `PosProduct` ~101, aviso ~430, tarjeta ~1232), `components/inventario/inventario-view.tsx` (columna nueva), `lib/database.types.ts` (`v_inventory`)
- Test: `lib/sales/stock.test.ts`, y en `supabase/tests/online_orders_rollback.sql` una comprobación de la columna nueva

**Interfaces:**
- Consumes: `wm.online_holds` (Task 1).
- Produces:
  - `wm.v_inventory` con columna **al final** `online_held int` (= suma de `wm.online_holds.held` del `(variant, branch)`, 0 si no hay). `create or replace view` conservando todas las columnas actuales en su orden.
  - `sellableStock(quantity: number, onlineHeld: number): number` en `lib/sales/stock.ts` → `Math.max(0, quantity - onlineHeld)`.
  - `PosProduct` gana `online_held: number`; `stock` pasa a ser `sellableStock(quantity, online_held)`.

- [ ] **Step 1: Write the failing test** `lib/sales/stock.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { sellableStock } from "./stock";

describe("sellableStock", () => {
  it("sin apartados devuelve la existencia", () => expect(sellableStock(3, 0)).toBe(3));
  it("resta lo apartado", () => expect(sellableStock(3, 2)).toBe(1));
  it("nunca es negativo", () => expect(sellableStock(1, 2)).toBe(0));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/sales/stock.test.ts`
Expected: FAIL — no existe `./stock`.

- [ ] **Step 3: Implement** `lib/sales/stock.ts`, `supabase/v_inventory_online_held.sql`; en `ventas/page.tsx` seleccionar `online_held` y mapear `stock`/`online_held`; en `pos-view.tsx` la tarjeta muestra `{stock} disp.` y, si `online_held > 0`, `· {online_held} apartado(s) online`; el aviso de cantidad dice `Solo hay {stock} disponibles de … ({online_held} apartados para pedidos online)` cuando `online_held > 0`. En Inventario, columna «Apartado online» con `online_held` (0 se muestra como «—»).

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/sales/stock.test.ts && scripts/catalogo/psql.sh -X -f supabase/tests/online_orders_rollback.sql && npx tsc --noEmit && npm run lint`
Expected: todo pasa.

- [ ] **Step 5: Check in the browser** — con la vista aplicada en producción (Task 8) o `npm run dev`: POS de una sucursal con un pedido aceptado muestra «N disp. · M apartado(s) online» y no deja agregar más de N.

- [ ] **Step 6: Commit**

```bash
git add supabase/v_inventory_online_held.sql lib/sales/stock.ts lib/sales/stock.test.ts "app/(app)/ventas/page.tsx" components/ventas/pos-view.tsx components/inventario/inventario-view.tsx lib/database.types.ts supabase/tests/online_orders_rollback.sql
git commit -m "feat(pos): el POS e Inventario descuentan y muestran lo apartado para pedidos online"
```

---

### Task 8: Plegado, despliegue y documentación

**Files:**
- Modify: `supabase/apply_pending.sh` (pasos nuevos en orden: `online_orders.sql`, `online_orders_sale.sql`, `online_orders_staff.sql`, `v_inventory_online_held.sql`, `shop_schema.sql`, `shop_crear_solicitud.sql`, `storage_no_public_list.sql`; y en la verificación: `tab online_orders`, `tab online_order_items`, `tab online_settings`, `col branches.online_enabled`, `col sales.online_order_id`, `rpc online_order_accept`, `rpc online_held`)
- Modify: `supabase/bootstrap/01_schema.sql` (tablas/columnas dentro de los `CREATE TABLE`, `create_sale` final, funciones, vistas, esquema `shop`, rol, política de storage), `supabase/bootstrap/02_seed.sql` (fila `online_settings`), `supabase/bootstrap/README.md` (contraseña de `storefront` a mano)
- Modify: `lib/database.types.ts` (tablas `online_orders`, `online_order_items`, `online_settings`, vistas `v_online_orders`, `online_holds`, columnas nuevas, funciones `online_order_*`, firma de `create_sale`)
- Modify: `CLAUDE.md` (migración 20 + sección «Tienda online / Pedidos online»), `docs/PROGRESS.md`, `docs/TIENDA-INTEGRACION.md` (cualquier diferencia final)

- [ ] **Step 1: Re-run all new SQL tests together**

Run: `for f in online_orders online_orders_sale online_orders_staff shop_schema shop_crear_solicitud storage_no_public_list; do scripts/catalogo/psql.sh -X -f supabase/tests/${f}_rollback.sql || break; done`
Expected: los seis terminan en `ROLLBACK` sin `ERROR`.

- [ ] **Step 2: Bootstrap check** — en un Postgres vacío de prueba (Supabase branch o `supabase start`), `01_schema.sql` + `02_seed.sql` + `03_owner.sql` corren sin error y la verificación de `apply_pending.sh` da todo `OK`. Si no hay entorno, documentarlo en `PROGRESS.md` como pendiente.

- [ ] **Step 3: Pedir confirmación al usuario y aplicar en producción**

Run: `./supabase/apply_pending.sh` (lee `SUPABASE_DB_URL` de `.env.local`).
Expected: verificación final todo `OK`.

- [ ] **Step 4: Producción, comprobaciones manuales**
  - El usuario fija la contraseña: `alter role storefront password '…'` (no se guarda en el repo).
  - `psql "postgresql://storefront.cfggippjujceebovvhsa:…@aws-1-us-west-2.pooler.supabase.com:6543/postgres"`: `select count(*) from shop.products` > 0; `select * from wm.products limit 1` → `permission denied`.
  - Fotos: en el ERP subir y borrar una foto de producto, cambiar y quitar el logo, subir avatar → todo funciona. `curl -I <URL pública de una foto>` → 200. Listado con la anon key (`supabase.storage.from('wm-public').list()`) → vacío.
  - POS: una venta normal sin pedidos sigue funcionando igual que antes.
  - Task 5 Step 6 (concurrencia).

- [ ] **Step 5: Commit**

```bash
git add supabase/apply_pending.sh supabase/bootstrap lib/database.types.ts CLAUDE.md docs/PROGRESS.md docs/TIENDA-INTEGRACION.md
git commit -m "chore(tienda): plegar pedidos online y esquema shop en el bootstrap y documentar"
```
