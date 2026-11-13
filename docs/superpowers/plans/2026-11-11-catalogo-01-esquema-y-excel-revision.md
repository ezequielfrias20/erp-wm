# Catálogo — Plan 1: esquema nuevo y Excel de revisión — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar en producción la estructura nueva del catálogo (aditiva, sin tocar datos) y generar, a partir de una foto de producción, el Excel de revisión que la tienda corrige.

**Architecture:** Una migración SQL idempotente agrega tablas y columnas nulas, más RLS y seeds genéricos. Toda la lógica de propuesta es TypeScript puro y probado en `lib/catalog-migration/`: taxonomía como datos, lectura de nombres y tallas, propuesta y escritor del Excel. El acceso a la base lo hacen scripts de shell con `psql` en `scripts/catalogo/`, que dejan un JSON en `backups/catalogo/`. El CLI une la foto y la propuesta y escribe el `.xlsx`.

**Tech Stack:** Postgres 17 (Supabase, esquema `wm`), `psql` 16 del sistema, TypeScript, Vitest 4, ExcelJS 4, `tsx` (nuevo, devDependency) para correr los CLI.

**Spec:** `docs/superpowers/specs/2026-11-11-catalogo-listo-ecommerce-design.md` · **Hoja de ruta:** `docs/superpowers/plans/2026-11-11-catalogo-00-hoja-de-ruta.md`

## Global Constraints

- Producción `cfggippjujceebovvhsa`, esquema `wm`. Conexión por el pooler en sesión `aws-1-us-west-2.pooler.supabase.com:5432`, usuario `postgres.cfggippjujceebovvhsa`, contraseña **por `PGPASSWORD`** (tiene caracteres que rompen una URL). Se saca de la línea `SUPABASE_DB_URL=` de `.env.local` cuyo host es `db.cfggippjujceebovvhsa.supabase.co`.
- Este plan **no modifica datos** de producción. La única escritura es la migración aditiva (Task 2), y se ejecuta **solo después de que el usuario lo confirme**. La foto de datos corre en transacción de solo lectura.
- `pg_dump` local es 16 y el servidor 17: no usar `pg_dump`.
- Migraciones: `.sql` idempotentes (`if not exists`, `drop … if exists` antes de `create policy/trigger`, `on conflict do nothing`). Al cambiar el esquema se actualizan `lib/database.types.ts` (tipos a mano), `supabase/bootstrap/01_schema.sql` (snapshot), `supabase/bootstrap/02_seed.sql` (solo seeds genéricos) y `supabase/apply_pending.sh`.
- La taxonomía específica de World Medics (árbol de categorías, atributos, líneas, colores canónicos) **no** entra en el bootstrap ni en la migración: vive en `lib/catalog-migration/taxonomy.ts` y la aplica el plan 2.
- RLS: lectura `wm.is_member()`; escritura `wm.has_module('<Módulo>', 2)`. Maestros → `Inventario` (como `colors`, `sizes`, `brands`, `categories` hoy); datos de producto → `Productos`.
- El Excel lo revisa personal de la tienda, no técnico: todo en español, listas desplegables, columnas editables con encabezado azul `#0EA5E9` y columnas informativas con encabezado gris.
- Los datos generados (foto JSON, Excel) **no se commitean**: `backups/catalogo/` va a `.gitignore`.
- Commits con el estilo del repo (`feat(catalogo): …`), terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Nombres con acentos, `ñ`, mayúsculas o asteriscos (`Moño`/`mono`, `Elastica`/`Elástica`, `mostaza`/`Mostaza`, `Naranja *`) deben normalizarse igual. Si no, se proponen como valores distintos. → tests de `normalizeKey`/`matchColor` en Task 4.
2. Productos con el mismo nombre base y **marcas distintas** (`Oximetro` GMD y `Oximetro` Dr John) **no** se deben unir, y sus nombres nuevos deben salir distintos. → test en Task 5.
3. Un color al final del nombre no se extrae si deja un nombre de una sola palabra (`Gorro Rojo`, `Gorro Cafe`). → tests en Task 4.
4. Tallas con sufijo de sucursal y precio (`XS · San Juan de los Morros · $35`) o compuestas con ` / ` (`S-m / Batido Amarrillo`, `Latidos GMD / Sin Voz`) se separan bien y no se pierden en silencio: lo que no se reconoce queda como nota. → tests en Task 4.
5. Las listas desplegables deben seguir funcionando cuando la tienda **agrega filas** (productos nuevos, marcas, colores, valores). Los rangos se extienden más allá de las filas existentes. → test de rangos de validación en Task 6.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `.gitignore` | ignorar `backups/catalogo/` |
| `package.json` | devDependency `tsx`; script `catalogo:excel` |
| `scripts/catalogo/pg-env.sh` | exporta `PG*` para producción leyendo `.env.local` (se usa con `source`) |
| `scripts/catalogo/snapshot.sql` | una sola consulta que devuelve la foto del catálogo como JSON |
| `scripts/catalogo/snapshot.sh` | corre `snapshot.sql` en solo lectura y guarda `backups/catalogo/snapshot-<UTC>.json` |
| `scripts/catalogo/generar-excel.ts` | CLI: foto → propuesta → `.xlsx` + resumen por consola |
| `supabase/catalog_taxonomy.sql` | migración aditiva idempotente |
| `supabase/catalog_taxonomy_check.sql` | verificación (bloque `DO` que lanza excepción si falta algo) |
| `supabase/tests/catalog_taxonomy_rollback.sql` | prueba: aplica dos veces + verifica + `ROLLBACK` |
| `supabase/apply_pending.sh` | añade el paso de la migración y sus objetos a la verificación |
| `supabase/bootstrap/01_schema.sql`, `02_seed.sql` | snapshot del esquema y seeds genéricos |
| `lib/database.types.ts` | tipos nuevos y columnas nuevas |
| `lib/catalog-migration/types.ts` | tipos de la foto (`CatalogSnapshot`) |
| `lib/catalog-migration/snapshot.ts` | `parseSnapshot`, `loadSnapshot` |
| `lib/catalog-migration/taxonomy.ts` | taxonomía de World Medics como datos |
| `lib/catalog-migration/parse.ts` | normalización y lectura de nombres y tallas |
| `lib/catalog-migration/propose.ts` | propuesta de clasificación |
| `lib/catalog-migration/test-fixtures.ts` | foto mínima con casos reales para los tests |
| `lib/catalog-migration/workbook-schema.ts` | nombres de hojas y encabezados (contrato con el plan 2) |
| `lib/catalog-migration/workbook.ts` | arma el Excel |
| `docs/CATALOGO-LIMPIEZA.md` | runbook del desarrollador |

---

### Task 1: Rama, herramientas y foto de producción

**Files:**
- Modify: `.gitignore`, `package.json`
- Create: `scripts/catalogo/pg-env.sh`, `scripts/catalogo/snapshot.sql`, `scripts/catalogo/snapshot.sh`
- Create: `lib/catalog-migration/types.ts`, `lib/catalog-migration/snapshot.ts`
- Test: `lib/catalog-migration/snapshot.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/catalog-migration/types.ts
  export type SnapshotNamed = { id: string; name: string };
  export type SnapshotColor = { id: string; name: string; hex: string | null };
  export type SnapshotProduct = {
    id: string; name: string; description: string | null;
    category_id: string | null; brand_id: string | null;
    is_active: boolean; visible_in_catalog: boolean; has_image: boolean;
    created_at: string; updated_at: string;
  };
  export type SnapshotVariant = {
    id: string; product_id: string; sku: string;
    color: string | null; color_hex: string | null; size: string | null;
    price: number; cost: number; is_active: boolean;
    stock: Record<string, number>;   // branch_id → cantidad
    sale_lines: number;              // nº de filas en sale_items que la apuntan
    created_at: string; updated_at: string;
  };
  export type CatalogSnapshot = {
    taken_at: string;
    branches: SnapshotNamed[]; categories: SnapshotNamed[]; brands: SnapshotNamed[];
    colors: SnapshotColor[]; products: SnapshotProduct[]; variants: SnapshotVariant[];
  };
  // lib/catalog-migration/snapshot.ts
  export function parseSnapshot(raw: unknown): CatalogSnapshot;      // valida y normaliza números
  export function loadSnapshot(path: string): Promise<CatalogSnapshot>;
  ```
- `scripts/catalogo/snapshot.sh` imprime la ruta del JSON creado en la última línea de stdout.

- [ ] **Step 1: Crear la rama e instalar `tsx`**

```bash
git switch feat/catalogo-ecommerce   # ya existe: lleva el spec y los planes
npm install --save-dev tsx
printf '\n# Catálogo: fotos de producción y Excel de revisión (datos del negocio)\nbackups/catalogo/\n' >> .gitignore
```

En `package.json` → `scripts`: `"catalogo:excel": "tsx scripts/catalogo/generar-excel.ts"`.

