# Diseño: arranque de un negocio nuevo desde cero (`/nuevo-negocio`)

Fecha: 2026-06-21
Estado: aprobado (pendiente revisión del spec por el usuario)

## Problema

El ERP nació como instancia única (World Medics). Se quiere reutilizar el **mismo esquema**
para varios negocios: cada negocio = un proyecto Supabase distinto. Hace falta un proceso
repetible que, sobre una base de datos Supabase vacía:

1. Cree todas las tablas/funciones/RLS/vistas/RPCs **tal cual están hoy**.
2. Cargue **solo** la data mínima necesaria para que un negocio pueda operar (sin relleno).
3. Cree al **owner** como primer usuario (Super Admin), desde el cual se administra todo lo demás.

Hoy las 27 migraciones viven **solo en la BD remota de WM** (aplicadas vía MCP `apply_migration`);
no hay archivos `.sql` en el repo, ni carpeta `supabase/`, ni comandos `.claude/`.

## Decisiones (cerradas con el usuario)

| Tema | Decisión |
|---|---|
| Mecanismo de conexión | **Connection string + `psql`**. El usuario pega `postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres`. Funciona con cualquier cuenta Supabase (incluida la de un cliente). `psql` 14.x ya está instalado. |
| Alcance del seed | **Esqueleto operativo**: roles + matriz de permisos, métodos de pago, 1 sucursal, fila `settings`. Sin catálogo ni datos de negocio. |
| Nombre del comando | **`/nuevo-negocio`** |
| Generación de `.env.local` | **No**. El usuario lo hace a mano. |
| Creación del owner | **SQL parametrizado** (camino primario) + **fallback** vía Dashboard + `claim_profile()`. |
| Estado del esquema | **Estado final** (no se replica el historial de migraciones; se excluyen los seeds demo y se consolidan las migraciones incrementales). |

## Principio rector: estado final, no historial

De las 27 migraciones de WM:

- **5 son data demo y se EXCLUYEN:** `wm_seed_master`, `wm_seed_profiles`, `wm_seed_catalog`,
  `wm_seed_sales`, `wm_reseed_realistic_sales`.
- **Varias son incrementales y se CONSOLIDAN al estado final:**
  - `create_sale` v1→v4 → solo la **v4** (`wm_create_sale_v4`).
  - `payment_methods` columnas (`currency`, `requires_reference`, `is_financed`) → ya dentro del
    `CREATE TABLE`.
  - `cashea_orders` + `channel` → ya dentro del `CREATE TABLE`.
- El resto (estructura, funciones/RLS, vistas, RPC final, trigger de anulación Cashea, bucket de
  storage) se incluye **en orden de dependencias**.

El resultado es un único `01_schema.sql` que deja una BD nueva idéntica en estructura a la de WM,
pero vacía de datos.

## Artefactos a crear

```
supabase/
  bootstrap/
    01_schema.sql   # estructura completa, estado final, orden de dependencias (ver abajo)
    02_seed.sql     # seed mínimo (esqueleto operativo)
    03_owner.sql    # creación del owner, parametrizado con psql -v
    README.md       # qué es cada archivo y cómo correrlos a mano
docs/
  NUEVO-NEGOCIO.md  # runbook completo: paso a paso + troubleshooting + fallback del owner
.claude/
  commands/
    nuevo-negocio.md  # el slash command que Claude sigue para ejecutar el arranque
```

Mantenimiento: estos archivos son un **snapshot a mano** (igual que `lib/database.types.ts`). El
desarrollo de WM sigue por MCP; al cambiar el esquema se re-sincroniza `01_schema.sql`. Esto se
documenta en `CLAUDE.md` y en `supabase/bootstrap/README.md`.

### `01_schema.sql` — contenido y orden

1. `create schema if not exists wm;` + exposición PostgREST (`alter role authenticator set pgrst.db_schemas`) + grants.
2. Función `wm.set_updated_at()` (trigger genérico) + secuencias + `wm.next_invoice()` / `wm.next_po()`.
3. Todas las tablas del esquema `wm` con sus columnas de estado final, índices y triggers `updated_at`:
   branches, categories, brands, sizes, colors, suppliers, products, product_variants, inventory,
   profiles, customers, customer_events, sales, sale_items, **sale_payments**, **cashea_orders**
   (con `channel`), purchase_orders, purchase_order_items, roles, role_permissions,
   **payment_methods** (con `currency`/`requires_reference`/`is_financed`), exchange_rates,
   audit_log, settings.
