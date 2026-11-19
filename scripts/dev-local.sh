#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_LOCAL_DIR:-}" || ! -f "$SUPABASE_LOCAL_DIR/supabase/config.toml" ]]; then
  echo "Error: define SUPABASE_LOCAL_DIR con la carpeta del proyecto Supabase local (debe contener supabase/config.toml)." >&2
  exit 1
fi

if ! status_env="$(supabase status -o env --workdir "$SUPABASE_LOCAL_DIR" 2>/dev/null)"; then
  echo "Error: no se pudo consultar Supabase local. Verifica que esté iniciado en SUPABASE_LOCAL_DIR." >&2
  exit 1
fi

status_value() {
  local name="$1"
  printf '%s\n' "$status_env" | grep "^${name}=" | head -n 1 | cut -d= -f2- | tr -d '"' || true
}

local_url="$(status_value API_URL)"
local_anon="$(status_value ANON_KEY)"
local_publishable="$(status_value PUBLISHABLE_KEY)"
local_secret="$(status_value SECRET_KEY)"
local_service_role="$(status_value SERVICE_ROLE_KEY)"

if [[ -z "$local_url" || ( -z "$local_anon" && -z "$local_publishable" ) || ( -z "$local_secret" && -z "$local_service_role" ) ]]; then
  echo "Error: faltan la URL o las claves necesarias en el estado de Supabase local." >&2
  exit 1
fi

if ! local_jwks="$(curl -fsS --max-time 5 "${local_url%/}/auth/v1/.well-known/jwks.json" 2>/dev/null)"; then
  echo "Error: no se pudo obtener el JWKS de Supabase local." >&2
  exit 1
fi

if [[ -z "$local_jwks" ]]; then
  echo "Error: el JWKS de Supabase local está vacío." >&2
  exit 1
fi

export NEXT_PUBLIC_SUPABASE_URL="$local_url"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${local_anon:-$local_publishable}"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${local_publishable:-$local_anon}"
export SUPABASE_SECRET_KEY="${local_secret:-$local_service_role}"
export SUPABASE_SERVICE_ROLE_KEY="${local_service_role:-$local_secret}"
export SUPABASE_AUTH_JWKS="$local_jwks"

# En desarrollo local, nunca envíes correos reales ni aceptes webhooks de producción.
export RESEND_API_KEY=""
export RESEND_FROM=""
export CONFERENCES_API_SECRET=""
export COURSES_API_SECRET=""

exec npx next dev -p "${1:-3100}"
