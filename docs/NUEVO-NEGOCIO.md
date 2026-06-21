# Arrancar el ERP para un negocio nuevo

Este ERP se puede instalar para **varios negocios**: cada negocio es un **proyecto Supabase
independiente** (su propia BD, sus propios usuarios). Este documento explica cómo dejar uno listo
desde cero: estructura + data mínima + el owner (primer usuario).

Hay dos caminos:

- **Con Claude** (recomendado): el comando `/nuevo-negocio` te guía y ejecuta todo.
- **A mano**: corres 3 scripts con `psql` (ver [`supabase/bootstrap/README.md`](../supabase/bootstrap/README.md)).

Ambos usan los mismos archivos en [`supabase/bootstrap/`](../supabase/bootstrap/):
`01_schema.sql` (estructura), `02_seed.sql` (seed mínimo), `03_owner.sql` (owner).

---

## 1. Antes de empezar

1. **Crea el proyecto Supabase** del negocio (https://supabase.com/dashboard → New project).
   Anota la contraseña de base de datos que defines ahí.
2. Ten a mano la **connection string**: Dashboard → Project Settings → Database → Connection string
   → **URI**:
   ```
   postgresql://postgres:<DB_PASSWORD>@db.<ref>.supabase.co:5432/postgres
   ```
3. Define los datos del **owner**: email, nombre y contraseña inicial.
4. Necesitas `psql` 14+ instalado localmente (`psql --version`).

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
export CONN='postgresql://postgres:TU_PASSWORD@db.TUREF.supabase.co:5432/postgres'

# 1) Estructura completa (tablas, funciones, RLS, vistas, RPC, storage)
psql "$CONN" -v ON_ERROR_STOP=1 -f supabase/bootstrap/01_schema.sql

# 2) Seed mínimo (roles, permisos, métodos de pago, 1 sucursal, settings)
psql "$CONN" -v ON_ERROR_STOP=1 -v company_name='ACME Uniformes' -f supabase/bootstrap/02_seed.sql

# 3) Owner (Super Admin)
psql "$CONN" -v ON_ERROR_STOP=1 \
  -v owner_email='dueno@acme.com' \
  -v owner_name='Ana Pérez' \
  -v owner_password='ContraseñaSegura.2026' \
  -f supabase/bootstrap/03_owner.sql
```

Verificación rápida (esperado: 24 / 6 / 6 / 54 / 10 / 1 / 1):

```bash
psql "$CONN" -t -c "
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

**Estructura:** las 24 tablas del esquema `wm`, sus funciones de autorización, RLS por módulo, 6
vistas, el RPC `create_sale` y el bucket de storage `wm-public`. (Igual que la instancia de
referencia, pero **sin datos**.)

**Data mínima (seed):**
- **6 roles**: Super Admin, Administrador, Gerente, Vendedor, Inventario, Cajero.
- **Matriz de permisos** (54 filas) que define qué ve/edita cada rol en los 9 módulos.
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

Configura `.env.local` apuntando al proyecto del negocio (URL y anon key en Dashboard → Project
Settings → API):

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_BCV_API=https://ve.dolarapi.com/v1/dolares/oficial
```

Luego `npm run dev` y entra en `/login`.

### Ajustes en el panel de Supabase (una vez por proyecto)

- **Auth → Providers → Email**: confirma que el registro/login por email está habilitado y, si no
  configuras SMTP, desactiva la confirmación por correo (o usa "Auto Confirm" al invitar).
- **Auth → Policies**: activa **Leaked password protection** (recomendado).
- Si PostgREST no "viera" el esquema `wm`, añádelo en **Settings → API → Exposed schemas**
  (el script ya lo expone por SQL; esto es solo fallback).

---

## 7. Mantenimiento

`supabase/bootstrap/01_schema.sql` es un **snapshot a mano** del esquema. Si cambias el esquema del
proyecto de referencia (vía migraciones MCP), re-sincroniza ese archivo. El "cómo" está en
[`supabase/bootstrap/README.md`](../supabase/bootstrap/README.md) (sección *Mantener estos scripts
en sync*).
