# Branding dinámico (logo, favicon, color) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el logo, el favicon y el color primario que el admin sube en Configuración → Marca se reflejen en el login, el header del menú lateral, el ícono de la pestaña y el color del sistema; con *fallback* al estado actual cuando no hay logo.

**Architecture:** Todo se renderiza en el servidor (sin parpadeo, sin JS de tema). Una RPC `SECURITY DEFINER` `wm.branding()` expone solo los campos de marca a visitantes no autenticados (login). Un helper cacheado `getBranding()` alimenta tres consumos: `<BrandMark>` (login + sidebar), favicon (`generateMetadata`) y un `<style>` server-rendered con overrides de variables CSS de marca.

**Tech Stack:** Next.js 16 (App Router, RSC) · React 19 · TypeScript · Supabase (`@supabase/ssr`, esquema `wm`) · Tailwind v4 · vitest (nuevo, solo para los helpers de color).

**Spec:** `docs/superpowers/specs/2026-06-21-branding-dinamico-design.md`

---

## File Structure

**Crear:**
- `vitest.config.ts` — config mínima del runner (solo `lib/**/*.test.ts`).
- `lib/brand-css.ts` — helpers de color puros + `buildBrandStyle()`.
- `lib/brand-css.test.ts` — pruebas unitarias de los helpers.
- `lib/queries/branding.ts` — `getBranding()` (cacheado por request).
- `components/shell/brand-mark.tsx` — render del logo subido o *fallback* glifo+nombre.

**Modificar:**
- `package.json` — devDep `vitest` + script `test`.
- `lib/database.types.ts` — firma de la función `branding` en `wm.Functions`.
- `app/layout.tsx` — `generateMetadata()` (favicon) + `<style>` de color.
- `app/(auth)/layout.tsx` — usa `<BrandMark variant="login">`.
- `components/shell/sidebar.tsx` — usa `<BrandMark variant="sidebar">`, recibe props de marca.
- `components/shell/app-shell.tsx` — reenvía props de marca a `Sidebar`.
- `app/(app)/layout.tsx` — obtiene marca con `getBranding()` y la pasa a `AppShell`.
- `supabase/bootstrap/01_schema.sql` — añade `wm.branding()` + grants (sync del snapshot).
- `CLAUDE.md` — registra la migración #16.
- `docs/PROGRESS.md` — nota de cierre.

**Migración (vía MCP `apply_migration`):** `wm_branding_fn`.

---

## Task 1: Test runner (vitest)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Instalar vitest**

Run:
```bash
npm install -D vitest
```
Expected: `vitest` aparece en `devDependencies`, sin errores de peer deps que rompan el install.

- [ ] **Step 2: Crear `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Añadir script `test` en `package.json`**

En el bloque `"scripts"`, añadir (después de `"lint": "eslint"`):
```json
    "test": "vitest run"
```
(Recordar la coma al final de la línea de `lint`.)

- [ ] **Step 4: Verificar que el runner arranca**

Run:
```bash
npm test
```
Expected: vitest corre y reporta "No test files found, exiting with code 0" (o similar). El comando termina sin error de configuración.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest runner for unit tests"
```

---

## Task 2: Helpers de color (`lib/brand-css.ts`) — TDD

**Files:**
- Create: `lib/brand-css.ts`
- Test: `lib/brand-css.test.ts`

