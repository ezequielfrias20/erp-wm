# Diseño — Logo por tema, eliminar marca y arreglo del favicon

Fecha: 2026-06-22
Estado: aprobado (pendiente revisión del spec)

## Problema

El módulo **Configuración → Marca** permite subir logo y favicon, pero:

1. **El favicon subido no aparece en la pestaña del navegador.**
2. No se puede **eliminar** un logo o favicon ya cargado (sólo reemplazar).
3. Sólo hay **un** logo, que se ve mal cuando el tema (claro/oscuro) no contrasta con él.

## Objetivos

- El favicon subido en Configuración se muestra de verdad en la pestaña.
- Poder eliminar logo, logo oscuro y favicon (limpia BD **y** archivo en Storage).
- Subir un logo para tema oscuro además del logo (claro) actual, alternando por tema sin parpadeo.

## No-objetivos (YAGNI)

- Favicon por tema (claro/oscuro). El favicon sigue siendo único.
- Recortar/redimensionar imágenes en el cliente.
- Versionado/historial de assets de marca.

## Decisiones tomadas

- **Logo claro = base.** El `settings.logo_url` actual es el logo claro/principal. El logo oscuro
  (`logo_dark_url`) es un *override opcional* que sólo se usa en modo oscuro. Si no hay logo oscuro,
  el modo oscuro usa el logo claro.
- **Eliminar = limpieza completa.** Poner la columna en `null` **y** borrar el archivo del bucket
  `wm-public`. El borrado de Storage es *best-effort*: si RLS lo rechaza, igual se limpia la columna.
- **Favicon:** approach simple (un único origen de favicon vía metadata, sin el `favicon.ico`
  estático compitiendo). El route handler dinámico queda descartado salvo que esto no baste.

---

## Componente 1 — Arreglo del favicon

### Causa raíz (dos factores)

1. **Favicon estático compitiendo.** Existe `app/favicon.ico`. Next.js lo sirve en la ruta reservada
   `/favicon.ico` e inyecta su propio `<link rel="icon">`. El navegador prefiere esa ruta para la
   pestaña, así que el `<link>` del favicon subido (con `sizes:"any"`) no le gana de forma fiable.
2. **Layout no revalidado.** `updateBrandAsset` (en `app/(app)/configuracion/actions.ts`) sólo hace
   `revalidatePath("/configuracion")`, nunca `revalidatePath("/", "layout")`. El `getBranding()`
   cacheado y el `generateMetadata()` del root layout quedan viejos tras subir el favicon (mismo
   problema para el logo).

### Cambios

- Borrar `app/favicon.ico` y moverlo a `public/favicon-default.ico` (libera la ruta `/favicon.ico`).
- En `app/layout.tsx` → `generateMetadata`, emitir **un solo** icon link:
  `icons: { icon: [{ url: faviconUrl ?? "/favicon-default.ico" }] }`.
- Añadir `revalidatePath("/", "layout")` a las acciones de marca (subir y eliminar).

### Notas

- El favicon del navegador se cachea de forma agresiva; tras el cambio puede requerir un refresco
  duro una sola vez.
- Alternativa más robusta (no se implementa ahora): route handler dinámico en
  `app/favicon.ico/route.ts` que redirige al favicon de marca, sirviendo el ícono correcto en la
  ruta canónica `/favicon.ico`.

---

## Componente 2 — Logo por tema (claro / oscuro)

### Esquema

- Migración: `ALTER TABLE wm.settings ADD COLUMN logo_dark_url text;`
- Recrear la función `wm.branding()` para que también devuelva `logo_dark_url`
  (mantener `SECURITY DEFINER`, `stable`, search_path fijo, grants a `anon`/`authenticated`).
- Re-sincronizar el snapshot a mano:
  - `lib/database.types.ts`: añadir `logo_dark_url` a `settings` (Row/Insert/Update) y al tipo de
    retorno del RPC `branding`.
  - `supabase/bootstrap/01_schema.sql`: añadir la columna al `CREATE TABLE wm.settings` y actualizar
    la definición de la función `wm.branding()`.

### Lectura

- `lib/queries/branding.ts`: añadir `logoDarkUrl: string | null` al tipo `Branding`, a `EMPTY` y al
  mapeo desde el RPC (`data.logo_dark_url`).

### Render (sin parpadeo)

- El tema vive como clase en `<html>` (next-themes, `attribute="class"`). Para alternar sin flash,
  `components/shell/brand-mark.tsx` renderiza **ambas** imágenes y las alterna con clases Tailwind:
  - logo claro: `block dark:hidden`
  - logo oscuro: `hidden dark:block`