- [ ] **Step 2: Escribir los tests de `parseSnapshot`**

```ts
// lib/catalog-migration/snapshot.test.ts
describe("parseSnapshot", () => {
  it("acepta una foto válida y convierte price/cost/stock/sale_lines a número", () => {
    const s = parseSnapshot({ taken_at: "2026-11-11T12:00:00Z", branches: [], categories: [],
      brands: [], colors: [], products: [],
      variants: [{ id: "v1", product_id: "p1", sku: "A", color: null, color_hex: null, size: null,
        price: "35.00", cost: "10", is_active: true, stock: { b1: "2" }, sale_lines: "3",
        created_at: "x", updated_at: "x" }] });
    expect(s.variants[0].price).toBe(35);
    expect(s.variants[0].stock).toEqual({ b1: 2 });
    expect(s.variants[0].sale_lines).toBe(3);
  });
  it("falla con mensaje claro si falta una sección", () => {
    expect(() => parseSnapshot({ taken_at: "x", branches: [] })).toThrow(/categories/);
  });
  it("falla si no es un objeto", () => {
    expect(() => parseSnapshot(null)).toThrow(/foto/i);
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run lib/catalog-migration/snapshot.test.ts`
Expected: FAIL (`parseSnapshot` no existe).

- [ ] **Step 4: Implementar `types.ts` y `snapshot.ts`**

`parseSnapshot` comprueba que existan `taken_at` y los seis arreglos (el mensaje nombra la sección que falta). Convierte con `Number()` `price`, `cost`, `sale_lines` y cada valor de `stock`. El resto lo copia tal cual. `loadSnapshot` usa `fs/promises.readFile` + `JSON.parse` + `parseSnapshot`.

- [ ] **Step 5: Correr y ver que pasa**

Run: `npx vitest run lib/catalog-migration/snapshot.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Escribir `pg-env.sh`, `snapshot.sql` y `snapshot.sh`**

`pg-env.sh` (para `source`, compatible con bash y zsh):
- toma de `.env.local` la primera línea sin comentar que empiece con `SUPABASE_DB_URL=postgresql://` y contenga `@db.`;
- extrae la contraseña como el texto entre `://postgres:` y el **último** `@`, y el ref como el texto entre `@db.` y `.supabase.co`;
- exporta `PGHOST=${CATALOGO_PGHOST:-aws-1-us-west-2.pooler.supabase.com}`, `PGPORT=5432`, `PGUSER=postgres.<ref>`, `PGDATABASE=postgres`, `PGSSLMODE=require`, `PGPASSWORD`;
- si no encuentra la línea, imprime un error a stderr y hace `return 1`.

`snapshot.sql` es **una sola** sentencia `select json_build_object(...)`:
- `taken_at` = `now()`.
- `branches`, `categories`, `brands` = `{id, name}`; `colors` = `{id, name, hex}`.
- `products` = las columnas de `SnapshotProduct`, con `has_image` = `exists(select 1 from storage.objects o where o.bucket_id = 'wm-public' and o.name = 'product-images/' || p.id || '.png')`.
- `variants` = las columnas de `SnapshotVariant`, con `stock` = `coalesce((select json_object_agg(i.branch_id, i.quantity) from wm.inventory i where i.variant_id = v.id), '{}'::json)` y `sale_lines` = `(select count(*) from wm.sale_items si where si.variant_id = v.id)`.
- Cada arreglo lleva `coalesce(json_agg(... order by ...), '[]'::json)`.

`snapshot.sh`: `set -euo pipefail`, `cd` a la raíz del repo, `source scripts/catalogo/pg-env.sh`, `mkdir -p backups/catalogo`. Corre `PGOPTIONS='-c default_transaction_read_only=on' psql -X -At -v ON_ERROR_STOP=1 -f scripts/catalogo/snapshot.sql > backups/catalogo/snapshot-$(date -u +%Y%m%dT%H%M%SZ).json` y al final hace `echo` de la ruta.

- [ ] **Step 7: Tomar la foto real y verificarla**

Run:
```bash
chmod +x scripts/catalogo/snapshot.sh && F=$(scripts/catalogo/snapshot.sh | tail -1) && \
node -e "const s=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(s.products.length,s.variants.length,s.branches.length)" "$F"
```
Expected: tres números > 0 (al 2026-11-11 eran ~433, ~1103 y 2). `git status` no muestra el JSON.

- [ ] **Step 8: Commit**

```bash
git add .gitignore package.json package-lock.json scripts/catalogo lib/catalog-migration
git commit -m "feat(catalogo): foto de producción del catálogo en JSON"
```

---

### Task 2: Migración aditiva del esquema

**Files:**
- Create: `supabase/catalog_taxonomy.sql`, `supabase/catalog_taxonomy_check.sql`, `supabase/tests/catalog_taxonomy_rollback.sql`
- Modify: `supabase/apply_pending.sh`, `supabase/bootstrap/01_schema.sql`, `supabase/bootstrap/02_seed.sql`, `lib/database.types.ts`

**Interfaces:**
- Consumes: `scripts/catalogo/pg-env.sh` (Task 1).
- Produces (esquema `wm`): las tablas y columnas de abajo, con estos nombres exactos. El plan 2 escribe en ellas y el plan 3 las lee.

- [ ] **Step 1: Escribir la verificación `catalog_taxonomy_check.sql` (el test)**

Bloque `DO $$ … $$` que lanza `raise exception 'catalog_taxonomy: falta %', <objeto>` ante el primer faltante y termina con `raise notice 'catalog_taxonomy OK'`. Comprueba:
- las 11 tablas nuevas (`to_regclass`): `option_types`, `option_values`, `color_families`, `product_lines`, `attributes`, `attribute_values`, `category_attributes`, `product_attribute_values`, `product_media`, `variant_sku_aliases`, `catalog_migration_log`;
- las columnas nuevas (`pg_attribute`): `colors.{slug,family_id,swatch_url,is_active}`, `brands.{slug,logo_url,description}`, `categories.{parent_id,option_type_id,requires_color}`, `products.{slug,line_id,specs}`, `product_variants.{color_id,option_value_id}`;
- RLS habilitada (`pg_class.relrowsecurity`) en las 11 tablas nuevas;
- las políticas `product_media_sel`, `product_media_ins`, `option_values_upd` y `catalog_migration_log_sel` (`pg_policies`);
- los seeds: `option_types` con códigos `talla` y `amarre`; 11 valores de talla; 3 de amarre; 8 `color_families`.

- [ ] **Step 2: Escribir la prueba con `ROLLBACK`**

```sql
-- supabase/tests/catalog_taxonomy_rollback.sql  (correr desde la raíz del repo)
\set ON_ERROR_STOP 1
begin;
\i supabase/catalog_taxonomy.sql
\i supabase/catalog_taxonomy.sql
\i supabase/catalog_taxonomy_check.sql
rollback;
```

- [ ] **Step 3: Correr y ver que falla**

Run: `source scripts/catalogo/pg-env.sh && psql -X -f supabase/tests/catalog_taxonomy_rollback.sql`
Expected: error `supabase/catalog_taxonomy.sql: No such file or directory`.

- [ ] **Step 4: Escribir `supabase/catalog_taxonomy.sql`**

Encabezado con comentario que apunte al spec. Todas las sentencias son idempotentes. Usar exactamente estas definiciones:

```sql
create table if not exists wm.option_types (
  id uuid primary key default gen_random_uuid(),
  code text unique not null, name text not null, sort_order int not null default 0);
create table if not exists wm.option_values (
  id uuid primary key default gen_random_uuid(),
  option_type_id uuid not null references wm.option_types(id) on delete restrict,
  label text not null, slug text not null, sort_order int not null default 0,
  is_active boolean not null default true, unique (option_type_id, slug));
create table if not exists wm.color_families (
  id uuid primary key default gen_random_uuid(),
  name text unique not null, slug text unique not null, hex text, sort_order int not null default 0);
alter table wm.colors
  add column if not exists slug text,
  add column if not exists family_id uuid references wm.color_families(id) on delete set null,
  add column if not exists swatch_url text,
  add column if not exists is_active boolean not null default true;
create unique index if not exists colors_slug_key on wm.colors(slug) where slug is not null;
alter table wm.brands
  add column if not exists slug text, add column if not exists logo_url text,
  add column if not exists description text;
create unique index if not exists brands_slug_key on wm.brands(slug) where slug is not null;
create table if not exists wm.product_lines (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references wm.brands(id) on delete cascade,
  name text not null, slug text not null, sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (brand_id, slug));
alter table wm.categories
  add column if not exists parent_id uuid references wm.categories(id) on delete restrict,
  add column if not exists option_type_id uuid references wm.option_types(id) on delete set null,
  add column if not exists requires_color boolean not null default false;
create unique index if not exists categories_slug_key on wm.categories(slug) where slug is not null;
create index if not exists categories_parent_idx on wm.categories(parent_id);
create table if not exists wm.attributes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null, name text not null,
  is_multi boolean not null default false, sort_order int not null default 0);
create table if not exists wm.attribute_values (
  id uuid primary key default gen_random_uuid(),
  attribute_id uuid not null references wm.attributes(id) on delete cascade,
  name text not null, slug text not null, sort_order int not null default 0,
  is_active boolean not null default true, unique (attribute_id, slug));
create table if not exists wm.category_attributes (
  category_id uuid not null references wm.categories(id) on delete cascade,
  attribute_id uuid not null references wm.attributes(id) on delete cascade,
  is_required boolean not null default false, sort_order int not null default 0,
  primary key (category_id, attribute_id));
create table if not exists wm.product_attribute_values (
  product_id uuid not null references wm.products(id) on delete cascade,
  attribute_value_id uuid not null references wm.attribute_values(id) on delete cascade,
  primary key (product_id, attribute_value_id));
create index if not exists product_attribute_values_value_idx on wm.product_attribute_values(attribute_value_id);
alter table wm.products
  add column if not exists slug text,
  add column if not exists line_id uuid references wm.product_lines(id) on delete set null,
  add column if not exists specs jsonb not null default '[]'::jsonb;  -- [{label, value}]
create unique index if not exists products_slug_key on wm.products(slug) where slug is not null;
create index if not exists products_line_idx on wm.products(line_id);
alter table wm.product_variants
  add column if not exists color_id uuid references wm.colors(id) on delete restrict,
  add column if not exists option_value_id uuid references wm.option_values(id) on delete restrict;
create index if not exists product_variants_color_idx on wm.product_variants(color_id);
create index if not exists product_variants_option_idx on wm.product_variants(option_value_id);
create table if not exists wm.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references wm.products(id) on delete cascade,
  color_id uuid references wm.colors(id) on delete set null,   -- null = foto general
  path text not null, alt text, sort_order int not null default 0,
  created_at timestamptz not null default now());
create index if not exists product_media_product_idx on wm.product_media(product_id, color_id, sort_order);
create table if not exists wm.variant_sku_aliases (
  sku text primary key,
  variant_id uuid not null references wm.product_variants(id) on delete cascade,
  created_at timestamptz not null default now());
create table if not exists wm.catalog_migration_log (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null, entity text not null, old_id uuid, new_id uuid,
  old_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index if not exists catalog_migration_log_run_idx on wm.catalog_migration_log(run_id, entity);
```

Después, en el mismo archivo:
- Trigger `product_lines_set_updated_at` (`drop trigger if exists` + `create trigger … execute function wm.set_updated_at()`).
- `alter table … enable row level security` en las 11 tablas nuevas.
- Un bloque `DO` con el mismo patrón de mapa del bootstrap (`supabase/bootstrap/01_schema.sql:574-601`). Cada política lleva antes su `drop policy if exists`. Mapa: `option_types`, `option_values`, `color_families`, `product_lines`, `attributes`, `attribute_values`, `category_attributes` → `Inventario`; `product_attribute_values`, `product_media`, `variant_sku_aliases` → `Productos`.
- `catalog_migration_log`: solo la política `catalog_migration_log_sel` (select para `wm.is_member()`). Sin políticas de escritura: la escribe el plan 2 como `postgres`.
- `grant select, insert, update, delete` sobre las 10 tablas con escritura, y `grant select` sobre `catalog_migration_log`, a `authenticated`.
- Seeds con `on conflict do nothing`:
  - `option_types`: `('talla','Talla',1)`, `('amarre','Amarre',2)`.
  - Talla (`label`/`slug`/`sort_order`): XXS/xxs/1, XS/xs/2, S/s/3, S-M/s-m/4, M/m/5, L/l/6, L-XL/l-xl/7, XL/xl/8, 2XL/2xl/9, 3XL/3xl/10, Única/unica/11.
  - Amarre: Moño/mono/1, Tiras/tiras/2, Elástica/elastica/3.
  - `color_families` (`name`/`slug`/`hex`/`sort_order`): Azules/azules/#2563EB/1, Verdes/verdes/#16A34A/2, Rojos/rojos/#DC2626/3, Rosados/rosados/#EC4899/4, Morados/morados/#7C3AED/5, Amarillos y naranjas/amarillos-y-naranjas/#F59E0B/6, Neutros/neutros/#6B7280/7, Estampados/estampados/null/8.

- [ ] **Step 5: Correr la prueba y ver que pasa**

Run: `source scripts/catalogo/pg-env.sh && psql -X -f supabase/tests/catalog_taxonomy_rollback.sql`
Expected: `NOTICE:  catalog_taxonomy OK` y termina en `ROLLBACK`. Después, `psql -X -At -c "select to_regclass('wm.product_media')"` devuelve vacío (no quedó nada).

- [ ] **Step 6: Actualizar tipos, bootstrap y `apply_pending.sh`**

- `lib/database.types.ts`:
  - Columnas nuevas: `Category` (`parent_id: string | null; option_type_id: string | null; requires_color: boolean`), `Brand` (`slug: string | null; logo_url: string | null; description: string | null`), `ColorRow` (`slug: string | null; family_id: string | null; swatch_url: string | null; is_active: boolean`), `Product` (`slug: string | null; line_id: string | null; specs: ProductSpec[]` con `export type ProductSpec = { label: string; value: string }`) y `ProductVariant` (`color_id: string | null; option_value_id: string | null`).
  - Tipos nuevos `OptionType`, `OptionValue`, `ColorFamily`, `ProductLine`, `AttributeRow`, `AttributeValue`, `CategoryAttribute`, `ProductAttributeValue`, `ProductMedia`, `VariantSkuAlias`, `CatalogMigrationLog` (campos = columnas de arriba), registrados en `Database.wm.Tables`.
- `supabase/bootstrap/01_schema.sql`: plegar la migración al estado final, como indica `supabase/bootstrap/README.md`. Columnas nuevas dentro de cada `CREATE TABLE`, tablas nuevas en la sección de tablas, `product_lines` en el arreglo de triggers `updated_at`, mapa de RLS ampliado, `catalog_migration_log` con su política, y grants.
- `supabase/bootstrap/02_seed.sql`: los mismos seeds genéricos (tipos de opción, valores de talla y amarre, familias de color).
- `supabase/apply_pending.sh`: nuevo paso `run supabase/catalog_taxonomy.sql` antes de `ANALYZE`. En la verificación final: `('tab','option_types')`, `('tab','product_media')`, `('tab','variant_sku_aliases')`, `('col','product_variants.color_id')`.

- [ ] **Step 7: Verificar tipos, tests y lint**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: sin errores; todos los tests pasan.

- [ ] **Step 8: Commit**

```bash
git add supabase lib/database.types.ts
git commit -m "feat(catalogo): esquema aditivo para catálogo clasificado (opciones, atributos, líneas, fotos, alias SKU)"
```

- [ ] **Step 9: Aplicar en producción — PEDIR CONFIRMACIÓN AL USUARIO ANTES**

Detenerse y pedir al usuario que confirme aplicar la migración en producción (es aditiva: solo agrega tablas y columnas nulas). Con su «sí»:

Run: `source scripts/catalogo/pg-env.sh && psql -X -1 -v ON_ERROR_STOP=1 -f supabase/catalog_taxonomy.sql && psql -X -f supabase/catalog_taxonomy_check.sql`
Expected: `NOTICE:  catalog_taxonomy OK`. Luego `psql -X -At -c "select count(*) from wm.products"` devuelve el mismo número que en la foto.

---

### Task 3: Taxonomía de World Medics como datos

**Files:**
- Create: `lib/catalog-migration/taxonomy.ts`, `lib/catalog-migration/parse.ts` (solo `normalizeKey` en esta task)
- Test: `lib/catalog-migration/taxonomy.test.ts`, `lib/catalog-migration/parse.test.ts` (solo `normalizeKey`)

**Interfaces:**
- Produces:
  ```ts
  // parse.ts (se completa en la Task 4)
  export function normalizeKey(s: string): string;
  // taxonomy.ts
  export type OptionTypeCode = "talla" | "amarre";
  export type AttributeDef = { code: string; name: string; isMulti: boolean; values: string[] };
  export type CategoryDef = {
    department: string; name: string;
    optionType: OptionTypeCode | null; requiresColor: boolean;
    attributes: { code: string; required: boolean }[];
  };
  export type ColorDef = { name: string; hex: string; family: string; aliases: string[] };
  export type BrandDef = { name: string; aliases: RegExp[]; lines: string[] };
  export type KeywordRule = { pattern: RegExp; category: string };            // category = path
  export type AttributeKeyword = { attribute: string; value: string; pattern: RegExp };
  export type Taxonomy = {
    departments: string[];
    categories: CategoryDef[];
    attributes: AttributeDef[];
    optionValues: Record<OptionTypeCode, string[]>;
    optionAliases: Record<string, string>;        // normalizeKey(texto) → etiqueta canónica
    colorFamilies: string[];
    colors: ColorDef[];
    brands: BrandDef[];
    legacyCategoryMap: Record<string, string>;    // nombre de categoría actual → path
    uniformOverrides: KeywordRule[];              // aplican si la categoría actual es «Uniformes»
    nameCategoryRules: KeywordRule[];             // aplican si el producto no tiene categoría
    attributeKeywords: AttributeKeyword[];
  };
  export const TAXONOMY: Taxonomy;
  export const PATH_SEP = " › ";
  export function categoryPath(c: Pick<CategoryDef, "department" | "name">): string;
  export function findCategory(tax: Taxonomy, path: string): CategoryDef | undefined;
  ```

