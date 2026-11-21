# Integración de la tienda online con el ERP

Guía completa para quien construye la tienda web (ecommerce) de un negocio que usa este ERP.
Explica cómo conectarse, qué datos hay y con qué campos, cómo leer el catálogo (productos,
variantes, fotos, precios, disponibilidad por sucursal), cómo registrar una **solicitud de compra**
y qué pasa después. Está pensada para copiarse tal cual al repositorio de la tienda.

> Diseño de origen: `docs/superpowers/specs/2026-11-18-ecommerce-catalogo-pedidos-online-design.md`
> (repo del ERP). Este documento es el **contrato**: si el ERP cambia algo de lo que aquí se
> describe, este archivo se actualiza en el mismo cambio.

Índice: 0. Puesta en marcha · 1. Qué hace la tienda · 2. Seguridad · 3. Conexión ·
4. Catálogo (`shop`) · 5. Tipos TypeScript · 6. Consultas · 7. Fotos · 8. Precios y moneda ·
9. Páginas y flujo del comprador · 10. Carrito · 11. Crear la solicitud · 12. Después de la
solicitud · 13. Caché · 14. Seguridad web · 15. Pruebas · 16. Errores comunes · 17. Lo que vendrá

---

## 0. Puesta en marcha (lista en orden)

### 0.1 Lado ERP (lo hace el administrador del ERP)

1. **Desplegar la versión del ERP que trae «Pedidos online».** Sin ella, las solicitudes llegan a
   la base de datos pero nadie las ve ni las gestiona, y el POS no muestra lo apartado.
   **No abras la tienda al público antes de este paso.**
2. **Fijar la contraseña del rol `storefront`** (una sola vez por negocio), con `psql` como
   `postgres`:
   ```sql
   alter role storefront password '<contraseña larga y aleatoria>';
   ```
   Entregarla al equipo de la tienda por un canal seguro (nunca por chat ni en el repo).
3. **Configuración → Tienda online** (permiso de edición de Configuración): WhatsApp de la
   tienda (E.164), minutos del apartado corto (30 por defecto), horas del apartado firme (24) y las
   cinco plantillas de WhatsApp.
4. **Configuración → Tienda online → Sucursales:** activar **«Vende online»** en cada sucursal que
   venderá por la web (permiso de edición de Sucursales; la sucursal debe estar activa). Una
   sucursal sin este interruptor no aparece en la tienda y su stock no se muestra.
5. **Completar los productos** que se quieren publicar (ver §4.1). Las fotos son recomendadas,
   pero no bloquean la publicación. En **Productos**, los filtros «Incompletos» y «Faltan fotos» y
   el indicador «listo para tienda» del editor muestran lo pendiente y las recomendaciones.
6. Dar permiso de **Ventas** (edición) a quien atenderá los pedidos online.

### 0.2 Lado tienda

1. Variables de entorno (§3.1) y cliente SQL solo de servidor (§3.2).
2. Prueba de humo (§15.1): leer `shop.store_settings` y contar `shop.products`.
3. Páginas de catálogo (§9) con las consultas de §6.
4. Carrito en el navegador (§10).
5. Checkout con Turnstile, límite por IP, validación y `shop.crear_solicitud` (§11).
6. Confirmación y correo (§12).
7. Cabeceras de seguridad (§14) y pruebas (§15).

---

## 1. Qué hace la tienda y qué no

| La tienda SÍ | La tienda NO |
|---|---|
| Lee el catálogo publicado y la disponibilidad por sucursal. | Lee costos, proveedores, ventas, clientes, usuarios o datos fiscales. |
| Crea **solicitudes** de compra (con apartado temporal de stock). | Cobra. El cobro lo hace el personal por WhatsApp. |
| Muestra fotos desde la URL pública del bucket. | Sube, cambia o borra fotos o productos. |
| Muestra precios en USD y su equivalente en VES (tasa BCV). | Decide precios: el precio siempre lo pone el ERP. |
| Envía un correo de confirmación si el comprador dejó correo. | Consulta ni cambia el estado de una solicitud después de crearla. |

Flujo completo:

```
Comprador arma carrito (elige sucursal por producto)
   → checkout (nombre, teléfono WhatsApp, correo opcional, cédula opcional, nota)
   → el servidor de la tienda verifica Turnstile + límite por IP + valida
   → la tienda llama shop.crear_solicitud(...)
        → el ERP valida, congela precios y APARTA el stock por poco tiempo (30 min por defecto)
   → pantalla de confirmación con número W-000123 (+ correo si lo dejó)
   ─────────────── a partir de aquí todo ocurre en el ERP ───────────────
   → el personal ve la solicitud en «Pedidos online» y la acepta (apartado firme, 24 h),
     puede cambiar sucursal o reducir cantidades, o la rechaza
   → le escribe al comprador por WhatsApp (mensaje preparado) para cobrar y coordinar envío
   → al cobrar, la convierte en venta en el POS (una venta y una factura por sucursal)
```

Si nadie atiende la solicitud a tiempo, el apartado **vence solo** y el stock vuelve a estar
disponible. No hay que hacer nada desde la tienda.

---

## 2. Modelo de seguridad (léelo antes de escribir código)

1. **Acceso solo desde el servidor de la tienda.** Server Components, Route Handlers o Server
   Actions. El navegador del comprador nunca recibe credenciales ni la URL de la base de datos.
   Nada de `@supabase/supabase-js` en el cliente.
