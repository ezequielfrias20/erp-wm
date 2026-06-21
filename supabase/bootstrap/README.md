# Bootstrap del ERP para un negocio nuevo

Estos 3 scripts SQL arrancan el ERP **desde cero** sobre un proyecto Supabase vacío:
crean toda la estructura, cargan la data mínima para operar y dan de alta al owner.

| Archivo | Qué hace | Idempotente |
|---|---|---|
| `01_schema.sql` | Estructura completa (estado final): esquema `wm`, tablas, funciones, RLS, vistas, RPC `create_sale`, bucket de storage. **Sin datos.** | Asume BD vacía (usa `create table`; re-correr falla si ya existe) |
| `02_seed.sql` | Seed mínimo: 6 roles, matriz de 54 permisos, 10 métodos de pago, 1 sucursal "Principal", fila `settings`. | Sí (`on conflict`) |
| `03_owner.sql` | Primer usuario: crea el usuario de Auth + perfil **Super Admin**. | Sí (no duplica ni cambia contraseña existente) |

> La forma recomendada de correr todo esto es el comando de Claude **`/nuevo-negocio`**
> (ver [`docs/NUEVO-NEGOCIO.md`](../../docs/NUEVO-NEGOCIO.md)). Abajo está el modo manual.

## Requisitos

- `psql` instalado (PostgreSQL client 14+).
- Un proyecto Supabase **nuevo** y su **connection string** (Dashboard → Project Settings →
  Database → Connection string → URI). Forma:
  `postgresql://postgres:<DB_PASSWORD>@db.<ref>.supabase.co:5432/postgres`
- El proyecto corre Postgres 15+ (las vistas usan `security_invoker`, que requiere PG15).

## Uso manual (sin Claude)

```bash
CONN='postgresql://postgres:TU_PASSWORD@db.TUREF.supabase.co:5432/postgres'

# 1) Estructura
psql "$CONN" -v ON_ERROR_STOP=1 -f supabase/bootstrap/01_schema.sql

# 2) Seed mínimo (pasa el nombre del negocio)
psql "$CONN" -v ON_ERROR_STOP=1 -v company_name='ACME Uniformes' -f supabase/bootstrap/02_seed.sql

# 3) Owner (Super Admin)
psql "$CONN" -v ON_ERROR_STOP=1 \
  -v owner_email='dueno@acme.com' \
  -v owner_name='Ana Pérez' \
  -v owner_password='ContraseñaSegura.2026' \
  -f supabase/bootstrap/03_owner.sql
```

`ON_ERROR_STOP=1` aborta ante el primer error en cada paso.

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

`01_schema.sql` es un **snapshot a mano** del estado final del esquema (igual que
`lib/database.types.ts`). El desarrollo del proyecto de referencia sigue aplicando migraciones por
MCP. Al cambiar el esquema allá, re-sincroniza aquí.

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
