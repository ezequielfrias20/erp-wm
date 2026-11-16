# Catálogo — Plan 2: simulación y aplicación de la limpieza — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar en producción, en una sola transacción y sin perder historial, la clasificación aprobada por la tienda (propuesta automática + Excel de pendientes resuelto), dejando cumplido el «Criterio de éxito».

**Architecture:** Todo lo que decide es TypeScript puro y probado en `lib/catalog-migration/`: leer los Excel devueltos, aplicar sus ediciones sobre la propuesta, detectar cambios posteriores a la foto, validar el criterio y construir un **plan de limpieza** en JSON con ids reales. Un SQL **estático** (`scripts/catalogo/aplicar.sql`) lee ese JSON y hace la limpieza por conjuntos dentro de una transacción que se verifica a sí misma (stock, ventas, criterio) y termina en `ROLLBACK` (simulación) o `COMMIT` (aplicación). Los datos nunca se interpolan como texto SQL.

**Tech Stack:** Postgres 17 (Supabase, esquema `wm`), `psql` 16, TypeScript, Vitest 4, ExcelJS 4, `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-11-catalogo-listo-ecommerce-design.md` · **Hoja de ruta:** `docs/superpowers/plans/2026-11-11-catalogo-00-hoja-de-ruta.md` · **Plan 1:** `docs/superpowers/plans/2026-11-11-catalogo-01-esquema-y-excel-revision.md`

## Entradas (ya disponibles)

- Propuesta automática aprobada sin cambios por la tienda (Excel completo del 13/11; la propuesta de la foto del 14/11 es idéntica).
- `backups/catalogo/snapshot-20261114T161950Z.json` — foto de la revisión (base para detectar cambios posteriores).
- `backups/catalogo/pendientes-final-2026-11-15.xlsx` — pendientes resueltos por la tienda + resoluciones confirmadas por el usuario el 2026-11-15. Ojo: openpyxl le quitó las listas desplegables al guardarlo; sólo se usa como datos.
- Se aplica sobre una **foto nueva** tomada justo antes, en horario sin ventas.

## Global Constraints

