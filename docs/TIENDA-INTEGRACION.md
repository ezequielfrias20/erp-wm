# Integración de la tienda online con el ERP

Guía para quien construye la tienda web (ecommerce) de un negocio que usa este ERP. Explica
cómo conectarse, qué datos hay, cómo leer el catálogo completo (productos, variantes, fotos,
precios, disponibilidad por sucursal) y cómo registrar una **solicitud de compra**.

> Diseño de origen: `docs/superpowers/specs/2026-11-18-ecommerce-catalogo-pedidos-online-design.md`.
> Este documento es el **contrato**: si el ERP cambia algo de lo que aquí se describe, este
> archivo se actualiza en el mismo cambio.

---

## 1. Qué hace la tienda y qué no

| La tienda SÍ | La tienda NO |
|---|---|
| Lee el catálogo publicado y la disponibilidad por sucursal. | Lee costos, proveedores, ventas, clientes, usuarios o datos fiscales. |
| Crea **solicitudes** de compra (con apartado temporal de stock). | Cobra. El cobro lo hace la tienda física por WhatsApp. |
| Muestra fotos desde la URL pública del bucket. | Sube, cambia o borra fotos o productos. |
| Muestra precios en USD y su equivalente en VES (tasa BCV). | Decide precios: el precio siempre lo pone el ERP. |

Flujo completo:

```
Comprador arma carrito (elige sucursal por producto)
   → checkout (nombre, teléfono, correo opcional, cédula opcional, nota)
   → la tienda llama shop.crear_solicitud(...)
        → el ERP valida, congela precios y APARTA el stock por poco tiempo (30 min por defecto)
   → pantalla de confirmación con número W-000123 (+ correo si lo dejó)
   → el personal ve la solicitud en ERP → «Pedidos online», la acepta (apartado firme, 24 h)
     y le escribe al comprador por WhatsApp para cobrar
   → al cobrar, el personal la convierte en venta en el POS (una venta por sucursal)
```

La tienda **solo** interviene hasta la confirmación. Todo lo posterior ocurre en el ERP.

---

## 2. Modelo de seguridad (léelo antes de escribir código)

1. **Acceso solo desde el servidor de la tienda.** Server Components, Route Handlers o Server
   Actions. El navegador del comprador nunca recibe credenciales ni la URL de la base de datos.
   Nada de `@supabase/supabase-js` en el cliente.
2. **Rol de base de datos `storefront`.** Es la única credencial que usa la tienda. Puede:
   - `SELECT` sobre las vistas del esquema `shop`.
   - `EXECUTE` sobre `shop.crear_solicitud`.
   - No puede leer datos de `public`, `auth`, `storage` ni `wm`: no tiene permisos sobre sus
     tablas o vistas ni puede ejecutar funciones privilegiadas accesibles fuera de `shop`.
     Como cualquier rol de PostgreSQL, puede ver el esquema `public` y crear tablas temporales
     en su propia sesión; eso no expone datos del ERP. Si intentas leer esas tablas, recibirás
     `permission denied`: es lo esperado.
3. **No uses** la `service_role`, la anon key ni ninguna credencial del ERP. Si alguien te las
   ofrece, recházalas.
4. **El esquema `shop` no está en la API REST** (PostgREST). Se accede por conexión Postgres.
5. **Anti-abuso obligatorio** en el checkout (ver §8): Cloudflare Turnstile verificado en el
   servidor y límite por IP. Una solicitud aparta stock; sin estas defensas, alguien podría
   bloquear el inventario con solicitudes falsas.
6. **Límite de tiempo por consulta**: el rol tiene `statement_timeout = 5s`. Diseña consultas
   que filtren y paginen.

---

## 3. Conexión

### 3.1 Variables de entorno de la tienda

