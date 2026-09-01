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
# exists`), así que repetir la ejecución no hace daño. NO se usa --single-transaction:
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

echo "Proyecto: $(printf '%s' "$DB_URL" | sed -E 's#//[^:]+:[^@]*@#//***:***@#')"

run() {
  echo ""
  echo "=== $1 ==="
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$1"
}

# 1. Comisiones: profiles.{commission_pct, employee_code, system_access},
#    sales.{seller_id, seller_commission_pct}. Sin esto, dar de alta un usuario falla
#    con «Could not find the 'commission_pct' column of 'profiles'».
run supabase/sales_commissions.sql

# 2. create_sale con IVA incluido + idempotencia por request_id (sales.request_id).
#    Depende de las columnas del paso 1.
run supabase/create_sale_tax_included.sql

# 3. Índices compuestos + RPCs inventory_status_counts / report_payments / write_audit.
#    Sin esto, el shell y Reportes corren por el camino de respaldo (mucho más lento).
run supabase/performance_indexes.sql

# 4. session_bootstrap: perfil + permisos en una sola llamada.
#    Necesita profiles.system_access del paso 1.
run supabase/session_bootstrap.sql

# 5. Módulo de cursos: project_groups, project_sessions, project_orders,
#    project_checkins. Necesita projects_module.sql ya aplicado.
run supabase/projects_courses.sql

# 6. Estadísticas del planificador al día.
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
  ('rpc','session_bootstrap'), ('rpc','inventory_status_counts'),
  ('rpc','report_payments'),   ('rpc','write_audit'), ('rpc','create_sale'),
  ('tab','project_groups'), ('tab','project_sessions'),
  ('tab','project_orders'),  ('tab','project_checkins')
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

echo ""
echo "Listo. Redesplegar la app: los procesos memorizan por 5 min qué objetos existen"
echo "(lib/db-capabilities.ts), así que si no, tardan ese rato en usar los caminos nuevos."