- Producción `cfggippjujceebovvhsa`, esquema `wm`. Conexión sólo con `scripts/catalogo/psql.sh` (verify-full con el certificado si existe). No usar `pg_dump` (cliente 16, servidor 17).
- **Ninguna escritura en producción sin confirmación explícita del usuario.** La simulación (`ROLLBACK`) sí se puede correr. La aplicación real va en horario sin ventas que el usuario acuerda con la tienda.
- Fusionar = **re-apuntar referencias y sumar stock primero, borrar después**. `inventory.variant_id` es `ON DELETE CASCADE`; `sale_items.variant_id` y `purchase_order_items.variant_id` son `ON DELETE SET NULL`. Nunca borrar una variante o un producto con referencias sin re-apuntarlas.
- Los SKU se conservan. Un SKU que desaparece por fusión queda en `wm.variant_sku_aliases` → variante sobreviviente.
- Producto sobreviviente de un grupo = el de más líneas de venta (suma de sus variantes), luego más stock, luego `created_at` más antiguo, luego `id`. Conserva su `id`: su foto `product-images/<id>.png` sigue funcionando en el ERP actual.
- Texto legado sincronizado: `product_variants.color` = nombre canónico, `color_hex` = hex canónico, `size` = etiqueta de la opción (o `null`). El ERP actual sigue funcionando hasta el plan 3.
- `wm.sizes`, las columnas de texto y las guardas (unicidad, `NOT NULL`) **no** se tocan: son del plan 4.
- **No** se crean productos nuevos ni se dividen productos: la tienda no lo pidió. Si un Excel trae un producto sin fuente, es error bloqueante («no soportado en esta ronda»).
- Nada de la taxonomía de World Medics entra en `supabase/bootstrap/`.
- Transacción con `set local lock_timeout = '5s'` y `statement_timeout = '120s'`.
- Datos generados (fotos, plan JSON, reportes, Excel) en `backups/catalogo/` (ignorado por git).
- Commits `feat(catalogo): …` / `fix(catalogo): …` terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Varias variantes sobrantes que se fusionan en la misma sobreviviente y la misma sucursal** («Amarillo M ×4»): un `insert … on conflict do update` sin agregar antes falla con «cannot affect row a second time». Se espera que el stock se sume completo. → Task 6 agrega por `(sobreviviente, sucursal)` antes del upsert; lo prueba la simulación real (Task 7), cuya verificación compara el stock por sucursal.
2. **Valores escritos a mano en el Excel** con espacios, mayúsculas distintas o abreviados (`"Fionx "`, `"FR"`, `"dama"`): se espera que se recorten y se comparen sin mayúsculas ni acentos, y que lo que no exista sea error con fila y columna, nunca un valor nuevo silencioso. → tests en Task 3.
3. **El catálogo cambia entre la foto y la aplicación** (la tienda vende, crea o edita): se espera que la aplicación aborte sin tocar nada y pida otra foto. → guarda en Task 6; reporte de cambios en Task 4.
4. **Producto renombrado en el Excel** cuyas variantes lo nombran por el nombre viejo o el nuevo: se espera que ambas formas lleguen al mismo producto. → test en Task 3.
5. **Nombre de categoría nuevo igual a uno viejo** (`Gorros`, `Uniformes` con `categories_name_key` único): se espera reutilizar la fila existente, no chocar con la restricción ni duplicar. → test en Task 5 y simulación real.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `lib/catalog-migration/completeness.ts` | + `variantMissing` (color/opción que exige la categoría) |
| `lib/catalog-migration/workbook.ts` | el Excel de pendientes incluye también variantes con huecos |
| `lib/catalog-migration/read-review.ts` | lee un Excel devuelto → `ReviewEdits` |
| `lib/catalog-migration/apply-edits.ts` | `ReviewEdits[]` + propuesta + taxonomía → propuesta final + taxonomía extendida |
| `lib/catalog-migration/validate.ts` | `detectDrift` y `validateForApply` (criterio de éxito, fusiones, repetidas) |
| `lib/catalog-migration/cleanup-plan.ts` | `buildCleanupPlan` → JSON con ids para el SQL; `slugify` |
| `lib/catalog-migration/report.ts` | reporte Markdown de la simulación |
| `scripts/catalogo/limpieza.ts` | CLI: foto + Excel(s) → `plan-<UTC>.json` + `reporte-<UTC>.md`; sale ≠ 0 si hay bloqueantes |
| `scripts/catalogo/aplicar.sql` | limpieza estática por conjuntos + respaldo + verificación; `ROLLBACK` o `COMMIT` |
| `scripts/catalogo/aplicar.sh` | corre `aplicar.sql` (simular por defecto; `--aplicar` pide confirmación escrita) |
| `package.json` | script `catalogo:limpieza` |
| `docs/CATALOGO-LIMPIEZA.md`, `docs/PROGRESS.md`, `CLAUDE.md`, hoja de ruta | runbook, avance, convenciones |

---

### Task 1: Variantes con huecos en la completitud y en el Excel de pendientes

El Excel de pendientes del 14/11 no traía las variantes activas sin color o sin opción cuando su categoría los exige (hay 14). Se corrige para que la validación (Task 4) y una eventual segunda ronda las vean.

**Files:**
- Modify: `lib/catalog-migration/completeness.ts`, `lib/catalog-migration/workbook.ts`
- Test: `lib/catalog-migration/completeness.test.ts`, `lib/catalog-migration/workbook.test.ts`

**Interfaces:**
- Produces: `variantMissing(v: ProposedVariant, product: ProposedProduct | undefined, tax: Taxonomy): ("color" | "option")[]` — vacío si la variante o su producto están inactivos, si el producto no tiene categoría válida, o si la variante se fusiona (`mergeIntoSku`).

- [ ] **Step 1: Tests que fallan.** En `completeness.test.ts`: con la propuesta de `MINI_SNAPSHOT`, una variante de «Mao Stretch Dama Recta» con `color: null` → `["color"]`; con `option: null` → `["option"]`; la misma con `active: false` → `[]`; con `mergeIntoSku` → `[]`; una variante de «Tijeras Trauma GMD Tornasol» (categoría sin color ni opción) sin color → `[]`. En `workbook.test.ts` (bloque de pendientes): una variante activa con `color: null` en un conjunto aparece en Variantes y su celda «Color» va en `FFFDE68A`.
- [ ] **Step 2:** `npx vitest run lib/catalog-migration` → FAIL (`variantMissing` no existe).
- [ ] **Step 3:** Implementar `variantMissing` con `findCategory`, `requiresColor` y `optionType`. En `buildReviewWorkbook` con `scope: "incomplete"`, el filtro de variantes pasa a `v.active && (v.notes.length > 0 || variantMissing(v, productOf(v), tax).length > 0)`, y se pintan en amarillo las celdas `color`/`option` faltantes.
- [ ] **Step 4:** `npx vitest run lib/catalog-migration` → PASS.
- [ ] **Step 5:** Commit `feat(catalogo): variantes sin color u opción en completitud y Excel de pendientes`.

