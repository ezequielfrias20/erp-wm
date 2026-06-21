# Branding dinámico (logo, favicon y color de marca) — diseño

**Fecha:** 2026-06-21
**Estado:** aprobado, pendiente de plan de implementación

## Problema

La sección **Configuración → Marca** ya permite subir un **logotipo**, un **favicon** y
elegir un **color primario** (se guardan en `wm.settings`: `logo_url`, `favicon_url`,
`primary_color`, `accent_color` vía las acciones `updateBrandAsset` / `updateColors`).
Pero **nada consume esos valores**: el login y el header del menú lateral muestran el
glifo `<Logo/>` y el texto «World Medics» hardcodeados, el favicon es el estático
`app/favicon.ico`, y el color de marca está fijo en `app/globals.css`.

Objetivo: que el logo, el favicon y el color primario subidos por el usuario se reflejen
en el sistema, con *fallback* al estado actual cuando no hay logo.

## Requisitos (acordados)

1. **Logo** → aparece en el **login** y en el **header del menú lateral**.
   - Si **hay** logo: se muestra **solo la imagen** del logo (reemplaza glifo + nombre).
   - Si **no hay** logo: se muestra el nombre/subtítulo como hoy.
2. **Favicon** → si hay `favicon_url`, reemplaza el ícono de la pestaña del navegador.
3. **Color primario** → al cambiarlo, el sistema cambia a ese color.
   - El **mismo color exacto** en modo claro y oscuro.

## Restricciones / decisiones clave

- **El login es público (sin sesión).** `wm.settings` tiene RLS y campos sensibles (RIF,
  dirección fiscal, notificaciones). Para exponer solo la marca a visitantes no autenticados
  se añade una función **`SECURITY DEFINER`** `wm.branding()` que devuelve únicamente los
  campos de marca, con `GRANT EXECUTE` a `anon` y `authenticated`.
  - *Alternativa descartada:* policy RLS de `SELECT` para `anon` sobre `settings` → filtra
    datos fiscales.
- **Todo se renderiza en el servidor** → sin *flash* del logo/color por defecto y sin JS de
  cliente para el tema.
  - *Alternativa descartada:* `useEffect` en cliente para fijar colores → produce parpadeo.

## Arquitectura

Tres puntos de consumo se cablean a `settings`, alimentados por una sola lectura de marca:

```
                      wm.branding()  (RPC SECURITY DEFINER, anon+authenticated)
                              │
                   lib/queries/branding.ts  getBranding()  [React cache() → 1 fetch/request]
                              │
        ┌─────────────────────┼───────────────────────────────┐
        ▼                     ▼                                 ▼
  app/layout.tsx        app/(auth)/layout.tsx            app/(app)/layout.tsx
  · favicon (<head>)    · <BrandMark> (login)            · pasa logoUrl/companyName
  · <style> color         (solo imagen si hay logo)        → AppShell → Sidebar
    (override CSS vars)                                     · <BrandMark> en el header
```

`getBranding()` se envuelve en React `cache()`: en una misma request, root + (auth|app)
layout comparten una sola llamada al RPC.

## Componentes

### Nuevos

- **`lib/queries/branding.ts`** — `getBranding()` (cacheado por request). Llama
  `supabase.rpc("branding")` y devuelve
  `{ companyName, logoUrl, faviconUrl, primaryColor, accentColor }`.
- **`lib/brand-css.ts`** — helpers de color **puros** (unidad testeable, candidato a TDD):
  - `hexToRgb(hex)`, `rgba(hex, a)`, `darken(hex, amount)`, `relativeLuminance(hex)`,
    `readableForeground(hex)` → `#ffffff` o `#0f172a` según luminancia.
  - `buildBrandStyle(primary)` → string CSS con el bloque de override (ver abajo). Devuelve
    `""` si `primary` es nulo.
- **`components/shell/brand-mark.tsx`** — `<BrandMark logoUrl companyName size variant>`:
  - Si `logoUrl`: renderiza `<img>` del logo (escalado a la altura del contenedor).
  - Si no: *fallback* = `<Logo/>` glifo + nombre/subtítulo (lo de hoy).
  - `variant` distingue el layout del **login** (centrado) del **sidebar** (horizontal /
    colapsado). El nombre por defecto del fallback usa `companyName ?? "World Medics"`.
