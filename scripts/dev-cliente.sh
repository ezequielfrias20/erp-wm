#!/usr/bin/env bash
# Levanta la app en local apuntando al proyecto Supabase de OTRO negocio (multi-negocio),
# sin tocar `.env.local`.
#
#   scripts/dev-cliente.sh .env.cliente-<nombre> [puerto]      # puerto por defecto: 3200
#
# El archivo del negocio (el `.gitignore` excluye `.env*`) usa estas claves, una por línea:
#
#   SUPABASE_URL=https://<ref>.supabase.co     (o SUPABASE_REF=<ref>)
#   PUBLISHABLE_KEY=sb_publishable_...         (o ANON_KEY=...)
#   SECRET_KEY=sb_secret_...                   (o SERVICE_ROLE_KEY=...)
#   RESEND_API_KEY=... / RESEND_FROM=...       (opcionales: sin ellas no salen invitaciones)
#   CRON_SECRET=...                            (opcional: cierra /api/keep-alive)
#
# Las mismas que usa `/nuevo-negocio` (PGHOST, PGPASSWORD, COMPANY_NAME, OWNER_*) pueden vivir
# en el mismo archivo; este script las ignora. El JWKS se descarga del proyecto (es público).
#
# Puede correr a la vez que `npm run dev` (compila en `.next-cliente`, no en `.next`), pero sólo
# un negocio de prueba a la vez.
#
# Cómo funciona: Next carga `.env.local`, pero las variables que ya trae el proceso ganan. Por
# eso se exportan todas las que importan, y las que el negocio no define quedan VACÍAS a
# propósito: así nunca se heredan del `.env.local` de otro negocio (correos de Resend,
# webhooks, conexión a la base).

set -euo pipefail

cd "$(dirname "$0")/.."

env_file="${1:-}"
port="${2:-3200}"

if [[ -z "$env_file" || ! -f "$env_file" ]]; then
  echo "Uso: $0 <archivo .env del negocio> [puerto]" >&2
  echo "     p. ej. $0 .env.cliente-pruebas 3200" >&2
  exit 1
fi

if [[ ! "$port" =~ ^[0-9]+$ ]]; then
  echo "Error: el puerto debe ser un número (recibí «$port»)." >&2
  exit 1
fi

# Lee CLAVE=valor sin ejecutar el archivo. Tolera espacios alrededor del «=» y comillas.
value() {
  local line
  line="$(grep -m1 -E "^[[:space:]]*$1[[:space:]]*=" "$env_file" || true)"
  [[ -z "$line" ]] && return 0
  printf '%s' "${line#*=}" | sed -E "s/^[[:space:]]+//; s/[[:space:]]+$//; s/^[\"']//; s/[\"']$//"
}

url="$(value SUPABASE_URL)"
if [[ -z "$url" ]]; then
  ref="$(value SUPABASE_REF)"
  [[ -n "$ref" ]] && url="https://${ref}.supabase.co"
fi
url="${url%/}"

publishable="$(value PUBLISHABLE_KEY)"
[[ -z "$publishable" ]] && publishable="$(value ANON_KEY)"
secret="$(value SECRET_KEY)"
[[ -z "$secret" ]] && secret="$(value SERVICE_ROLE_KEY)"

missing=()
[[ "$url" =~ ^https://[a-z0-9]+\.supabase\.co$ ]] || missing+=("SUPABASE_URL (https://<ref>.supabase.co) o SUPABASE_REF")
[[ -n "$publishable" ]] || missing+=("PUBLISHABLE_KEY")
[[ -n "$secret" ]] || missing+=("SECRET_KEY")
if (( ${#missing[@]} > 0 )); then
  echo "Error: faltan en $env_file:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Error: el puerto $port ya está en uso. Elige otro: $0 $env_file <puerto>" >&2
  exit 1
fi

if ! jwks="$(curl -fsS --max-time 10 "$url/auth/v1/.well-known/jwks.json" 2>/dev/null)" || [[ -z "$jwks" ]]; then
  echo "Error: no se pudo descargar el JWKS de $url. ¿El ref es correcto y el proyecto está activo?" >&2
  exit 1
fi

# La llave publicable debe abrir este proyecto (wm.branding() es pública). Atrapa llaves de
# otro proyecto o un esquema sin bootstrap antes de levantar la app.
company="$(curl -fsS --max-time 10 -X POST "$url/rest/v1/rpc/branding" \
  -H "apikey: $publishable" -H "Content-Profile: wm" -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null | sed -nE 's/.*"company_name":"([^"]*)".*/\1/p' || true)"
if [[ -z "$company" ]]; then
  echo "Error: la PUBLISHABLE_KEY no abre $url, o el negocio no tiene el bootstrap (wm.branding)." >&2
  exit 1
fi

# Carpeta de compilación propia: Next 16 admite un solo `next dev` por carpeta, y así este
# negocio convive con el `npm run dev` de `.next`. (Dos negocios de prueba a la vez no.)
export NEXT_DIST_DIR=".next-cliente"

export NEXT_PUBLIC_SUPABASE_URL="$url"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$publishable"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$publishable"
export SUPABASE_SECRET_KEY="$secret"
export SUPABASE_SERVICE_ROLE_KEY="$secret"
export SUPABASE_AUTH_JWKS="$jwks"
export NEXT_PUBLIC_APP_URL="http://localhost:$port"

# Sólo los del negocio; nunca los del `.env.local`.
export RESEND_API_KEY="$(value RESEND_API_KEY)"
export RESEND_FROM="$(value RESEND_FROM)"
export CRON_SECRET="$(value CRON_SECRET)"
export CONFERENCES_API_SECRET=""
export CONFERENCES_PROJECT_ID=""
export COURSES_API_SECRET=""
export SUPABASE_DB_URL=""

echo "Negocio: $company · $url"
echo "App:     http://localhost:$port"
[[ -z "$RESEND_API_KEY" ]] && echo "Aviso:   sin RESEND_API_KEY en $env_file: las invitaciones por correo no se enviarán."

exec npx next dev -p "$port"