- Fallback: `BrandMark` recibe `logoUrl` (claro) y `logoDarkUrl` (oscuro). El "logo oscuro efectivo"
  es `logoDarkUrl ?? logoUrl`. Cuando no hay ningún logo, cae al glifo `<Logo/>` + nombre como hoy.
  Se conservan las clases de tamaño/escala actuales por variante (`login` / `sidebar` / `collapsed`).
- Propagación de `logoDarkUrl`:
  - `app/(auth)/layout.tsx` (login) → `BrandMark`.
  - `app/(app)/layout.tsx` → `components/shell/app-shell.tsx` → `components/shell/sidebar.tsx` →
    `BrandMark`.

---

## Componente 3 — Eliminar logo / logo oscuro / favicon

### Acción servidor

- Nueva `removeBrandAsset(kind: "logo" | "logo_dark" | "favicon")` en
  `app/(app)/configuracion/actions.ts`:
  1. Lee la URL actual de `settings` para el `kind`.
  2. Pone la columna correspondiente en `null` (`update ... eq("id", 1)`).
  3. *Best-effort:* extrae la ruta dentro del bucket desde la URL pública
     (todo lo que va después de `/wm-public/`, p. ej. `brand/<uuid>.png`) y llama
     `supabase.storage.from("wm-public").remove([path])`. Si falla, se ignora (la columna ya quedó
     limpia).
  4. `audit(...)` + `revalidatePath("/configuracion")` + `revalidatePath("/", "layout")`.
- Extender `updateBrandAsset` para aceptar `kind: "logo" | "logo_dark" | "favicon"` y añadirle
  `revalidatePath("/", "layout")`.

### UI

- En `ColorsSection` (`components/configuracion/configuracion-view.tsx`): tres slots —
  **Logo (claro)**, **Logo (oscuro)** y **Favicon** — cada uno con su `ImageUpload` (folder `"brand"`)
  y un botón **"Eliminar"** visible cuando `canEdit` y el asset existe. El botón llama a
  `removeBrandAsset(kind)` y actualiza el estado local (`setLogo(null)` / etc.).

### RLS de Storage (posible ajuste)

- Si el bucket `wm-public` no tiene una policy de `DELETE` para `authenticated`, el borrado real
  fallará (silenciosamente, por el diseño best-effort). En ese caso se añade una migración con una
  policy de `DELETE` para `authenticated` sobre `storage.objects` del bucket `wm-public`. Verificar
  durante la implementación.

---

## Archivos afectados (resumen)

**Base de datos / snapshots**
- Migración: añadir `wm.settings.logo_dark_url`.
- Migración: recrear `wm.branding()` devolviendo `logo_dark_url`.
- (Posible) Migración: policy `DELETE` en `storage.objects` para `wm-public`.
- `lib/database.types.ts` (settings + RPC branding).
- `supabase/bootstrap/01_schema.sql` (columna + función).

**Código**
- `lib/queries/branding.ts`
- `components/shell/brand-mark.tsx`
- `app/(auth)/layout.tsx`
- `app/(app)/layout.tsx`
- `components/shell/app-shell.tsx`
- `components/shell/sidebar.tsx`
- `app/layout.tsx` (favicon en `generateMetadata`)
- `app/(app)/configuracion/actions.ts` (`updateBrandAsset` + `removeBrandAsset`)
- `components/configuracion/configuracion-view.tsx` (`ColorsSection`)

**Assets**
- Borrar `app/favicon.ico`; añadir `public/favicon-default.ico`.

**Docs (al cerrar)**
- Actualizar `CLAUDE.md` (sección "Branding dinámico" y migraciones) y `docs/PROGRESS.md`.

---

## Pruebas / verificación

- **Logo por tema:** con logo claro y oscuro cargados, alternar el tema en Configuración → Apariencia
  y verificar que el sidebar y el login cambian de logo sin recargar. Con sólo logo claro, el modo
  oscuro muestra el claro.
- **Favicon:** subir un favicon, recargar (duro si hace falta) y confirmar el ícono en la pestaña.
  Quitarlo y confirmar que vuelve el `favicon-default.ico`.
- **Eliminar:** quitar cada asset; confirmar que desaparece de login/sidebar/pestaña y que el archivo
  ya no está en el bucket `wm-public/brand/` (o, si RLS lo impide, que al menos la columna quedó en
  `null`).
- **Build/lint:** `npm run build` y `npm run lint` sin errores nuevos.