4. Helpers SECURITY DEFINER: `wm.my_profile_id()`, `wm.is_member()`, `wm.my_role()`,
   `wm.has_module(text,int)` (con `search_path` fijo) + grants.
5. `alter table ... enable row level security` en todas + políticas por módulo (lectura: miembro;
   escritura: `has_module(<módulo>,2)`), incluidas las de `sale_payments` y `cashea_orders`, y las
   especiales de `profiles`, `exchange_rates`, `audit_log`.
6. `wm.claim_profile()` + grant.
7. Vistas: `v_inventory`, `v_branch_stats`, `v_product_summary`, `v_customer_stats`,
   `v_customer_favorites`, `v_sale_lines`.
8. RPC `wm.create_sale(...)` versión v4 (recibe `p_payments`, `p_cashea`, persiste `channel`).
9. Trigger en `wm.sales` que pone `cashea_orders.status='anulada'` en Reembolso/Anulada.
10. Bucket de storage `wm-public` (lectura pública, escritura autenticados) + políticas.

El SQL exacto se extrae de la BD remota con
`select array_to_string(statements, E'\n') from supabase_migrations.schema_migrations where name = '<migración>'`
y se consolida a estado final.

### `02_seed.sql` — seed mínimo (exacto)

- **roles** (6): Super Admin (1), Administrador (2), Gerente (3), Vendedor (4), Inventario (5), Cajero (6).
- **role_permissions** (54 filas = 6 roles × 9 módulos). Niveles: 0 sin acceso · 1 ver · 2 total.

  | Rol | Dashboard | Ventas | Inventario | Productos | Clientes | Sucursales | Usuarios | Reportes | Configuración |
  |---|---|---|---|---|---|---|---|---|---|
  | Super Admin | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
  | Administrador | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 1 |
  | Gerente | 2 | 2 | 2 | 2 | 2 | 1 | 1 | 2 | 0 |
  | Vendedor | 1 | 2 | 1 | 1 | 2 | 0 | 0 | 0 | 0 |
  | Inventario | 1 | 1 | 2 | 2 | 1 | 0 | 0 | 1 | 0 |
  | Cajero | 1 | 2 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |

- **payment_methods** (10): Efectivo USD (USD, sort 1), Efectivo VES (VES, 2), Pago Móvil (VES, ref, 3),
  Transferencia (VES, ref, 4), Tarjeta débito (VES, 5), Tarjeta crédito (VES, 6), Zelle (USD, ref, 7),
  Binance (USD, ref, 8), Cashea (USD, ref, **is_financed**, 98), Mixto (meta, 99). Todos `enabled=true`.
- **branches** (1): code `S01`, name "Principal", `is_active=true`. Ciudad/dirección las completa el owner.
- **settings** (1 fila singleton): `company_name` = nombre del negocio (parámetro). `iva_general` y
  demás defaults de la tabla. `currency='USD'`.
- **Vacío explícito:** categories, brands, sizes, colors, suppliers, products, product_variants,
  inventory, customers, customer_events, sales, sale_items, sale_payments, cashea_orders,
  purchase_orders, purchase_order_items, exchange_rates, audit_log, profiles (salvo el owner, que va en `03`).

`02_seed.sql` debe ser **idempotente** (`on conflict do nothing` / upserts por clave natural) para
poder re-correrse sin duplicar.

### `03_owner.sql` — creación del owner (parametrizado)

Camino primario (todo por `psql`, sin Dashboard). Se invoca con variables:

```
psql "$CONN" \
  -v owner_email="dueno@negocio.com" \
  -v owner_name="Nombre Apellido" \
  -v owner_password="ContraseñaSegura" \
  -f supabase/bootstrap/03_owner.sql
```

El script:

1. Inserta en `auth.users` (id nuevo, `email`, `encrypted_password = crypt(:owner_password, gen_salt('bf'))`,
   `email_confirmed_at = now()`, `aud='authenticated'`, `role='authenticated'`,
   `raw_app_meta_data = {"provider":"email","providers":["email"]}`,
   `raw_user_meta_data = {"full_name": ...}`, `instance_id` default).