---

### Task 2: Lector del Excel devuelto

**Files:**
- Create: `lib/catalog-migration/read-review.ts`, `lib/catalog-migration/read-review.test.ts`

**Interfaces:**
- Consumes: `SHEETS`, `STATUS`, `ORIGINAL_HEADER`, `productColumns`, `variantColumns` (`workbook-schema.ts`).
- Produces:
```ts
export type ProductEdit = {
  row: number;
  proposedName: string;            // columna gris «Nombre propuesto»; clave de cruce
  name: string; category: string; brand: string; line: string;
  attributes: Record<string, string[]>; // code → valores no vacíos (incluye «#2»)
  active: boolean;                 // Estado === STATUS.active
};
export type VariantEdit = {
  row: number; sku: string; product: string; color: string; option: string;
  mergeInto: string; active: boolean;
};
export type ReviewEdits = {
  file: string; scope: "all" | "incomplete"; snapshotTakenAt: string; taxonomyHash: string;
  products: ProductEdit[]; variants: VariantEdit[];
  brands: { name: string; original: string | null }[];  // original null = marca nueva
  lines: { brand: string; line: string }[];
  colors: { name: string; hex: string; family: string; original: string | null }[];
  values: Record<string, string[]>;                     // código de atributo → valores de la hoja Valores
};
export async function readReviewWorkbook(path: string): Promise<ReviewEdits>;
export function readReviewBuffer(buf: ArrayBuffer, file: string): Promise<ReviewEdits>;
```

- [ ] **Step 1: Tests que fallan** (con un Excel armado por `buildReviewWorkbook` sobre `MINI_SNAPSHOT`, editado con ExcelJS y releído con `readReviewBuffer`):
  - `"lee productos por encabezado, no por posición"`: en el Excel de pendientes (con «Falta completar») y en el completo, `products.find(p => p.proposedName === "Figs Dama")` trae `category`, `brand`, `attributes.genero`, `active: true`.
  - `"recorta espacios y ignora celdas vacías"`: celda Tela = `"Fionx "` → `attributes.tela` = `["Fionx"]`; atributo vacío → no aparece la clave.
  - `"Especialidad 2 se junta con Especialidad"`: `attributes.especialidad` = `["Anestesiología", "Enfermería"]`.
  - `"marca nueva = fila sin Original"`: fila agregada `"FR Medic Group"` → `{ name: "FR Medic Group", original: null }`.
  - `"lee _info"`: `scope === "incomplete"`, `snapshotTakenAt === MINI_SNAPSHOT.taken_at`, `taxonomyHash` de 64 hex.
  - `"encabezado desconocido o faltante es error"`: borrar la columna «Marca» → rechaza con mensaje que nombra hoja y encabezado.