| Variable | Ejemplo / valor | Uso |
|---|---|---|
| `ERP_DATABASE_URL` | `postgresql://storefront.<ref>:<password>@aws-1-us-west-2.pooler.supabase.com:6543/postgres` | Conexión del rol `storefront` (pooler en **modo transacción**, puerto **6543**). |
| `ERP_MEDIA_BASE_URL` | `https://<ref>.supabase.co/storage/v1/object/public/wm-public` | Base pública de las fotos (§6). |
| `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | — | Anti-bots del checkout. |
| `BCV_API_URL` | la misma fuente que usa el ERP (`NEXT_PUBLIC_BCV_API`) | Tasa USD→VES. |
| Correo (p. ej. `RESEND_API_KEY`, `MAIL_FROM`) | — | Correo de confirmación opcional. |

Para World Medics, `<ref>` = `cfggippjujceebovvhsa`. Cada negocio tiene su propio proyecto y su
propio `<ref>`; la tienda no lleva nada del negocio en el código (marca y textos salen de
`shop.store_settings`).

La contraseña del rol `storefront` la fija el administrador del ERP
(`alter role storefront password '...'`) y te la entrega por un canal seguro. Contiene
caracteres especiales: **codifícala** en la URL (`encodeURIComponent`) o pasa los parámetros por
separado.

### 3.2 Cliente SQL recomendado

[`postgres`](https://github.com/porsager/postgres) (porsager). Con el pooler en modo transacción
**no** se pueden usar sentencias preparadas:

```ts
// lib/erp.ts  (solo servidor)
import "server-only";
import postgres from "postgres";

export const erp = postgres(process.env.ERP_DATABASE_URL!, {
  prepare: false,      // obligatorio con el pooler en modo transacción (6543)
  max: 5,              // conexiones por instancia; serverless → bajo
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: "require",
});
```

Siempre usa parámetros (`${valor}` en el template de `postgres`), nunca concatenes texto.

---

## 4. Datos de catálogo (esquema `shop`)

Reglas que ya vienen aplicadas por el ERP (no tienes que repetirlas):

- Solo salen productos **activos**, marcados **visibles en catálogo** y **listos para tienda**
  (categoría de segundo nivel, marca, descripción, características obligatorias, fotos por color y
  precio > 0). Un producto incompleto simplemente no aparece.
- Solo salen productos cuya categoría, departamento y marca estén activos.
- Solo salen variantes activas con precio > 0.
- Solo salen sucursales activas habilitadas para venta online.
- La disponibilidad ya descuenta los apartados vigentes de otras solicitudes y viene **con tope**
  (ver `store_settings.display_stock_cap`, 10 por defecto): `available = 10` significa «10 o más».

Todos los precios están en **USD con IVA incluido** (`numeric`, 2 decimales). El cliente
`postgres` devuelve `numeric` como **string**: conviértelo con `Number(...)` al presentarlo.

### 4.1 `shop.store_settings` (1 fila)

| Columna | Tipo | Notas |
|---|---|---|
| `company_name` | text | Nombre comercial. |
| `logo_url`, `logo_dark_url`, `favicon_url` | text, null | URLs absolutas (ya públicas). |
| `primary_color`, `accent_color` | text | Hex (`#0EA5E9`). |
| `store_whatsapp` | text, null | Número de la tienda en E.164 (`+58…`), por si quieres mostrarlo. |
| `soft_hold_minutes` | int | Duración del apartado de una solicitud (30). |
| `max_units_per_line` | int | Máx. unidades por línea (10). |
| `max_units_per_order` | int | Máx. unidades por solicitud (30). |
| `max_lines` | int | Máx. líneas por solicitud (20). |
| `max_open_per_phone` | int | Máx. solicitudes vigentes por teléfono (2). |
| `display_stock_cap` | int | Tope de disponibilidad mostrada (10). |

### 4.2 `shop.branches` (sucursales que venden online)

| Columna | Tipo |
|---|---|
| `branch_id` | uuid |
| `code` | text |
| `name` | text |
| `city` | text |
| `address` | text, null |
| `phone` | text, null |

### 4.3 `shop.categories` (árbol de 2 niveles)

| Columna | Tipo | Notas |
|---|---|---|
| `category_id` | uuid | |
| `parent_id` | uuid, null | `null` = **departamento** (nivel 1). |
| `level` | int | 1 = departamento, 2 = categoría. |
| `name`, `slug` | text | `slug` estable: úsalo en URLs. |
| `sort_order` | int | |
| `product_count` | int | Productos publicados (departamento: suma de sus categorías). |

