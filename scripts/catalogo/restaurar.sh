#!/usr/bin/env bash
# Deshace una limpieza del catálogo YA APLICADA, desde su esquema de respaldo.
#
#   scripts/catalogo/restaurar.sh <esquema_respaldo> <run_id>             # simulación (ROLLBACK)
#   scripts/catalogo/restaurar.sh <esquema_respaldo> <run_id> --aplicar   # de verdad (COMMIT)
#
# run_id = «runId» del plan aplicado (también en wm.catalog_migration_log). Conserva ventas y
# movimientos de stock posteriores. Ver docs/CATALOGO-LIMPIEZA.md §6.
set -euo pipefail
cd "$(dirname "$0")/../.."

usage() {
  echo "Uso: scripts/catalogo/restaurar.sh <esquema_respaldo> <run_id> [--aplicar]" >&2
  exit 1
}
[ $# -ge 2 ] && [ $# -le 3 ] || usage
schema=$1
run_id=$2
mode=${3:-}
[[ "$schema" =~ ^wm_respaldo_catalogo_[0-9]{8}$ ]] || { echo "Esquema de respaldo inválido: $schema" >&2; exit 1; }
[[ "$run_id" =~ ^[0-9a-f-]{36}$ ]] || { echo "run_id inválido: $run_id" >&2; exit 1; }

end="rollback; \\echo 'SIMULACIÓN de la restauración: todo se deshizo (ROLLBACK).'"
if [ "$mode" = "--aplicar" ]; then
  read -r -p "Esto RESTAURA el catálogo de PRODUCCIÓN. Escribe RESTAURAR para continuar: " answer
  [ "$answer" = "RESTAURAR" ] || { echo "Cancelado." >&2; exit 1; }
  end="commit; \\echo 'RESTAURADO (COMMIT).'"
elif [ -n "$mode" ]; then
  usage
fi

{
  echo "begin;"
  echo "set local lock_timeout = '5s';"
  echo "set local statement_timeout = '120s';"
  echo "lock table wm.products, wm.product_variants, wm.inventory, wm.sale_items, wm.purchase_order_items, wm.categories, wm.brands, wm.colors in share row exclusive mode;"
  echo "\\ir scripts/catalogo/restaurar.sql"
  echo "$end"
} | scripts/catalogo/psql.sh -X -q -v ON_ERROR_STOP=1 -v backup_schema="$schema" -v run_id="$run_id"
