#!/usr/bin/env bash
# Aplica TODAS las migraciones incrementales sobre un proyecto ya en marcha, en
# orden de dependencias. Pensado para poner al día un negocio que arrancó con una
# versión anterior del esquema (multi-negocio: cada negocio es su propio proyecto).
#
#   ./supabase/apply_pending.sh "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
#
# o bien, sin pasar la contraseña por la línea de comandos (queda en el historial
# del shell): poner SUPABASE_DB_URL en `.env.local` —que no se commitea— y ejecutar
#
#   ./supabase/apply_pending.sh
#
# La cadena está en Supabase → Project Settings → Database → Connection string.
# Usar el puerto **5432** (session mode), NO el 6543 (transaction mode): los índices
# CONCURRENTLY de performance_indexes.sql no corren sobre un pooler transaccional.
#
# Todos los scripts son idempotentes (`add column if not exists`, `create or replace`,
# `drop … if exists` antes de cada trigger/policy, `create index concurrently if not
# exists`), así que repetir la ejecución no hace daño. Los dos grupos de tienda se
# aplican cada uno en una transacción; performance_indexes.sql queda fuera porque
# CONCURRENTLY no admite transacción.

set -euo pipefail

cd "$(dirname "$0")/.."

DB_URL="${1:-${SUPABASE_DB_URL:-}}"

# Respaldo: leerla de .env.local para no exponerla en el historial del shell.
if [[ -z "$DB_URL" && -f .env.local ]]; then
  DB_URL="$(grep -m1 '^SUPABASE_DB_URL=' .env.local | cut -d= -f2- | tr -d ' "'"'"'' || true)"
fi

if [[ -z "$DB_URL" ]]; then
  echo "Uso: $0 <postgresql://...>" >&2
  echo "     o definir SUPABASE_DB_URL (variable de entorno o línea en .env.local)." >&2
  exit 1
fi

if [[ "$DB_URL" == *":6543/"* ]]; then
  echo "ERROR: esa cadena usa el puerto 6543 (transaction mode)." >&2
  echo "       performance_indexes.sql crea índices CONCURRENTLY y necesita el 5432." >&2
  exit 1
fi

if ! psql_version="$(psql --version 2>/dev/null)" ||
   [[ ! "$psql_version" =~ ^psql[[:space:]]+\(PostgreSQL\)[[:space:]]+([0-9]+) ]] ||
   (( BASH_REMATCH[1] < 15 )); then
  echo "ERROR: se necesita el cliente psql versión 15 o superior para aplicar las migraciones de tienda en una transacción." >&2
  exit 1
fi

echo "Proyecto: $(printf '%s' "$DB_URL" | sed -E 's#//[^:]+:[^@]*@#//***:***@#')"

run() {
  echo ""
  echo "=== $1 ==="
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$1"
}

run_tx() {
  local file
  local args=()
  echo ""
  echo "=== Transacción: $* ==="
  for file in "$@"; do
    args+=(-f "$file")
  done
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -1 "${args[@]}"
}

# 1–2. Comisiones, create_sale con IVA incluido e idempotencia por request_id,
# y pedidos online con create_sale enlazada. La sobrecarga antigua se crea y se
# elimina dentro de la misma transacción: nunca queda visible junto a la nueva.
run_tx supabase/sales_commissions.sql \
  supabase/create_sale_tax_included.sql \
  supabase/online_orders.sql \
  supabase/online_orders_sale.sql

# 3. Índices compuestos + RPCs inventory_status_counts / report_payments / write_audit.
#    Sin esto, el shell y Reportes corren por el camino de respaldo (mucho más lento).
run supabase/performance_indexes.sql

# 4. session_bootstrap: perfil + permisos en una sola llamada.
#    Necesita profiles.system_access del paso 1.
run supabase/session_bootstrap.sql

# 5. Módulo de cursos: project_groups, project_sessions, project_orders,
#    project_checkins. Necesita projects_module.sql ya aplicado.
run supabase/projects_courses.sql

# 6. Cierres diarios de caja por sucursal.
run supabase/daily_closures.sql

# 7. Catálogo clasificado (aditivo): opciones de variante, familias de color, líneas,
#    atributos, fotos por color, alias de SKU y registro de la limpieza.
run supabase/catalog_taxonomy.sql