- [ ] **Step 2:** `npx vitest run lib/catalog-migration/read-review.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. Valor de celda con `cell.text.trim()` (cubre texto enriquecido y números). Encabezados de Valores = `tax.attributes[i].name` en orden; se mapean a `code` por nombre. Hojas Líneas/Colores: filas con nombre vacío se ignoran.
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5:** Commit `feat(catalogo): lector del Excel de revisión devuelto`.

---

### Task 3: Aplicar las ediciones sobre la propuesta

**Files:**
- Create: `lib/catalog-migration/apply-edits.ts`, `lib/catalog-migration/apply-edits.test.ts`

**Interfaces:**
- Consumes: `ReviewEdits` (Task 2); `Proposal` (`propose.ts`); `Taxonomy`, `normalizeKey`.
- Produces:
```ts
export type EditIssue = { file: string; sheet: string; row: number; column: string; message: string };
export function applyEdits(
  proposal: Proposal, tax: Taxonomy, edits: ReviewEdits[],
): { proposal: Proposal; tax: Taxonomy; issues: EditIssue[] };
```
  Los archivos se aplican en orden (el último gana). La taxonomía devuelta incluye marcas, líneas, colores y valores agregados en los Excel. La propuesta devuelta tiene nombres, categorías, marcas, líneas, atributos, estado, color, opción, producto destino y fusión ya editados.

- [ ] **Step 1: Tests que fallan:**
  - `"producto editado por nombre propuesto"`: edición de «Figs Dama» con corte Recta y tela Stretch → el producto final los trae y ya no tiene notas «Falta …».
  - `"comparación sin mayúsculas, acentos ni espacios"`: marca `"world medics "` → `"World Medics"`; atributo `"algodon"` → `"Algodón"`.
  - `"valor que no existe es issue con fila y columna"`: marca `"FR"` sin fila en Marcas → `issues[0]` = `{ sheet: "Productos", column: "Marca", message: /«FR»/ }`, y el producto queda con la marca anterior.
  - `"marca y valor nuevos se agregan a la taxonomía"`: Marcas con `{ name: "FR Medic Group", original: null }` y Valores Tela con `"FIONx"` → `tax.brands` y los valores de `tela` los incluyen; un producto que los usa no da issue.
  - `"renombre: las variantes llegan por nombre viejo o nuevo"`: producto «Figs Dama» renombrado a «Figs Dama Clásico»; una edición de variante con `product: "Figs Dama"` y otra con `"Figs Dama Clásico"` → ambas con `productName === "Figs Dama Clásico"`.
  - `"producto sin fuente es issue no soportado"`: fila de Productos con `proposedName` vacío → issue `/no soportado/`.
  - `"proposedName que ya no existe es issue"` (cambio posterior a la foto).
  - `"el último archivo gana"`: dos `ReviewEdits` con categorías distintas para el mismo producto → la del segundo.
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3:** Implementar. Índices por `normalizeKey` para marcas, colores (incluye `aliases`), valores de atributo por código, opciones por tipo (`optionAliases`). Una edición de categoría que no está en `tax.categories` es issue. Las notas de cada producto se recalculan con `missingLabels` (`completeness.ts`); las de variantes conservan sólo las de precio.
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5:** Commit `feat(catalogo): aplicar ediciones de los Excel devueltos sobre la propuesta`.

---

### Task 4: Cambios posteriores a la foto y validación del criterio

**Files:**
- Create: `lib/catalog-migration/validate.ts`, `lib/catalog-migration/validate.test.ts`

**Interfaces:**
- Consumes: `CatalogSnapshot`, `Proposal`, `Taxonomy`, `missingLabels`, `variantMissing`.
- Produces:
```ts
export type Drift = {
  newProducts: { id: string; name: string }[];
  changedProducts: { id: string; name: string }[];
  removedProducts: { id: string; name: string }[];
  newVariants: { id: string; sku: string }[];
  changedVariants: { id: string; sku: string }[];
  removedVariants: { id: string; sku: string }[];
};
export function detectDrift(review: CatalogSnapshot, current: CatalogSnapshot): Drift;

