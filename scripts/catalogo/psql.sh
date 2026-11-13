#!/usr/bin/env bash
# psql contra PRODUCCIÓN sin dejar la contraseña en la terminal: carga pg-env.sh dentro de
# este proceso y le pasa a psql los argumentos tal cual.
#   scripts/catalogo/psql.sh -X -f supabase/tests/catalog_taxonomy_rollback.sql
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=pg-env.sh
source scripts/catalogo/pg-env.sh
exec psql "$@"