2. **Rol de base de datos `storefront`.** Es la única credencial que usa la tienda. Puede:
   - `SELECT` sobre las vistas del esquema `shop`.
   - `EXECUTE` sobre `shop.crear_solicitud`.
   - No puede leer datos de `public`, `auth`, `storage` ni `wm`: no tiene permisos sobre sus
     tablas o vistas ni puede ejecutar funciones privilegiadas fuera de `shop`. Como cualquier rol
     de PostgreSQL, puede ver el esquema `public` y crear tablas temporales en su propia sesión;
     eso no expone datos del ERP. Si intentas leer otras tablas recibirás `permission denied`: es
     lo esperado.
3. **No uses** la `service_role`, la anon key ni ninguna credencial del ERP. Si alguien te las
   ofrece, recházalas.
4. **El esquema `shop` no está en la API REST** (PostgREST). Se accede por conexión Postgres.
5. **Anti-abuso obligatorio** en el checkout (§11.1): Cloudflare Turnstile verificado en el
   servidor y límite por IP. Una solicitud aparta stock; sin estas defensas, alguien podría
   bloquear el inventario con solicitudes falsas. El ERP además limita a 2 solicitudes vigentes
   por teléfono y topa unidades y líneas.
6. **Límite por consulta**: el rol tiene `statement_timeout = 5s` y como máximo 20 conexiones.
   Filtra y pagina siempre.

---

## 3. Conexión

### 3.1 Variables de entorno de la tienda

| Variable | Valor | Uso |
|---|---|---|
| `ERP_DATABASE_URL` | `postgresql://storefront.<ref>:<password>@aws-1-us-west-2.pooler.supabase.com:6543/postgres` | Rol `storefront` por el pooler en **modo transacción** (puerto **6543**). |
| `ERP_MEDIA_BASE_URL` | `https://<ref>.supabase.co/storage/v1/object/public/wm-public` | Base pública de las fotos (§7). |
| `TURNSTILE_SECRET_KEY` | — | Verificación anti-bots en el servidor. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | — | Widget de Turnstile en el checkout. |
| `BCV_API_URL` | `https://ve.dolarapi.com/v1/dolares/oficial` | Tasa USD→VES (la misma fuente que el ERP). |
| `RESEND_API_KEY`, `MAIL_FROM` (o el proveedor que uses) | — | Correo de confirmación. |
| Límite por IP (p. ej. `UPSTASH_REDIS_REST_URL`/`_TOKEN`) | — | Contador por IP del checkout. |

Para World Medics, `<ref>` = `cfggippjujceebovvhsa`. Cada negocio tiene su propio proyecto y su
propio `<ref>`; la tienda no lleva nada del negocio en el código (nombre, logo y colores salen de
`shop.store_settings`).

- El usuario lleva el sufijo del proyecto: `storefront.cfggippjujceebovvhsa`. Sin el sufijo, el
  pooler no sabe a qué proyecto ir.
- La contraseña puede traer caracteres especiales: **codifícala** en la URL
  (`encodeURIComponent`) o pasa los parámetros por separado (`host`, `port`, `username`,
  `password`, `database`).
- El host directo `db.<ref>.supabase.co` solo tiene IPv6; usa el pooler.

### 3.2 Cliente SQL recomendado