2. Inserta en `auth.identities` (`provider='email'`, `provider_id = email`, `user_id`, `identity_data`).
3. Inserta en `wm.profiles` con `role='Super Admin'`, `status='Activo'`,
   `branch_id` = la sucursal sembrada, `user_id` = el usuario recién creado.

Idempotente: si el email ya existe en `auth.users`, no duplica; enlaza/actualiza el profile.

**Fallback documentado** (si Supabase cambia los internos de `auth`): el operador crea el usuario en
**Dashboard → Authentication → Add user** (Auto Confirm + contraseña), y de antemano se inserta un
profile *invitado* (`user_id = NULL`, email del owner, role Super Admin, status Activo); al primer
login, `wm.claim_profile()` lo enlaza solo (mecanismo ya existente en el ERP).

Desde ese login, el owner (Super Admin, acceso total a los 9 módulos) crea sucursales, usuarios,
catálogo, inventario y todo lo demás desde la UI.

## El comando `/nuevo-negocio` (runbook que ejecuta Claude)

`.claude/commands/nuevo-negocio.md` instruye a Claude a:

1. Pedir la **connection string** del proyecto Supabase nuevo.
2. Pedir **nombre del negocio** y **datos del owner** (email, nombre, contraseña).
3. Verificar conexión (`psql "$CONN" -c "select 1"`) y **advertir si el schema `wm` ya existe**
   (para no pisar datos de un negocio ya inicializado); abortar salvo confirmación explícita.
4. Ejecutar en orden, deteniéndose ante el primer error (`psql -v ON_ERROR_STOP=1`):
   `01_schema.sql` → `02_seed.sql` → `03_owner.sql` (este con `-v` para los parámetros).
5. **Verificar**: contar tablas en `wm`, roles (6), role_permissions (54), payment_methods (10),
   branches (1), y el profile del owner (Super Admin, user_id no nulo).
6. Imprimir resumen final: estado de cada paso + credenciales del owner + recordatorio de que el
   `.env.local` lo arma el usuario a mano (URL + anon key del nuevo proyecto).

El comando **no** crea el proyecto Supabase ni el `.env.local`: el proyecto ya existe (el usuario da
la connection string) y el env lo arma él.

## Unidades y límites

- **`01_schema.sql`**: produce estructura. Entrada: BD vacía. Salida: esquema `wm` completo. Sin data.
- **`02_seed.sql`**: produce data mínima de arranque. Depende de `01`. Idempotente.
- **`03_owner.sql`**: crea el primer usuario. Depende de `01` (auth/profiles) y `02` (sucursal). Parametrizado, idempotente.
- **`nuevo-negocio.md`**: orquesta los tres + verificación. No contiene SQL; solo el runbook.
- **`docs/NUEVO-NEGOCIO.md`**: documentación para humanos (correr a mano sin Claude + troubleshooting).

Cada `.sql` se puede correr a mano e independientemente; el comando solo automatiza el orden y la verificación.

## Riesgos / notas

- **Inserción directa en `auth.users`**: probada en este proyecto Supabase (así se creó el admin de
  WM), pero acoplada a internos de GoTrue. Mitigación: el fallback Dashboard + `claim_profile()`.
- **`pgcrypto`** (`crypt`/`gen_salt`): disponible en Supabase; si el `search_path` no lo ve, calificar
  como `extensions.crypt(...)`.
- **Exposición PostgREST de `wm`**: tras `01`, puede requerir reload de PostgREST o, como fallback,
  añadir `wm` en Dashboard → API → Exposed schemas (ya documentado en `CLAUDE.md`).
- **Drift de esquema**: `01_schema.sql` se mantiene a mano. Riesgo de quedar desfasado respecto a
  nuevas migraciones MCP de WM. Mitigación: nota en `CLAUDE.md` + comando de re-extracción documentado
  en el README de bootstrap.

## Fuera de alcance (YAGNI)

- Crear el proyecto Supabase automáticamente.
- Generar `.env.local`.
- Catálogo base (tallas/colores/categorías) o cualquier dato demo.
- Multi-tenant en una sola BD (cada negocio es un proyecto Supabase aparte).
- Migración de datos entre negocios.
