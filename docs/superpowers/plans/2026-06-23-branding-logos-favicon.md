# Logo por tema, eliminar marca y arreglo del favicon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir subir un logo distinto para tema claro y oscuro, eliminar logo/logo-oscuro/favicon (BD + Storage), y arreglar que el favicon subido no aparece en la pestaña del navegador.

**Architecture:** Se añade la columna `wm.settings.logo_dark_url` y se expone vía la RPC `wm.branding()`. El render por tema se hace en `BrandMark` mostrando dos `<img>` alternadas por clases Tailwind `dark:` (sin parpadeo, SSR). El favicon se arregla quitando el `app/favicon.ico` estático que compite con el subido y revalidando el root layout tras cada cambio de marca. La eliminación usa una nueva server action que limpia la columna y borra el archivo del bucket `wm-public` (best-effort).

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (`@supabase/ssr`, esquema `wm`) · Tailwind v4 · Vitest (sólo `lib/**/*.test.ts`, entorno node).

**Spec:** `docs/superpowers/specs/2026-06-22-branding-logos-favicon-design.md`

---

## File Structure

**Base de datos (migraciones vía MCP `apply_migration`, + snapshots a mano):**
- Migración `wm_settings_logo_dark` — `add column logo_dark_url` + recrea `wm.branding()`.
- Migración `wm_storage_brand_delete` — policy DELETE en `storage.objects` para `wm-public`.
- `lib/database.types.ts` — `Settings.logo_dark_url` + retorno del RPC `branding`.
- `supabase/bootstrap/01_schema.sql` — columna + definición de `wm.branding()`.

**Lectura de marca:**
- `lib/queries/branding.ts` — `logoDarkUrl`.

**Lógica pura (TDD):**
- `lib/storage-path.ts` (create) + `lib/storage-path.test.ts` (create) — extrae la ruta del objeto desde la URL pública, para poder borrarlo.

**Server actions:**
- `app/(app)/configuracion/actions.ts` — `updateBrandAsset` (3 kinds + revalida layout) y nueva `removeBrandAsset`.

**Render:**
- `components/shell/brand-mark.tsx` — dos `<img>` alternadas por tema.
- `app/(auth)/layout.tsx`, `app/(app)/layout.tsx`, `components/shell/app-shell.tsx`, `components/shell/sidebar.tsx` — propagan `logoDarkUrl`.
- `app/layout.tsx` — favicon único en `generateMetadata`.
- `app/favicon.ico` → `public/favicon-default.ico` (git mv).

**UI Configuración:**
- `components/configuracion/configuracion-view.tsx` — `ColorsSection` con 3 slots (claro/oscuro/favicon) + botón Eliminar, vía un `BrandAssetSlot` local.

**Docs:**
- `CLAUDE.md`, `docs/PROGRESS.md`.

---

## Task 1: Migraciones de base de datos (columna + RPC + policy)

Se aplican contra el proyecto Supabase **`crm_cubo_labs`** (`yxwedegszxtujplffaac`) con la herramienta MCP `mcp__claude_ai_Supabase__apply_migration`. No hay archivos que comitear en esta tarea (los snapshots se sincronizan en la Task 2).

**Files:** ninguno (cambios en BD remota).

- [ ] **Step 1: Aplicar migración `wm_settings_logo_dark`**

Llamar `mcp__claude_ai_Supabase__apply_migration` con `name: "wm_settings_logo_dark"` y este SQL.
`wm.branding()` devuelve un `TABLE` (cambia el tipo de retorno), así que hay que `drop` antes de recrear — `create or replace` falla con "cannot change return type".

```sql
alter table wm.settings add column if not exists logo_dark_url text;

drop function if exists wm.branding();
create or replace function wm.branding()
returns table (
  company_name text,
  logo_url text,
  logo_dark_url text,
  favicon_url text,
  primary_color text,
  accent_color text
)
language sql
security definer
set search_path = wm, public
stable
as $$
  select s.company_name, s.logo_url, s.logo_dark_url, s.favicon_url, s.primary_color, s.accent_color
  from wm.settings s
  where s.id = 1;
$$;

grant execute on function wm.branding() to anon, authenticated;
```