- [ ] **Step 1: Escribir los tests de `normalizeKey` y de invariantes**

```ts
// parse.test.ts
it("normalizeKey", () => {
  expect(normalizeKey("  Mao  Stretch DAMA ")).toBe("mao stretch dama");
  expect(normalizeKey("Naranja *")).toBe("naranja");
  expect(normalizeKey("Moño")).toBe("mono");
  expect(normalizeKey("Algodón")).toBe("algodon");
});
// taxonomy.test.ts
describe("TAXONOMY", () => {
  it("cada categoría pertenece a un departamento declarado", ...);
  it("los atributos que usa cada categoría existen", ...);
  it("las etiquetas de opción son únicas entre tipos (normalizeKey)", ...);
  it("cada alias de opción apunta a una etiqueta existente", ...);
  it("cada color tiene familia declarada y hex #RRGGBB distinto de #0EA5E9", ...);
  it("ningún alias de color (ni nombre) se repite entre colores (normalizeKey)", ...);
  it("legacyCategoryMap cubre las 52 categorías actuales y apunta a paths existentes", () => {
    for (const legacy of LEGACY_52) expect(findCategory(TAXONOMY, TAXONOMY.legacyCategoryMap[legacy])).toBeDefined();
  });
  it("las reglas por palabra clave apuntan a paths existentes", ...);
  it("los valores de attributeKeywords existen en su atributo", ...);
});
```
`LEGACY_52` es la lista literal de las 52 categorías actuales, en el test (fuente: la tabla del Apéndice A del spec + las de abajo).

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run lib/catalog-migration/taxonomy.test.ts lib/catalog-migration/parse.test.ts`
Expected: FAIL (módulos no existen).

- [ ] **Step 3: Implementar `normalizeKey` en `parse.ts` y `taxonomy.ts` con estos datos**

`normalizeKey`: NFD + quitar marcas diacríticas, minúsculas, quitar `*`, colapsar espacios, `trim`.

**Departamentos:** Uniformes, Equipos médicos, Accesorios.

**Categorías** (`opción` / `exige color` / atributos, con `*` = obligatorio):

| Departamento | Categoría | Opción | Color | Atributos |
|---|---|---|---|---|
| Uniformes | Conjuntos | talla | sí | genero*, corte*, tela* |
| Uniformes | Batas y chaquetas | talla | sí | genero*, largo*, tela |
| Uniformes | Gorros | amarre | no | tematica*, genero, especialidad |
| Uniformes | Medias de compresión | talla | no | — |
| Equipos médicos | Estetoscopios | — | no | publico |
| Equipos médicos | Tensiómetros | — | no | tipo_tensiometro*, voz |
| Equipos médicos | Oxímetros | — | no | publico |
| Equipos médicos | Termómetros | — | no | tipo_termometro*, publico |
| Equipos médicos | Otoscopios y ORL | — | no | — |
| Equipos médicos | Glucómetros y consumibles | — | no | — |
| Equipos médicos | Exploración física | — | no | — |
| Equipos médicos | Terapia y rehabilitación | — | no | — |
| Equipos médicos | Instrumental y práctica | — | no | — |
| Equipos médicos | Repuestos y accesorios de equipos | — | no | — |
| Accesorios | Identificación | — | no | — |
| Accesorios | Bolsos y morrales | — | no | — |
| Accesorios | Papelería | — | no | — |
| Accesorios | Otros accesorios | — | no | — |

**Atributos** (`code` / nombre / multi / valores):
- `genero` / Género / no / Dama, Caballero, Unisex
- `corte` / Corte / no / Recta, Ancha, Jogger
- `tela` / Tela / no / Stretch, Mic, Algodón, Poliéster
- `largo` / Largo / no / Corta, Larga
- `tematica` / Temática / no / Personajes, Animales, Especialidad médica, Liso, Estampado
- `especialidad` / Especialidad / **sí** / Medicina general, Enfermería, Odontología, Bioanálisis, Anestesiología, Pediatría, Cirugía, Fisioterapia, Bacteriología
- `tipo_tensiometro` / Tipo de tensiómetro / no / Digital de brazo, Digital de muñeca, Manual, Doble manguera
- `voz` / Voz / no / Con voz, Sin voz
- `publico` / Público / no / Adulto, Pediátrico
- `tipo_termometro` / Tipo de termómetro / no / Digital, Infrarrojo, Mercurio

**Opciones:** igual que los seeds de la Task 2 (talla: XXS…Única; amarre: Moño, Tiras, Elástica). `optionAliases`: `s-m`, `s/m`, `s m` → S-M; `l-xl`, `l/xl` → L-XL; `xxl` → 2XL; `xxxl` → 3XL; `unica`, `talla unica` → Única; `elastica` → Elástica; `mono` → Moño; `tira` → Tiras. Las etiquetas canónicas también se reconocen por su propia clave.

**Familias de color:** las 8 de la Task 2.

**Colores canónicos:** uno por cada color de `wm.colors` y por cada texto distinto de `product_variants.color`, unificando con `normalizeKey` (definido en la Task 4: minúsculas, sin acentos, sin `*`). Hex real aproximado; ninguno `#0EA5E9`. Uniones explícitas (canónico ← alias):
- Mostaza ← mostaza · Verde Oliva ← Verde Olivo · Verde Quirófano ← Verde Qx, Verde Quirofano
- Naranja ← Naranja * · Verde Manzana ← Verde Manzana* · Caqui ← Caqui *
- Amarillo ← Amarilla · Azul ← Azules · Rosado ← Rosada · Morado ← Morada · Negro ← Negra
- Blanco Óptico ← Blanco Optico · Marrón ← Marron
- Batido Amarillo ← Batido Amarrillo (familia Estampados)

Van en la familia **Estampados**: Cuadrada Azul, Cuadrada Verde, Pinguino Lila, Amarillo Con Diseño, Azul Con Blanco, Amarillo Con Azul, Azul Perro, Tierra - Caribean, Batido Amarillo. Si la foto real trae más textos de color, se agregan en la Task 7. Ahí el criterio es que no quede ningún color sin resolver.

**Marcas** (`name` / alias para buscar en el nombre / líneas):
- World Medics / — / Mao, Mao Pro, Altu, Esencial, Básico, Cargo, Colors, Elite, Pro
- Figs / `/\bfigs\b/` / —
- Littmann / `/\blittmann\b/` / Classic III
- GMD / `/\bgmd\b/` / —
- Valcri / `/\bvalcri\b/` / —
- Dr John / `/\bdr\.?\s*jo(h)?n\b/` / —
- Carditek / `/\bcarditek\b/` / —
- Gorro Med, Toons, Genérico, DM / — / —

**`legacyCategoryMap`** (actual → path): la tabla del Apéndice A del spec, con estas precisiones: «Uniformes» y «Estampadas» → Uniformes › Conjuntos; «Medias Compresivas» → Uniformes › Medias de compresión; «Gorro Migraña» → Uniformes › Gorros; «Pines» → Accesorios › Identificación; «Rompe Ampollas», «Control» y «Maxikoala» → Accesorios › Otros accesorios.

**`uniformOverrides`** (en orden): `/\b(bata|chaqueta|larga|sobretodo|solapa)\b/` → Uniformes › Batas y chaquetas; `/\bbolso\b/` → Accesorios › Bolsos y morrales; `/modelo anatomico/` → Equipos médicos › Instrumental y práctica.

**`nameCategoryRules`** (en orden; se prueban sobre `normalizeKey(nombre)`): `gorro` → Gorros; `medias compresivas` → Medias de compresión; `estetoscopio` → Estetoscopios; `tensiometro` → Tensiómetros; `oximetro` → Oxímetros; `termometro` → Termómetros; `otoscopio|fronto luz` → Otoscopios y ORL; `glucometro` → Glucómetros y consumibles; `diapason` → Exploración física; `rompe ampolla` → Otros accesorios; `lanyard|portacarnet|\bpines?\b` → Identificación; `sutura|tijera|torniquete|modelo anatomico` → Instrumental y práctica; `boligrafo|libreta|libro` → Papelería; `\btens\b` → Terapia y rehabilitación; `\b(mao|figs|stretch|jogger|recta)\b` → Conjuntos.