Funciones puras: `hexToRgb`, `rgba`, `darken`, `perceivedLuminance`, `readableForeground`, `buildBrandStyle`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Create `lib/brand-css.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  hexToRgb,
  rgba,
  darken,
  perceivedLuminance,
  readableForeground,
  buildBrandStyle,
} from "./brand-css";

describe("hexToRgb", () => {
  it("parses 6-digit hex", () => {
    expect(hexToRgb("#0EA5E9")).toEqual({ r: 14, g: 165, b: 233 });
  });
  it("is case-insensitive and tolerates no leading #", () => {
    expect(hexToRgb("0ea5e9")).toEqual({ r: 14, g: 165, b: 233 });
  });
});

describe("rgba", () => {
  it("builds an rgba() string with the given alpha", () => {
    expect(rgba("#0EA5E9", 0.1)).toBe("rgba(14, 165, 233, 0.1)");
  });
});

describe("darken", () => {
  it("darkens each channel by the given fraction", () => {
    // 14,165,233 * 0.85 -> 12,140,198 -> #0c8cc6
    expect(darken("#0EA5E9", 0.15)).toBe("#0c8cc6");
  });
});

describe("perceivedLuminance", () => {
  it("returns 0 for black and 1 for white", () => {
    expect(perceivedLuminance("#000000")).toBeCloseTo(0, 5);
    expect(perceivedLuminance("#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("readableForeground", () => {
  it("returns dark text on a light color (amber)", () => {
    expect(readableForeground("#F59E0B")).toBe("#0f172a");
  });
  it("returns white text on the default brand blue", () => {
    expect(readableForeground("#0EA5E9")).toBe("#ffffff");
  });
  it("returns white on black and dark on white", () => {
    expect(readableForeground("#000000")).toBe("#ffffff");
    expect(readableForeground("#FFFFFF")).toBe("#0f172a");
  });
});

describe("buildBrandStyle", () => {
  it("returns empty string when primary is missing", () => {
    expect(buildBrandStyle(null)).toBe("");
    expect(buildBrandStyle(undefined)).toBe("");
    expect(buildBrandStyle("")).toBe("");
  });
  it("emits brand tokens for both modes", () => {
    const css = buildBrandStyle("#0EA5E9");
    expect(css).toContain("--brand:#0EA5E9");
    expect(css).toContain("--brand-2:#0c8cc6");
    expect(css).toContain("--primary:#0EA5E9");
    expect(css).toContain("--primary-foreground:#ffffff");
    expect(css).toContain("--ring:#0EA5E9");
    expect(css).toContain("--sidebar-primary:#0EA5E9");
    expect(css).toContain("--chart-1:#0EA5E9");
    // light soft 0.10 + a dark override at 0.15
    expect(css).toContain("--brand-soft:rgba(14, 165, 233, 0.1)");
    expect(css).toContain(".dark{--brand-soft:rgba(14, 165, 233, 0.15)}");
  });
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run:
```bash
npx vitest run lib/brand-css.test.ts
```
Expected: FAIL — no se puede resolver `./brand-css` (módulo inexistente).

- [ ] **Step 3: Implementar `lib/brand-css.ts`**

```ts
/** Pure colour helpers for the runtime brand-colour override. No DOM, fully testable. */

export type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "").trim();
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/** Multiply each channel by (1 - amount). amount 0..1. */
export function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const f = 1 - amount;
  return `#${toHex(r * f)}${toHex(g * f)}${toHex(b * f)}`;
}

/** Simple perceived luminance, 0 (black) .. 1 (white). */
export function perceivedLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Pick readable text colour over `hex`. Threshold 0.6 keeps blues/violets white,
 *  flips light colours (amber) to dark text. */
export function readableForeground(hex: string): string {
  return perceivedLuminance(hex) > 0.6 ? "#0f172a" : "#ffffff";
}

/** CSS that overrides the brand tokens at runtime. Empty string when no colour set.
 *  Same colour in light and dark per design; only --brand-soft differs (0.10 / 0.15). */