export type Blocker = { kind: "product" | "variant" | "merge" | "duplicate" | "edit"; ref: string; message: string };
export function validateForApply(p: Proposal, tax: Taxonomy, issues: EditIssue[]): Blocker[];
```

- [ ] **Step 1: Tests que fallan:**
  - `detectDrift`: misma foto → todo vacío; producto con `updated_at` > `review.taken_at` → `changedProducts`; variante nueva → `newVariants`. Cambios sólo de `stock`/`sale_lines` **no** cuentan como cambio.
  - `"producto activo incompleto bloquea"`: «Rompe Ampollas 3D Bob Sponja» sin marca → blocker `product` con `/Marca/`.
  - `"producto inactivo incompleto no bloquea"`.
  - `"variante activa sin color en Conjuntos bloquea"` → blocker `variant` con el SKU.
  - `"opción de otro tipo bloquea"`: gorro con opción `"M"` (talla) → blocker `/Amarre/`.
  - `"repetidas sin fusionar bloquean"`: dos variantes no fusionadas del mismo producto con el mismo color y la misma opción → blocker `duplicate` con ambos SKU.
  - `"fusión inválida bloquea"`: `mergeIntoSku` hacia un SKU inexistente, hacia una variante que también se fusiona (cadena), o hacia una variante de **otro producto final** o de **otro color/opción** → blocker `merge`.
  - `"issues de edición bloquean"`: cada `EditIssue` → blocker `edit`.
  - `"propuesta del fixture con todo completo no bloquea"`.
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3:** Implementar. La unicidad se evalúa sobre **todas** las variantes que quedan (activas e inactivas), por `(producto final, color, opción)` con `null` como valor, igual que la restricción del plan 4.
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5:** Commit `feat(catalogo): validación del criterio de éxito y cambios posteriores a la foto`.

---

### Task 5: Plan de limpieza con ids

**Files:**
- Create: `lib/catalog-migration/cleanup-plan.ts`, `lib/catalog-migration/cleanup-plan.test.ts`
- (La foto ya trae lo necesario: ids y nombres de categorías, marcas y colores; `updated_at` de productos y variantes para la guarda.)

**Interfaces:**
- Consumes: `CatalogSnapshot`, `Proposal` y `Taxonomy` finales (Task 3), sin blockers (Task 4).
- Produces:
```ts
export function slugify(text: string): string; // "Mao Stretch Dama Recta" → "mao-stretch-dama-recta"; "Moño" → "mono"
export type CleanupPlan = {
  runId: string;                                   // uuid
  snapshotTakenAt: string;
  guard: { products: number; variants: number; maxUpdatedAt: string };
  departments: { name: string; slug: string; sortOrder: number; reuseId: string | null }[];
  categories: {
    name: string; slug: string; department: string; sortOrder: number; reuseId: string | null;
    optionType: "talla" | "amarre" | null; requiresColor: boolean;
    attributes: { code: string; required: boolean; sortOrder: number }[];
  }[];
  legacyCategoryIds: string[];                     // se borran al final si nadie las usa
  attributes: { code: string; name: string; isMulti: boolean; sortOrder: number;
                values: { name: string; slug: string; sortOrder: number }[] }[];
  optionValues: { type: "talla" | "amarre"; label: string; slug: string; sortOrder: number }[];
  brands: { name: string; slug: string; reuseId: string | null }[];
  lines: { brand: string; name: string; slug: string; sortOrder: number }[];
  colors: { name: string; slug: string; hex: string; family: string; sortOrder: number; reuseId: string | null }[];
  legacyColorIds: string[];                        // filas de wm.colors que no son canónicas
  products: {
    id: string;                                    // sobreviviente
    mergeIds: string[];                            // productos que se vacían en él y se borran
    name: string; slug: string; category: string;  // nombre de la categoría de 2.º nivel
    brand: string | null; line: string | null; isActive: boolean;
    attributes: { code: string; value: string }[];
  }[];
  variants: {
    id: string; productId: string; color: string | null;
    option: { type: "talla" | "amarre"; label: string } | null;
    isActive: boolean; mergeIntoId: string | null; sku: string;
  }[];
  media: { productId: string; color: string | null; path: string; sortOrder: number }[];
};
export function buildCleanupPlan(s: CatalogSnapshot, p: Proposal, tax: Taxonomy, runId: string): CleanupPlan;
```

- [ ] **Step 1: Tests que fallan:**
  - `slugify`: acentos, `ñ`, espacios dobles, `/` y `*` → guiones; nunca vacío.
  - `"sobreviviente = más ventas, luego más stock, luego más antiguo"`: en un grupo de «Figs Dama» del fixture, el `id` del producto con más `sale_lines`.
  - `"todas las variantes de los productos fusionados apuntan al sobreviviente"`.
  - `"slugs únicos"`: dos productos con el mismo nombre en marcas distintas → `"oximetro-gmd"`, `"oximetro-dr-john"`; choque restante → sufijo `-2`.
  - `"reutiliza categorías, marcas y colores existentes por nombre"`: la categoría vieja «Gorros» → `reuseId` = su id en la foto; «Uniformes» → `reuseId` en `departments`; `mostaza` y `Mostaza` → la canónica reutiliza `Mostaza` y `mostaza` va a `legacyColorIds`.
  - `"categorías viejas que no son nodo nuevo van a legacyCategoryIds"`.
  - `"fotos"`: grupo de varios productos donde cada uno tenía un solo color → una fila de media por foto con ese color; producto de un solo origen → foto general (`color: null`); `path` = `product-images/<id viejo>.png`; sólo si `has_image`.
  - `"guard"` = conteos y `max(updated_at)` de la foto.
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3:** Implementar. Ids por SKU (variantes) y por `sourceProductIds` (productos). `mergeIntoId` = id de la variante cuyo SKU es `mergeIntoSku`.
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5:** Commit `feat(catalogo): plan de limpieza con ids para el SQL`.

---

### Task 6: SQL de aplicación con respaldo y verificación

**Files:**
- Create: `scripts/catalogo/aplicar.sql`, `scripts/catalogo/aplicar.sh`

**Interfaces:**
- Consumes: `CleanupPlan` en JSON (Task 5).
- Produces: `scripts/catalogo/aplicar.sh <plan.json> [--aplicar]` — por defecto simula (`ROLLBACK`); con `--aplicar` pide escribir `APLICAR` y hace `COMMIT`. Imprime el resumen de la verificación en ambos modos.

- [ ] **Step 1:** `aplicar.sh`: valida que el archivo exista, corre `scripts/catalogo/psql.sh -X -v ON_ERROR_STOP=1 -v plan_path=<abs> -v commit=<0|1> -v backup_schema=wm_respaldo_catalogo_<YYYYMMDD> -f scripts/catalogo/aplicar.sql`.
- [ ] **Step 2:** `aplicar.sql`, en este orden y dentro de `begin; … \if :commit commit; \else rollback; \endif`:
  1. `set local lock_timeout`, `statement_timeout`; cargar el plan: ``\set plan `cat :'plan_path'` `` y `create temp table _plan on commit drop as select :'plan'::jsonb doc;` (verificar en este paso que psql interpola `:'plan_path'` dentro de las comillas invertidas; si no, que `aplicar.sh` pase el contenido por `\copy` a la tabla temporal).
  2. **Guarda:** conteos y `max(updated_at)` de `products`/`product_variants` iguales a `guard`; si no, `raise exception 'El catálogo cambió después de la foto: toma otra foto y vuelve a generar el plan'`.
  3. **Antes:** tabla temporal con stock por sucursal (`sum(quantity)`, `sum(reserved)`), `count(*)` de `sale_items` y `purchase_order_items` con variante.
  4. **Respaldo:** `create schema :backup_schema` y `create table … as select` de `products`, `product_variants`, `inventory`, `categories`, `brands`, `colors`, `sale_items(id, variant_id)`, `purchase_order_items(id, variant_id)`. Sin grants a `anon`/`authenticated`.
  5. **Registro por variante** en `catalog_migration_log` (`entity = 'variant'`, `old_data` con sku, producto, categoría, marca, color y talla viejos) para reconstruir reportes viejos.
  6. **Maestros:** departamentos y categorías (`update` por `reuseId`, `insert` si es `null`; `parent_id`, `slug`, `option_type_id`, `requires_color`), atributos + valores + `category_attributes`, valores de opción faltantes, marcas (`slug`), líneas, colores (`slug`, `hex`, `family_id`, `is_active`).
  7. **Productos:** `update product_variants set product_id = sobreviviente` para los `mergeIds`; actualizar sobreviviente (nombre, slug, `category_id`, `brand_id`, `line_id`, `is_active`); `product_attribute_values` (borrar e insertar los del plan); `product_media` del plan.
  8. **Variantes repetidas:** stock de sobrantes **agregado por `(mergeIntoId, branch_id)`** y luego `insert … on conflict (variant_id, branch_id) do update` sumando `quantity` y `reserved`, `min_stock = greatest`; re-apuntar `sale_items` y `purchase_order_items`; `insert into variant_sku_aliases`; registrar y borrar las sobrantes.
  9. **Variantes:** `color_id`, `option_value_id`, `is_active` y texto legado (`color`, `color_hex`, `size`).
  10. **Borrar** (registrando en el log) productos de `mergeIds`, categorías de `legacyCategoryIds` sin productos ni hijos y colores de `legacyColorIds` sin referencias.
  11. **Verificación** (bloque `DO` que lanza excepción): stock por sucursal y conteos de líneas iguales a «antes»; cero productos activos sin categoría de 2.º nivel, sin marca o sin atributo obligatorio; cero variantes activas de producto activo sin `color_id` donde `requires_color` o sin `option_value_id` (o con valor de otro tipo) donde `option_type_id`; cero grupos repetidos `(product_id, color_id, option_value_id)` contando `null` como valor (`is not distinct from`); cero colores con nombre repetido sin mayúsculas. Al final, `raise notice` con un resumen: productos antes/después, variantes fusionadas, alias, fotos, categorías y colores borrados.
- [ ] **Step 3:** Prueba en seco contra producción con un plan vacío de cambios no es posible (la guarda depende de la foto): la prueba de este SQL es la simulación real de Task 7. Aquí sólo: `bash -n scripts/catalogo/aplicar.sh` y `scripts/catalogo/aplicar.sh` sin argumentos → uso y salida 1.
- [ ] **Step 4:** Commit `feat(catalogo): SQL de aplicación con respaldo, guarda y verificación`.

---

### Task 7: CLI, reporte y simulación real en producción

**Files:**
- Create: `lib/catalog-migration/report.ts`, `lib/catalog-migration/report.test.ts`, `scripts/catalogo/limpieza.ts`
- Modify: `package.json` (`"catalogo:limpieza": "tsx scripts/catalogo/limpieza.ts"`), `docs/CATALOGO-LIMPIEZA.md`

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces: `renderReport(input: { plan: CleanupPlan | null; blockers: Blocker[]; drift: Drift; before: Proposal["stats"] }): string` (Markdown en español). CLI: `npm run catalogo:limpieza -- --snapshot <foto nueva> --base <foto de la revisión> --revisado <xlsx> [--revisado <xlsx> …]` → escribe `backups/catalogo/reporte-<UTC>.md` y, si no hay bloqueantes, `backups/catalogo/plan-<UTC>.json`; sale con 1 si hay bloqueantes.

- [ ] **Step 1: Tests que fallan** (`report.test.ts`): con bloqueantes, el reporte empieza por «## Bloqueantes (N)» y lista cada uno con su SKU o producto; sin bloqueantes, trae secciones «Cambios posteriores a la foto», «Productos que se unen», «Variantes que se fusionan», «Fotos» y los conteos.
- [ ] **Step 2:** Test → FAIL. **Step 3:** implementar. **Step 4:** test → PASS.
- [ ] **Step 5:** Corrida real: `scripts/catalogo/snapshot.sh` y luego `npm run catalogo:limpieza -- --snapshot <nueva> --base backups/catalogo/snapshot-20261114T161950Z.json --revisado backups/catalogo/pendientes-final-2026-11-15.xlsx`. Se espera que bloquee **sólo** por las variantes sin color/opción que se están resolviendo con el usuario; cuando estén en el Excel final, 0 bloqueantes.
- [ ] **Step 6:** Simulación: `scripts/catalogo/aplicar.sh backups/catalogo/plan-<UTC>.json` → la verificación pasa y termina en `ROLLBACK`. Revisar el resumen con el usuario.
- [ ] **Step 7:** Runbook: sección «6. Simulación y aplicación» con los comandos, qué revisar en el reporte, el horario sin ventas y cómo restaurar desde `wm_respaldo_catalogo_<fecha>`.
- [ ] **Step 8:** `npx vitest run`, `npx tsc --noEmit -p .`, `npx eslint lib/catalog-migration scripts/catalogo` → todo en verde. Commit `feat(catalogo): CLI de limpieza con reporte y simulación`.

---

### Task 8: Aplicación real y cierre (sólo con confirmación del usuario)

- [ ] **Step 1:** El usuario confirma el horario sin ventas. En ese momento: foto nueva → `catalogo:limpieza` (0 bloqueantes) → `aplicar.sh <plan>` (simulación OK) → `aplicar.sh <plan> --aplicar`.
- [ ] **Step 2:** Verificación posterior en solo lectura: los mismos conteos del paso 11 de Task 6 dan 0; productos activos 229 ± cambios posteriores; el POS busca un SKU fusionado (por alias, cuando llegue el plan 3) y uno normal; `v_inventory` muestra color y talla canónicos.
- [ ] **Step 3:** Docs: `docs/PROGRESS.md` (Fase 16: limpieza aplicada, fecha, conteos), hoja de ruta (plan 2 «aplicado»), `CLAUDE.md` (el respaldo y el registro de correspondencias). Commit `docs(catalogo): limpieza aplicada en producción`.
- [ ] **Step 4:** Al cabo de unos días sin problemas, el usuario decide si se borra el esquema de respaldo (`drop schema wm_respaldo_catalogo_<fecha> cascade`).
