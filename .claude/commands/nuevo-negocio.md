---
description: Arranca el ERP desde cero en un proyecto Supabase nuevo (estructura + seed mínimo + owner)
---

Eres el operador del arranque de un negocio nuevo de este ERP. Tu trabajo es dejar una base de
datos Supabase **vacía** lista para operar: estructura completa, data mínima y el owner (primer
usuario). Sigue estos pasos **en orden** y no inventes SQL: usa los archivos de
`supabase/bootstrap/`.

## 0. Pre-chequeos

- Confirma que `psql` está disponible: `psql --version` (necesitas 14+).
- Confirma que existen los 3 archivos: `supabase/bootstrap/01_schema.sql`, `02_seed.sql`, `03_owner.sql`.

## 1. Pedir datos (NO los inventes; pídeselos al usuario)

Pide al usuario, en texto, y espera su respuesta:

1. **Connection string** del proyecto Supabase nuevo
   (`postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres`).
   Está en Dashboard → Project Settings → Database → Connection string → **URI**.
2. **Nombre del negocio** (para `settings.company_name`).
3. **Owner**: email, nombre completo y contraseña inicial.

Trata la connection string y la contraseña como **secretos**: guárdalos en variables de shell y
**no los imprimas** en los mensajes ni en los comandos visibles. Usa `export CONN='...'` una vez y
luego `"$CONN"`.

Si el usuario pasó argumentos al comando (`$ARGUMENTS`), úsalos como pistas, pero igual confirma los
datos sensibles que falten.

## 2. Verificar conexión y estado

```bash
psql "$CONN" -t -c "select 'ok'"
```
Si falla, detente y reporta el error (típico: password o ref mal copiados).

Comprueba si el esquema `wm` ya existe (negocio ya inicializado):
```bash
psql "$CONN" -t -c "select count(*) from information_schema.schemata where schema_name='wm'"
```
- Si devuelve `0`: continúa.
- Si devuelve `1`: **detente y avisa** que ese proyecto ya tiene el ERP. No corras `01_schema.sql`
  (fallaría/pisaría datos). Pregunta explícitamente si quiere (a) solo re-aplicar seed/owner sobre
  lo existente, o (b) empezar de cero (eso implica `drop schema wm cascade;`, que **borra todo** —
  solo si lo confirma sin ambigüedad).

## 3. Ejecutar el bootstrap (en orden, abortando ante error)

```bash
# 1) Estructura
psql "$CONN" -v ON_ERROR_STOP=1 -f supabase/bootstrap/01_schema.sql

# 2) Seed mínimo
psql "$CONN" -v ON_ERROR_STOP=1 -v company_name="NOMBRE_DEL_NEGOCIO" -f supabase/bootstrap/02_seed.sql

# 3) Owner (Super Admin)
psql "$CONN" -v ON_ERROR_STOP=1 \
  -v owner_email="EMAIL" \
  -v owner_name="NOMBRE" \
  -v owner_password="PASSWORD" \
  -f supabase/bootstrap/03_owner.sql
```

Reemplaza los placeholders por los datos reales (entre comillas, ojo con espacios y acentos).
Revisa el código de salida de cada `psql`; si uno falla, detente y reporta el error textual.

Si `03_owner.sql` falla por algo de `auth.users`, NO insistas: aplica el **fallback** documentado
en `supabase/bootstrap/README.md` (perfil invitado + crear el usuario en el Dashboard +
`claim_profile` en el primer login) y explícaselo al usuario.

## 4. Verificar el resultado

```bash
psql "$CONN" -t -c "
select 'tablas wm='||count(*) from pg_tables where schemaname='wm'
union all select 'vistas wm='||count(*) from pg_views where schemaname='wm'
union all select 'roles='||count(*) from wm.roles
union all select 'permisos='||count(*) from wm.role_permissions
union all select 'metodos_pago='||count(*) from wm.payment_methods
union all select 'sucursales='||count(*) from wm.branches
union all select 'owner_superadmin='||count(*) from wm.profiles where role='Super Admin' and user_id is not null;"
```
Valores esperados: tablas wm=24, vistas wm=6, roles=6, permisos=54, metodos_pago=10,
sucursales=1, owner_superadmin=1.

## 5. Reportar al usuario

Entrega un resumen claro:
- ✅/❌ de cada paso (estructura, seed, owner) y la verificación.
- Credenciales del owner (email; recuérdale la contraseña que eligió).
- Recordatorio: el `.env.local` lo arma él a mano con la **URL** y la **anon key** del proyecto
  (Dashboard → Project Settings → API) — ver `supabase/bootstrap/README.md`.
- Siguiente paso: `npm run dev` → entrar en `/login` con el owner; desde ahí crea sucursales,
  usuarios, catálogo e inventario.

No marques el arranque como exitoso sin haber visto la verificación del paso 4 en verde.