**`attributeKeywords`** (sobre `normalizeKey` del nombre; el orden importa dentro de cada atributo):
- genero: `\b(dama|mujer)\b`→Dama; `\b(caballero|hombre)\b`→Caballero; `\bunisex\b`→Unisex
- corte: `\brecta\b`→Recta; `\bancha\b`→Ancha; `\bjogger\b`→Jogger
- tela: `\bstretch\b`→Stretch; `\bmic\b`→Mic; `\balgodon\b`→Algodón; `\bpoliester\b`→Poliéster
- largo: `\blarga\b`→Larga; `\bcorta\b`→Corta
- voz: `\bcon voz\b`→Con voz; `\bsin voz\b`→Sin voz
- tipo_tensiometro: `\bmuneca\b`→Digital de muñeca; `\bdoble manguera\b`→Doble manguera; `\bdigital\b`→Digital de brazo
- tipo_termometro: `\bmercurio\b`→Mercurio; `\binfrarrojo\b`→Infrarrojo; `\bdigital\b`→Digital
- publico: `\b(pediatric[oa]|baby|bebe)\b`→Pediátrico
- tematica: `\b(anestesi|bioanalis|odontolog|bacteriolog|cerebelo|enfermer|medicin|quirofano|cardio|pediatr|neuro|fisio)`→Especialidad médica
- especialidad: `anestesi`→Anestesiología; `bioanalis`→Bioanálisis; `odontolog`→Odontología; `enfermer`→Enfermería; `bacteriolog`→Bacteriología; `pediatr`→Pediatría; `fisio`→Fisioterapia

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run lib/catalog-migration/taxonomy.test.ts lib/catalog-migration/parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/catalog-migration/taxonomy.ts lib/catalog-migration/taxonomy.test.ts lib/catalog-migration/parse.ts lib/catalog-migration/parse.test.ts
git commit -m "feat(catalogo): taxonomía propuesta (árbol, atributos, opciones, colores, marcas)"
```

---

### Task 4: Normalización y lectura de nombres y tallas

**Files:**
- Modify: `lib/catalog-migration/parse.ts` (ya tiene `normalizeKey` de la Task 3)
- Test: `lib/catalog-migration/parse.test.ts`

**Interfaces:**
- Consumes: `Taxonomy`, `TAXONOMY`, `OptionTypeCode`, `normalizeKey` (Task 3).
- Produces:
  ```ts
  export function titleCase(s: string): string;
  export function stripBranchPriceSuffix(size: string): string;
  export type ParsedOption = { type: OptionTypeCode; label: string };
  export function matchOption(text: string, tax: Taxonomy): ParsedOption | null;
  export function matchColor(text: string, tax: Taxonomy): string | null;   // nombre canónico
  export type SizePart =
    | { kind: "option"; option: ParsedOption }
    | { kind: "color"; color: string }
    | { kind: "redundant"; text: string }   // ya está en el nombre del producto
    | { kind: "unknown"; text: string };
  export function classifySize(size: string, productName: string, tax: Taxonomy): SizePart[];
  export type NameParts = { baseName: string; color: string | null; option: ParsedOption | null };
  export function extractFromName(name: string, tax: Taxonomy): NameParts;
  ```

- [ ] **Step 1: Escribir los tests**

```ts
const T = TAXONOMY;
it("titleCase solo toca palabras en minúscula y deja conectores", () => {
  expect(titleCase("basico stretch caballero recta")).toBe("Basico Stretch Caballero Recta");
  expect(titleCase("set de Kit de sutura")).toBe("Set de Kit de Sutura");
  expect(titleCase("Tensiometro GMD Digital Con Voz")).toBe("Tensiometro GMD Digital Con Voz");
  expect(titleCase("estetoscopio OIS 300")).toBe("Estetoscopio OIS 300");
});
it("stripBranchPriceSuffix", () => {
  expect(stripBranchPriceSuffix("XS · San Juan de los Morros · $35")).toBe("XS");
  expect(stripBranchPriceSuffix("Moño · Maracay · $10")).toBe("Moño");
  expect(stripBranchPriceSuffix("M")).toBe("M");
});
it("matchOption / matchColor", () => {
  expect(matchOption("S-m", T)).toEqual({ type: "talla", label: "S-M" });
  expect(matchOption("Elastica", T)).toEqual({ type: "amarre", label: "Elástica" });
  expect(matchOption("mono", T)).toEqual({ type: "amarre", label: "Moño" });
  expect(matchColor("mostaza", T)).toBe("Mostaza");
  expect(matchColor("Verde Qx", T)).toBe("Verde Quirófano");
  expect(matchColor("Naranja *", T)).toBe("Naranja");
  expect(matchColor("Colors", T)).toBeNull();
});
it("classifySize", () => {
  expect(classifySize("XS · San Juan de los Morros · $35", "Mao Mic Dama Recta", T))
    .toEqual([{ kind: "option", option: { type: "talla", label: "XS" } }]);
  expect(classifySize("S-m / Batido Amarrillo", "Medias Compresivas 15-20 Mmhg S-m Batido Amarrillo", T))
    .toEqual([{ kind: "option", option: { type: "talla", label: "S-M" } }, { kind: "color", color: "Batido Amarillo" }]);
  expect(classifySize("Latidos GMD / Sin Voz", "Tensiometro Digital Latidos GMD Sin Voz", T))
    .toEqual([{ kind: "redundant", text: "Latidos GMD" }, { kind: "redundant", text: "Sin Voz" }]);
  expect(classifySize("Bob Sponja", "Rompe Ampollas 3D Bob Sponja", T)).toEqual([{ kind: "redundant", text: "Bob Sponja" }]);
  expect(classifySize("Morada", "Tijeras Trauma GMD Tornasol Morada", T)).toEqual([{ kind: "color", color: "Morado" }]);
  expect(classifySize("Foo", "Bar", T)).toEqual([{ kind: "unknown", text: "Foo" }]);
});
it("extractFromName", () => {
  expect(extractFromName("Gorro Baby Yoda Moño", T)).toEqual({ baseName: "Gorro Baby Yoda", color: null, option: { type: "amarre", label: "Moño" } });
  expect(extractFromName("gorro anestesia azul tiras", T)).toEqual({ baseName: "Gorro Anestesia", color: "Azul", option: { type: "amarre", label: "Tiras" } });
  expect(extractFromName("Gorro Hello Kitty Rojo Moño", T)).toEqual({ baseName: "Gorro Hello Kitty", color: "Rojo", option: { type: "amarre", label: "Moño" } });
  expect(extractFromName("Medias Compresivas 15-20 Mmhg S-m Batido Amarrillo", T)).toEqual({ baseName: "Medias Compresivas 15-20 Mmhg", color: "Batido Amarillo", option: { type: "talla", label: "S-M" } });
  expect(extractFromName("Tijeras Trauma GMD Tornasol Negra", T).color).toBe("Negro");
  expect(extractFromName("Gorro Rojo", T)).toEqual({ baseName: "Gorro Rojo", color: null, option: null });
  expect(extractFromName("Gorro Cafe Elastica", T)).toEqual({ baseName: "Gorro Cafe", color: null, option: { type: "amarre", label: "Elástica" } });
  expect(extractFromName("Mao Stretch Dama Recta", T)).toEqual({ baseName: "Mao Stretch Dama Recta", color: null, option: null });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run lib/catalog-migration/parse.test.ts`
Expected: FAIL.

- [ ] **Step 3: Completar `parse.ts`**

- `titleCase`: separa por espacios; una palabra en minúsculas se capitaliza, salvo los conectores `de, del, la, las, los, y, e, o, con, para, en` cuando no son la primera palabra; una palabra con alguna mayúscula o dígito queda igual.
- `stripBranchPriceSuffix`: devuelve lo anterior al primer ` · `, recortado.
- `matchOption`: busca `normalizeKey(text)` primero en `optionAliases` y luego en las etiquetas de `optionValues`.
- `matchColor`: busca `normalizeKey(text)` en nombres y alias de `colors`.
- `classifySize`: aplica `stripBranchPriceSuffix`, divide por `/` y recorta cada parte. Para cada parte, en orden: opción → color → `redundant` si `normalizeKey(productName)` contiene `normalizeKey(parte)` → `unknown`.
- `extractFromName`: tokeniza el nombre y repite, mientras queden **más de 2 tokens**, este paso sobre el final: si los últimos 1–3 tokens (el tramo más largo primero) forman una opción, y aún no se extrajo ninguna, se quitan y se guardan; si no, si los últimos 1–3 tokens (el más largo primero) forman un color, y aún no se extrajo ninguno, se quitan y se guardan; si nada coincide, se detiene. `baseName = titleCase(tokens restantes)`.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run lib/catalog-migration/parse.test.ts lib/catalog-migration/taxonomy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/catalog-migration/parse.ts lib/catalog-migration/parse.test.ts
git commit -m "feat(catalogo): lectura de nombres y tallas (color, opción, sufijos de sucursal)"
```

---

### Task 5: Propuesta de clasificación

**Files:**
- Create: `lib/catalog-migration/propose.ts`, `lib/catalog-migration/test-fixtures.ts`
- Test: `lib/catalog-migration/propose.test.ts`

**Interfaces:**
- Consumes: `CatalogSnapshot` (Task 1), `Taxonomy`/`findCategory`/`categoryPath` (Task 3) y las funciones de `parse.ts` (Task 4).
- Produces:
  ```ts
  export type ProposedProduct = {
    name: string;                       // único en la propuesta
    categoryPath: string | null;
    brand: string | null;
    line: string | null;
    attributes: Record<string, string[]>;   // code → valores
    sourceProductIds: string[];
    sourceNames: string[];
    active: boolean;                    // true si alguna fuente está activa
    variantCount: number;
    totalStock: number;
    notes: string[];
  };
  export type ProposedVariant = {
    sku: string;
    currentProductName: string; currentColor: string | null; currentSize: string | null;
    stockByBranch: Record<string, number>; saleLines: number; active: boolean;
    productName: string;                // = ProposedProduct.name
    color: string | null;               // nombre canónico
    option: string | null;              // etiqueta canónica
    mergeIntoSku: string | null;
    notes: string[];
  };
  export type Proposal = {
    takenAt: string;
    branches: { id: string; name: string }[];
    products: ProposedProduct[];
    variants: ProposedVariant[];
    brands: string[];                   // canónicas + actuales que no estén en la taxonomía
    lines: { brand: string; line: string }[];
    colors: ColorDef[];                 // los de la taxonomía
    usage: { colors: Record<string, number> };   // color canónico → nº de variantes
    unresolved: { colors: string[]; sizes: string[] };
    stats: {
      productsBefore: number; productsAfter: number; mergedGroups: number;
      duplicateVariants: number; missingCategory: number; missingBrand: number;
      missingRequiredAttributes: number;
    };
  };
  export function buildProposal(snapshot: CatalogSnapshot, tax: Taxonomy): Proposal;
  ```

- [ ] **Step 1: Escribir `test-fixtures.ts`**

`MINI_SNAPSHOT: CatalogSnapshot` (`taken_at: "2026-11-11T12:00:00.000Z"`; todos los productos activos; todas las variantes activas, con precio 10 y `created_at` creciente en el orden listado, salvo lo indicado) con sucursales `b1` Maracay y `b2` San Juan de los Morros. Categorías: Uniformes, Gorros, Tensiometro, Oximetro, Rompe Ampollas, Medias Compresivas, Tijeras Trauma. Marcas: World Medics, Figs, Gorro Med, GMD, Dr John. Productos y variantes (`producto` → `sku` color/talla, ventas, stock):
- «Mao Stretch Dama Recta» (Uniformes, World Medics): `UNI-MAOSTR-0017` Amarillo/M, 2 ventas, `{b1:0}`; `UNI-MAOSTR-0018` Amarillo/M, 0, `{}`; `UXX-MAOSTRDA-0469` Vinotinto/«XS · San Juan de los Morros · $35», 1, `{b2:0}`
- «Mao Mic Dama Recta» (Uniformes, World Medics): `UNI-MAOMIC-0001` «mostaza»/S y `UNI-MAOMIC-0002` «Mostaza»/S, 0 ventas cada una; la 0001 creada antes
- «Figs Dama» (Uniformes, Figs, con foto): `UNI-FIGDAM-0044` Amatista/XS
- «Figs Dama» (sin categoría, sin marca, con foto): `UNI-FIGDAM-0075` Azul Cielo/L
- «Gorro Baby Yoda Moño» y «Gorro Baby Yoda Tiras» (Gorros, Gorro Med): `GXX-1` ∅/Moño, `GXX-2` ∅/Tiras
- «gorro anestesia azul tiras» (Gorros, Gorro Med): `GXX-3` ∅/∅
- «Gorro Cafe Elastica» (Gorros, Gorro Med): `GXX-4` ∅/Elastica
- «Tensiometro GMD Digital Con Voz» (Tensiometro, GMD): `TXX-0257` ∅/Con Voz
- «Oximetro» (Oximetro, GMD): `OXX-1` ∅/∅, 3 ventas; `OXX-2` ∅/∅, 0
- «Oximetro» (Oximetro, Dr John): `OXX-3` ∅/∅
- «Rompe Ampollas 3D Bob Sponja» (Rompe Ampollas, sin marca): `RAX-0295` ∅/Bob Sponja
- «Medias Compresivas 15-20 Mmhg S-m Batido Amarrillo» (Medias Compresivas): `MCX-0632` ∅/«S-m / Batido Amarrillo»
- «Tijeras Trauma GMD Tornasol Morada» y «… Negra» (Tijeras Trauma, sin marca): `TTX-0348` ∅/Morada, `TTX-0347` ∅/Negra

- [ ] **Step 2: Escribir los tests**

```ts
const p = buildProposal(MINI_SNAPSHOT, TAXONOMY);
const prod = (n: string) => p.products.find((x) => x.name === n)!;
const vari = (sku: string) => p.variants.find((x) => x.sku === sku)!;

it("une los «Figs Dama» aunque uno no tenga marca ni categoría", () => {
  expect(prod("Figs Dama").sourceProductIds).toHaveLength(2);
  expect(prod("Figs Dama").brand).toBe("Figs");
  expect(prod("Figs Dama").categoryPath).toBe("Uniformes › Conjuntos");
  expect(prod("Figs Dama").attributes.genero).toEqual(["Dama"]);
});
it("une gorros por diseño y pasa el amarre a la opción", () => {
  expect(prod("Gorro Baby Yoda").variantCount).toBe(2);
  expect(vari("GXX-1").option).toBe("Moño");
  expect(vari("GXX-2").option).toBe("Tiras");
});
it("saca color y opción del nombre cuando la variante no los tiene", () => {
  expect(vari("GXX-3")).toMatchObject({ productName: "Gorro Anestesia", color: "Azul", option: "Tiras" });
  expect(prod("Gorro Anestesia").attributes).toMatchObject({ tematica: ["Especialidad médica"], especialidad: ["Anestesiología"] });
});
it("no une productos de marcas distintas y les da nombres distintos", () => {
  expect(prod("Oximetro GMD")).toBeDefined();
  expect(prod("Oximetro Dr John")).toBeDefined();
  expect(p.products.filter((x) => x.name === "Oximetro")).toHaveLength(0);
});
it("marca variantes repetidas para fusionar con la que más vende", () => {
  expect(vari("UNI-MAOSTR-0018").mergeIntoSku).toBe("UNI-MAOSTR-0017");
  expect(vari("UNI-MAOSTR-0017").mergeIntoSku).toBeNull();
  expect(vari("OXX-2").mergeIntoSku).toBe("OXX-1");
  expect(vari("UNI-MAOMIC-0002").mergeIntoSku).toBe("UNI-MAOMIC-0001");  // mostaza = Mostaza
});
it("limpia la talla con sufijo de sucursal y precio", () => {
  expect(vari("UXX-MAOSTRDA-0469")).toMatchObject({ color: "Vinotinto", option: "XS" });
});
it("propone línea y atributos para uniformes World Medics", () => {
  expect(prod("Mao Stretch Dama Recta")).toMatchObject({ line: "Mao",
    attributes: { genero: ["Dama"], corte: ["Recta"], tela: ["Stretch"] } });
  expect(prod("Mao Mic Dama Recta").attributes.tela).toEqual(["Mic"]);
});
it("une tijeras por color y adivina la marca por el nombre", () => {
  expect(prod("Tijeras Trauma GMD Tornasol")).toMatchObject({ brand: "GMD", variantCount: 2 });
  expect(vari("TTX-0348").color).toBe("Morado");
});
it("medias: opción S-M y color estampado, en su categoría", () => {
  expect(vari("MCX-0632")).toMatchObject({ productName: "Medias Compresivas 15-20 Mmhg", option: "S-M", color: "Batido Amarillo" });
  expect(prod("Medias Compresivas 15-20 Mmhg").categoryPath).toBe("Uniformes › Medias de compresión");
});
it("descarta lo redundante sin dejar notas de revisión", () => {
  expect(vari("RAX-0295")).toMatchObject({ option: null, notes: [] });
  expect(vari("TXX-0257").option).toBeNull();
  expect(prod("Tensiometro GMD Digital Con Voz").attributes).toMatchObject({ voz: ["Con voz"], tipo_tensiometro: ["Digital de brazo"] });
});
it("estadísticas", () => {
  expect(p.stats.productsBefore).toBe(15);
  expect(p.stats.productsAfter).toBe(12);
  expect(p.stats.mergedGroups).toBe(3);   // Figs Dama, Gorro Baby Yoda, Tijeras
  expect(p.stats.duplicateVariants).toBe(3);
  expect(p.unresolved.colors).toEqual([]);
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run lib/catalog-migration/propose.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar `buildProposal`**

Reglas, en este orden:
1. **Por producto actual:** `parts = extractFromName(name)`.
   - **Marca:** el nombre de la marca actual. Si no tiene, la primera `BrandDef` cuyo alias coincida con `normalizeKey(name)`. Si el nombre empieza por una línea de World Medics y la marca sigue vacía, World Medics.
   - **Categoría:** si la actual es «Uniformes» o no hay, se prueban primero `uniformOverrides` y después `nameCategoryRules`; si nada coincide, `legacyCategoryMap[actual]` (o `null` si no hay categoría actual). En cualquier otro caso, `legacyCategoryMap[actual]`.
2. **Agrupar** por `normalizeKey(parts.baseName) + "|" + normalizeKey(marca ?? "")`.
3. **Nombre del grupo** = `parts.baseName` de la fuente con más variantes. Si dos grupos comparten `normalizeKey(baseName)`, a cada grupo con marca se le agrega ` <Marca>` al nombre. Si aún choca, se agrega ` (2)`, ` (3)`…
4. **Del grupo:**
   - Categoría = la más frecuente entre las fuentes (no nula).
   - `active` = alguna fuente activa.
   - Línea = la línea más larga de la marca que sea prefijo (por palabras) de `normalizeKey(nombre)`.
   - Atributos: solo los que declara la categoría, probando `attributeKeywords` sobre la unión de `normalizeKey` de los nombres fuente. En un atributo simple, si aparecen dos valores distintos queda vacío, con la nota «Revisar <Atributo>: <v1>/<v2>». En uno múltiple, se juntan todos los valores.
   - Notas: «Falta categoría», «Falta marca», «Falta <Atributo> (obligatorio)».
5. **Por variante:**
   - `color` = `matchColor(v.color)`. Si no hay, el color de `classifySize`. Si no, `parts.color` del producto. Si `v.color` existe y no tiene equivalencia: `color = null`, nota «Color «X» sin equivalencia» y el texto va a `unresolved.colors`.
   - `option` = la opción de `classifySize`; si no hay, `parts.option`.
   - Cada parte `unknown` → nota «Revisar: «X» estaba en talla» y el texto va a `unresolved.sizes`.
   - Precio 0 → nota «Precio 0».
6. **Duplicadas:** dentro de cada producto destino, se agrupa por `(normalizeKey(color ?? ""), normalizeKey(option ?? ""))`. La sobreviviente es la de más `saleLines`, luego más stock total, luego `created_at` más antiguo, luego `sku` ascendente. Las demás llevan `mergeIntoSku`.
7. `brands`, `lines`, `usage` y `stats` se calculan del resultado. `missingRequiredAttributes` cuenta los productos activos con al menos un obligatorio vacío.

- [ ] **Step 5: Correr y ver que pasa**

Run: `npx vitest run lib/catalog-migration`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add lib/catalog-migration/propose.ts lib/catalog-migration/propose.test.ts lib/catalog-migration/test-fixtures.ts
git commit -m "feat(catalogo): propuesta de clasificación (fusiones, opciones, atributos, duplicadas)"
```

---

### Task 6: Excel de revisión

**Files:**
- Create: `lib/catalog-migration/workbook-schema.ts`, `lib/catalog-migration/workbook.ts`
- Test: `lib/catalog-migration/workbook.test.ts`

**Interfaces:**
- Consumes: `Proposal` (Task 5), `Taxonomy` (Task 3).
- Produces (contrato que lee el plan 2):
  ```ts
  // workbook-schema.ts
  export const SHEETS = {
    instructions: "Instrucciones", products: "Productos", variants: "Variantes",
    brands: "Marcas", lines: "Líneas", colors: "Colores", values: "Valores",
    categories: "Categorías", lists: "_listas", info: "_info",
  } as const;
  export const STATUS = { active: "Activo", inactive: "Desactivar" } as const;
  export const PRODUCT_COLUMNS: { key: string; header: string; editable: boolean }[] = [
    { key: "name", header: "Producto (nombre nuevo)", editable: true },
    { key: "category", header: "Departamento › Categoría", editable: true },
    { key: "brand", header: "Marca", editable: true },
    { key: "line", header: "Línea / modelo", editable: true },
    /* luego una columna por atributo, en el orden de TAXONOMY.attributes:
       key `attr:<code>`, header = AttributeDef.name, editable.
       Los atributos multi llevan además `attr:<code>#2`, header `<name> 2` */
    { key: "status", header: "Estado", editable: true },
    { key: "sources", header: "Productos actuales que se unen", editable: false },
    { key: "variantCount", header: "Nº variantes", editable: false },
    { key: "stock", header: "Stock total", editable: false },
    { key: "notes", header: "Notas del sistema", editable: false },
    { key: "obs", header: "Observaciones de la tienda", editable: true },
  ];
  export function productColumns(tax: Taxonomy): typeof PRODUCT_COLUMNS;  // con atributos expandidos
  export function variantColumns(branches: { id: string; name: string }[]): { key: string; header: string; editable: boolean }[];
  // Variantes: sku "SKU" · currentProduct "Producto actual" · currentColor "Color actual" ·
  // currentSize "Talla actual" · stock:<branchId> "Stock <sucursal>" (una por sucursal) ·
  // saleLines "Ventas" · (todas no editables) · product "Producto (nombre nuevo)" ·
  // color "Color" · option "Talla / opción" · mergeInto "Fusionar con SKU" · status "Estado" ·
  // (editables) · notes "Notas del sistema" (no) · obs "Observaciones de la tienda" (sí)
  export const LIST_RANGES = {
    products: "Productos!$A$2:$A$1500", brands: "Marcas!$A$2:$A$300",
    lines: "Líneas!$B$2:$B$500", colors: "Colores!$A$2:$A$500",
  } as const;
  export const PRODUCT_ROWS_WITH_VALIDATION = 1500;
  // workbook.ts
  export function buildReviewWorkbook(p: Proposal, tax: Taxonomy, meta: { generatedAt: string }): ExcelJS.Workbook;
  ```

Detalles por hoja:
- **Instrucciones:** columna A, una línea por fila, ancho 120, con ajuste de texto. Texto exacto (sustituir `<fecha>` por `p.takenAt` en formato `dd/MM/yyyy HH:mm`):
  1. Revisión del catálogo — World Medics
  2. Este archivo propone cómo quedará organizado el catálogo. El sistema ya llenó casi todo a partir de los nombres actuales: tu trabajo es revisar y corregir.
  3. Las columnas con encabezado AZUL se pueden editar. Las de encabezado GRIS son informativas: no las cambies.
  4. Hoja Productos: cada fila es un producto tal como se verá en la tienda. El nombre no lleva color ni talla, y no puede repetirse. Revisa categoría, marca, línea y características (género, corte, tela…).
  5. Para UNIR productos: en la hoja Variantes, pon en «Producto (nombre nuevo)» el mismo producto.
  6. Para SEPARAR un producto: agrega una fila nueva en Productos con el nombre nuevo y, en Variantes, asígnale las variantes que le corresponden.
  7. Hoja Variantes: cada fila es una unidad que se cuenta en inventario (por ejemplo Blanco / XS). Revisa el color y la talla u opción.
  8. Si dos filas de Variantes son la misma cosa repetida, escribe en «Fusionar con SKU» el SKU de la que se queda. El stock se suma.
  9. Si un producto o variante ya no se vende, pon Estado = Desactivar. No se borra: deja de mostrarse.
  10. ¿Falta una marca, línea, color o valor? Agrégalo al final de su hoja (Marcas, Líneas, Colores o Valores) y aparecerá en las listas.
  11. ¿Falta una categoría o algo no encaja? Escríbelo en «Observaciones de la tienda».
  12. Todo producto activo debe quedar con categoría, marca y las características obligatorias de su categoría (ver hoja Categorías). Si falta algo, el sistema no aplicará los cambios y devolverá la lista de lo que falta.
  13. Datos tomados el: <fecha>. Lo que se cree o cambie en el sistema después de esa fecha se revisará aparte.
- **Productos / Variantes:** encabezados editables con relleno `FF0EA5E9` y letra blanca en negrita; no editables con relleno `FFE5E7EB` y letra `FF374151`. Celdas no editables con relleno `FFF3F4F6`. Fila 1 y columna A inmovilizadas; `autoFilter` en la fila 1. Productos ordenados por `categoryPath` y nombre; variantes por `productName`, color y opción.
- **Validaciones** (tipo lista, `errorStyle: "stop"`, error «Elige un valor de la lista.»):
  - Productos: `category` → `_listas` (paths); `brand` → `LIST_RANGES.brands`; `line` → `LIST_RANGES.lines`; cada `attr:<code>` → su columna en Valores (`Valores!$X$2:$X$200`); `status` → `_listas` (Activo/Desactivar). Todo hasta la fila `PRODUCT_ROWS_WITH_VALIDATION`.
  - Variantes: `product` → `LIST_RANGES.products`; `color` → `LIST_RANGES.colors`; `option` → `_listas` (todas las etiquetas de opción); `status` → `_listas`. Hasta la última fila de datos.
- **Marcas:** A «Marca» (editable) · B «Productos actuales» (informativa).
- **Líneas:** A «Marca» (lista → `LIST_RANGES.brands`) · B «Línea / modelo».
- **Colores:** A «Color» · B «Hex» · C «Familia» (lista → `_listas`, familias) · D «Variantes que lo usan» (informativa, de `usage.colors`).
- **Valores:** una columna por atributo (encabezado = nombre del atributo) con sus valores debajo.
- **Categorías** (solo referencia, todo gris): «Departamento › Categoría», «Opción de variante» (Talla / Amarre / —), «Exige color» (Sí/No), «Atributos obligatorios», «Atributos opcionales».
- **`_listas`** y **`_info`** con `state = "veryHidden"`. `_info`: filas `snapshot_taken_at | <takenAt>`, `generated_at | <generatedAt>`, `format_version | 1`.

- [ ] **Step 1: Escribir los tests**

```ts
async function roundTrip() {
  const wb = buildReviewWorkbook(buildProposal(MINI_SNAPSHOT, TAXONOMY), TAXONOMY, { generatedAt: "2026-11-11T00:00:00Z" });
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(await wb.xlsx.writeBuffer());
  return out;
}
const headerRow = (ws: ExcelJS.Worksheet) => (ws.getRow(1).values as unknown[]).slice(1);
const rowWhere = (ws: ExcelJS.Worksheet, col: number, value: string) => {
  for (let r = 2; r <= ws.rowCount; r++) if (ws.getCell(r, col).value === value) return ws.getRow(r);
  throw new Error(`sin fila ${value}`);
};
it("tiene las hojas en orden y las ocultas como veryHidden", async () => {
  const wb = await roundTrip();
  expect(wb.worksheets.map((w) => w.name)).toEqual(Object.values(SHEETS));
  expect(wb.getWorksheet("_listas")!.state).toBe("veryHidden");
  expect(wb.getWorksheet("_info")!.state).toBe("veryHidden");
});
it("encabezados de Productos = productColumns(TAXONOMY), con Especialidad 2", async () => {
  const headers = headerRow((await roundTrip()).getWorksheet("Productos")!);
  expect(headers).toEqual(productColumns(TAXONOMY).map((c) => c.header));
  expect(headers).toContain("Especialidad 2");
});
it("la fila de «Figs Dama» trae marca, categoría y género", async () => {
  const ws = (await roundTrip()).getWorksheet("Productos")!;
  const cols = productColumns(TAXONOMY);
  const at = (key: string) => cols.findIndex((c) => c.key === key) + 1;
  const row = rowWhere(ws, 1, "Figs Dama");
  expect(row.getCell(at("brand")).value).toBe("Figs");
  expect(row.getCell(at("category")).value).toBe("Uniformes › Conjuntos");
  expect(row.getCell(at("attr:genero")).value).toBe("Dama");
  expect(row.getCell(at("status")).value).toBe("Activo");
});
it("encabezado editable azul y no editable gris", async () => {
  const ws = (await roundTrip()).getWorksheet("Productos")!;
  const cols = productColumns(TAXONOMY);
  const fill = (key: string) => (ws.getCell(1, cols.findIndex((c) => c.key === key) + 1).fill as ExcelJS.FillPattern).fgColor?.argb;
  expect(fill("name")).toBe("FF0EA5E9");
  expect(fill("sources")).toBe("FFE5E7EB");
});
it("Variantes valida «Producto» contra Productos!$A$2:$A$1500 y cubre todas las filas", async () => {
  const ws = (await roundTrip()).getWorksheet("Variantes")!;
  const col = variantColumns(MINI_SNAPSHOT.branches).findIndex((c) => c.key === "product") + 1;
  expect(ws.getCell(2, col).dataValidation.formulae).toEqual([LIST_RANGES.products]);
  expect(ws.getCell(ws.rowCount, col).dataValidation.type).toBe("list");
});
it("Productos deja listas en filas vacías para productos nuevos (fila 1500)", async () => {
  const ws = (await roundTrip()).getWorksheet("Productos")!;
  const brandCol = productColumns(TAXONOMY).findIndex((c) => c.key === "brand") + 1;
  expect(ws.getCell(PRODUCT_ROWS_WITH_VALIDATION, brandCol).dataValidation.formulae).toEqual([LIST_RANGES.brands]);
});
it("_info guarda la fecha de la foto", async () => {
  expect((await roundTrip()).getWorksheet("_info")!.getCell("B1").value).toBe(MINI_SNAPSHOT.taken_at);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run lib/catalog-migration/workbook.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `workbook-schema.ts` y `workbook.ts`**

Mismo método que `lib/excel.ts` (lista en hoja oculta referenciada por rango absoluto, validación celda por celda). Pero escrito aparte, porque `lib/excel.ts` devuelve un `Blob` de navegador y no maneja estilos por columna.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run lib/catalog-migration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/catalog-migration/workbook-schema.ts lib/catalog-migration/workbook.ts lib/catalog-migration/workbook.test.ts
git commit -m "feat(catalogo): Excel de revisión para la tienda (listas, instrucciones, info de la foto)"
```

---

### Task 7: CLI, corrida real y runbook

**Files:**
- Create: `scripts/catalogo/generar-excel.ts`, `docs/CATALOGO-LIMPIEZA.md`
- Modify (si hace falta): `lib/catalog-migration/taxonomy.ts`

**Interfaces:**
- Consumes: `loadSnapshot` (Task 1), `buildProposal` (Task 5), `buildReviewWorkbook` (Task 6).
- Produces: `npm run catalogo:excel -- --snapshot <json> [--out <xlsx>]`. La salida por defecto es `backups/catalogo/revision-catalogo-<YYYY-MM-DD>.xlsx`. Imprime el resumen y termina con código 0.

- [ ] **Step 1: Implementar el CLI**

Lee los argumentos con `node:util` `parseArgs`. Corre `loadSnapshot` → `buildProposal(snapshot, TAXONOMY)` → `buildReviewWorkbook` → `wb.xlsx.writeFile(out)`. Imprime:
- `stats`, una línea por campo;
- los textos de `unresolved.colors` y `unresolved.sizes` con su número de variantes;
- los 10 grupos con más fuentes (`nombre ← n productos`);
- la ruta del archivo.

- [ ] **Step 2: Correr con la foto real**

Run: `npm run catalogo:excel -- --snapshot "$(ls -t backups/catalogo/snapshot-*.json | head -1)"`
Expected: genera el `.xlsx` e imprime el resumen.

- [ ] **Step 3: Dejar en cero los colores sin resolver**

Por cada texto de `unresolved.colors`, agregarlo como color canónico o como alias en `taxonomy.ts` (con hex real y familia). Volver a correr los tests de la Task 3 y el Step 2 hasta que `unresolved.colors` esté vacío. Los `unresolved.sizes` **no** se corrigen en código: quedan como notas para la tienda. Revisar en el resumen que no aparezcan uniones absurdas (por ejemplo, un grupo «Gorro» con decenas de fuentes). Si aparecen, corregir la regla en `parse.ts`, con su test.

- [ ] **Step 4: Abrir el Excel y revisarlo a mano**

Abrir el archivo en Excel o LibreOffice y comprobar:
- que las listas despliegan;
- que al agregar una fila en Marcas, la marca nueva aparece en la lista de Productos;
- que las hojas `_listas` e `_info` no se ven;
- que las Instrucciones se leen completas.

- [ ] **Step 5: Escribir `docs/CATALOGO-LIMPIEZA.md`**

Runbook corto para el desarrollador:
1. Tomar la foto: `scripts/catalogo/snapshot.sh`.
2. Generar el Excel: `npm run catalogo:excel -- --snapshot …`.
3. Qué revisar del resumen antes de enviarlo.
4. Qué decirle a la tienda: que lea la hoja Instrucciones, que evite crear productos durante la revisión y que devuelva el mismo archivo.
5. Dónde guardar el archivo devuelto: `backups/catalogo/revision-devuelta-<fecha>.xlsx`.
6. Lo que sigue (plan 2).

Enlazarlo desde `CLAUDE.md` en una línea, bajo «Convenciones».

- [ ] **Step 6: Verificación final**

Run: `npx tsc --noEmit && npm test && npm run lint && npm run build`
Expected: todo en verde.

- [ ] **Step 7: Commit**

```bash
git add scripts/catalogo/generar-excel.ts docs/CATALOGO-LIMPIEZA.md CLAUDE.md lib/catalog-migration package.json
git commit -m "feat(catalogo): CLI del Excel de revisión y runbook de limpieza"
```

- [ ] **Step 8: Entregar al usuario**

Decirle al usuario la ruta del `.xlsx` y el resumen (productos antes y después, fusiones, duplicadas y pendientes). Recordarle que se envía a la tienda y que el plan 2 arranca cuando vuelva el archivo.
