#!/usr/bin/env bash
# Toma una foto del catálogo de producción (solo lectura) y la guarda en backups/catalogo/.
# La última línea de la salida es la ruta del JSON creado.
set -euo pipefail
cd "$(dirname "$0")/../.."

# shellcheck source=pg-env.sh
source scripts/catalogo/pg-env.sh
mkdir -p backups/catalogo

out="backups/catalogo/snapshot-$(date -u +%Y%m%dT%H%M%SZ).json"
PGOPTIONS='-c default_transaction_read_only=on' \
  psql -X -At -v ON_ERROR_STOP=1 -f scripts/catalogo/snapshot.sql > "$out"

echo "$out"
