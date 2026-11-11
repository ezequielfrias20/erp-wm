# shellcheck shell=bash
# Exporta las variables PG* para conectar psql a PRODUCCIÓN (proyecto Supabase del ERP).
# Uso:  source scripts/catalogo/pg-env.sh
#
# Lee la contraseña de la línea `SUPABASE_DB_URL=postgresql://postgres:<pass>@db.<ref>.supabase.co…`
# de `.env.local` y conecta por el pooler en modo sesión (el host directo db.<ref> sólo tiene
# IPv6). La contraseña va por PGPASSWORD porque tiene caracteres que rompen una URL.
# Host del pooler sobreescribible con CATALOGO_PGHOST.

__catalogo_env_file="${CATALOGO_ENV_FILE:-.env.local}"
__catalogo_line="$(grep -m1 -E '^SUPABASE_DB_URL=postgresql://[^#]*@db\.' "$__catalogo_env_file" 2>/dev/null || true)"

if [ -z "$__catalogo_line" ]; then
  echo "pg-env: no encontré en $__catalogo_env_file una línea SUPABASE_DB_URL=postgresql://postgres:<pass>@db.<ref>.supabase.co" >&2
  unset __catalogo_env_file __catalogo_line
  return 1 2>/dev/null || exit 1
fi

__catalogo_rest="${__catalogo_line#*://postgres:}"
# Contraseña: hasta el ÚLTIMO «@» (la contraseña podría contener «@»).
export PGPASSWORD="${__catalogo_rest%@*}"
__catalogo_host="${__catalogo_rest##*@}"
__catalogo_ref="${__catalogo_host#db.}"
__catalogo_ref="${__catalogo_ref%%.supabase.co*}"

export PGHOST="${CATALOGO_PGHOST:-aws-1-us-west-2.pooler.supabase.com}"
export PGPORT=5432
export PGUSER="postgres.${__catalogo_ref}"
export PGDATABASE=postgres
export PGSSLMODE=require

unset __catalogo_env_file __catalogo_line __catalogo_rest __catalogo_host __catalogo_ref