Solo se listan categorías con al menos un producto publicado (y sus departamentos).

### 4.4 `shop.brands`

| Columna | Tipo | Notas |
|---|---|---|
| `brand_id` | uuid | |
| `name`, `slug` | text | |
| `logo_url` | text, null | |
| `description` | text, null | |
| `lines` | jsonb | `[{ "line_id", "name", "slug" }]`, solo líneas con productos publicados. |
| `product_count` | int | |

### 4.5 `shop.color_families` y `shop.option_values` (para filtros)

`shop.color_families`: `family_id`, `name`, `slug`, `hex`, `sort_order`.

`shop.option_values`: `option_type_code` (p. ej. `talla`), `option_type_name`, `option_value_id`,
`label` (p. ej. `M`), `slug`, `sort_order`. Ordena las tallas por `sort_order`, no alfabéticamente.

### 4.6 `shop.products` (una fila por producto)

| Columna | Tipo | Notas |
|---|---|---|
| `product_id` | uuid | |
| `slug` | text | Para la URL de la ficha. Único. |
| `name` | text | |
| `description` | text | |
| `specs` | jsonb | Ficha técnica: `[{ "label": "Tela", "value": "Poliéster 72%…" }]`. |
| `brand_id`, `brand_name`, `brand_slug` | | |
| `line_id`, `line_name`, `line_slug` | | null si no tiene línea. |
| `department_id`, `department_name`, `department_slug` | | |
| `category_id`, `category_name`, `category_slug` | | |
| `option_type_code`, `option_type_name` | text, null | Eje de variante de la categoría (p. ej. `talla`/`Talla`). |
| `attributes` | jsonb | `[{ "code": "genero", "attribute": "Género", "values": ["Dama"] }]`. |
| `general_photos` | jsonb | Rutas de fotos generales en orden: `["product-images/<id>/<media>.webp", …]`. |
| `main_photo` | text, null | Ruta de la foto principal (ya resuelta por el ERP). |
| `price_min`, `price_max` | numeric | Rango de precio de sus variantes publicadas. |
| `in_stock` | boolean | Alguna variante con disponibilidad > 0 en alguna sucursal online. |
| `updated_at` | timestamptz | Último cambio del producto. |

### 4.7 `shop.variants` (una fila por variante publicada)

| Columna | Tipo | Notas |
|---|---|---|
| `variant_id` | uuid | **Lo que mandas al crear la solicitud.** |
| `product_id` | uuid | |
| `sku` | text | |
| `price` | numeric | USD, IVA incluido. |
| `color_id`, `color_name`, `color_slug`, `color_hex` | | null si la categoría no usa color. |
| `color_family_name`, `color_family_slug` | | |
| `color_sort` | int | Orden de los colores en la ficha. |
| `option_value_id`, `option_label`, `option_slug`, `option_sort` | | null si la categoría no usa opción. |
| `color_photos` | jsonb | Rutas de fotos de ese color, en orden. |
| `available_total` | int | Suma de `shop.availability` de la variante (con tope). |

### 4.8 `shop.availability` (variante × sucursal)

| Columna | Tipo | Notas |
|---|---|---|
| `variant_id` | uuid | |
| `branch_id` | uuid | |
| `available` | int | > 0 siempre (las filas sin stock no aparecen). Con tope. |

Esta es la vista que más cambia (cada venta en tienda y cada solicitud la mueve). Léela fresca.

---

## 5. Consultas de ejemplo

```ts
// Menú: departamentos con sus categorías
const cats = await erp`
  select category_id, parent_id, level, name, slug, product_count
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
    and (${onlyInStock} = false or p.in_stock)
  order by p.name
  limit ${pageSize} offset ${(pageNumber - 1) * pageSize}`;

// Ficha de producto
const [product] = await erp`select * from shop.products where slug = ${slug}`;
const variants = await erp`
  select * from shop.variants where product_id = ${product.product_id}
  order by color_sort nulls last, option_sort nulls last`;
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
```

Con 30 o más ids, `any(...::uuid[])` está bien (un solo parámetro de tipo arreglo).

---

## 6. Fotos