# 8. Catálogo 3b: el texto legado de las variantes (color, color_hex, size) sigue a los
#    maestros al renombrar, y la vista de lectura wm.v_catalog. Necesita catalog_taxonomy.sql.
run supabase/catalog_view.sql

# 8b. Candados de maestros: borrar en uso → RESTRICT; nombres únicos sin mayúsculas.
run supabase/catalog_master_guards.sql

# Aplicar ANTES de desplegar la app (el POS lee v_inventory.online_held).
# Las vistas de tienda necesitan el catálogo clasificado y sus candados. El resto
# de las migraciones de tienda se aplica en una segunda transacción.
run_tx supabase/online_orders_staff.sql \
  supabase/v_inventory_online_held.sql \
  supabase/shop_schema.sql \
  supabase/shop_crear_solicitud.sql \
  supabase/storage_no_public_list.sql \
  supabase/storage_wm_public_write.sql

# 8c. Keep-alive: tabla wm.heartbeat + RPC wm.keep_alive() (Vercel Cron diario).
#     Aplicar ANTES de desplegar la app: si no, /api/keep-alive responde 500.
run supabase/keep_alive.sql

# 9. Estadísticas del planificador al día.
echo ""
echo "=== ANALYZE ==="
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "analyze wm.sales; analyze wm.sale_items; analyze wm.sale_payments; analyze wm.inventory; analyze wm.customers; analyze wm.products; analyze wm.product_variants;"

echo ""
echo "=== Verificación ==="
psql "$DB_URL" -At -c "
with esperado(clase, nombre) as (values
  ('col','profiles.commission_pct'), ('col','profiles.employee_code'),
  ('col','profiles.system_access'),  ('col','sales.seller_id'),
  ('col','sales.seller_commission_pct'), ('col','sales.request_id'),
  ('col','branches.online_enabled'), ('col','sales.online_order_id'),
  ('rpc','session_bootstrap'), ('rpc','inventory_status_counts'),
  ('rpc','report_payments'),   ('rpc','write_audit'), ('rpc','create_sale'),
  ('rpc','online_order_accept'), ('rpc','online_held'),
  ('rpc','daily_closure_preview'), ('rpc','close_daily'),
  ('tab','project_groups'), ('tab','project_sessions'),
  ('tab','project_orders'),  ('tab','project_checkins'),
  ('tab','daily_closures'),
  ('tab','online_orders'), ('tab','online_order_items'), ('tab','online_settings'),
  ('tab','option_types'), ('tab','product_media'),
  ('tab','variant_sku_aliases'), ('col','product_variants.color_id'),
  ('tab','v_catalog'), ('rpc','sync_variant_color_text'), ('rpc','sync_variant_option_text'),
  ('tab','colors_name_lower_key'),
  ('tab','heartbeat'), ('rpc','keep_alive')
)
select case when presente then '  OK    ' else '  FALTA ' end || clase || ' ' || nombre
from (
  select clase, nombre, case clase
    when 'col' then exists (
      select 1 from pg_attribute a
       where a.attrelid = ('wm.' || split_part(nombre,'.',1))::regclass
         and a.attname = split_part(nombre,'.',2) and not a.attisdropped)
    when 'rpc' then exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'wm' and p.proname = nombre)
    when 'tab' then to_regclass('wm.' || nombre) is not null
  end as presente
  from esperado
) t order by presente desc, clase, nombre;"

psql "$DB_URL" -At -c "
select case when presente then '  OK    ' else '  FALTA ' end || nombre
from (values
  ('create_sale única', (select count(*) = 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'wm' and p.proname = 'create_sale')),
  ('esquema shop', exists (select 1 from pg_namespace where nspname = 'shop')),
  ('rol storefront', exists (select 1 from pg_roles where rolname = 'storefront')),
  ('storage.objects: wm_authenticated_read', exists (select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'wm_authenticated_read')),
  ('storage.objects: wm_public_read ausente', not exists (select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'wm_public_read')),
  ('v_inventory.online_held', exists (select 1 from pg_attribute
    where attrelid = to_regclass('wm.v_inventory') and attname = 'online_held' and not attisdropped))
) as checks(nombre, presente)
order by presente desc, nombre;"

echo ""
echo "Listo. Redesplegar la app: los procesos memorizan por 5 min qué objetos existen"
echo "(lib/db-capabilities.ts), así que si no, tardan ese rato en usar los caminos nuevos."
