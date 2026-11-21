# Seguridad del repo: que no se vuelvan a subir secretos ni datos — diseño corto

Fecha: 2026-11-21 · Tamaño: cambio chico

## Por qué

El repo `erp-wm` pasará a **público** (cada negocio despliega desde su propio Vercel Hobby, que
sólo despliega repos privados del dueño). Ya se filtraron una contraseña y datos del negocio
(Excel de inventario, respaldos con costos). El historial se deja como está; el objetivo es que
**de ahora en adelante** no vuelva a pasar.

## Objetivos

- Bloquear antes del commit: llaves de Supabase/Resend, JWT, cadenas de conexión con contraseña,
  llaves privadas, contraseñas escritas en documentación, archivos de datos, archivos `.env` y
  archivos grandes.
- Que la protección se instale sola en cualquier clon (`npm install`) y funcione en macOS y Linux.
- Una segunda barrera en GitHub que no dependa de la máquina de quien hace push.

## No-objetivos

- Limpiar el historial (decisión del dueño: se deja).
- Escanear el código en busca de vulnerabilidades (sólo secretos y datos).

## Enfoques

- **Capas (elegido):** `.gitignore` ampliado + revisión local antes del commit (script Node
  propio, sin dependencias, versionado e instalado por `prepare`) + Secret scanning y Push
  protection de GitHub + GitHub Action con gitleaks en cada push.
- Sólo GitHub Push protection: no reconoce Excel ni respaldos de costos. Descartado.
- Sólo gitleaks local: hay que instalarlo en cada máquina y se puede saltar. Descartado.

## Diseño

- **`.gitignore`:** `*.xlsx`, `*.xls`, `*.csv`, `*.tsv`, `*.dump`, `*.sql.gz`, `*.bak`, `*.p12`,
  `*.pfx`, `*.key` en todo el repo.
- **Reglas** (`scripts/seguridad/reglas.mjs`, puras y probadas con vitest):
  - por **nombre de archivo**: extensiones de datos/llaves de arriba, `.env*` (salvo
    `.env.example`), cualquier cosa bajo `backups/`;
  - por **tamaño**: más de 5 MB;
  - por **contenido de líneas agregadas**: `sb_secret_…`, JWT (`eyJ….eyJ….…`), llaves de Resend
    (`re_…`), `postgres://usuario:contraseña@` y `PGPASSWORD=` con valor real, bloques
    `-----BEGIN … PRIVATE KEY-----`, y «password/contraseña/clave» seguida de un valor entre
    comillas o backticks en docs. Los marcadores de ejemplo (`TU_PASSWORD`, `<…>`, `***`, `...`,
    `$VAR`) no cuentan.
  - Escape explícito por línea: comentario `secreto-permitido` (para ejemplos inevitables).
- **Hook** `.githooks/pre-commit` → `node scripts/seguridad/revisar-commit.mjs`, que lee lo
  preparado (`git diff --cached`) y aborta con un mensaje en español que dice archivo, línea y
  motivo, sin imprimir el secreto. `package.json` → `"prepare": "git config core.hooksPath
  .githooks || true"` (no falla en Vercel).
- **GitHub Action** `.github/workflows/secretos.yml`: gitleaks (acción oficial, versión fija) en
  cada push y PR; falla y GitHub avisa por correo.
- **GitHub (al hacerlo público):** activar Secret scanning + Push protection por API.
- **Docs:** `docs/SEGURIDAD-REPO.md` (qué bloquea, cómo resolver un bloqueo) y una línea en
  `CLAUDE.md`.

## Decisiones mías (revisables)

- Script en Node (siempre está en un proyecto Next) en vez de bash, por portabilidad.
- Umbral de 5 MB. Escape por línea con `secreto-permitido`.