- [ ] **Step 2: Aplicar migración `wm_storage_brand_delete`**

Llamar `apply_migration` con `name: "wm_storage_brand_delete"`. Permite a usuarios autenticados borrar objetos del bucket `wm-public` (paridad con la escritura ya existente; el borrado real se gatea por permisos de módulo en la app).

```sql
drop policy if exists "wm_public_authenticated_delete" on storage.objects;
create policy "wm_public_authenticated_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'wm-public');
```

- [ ] **Step 3: Verificar columna y RPC**

Llamar `mcp__claude_ai_Supabase__execute_sql` con:

```sql
select column_name from information_schema.columns
where table_schema = 'wm' and table_name = 'settings' and column_name = 'logo_dark_url';
select * from wm.branding();
```

Expected: la primera query devuelve `logo_dark_url`; la segunda devuelve una fila con la columna `logo_dark_url` presente (valor `null`).

---

## Task 2: Sincronizar snapshot SQL y tipos TS

**Files:**
- Modify: `supabase/bootstrap/01_schema.sql` (settings table ~líneas 344-361; branding fn ~líneas 539-557)
- Modify: `lib/database.types.ts` (Settings ~líneas 306-323; RPC branding ~líneas 469-478)

- [ ] **Step 1: Añadir la columna al CREATE TABLE del snapshot**

En `supabase/bootstrap/01_schema.sql`, dentro de `create table wm.settings (...)`, añadir `logo_dark_url` justo después de `logo_url`:

```sql
  logo_url text,
  logo_dark_url text,
  favicon_url text,
```

- [ ] **Step 2: Actualizar la función `wm.branding()` del snapshot**

En `supabase/bootstrap/01_schema.sql`, reemplazar el bloque `create or replace function wm.branding()` (incluyendo `returns table (...)` y el `select`) por:

```sql
create or replace function wm.branding()
returns table (
  company_name text,
  logo_url text,
  logo_dark_url text,
  favicon_url text,
  primary_color text,
  accent_color text
)
language sql
security definer
set search_path = wm, public
stable
as $$
  select s.company_name, s.logo_url, s.logo_dark_url, s.favicon_url, s.primary_color, s.accent_color
  from wm.settings s
  where s.id = 1;
$$;
```

(El snapshot es estado final; no necesita el `drop function`.)

- [ ] **Step 3: Actualizar el tipo `Settings` en `lib/database.types.ts`**

Añadir `logo_dark_url` después de `logo_url`:

```ts
  logo_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
```

- [ ] **Step 4: Actualizar el retorno del RPC `branding` en `lib/database.types.ts`**

```ts
      branding: {
        Args: Record<string, never>;
        Returns: {
          company_name: string | null;
          logo_url: string | null;
          logo_dark_url: string | null;
          favicon_url: string | null;
          primary_color: string | null;
          accent_color: string | null;
        }[];
      };
```

- [ ] **Step 5: Commit**

```bash
git add supabase/bootstrap/01_schema.sql lib/database.types.ts
git commit -m "feat(branding): columna logo_dark_url en settings + RPC branding (snapshot/types)"
```

---

## Task 3: Exponer `logoDarkUrl` en `getBranding()`

**Files:**
- Modify: `lib/queries/branding.ts`

- [ ] **Step 1: Añadir `logoDarkUrl` al tipo, a EMPTY y al mapeo**

Reemplazar el contenido relevante de `lib/queries/branding.ts` para que quede así:

```ts
export type Branding = {
  companyName: string | null;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
};

const EMPTY: Branding = {
  companyName: null,
  logoUrl: null,
  logoDarkUrl: null,
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
      logoDarkUrl: data.logo_dark_url,
      faviconUrl: data.favicon_url,
      primaryColor: data.primary_color,
      accentColor: data.accent_color,
    };
  } catch {
    return EMPTY;
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add lib/queries/branding.ts
git commit -m "feat(branding): getBranding() expone logoDarkUrl"
```

