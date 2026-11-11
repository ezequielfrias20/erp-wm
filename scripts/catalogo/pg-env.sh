# shellcheck shell=bash
# Exporta las variables PG* para conectar psql a PRODUCCIÓN (proyecto Supabase del ERP).
#
# NO hacer `source` en una terminal interactiva: la contraseña quedaría en el entorno de la
# sesión. Para consultas a mano usar `scripts/catalogo/psql.sh …` (corre en su propio proceso).
# Este archivo lo cargan los scripts de scripts/catalogo/, cuyo entorno muere con ellos.
#
# Lee la contraseña de la línea `SUPABASE_DB_URL=postgresql://postgres:<pass>@db.<ref>.supabase.co…`
# de `.env.local` y conecta por el pooler en modo sesión (el host directo db.<ref> sólo tiene
# IPv6). La contraseña va por PGPASSWORD porque tiene caracteres que rompen una URL.
#
# TLS: el pooler presenta un certificado de la CA privada de Supabase («Supabase Root 2021 CA»).
# Si ese certificado está en $CATALOGO_PGSSLROOTCERT (por defecto
# ~/.postgresql/supabase-prod-ca-2021.crt; se descarga en Supabase → Project Settings →
# Database → SSL Configuration), se verifica el servidor (verify-full). Si no, se cifra sin
# verificar (require) y se avisa por stderr.
#
# Host del pooler sobreescribible con CATALOGO_PGHOST (sólo *.supabase.com / *.supabase.co).

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

__catalogo_pghost="${CATALOGO_PGHOST:-aws-1-us-west-2.pooler.supabase.com}"
case "$__catalogo_pghost" in
  *.pooler.supabase.com|*.supabase.co) ;;
  *)
    echo "pg-env: host no permitido: $__catalogo_pghost (sólo *.pooler.supabase.com o *.supabase.co)" >&2
    unset PGPASSWORD __catalogo_env_file __catalogo_line __catalogo_rest __catalogo_host __catalogo_ref __catalogo_pghost
    return 1 2>/dev/null || exit 1
    ;;
esac

export PGHOST="$__catalogo_pghost"
export PGPORT=5432
export PGUSER="postgres.${__catalogo_ref}"
export PGDATABASE=postgres

__catalogo_ca="${CATALOGO_PGSSLROOTCERT:-$HOME/.postgresql/supabase-prod-ca-2021.crt}"
if [ -f "$__catalogo_ca" ]; then
  export PGSSLMODE=verify-full
  export PGSSLROOTCERT="$__catalogo_ca"
else
  export PGSSLMODE=require
  echo "pg-env: aviso: sin certificado de Supabase en $__catalogo_ca; TLS cifrado pero sin verificar el servidor." >&2
fi

unset __catalogo_env_file __catalogo_line __catalogo_rest __catalogo_host __catalogo_ref __catalogo_pghost __catalogo_ca
