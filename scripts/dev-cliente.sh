#!/usr/bin/env bash
# Levanta la app en local apuntando al proyecto Supabase de UN cliente (multi-negocio), sin tocar
# `.env.local`. Cada cliente tiene su archivo `.env.cliente-<nombre>` y su comando en package.json:
#
#   npm run dev:<nombre>                      # = scripts/dev-cliente.sh <nombre>
#   npm run dev:<nombre> -- 3500              # otro puerto
#   scripts/dev-cliente.sh <nombre> --check   # sólo valida el archivo y las llaves; no levanta nada
#
# También acepta la ruta del archivo: `scripts/dev-cliente.sh .env.cliente-<nombre> [puerto]`.
# El puerto sale, en este orden, del argumento, de `DEV_PORT` en el archivo o de 3200.
#
# Formato del archivo (el `.gitignore` excluye `.env*`): las MISMAS variables del despliegue del
# cliente, más las del bootstrap de `/nuevo-negocio`. Plantilla en `docs/NUEVO-NEGOCIO.md §6`.
#
#   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co      (o SUPABASE_URL / SUPABASE_REF)
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...  (o _ANON_KEY / PUBLISHABLE_KEY)
#   SUPABASE_SECRET_KEY=sb_secret_...                        (o _SERVICE_ROLE_KEY / SECRET_KEY)
#   SUPABASE_AUTH_JWKS, RESEND_*, CRON_SECRET, CONFERENCES_*, ... (opcionales)
#
# Cómo funciona: Next carga `.env.local`, pero las variables que ya trae el proceso ganan. Por eso
# se exportan todas las que dependen del cliente, y las que el archivo no define quedan VACÍAS a
# propósito: así nunca se heredan del `.env.local` de otro negocio (correos de Resend, webhooks,
# conexión a la base). Las que tienen un valor por defecto público (BCV, precio de entradas) sólo
# se exportan si el archivo las trae. `NEXT_PUBLIC_APP_URL` siempre es la URL local, para que los
# enlaces de invitación apunten a esta app y no al despliegue.
#
# Compila en `.next-cliente` (no en `.next`), así que convive con `npm run dev`, pero sólo admite
# un cliente a la vez. Al cambiar de cliente borra esa carpeta: el código del navegador lleva la URL
# y la llave de Supabase incrustadas al compilar, y una caché de otro cliente podría apuntar a su base.

set -euo pipefail

cd "$(dirname "$0")/.."

arg="${1:-}"
port_arg=""
check_only=0
for a in "${@:2}"; do
  case "$a" in
    --check) check_only=1 ;;
    *) port_arg="$a" ;;
  esac
done

if [[ -z "$arg" ]]; then
  echo "Uso: $0 <cliente | archivo .env> [puerto] [--check]" >&2
  echo "     p. ej. $0 join      (lee .env.cliente-join)" >&2
  echo "Clientes disponibles:" >&2
  for f in .env.cliente-*; do [[ -f "$f" ]] && echo "  - ${f#.env.cliente-}" >&2; done
  exit 1
fi

if [[ -f "$arg" ]]; then
  env_file="$arg"
else
  env_file=".env.cliente-$arg"
fi
if [[ ! -f "$env_file" ]]; then
  echo "Error: no existe $env_file." >&2
  exit 1
fi

# Lee CLAVE=valor sin ejecutar el archivo (primera aparición). Tolera espacios y comillas.
value() {
  local line
  line="$(grep -m1 -E "^[[:space:]]*$1[[:space:]]*=" "$env_file" || true)"
  [[ -z "$line" ]] && return 0
  printf '%s' "${line#*=}" | sed -E "s/^[[:space:]]+//; s/[[:space:]]+$//; s/^[\"']//; s/[\"']$//"
}
# Primer valor no vacío entre varias claves equivalentes.
first() {
  local k v
  for k in "$@"; do
    v="$(value "$k")"
    [[ -n "$v" ]] && { printf '%s' "$v"; return 0; }
  done
  return 0
}
defined() { grep -qE "^[[:space:]]*$1[[:space:]]*=" "$env_file"; }

port="${port_arg:-$(value DEV_PORT)}"
port="${port:-3200}"
if [[ ! "$port" =~ ^[0-9]+$ ]]; then
  echo "Error: el puerto debe ser un número (recibí «$port»)." >&2
  exit 1
fi

