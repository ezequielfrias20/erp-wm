# Seguridad del repo: secretos y datos fuera de git

El repo `erp-wm` es **público**: cualquiera puede leer todo lo que se suba, también en el
historial. Nunca deben entrar contraseñas, llaves, cadenas de conexión ni archivos con datos de
un negocio (inventarios, precios, costos, clientes). Lo que ya entró al historial antes de
2026-11-21 se dejó como está; estas barreras evitan que vuelva a pasar.

## Las cuatro barreras

| Barrera | Dónde | Qué frena | ¿Se puede saltar? |
|---|---|---|---|
| `.gitignore` | todo el repo | `.env*`, `backups/`, Excel, CSV, volcados, llaves | sí, con `git add -f` |
| Revisión antes del commit | `.githooks/pre-commit` → `scripts/seguridad/revisar-commit.mjs` | secretos en líneas nuevas, archivos de datos aunque se fuercen, archivos de más de 5 MB | sí, con `--no-verify` (no hacerlo) |
| gitleaks en GitHub Actions | `.github/workflows/secretos.yml` | secretos en cada push y PR, aunque se haya saltado lo anterior | no: el check falla y GitHub avisa por correo |
| Push protection de GitHub | ajustes del repo | llaves reconocidas por GitHub (Supabase, Resend, etc.): rechaza el push | sólo aceptando el aviso a mano en GitHub |

### Qué revisa el commit

- **Archivos** (sin importar mayúsculas): `.env*` salvo `.env.example`; cualquier cosa bajo
  `backups/`; `.xlsx .xlsm .xls .csv .tsv .dump .sql.gz/.bz2/.xz/.zip .bak .p12 .pfx .p8 .key
  .pem .jks .keystore .ppk .ovpn`; cualquier archivo de más de 5 MB.
- **Líneas agregadas**: llaves secretas de Supabase (`sb_secret_…`), JWT, llaves de Resend,
  cadenas `postgres://usuario:contraseña@…`, `PGPASSWORD=` con valor, llaves privadas y
  contraseñas escritas («**Password:** `…`», `password: "…"`).
- Los **marcadores de ejemplo** no cuentan, pero sólo si el valor entero tiene forma de marcador:
  `<password>`, `***`, `...`, `$VAR`, `$(comando)`, `TU_PASSWORD`. Una contraseña real con `$` o
  `*` adentro sí se bloquea.
- El mensaje dice archivo, línea y tipo; **nunca** muestra el secreto.

## Si un commit se bloquea

1. **Era un secreto real**: sácalo del archivo y ponlo en un `.env*` (ignorado por git) o en las
   variables de entorno de Vercel. Si ya estaba en un commit subido, **rótalo** (cámbialo en
   Supabase/Resend/etc.): borrarlo del archivo no lo saca del historial.
2. **Era un archivo de datos**: `git restore --staged <archivo>` y guárdalo fuera del repo o en
   `backups/`.
3. **Era un ejemplo inventado en la documentación**: escribe `secreto-permitido` en esa misma
   línea (por ejemplo en un comentario). Úsalo sólo para ejemplos.

## Instalación

La revisión se activa sola al correr `npm install` (script `prepare`:
`git config core.hooksPath .githooks`). Para comprobarlo: `git config core.hooksPath` debe
responder `.githooks`. En Vercel el comando falla sin efecto (`|| true`).

`npm install` ya ejecuta código del repo (scripts y dependencias); el hook no añade una puerta
nueva: quien pueda cambiar el hook también podría cambiar `package.json`. Revisa siempre los
cambios a `.githooks/`, `scripts/seguridad/` y `package.json` en los PR de terceros.

## Push protection de GitHub

Gratis en repos públicos. Al hacer público el repo, activar:

```bash
gh api -X PATCH repos/ezequielfrias20/erp-wm \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
```

Se comprueba en GitHub → Settings → Code security.

## Mantener las reglas

Las reglas están en `scripts/seguridad/reglas.mjs` y sus pruebas en
`scripts/seguridad/reglas.test.ts` (corren con `npm test`). Antes de agregar una regla,
comprobar que no dé falsas alarmas en el repo actual. Las excepciones de gitleaks viven en
`.gitleaks.toml`.