- Las vistas devuelven **rutas** dentro del bucket público `wm-public`
  (p. ej. `product-images/7f3c…/a12b….webp`; algunas antiguas son `product-images/<id>.png`).
- URL pública: `${ERP_MEDIA_BASE_URL}/${ruta}`.
- Ficha: al elegir un color, muestra `variants.color_photos` de ese color; si está vacío, usa
  `products.general_photos`. Listados: `products.main_photo`.
- Con `next/image`, agrega el host de Supabase a `images.remotePatterns`. Opcional: usa las
  transformaciones de Supabase (`/storage/v1/render/image/public/wm-public/<ruta>?width=600`)
  si el plan del proyecto las incluye.
- El bucket no se puede **listar** desde fuera; solo se accede por ruta conocida.

---

## 7. Precios y moneda

- `price` está en USD con IVA incluido. Muestra USD como precio principal.
- Equivalente en bolívares: `price × tasa BCV`, redondeado a 2 decimales. Usa la misma fuente que
  el ERP (`NEXT_PUBLIC_BCV_API`, cacheada 1 h). Si la tasa falla, muestra solo USD.
- El total que ve el comprador en el carrito es **informativo**: el ERP recalcula y **congela** los
  precios al crear la solicitud y devuelve el total oficial. Muestra el que devuelve el ERP en la
  confirmación.

---

## 8. Crear una solicitud: `shop.crear_solicitud`

### 8.1 Antes de llamar (en el servidor de la tienda)

1. Verifica el token de **Cloudflare Turnstile** con `TURNSTILE_SECRET_KEY`. Si falla, no llames.
2. **Límite por IP**: p. ej. 5 solicitudes por IP cada 10 minutos (Vercel KV, Upstash o similar).
3. **Normaliza el teléfono** a E.164. Para Venezuela:
   - `0414-123.45.67`, `04141234567`, `4141234567`, `+58 414 1234567` → `+584141234567`.
   - Regla: quitar todo lo que no sea dígito o `+`; si empieza con `0`, quitar el `0` y anteponer
     `+58`; si empieza con `58` sin `+`, anteponer `+`; si tiene 10 dígitos que empiezan por `4`,
     anteponer `+58`. El resultado debe cumplir `^\+[1-9][0-9]{7,14}$`.
4. Valida forma: nombre 2–120 caracteres, correo válido si viene, cédula `^[VEJPG]-?\d{5,10}$`
   (opcional), nota ≤ 500 caracteres, líneas no vacías, cantidades enteras ≥ 1.
5. Genera un `request_id` (UUID v4) **por intento de checkout** y reutilízalo si reintentas la
   misma petición (evita solicitudes duplicadas).

### 8.2 Llamada

```ts
const [{ result }] = await erp`
  select shop.crear_solicitud(${erp.json(payload)}) as result`;
```

**Entrada** (`jsonb`):

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

- `email`, `document`, `notes`, `source_ip` son opcionales (`null` o ausentes).
- Una misma `variant_id` + `branch_id` no debe repetirse: suma las cantidades en una línea.
- **No mandes precios.** Si los mandas, se ignoran.

**Salida correcta**:

```json
{
  "ok": true,
  "order": {
    "order_id": "…",
    "number": "W-000123",
    "status": "solicitada",
    "soft_expires_at": "2026-11-20T15:30:00Z",
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

Si repites la llamada con el mismo `request_id`, recibes la misma solicitud (`ok: true`), sin
crear otra ni apartar dos veces.

**Salida con error de negocio** (no es excepción; `ok: false`):

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

| `code` | Cuándo | Qué hacer en la tienda |
|---|---|---|
| `invalid_input` | Falta un dato o tiene mal formato (teléfono no E.164, cantidad < 1, línea repetida). | Error del formulario; revisa tu validación. |
| `too_many_lines` | Más de `max_lines` líneas. | Pide dividir el pedido. |
| `too_many_units` | Una línea > `max_units_per_line` o el total > `max_units_per_order`. | Ajusta cantidades; para mayoristas, contacto directo. |
| `too_many_open_requests` | El teléfono ya tiene `max_open_per_phone` solicitudes vigentes (2). | «Ya tienes solicitudes en revisión; te escribiremos por WhatsApp». |
| `not_found` | Variante no publicada o sucursal no habilitada. | Refresca el carrito; quita la línea. |
| `unavailable` | No hay disponible suficiente en alguna línea (`lines` trae el detalle). | Muestra el disponible real y deja ajustar. |

Cualquier **excepción** de Postgres (red, timeout, error inesperado) → mensaje genérico
«No pudimos enviar tu solicitud, intenta de nuevo» y reintento con el **mismo** `request_id`.

### 8.3 Después de crearla

- Muestra la confirmación con: número (`W-000123`), grupos por sucursal, total, y el texto:
  «Tu solicitud está en revisión. La tienda te escribirá por WhatsApp al <teléfono> para confirmar
  y coordinar el pago. Los productos quedan apartados hasta las <hora local de soft_expires_at>
  mientras la tienda la revisa».
- Si el pedido tiene **más de un grupo**, repite el aviso: «Tu pedido sale de N tiendas: serán
  N facturas y N envíos».
- Correo de confirmación (si dejó correo) desde **un único punto**:
  `notifySolicitudRecibida(order, customer)`. Hoy envía correo; cuando el negocio active la API de
  WhatsApp (Meta), ahí mismo se añadirá el envío por WhatsApp, sin tocar el resto.
- Vacía el carrito.

---

## 9. Carrito y sucursales (reglas de UI)

- En la ficha, el comprador elige color → opción (talla) → **sucursal** (de las que tienen
  `available > 0` para esa variante) → cantidad (máx. `min(available, max_units_per_line)`).
- El carrito vive en el navegador (localStorage), con `variant_id`, `branch_id`, `quantity`.
- El carrito se muestra **agrupado por sucursal**. Si hay más de una sucursal, aviso visible:
  «Este pedido sale de N tiendas: serán N facturas y N envíos».
- Al abrir el carrito y antes de enviar, **revalida** contra `shop.variants`/`shop.availability`:
  quita líneas que ya no existen y ajusta cantidades al disponible.

---

## 10. Caché y frescura

| Dato | Estrategia sugerida |
|---|---|
| `store_settings`, `categories`, `brands`, `color_families`, `option_values`, `branches` | Caché 10–15 min (`unstable_cache`/`revalidate`). |
| `products`, `variants` (listados y fichas) | ISR 5 min. |
| `availability` | 30–60 s, o sin caché en la ficha y en el carrito. |
| Checkout | Nunca en caché. |

Con el modelo de apartados, la verdad final siempre la da `crear_solicitud`: aunque la página
muestre disponibilidad vieja, el ERP nunca aparta más de lo que hay.

---

## 11. Seguridad web de la tienda (lista mínima)

- [ ] `ERP_DATABASE_URL` solo en el servidor (`import "server-only"` en `lib/erp.ts`).
- [ ] Turnstile verificado en el servidor + límite por IP en el checkout.
- [ ] Cabeceras: `Content-Security-Policy` (imágenes de `*.supabase.co`, script de Turnstile),
      `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`.
- [ ] Consultas siempre parametrizadas.
- [ ] No registrar (logs) teléfonos ni correos completos.
- [ ] Mensajes de error genéricos al comprador; detalle solo en logs del servidor.

---

## 12. Cómo probar contra el ERP

1. Pide al administrador del ERP: contraseña de `storefront`, y que active al menos una sucursal
   para venta online (ERP → Pedidos online → Configuración, o `branches.online_enabled`).
2. Verifica el acceso:
   ```sql
   select count(*) from shop.products;          -- > 0
   select * from wm.products limit 1;           -- debe fallar: permission denied
   ```
3. Crea una solicitud de prueba con 1 unidad y comprueba en el ERP que aparece en
   «Pedidos online» y que el POS de esa sucursal muestra la unidad como apartada.
4. Pide al personal que la **rechace** para liberar el stock (o deja que venza el apartado).

---

## 13. Lo que vendrá después (no lo construyas aún)

- Envío automático de WhatsApp (API de Meta) desde `notifySolicitudRecibida`.
- Consulta del estado de una solicitud por número + teléfono.
- Pago en línea.

Si los necesitas, se añadirán aquí como nuevas funciones/vistas del esquema `shop`.
