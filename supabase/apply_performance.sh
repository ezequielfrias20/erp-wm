#!/usr/bin/env bash
# Aplica en orden las migraciones de rendimiento pendientes en un proyecto ya en marcha.
#
#   ./supabase/apply_performance.sh "postgresql://postgres.<ref>:<password>@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
#
# La cadena de conexión está en Supabase -> Project Settings -> Database -> Connection string
# (usar el puerto 5432 / session mode, NO el 6543 de transaction mode: los índices
# CONCURRENTLY no pueden correr sobre un pooler transaccional).
#
# Todos los scripts son idempotentes (`add column if not exists`, `create or replace`,
# `create index concurrently if not exists`), así que se puede repetir sin daño.
# NO se usa --single-transaction: CONCURRENTLY no admite transacción.

set -euo pipefail

DB_URL="${1:-${SUPABASE_DB_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "Uso: $0 <postgresql://...>   (o exportar SUPABASE_DB_URL)" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

run() {
  echo ""
  echo "=== $1 ==="
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$1"
}

# 1. Columnas de comisiones (profiles.commission_pct, sales.seller_commission_pct).
#    La app hoy las detecta ausentes y repite cada consulta de Reportes dos veces.
run supabase/sales_commissions.sql

# 2. create_sale con IVA incluido + idempotencia por request_id.
#    Depende de las columnas del paso 1.
run supabase/create_sale_tax_included.sql

# 3. Índices compuestos + RPCs inventory_status_counts / report_payments / write_audit.
#    Sin esto, el shell y Reportes corren por el camino de respaldo (mucho más lento).
run supabase/performance_indexes.sql

# 4. session_bootstrap: perfil + permisos en una sola llamada.
run supabase/session_bootstrap.sql

# 5. Estadísticas del planificador al día.
echo ""
echo "=== ANALYZE ==="
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "analyze wm.sales; analyze wm.sale_items; analyze wm.sale_payments; analyze wm.inventory; analyze wm.customers; analyze wm.products; analyze wm.product_variants;"

echo ""
echo "=== Verificación ==="
psql "$DB_URL" -At -c "
select 'rpc  ' || p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'wm'
   and p.proname in ('inventory_status_counts','report_payments','write_audit','session_bootstrap')
union all
select 'col  sales.' || a.attname
  from pg_attribute a
 where a.attrelid = 'wm.sales'::regclass
   and a.attname in ('request_id','seller_commission_pct')
   and not a.attisdropped
union all
select 'col  profiles.commission_pct'
  from pg_attribute a
 where a.attrelid = 'wm.profiles'::regclass
   and a.attname = 'commission_pct' and not a.attisdropped
union all
select 'idx  ' || indexname
  from pg_indexes
 where schemaname = 'wm'
   and indexname in (
     'sales_branch_created_desc_idx','sales_branch_status_created_desc_idx',
     'sales_customer_status_idx','customers_branch_name_idx',
     'customers_branch_document_lower_idx','inventory_branch_quantity_idx',
     'purchase_orders_status_expected_idx','audit_log_created_desc_idx',
     'role_permissions_role_idx','sales_user_request_uidx'
   )
order by 1;"

echo ""
echo "Listo. Redesplegar la app para que los procesos recarguen las capacidades detectadas."