[`postgres`](https://github.com/porsager/postgres) (porsager). Con el pooler en modo transacción
**no** se pueden usar sentencias preparadas:

```ts
// lib/erp.ts  (solo servidor)
import "server-only";
import postgres from "postgres";

export const erp = postgres(process.env.ERP_DATABASE_URL!, {
  prepare: false,      // obligatorio con el pooler en modo transacción (6543)
  max: 5,              // conexiones por instancia; en serverless, bajo (1–5)
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: "require",
});
```

- Siempre usa parámetros (`${valor}` en el template de `postgres`), nunca concatenes texto.
- No uses `SET`, `LISTEN` ni transacciones largas: el pooler en modo transacción no conserva la
  sesión entre consultas.
- Cómo devuelve tipos el cliente `postgres`: `numeric` → **string** (conviértelo con `Number`),
  `int` → number, `uuid` → string, `jsonb` → objeto/arreglo ya parseado, `timestamptz` → `Date`,
  `boolean` → boolean.

---

## 4. Datos de catálogo (esquema `shop`)

### 4.1 Qué hace que un producto aparezca en la tienda

El ERP solo publica un producto cuando cumple **todo** esto (la tienda no tiene que repetirlo):

1. Está **activo** y marcado **«Visible en catálogo»**. (El slug ya no es requisito aparte: la base lo genera al crear el producto.)
2. Su categoría es de **segundo nivel** (tiene departamento) y ambas están activas.
3. Tiene **marca** activa.
4. Tiene **descripción** (no vacía).
5. Tiene todas las **características obligatorias** de su categoría (p. ej. género, tela).
6. Cada variante activa tiene precio > 0, color si la categoría exige color, y opción (talla) si la
   categoría usa opción.
7. Tiene al menos una variante activa con precio > 0.

Además:

- Solo salen variantes **activas con precio > 0**.
- Las fotos son **recomendadas**: una por color activo, o una General si hay un solo color; si
  las variantes no tienen color, basta cualquier foto. Un producto sin fotos también se publica:
  `main_photo` es `null` y `general_photos` y `color_photos` son `[]`. La tienda debe mostrar una
  **imagen genérica**, por ejemplo el logo de `store_settings` sobre fondo neutro.
- Solo salen sucursales **activas con «Vende online»**.
- La disponibilidad ya descuenta los apartados vigentes de todas las solicitudes y viene **con
  tope** (`store_settings.display_stock_cap`, 10 por defecto): `available = 10` significa
  «10 o más».
- Un producto publicado puede tener `in_stock = false` (todas sus sucursales online en 0, o
  ninguna sucursal habilitada todavía). Muéstralo como «Agotado» en vez de ocultarlo, o fíltralo:
  es decisión de la tienda.

Todos los precios están en **USD con IVA incluido** (`numeric`, 2 decimales).

### 4.2 `shop.store_settings` (1 fila)

| Columna | Tipo | Notas |
|---|---|---|
| `company_name` | text, null | Nombre comercial. |
| `logo_url`, `logo_dark_url`, `favicon_url` | text, null | URLs absolutas (ya públicas). |
| `primary_color`, `accent_color` | text, null | Hex (`#0EA5E9`); ten un color por defecto. |
| `store_whatsapp` | text, null | WhatsApp de la tienda en E.164 (`+58…`), para mostrarlo si quieres. |
| `soft_hold_minutes` | int | Duración del apartado de una solicitud (30). |
| `max_units_per_line` | int | Máx. unidades por línea (10). |
| `max_units_per_order` | int | Máx. unidades por solicitud (30). |
| `max_lines` | int | Máx. líneas por solicitud (20). |
| `max_open_per_phone` | int | Máx. solicitudes vigentes por teléfono (2). |
| `display_stock_cap` | int | Tope de disponibilidad mostrada (10). |

Usa estos valores para los límites del carrito; no los escribas fijos en el código.

### 4.3 `shop.branches` (sucursales que venden online)

| Columna | Tipo | Notas |
|---|---|---|
| `branch_id` | uuid | Lo que mandas en cada línea de la solicitud. |
| `code` | text | Código corto interno. |
| `name` | text | Nombre visible («Caracas Centro»). |
| `city` | text | |
| `address` | text, null | |
| `phone` | text, null | |

### 4.4 `shop.categories` (árbol de 2 niveles)

| Columna | Tipo | Notas |
|---|---|---|
| `category_id` | uuid | |
| `parent_id` | uuid, null | `null` = **departamento** (nivel 1). |
| `level` | int | 1 = departamento, 2 = categoría. |
| `name`, `slug` | text | `slug` estable: úsalo en URLs. |
| `sort_order` | int | Orden definido en el ERP. |
| `product_count` | int | Productos publicados (departamento: suma de sus categorías). |

Solo se listan categorías con al menos un producto publicado (y sus departamentos).

### 4.5 `shop.brands`

| Columna | Tipo | Notas |
|---|---|---|
| `brand_id` | uuid | |
| `name`, `slug` | text | |
| `logo_url` | text, null | |
| `description` | text, null | |
| `lines` | jsonb | `[{ "line_id", "name", "slug" }]`, solo líneas con productos publicados. |
| `product_count` | int | |

Solo se listan marcas con productos publicados.

### 4.6 `shop.color_families` y `shop.option_values` (para filtros)

`shop.color_families` (familias de color con productos publicados):

| Columna | Tipo | Notas |
|---|---|---|
| `family_id` | uuid | |
| `name`, `slug` | text | «Azules», `azules`. |
| `hex` | text, null | Color representativo para la muestra del filtro. |
| `sort_order` | int | |

`shop.option_values` (tallas u otras opciones con productos publicados):

| Columna | Tipo | Notas |
|---|---|---|
| `option_type_code` | text | P. ej. `talla`. |
| `option_type_name` | text | P. ej. `Talla`. |
| `option_value_id` | uuid | |
| `label` | text | P. ej. `M`. |
| `slug` | text | |
| `sort_order` | int | Ordena las tallas por aquí (XS, S, M, L…), **no** alfabéticamente. |

### 4.7 `shop.products` (una fila por producto publicado)

| Columna | Tipo | Notas |
|---|---|---|
| `product_id` | uuid | |
| `slug` | text | Para la URL de la ficha. Único. |
| `name` | text | |
| `description` | text | Texto plano con saltos de línea. |
| `specs` | jsonb | Ficha técnica: `[{ "label": "Tela", "value": "Poliéster 72%…" }]` (puede ser `[]`). |
| `brand_id`, `brand_name`, `brand_slug` | uuid, text, text | |
| `line_id`, `line_name`, `line_slug` | uuid, text, text (null) | null si no tiene línea/modelo. |
| `department_id`, `department_name`, `department_slug` | uuid, text, text | |
| `category_id`, `category_name`, `category_slug` | uuid, text, text | |
| `option_type_code`, `option_type_name` | text, null | Eje de variante de la categoría (p. ej. `talla`/`Talla`); null si no usa opción. |
| `attributes` | jsonb | `[{ "code": "genero", "attribute": "Género", "values": ["Dama"] }]` (puede ser `[]`). |
| `general_photos` | jsonb | Rutas de fotos generales en orden: `["product-images/<id>/<media>.webp", …]`. |
| `main_photo` | text, null | Ruta de la foto principal: la primera foto general; si no hay, la primera de un color con variante activa (colores por nombre). |
| `price_min`, `price_max` | numeric | Rango de precio de sus variantes publicadas (iguales si todas valen lo mismo). |
| `in_stock` | boolean | Alguna variante con disponibilidad > 0 en alguna sucursal online. |
| `updated_at` | timestamptz | Último cambio del producto (no cambia con el stock). |

### 4.8 `shop.variants` (una fila por variante publicada)

Una variante es una combinación concreta (color × talla) con su SKU y precio.

| Columna | Tipo | Notas |
|---|---|---|
| `variant_id` | uuid | **Lo que mandas al crear la solicitud.** |
| `product_id` | uuid | |
| `sku` | text | |
| `price` | numeric | USD, IVA incluido. |
| `color_id`, `color_name`, `color_slug`, `color_hex` | uuid, text, text, text | null si la variante no usa color. |
| `color_family_name`, `color_family_slug` | text, null | Para filtrar por familia. |
| `color_sort` | int, null | Orden de los colores en la ficha. |
| `option_value_id`, `option_label`, `option_slug`, `option_sort` | uuid, text, text, int | null si no usa opción. |
| `color_photos` | jsonb | Rutas de fotos de ese color, en orden (puede ser `[]`). |
| `available_total` | int | Suma de la disponibilidad de la variante en todas las sucursales online. Cada sucursal ya viene con tope, así que con 2 sucursales puede llegar a 20. |

### 4.9 `shop.availability` (variante × sucursal)

| Columna | Tipo | Notas |
|---|---|---|
| `variant_id` | uuid | |
| `branch_id` | uuid | Siempre una sucursal de `shop.branches`. |
| `available` | int | Siempre > 0 (las combinaciones sin stock no aparecen). Con tope. |

Es la vista que más cambia (cada venta en tienda física y cada solicitud la mueve). Léela fresca.
Si una combinación variante × sucursal no está, su disponible es 0.

---

## 5. Tipos TypeScript (tal como llegan con el cliente `postgres`)

```ts
// lib/erp-types.ts
export type StoreSettings = {
  company_name: string | null;
  logo_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  store_whatsapp: string | null;
  soft_hold_minutes: number;
  max_units_per_line: number;
  max_units_per_order: number;
  max_lines: number;
  max_open_per_phone: number;
  display_stock_cap: number;
};

export type Branch = {
  branch_id: string; code: string; name: string; city: string;
  address: string | null; phone: string | null;
};

export type Category = {
  category_id: string; parent_id: string | null; level: 1 | 2;
  name: string; slug: string; sort_order: number; product_count: number;
};

export type Brand = {
  brand_id: string; name: string; slug: string; logo_url: string | null;
  description: string | null; product_count: number;
  lines: { line_id: string; name: string; slug: string }[];
};

export type ColorFamily = { family_id: string; name: string; slug: string; hex: string | null; sort_order: number };

export type OptionValue = {
  option_type_code: string; option_type_name: string; option_value_id: string;
  label: string; slug: string; sort_order: number;
};

export type Product = {
  product_id: string; slug: string; name: string; description: string;
  specs: { label: string; value: string }[];
  brand_id: string; brand_name: string; brand_slug: string;
  line_id: string | null; line_name: string | null; line_slug: string | null;
  department_id: string; department_name: string; department_slug: string;
  category_id: string; category_name: string; category_slug: string;
  option_type_code: string | null; option_type_name: string | null;
  attributes: { code: string; attribute: string; values: string[] }[];
  general_photos: string[];
  main_photo: string | null;
  price_min: string; // numeric → string
  price_max: string;
  in_stock: boolean;
  updated_at: Date;
};

export type Variant = {
  variant_id: string; product_id: string; sku: string;
  price: string; // numeric → string
  color_id: string | null; color_name: string | null; color_slug: string | null; color_hex: string | null;
  color_family_name: string | null; color_family_slug: string | null; color_sort: number | null;
  option_value_id: string | null; option_label: string | null; option_slug: string | null; option_sort: number | null;
  color_photos: string[];
  available_total: number;
};

export type Availability = { variant_id: string; branch_id: string; available: number };

// ---- crear_solicitud ----
export type SolicitudRequest = {
  request_id: string; // UUID v4, uno por intento de checkout
  customer: { name: string; phone: string; email?: string | null; document?: string | null };
  notes?: string | null;
  source_ip?: string | null;
  items: { variant_id: string; branch_id: string; quantity: number }[];
};

export type SolicitudItem = {
  variant_id: string; sku: string; product_name: string; variant_label: string;
  quantity: number; unit_price: number; line_total: number; // aquí ya son number (vienen en JSON)
};

export type SolicitudGroup = {
  branch_id: string; branch_name: string; city: string; subtotal: number; items: SolicitudItem[];
};

export type SolicitudOk = {
  ok: true;
  order: {
    order_id: string;
    number: string;            // "W-000123"
    status: "solicitada" | "aceptada" | "completada" | "rechazada" | "cancelada";
    soft_expires_at: string;   // ISO 8601 con zona, p. ej. "2026-11-20T15:30:00.123456+00:00"
    total: number;
    groups: SolicitudGroup[];
  };
};

export type SolicitudError = {
  ok: false;
  code: "invalid_input" | "too_many_lines" | "too_many_units" | "too_many_open_requests" | "not_found" | "unavailable";
  message: string;
  lines?: { variant_id: string; branch_id: string; requested?: number; available?: number }[];
};

export type SolicitudResult = SolicitudOk | SolicitudError;
```

---

## 6. Consultas de ejemplo

```ts
import { erp } from "@/lib/erp";

// Configuración de la tienda (marca y límites)
const [settings] = await erp<StoreSettings[]>`select * from shop.store_settings`;

// Menú: departamentos con sus categorías
const cats = await erp<Category[]>`
  select category_id, parent_id, level, name, slug, sort_order, product_count
  from shop.categories order by level, sort_order, name`;

// Listado de una categoría con filtros y paginación
const page = await erp`
  select p.product_id, p.slug, p.name, p.brand_name, p.main_photo, p.price_min, p.price_max, p.in_stock
  from shop.products p
  where p.category_slug = ${categorySlug}
    and (${brandSlug}::text is null or p.brand_slug = ${brandSlug})
    and (${colorFamily}::text is null or exists (
          select 1 from shop.variants v
           where v.product_id = p.product_id and v.color_family_slug = ${colorFamily}))
    and (${size}::text is null or exists (
          select 1 from shop.variants v
           where v.product_id = p.product_id and v.option_slug = ${size}))
    and (${branchId}::uuid is null or exists (
          select 1 from shop.variants v join shop.availability a using (variant_id)
           where v.product_id = p.product_id and a.branch_id = ${branchId}))
    and (${onlyInStock}::boolean = false or p.in_stock)
  order by p.in_stock desc, p.name
  limit ${pageSize} offset ${(pageNumber - 1) * pageSize}`;

// Listado de un departamento entero: usa department_slug en lugar de category_slug.

// Filtros disponibles dentro de una categoría (para no mostrar opciones vacías)
const facets = await erp`
  select distinct v.color_family_slug, v.color_family_name, v.option_slug, v.option_label, v.option_sort
  from shop.variants v join shop.products p using (product_id)
  where p.category_slug = ${categorySlug}`;

// Ficha de producto
const [product] = await erp<Product[]>`select * from shop.products where slug = ${slug}`;
// si no hay fila → 404 (el producto no existe o dejó de estar publicado)
const variants = await erp<Variant[]>`
  select * from shop.variants where product_id = ${product.product_id}
  order by color_sort nulls last, color_name, option_sort nulls last`;
const availability = await erp`
  select a.variant_id, a.branch_id, a.available, b.name as branch_name, b.city
  from shop.availability a join shop.branches b using (branch_id)
  where a.variant_id = any(${variants.map((v) => v.variant_id)}::uuid[])`;

// Búsqueda de texto (nombre, marca, SKU)
const results = await erp`
  select distinct p.product_id, p.slug, p.name, p.main_photo, p.price_min
  from shop.products p left join shop.variants v using (product_id)
  where p.name ilike ${"%" + q + "%"} or p.brand_name ilike ${"%" + q + "%"} or v.sku ilike ${q + "%"}
  limit 24`;

// Revalidar el carrito (§10.3): una sola consulta para todas las líneas
const fresh = await erp`
  select v.variant_id, v.price, coalesce(a.available, 0) as available, i.branch_id
  from unnest(${variantIds}::uuid[], ${branchIds}::uuid[]) as i(variant_id, branch_id)
  left join shop.variants v on v.variant_id = i.variant_id
  left join shop.availability a on a.variant_id = i.variant_id and a.branch_id = i.branch_id`;
// v.variant_id null → la variante ya no está publicada: quitar la línea.
```

Escapa `%` y `_` en `q` si no quieres que actúen como comodines.

---

## 7. Fotos

- Las vistas devuelven **rutas** dentro del bucket público `wm-public`
  (p. ej. `product-images/7f3c…/a12b….webp`; algunas antiguas son `product-images/<id>.png`).
- URL pública: `${ERP_MEDIA_BASE_URL}/${ruta}`.
- **Ficha:** al elegir un color, muestra `variants.color_photos` de ese color; si está vacío, usa
  `products.general_photos`. Si ambos arreglos están vacíos, muestra la imagen genérica. Lo ideal:
  fotos del color elegido primero y luego las generales.
- **Listados:** `products.main_photo`. Si es `null`, muestra la imagen genérica (p. ej. el logo de
  `store_settings` sobre fondo neutro).
- Con `next/image`, agrega `<ref>.supabase.co` a `images.remotePatterns`. Opcional: las
  transformaciones de Supabase (`/storage/v1/render/image/public/wm-public/<ruta>?width=600`)
  si el plan del proyecto las incluye.
- El bucket no se puede **listar** desde fuera; solo se accede por ruta conocida.
- Las fotos se suben y ordenan en el ERP (editor de producto). La tienda nunca las modifica.

---

## 8. Precios y moneda

- `price` está en USD con IVA incluido. Muestra USD como precio principal: `$31.25`.
- Equivalente en bolívares: `price × tasa`, redondeado a 2 decimales, con formato
  `Bs. 3.531,25`. Tasa: `BCV_API_URL` (`https://ve.dolarapi.com/v1/dolares/oficial`), campo
  `promedio` (o `venta` si no viene), cacheada 1 h. Si la tasa falla, muestra solo USD.
- Los precios del carrito son **informativos**: el ERP recalcula y **congela** los precios al crear
  la solicitud y devuelve el total oficial. En la confirmación muestra siempre los montos que
  devuelve el ERP.

---

## 9. Páginas y flujo del comprador

| Página | Ruta sugerida | Datos |
|---|---|---|
| Inicio | `/` | `store_settings`, departamentos, algunos productos (p. ej. los más recientes por `updated_at`). |
| Departamento | `/d/[department_slug]` | Productos del departamento + filtros. |
| Categoría | `/c/[category_slug]` | Productos de la categoría + filtros (marca, familia de color, talla, sucursal, solo con stock). |
| Marca | `/marca/[brand_slug]` | Productos de la marca (opcional). |
| Búsqueda | `/buscar?q=` | Búsqueda de §6. |
| Ficha | `/p/[slug]` | Producto, variantes, disponibilidad por sucursal. |
| Carrito | `/carrito` | Carrito del navegador revalidado contra el servidor. |
| Checkout | `/checkout` | Formulario + Turnstile. |
| Confirmación | `/solicitud/[number]` o estado en la misma página | Respuesta de `crear_solicitud`. |

**Ficha de producto, paso a paso:**

1. El comprador elige **color** (muestras con `color_hex`, en orden `color_sort`). Cambian las
   fotos a las del color.
2. Elige **opción/talla** (en orden `option_sort`). Desactiva las tallas sin variante o sin
   disponibilidad para ese color.
3. Con color + talla queda definida **una variante** (`variant_id`, `sku`, `price`).
4. Ve la **disponibilidad por sucursal** de esa variante: «Caracas Centro — 3 disponibles»,
   «Valencia — 10+ disponibles». Elige **una sucursal**. Si solo hay una con stock, preselecciónala.
5. Elige **cantidad**: de 1 a `min(available, max_units_per_line)`.
6. «Agregar al carrito». Si la variante no tiene stock en ninguna sucursal: «Agotado».

Si la categoría no usa color o talla (`color_id`/`option_value_id` null), omite ese selector.

---

## 10. Carrito y sucursales

### 10.1 Qué guarda

El carrito vive en el navegador (`localStorage`), una línea por variante × sucursal:

```ts
type CartLine = {
  variant_id: string;
  branch_id: string;
  quantity: number;
  // solo para mostrar sin consultar; se refrescan al revalidar:
  product_slug: string; product_name: string; variant_label: string;
  photo: string | null; price: string; branch_name: string;
};
```

Agregar la misma variante en la misma sucursal **suma** cantidades en la línea existente (la
solicitud no admite líneas repetidas). La misma variante en dos sucursales son dos líneas.

### 10.2 Cómo se muestra

- **Agrupado por sucursal**, con subtotal por grupo y total general.
- Si hay más de una sucursal, aviso visible:
  **«Este pedido sale de N tiendas: serán N facturas y N envíos.»**
- Respeta los topes de `store_settings`: unidades por línea, unidades por pedido y número de
  líneas. Avisa antes del checkout en vez de esperar el error del ERP.

### 10.3 Revalidación

Al abrir el carrito y justo antes de enviar, consulta el servidor (§6, «Revalidar el carrito»):

- variante que ya no está publicada → quitar la línea y avisar;
- sucursal sin disponibilidad → avisar y ofrecer otra sucursal con stock, o quitar;
- cantidad mayor al disponible → bajar al disponible y avisar;
- precio distinto → actualizar el precio mostrado.

La verdad final la da `crear_solicitud`: aunque la página muestre datos viejos, el ERP nunca
aparta más de lo que hay.

---

## 11. Crear una solicitud: `shop.crear_solicitud`

### 11.1 Antes de llamar (en el servidor de la tienda)

1. Verifica el token de **Cloudflare Turnstile** con `TURNSTILE_SECRET_KEY`
   (`https://challenges.cloudflare.com/turnstile/v0/siteverify`). Si falla, no llames.
2. **Límite por IP**: p. ej. 5 solicitudes por IP cada 10 minutos (Upstash, Vercel KV o similar).
3. **Normaliza el teléfono** a E.164 (Venezuela):
   - `0414-123.45.67`, `04141234567`, `4141234567`, `+58 414 1234567`, `58 4141234567` →
     `+584141234567`.
   - Regla: quitar todo lo que no sea dígito o `+`; si empieza con `0`, quitar el `0` y anteponer
     `+58`; si empieza con `58` sin `+`, anteponer `+`; si tiene 10 dígitos que empiezan por `4`,
     anteponer `+58`. El resultado debe cumplir `^\+[1-9][0-9]{7,14}$`.
   - Normaliza la **cédula**: mayúsculas y sin espacios ni puntos (`v 12.345.678` → `V-12345678`).
4. Valida con las mismas reglas del ERP (§11.2) para mostrar errores por campo.
5. Genera un `request_id` (UUID v4) **por intento de checkout** y reutilízalo si reintentas la
   misma petición (evita solicitudes duplicadas). Genera uno nuevo si el comprador cambia el
   carrito o sus datos.
6. Toma la IP del comprador de la cabecera de tu plataforma (p. ej. `x-forwarded-for`, primer
   valor) y mándala en `source_ip`.

### 11.2 Campos de entrada (`jsonb`)

```json
{
  "request_id": "6f1c0e8e-3d7a-4b1e-9a51-0b2f3c4d5e6f",
  "customer": {
    "name": "María Pérez",
    "phone": "+584141234567",
    "email": "maria@example.com",
    "document": "V-12345678"
  },
  "notes": "Para retirar el sábado",
  "source_ip": "190.202.10.5",
  "items": [
    { "variant_id": "…", "branch_id": "…", "quantity": 2 },
    { "variant_id": "…", "branch_id": "…", "quantity": 1 }
  ]
}
```

| Campo | Obligatorio | Regla del ERP |
|---|---|---|
| `request_id` | sí | Texto UUID (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). |
| `customer.name` | sí | Texto de 2 a 120 caracteres (sin contar espacios de los extremos), sin caracteres de control. |
| `customer.phone` | sí | E.164: `^\+[1-9][0-9]{7,14}$`. Es el WhatsApp al que escribirá la tienda. |
| `customer.email` | no | `null` o ausente, o correo válido de máx. 254 caracteres. |
| `customer.document` | no | `null` o ausente, o `^[VEJPG]-?[0-9]{5,10}$` (mayúscula). |
| `notes` | no | `null` o ausente, o texto de máx. 500 caracteres. |
| `source_ip` | no | `null` o ausente, o IP válida (v4 o v6). |
| `items` | sí | Arreglo de 1 a `max_lines` líneas. |
| `items[].variant_id` | sí | UUID de `shop.variants`. |
| `items[].branch_id` | sí | UUID de `shop.branches`. |
| `items[].quantity` | sí | Número JSON entero ≥ 1 (no texto, no `2.0`), máx. `max_units_per_line`. |

- La suma de cantidades no puede pasar de `max_units_per_order`.
- Una misma `variant_id` + `branch_id` no puede repetirse: suma las cantidades en una línea.
- **No mandes precios.** Si los mandas, se ignoran.

### 11.3 Llamada

```ts
const [{ result }] = await erp<{ result: SolicitudResult }[]>`
  select shop.crear_solicitud(${erp.json(payload)}) as result`;
```

`result` ya llega como objeto (es `jsonb`). Dentro del JSON los montos son **number**, no string.

### 11.4 Salida correcta

```json
{
  "ok": true,
  "order": {
    "order_id": "…",
    "number": "W-000123",
    "status": "solicitada",
    "soft_expires_at": "2026-11-20T15:30:00.123456+00:00",
    "total": 87.50,
    "groups": [
      {
        "branch_id": "…", "branch_name": "Caracas Centro", "city": "Caracas",
        "subtotal": 62.50,
        "items": [
          { "variant_id": "…", "sku": "UNI-JOGGER-0004", "product_name": "Jogger Pro",
            "variant_label": "Azul marino · M", "quantity": 2, "unit_price": 31.25, "line_total": 62.50 }
        ]
      }
    ]
  }
}
```

- `soft_expires_at`: hasta cuándo queda apartado el stock mientras la tienda revisa. Muéstralo en
  hora de Venezuela (`America/Caracas`).
- `groups`: uno por sucursal, ordenados por nombre de sucursal. Cada grupo será una factura y un
  envío distintos.
- `variant_label`: «Color · Talla» (o solo uno de los dos, o vacío).

**Idempotencia:** si repites la llamada con el mismo `request_id` y el mismo teléfono, recibes la
misma solicitud (`ok: true`), sin crear otra ni apartar dos veces. Su `status` puede haber cambiado
(p. ej. `aceptada`) y una solicitud vencida se devuelve todavía como `solicitada` aunque su
apartado ya terminó: compara `soft_expires_at` con la hora actual antes de decir «apartado».
Si reutilizas ese `request_id` con **otro** teléfono, recibes `invalid_input` con el mensaje
`Identificador de solicitud ya usado` y ningún dato del pedido existente.

### 11.5 Errores de negocio (`ok: false`, no es excepción)

```json
{
  "ok": false,
  "code": "unavailable",
  "message": "Algunos productos ya no tienen disponibilidad.",
  "lines": [
    { "variant_id": "…", "branch_id": "…", "requested": 3, "available": 1 }
  ]
}
```

| `code` | Cuándo | `lines` | Mensaje sugerido al comprador |
|---|---|---|---|
| `invalid_input` | Falta un dato o tiene mal formato (teléfono no E.164, cantidad no entera, línea repetida, `request_id` inválido o ya usado con otro teléfono). | — | «Revisa tus datos e inténtalo de nuevo.» (Es un fallo de tu validación: regístralo.) |
| `too_many_lines` | Más de `max_lines` líneas. | — | «Tu pedido tiene demasiados productos distintos. Divídelo en dos solicitudes.» |
| `too_many_units` | Una línea > `max_units_per_line` o el total > `max_units_per_order`. | — | «Superaste el máximo de unidades por pedido. Para compras al mayor, escríbenos por WhatsApp.» |
| `too_many_open_requests` | El teléfono ya tiene `max_open_per_phone` solicitudes vigentes. | — | «Ya tienes solicitudes en revisión. Te escribiremos por WhatsApp.» |
| `not_found` | Variante no publicada o sucursal no habilitada. | `[{variant_id, branch_id}]` | «Algunos productos ya no están disponibles en la tienda.» Quita esas líneas del carrito. |
| `unavailable` | No hay disponible suficiente en alguna línea. | `[{variant_id, branch_id, requested, available}]` | «Solo quedan N unidades de X en <sucursal>.» Ajusta la cantidad (o quita si `available` = 0) y deja reenviar. |

Tras `not_found` o `unavailable`, el comprador corrige y reenvía con un `request_id` **nuevo**
(cambió el carrito).

Cualquier **excepción** de Postgres (red, timeout, error inesperado) → mensaje genérico
«No pudimos enviar tu solicitud, intenta de nuevo» y reintento con el **mismo** `request_id`.

---

## 12. Después de la solicitud

### 12.1 Confirmación

Muestra:

- el número (`W-000123`), grande;
- los grupos por sucursal con sus líneas, subtotales y el total (montos del ERP);
- el texto: «Tu solicitud está en revisión. La tienda te escribirá por WhatsApp al <teléfono> para
  confirmar y coordinar el pago y la entrega. Los productos quedan apartados hasta las <hora de
  soft_expires_at en America/Caracas> mientras la revisamos.»;
- si hay **más de un grupo**: «Tu pedido sale de N tiendas: serán N facturas y N envíos.»;
- opcional: botón para escribir a `store_whatsapp` con el número de solicitud.

Vacía el carrito. Para que la confirmación sobreviva a recargar la página, guarda la respuesta en
`sessionStorage`; no hay una consulta de estado por número (vendrá después, §17).

### 12.2 Correo de confirmación

Si dejó correo, envíalo desde **un único punto**: `notifySolicitudRecibida(order, customer)`.
Contenido: número, líneas por sucursal, total, el mismo texto de la confirmación y los datos de
contacto de la tienda. Si el envío falla, regístralo y sigue: la solicitud ya existe.
Hoy envía correo; cuando el negocio active la API de WhatsApp (Meta), ahí mismo se añadirá el
envío por WhatsApp, sin tocar el resto.

### 12.3 Lo que pasa en el ERP (para que la tienda sepa qué prometer)

| Estado | Qué significa | Stock |
|---|---|---|
| `solicitada` | Recién creada; el personal la revisa. | Apartado corto (30 min). Si vence, se libera solo. |
| `aceptada` | El personal la confirmó (puede haber cambiado sucursal o reducido cantidades) y escribe al comprador para cobrar. | Apartado firme (24 h), extensible. |
| `completada` | Todas sus sucursales se cobraron y se convirtieron en venta. | Descontado por la venta. |
| `rechazada` / `cancelada` | No sigue. | Liberado. |

El comprador se entera de todo por WhatsApp; la tienda web no muestra estos cambios en la fase 1.

---

## 13. Caché y frescura

| Dato | Estrategia sugerida |
|---|---|
| `store_settings`, `categories`, `brands`, `color_families`, `option_values`, `branches` | Caché 10–15 min (`unstable_cache`/`revalidate`). |
| `products`, `variants` (listados y fichas) | ISR 5 min. |
| `availability` | 30–60 s, o sin caché en la ficha y en el carrito. |
| Tasa BCV | 1 h. |
| Checkout | Nunca en caché. |

Un producto que deja de estar publicado desaparece en la siguiente revalidación; la ficha debe
responder 404 si la consulta no devuelve fila.

---

## 14. Seguridad web de la tienda (lista mínima)

- [ ] `ERP_DATABASE_URL` solo en el servidor (`import "server-only"` en `lib/erp.ts`); nunca con
      prefijo `NEXT_PUBLIC_`.
- [ ] Turnstile verificado en el servidor + límite por IP en el checkout.
- [ ] Cabeceras: `Content-Security-Policy` (imágenes de `<ref>.supabase.co`, script e iframe de
      `challenges.cloudflare.com`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
      `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`.
- [ ] Consultas siempre parametrizadas.
- [ ] No registrar (logs) teléfonos ni correos completos.
- [ ] Mensajes de error genéricos al comprador; detalle solo en logs del servidor.
- [ ] El checkout solo acepta `POST` desde tu propio origen (las Server Actions ya lo comprueban;
      en un Route Handler, valida `Origin`).

---

## 15. Pruebas

### 15.1 Prueba de humo de la conexión

```sql
select company_name from shop.store_settings;   -- 1 fila
select count(*) from shop.products;             -- > 0 si hay productos completos
select count(*) from shop.branches;             -- > 0 cuando haya sucursales con «Vende online»
select * from wm.products limit 1;              -- debe fallar: permission denied
```

### 15.2 Prueba de punta a punta

Contra producción, cada solicitud de prueba **aparta stock real** durante el apartado corto. Usa
1 unidad, avisa al personal y pídele que la **rechace** al terminar.

1. Crear una solicitud de 1 unidad desde la tienda.
2. En el ERP: aparece en «Pedidos online» (contador del menú y aviso en pantalla en hasta
   un minuto) y el POS de esa sucursal muestra la unidad como apartada.
3. En la tienda: la disponibilidad de esa variante en esa sucursal bajó en 1.
4. Repetir el envío con el mismo `request_id`: devuelve el mismo número, sin apartar dos veces.
5. Rechazar en el ERP: la disponibilidad vuelve.

### 15.3 Pruebas automáticas sugeridas en la tienda

- Normalización de teléfono y cédula (tabla de casos de §11.1).
- Armado del payload: líneas repetidas se suman; nunca se mandan precios.
- Agrupado del carrito por sucursal y aviso de varias sucursales.
- Manejo de cada `code` de error (§11.5).

---

## 16. Errores comunes

| Síntoma | Causa | Solución |
|---|---|---|
| `password authentication failed for user "storefront"` | Contraseña no fijada o mal codificada en la URL. | Pedir al administrador que la fije (§0.1); usar `encodeURIComponent`. |
| `Tenant or user not found` | Usuario sin sufijo del proyecto. | Usuario `storefront.<ref>`. |
| `prepared statement "…" already exists` / `does not exist` | Sentencias preparadas con el pooler en modo transacción. | `prepare: false`. |
| `permission denied for schema wm` / `for table …` | Consulta fuera de `shop`. | Solo vistas `shop.*`. Es lo esperado. |
| `canceling statement due to statement timeout` | Consulta de más de 5 s. | Filtrar y paginar; no traer todo el catálogo de una vez. |
| `shop.products` vacío | Ningún producto cumple los requisitos de §4.1 (categoría, marca, descripción, atributos, variantes, estado y visibilidad). Las fotos no bloquean. | Completar los requisitos en el ERP; usar «Incompletos» para ver pendientes. |
| Productos visibles pero todos agotados | Ninguna sucursal con «Vende online», o sin stock. | Activar sucursales en el ERP (§0.1). |
| Precios como texto (`"31.25"`) | `numeric` llega como string. | `Number(...)` al mostrar. |
| `remaining connection slots are reserved` / demasiadas conexiones | `max` alto en muchas instancias. | Bajar `max`; el rol admite 20 conexiones. |

---

## 17. Lo que vendrá después (no lo construyas aún)

- Envío automático de WhatsApp (API de Meta) desde `notifySolicitudRecibida`.
- Consulta del estado de una solicitud por número + teléfono.
- Pago en línea.
- Revalidación de la caché de la tienda por aviso del ERP.

Si se necesitan, se añadirán aquí como nuevas funciones o vistas del esquema `shop`.