url="$(first NEXT_PUBLIC_SUPABASE_URL SUPABASE_URL)"
if [[ -z "$url" ]]; then
  ref="$(value SUPABASE_REF)"
  [[ -n "$ref" ]] && url="https://${ref}.supabase.co"
fi
url="${url%/}"
publishable="$(first NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY NEXT_PUBLIC_SUPABASE_ANON_KEY PUBLISHABLE_KEY ANON_KEY)"
secret="$(first SUPABASE_SECRET_KEY SUPABASE_SERVICE_ROLE_KEY SECRET_KEY SERVICE_ROLE_KEY)"

missing=()
[[ "$url" =~ ^https://[a-z0-9]+\.supabase\.co$ ]] || missing+=("NEXT_PUBLIC_SUPABASE_URL (https://<ref>.supabase.co)")
[[ -n "$publishable" ]] || missing+=("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
[[ -n "$secret" ]] || missing+=("SUPABASE_SECRET_KEY")
if (( ${#missing[@]} > 0 )); then
  echo "Error: faltan en $env_file:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

jwks="$(value SUPABASE_AUTH_JWKS)"
if [[ -z "$jwks" ]]; then
  if ! jwks="$(curl -fsS --max-time 10 "$url/auth/v1/.well-known/jwks.json" 2>/dev/null)" || [[ -z "$jwks" ]]; then
    echo "Error: no se pudo descargar el JWKS de $url. ¿El ref es correcto y el proyecto está activo?" >&2
    exit 1
  fi
fi

# La llave publicable debe abrir este proyecto (wm.branding() es pública). Atrapa llaves de
# otro proyecto, un proyecto pausado o un esquema sin bootstrap antes de levantar la app.
company="$(curl -fsS --max-time 10 -X POST "$url/rest/v1/rpc/branding" \
  -H "apikey: $publishable" -H "Content-Profile: wm" -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null | sed -nE 's/.*"company_name":"([^"]*)".*/\1/p' || true)"
if [[ -z "$company" ]]; then
  echo "Error: la llave publicable no abre $url, el proyecto está pausado o no tiene el bootstrap (wm.branding)." >&2
  exit 1
fi

echo "Cliente: $company · $url  ($env_file)"
resend_key="$(value RESEND_API_KEY)"
[[ -z "$resend_key" ]] && echo "Aviso:   sin RESEND_API_KEY en $env_file: las invitaciones por correo no se enviarán."

if (( check_only )); then
  echo "OK:      archivo y llaves válidos; se levantaría en http://localhost:$port"
  exit 0
fi

if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Error: el puerto $port ya está en uso. Elige otro: npm run dev:<cliente> -- <puerto>" >&2
  exit 1
fi

# Carpeta de compilación propia: Next 16 admite un solo `next dev` por carpeta, y así el cliente
# convive con el `npm run dev` de `.next`. Si la última compilación fue de otro cliente, se borra.
dist=".next-cliente"
marker="$dist/.cliente"
if [[ -d "$dist" && "$(cat "$marker" 2>/dev/null || true)" != "$url" ]]; then
  echo "Limpio:  $dist era de otro cliente; se recompila desde cero."
  rm -rf "$dist"
fi
mkdir -p "$dist"
printf '%s\n' "$url" > "$marker"
export NEXT_DIST_DIR="$dist"

export NEXT_PUBLIC_SUPABASE_URL="$url"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$publishable"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$publishable"
export SUPABASE_SECRET_KEY="$secret"
export SUPABASE_SERVICE_ROLE_KEY="$secret"
export SUPABASE_AUTH_JWKS="$jwks"
export NEXT_PUBLIC_APP_URL="http://localhost:$port"

# Dependen del cliente: del archivo o vacías; nunca las del `.env.local`.
for k in RESEND_API_KEY RESEND_FROM CRON_SECRET CONFERENCES_API_SECRET CONFERENCES_PROJECT_ID \
         CONFERENCES_WHATSAPP COURSES_API_SECRET SUPABASE_DB_URL; do
  export "$k=$(value "$k")"
done

# Tienen un valor por defecto público en el código: sólo si el archivo las define (vacías lo romperían).
for k in NEXT_PUBLIC_BCV_API NEXT_PUBLIC_BCV_HISTORIC_API CONFERENCES_TICKET_PRICE_USD; do
  if defined "$k" && [[ -n "$(value "$k")" ]]; then
    export "$k=$(value "$k")"
  fi
done

echo "App:     http://localhost:$port"

exec npx next dev -p "$port"
