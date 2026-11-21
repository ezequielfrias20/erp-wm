---
description: Arranca el ERP desde cero en un proyecto Supabase nuevo (estructura + seed mínimo + owner)
---

Eres el operador del arranque de un negocio nuevo de este ERP. Tu trabajo es dejar una base de
datos Supabase **vacía** lista para operar: estructura completa, data mínima, el owner (primer
usuario) y las dos piezas de rendimiento que el snapshot no incluye. Sigue estos pasos **en orden**
y no inventes SQL: usa los archivos de `supabase/bootstrap/` y `supabase/`.

## 0. Pre-chequeos

- Confirma que `psql` está disponible: `psql --version` (necesitas **15+**: los scripts de tienda
  y las vistas `security_invoker` lo exigen).
- Confirma que existen `supabase/bootstrap/01_schema.sql`, `02_seed.sql`, `03_owner.sql`,
  `supabase/session_bootstrap.sql` y `supabase/performance_indexes.sql`.

## 1. Pedir datos (NO los inventes; pídeselos al usuario)

1. **Project ref** del proyecto Supabase nuevo (va en la URL `https://<ref>.supabase.co`).
2. **Host del session pooler**: Dashboard → botón **Connect** → **Session pooler** (puerto
   **5432**). Forma: `aws-<n>-<región>.pooler.supabase.com`. El `<n>` (0, 1…) cambia de proyecto
   a proyecto: no lo supongas, cópialo.
3. **Contraseña de la base de datos** (la que se definió al crear el proyecto).
4. **Nombre del negocio** (para `settings.company_name`).
5. **Owner**: email, nombre completo y contraseña inicial.

Los secretos (contraseña de la base y del owner) **no se piden por el chat**: el usuario los deja
en un archivo `.env.cliente-<nombre>` en la raíz (el `.gitignore` excluye `.env*`), por ejemplo:

```
SUPABASE_URL=https://abcd1234.supabase.co
PGHOST=aws-0-us-west-2.pooler.supabase.com
PGPASSWORD=...
COMPANY_NAME=Nombre del Negocio
OWNER_NAME=Nombre Apellido
OWNER_EMAIL=dueno@negocio.com
OWNER_PASSWORD=...
# Para levantar la app en local con scripts/dev-cliente.sh (Settings → API Keys):
PUBLISHABLE_KEY=sb_publishable_...
SECRET_KEY=sb_secret_...
```

Léelos a variables de shell con `grep` (nunca con `source`: el archivo puede traer líneas que no
son de shell) y **no los imprimas** en mensajes ni en comandos visibles. Para ver qué trae, lista
sólo nombres y largos.
Si `$ARGUMENTS` trae pistas (p. ej. el nombre del archivo), úsalas, pero confirma lo que falte.

**Conexión.** No uses el host directo `db.<ref>.supabase.co`: sólo tiene IPv6 y desde muchas
redes no resuelve. Usa el session pooler con el usuario `postgres.<ref>` y la contraseña por
`PGPASSWORD` (si va dentro de una URL, los símbolos la rompen):

```bash
export PGHOST=<host del pooler> PGPORT=5432 PGUSER=postgres.<ref> PGDATABASE=postgres
export PGPASSWORD=<desde el archivo>
```

## 2. Verificar conexión y estado

```bash
psql -X -t -c "select 'ok'"
```

Lee el error si falla, y **no repitas a ciegas**: el pooler bloquea la IP unos minutos tras varios
intentos con contraseña errónea.

- `tenant/user postgres.<ref> not found` → host del pooler equivocado (región o `aws-<n>`).
- `password authentication failed` → contraseña incorrecta: detente y pídela de nuevo.

Comprueba si el esquema `wm` ya existe (negocio ya inicializado):
```bash
psql -X -t -c "select count(*) from information_schema.schemata where schema_name='wm'"
```
- Si devuelve `0`: continúa.
- Si devuelve `1`: **detente y avisa** que ese proyecto ya tiene el ERP. No corras `01_schema.sql`
  (fallaría/pisaría datos). Pregunta explícitamente si quiere (a) solo re-aplicar seed/owner sobre
  lo existente, (b) ponerlo al día con `supabase/apply_pending.sh`, o (c) empezar de cero (eso
  implica `drop schema wm cascade;`, que **borra todo** — solo si lo confirma sin ambigüedad).

