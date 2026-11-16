# Catálogo — Plan 3a: editor de producto con fotos por color — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la tienda mantenga el catálogo clasificado desde el ERP: editor de producto con clasificación por categoría, colores con fotos, variantes desde maestros e indicador «listo para tienda»; lista, POS e inventario usando la foto principal y los SKU alias.

**Architecture:** Toda regla es TypeScript puro y probado en `lib/catalog/` (completitud, foto principal, reglas de variantes, rutas de fotos, alias). Las lecturas van en `lib/queries/catalog.ts`; las escrituras son Server Actions delgadas en `app/(app)/productos/` que validan con esas reglas. La UI reemplaza tarjetas del editor actual (`components/productos/`) en la misma página `/productos/[id]`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, TypeScript, Tailwind v4 + shadcn (`components/ui/*`, `@base-ui/react`), Supabase (`@supabase/ssr`, esquema `wm`), Vitest 4 (sólo `lib/**/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-11-16-catalogo-3a-editor-producto-design.md` (padre: `docs/superpowers/specs/2026-11-11-catalogo-listo-ecommerce-design.md`).

## Global Constraints

- Estilo del ERP tal cual: tokens del handoff (`app/globals.css`), `Card`/`Row` del editor actual, `Label`, `Select`, `Dialog`, `Button` de `components/ui/`. Todo el texto en español (es-VE).
- Patrón de escritura: Server Action → `requireProductsEdit()` → `createClient()` → `audit(...)` → `revalidatePath` de `/productos/[id]`, `/productos`, `/inventario`, `/ventas`. `FormState = { error?: string; ok?: boolean; id?: string } | null`.
- Los maestros (`categories`, `brands`, `product_lines`, `colors`, `option_types`, `option_values`, `attributes`, `attribute_values`, `category_attributes`) son **sólo lectura** en 3a. Las categorías asignables son las de 2.º nivel (`parent_id is not null`).
- Toda escritura de variante guarda `color_id` y `option_value_id` **y** sincroniza el texto legado: `color` = `colors.name`, `color_hex` = `colors.hex`, `size` = `option_values.label` (o `null`). Nunca texto libre para color u opción.
- Fotos: JPG/PNG/WebP, **máximo 6 MB**, una por Server Action (`bodySizeLimit: "8mb"`). Nuevas en `product-images/<productId>/<mediaId>.<ext>` del bucket `wm-public`; las 177 rutas viejas `product-images/<id>.png` no se mueven.
- No bloquear el guardado por estar incompleto. Sí bloquear: variantes duplicadas (producto + color + opción, `null` cuenta como valor) y borrar con historia (ventas, compras, stock > 0 o alias).
- Sin migración de esquema. Ninguna escritura en producción salvo la de Task 9 (sincronizar fotos sueltas), que se corre sólo con confirmación del usuario.
- `.env.local` apunta a **producción**: al probar la app en local, las escrituras van a producción. Sólo se escribe sobre un producto de prueba creado y borrado en la misma verificación, con confirmación del usuario.
- Commits `feat(catalogo): …` / `fix(catalogo): …` terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Reparto (CLAUDE.md «Reparto con Codex»): la construcción repetitiva de UI puede ir a Codex con el subagente codex-rescue; todo lo que vuelve se revisa y se informa.

## Review Focus

1. **Producto con muchos colores** (Mao Stretch Dama Recta: 39 colores, ~150 variantes): el editor debe seguir usable; los chips de color hacen scroll horizontal y sólo se cargan las fotos del color elegido. → Task 6 (UI) lo verifica con ese producto real en Task 9.
2. **Subida de varias fotos con una que falla** (más de 6 MB, HEIC, o error de red): las demás se suben, la fallida queda marcada con su motivo y no queda archivo huérfano ni fila sin archivo. → test de `validateMediaFile` en Task 1 y orden «subir archivo → crear fila; si falla la fila, borrar el archivo» en Task 4.
3. **Cambio de categoría a una con otro tipo de opción** (de Conjuntos/talla a Gorros/amarre): las variantes existentes no se tocan y el indicador las marca. → test en Task 1 (`productReadiness` con opción de otro tipo).
4. **Borrar la última foto de una ruta vieja compartida** o una foto vieja (`product-images/<id>.png`) que otra fila referencia: no se borra el archivo si otra fila lo usa. → test de `mediaFileStillUsed` en Task 1; Task 4 lo usa.
5. **Buscar en el POS un SKU fusionado** (p. ej. `GOR-GORTIR-0002`): aparece la variante que lo absorbió y el carrito usa su `variant_id`. Importar stock con un SKU viejo y su variante real en el mismo archivo: esas filas se rechazan. → test de `resolveImportSkus` en Task 1; Task 8.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `lib/catalog/readiness.ts` (+test) | `productReadiness`: qué le falta a un producto para «listo para tienda» |
| `lib/catalog/media.ts` (+test) | foto principal, rutas, validación de archivo, archivo aún en uso |
| `lib/catalog/variants.ts` (+test) | clave de variante, duplicados, combinaciones faltantes, texto legado, bloqueos de borrado |
| `lib/catalog/sku-alias.ts` (+test) | resolver SKU por alias y conflictos en importación |
| `lib/sku.ts` | `nextSeqFromSkus` ya existe; `generateSku` le suma los alias |
| `lib/queries/catalog.ts` | maestros (cacheados), datos del editor, fotos principales, insumos de completitud |
| `lib/product-images.ts` | constantes (6 MB) y URL pública de una ruta |
| `app/(app)/productos/actions.ts` | producto (crear, clasificar, borrar con guarda) y variantes (guardar, generar, borrar con guarda) |
| `app/(app)/productos/media-actions.ts` | subir, reordenar y borrar fotos |
| `components/productos/editor/*.tsx` | tarjetas del editor: clasificación, ficha técnica, colores y fotos, variantes, generador, insignia |
| `components/productos/product-editor.tsx` | orquesta las tarjetas (reemplaza Galería, Organización y Variantes) |
| `components/productos/products-view.tsx`, `new-product-dialog.tsx` | lista: miniatura, filtros, «incompletos», producto nuevo |
| `app/(app)/ventas/page.tsx`, `components/ventas/pos-view.tsx` | foto principal y alias en la búsqueda |
| `app/(app)/inventario/page.tsx`, `actions.ts`, `lib/queries/inventory-options.ts` | foto principal, alias en búsqueda e importación |
| `scripts/catalogo/sync-fotos-sueltas.sql` | paso de despliegue idempotente (fotos sin fila → General) |

---

### Task 1: Reglas puras del catálogo

**Files:**
- Create: `lib/catalog/readiness.ts`, `lib/catalog/media.ts`, `lib/catalog/variants.ts`, `lib/catalog/sku-alias.ts` y sus `*.test.ts`

**Interfaces:**
- Produces:
```ts
// readiness.ts
export type ReadinessInput = {
  isActive: boolean;
  description: string | null;
  brandId: string | null;
  category: { id: string; parentId: string | null; requiresColor: boolean; optionTypeId: string | null } | null;
  requiredAttributeIds: string[];            // de category_attributes (is_required)
  attributeIdsWithValue: string[];           // atributos con al menos un valor en el producto
  variants: { id: string; sku: string; isActive: boolean; price: number; colorId: string | null;
              optionValueId: string | null; optionTypeId: string | null }[];
  media: { colorId: string | null }[];
};
export type Missing =
  | { kind: "category" } | { kind: "brand" } | { kind: "description" }
  | { kind: "attribute"; attributeId: string }
  | { kind: "photo"; colorId: string | null }          // null = el producto no tiene ninguna foto
  | { kind: "price"; sku: string }
  | { kind: "variantColor"; sku: string } | { kind: "variantOption"; sku: string };
export function productReadiness(i: ReadinessInput): { ready: boolean; missing: Missing[] };

// media.ts
export const MEDIA_MAX_BYTES = 6 * 1024 * 1024;
export function validateMediaFile(f: { type: string; size: number }): string | null; // mensaje o null
export function mediaPath(productId: string, mediaId: string, mimeType: string): string; // .jpg/.png/.webp
export function pickMainPhoto<T extends { colorId: string | null; sortOrder: number }>(media: T[], colorOrder: string[]): T | null;
export function mediaFileStillUsed(path: string, otherPaths: string[]): boolean;

// variants.ts
export function variantKey(colorId: string | null, optionValueId: string | null): string;
export function findDuplicate<T extends { id: string; colorId: string | null; optionValueId: string | null }>(existing: T[], candidate: { id?: string; colorId: string | null; optionValueId: string | null }): T | null;
export function missingCombinations(existing: { colorId: string | null; optionValueId: string | null }[], colorIds: (string | null)[], optionValueIds: (string | null)[]): { colorId: string | null; optionValueId: string | null }[];
export function legacyText(color: { name: string; hex: string | null } | null, option: { label: string } | null): { color: string | null; color_hex: string | null; size: string | null };
export type DeleteBlocker = "sales" | "purchases" | "stock" | "aliases";
export function variantDeleteBlockers(s: { saleLines: number; purchaseLines: number; stock: number; aliases: number }): DeleteBlocker[];

// sku-alias.ts
export function resolveSku(sku: string, variantBySku: Map<string, string>, variantByAlias: Map<string, string>): string | null; // sin mayúsculas, recortado
export function resolveImportSkus(rows: { row: number; sku: string; branch: string }[], variantBySku: Map<string, string>, variantByAlias: Map<string, string>):
  { resolved: { row: number; variantId: string }[]; conflicts: { rows: number[]; variantId: string }[]; unknown: number[] };
```

- [ ] **Step 1: Tests que fallan** (uno por regla, con estos casos):
  - `productReadiness`: inactivo → `ready: true, missing: []`; sin categoría / categoría de 1.er nivel (`parentId: null`) → `category`; sin marca → `brand`; descripción vacía o sólo espacios → `description`; atributo obligatorio sin valor → `attribute`; dos colores con variantes activas y foto sólo de uno → `photo` del otro; **un solo color y sólo foto General → listo**; variantes sin color y sin fotos → `photo` con `colorId: null`; variante activa con precio 0 → `price`; categoría con `requiresColor` y variante sin color → `variantColor`; variante con opción de otro tipo (`optionTypeId` ≠ el de la categoría) o sin opción cuando la categoría la exige → `variantOption`; la línea **no** cuenta; variantes inactivas no cuentan para fotos ni precio.
  - `validateMediaFile`: `image/heic` → mensaje «JPG, PNG o WebP»; 6 MB + 1 → mensaje «6 MB»; `image/webp` de 5 MB → `null`.
  - `mediaPath("p1", "m1", "image/jpeg")` → `"product-images/p1/m1.jpg"`.
  - `pickMainPhoto`: general con menor `sortOrder` gana; sin generales → la de menor `sortOrder` del primer color de `colorOrder` que tenga fotos; vacío → `null`.
  - `mediaFileStillUsed("a.png", ["a.png"])` → `true`; `([])` → `false`.
  - `findDuplicate`: misma clave con `null` en opción → encontrado; misma variante (`id` igual) → `null`.
  - `missingCombinations`: 2 colores × 3 tallas con 1 existente → 5, en orden color, talla.
  - `legacyText(null, null)` → todo `null`; con color y opción → nombre, hex, etiqueta.
  - `variantDeleteBlockers`: todo en 0 → `[]`; stock 1 y alias 1 → `["stock", "aliases"]`.
  - `resolveSku("gor-gortir-0002 ", …)` → variante del alias; SKU real → su variante; desconocido → `null`.
  - `resolveImportSkus`: el SKU viejo y el real de la misma variante en la misma sucursal → ambas filas en `conflicts`; en sucursales distintas → `resolved` (no se pisan); desconocido → `unknown`.
- [ ] **Step 2:** `npx vitest run lib/catalog` → FAIL (módulos inexistentes).
- [ ] **Step 3:** Implementar los cuatro módulos (sin dependencias de Supabase ni de React).
- [ ] **Step 4:** `npx vitest run lib/catalog` → PASS.
- [ ] **Step 5:** Commit `feat(catalogo): reglas del editor (completitud, fotos, variantes, alias)`.

---

### Task 2: Lecturas del catálogo

**Files:**
- Create: `lib/queries/catalog.ts`
- Modify: `lib/product-images.ts` (6 MB y `mediaPublicUrl(path, version?)`), `lib/queries/products.ts` (miniatura desde la foto principal)

**Interfaces:**
- Consumes: `pickMainPhoto`, `productReadiness` (Task 1).
- Produces:
```ts
export type CatalogMasters = {
  departments: { id: string; name: string }[];
  categories: { id: string; name: string; departmentId: string; requiresColor: boolean; optionTypeId: string | null;
                attributes: { attributeId: string; required: boolean; sortOrder: number }[] }[];
  attributes: { id: string; code: string; name: string; isMulti: boolean; values: { id: string; name: string }[] }[];
  optionTypes: { id: string; code: string; name: string; values: { id: string; label: string }[] }[];
  brands: { id: string; name: string; lines: { id: string; name: string }[] }[];
  colors: { id: string; name: string; hex: string | null; family: string | null }[];
};
export function getCatalogMasters(): Promise<CatalogMasters>;          // cacheado como getCatalogRefs
export type ProductMediaItem = { id: string; colorId: string | null; path: string; url: string; sortOrder: number };
export type EditorVariant = { id: string; sku: string; colorId: string | null; optionValueId: string | null;
  price: number; cost: number; isActive: boolean; stockByBranch: Record<string, number>; saleLines: number;
  purchaseLines: number; aliases: string[] };
export type ProductEditorData = { product: Product; attributeValueIds: string[]; variants: EditorVariant[];
  media: ProductMediaItem[]; readiness: { ready: boolean; missing: Missing[] }; branches: { id: string; city: string }[] };
export function getProductEditorData(id: string): Promise<ProductEditorData | null>;
export function getMainPhotoUrls(productIds?: string[]): Promise<Map<string, string>>; // productId → URL
export function getReadinessByProduct(): Promise<Map<string, { ready: boolean; missing: Missing[] }>>;
```
- [ ] **Step 1:** Implementar con una consulta por tabla y armado en memoria (339 productos; patrón `fetchAllRows` de `lib/queries/products.ts`). El orden de colores para `pickMainPhoto` es el de aparición de colores en las variantes activas ordenadas por SKU.
- [ ] **Step 2:** `listProducts` toma `product_image_url` de `getMainPhotoUrls()` en vez de `productImageUrl(id)`, y agrega a `ProductListItem`: `ready: boolean`, `missingCount: number`, `departmentId`, `categoryId`, `lineId`.
- [ ] **Step 3:** `npx tsc --noEmit -p .` → sin errores; `npx vitest run` → PASS.
- [ ] **Step 4:** Commit `feat(catalogo): lecturas del editor y fotos principales`.

---

### Task 3: Acciones de producto y variantes

**Files:**
- Modify: `app/(app)/productos/actions.ts`, `lib/sku.ts` (sólo si hace falta exportar algo)

**Interfaces:**
- Consumes: Task 1 (`findDuplicate`, `missingCombinations`, `legacyText`, `variantDeleteBlockers`), Task 2 (`getCatalogMasters`).
- Produces (todas devuelven `FormState`):
```ts
createProduct(_prev, formData /* name, category_id, brand_id */)           // los tres obligatorios; abre el editor con el id
saveProduct(_prev, formData)   // + line_id (debe ser de la marca), specs (JSON [{label,value}]),
                               //   attribute_value_ids (sólo de atributos de la categoría; reemplaza product_attribute_values)
saveVariant(_prev, formData)   // color_id, option_value_id (del tipo de la categoría), sku?, price, cost, is_active,
                               //   stock:<branchId> (sólo al crear); rechaza duplicado; escribe texto legado
generateVariants(input: { productId: string; colorIds: (string|null)[]; optionValueIds: (string|null)[]; price: number; cost: number }) // crea las faltantes
deleteVariant(id, productId)   // con variantDeleteBlockers → error «No se puede borrar: tiene ventas… Desactívala.»
deleteProduct(id)              // bloqueado si alguna variante tiene bloqueos
```
- [ ] **Step 1:** `generateSku` suma a los SKU existentes los de `variant_sku_aliases` con el mismo prefijo antes de `nextSeqFromSkus` (test nuevo en `lib/sku.test.ts`, primero en rojo: con `GOR-GORTIR-0002` sólo como alias, el siguiente es `-0003`).
- [ ] **Step 2:** Implementar las acciones; toda validación de negocio con las funciones de Task 1, para que lo probado sea la regla y la acción sólo la aplique. El stock inicial se escribe en `wm.inventory` sólo si el usuario puede editar Inventario.
- [ ] **Step 3:** `npx tsc --noEmit -p .`, `npx vitest run`, `npx eslint app/(app)/productos lib` → limpio.
- [ ] **Step 4:** Commit `feat(catalogo): acciones de producto y variantes con maestros y guardas`.

---

### Task 4: Acciones de fotos

**Files:**
- Create: `app/(app)/productos/media-actions.ts`

**Interfaces:**
- Consumes: `validateMediaFile`, `mediaPath`, `mediaFileStillUsed` (Task 1).
- Produces:
```ts
uploadProductMedia(_prev: FormState, formData /* product_id, color_id ('' = General), file */): Promise<FormState & { media?: ProductMediaItem }>;
reorderProductMedia(productId: string, colorId: string | null, orderedIds: string[]): Promise<FormState>; // principal = primero
deleteProductMedia(mediaId: string): Promise<FormState>;
```
- [ ] **Step 1:** Subida en este orden: validar → generar `mediaId` (uuid) → subir a `mediaPath` → insertar fila con `sort_order` = último + 1; si el insert falla, borrar el archivo subido. El color debe tener variantes del producto o ser `null`.
- [ ] **Step 2:** Borrar: leer la fila → borrar la fila → borrar el archivo sólo si `!mediaFileStillUsed(path, otras rutas)`.
- [ ] **Step 3:** Reordenar: sólo ids de ese producto y color; escribe `sort_order` 0..n.
- [ ] **Step 4:** `npx tsc --noEmit -p .` y `npx eslint app/(app)/productos` limpios. Commit `feat(catalogo): subir, ordenar y borrar fotos por color`.

---

### Task 5: Editor — clasificación, ficha técnica e indicador

**Files:**
- Create: `components/productos/editor/classification-card.tsx`, `specs-editor.tsx`, `readiness-badge.tsx`
- Modify: `components/productos/product-editor.tsx`, `app/(app)/productos/[id]/page.tsx`

**Interfaces:**
- Consumes: `getProductEditorData`, `getCatalogMasters` (Task 2); `saveProduct` (Task 3); `Missing` (Task 1).
- Produces: `<ReadinessBadge readiness missingLabels />` y `missingLabel(m: Missing, masters, colorsById): string` (en `readiness-badge.tsx`), usados por Task 6 y Task 7.
- [ ] **Step 1:** La página carga `getProductEditorData(id)` + `getCatalogMasters()` y pasa todo al editor; desaparecen las props `sizes`, `colors`, `categories`, `brands` viejas y `productImageUrl`.
- [ ] **Step 2:** Clasificación: categoría (grupos por departamento), marca, línea filtrada por marca, una característica por atributo de la categoría (múltiple para `isMulti`), etiquetas. Al cambiar de categoría, aviso de que los valores que no aplican se quitan al guardar. Ficha técnica: lista editable etiqueta → valor. Todo dentro del mismo `<form>` de `saveProduct` (campos ocultos para ids y `specs` en JSON).
- [ ] **Step 3:** Insignia en el encabezado: «Listo para tienda» o «Incompleto (N)»; al abrirla, la lista de faltantes con texto legible («Falta foto de Negro», «Variante UNI-… con precio 0»).
- [ ] **Step 4:** `npx tsc --noEmit -p .`, `npx eslint components/productos app/(app)/productos`, `npm run build` → OK. Commit `feat(catalogo): editor — clasificación, ficha técnica e indicador`.

---

### Task 6: Editor — colores y fotos

**Files:**
- Create: `components/productos/editor/colors-photos-card.tsx`
- Modify: `components/productos/product-editor.tsx`

**Interfaces:**
- Consumes: `uploadProductMedia`, `reorderProductMedia`, `deleteProductMedia` (Task 4); `ProductMediaItem`, `EditorVariant` (Task 2); `MEDIA_MAX_BYTES`, `validateMediaFile` (Task 1).
- [ ] **Step 1:** Chips «General» + un chip por color (con variantes o con fotos), con muestra hex, nombre, número de fotos y ⚠ si el color tiene variantes activas y 0 fotos (salvo la regla de un solo color). Fila con scroll horizontal.
- [ ] **Step 2:** Cuadrícula de fotos del chip elegido: ★ en la primera, flechas ←/→ para reordenar (y arrastre nativo HTML5), «Hacer principal», borrar con confirmación.
- [ ] **Step 3:** Zona de subida: botón y arrastre de varios archivos; valida en el navegador con `validateMediaFile`; sube uno por uno con estado por archivo (en cola / subiendo / listo / error con motivo); al terminar, `router.refresh()`.
- [ ] **Step 4:** Reemplazar la tarjeta «Galería del producto» y quitar `uploadProductImage` del editor (la acción vieja queda sin usos y se borra).
- [ ] **Step 5:** `npx tsc --noEmit -p .`, `npx eslint`, `npm run build` → OK. Commit `feat(catalogo): editor — colores y fotos por color`.

---

### Task 7: Editor — variantes y generador

**Files:**
- Create: `components/productos/editor/variants-card.tsx`, `variant-dialog.tsx`, `generate-variants-dialog.tsx`
- Modify: `components/productos/product-editor.tsx` (quitar `VariantDialog` viejo)

**Interfaces:**
- Consumes: `saveVariant`, `generateVariants`, `deleteVariant`, `deleteProduct` (Task 3); `missingCombinations`, `variantDeleteBlockers` (Task 1).
- [ ] **Step 1:** Lista agrupada por color (orden de los chips); filas con opción, SKU (+ alias en gris), precio, costo, stock por sucursal, activo; borrar deshabilitado con tooltip del motivo cuando hay bloqueos (y la acción también lo valida).
- [ ] **Step 2:** Diálogo: color (si la categoría lo exige; buscador con muestras), opción del tipo de la categoría (rotulada «Talla»/«Amarre»; oculta si no hay tipo), SKU opcional, precio, costo, activo, stock inicial por sucursal sólo al crear.
- [ ] **Step 3:** Generador: casillas de colores (buscador) y de valores de opción; vista previa de las combinaciones que faltan (`missingCombinations`) y las existentes deshabilitadas; precio y costo para todas.
- [ ] **Step 4:** `npx tsc --noEmit -p .`, `npx eslint`, `npm run build` → OK. Commit `feat(catalogo): editor — variantes desde maestros y generador`.

---

### Task 8: Lista de productos, POS e inventario

**Files:**
- Create: `components/productos/new-product-dialog.tsx`
- Modify: `components/productos/products-view.tsx`, `app/(app)/productos/page.tsx`, `app/(app)/ventas/page.tsx`, `components/ventas/pos-view.tsx`, `app/(app)/inventario/page.tsx`, `app/(app)/inventario/actions.ts`, `lib/queries/inventory-options.ts`

**Interfaces:**
- Consumes: `getMainPhotoUrls`, `ProductListItem` extendido (Task 2); `createProduct` (Task 3); `resolveImportSkus` (Task 1).
- [ ] **Step 1:** Lista: filtros departamento → categoría, marca → línea, color, talla/opción e «Incompletos (N)»; insignia ⚠ por fila; botón «Nuevo producto» abre `NewProductDialog` (nombre, categoría, marca) y navega al editor.
- [ ] **Step 2:** POS e inventario: miniatura con `getMainPhotoUrls`; cada fila de variante lleva `aliases: string[]` y la búsqueda los incluye en `matchesProductQuery`.
- [ ] **Step 3:** `importInventory` resuelve con `resolveImportSkus`: los `conflicts` se devuelven como error con sus números de fila y no se importa ninguna fila en conflicto; el resto sigue igual. Las opciones de la entrada manual (`inventory-options`) incluyen los alias para buscar.
- [ ] **Step 4:** `npx tsc --noEmit -p .`, `npx vitest run`, `npx eslint`, `npm run build` → OK. Commit `feat(catalogo): lista con filtros e incompletos; POS e inventario con foto principal y alias`.

---

### Task 9: Despliegue, verificación y documentación

**Files:**
- Create: `scripts/catalogo/sync-fotos-sueltas.sql`
- Modify: `CLAUDE.md` (convención del editor nuevo), `docs/PROGRESS.md`, `docs/superpowers/plans/2026-11-11-catalogo-00-hoja-de-ruta.md`

- [ ] **Step 1:** `sync-fotos-sueltas.sql`: en una transacción, para cada objeto `wm-public` con nombre `product-images/<uuid>.png` cuyo `<uuid>` es un producto existente y sin fila en `product_media` con esa ruta, insertar fila General con `sort_order` al final; `raise notice` con el número; termina en `\if :commit commit \else rollback`. Simular contra producción (hoy debe decir 5 o menos según los productos que existan).
- [ ] **Step 2:** Verificación en local (`npm run dev`, Playwright) **sólo lectura**: Mao Stretch Dama Recta (39 colores) carga, chips con scroll, fotos por color; un Figs con foto por color; un estetoscopio (equipo con colores); lista con «Incompletos»; POS encuentra `GOR-GORTIR-0002`. Capturas en el scratchpad.
- [ ] **Step 3:** Con confirmación del usuario: crear un producto de prueba, clasificarlo, generar 2×2 variantes, subir 2 fotos a un color, reordenar, borrar una, y borrar el producto (sin historia → se puede). Confirmar en la base que no quedó rastro.
- [ ] **Step 4:** Con confirmación del usuario: correr `sync-fotos-sueltas.sql` con `commit=1`.
- [ ] **Step 5:** Docs: `CLAUDE.md` (editor nuevo, rutas de fotos, regla de borrado), `docs/PROGRESS.md` (Fase 16: plan 3a ✅), hoja de ruta (plan 3 → «3a aplicado; 3b pendiente»). Commit `docs(catalogo): plan 3a terminado`.
