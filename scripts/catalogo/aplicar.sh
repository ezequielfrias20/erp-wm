#!/usr/bin/env bash
# Aplica un plan de limpieza del catálogo (JSON de `npm run catalogo:limpieza`).
#
#   scripts/catalogo/aplicar.sh backups/catalogo/plan-<UTC>.json             # simulación (ROLLBACK)
#   scripts/catalogo/aplicar.sh backups/catalogo/plan-<UTC>.json --aplicar   # de verdad (COMMIT)
#
# Ver docs/CATALOGO-LIMPIEZA.md. La aplicación real va en horario sin ventas.
set -euo pipefail
cd "$(dirname "$0")/../.."

usage() {
  echo "Uso: scripts/catalogo/aplicar.sh <plan.json> [--aplicar]" >&2
  exit 1
}

[ $# -ge 1 ] && [ $# -le 2 ] || usage
plan=$1
mode=${2:-}
[ -f "$plan" ] || { echo "No existe el plan: $plan" >&2; exit 1; }

commit=0
if [ "$mode" = "--aplicar" ]; then
  read -r -p "Esto modifica PRODUCCIÓN. Escribe APLICAR para continuar: " answer
  [ "$answer" = "APLICAR" ] || { echo "Cancelado." >&2; exit 1; }
  commit=1
elif [ -n "$mode" ]; then
  usage
fi

plan_abs="$(cd "$(dirname "$plan")" && pwd)/$(basename "$plan")"
exec scripts/catalogo/psql.sh -X -q \
  -v ON_ERROR_STOP=1 \
  -v plan_path="$plan_abs" \
  -v commit="$commit" \
  -v backup_schema="wm_respaldo_catalogo_$(date -u +%Y%m%d)" \
  -f scripts/catalogo/aplicar.sql