---

## Task 4: Helper `storagePathFromPublicUrl` (TDD)

Extrae la ruta del objeto dentro del bucket desde la URL pública, para poder borrar el archivo al eliminar un asset.

**Files:**
- Create: `lib/storage-path.ts`
- Test: `lib/storage-path.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/storage-path.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { storagePathFromPublicUrl } from "./storage-path";

describe("storagePathFromPublicUrl", () => {
  it("extrae la ruta después del segmento del bucket", () => {
    expect(
      storagePathFromPublicUrl(
        "https://yxwedegszxtujplffaac.supabase.co/storage/v1/object/public/wm-public/brand/abc-123.png",
        "wm-public",
      ),
    ).toBe("brand/abc-123.png");
  });

  it("descarta el query string", () => {
    expect(
      storagePathFromPublicUrl(
        "https://x.supabase.co/storage/v1/object/public/wm-public/brand/x.png?token=1",
        "wm-public",
      ),
    ).toBe("brand/x.png");
  });

  it("decodifica rutas percent-encoded", () => {
    expect(
      storagePathFromPublicUrl(
        "https://x.supabase.co/storage/v1/object/public/wm-public/brand/a%20b.png",
        "wm-public",
      ),
    ).toBe("brand/a b.png");
  });

  it("devuelve null si no aparece el bucket", () => {
    expect(storagePathFromPublicUrl("https://example.com/logo.png", "wm-public")).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- storage-path`
Expected: FAIL — "Failed to resolve import './storage-path'" / `storagePathFromPublicUrl is not a function`.

- [ ] **Step 3: Implementación mínima**

Crear `lib/storage-path.ts`:

```ts
/** Extrae la ruta del objeto dentro de un bucket de Supabase Storage desde su URL pública.
 *  Ej.: https://x.supabase.co/storage/v1/object/public/wm-public/brand/abc.png
 *       -> "brand/abc.png" (bucket "wm-public"). Devuelve null si la URL no corresponde. */
export function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length).split("?")[0];
  return path ? decodeURIComponent(path) : null;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- storage-path`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/storage-path.ts lib/storage-path.test.ts
git commit -m "feat(branding): helper storagePathFromPublicUrl con tests"
```

---

## Task 5: Server actions — `updateBrandAsset` (3 kinds) y `removeBrandAsset`

**Files:**
- Modify: `app/(app)/configuracion/actions.ts` (reemplaza `updateBrandAsset`, ~líneas 45-56)

- [ ] **Step 1: Importar el helper de Storage**

En la cabecera de `app/(app)/configuracion/actions.ts`, junto a los imports existentes, añadir:

```ts
import { storagePathFromPublicUrl } from "@/lib/storage-path";
```

- [ ] **Step 2: Reemplazar `updateBrandAsset` y añadir `removeBrandAsset`**

Reemplazar la función `updateBrandAsset` actual por este bloque completo (mapa de columnas, etiqueta de auditoría, las dos acciones; ahora ambas revalidan el root layout para que el favicon y el logo no queden cacheados):

```ts
type BrandKind = "logo" | "logo_dark" | "favicon";

const BRAND_COLUMN: Record<BrandKind, "logo_url" | "logo_dark_url" | "favicon_url"> = {
  logo: "logo_url",
  logo_dark: "logo_dark_url",
  favicon: "favicon_url",
};

function brandLabel(kind: BrandKind): string {
  return kind === "logo"
    ? "el logotipo"
    : kind === "logo_dark"
      ? "el logotipo oscuro"
      : "el favicon";
}