- **Migración `wm_branding_fn`** — `wm.branding()` `SECURITY DEFINER` con `search_path`
  fijado, devuelve `company_name, logo_url, favicon_url, primary_color, accent_color` de
  `settings` (id=1); `GRANT EXECUTE` a `anon`, `authenticated`. Se añade su firma a
  `lib/database.types.ts` (`Functions`) y se re-sincroniza
  `supabase/bootstrap/01_schema.sql`.

### Modificados

- **`app/layout.tsx`**
  - `generateMetadata()` → `icons` desde `faviconUrl` cuando existe (si no, cae al
    `app/favicon.ico` estático). Si Next sigue inyectando el ícono basado en archivo, se
    fuerza el override con un `<link rel="icon">` explícito en el `<head>`.
  - Inyecta `<style>` (server-rendered, al inicio del `<body>`) con el override de marca
    cuando `primaryColor` está definido. El `<style>` posterior en orden de fuente gana a
    `globals.css` con igual especificidad.
- **`app/(auth)/layout.tsx`** — reemplaza el bloque glifo+texto por `<BrandMark variant="login">`.
- **`components/shell/sidebar.tsx`** — acepta `logoUrl`/`companyName` y usa
  `<BrandMark variant="sidebar" collapsed={collapsed}>` en el header.
  `AppShell` recibe y reenvía esas props; `app/(app)/layout.tsx` las obtiene de `getBranding()`.

## Override de color (cuando hay `primary_color`)

`buildBrandStyle(primary)` emite (mismos valores en claro y oscuro):

```css
:root, .dark {
  --brand: <primary>;
  --brand-2: <darken(primary, ~15%)>;     /* compañero del gradiente del logo */
  --brand-soft: <rgba(primary, 0.10)>;    /* 0.15 dentro de .dark */
  --primary: <primary>;
  --primary-foreground: <readableForeground(primary)>;
  --ring: <primary>;
  --sidebar-primary: <primary>;
  --sidebar-primary-foreground: <readableForeground(primary)>;
  --sidebar-ring: <primary>;
  --chart-1: <primary>;                    /* la rebanada primaria del donut coincide */
}
```

`--brand-soft` se emite con 0.10 en `:root` y 0.15 en `.dark` (dos reglas). Los demás
tokens son idénticos en ambos modos (decisión: «mismo color exacto»). `readableForeground`
elige texto negro o blanco por luminancia para que ámbar/esmeralda queden legibles.

## Fuera de alcance

- **`accent_color`**: el requisito es solo el color primario. La sección «Color de acento»
  sigue guardándose en `settings` pero no se cablea aquí.
- **`<title>` de la pestaña**: no cambia; solo se actualiza el favicon.

## Pruebas

- **Unitarias (TDD):** `lib/brand-css.ts` — `hexToRgb`, `darken`, `rgba`,
  `relativeLuminance`, `readableForeground` (color claro→texto oscuro y viceversa),
  `buildBrandStyle` (string vacío si nulo; contiene los tokens esperados).
- **Manual / build:**
  - Sin logo ni color → login y sidebar idénticos a hoy; favicon estático.
  - Con logo → solo la imagen en login y sidebar (incluido sidebar colapsado).
  - Con favicon → ícono de pestaña actualizado tras recargar.
  - Con color → botones/brand/ring/donut reflejan el color en claro y oscuro, sin parpadeo.
  - `npm run build` y `npm run lint` sin errores nuevos.

## Notas de migración / sincronización

- Tras aplicar `wm_branding_fn` por MCP: actualizar `lib/database.types.ts` y
  `supabase/bootstrap/01_schema.sql` (incluir la función + grants), según
  `supabase/bootstrap/README.md`.
- Registrar la migración en `CLAUDE.md` (lista de «Migraciones aplicadas») y actualizar
  `docs/PROGRESS.md` al cerrar.