## 3. Ejecutar el bootstrap (en orden, abortando ante error)

```bash
# 1) Estructura (incluye por \ir catálogo, cierres, proyectos y tienda)
psql -X -v ON_ERROR_STOP=1 -f supabase/bootstrap/01_schema.sql

# 2) Seed mínimo
psql -X -v ON_ERROR_STOP=1 -v company_name="$COMPANY_NAME" -f supabase/bootstrap/02_seed.sql

# 3) Owner (Super Admin)
psql -X -v ON_ERROR_STOP=1 \
  -v owner_email="$OWNER_EMAIL" \
  -v owner_name="$OWNER_NAME" \
  -v owner_password="$OWNER_PASSWORD" \
  -f supabase/bootstrap/03_owner.sql

# 4) Perfil + permisos en una sola llamada (la app tiene respaldo, pero sin esto cada
#    navegación hace dos viajes extra a la base)
psql -X -v ON_ERROR_STOP=1 -f supabase/session_bootstrap.sql

# 5) Índices de rendimiento (CONCURRENTLY: puerto 5432 y SIN -1 / transacción)
psql -X -v ON_ERROR_STOP=1 -f supabase/performance_indexes.sql
```

Revisa el código de salida de cada `psql`; si uno falla, detente y reporta el error textual.
Si `01_schema.sql` falla a medias en un proyecto que estaba vacío, se limpia con
`drop schema wm cascade;` y se repite desde el 1. Los pasos 2 a 5 son idempotentes.

Si `03_owner.sql` falla por algo de `auth.users`, NO insistas: aplica el **fallback** documentado
en `supabase/bootstrap/README.md` (perfil invitado + crear el usuario en el Dashboard +
`claim_profile` en el primer login) y explícaselo al usuario.

## 4. Verificar el resultado

```bash
psql -X -t -c "
select 'tablas wm='||count(*) from pg_tables where schemaname='wm'
union all select 'vistas wm='||count(*) from pg_views where schemaname='wm'
union all select 'roles='||count(*) from wm.roles
union all select 'permisos='||count(*) from wm.role_permissions
union all select 'metodos_pago='||count(*) from wm.payment_methods
union all select 'sucursales='||count(*) from wm.branches
union all select 'owner_superadmin='||count(*) from wm.profiles where role='Super Admin' and user_id is not null
union all select 'session_bootstrap='||count(*) from pg_proc where proname='session_bootstrap'
  and pronamespace='wm'::regnamespace;"
```
Valores esperados: tablas wm=45, vistas wm=11, roles=6, permisos=60 (6 roles × 10 módulos),
metodos_pago=10, sucursales=1, owner_superadmin=1, session_bootstrap=1.

## 5. Reportar al usuario

Entrega un resumen claro:
- ✅/❌ de cada paso (estructura, seed, owner, session_bootstrap, índices) y la verificación.
- Credenciales del owner (email; recuérdale la contraseña que eligió, sin escribirla).
- Las variables del despliegue de ese negocio (ver `docs/NUEVO-NEGOCIO.md §6`):
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (o `_ANON_KEY`),
  `SUPABASE_SECRET_KEY` (obligatoria: la activación de invitaciones la usa),
  `NEXT_PUBLIC_BCV_API`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY` + `RESEND_FROM` (invitaciones)
  y `SUPABASE_AUTH_JWKS` (recomendada). Nunca sobrescribas el `.env.local` existente: apunta a otro
  negocio.
- Ajustes de panel pendientes (Auth → Email, Site URL, Leaked password protection).
- Para probar en local: con `PUBLISHABLE_KEY` y `SECRET_KEY` en el archivo,
  `scripts/dev-cliente.sh .env.cliente-<nombre>` levanta la app en http://localhost:3200 sin tocar
  `.env.local` (convive con `npm run dev`).
- Siguiente paso: desplegar la app con esas variables → entrar en `/login` con el owner; desde ahí
  crea sucursales, usuarios, catálogo e inventario.

No marques el arranque como exitoso sin haber visto la verificación del paso 4 en verde.
