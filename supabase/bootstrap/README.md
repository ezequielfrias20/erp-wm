# Bootstrap del ERP para un negocio nuevo

Estos 3 scripts SQL arrancan el ERP **desde cero** sobre un proyecto Supabase vacío:
crean toda la estructura, cargan la data mínima para operar y dan de alta al owner.

| Archivo | Qué hace | Idempotente |
|---|---|---|
| `01_schema.sql` | Estructura completa (estado final): esquema `wm`, tablas, funciones, RLS, vistas, RPC, storage y ampliación de cursos. **Sin datos.** | Asume BD vacía (usa `create table`; re-correr falla si ya existe) |
| `02_seed.sql` | Seed mínimo: 6 roles, matriz de 60 permisos, 10 métodos de pago, 1 sucursal "Principal", filas `settings` y `online_settings`. | Sí (`on conflict`) |
| `03_owner.sql` | Primer usuario: crea el usuario de Auth + perfil **Super Admin**. | Sí (no duplica ni cambia contraseña existente) |

> La forma recomendada de correr todo esto es el comando de Claude **`/nuevo-negocio`**
> (ver [`docs/NUEVO-NEGOCIO.md`](../../docs/NUEVO-NEGOCIO.md)). Abajo está el modo manual.

## Requisitos

- `psql` instalado (PostgreSQL client **15+**).
- Un proyecto Supabase **nuevo** y los datos de su **session pooler** (Dashboard → **Connect** →
  Session pooler, puerto 5432): host `aws-<n>-<región>.pooler.supabase.com` (copia el `<n>` tal
  cual), usuario `postgres.<ref>` y contraseña. El host directo `db.<ref>.supabase.co` sólo tiene
  IPv6 y desde muchas redes no resuelve.
- El proyecto corre Postgres 15+ (las vistas usan `security_invoker`, que requiere PG15).

## Uso manual (sin Claude)

```bash
export PGHOST=aws-0-us-west-2.pooler.supabase.com PGPORT=5432
export PGUSER=postgres.TUREF PGDATABASE=postgres
export PGPASSWORD='TU_PASSWORD'   # por variable: los símbolos rompen una URL

# 1) Estructura
psql -X -v ON_ERROR_STOP=1 -f supabase/bootstrap/01_schema.sql

# 2) Seed mínimo (pasa el nombre del negocio)
psql -X -v ON_ERROR_STOP=1 -v company_name='ACME Uniformes' -f supabase/bootstrap/02_seed.sql

# 3) Owner (Super Admin)
psql -X -v ON_ERROR_STOP=1 \
  -v owner_email='dueno@acme.com' \
  -v owner_name='Ana Pérez' \
  -v owner_password='ContraseñaSegura.2026' \
  -f supabase/bootstrap/03_owner.sql

# 4) y 5) Lo que el snapshot no incluye: perfil+permisos en una llamada e índices
psql -X -v ON_ERROR_STOP=1 -f supabase/session_bootstrap.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/performance_indexes.sql   # CONCURRENTLY: sin -1
```

`ON_ERROR_STOP=1` aborta ante el primer error en cada paso. Esperado al final: 46 tablas y 11
vistas en `wm`, 6 roles, 60 permisos, 10 métodos de pago, 1 sucursal y el owner enlazado.

## Después del bootstrap

1. Configura el `.env.local` de la app apuntando al nuevo proyecto:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key del proyecto>
   NEXT_PUBLIC_BCV_API=...
   ```
   (URL y anon key en Dashboard → Project Settings → API.)
2. `npm run dev` → entra en `/login` con el email/contraseña del owner.
3. El owner (Super Admin, acceso total) crea sucursales, usuarios, catálogo, inventario y vende.
4. El rol `storefront` se crea **sin contraseña**. El administrador fija una fuera del repositorio
   antes de conectar la tienda: `alter role storefront password '…';`. Guarda la contraseña en el
   gestor de secretos de la tienda. Habilita cada sucursal que ofrecerá pedidos online con
   `branches.online_enabled = true`; por defecto está deshabilitada.

## Fallback: crear el owner sin `03_owner.sql`

Si la inserción directa en `auth.users` fallara (Supabase cambia los internos de GoTrue de vez en
cuando), usa el mecanismo `claim_profile` que el ERP ya trae:

1. Deja sembrado un perfil **invitado** (sin `user_id`) para el owner:
   ```sql
   insert into wm.profiles (full_name, email, role, status, branch_id)
   select 'Ana Pérez', 'dueno@acme.com', 'Super Admin', 'Activo',
          (select id from wm.branches order by code limit 1)
   on conflict (email) do nothing;
   ```
2. Crea el usuario en **Dashboard → Authentication → Users → Add user**, con el **mismo email**,
   marca **Auto Confirm User** y pon la contraseña.
3. El owner entra en `/login`; en el primer inicio `wm.claim_profile()` enlaza el perfil al usuario.

## Recetas útiles

**Resetear la contraseña del owner** (re-correr `03` no la cambia):
```sql
update auth.users
   set encrypted_password = extensions.crypt('NuevaClave', extensions.gen_salt('bf'))
 where email = 'dueno@acme.com';
```
(O Dashboard → Authentication → Users → ⋯ → Reset password.)

**Continuar otra numeración de facturas/OC** (por defecto arrancan en FAC-000001 / OC-1):
```sql
select setval('wm.invoice_seq', 8421);  -- la próxima factura será FAC-008422
select setval('wm.po_seq', 1042);       -- la próxima OC será OC-1043
```

**Empezar de nuevo (¡borra TODO el negocio!):**
```sql
drop schema wm cascade;
-- luego re-correr 01 → 02 → 03
```

## Mantener estos scripts en sync con el esquema

La parte base de `01_schema.sql` es un **snapshot escrito a mano** del estado final: al cambiar el
esquema, se debe volver a sincronizar. Su tramo final incluye mediante `\ir` las migraciones
`projects_courses.sql`, `daily_closures.sql`, `catalog_view.sql`, `catalog_master_guards.sql` y,
en orden, los siete scripts de tienda (desde `online_orders.sql` hasta
`storage_no_public_list.sql`). Los últimos redefinen `create_sale` y la política de lectura de
storage. `lib/database.types.ts` se mantiene a mano en paralelo.

El SQL real de cada migración aplicada vive en la tabla `supabase_migrations.schema_migrations` del
proyecto de referencia. Para re-extraerlo:

```sql
select name, array_to_string(statements, E'\n') as sql
from supabase_migrations.schema_migrations
order by version;
```

Al consolidar a `01_schema.sql`:
- **Excluir** los seeds demo (`wm_seed_master`, `wm_seed_profiles`, `wm_seed_catalog`,
  `wm_seed_sales`, `wm_reseed_realistic_sales`).
- **Plegar** las migraciones incrementales al estado final (p.ej. solo la última versión de
  `create_sale`; columnas añadidas vía `ALTER` van dentro del `CREATE TABLE`).
- La data que algunas migraciones traían mezclada (métodos de pago) va en `02_seed.sql`, no aquí.