export function buildBrandStyle(primary: string | null | undefined): string {
  if (!primary) return "";
  const brand2 = darken(primary, 0.15);
  const fg = readableForeground(primary);
  return (
    `:root,.dark{` +
    `--brand:${primary};` +
    `--brand-2:${brand2};` +
    `--brand-soft:${rgba(primary, 0.1)};` +
    `--primary:${primary};` +
    `--primary-foreground:${fg};` +
    `--ring:${primary};` +
    `--sidebar-primary:${primary};` +
    `--sidebar-primary-foreground:${fg};` +
    `--sidebar-ring:${primary};` +
    `--chart-1:${primary}` +
    `}` +
    `.dark{--brand-soft:${rgba(primary, 0.15)}}`
  );
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run:
```bash
npx vitest run lib/brand-css.test.ts
```
Expected: PASS — todos los tests verdes.

- [ ] **Step 5: Commit**

```bash
git add lib/brand-css.ts lib/brand-css.test.ts
git commit -m "feat(branding): pure colour helpers for runtime brand override"
```

---

## Task 3: Migración `wm.branding()` (RPC SECURITY DEFINER)

**Files:**
- Migración MCP: `wm_branding_fn`
- Modify: `lib/database.types.ts` (bloque `wm.Functions`)
- Modify: `supabase/bootstrap/01_schema.sql`

> Esta tarea toca la base de datos remota. No hay test unitario; se verifica con `execute_sql`.

- [ ] **Step 1: Aplicar la migración (MCP `apply_migration`)**

`name`: `wm_branding_fn` — `query`:
```sql
-- Función de marca para visitantes no autenticados (login).
-- Devuelve SOLO los campos de marca, evitando exponer datos fiscales de wm.settings.
create or replace function wm.branding()
returns table (
  company_name text,
  logo_url text,
  favicon_url text,
  primary_color text,
  accent_color text
)
language sql
security definer
set search_path = wm, public
stable
as $$
  select s.company_name, s.logo_url, s.favicon_url, s.primary_color, s.accent_color
  from wm.settings s
  where s.id = 1;
$$;

-- anon necesita USAGE en el esquema (no da acceso a tablas) + EXECUTE en la función.
grant usage on schema wm to anon;
grant execute on function wm.branding() to anon, authenticated;
```

- [ ] **Step 2: Verificar la función (MCP `execute_sql`)**

```sql
select * from wm.branding();
```
Expected: 1 fila con las 5 columnas (valores actuales de `settings`, pueden ser NULL).

- [ ] **Step 3: Añadir la firma a `lib/database.types.ts`**

En `Database["wm"]["Functions"]`, junto a las otras funciones (cerca de `has_module`), añadir:
```ts
      branding: {
        Args: Record<string, never>;
        Returns: {
          company_name: string | null;
          logo_url: string | null;
          favicon_url: string | null;
          primary_color: string | null;
          accent_color: string | null;
        }[];
      };
```

- [ ] **Step 4: Sincronizar `supabase/bootstrap/01_schema.sql`**

Añadir la función + grants al snapshot (junto al resto de funciones `wm.*`, antes de los grants finales). Pegar exactamente el mismo bloque SQL del Step 1 (sin el comentario de cabecera si se prefiere, pero el SQL idéntico).

- [ ] **Step 5: Commit**

```bash
git add lib/database.types.ts supabase/bootstrap/01_schema.sql
git commit -m "feat(branding): wm.branding() RPC (anon-safe) + types + bootstrap sync"
```

---

## Task 4: `getBranding()` (lectura cacheada)

**Files:**
- Create: `lib/queries/branding.ts`

- [ ] **Step 1: Crear el helper**

```ts
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Branding = {
  companyName: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
};

const EMPTY: Branding = {
  companyName: null,
  logoUrl: null,
  faviconUrl: null,
  primaryColor: null,
  accentColor: null,
};

/** Branding fields, safe for unauthenticated pages (login). Deduped per request. */
export const getBranding = cache(async (): Promise<Branding> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("branding").maybeSingle();
    if (!data) return EMPTY;
    return {
      companyName: data.company_name,
      logoUrl: data.logo_url,
      faviconUrl: data.favicon_url,
      primaryColor: data.primary_color,
      accentColor: data.accent_color,
    };
  } catch {
    return EMPTY;
  }
});
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: sin errores nuevos (la firma `branding` de la Task 3 hace que `data` esté tipado).

- [ ] **Step 3: Commit**

```bash
git add lib/queries/branding.ts
git commit -m "feat(branding): cached getBranding() reader via wm.branding RPC"
```

---

## Task 5: Componente `<BrandMark>`

**Files:**
- Create: `components/shell/brand-mark.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
import { cn } from "@/lib/utils";
import { Logo } from "@/components/shell/logo";

/** Renders the uploaded logo when present, else falls back to the glyph + name.
 *  `login` = centered block; `sidebar` = horizontal row (logo-only when collapsed). */
export function BrandMark({
  logoUrl,
  companyName,
  variant,
  collapsed = false,
}: {
  logoUrl: string | null;
  companyName: string | null;
  variant: "login" | "sidebar";
  collapsed?: boolean;
}) {
  const name = companyName?.trim() || "World Medics";

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        className={cn(
          "object-contain",
          variant === "login" ? "mx-auto max-h-16 w-auto" : "max-h-9 w-auto",
        )}
      />
    );
  }

  if (variant === "login") {
    return (
      <div className="flex flex-col items-center text-center">
        <Logo size={48} />
        <h1 className="mt-4 text-[19px] font-bold tracking-tight text-foreground">
          {name}
        </h1>
        <p className="text-[12.5px] text-text-3">ERP · uniformes médicos</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-[11px]">
      <Logo size={36} />
      {!collapsed && (
        <div className="flex flex-col overflow-hidden whitespace-nowrap leading-[1.15]">
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            {name}
          </span>
          <span className="text-[11px] font-medium text-text-3">
            ERP · uniformes médicos
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run:
```bash
npx eslint components/shell/brand-mark.tsx
```
Expected: sin errores (el `<img>` lleva su disable comment).

- [ ] **Step 3: Commit**

```bash
git add components/shell/brand-mark.tsx
git commit -m "feat(branding): BrandMark component (logo or glyph+name fallback)"
```

---

## Task 6: Login usa `<BrandMark>`

**Files:**
- Modify: `app/(auth)/layout.tsx`

- [ ] **Step 1: Reescribir el layout de auth**

Reemplazar el contenido completo de `app/(auth)/layout.tsx` por:
```tsx
import { BrandMark } from "@/components/shell/brand-mark";
import { getBranding } from "@/lib/queries/branding";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logoUrl, companyName } = await getBranding();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% -10%, var(--brand-soft), transparent 70%)",
        }}
      />
      <div className="w-full max-w-[400px] fadeup">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark variant="login" logoUrl={logoUrl} companyName={companyName} />
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint + type-check**

Run:
```bash
npx eslint "app/(auth)/layout.tsx" && npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/layout.tsx"
git commit -m "feat(branding): login shows uploaded logo (BrandMark)"
```

---

## Task 7: Sidebar usa `<BrandMark>` (props threaded)

**Files:**
- Modify: `components/shell/sidebar.tsx`
- Modify: `components/shell/app-shell.tsx`
- Modify: `app/(app)/layout.tsx`

- [ ] **Step 1: `sidebar.tsx` — aceptar props y usar BrandMark**

Añadir el import (junto a `import { Logo } ...`; el `Logo` directo ya no se usa en este archivo, eliminar su import):
```tsx
import { BrandMark } from "@/components/shell/brand-mark";
```
Eliminar la línea `import { Logo } from "@/components/shell/logo";`.

Ampliar la firma de props de `Sidebar`:
```tsx
export function Sidebar({
  collapsed,
  badges,
  bcv,
  logoUrl,
  companyName,
}: {
  collapsed: boolean;
  badges: { lowStock?: number };
  bcv: BcvRate;
  logoUrl: string | null;
  companyName: string | null;
}) {
```

Reemplazar el bloque del header (el `<div className="flex h-16 ...">` que contiene `<Logo size={36} />` y el `expanded && (...)`) por:
```tsx
      <div className="flex h-16 flex-none items-center border-b border-border px-4">
        <BrandMark
          variant="sidebar"
          collapsed={collapsed}
          logoUrl={logoUrl}
          companyName={companyName}
        />
      </div>
```

- [ ] **Step 2: `app-shell.tsx` — recibir y reenviar props**

Ampliar la firma de `AppShell`:
```tsx
export function AppShell({
  bcv,
  badges,
  notifications,
  logoUrl,
  companyName,
  children,
}: {
  bcv: BcvRate;
  badges: { lowStock?: number };
  notifications: ShellNotification[];
  logoUrl: string | null;
  companyName: string | null;
  children: React.ReactNode;
}) {
```

Pasar a `<Sidebar>`:
```tsx
      <Sidebar
        collapsed={collapsed}
        badges={badges}
        bcv={bcv}
        logoUrl={logoUrl}
        companyName={companyName}
      />
```

- [ ] **Step 3: `app/(app)/layout.tsx` — obtener marca y pasarla**

Añadir el import (junto a los demás):
```tsx
import { getBranding } from "@/lib/queries/branding";
```

Tras `const shell = await getShellData(bcv, activeId);` añadir:
```tsx
  const branding = await getBranding();
```

Pasar las props a `<AppShell>`:
```tsx
        <AppShell
          bcv={bcv}
          badges={{ lowStock: shell.lowStock }}
          notifications={shell.notifications}
          logoUrl={branding.logoUrl}
          companyName={branding.companyName}
        >
          {children}
        </AppShell>
```

- [ ] **Step 4: Lint + type-check**

Run:
```bash
npx eslint components/shell/sidebar.tsx components/shell/app-shell.tsx "app/(app)/layout.tsx" && npx tsc --noEmit
```
Expected: sin errores (incluido que `Logo` ya no quede importado sin uso en `sidebar.tsx`).

- [ ] **Step 5: Commit**

```bash
git add components/shell/sidebar.tsx components/shell/app-shell.tsx "app/(app)/layout.tsx"
git commit -m "feat(branding): sidebar header shows uploaded logo (BrandMark)"
```

---

## Task 8: Root layout — favicon + color de marca

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Reescribir `app/layout.tsx`**

Reemplazar el contenido completo por:
```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { getBranding } from "@/lib/queries/branding";
import { buildBrandStyle } from "@/lib/brand-css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { faviconUrl } = await getBranding();
  return {
    title: "World Medics ERP",
    description: "ERP de uniformes médicos · World Medics",
    icons: faviconUrl ? { icon: faviconUrl } : undefined,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { primaryColor } = await getBranding();
  const brandStyle = buildBrandStyle(primaryColor);

  return (
    <html lang="es" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full">
        {brandStyle ? (
          <style dangerouslySetInnerHTML={{ __html: brandStyle }} />
        ) : null}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Lint + type-check**

Run:
```bash
npx eslint app/layout.tsx && npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Build**

Run:
```bash
npm run build
```
Expected: build OK. Las rutas que usan branding son dinámicas (usan cookies/RPC) — es esperado que no se pre-rendericen estáticamente.

- [ ] **Step 4: Verificación manual del favicon (favicon override)**

Run `npm run dev`, abrir `http://localhost:3000/login` con un `favicon_url` cargado en `settings`. Confirmar en DevTools → Elements que el `<head>` tiene `<link rel="icon" href="<favicon_url>">` y que la pestaña muestra ese ícono.

> Si el `app/favicon.ico` estático sigue ganando, *fallback*: dentro de `<body>` (antes del `<style>` de marca) renderizar explícitamente, sólo cuando hay favicon, `<link rel="icon" href={faviconUrl} sizes="any" />` (React 19 lo eleva a `<head>`). Requiere leer también `faviconUrl` en `RootLayout`.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(branding): dynamic favicon + runtime brand-colour override"
```

---

## Task 9: Documentación

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Registrar la migración en `CLAUDE.md`**

En la lista "Migraciones aplicadas", añadir como item 16:
```
16. `wm_branding_fn` — función `wm.branding()` (`SECURITY DEFINER`, anon-safe) que expone solo
    los campos de marca de `settings` (logo, favicon, color primario/acento) al login; grants a
    `anon`/`authenticated` + `usage` del esquema a `anon`.
```

Y en la sección de convenciones, añadir una nota breve bajo el bloque de marca/Storage:
```
- **Branding dinámico**: el logo (`settings.logo_url`) se muestra en login y header del sidebar
  vía `components/shell/brand-mark.tsx` (`getBranding()` → RPC `wm.branding()`); sin logo, cae al
  glifo + nombre. El favicon (`favicon_url`) se inyecta en `generateMetadata` del root layout. El
  color primario (`primary_color`) se aplica con un `<style>` server-rendered (`lib/brand-css.ts`,
  override de `--brand`, `--primary`, `--ring`, `--sidebar-*`, `--chart-1`), igual en claro/oscuro.
```

- [ ] **Step 2: Nota en `docs/PROGRESS.md`**

Añadir una línea en la sección correspondiente (Configuración / branding) indicando que el logo, favicon y color primario ya se consumen en login, sidebar, pestaña y tema.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/PROGRESS.md
git commit -m "docs(branding): registrar migración wm_branding_fn y branding dinámico"
```

---

## Task 10: Verificación final

- [ ] **Step 1: Suite + lint + build**

Run:
```bash
npm test && npm run lint && npm run build
```
Expected: tests verdes, lint sin errores nuevos, build OK.

- [ ] **Step 2: Recorrido manual (con `npm run dev`)**

Verificar todos los escenarios contra la BD real:
- **Sin logo ni color** → login y sidebar idénticos a hoy; favicon estático; colores por defecto.
- **Con logo** (subir en Configuración → Marca) → login muestra solo la imagen; sidebar muestra solo la imagen (expandido y colapsado).
- **Con favicon** → tras recargar, la pestaña muestra el favicon subido.
- **Con color primario** (elegir un swatch) → botones, brand, ring y rebanada del donut reflejan el color, en claro y en oscuro, sin parpadeo al cargar.

- [ ] **Step 3: Commit final si hubo ajustes**

```bash
git add -A
git commit -m "test(branding): verificación final del branding dinámico"
```

---

## Notas

- El `<style>` de marca se renderiza dentro de `<body>` (después de `globals.css` en orden de
  fuente) → gana a los tokens por defecto con igual especificidad. No hay parpadeo porque es
  server-rendered.
- `accent_color` se lee en `getBranding()` pero **no** se cablea (fuera de alcance; el requisito
  es solo el color primario).
- `getBranding()` usa `react.cache()` → root layout (`generateMetadata` + componente) y el layout
  anidado comparten una sola llamada al RPC por request.