export async function updateBrandAsset(kind: BrandKind, url: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update({ [BRAND_COLUMN[kind]]: url })
    .eq("id", 1);
  if (error) return { error: error.message };
  await audit(`Actualizó ${brandLabel(kind)}`, "Configuración");
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeBrandAsset(kind: BrandKind): Promise<FormState> {
  const supabase = await createClient();
  const column = BRAND_COLUMN[kind];

  // URL actual, para borrar el archivo del bucket (best-effort).
  const { data: current } = await supabase
    .from("settings")
    .select("logo_url, logo_dark_url, favicon_url")
    .eq("id", 1)
    .maybeSingle();

  const { error } = await supabase
    .from("settings")
    .update({ [column]: null })
    .eq("id", 1);
  if (error) return { error: error.message };

  const url = current?.[column] ?? null;
  if (url) {
    const path = storagePathFromPublicUrl(url, "wm-public");
    // Best-effort: si RLS lo rechaza, la columna ya quedó limpia.
    if (path) await supabase.storage.from("wm-public").remove([path]);
  }

  await audit(`Eliminó ${brandLabel(kind)}`, "Configuración");
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}
```

- [ ] **Step 3: Verificar tipos (sin correr la app)**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados con `actions.ts`. (Si `npx tsc` no está configurado, este chequeo se cubre en la verificación final con `npm run build`.)

- [ ] **Step 4: Commit**

```bash
git add app/(app)/configuracion/actions.ts
git commit -m "feat(branding): updateBrandAsset 3 kinds + removeBrandAsset (BD+Storage) y revalida layout"
```

---

## Task 6: `BrandMark` — render del logo por tema

Renderiza dos `<img>` (claro/oscuro) alternadas por la clase `dark` del `<html>`. El "oscuro efectivo" cae al claro si no hay logo oscuro.

**Files:**
- Modify: `components/shell/brand-mark.tsx`

- [ ] **Step 1: Añadir la prop `logoDarkUrl` y renderizar ambas imágenes**

Reemplazar la firma del componente y el bloque `if (logoUrl) { ... }`:

```tsx
export function BrandMark({
  logoUrl,
  logoDarkUrl = null,
  companyName,
  variant,
  collapsed = false,
}: {
  logoUrl: string | null;
  logoDarkUrl?: string | null;
  companyName: string | null;
  variant: "login" | "sidebar";
  collapsed?: boolean;
}) {
  const name = companyName?.trim() || "World Medics";

  const lightSrc = logoUrl ?? logoDarkUrl;
  const darkSrc = logoDarkUrl ?? logoUrl;

  if (lightSrc && darkSrc) {
    const frameClass =
      variant === "login"
        ? "mx-auto flex h-24 w-full max-w-[280px] items-center justify-center"
        : collapsed
          ? "flex size-11 items-center justify-center"
          : "flex h-12 w-full max-w-[190px] items-center justify-start";
    const imageClass =
      variant === "login"
        ? "scale-[1.18]"
        : collapsed
          ? "scale-[1.12]"
          : "scale-[1.22]";

    return (
      <span className={cn("overflow-visible", frameClass)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={lightSrc}
          alt={name}
          className={cn("h-full w-full object-contain", imageClass, "block dark:hidden")}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={darkSrc}
          alt={name}
          className={cn("h-full w-full object-contain", imageClass, "hidden dark:block")}
        />
      </span>
    );
  }
```

(El resto del componente — los dos `return` de fallback al glifo `<Logo/>` — queda igual.)

- [ ] **Step 2: Commit**

```bash
git add components/shell/brand-mark.tsx
git commit -m "feat(branding): BrandMark alterna logo claro/oscuro por tema"
```

---

## Task 7: Propagar `logoDarkUrl` por login y shell

**Files:**
- Modify: `app/(auth)/layout.tsx`
- Modify: `app/(app)/layout.tsx` (~líneas 40-50)
- Modify: `components/shell/app-shell.tsx`
- Modify: `components/shell/sidebar.tsx`

- [ ] **Step 1: Login layout**

En `app/(auth)/layout.tsx`, cambiar la línea de destructuring y la del `BrandMark`:

```tsx
  const { logoUrl, logoDarkUrl, companyName } = await getBranding();
```

```tsx
          <BrandMark
            variant="login"
            logoUrl={logoUrl}
            logoDarkUrl={logoDarkUrl}
            companyName={companyName}
          />
```

- [ ] **Step 2: App layout pasa la prop a AppShell**

En `app/(app)/layout.tsx`, en el JSX de `<AppShell ...>`, añadir `logoDarkUrl`:

```tsx
        <AppShell
          bcv={bcv}
          badges={{ lowStock: shell.lowStock }}
          notifications={shell.notifications}
          logoUrl={branding.logoUrl}
          logoDarkUrl={branding.logoDarkUrl}
          companyName={branding.companyName}
        >
```

- [ ] **Step 3: AppShell acepta y reenvía la prop**

En `components/shell/app-shell.tsx`, añadir `logoDarkUrl` a las props y al `<Sidebar>`:

```tsx
export function AppShell({
  bcv,
  badges,
  notifications,
  logoUrl,
  logoDarkUrl,
  companyName,
  children,
}: {
  bcv: BcvRate;
  badges: { lowStock?: number };
  notifications: ShellNotification[];
  logoUrl: string | null;
  logoDarkUrl: string | null;
  companyName: string | null;
  children: React.ReactNode;
}) {
```

```tsx
      <Sidebar
        collapsed={collapsed}
        badges={badges}
        bcv={bcv}
        logoUrl={logoUrl}
        logoDarkUrl={logoDarkUrl}
        companyName={companyName}
      />
```

- [ ] **Step 4: Sidebar acepta y reenvía la prop**

En `components/shell/sidebar.tsx`, añadir `logoDarkUrl` a las props y al `<BrandMark>`:

```tsx
export function Sidebar({
  collapsed,
  badges,
  bcv,
  logoUrl,
  logoDarkUrl,
  companyName,
}: {
  collapsed: boolean;
  badges: { lowStock?: number };
  bcv: BcvRate;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  companyName: string | null;
}) {
```

```tsx
        <BrandMark
          variant="sidebar"
          collapsed={collapsed}
          logoUrl={logoUrl}
          logoDarkUrl={logoDarkUrl}
          companyName={companyName}
        />
```

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)/layout.tsx" "app/(app)/layout.tsx" components/shell/app-shell.tsx components/shell/sidebar.tsx
git commit -m "feat(branding): propaga logoDarkUrl por login y shell"
```

---

## Task 8: Arreglo del favicon

Elimina el `app/favicon.ico` estático (que se sirve en la ruta reservada `/favicon.ico` y le gana al subido) y deja un único origen de favicon en `generateMetadata`, con un default servido desde `/public`.

**Files:**
- Move: `app/favicon.ico` → `public/favicon-default.ico`
- Modify: `app/layout.tsx` (`generateMetadata`, ~líneas 15-24)

- [ ] **Step 1: Mover el favicon estático a public/**

```bash
git mv app/favicon.ico public/favicon-default.ico
```

- [ ] **Step 2: Emitir un único icon link en generateMetadata**

En `app/layout.tsx`, reemplazar `generateMetadata` por:

```tsx
export async function generateMetadata(): Promise<Metadata> {
  const { faviconUrl } = await getBranding();
  return {
    title: "World Medics ERP",
    description: "ERP de uniformes médicos · World Medics",
    // Un único origen de favicon: el subido si existe, si no el default de /public.
    // (Ya no existe app/favicon.ico, así que nada compite por la ruta /favicon.ico.)
    icons: { icon: [{ url: faviconUrl ?? "/favicon-default.ico" }] },
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/layout.tsx" public/favicon-default.ico
git commit -m "fix(branding): favicon subido gana la pestaña (quita favicon.ico estático, origen único)"
```

---

## Task 9: UI de Configuración — slot de logo oscuro + botones Eliminar

Refactoriza los slots de marca a un componente local `BrandAssetSlot` (DRY) y añade el slot del logo oscuro y el botón Eliminar a cada uno.

**Files:**
- Modify: `components/configuracion/configuracion-view.tsx` (import de actions ~líneas 25-37; `ColorsSection` ~líneas 244-318)

- [ ] **Step 1: Importar `removeBrandAsset`**

En el bloque de imports desde `@/app/(app)/configuracion/actions`, añadir `removeBrandAsset`:

```tsx
  updateBrandAsset,
  removeBrandAsset,
```

- [ ] **Step 2: Añadir el componente local `BrandAssetSlot`**

Justo antes de `function ColorsSection(...)`, añadir:

```tsx
function BrandAssetSlot({
  label,
  kind,
  initial,
  placeholder,
  previewClass,
  boxClass,
  canEdit,
}: {
  label: string;
  kind: "logo" | "logo_dark" | "favicon";
  initial: string | null;
  placeholder: string;
  previewClass: string;
  boxClass?: string;
  canEdit: boolean;
}) {
  const [url, setUrl] = useState(initial);
  const [removing, startRemove] = useTransition();
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div
        className={cn(
          "flex h-24 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border p-2 text-[12px] text-text-3",
          boxClass,
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className={previewClass} />
        ) : (
          placeholder
        )}
      </div>
      {canEdit && (
        <div className="flex items-center gap-2">
          <ImageUpload
            folder="brand"
            label={url ? "Reemplazar" : "Subir"}
            onUploaded={async (u) => {
              setUrl(u);
              const r = await updateBrandAsset(kind, u);
              if (r?.error) toast.error(r.error);
            }}
          />
          {url && (
            <button
              type="button"
              disabled={removing}
              onClick={() =>
                startRemove(async () => {
                  const r = await removeBrandAsset(kind);
                  if (r?.error) toast.error(r.error);
                  else {
                    setUrl(null);
                    toast.success("Eliminado");
                  }
                })
              }
              className="iconbtn inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 py-2 text-[12.5px] font-medium text-danger disabled:opacity-60"
            >
              {removing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Reemplazar los slots inline de `ColorsSection`**

En `ColorsSection`, eliminar los estados `logo`/`favicon` ya no usados y reemplazar el `<div className="grid grid-cols-2 gap-3">...</div>` (los dos slots inline de logo y favicon) por los tres `BrandAssetSlot`. El componente queda así:

```tsx
function ColorsSection({ settings, canEdit }: Data & { which: "primary" }) {
  const [primary, setPrimary] = useState(settings.primary_color ?? "#0EA5E9");
  const [accent] = useState(settings.accent_color ?? "#0EA5E9");
  const [, start] = useTransition();
  function save(p: string, a: string) {
    start(async () => {
      const res = await updateColors(p, a);
      if (res?.error) toast.error(res.error);
      else toast.success("Marca actualizada");
    });
  }
  return (
    <Card title="Logotipo y marca">
      <div className="grid grid-cols-2 gap-3">
        <BrandAssetSlot
          label="Logotipo (claro)"
          kind="logo"
          initial={settings.logo_url}
          placeholder="Sube tu logotipo"
          previewClass="max-h-full max-w-full object-contain"
          canEdit={canEdit}
        />
        <BrandAssetSlot
          label="Logotipo (oscuro)"
          kind="logo_dark"
          initial={settings.logo_dark_url}
          placeholder="Logo para modo oscuro"
          previewClass="max-h-full max-w-full object-contain"
          boxClass="bg-[#0B0F19]"
          canEdit={canEdit}
        />
        <BrandAssetSlot
          label="Favicon"
          kind="favicon"
          initial={settings.favicon_url}
          placeholder="PNG 64×64 px"
          previewClass="size-12 object-contain"
          canEdit={canEdit}
        />
      </div>
      <div className="mt-4 text-[12.5px] font-semibold text-foreground">
        Color primario de marca
      </div>
      <Swatches
        value={primary}
        onChange={(c) => {
          setPrimary(c);
          if (canEdit) save(c, accent);
        }}
        disabled={!canEdit}
      />
    </Card>
  );
}
```

- [ ] **Step 4: Verificar lint**

Run: `npm run lint`
Expected: sin errores nuevos. (Confirma que no quedaron imports/variables sin usar como `logo`/`setLogo`/`favicon`/`setFavicon`.)

- [ ] **Step 5: Commit**

```bash
git add components/configuracion/configuracion-view.tsx
git commit -m "feat(branding): Configuración con logo oscuro y botón Eliminar por asset"
```

---

## Task 10: Documentación

**Files:**
- Modify: `CLAUDE.md` (lista de migraciones; sección "Branding dinámico"; sección "Storage")
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Registrar migraciones nuevas en `CLAUDE.md`**

En la lista "Migraciones aplicadas", añadir tras la #16:

```markdown
17. `wm_settings_logo_dark` — añade `settings.logo_dark_url` (logo para tema oscuro) y recrea
    `wm.branding()` para devolverlo (anon-safe).
18. `wm_storage_brand_delete` — policy `DELETE` en `storage.objects` para el bucket `wm-public`
    (permite borrar logo/favicon al eliminarlos; el borrado real se gatea por permisos de módulo).
```

- [ ] **Step 2: Actualizar la sección "Branding dinámico" de `CLAUDE.md`**

Añadir al bloque del **Logo**: que ahora hay logo claro (`logo_url`) y logo oscuro opcional
(`logo_dark_url`); `BrandMark` muestra ambos `<img>` y alterna por la clase `dark` del `<html>`
(fallback: el oscuro cae al claro). Añadir al bloque del **Favicon**: que el `favicon.ico` estático
se movió a `public/favicon-default.ico` y `generateMetadata` emite un único icon link
(`faviconUrl ?? "/favicon-default.ico"`); las acciones de marca revalidan el root layout. Mencionar
que cada asset se puede **eliminar** (limpia la columna y borra el archivo del bucket, best-effort).

- [ ] **Step 3: Actualizar `docs/PROGRESS.md`**

Añadir una línea en el módulo Configuración/branding indicando: logo por tema (claro/oscuro),
eliminación de logo/favicon y arreglo del favicon en la pestaña.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/PROGRESS.md
git commit -m "docs(branding): registra logo por tema, eliminar marca y arreglo del favicon"
```

---

## Verificación final

- [ ] **Tests unitarios**

Run: `npm test`
Expected: PASS, incluyendo `lib/storage-path.test.ts` (4) y `lib/brand-css.test.ts`.

- [ ] **Build**

Run: `npm run build`
Expected: build exitoso, sin errores de tipos.

- [ ] **Lint**

Run: `npm run lint`
Expected: sin errores nuevos.

- [ ] **Prueba manual (con `npm run dev`)**
  - Configuración → Marca: subir logo claro y logo oscuro; en Apariencia alternar el tema y ver el sidebar/login cambiar de logo sin recargar. Con sólo logo claro, el modo oscuro muestra el claro.
  - Subir un favicon; recargar (duro si hace falta) y ver el ícono en la pestaña. Eliminarlo y ver que vuelve `favicon-default.ico`.
  - Eliminar cada asset: desaparece de login/sidebar/pestaña; el archivo ya no está en `wm-public/brand/` (o, si RLS lo impide, al menos la columna quedó en `null`).

---

## Self-Review (cobertura del spec)

- Favicon no aparece → Task 8 (origen único + quita estático) + Task 5 (revalida layout). ✔
- Eliminar logo/favicon (BD + Storage) → Task 4 (helper), Task 5 (`removeBrandAsset`), Task 9 (UI). ✔
- Logo por tema claro/oscuro → Task 1-3 (columna/RPC/tipos/query), Task 6 (render), Task 7 (propagación), Task 9 (UI subida). ✔
- Fallback "logo claro = base" → Task 6 (`darkSrc = logoDarkUrl ?? logoUrl`, gate en `lightSrc`). ✔
- Limpieza best-effort si RLS rechaza → Task 5 (no bloquea el null) + Task 1 Step 2 (policy DELETE). ✔
- Snapshots/tipos en sync → Task 2. ✔
- Nombres consistentes: `logoDarkUrl` (TS), `logo_dark_url` (SQL), `BrandKind`/`BRAND_COLUMN`/`storagePathFromPublicUrl` usados igual en todas las tasks. ✔
