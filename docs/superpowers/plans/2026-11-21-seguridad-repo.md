# Seguridad del repo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que ningún secreto ni archivo de datos del negocio pueda llegar a GitHub desde ahora.

**Architecture:** Reglas puras en `scripts/seguridad/reglas.mjs` (probadas con vitest); un
revisor `scripts/seguridad/revisar-commit.mjs` aplica esas reglas a lo preparado y lo llama el
hook versionado `.githooks/pre-commit`, que `npm install` activa. Segunda barrera en GitHub:
gitleaks en Actions y Push protection.

**Tech Stack:** Node 24 (ESM, sin dependencias), vitest, git hooks, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-21-seguridad-repo-design.md`

## Global Constraints

- Sin dependencias nuevas de npm. Node ESM (`.mjs`).
- Mensajes en español; **nunca** imprimir el valor del secreto, sólo archivo, línea y tipo.
- Límite de tamaño: 5 MB (`5 * 1024 * 1024`).
- Escape por línea: la cadena `secreto-permitido` en esa línea.
- `prepare` no debe fallar fuera de un repo git (Vercel): `|| true`.

## Review Focus

- Marcadores de ejemplo de la doc existente (`TU_PASSWORD`, `<password>`, `sb_secret_...`,
  `ContraseñaSegura`, `$PGPASSWORD`) no deben bloquear. Test en Task 1.
- Archivos borrados o renombrados con extensión de datos (p. ej. quitar un `.xlsx` del repo) no
  deben bloquear: sólo lo que se agrega. Test en Task 2.
- Rutas con espacios y acentos (el repo vive en «Fr Medic Group»). Test en Task 2.
- El propio archivo de reglas y su test contienen patrones de ejemplo: no deben bloquearse a sí
  mismos. Test en Task 2.
- Un `.env.example` sí se puede commitear. Test en Task 1.

---

### Task 1: Reglas puras

**Files:** Create `scripts/seguridad/reglas.mjs`, `scripts/seguridad/reglas.test.ts`; Modify
`vitest.config.ts` (`include` suma `"scripts/**/*.test.ts"`).

**Interfaces — Produces:**
- `blockedPathReason(path: string): string | null`
- `MAX_BYTES = 5 * 1024 * 1024`
- `secretKindInLine(line: string): string | null` (tipo legible, p. ej. «llave secreta de Supabase»)

- [ ] Tests: `.xlsx`/`.csv`/`.env.local`/`backups/x.json`/`a.key` → motivo; `.env.example`,
  `app/page.tsx` → `null`. Una línea con `sb_secret_` + 20 caracteres → motivo; con JWT de tres
  partes → motivo; `re_` + 30 → motivo; `postgresql://postgres:Abc123xyz@host` → motivo;
  `PGPASSWORD=Abc123xyz` → motivo; `-----BEGIN PRIVATE KEY-----` → motivo;
  ``**Password:** `Ejemplo.Clave-77` `` → motivo. Marcadores: `postgresql://postgres:TU_PASSWORD@`,
  `PGPASSWORD='<valor>'`, `PGPASSWORD="$X"`, `sb_secret_...`, `owner_password='ContraseñaSegura'`,
  y cualquier línea con `secreto-permitido` → `null`.
- [ ] Ver fallar → implementar → ver pasar (`npx vitest run scripts/seguridad`).
- [ ] Commit.

### Task 2: Revisor y hook

**Files:** Create `scripts/seguridad/revisar-commit.mjs`, `scripts/seguridad/revisar-commit.test.ts`,
`.githooks/pre-commit` (ejecutable); Modify `package.json` (`prepare`), `.gitignore`.

**Interfaces — Consumes:** Task 1. **Produces:** `node scripts/seguridad/revisar-commit.mjs`
→ exit 0 limpio, exit 1 con lista de hallazgos en stderr.

- [ ] Test de integración: repo temporal (`git init` en `os.tmpdir()`, ruta con espacio y acento),
  stagear casos y correr el script: limpio → 0; `.xlsx` agregado → 1 y nombra el archivo;
  línea con secreto → 1, nombra archivo:línea y **no** contiene el secreto; archivo > 5 MB → 1;
  borrar un `.xlsx` ya commiteado → 0; agregar `scripts/seguridad/reglas.mjs` y su test → 0.
- [ ] Implementar con `git diff --cached --name-status -z` (sólo A/M/R/C), `git cat-file -s`
  para tamaño y `git diff --cached -U0 --no-color` para líneas `+`. Los archivos de reglas y sus
  tests se excluyen de la revisión de contenido.
- [ ] `.githooks/pre-commit`: `exec node scripts/seguridad/revisar-commit.mjs`.
  `prepare`: `git config core.hooksPath .githooks || true`; correrlo una vez aquí.
- [ ] `.gitignore`: extensiones del spec.
- [ ] Probar el hook real: commit de un `.xlsx` forzado → bloqueado.
- [ ] Suite completa + lint. Commit.

### Task 3: Barrera en GitHub y docs

**Files:** Create `.github/workflows/secretos.yml`, `.gitleaks.toml` (si hace falta para
falsos positivos), `docs/SEGURIDAD-REPO.md`; Modify `CLAUDE.md`.

- [ ] Workflow: `on: [push, pull_request]`, `actions/checkout` con `fetch-depth: 0`,
  `gitleaks/gitleaks-action@v2` con `GITHUB_TOKEN`.
- [ ] Correr gitleaks localmente (`brew install gitleaks`; `gitleaks dir .` sobre el árbol
  actual) y resolver falsos positivos con `.gitleaks.toml` (allowlist de marcadores de ejemplo).
- [ ] Docs: qué se bloquea, cómo resolverlo, el escape `secreto-permitido`, y cómo activar
  Push protection (`gh api -X PATCH repos/<owner>/<repo>` con `security_and_analysis`).
- [ ] Commit.

## Al hacer público el repo (lo confirma el dueño)

`gh repo edit --visibility public` y activar `secret_scanning` y
`secret_scanning_push_protection` por API.
