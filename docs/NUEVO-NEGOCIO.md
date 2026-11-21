# Arrancar el ERP para un negocio nuevo

Este ERP se puede instalar para **varios negocios**: cada negocio es un **proyecto Supabase
independiente** (su propia BD, sus propios usuarios). Este documento explica cómo dejar uno listo
desde cero: estructura + data mínima + el owner (primer usuario).

Hay dos caminos:

- **Con Claude** (recomendado): el comando `/nuevo-negocio` te guía y ejecuta todo.
- **A mano**: corres 5 scripts con `psql` (ver [`supabase/bootstrap/README.md`](../supabase/bootstrap/README.md)).

Ambos usan los mismos archivos: en [`supabase/bootstrap/`](../supabase/bootstrap/)
`01_schema.sql` (estructura), `02_seed.sql` (seed mínimo) y `03_owner.sql` (owner); y en
[`supabase/`](../supabase/) `session_bootstrap.sql` y `performance_indexes.sql`, que el snapshot
no incluye.

---

## 1. Antes de empezar

1. **Crea el proyecto Supabase** del negocio (https://supabase.com/dashboard → New project).
   Anota la contraseña de base de datos que defines ahí.
2. Ten a mano los datos de conexión del **session pooler**: Dashboard → botón **Connect** →
   **Session pooler** (puerto **5432**). Necesitas el host (`aws-<n>-<región>.pooler.supabase.com`;
   el `<n>` varía entre proyectos, cópialo tal cual), el usuario `postgres.<ref>` y la contraseña.
   No uses el host directo `db.<ref>.supabase.co`: sólo tiene IPv6 y desde muchas redes no resuelve.
3. Define los datos del **owner**: email, nombre y contraseña inicial.
4. Necesitas `psql` **15+** instalado localmente (`psql --version`).
5. Guarda los secretos en un archivo `.env.cliente-<nombre>` en la raíz del repo (el `.gitignore`
   excluye `.env*`), no en el chat ni en el historial del shell. El formato está en
   `.claude/commands/nuevo-negocio.md`.

> Cada negocio es un proyecto Supabase aparte. No se mezclan datos entre negocios.

---

## 2. Camino A — con Claude (`/nuevo-negocio`)

En este repo, ejecuta el comando:

```
/nuevo-negocio
```

Claude te pedirá la connection string, el nombre del negocio y los datos del owner; luego:
verifica la conexión, avisa si el proyecto ya estaba inicializado, corre los 3 scripts en orden,
verifica el resultado y te entrega un resumen. Trata la contraseña y la connection string como
secretos (no las imprime).

---

## 3. Camino B — a mano

```bash
export PGHOST=aws-0-us-west-2.pooler.supabase.com   # el host que muestra "Connect"
export PGPORT=5432 PGUSER=postgres.TUREF PGDATABASE=postgres
export PGPASSWORD='TU_PASSWORD'                     # mejor leerla de .env.cliente-<nombre>

# 1) Estructura completa (tablas, funciones, RLS, vistas, RPC, storage, catálogo, tienda)
psql -X -v ON_ERROR_STOP=1 -f supabase/bootstrap/01_schema.sql

# 2) Seed mínimo (roles, permisos, métodos de pago, 1 sucursal, settings)
psql -X -v ON_ERROR_STOP=1 -v company_name='ACME Uniformes' -f supabase/bootstrap/02_seed.sql

# 3) Owner (Super Admin)
psql -X -v ON_ERROR_STOP=1 \
  -v owner_email='dueno@acme.com' \
  -v owner_name='Ana Pérez' \
  -v owner_password='ContraseñaSegura.2026' \
  -f supabase/bootstrap/03_owner.sql

# 4) Perfil + permisos en una sola llamada (sin esto la app funciona, pero más lenta)
psql -X -v ON_ERROR_STOP=1 -f supabase/session_bootstrap.sql

# 5) Índices de rendimiento (CONCURRENTLY: puerto 5432, sin -1)
psql -X -v ON_ERROR_STOP=1 -f supabase/performance_indexes.sql
```

Si la conexión falla: `tenant/user … not found` es host del pooler equivocado;
`password authentication failed` es contraseña incorrecta. No reintentes muchas veces: el pooler
bloquea la IP unos minutos tras varios fallos de contraseña.

Si `01_schema.sql` falla a medias en un proyecto vacío, limpia con `drop schema wm cascade;` y
repite desde el 1. Los pasos 2 a 5 son idempotentes.

Verificación rápida (esperado: 46 / 11 / 6 / 60 / 10 / 1 / 1):

```bash
psql -X -t -c "
select 'tablas wm='||count(*) from pg_tables where schemaname='wm'
union all select 'vistas wm='||count(*) from pg_views where schemaname='wm'
union all select 'roles='||count(*) from wm.roles
union all select 'permisos='||count(*) from wm.role_permissions
union all select 'metodos_pago='||count(*) from wm.payment_methods
union all select 'sucursales='||count(*) from wm.branches
union all select 'owner='||count(*) from wm.profiles where role='Super Admin' and user_id is not null;"
```

---

## 4. Qué queda creado

**Estructura:** las 46 tablas del esquema `wm` (incluye catálogo clasificado, cierres diarios,
proyectos y pedidos online), sus funciones de autorización, RLS por módulo, 11 vistas, el RPC
`create_sale`, `session_bootstrap`, el esquema `shop` y el rol `storefront` de la tienda, y el
bucket de storage `wm-public`. (Igual que la instancia de referencia, pero **sin datos**.)

**Data mínima (seed):**
- **6 roles**: Super Admin, Administrador, Gerente, Vendedor, Inventario, Cajero.
- **Matriz de permisos** (60 filas) que define qué ve/edita cada rol en los 10 módulos.
- **10 métodos de pago**: Efectivo USD/VES, Pago Móvil, Transferencia, Tarjeta débito/crédito,
  Zelle, Binance, Cashea (financiado) y Mixto.
- **1 sucursal** "Principal" (código `S01`) — el owner la renombra/edita.
- **1 fila de configuración** con el nombre del negocio.

**Lo que NO se siembra** (lo crea el owner desde la UI): categorías, marcas, tallas, colores,
proveedores, productos, inventario, clientes y ventas. Facturas y órdenes de compra arrancan en
`FAC-000001` y `OC-1`.

---

## 5. El owner y los demás usuarios

El owner queda como **Super Admin**, con acceso total a los 9 módulos. Con su email y contraseña
entra en `/login`. Desde ahí:

1. Ajusta la sucursal (Sucursales) y la configuración del negocio (Configuración).
2. Da de alta al resto del personal en **Usuarios → Invitar** (correo + rol). Cada invitado activa
   su cuenta entrando con ese correo; el ERP enlaza su perfil automáticamente
   (`wm.claim_profile()` en el primer login).
3. Carga catálogo (Productos), inventario (Inventario) y empieza a vender (Ventas / POS).

El acceso al ERP está gateado por `wm.profiles` (estar en `auth.users` no basta): solo entran
perfiles `Activo` enlazados a un usuario de Auth.

### Si la creación automática del owner falla

`03_owner.sql` inserta el usuario directo en `auth.users`. Si Supabase cambió sus internos y falla,
usa el **fallback** (perfil invitado + crear el usuario en Dashboard → Authentication → Add user con
**Auto Confirm**, mismo email; el enlace ocurre solo al primer login). Pasos exactos en
[`supabase/bootstrap/README.md`](../supabase/bootstrap/README.md).

---

## 6. Conectar la app al nuevo negocio

Cada negocio necesita **su propio despliegue** de la app (Vercel u otro), con sus propias
variables: una instancia apunta a una sola base. No sobrescribas el `.env.local` de otro negocio;
para probar en local, usa un archivo aparte. URL y llaves en Dashboard → Project Settings → API
Keys:

```bash
# Obligatorias
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # o NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SECRET_KEY=sb_secret_...                          # o SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_BCV_API=https://ve.dolarapi.com/v1/dolares/oficial
NEXT_PUBLIC_APP_URL=https://erp.negocio.com                # base del enlace de invitación

# Invitaciones por correo
RESEND_API_KEY=re_...
RESEND_FROM="Negocio <no-reply@dominio-verificado.com>"

# Recomendada: JSON de https://<ref>.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_AUTH_JWKS={"keys":[...]}
```

La llave secreta es obligatoria: la activación de una invitación (`/invite`) crea el usuario de
Auth con ella, y sin ella no se puede borrar usuarios. `CONFERENCES_*` y `COURSES_API_SECRET` sólo
hacen falta si el negocio publica inscripciones de Proyectos o cursos.

Luego despliega y entra en `/login`.

### Probarlo en local sin tocar `.env.local`

Agrega al archivo `.env.cliente-<nombre>` las llaves del proyecto (Settings → API Keys):

```
SUPABASE_URL=https://<ref>.supabase.co
PUBLISHABLE_KEY=sb_publishable_...
SECRET_KEY=sb_secret_...
```

y levanta la app con:

```bash
scripts/dev-cliente.sh .env.cliente-<nombre>        # http://localhost:3200 (o pasa otro puerto)
```

El script descarga el JWKS, comprueba que la llave abre ese proyecto y deja vacíos Resend, webhooks
y la conexión a la base salvo que el archivo traiga los suyos: nunca hereda los de `.env.local`.
Compila en `.next-cliente`, así que convive con el `npm run dev` de siempre (`.next`); sólo admite
un negocio de prueba a la vez.

### Ajustes en el panel de Supabase (una vez por proyecto)

- **Auth → Sign In / Providers → Email**: confirma que el login por email está habilitado y, si no
  configuras SMTP, desactiva la confirmación por correo.
- **Auth → URL Configuration**: pon en **Site URL** el dominio de la app del negocio.
- **Auth → Attack Protection**: activa **Leaked password protection** (recomendado).
- Si PostgREST no "viera" el esquema `wm`, añádelo en **Settings → API → Exposed schemas**
  (el script ya lo expone por SQL; esto es solo fallback).

---

## 7. Mantenimiento

`supabase/bootstrap/01_schema.sql` es un **snapshot a mano** del esquema. Si cambias el esquema del
proyecto de referencia (vía migraciones MCP), re-sincroniza ese archivo. El "cómo" está en
[`supabase/bootstrap/README.md`](../supabase/bootstrap/README.md) (sección *Mantener estos scripts
en sync*).
