# World Medics ERP — guía del proyecto (CLAUDE.md)

ERP de uniformes médicos (Venezuela), multi-sucursal, en español (es-VE). Implementa el
handoff de diseño `World Medics ERP.dc.html` (claude.ai/design) **tal cual**.

> Documento vivo. Al cerrar cada módulo, actualizar también `docs/PROGRESS.md`.

## Stack
- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (componentes en `components/ui/`)
- **Recharts** (gráficos, vía wrapper `components/ui/chart.tsx`)
- **lucide-react** (iconos), **next-themes** (claro/oscuro), **sonner** (toasts)
- **Supabase** (`@supabase/ssr`) — Auth + Postgres
- **ExcelJS** — plantillas de carga masiva (con listas desplegables), importar y exportar `.xlsx` (`lib/excel.ts`).
- **@react-pdf/renderer** — reportes en PDF con membrete (`components/reportes/report-pdf.tsx`).

## Supabase
- **Producción WM**: ref **`cfggippjujceebovvhsa`** · us-west-2 (bloque "DATOS PRODUCCION WM" de
  `.env.local`). El proyecto original `crm_cubo_labs` (`yxwedegszxtujplffaac`) ya **no** tiene el
  esquema `wm`; no usarlo para el ERP.
- **psql a producción**: el host directo `db.<ref>.supabase.co` sólo tiene IPv6 y no resuelve
  aquí. Usar el pooler en sesión `aws-1-us-west-2.pooler.supabase.com:5432`, usuario
  `postgres.cfggippjujceebovvhsa`, y pasar la contraseña por `PGPASSWORD` (tiene caracteres que
  rompen una URL). Las migraciones son los `.sql` idempotentes de `supabase/` (`psql -1 -f` o
  `apply_pending.sh`); producción no tiene `supabase_migrations.schema_migrations`.
- Todas las tablas del ERP viven en el esquema **`wm`** (aislado del CRM en `public`).
  El esquema está expuesto a PostgREST vía `ALTER ROLE authenticator SET pgrst.db_schemas`.
- Clientes en `lib/supabase/{client,server,middleware}.ts`, todos con `db: { schema: "wm" }`.
- Tipos del esquema escritos a mano en `lib/database.types.ts` (el generador del MCP solo
  emite `public`). Mantener en sync al cambiar el esquema.
- Variables de entorno (`.env.local`, NO commiteado):
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_BCV_API`.
- **`SUPABASE_AUTH_JWKS`** (opcional, muy recomendada en producción): el JSON del
  JWKS del proyecto (`/auth/v1/.well-known/jwks.json`, o Supabase → Settings → API →
  JWT Keys). Precargarlo elimina por completo el viaje de red que hace `getClaims()`
  para verificar la firma del JWT. Ver `docs/RENDIMIENTO.md § Verificación de sesión`.

### Migraciones aplicadas (vía MCP `apply_migration`, en orden)
1. `wm_schema_exposure_grants` — esquema, exposición PostgREST, grants, `set_updated_at`, secuencias y `next_invoice/next_po`.
2. `wm_core_tables` — todas las tablas + índices + triggers updated_at.
3. `wm_functions_and_rls` — `is_member`, `my_role`, `my_profile_id`, `has_module`; RLS por módulo.
4. `wm_seed_master`, `wm_seed_profiles`, `wm_seed_catalog`, `wm_seed_sales` — datos del handoff.
5. `wm_harden_function_search_path` — fija search_path de funciones.
6. `wm_payment_methods_currency` — añade `currency` (`USD|VES`) y `requires_reference` a `payment_methods`; siembra `Zelle` y `Binance` (USD, con referencia); marca Pago Móvil/Transferencia con referencia; `Mixto` queda como meta-método (sort_order 99).
7. `wm_sale_payments` — tabla `wm.sale_payments` (pagos por venta: método, moneda, monto nativo, `amount_usd`, referencia) + RLS + índices.
8. `wm_create_sale_v2` — redefine `wm.create_sale` para recibir `p_payments jsonb` (array de pagos) en vez de `p_payment_method`; inserta en `sale_payments`, guarda `payment_method='Mixto'` si hay >1 pago.
9. `wm_payment_methods_is_financed` — añade `is_financed` a `payment_methods` (true = financiamiento/por cobrar, no efectivo en caja) y siembra el método **Cashea** (USD, con referencia, `is_financed`, sort_order 98).
10. `wm_cashea_orders` — tabla `wm.cashea_orders` (cuenta por cobrar a Cashea, 1:1 con la venta: referencia, total, inicial, financiado, comisión, neto, estado `pendiente|cobrada|anulada`, conciliación) + índices + trigger `set_updated_at`.
11. `wm_cashea_orders_rls` — RLS: lectura miembros; insert `has_module('Ventas',2)`; update (conciliar) `has_module('Reportes',2)`.
12. `wm_create_sale_v3` — añade `p_cashea jsonb` (opcional) a `create_sale`; cuando viene, inserta la fila `cashea_orders` en la misma transacción (la inicial + la línea `Cashea` van en `sale_payments`).
13. `wm_cashea_void_on_sale_status` — trigger en `wm.sales` que pone `cashea_orders.status='anulada'` si la venta pasa a Reembolso/Anulada.
14. `wm_cashea_orders_channel` — añade `channel` (`tienda|online`, default `tienda`) a `cashea_orders` para distinguir ventas en sucursal del marketplace (comisiones distintas) + índice.
15. `wm_create_sale_v4` — `create_sale` persiste el `channel` Cashea desde `p_cashea`.
16. `wm_branding_fn` — función `wm.branding()` (`SECURITY DEFINER`, search_path fijo, `stable`) que
    expone **solo** los campos de marca de `settings` (company_name, logo_url, favicon_url,
    primary_color, accent_color) al login no autenticado; `grant execute` a `anon`/`authenticated`
    (+ `usage` del esquema `wm` a `anon`). Evita exponer datos fiscales del resto de `settings`.
17. `wm_settings_logo_dark` — añade `settings.logo_dark_url` (logo para tema oscuro) y recrea
    `wm.branding()` para devolverlo (anon-safe).
18. `wm_storage_brand_delete` → revertida por `wm_drop_redundant_brand_delete_policy`: resultó
    redundante. El borrado de objetos en `wm-public` por `authenticated` ya existía (policy
    `wm_authenticated_delete` del bootstrap, ya en `01_schema.sql`), que es lo que usa
    `removeBrandAsset` para borrar logo/favicon. El borrado real se gatea en la app por permisos
    de módulo. No cambia el snapshot.
19. `catalog_taxonomy` (`supabase/catalog_taxonomy.sql`, aplicada con psql el 2026-11-13) — catálogo
    clasificado para ecommerce, ADITIVA: tablas `option_types`/`option_values` (2.º eje de variante:
    talla, amarre), `color_families`, `product_lines` (línea/modelo por marca), `attributes`,
    `attribute_values`, `category_attributes`, `product_attribute_values`, `product_media` (fotos por
    producto y color), `variant_sku_aliases`, `catalog_migration_log`; columnas nulas nuevas en
    `categories` (`parent_id`, `option_type_id`, `requires_color`), `brands` (`slug`, `logo_url`,
    `description`), `colors` (`slug`, `family_id`, `swatch_url`, `is_active`), `products` (`slug`,
    `line_id`, `specs`) y `product_variants` (`color_id`, `option_value_id`); RLS + seeds genéricos.
    Ya plegada en `bootstrap/01_schema.sql` + `02_seed.sql` y en `apply_pending.sh` (negocios nuevos
    y negocios existentes). Prueba con rollback: `supabase/tests/catalog_taxonomy_rollback.sql`.
20. Tienda online fase 1 — pedidos, apartados, venta vinculada, vistas `shop`, rol `storefront`
    y cierre del listado público de storage: `online_orders.sql`, `online_orders_sale.sql`,
    `online_orders_staff.sql`, `v_inventory_online_held.sql`, `shop_schema.sql`,
    `shop_crear_solicitud.sql`, `storage_no_public_list.sql`, `storage_wm_public_write.sql`
    (todos en `supabase/`, en ese orden). Los ajustes de publicación sin fotos y alcance por
    sucursal están en `shop_schema.sql` y `online_orders_staff.sql`.
    Se pliegan en bootstrap y `apply_pending.sh`; **aplicar antes de desplegar la app** porque
    el POS lee `v_inventory.online_held`. En producción, aplicar los ocho archivos en **una
    sola transacción** durante una ventana de poco tráfico y antes del despliegue, con el cliente
    `psql` 15+ y el pooler en modo sesión (5432):
    ```bash
    psql -h aws-1-us-west-2.pooler.supabase.com -p 5432 \
      -U postgres.cfggippjujceebovvhsa -d postgres \
      -X -1 -v ON_ERROR_STOP=1 -c "set lock_timeout = '5s'" \
      -f supabase/online_orders.sql -f supabase/online_orders_sale.sql \
      -f supabase/online_orders_staff.sql -f supabase/v_inventory_online_held.sql \
      -f supabase/shop_schema.sql -f supabase/shop_crear_solicitud.sql \
      -f supabase/storage_no_public_list.sql \
      -f supabase/storage_wm_public_write.sql
    ```
    `apply_pending.sh` agrupa los archivos de tienda de forma atómica en dos transacciones por
    sus dependencias con las migraciones previas. Los siete scripts originales se aplicaron en
    producción el 2026-11-19; estos ajustes siguen pendientes (ver `docs/PROGRESS.md`).
Bootstrap del admin (login) se hizo con `execute_sql` (crea `auth.users` + `auth.identities`).

### Modelo RLS
- Acceso **solo** a usuarios con fila en `wm.profiles` (`status='Activo'`) cuyo `user_id = auth.uid()`.
  Esto aísla del CRM (que comparte `auth.users`).
- Lectura (`select`): cualquier miembro activo. Escritura: `wm.has_module('<Módulo>', 2)`
  según la matriz `wm.role_permissions` (tomada del handoff). `profiles` permite además
  que cada quien edite su propia fila.
- Helpers (SECURITY DEFINER): `wm.is_member()`, `wm.my_role()`, `wm.my_profile_id()`, `wm.has_module(module, min)`.

### Credenciales
- **Nunca** se escriben correos de acceso ni contraseñas en el repo (ni en docs ni en CLAUDE.md).
  El repo es **público**. Barreras automáticas (hook antes del commit, gitleaks en Actions, push
  protection): ver `docs/SEGURIDAD-REPO.md`. Nunca saltarlas con `--no-verify`.
  Cada administrador entra con su propia cuenta; las credenciales viven en el gestor de
  contraseñas y los secretos en `.env*` (ignorados por git).
- El admin sembrado del handoff (`pedro.salas@…`) sólo existió en el proyecto viejo; en
  producción no hay cuenta con ese correo (comprobado 2026-11-21).
- El personal se da de alta por invitación (Usuarios → Invitar). Registro público deshabilitado.

## Tablas (esquema `wm`)
branches, categories, brands, sizes, colors, suppliers, products, product_variants,
inventory, profiles, customers, customer_events, sales, sale_items, **sale_payments**,
**cashea_orders**, purchase_orders, purchase_order_items, roles, role_permissions,
payment_methods, exchange_rates, audit_log, settings, y las del catálogo clasificado: option_types,
option_values, color_families, product_lines, attributes, attribute_values, category_attributes,
product_attribute_values, product_media, variant_sku_aliases, catalog_migration_log,
online_orders, online_order_items, online_settings, **heartbeat** (keep-alive).
(Detalle de campos en `lib/database.types.ts`.)
- `payment_methods` lleva `currency` (`USD|VES`), `requires_reference` e `is_financed`. Métodos VES
  (Efectivo VES, Pago Móvil, Transferencia, Tarjeta débito/crédito) se cobran en bolívares;
  métodos USD (Efectivo USD, Zelle, Binance) en dólares. `Mixto` es meta-método (abre modal).
  `Cashea` (`is_financed`) es meta-método de financiamiento (abre su propio modal en el POS).
- `sale_payments` registra uno o varios pagos por venta con `amount` (moneda nativa),
  `amount_usd` (normalizado) y `reference`. Lo escribe el RPC `create_sale`. Una venta Cashea
  guarda aquí la inicial + una línea `Cashea` por el monto financiado (cuadra la venta).
- `cashea_orders` es el libro de **cuentas por cobrar a Cashea** (1:1 con la venta, en USD):
  referencia, total, inicial cobrada, financiado (por cobrar), comisión, neto, estado
  (`pendiente|cobrada|anulada`), **`channel`** (`tienda|online`) y conciliación. Lo escribe
  `create_sale` (vía `p_cashea`). El canal distingue ventas en sucursal del marketplace (comisión distinta).

## Fidelidad visual (tokens del handoff)
`app/globals.css` mapea los tokens **exactos** del handoff a las variables de shadcn:
fondo `#F8F9FB`/`#0B0F19`, brand/accent `#0EA5E9`/`#38BDF8`, success `#10B981`,
warning `#F59E0B`, danger `#EF4444`, surface-2, text-2/3, sidebar, glass, sombras.
Utilidades extra: `bg-brand`, `text-brand`, `bg-brand-soft`, `text-success`,
`bg-success-soft`, `text-warning`, `bg-warning-soft`, `text-danger`, `bg-danger-soft`,
`bg-surface-2`, `text-text-2`, `text-text-3`, `bg-sidebar`, `.hoverlift`, `.nav-item`,
`.tr-row`, `.iconbtn`, `.lk`, `.fadeup`, `.pop`, `.shadow-card-{sm,md,lg}`. Fuente **Inter**, base 14px.

## Convenciones
- **Tienda online / Pedidos online (fase 1):** el ERP conserva pedidos y apartados; la tienda
  accede solo desde su servidor con el rol `storefront` al esquema `shop`. Contrato para la
  tienda: `docs/TIENDA-INTEGRACION.md`; diseño y plan:
  `docs/superpowers/specs/2026-11-18-ecommerce-catalogo-pedidos-online-design.md` y
  `docs/superpowers/plans/2026-11-18-tienda-fase1-base-erp.md`.
- **Pedidos online (fase 2):** `/pedidos-online` lista solicitudes y `/pedidos-online/[id]`
  muestra grupos por sucursal y permite aceptar, rechazar, extender o cancelar; ver exige
  permiso **Ventas** de lectura y gestionar exige **Ventas** de edición. Los usuarios ligados
  a una sucursal solo ven pedidos con líneas de esa sucursal y no pueden asignar líneas ni
  convertir ventas de otra. La base aplica también ese alcance (`wm.my_branch_scope()` en los
  pedidos y un trigger en `wm.sales` para ventas vinculadas). «Convertir en venta» abre
  `/ventas?pedido=<id>` por grupo:
  una venta por sucursal, con precios congelados del pedido, stock propio apartado sumado al
  disponible y cliente buscado por cédula/teléfono o creado desde el POS. Tras cobrar, el
  aviso de venta registrada enlaza al pedido (`?convertido=…` conserva el aviso al recargar).
  El menú muestra un contador de solicitudes nuevas; `GET /api/pedidos-online/resumen` se
  consulta cada 60 s mientras la app está visible y avisa con un toast cuando llega otra.
  **Configuración → Tienda online** permite editar apartados corto/firme, WhatsApp de la tienda
  y cinco plantillas (permiso **Configuración** de edición); «Vende online» por sucursal exige
  **Sucursales** de edición. La sección se ve con **Configuración** de lectura.
  Para verificar contra Supabase local, ejecutar
  `SUPABASE_LOCAL_DIR=/ruta/al/proyecto scripts/dev-local.sh 3100`: toma URL y claves locales,
  nunca toca la base de producción y deja vacíos los secretos de Resend y webhooks.
- Rutas protegidas bajo `app/(app)/`; auth bajo `app/(auth)/`. `middleware.ts` refresca
  sesión y redirige a `/login`.
- Lectura inicial en Server Components; mutaciones con **Server Actions** en `app/(app)/<modulo>/actions.ts`.
  **Excepción: el cobro del POS** va por Route Handler (`app/api/ventas/checkout/route.ts`), no por
  Server Action. Next las serializa en una cola por router y no deja abortarlas: una petición que se
  cuelga deja `pending` de `useTransition` en `true` para siempre e impide que salgan las acciones
  siguientes —el POS entero se congela hasta recargar—. Con `fetch` + `AbortSignal.timeout` hay plazo
  real, aborto y cola propia. Detalle en `lib/sales/checkout-client.ts`. Un Route Handler no trae la
  comprobación de origen que sí hacen las Server Actions: la pone `lib/same-origin.ts`.
- Acceso a datos por entidad en `lib/queries/<entidad>.ts` (`list/get/create/update/remove`).
- Sucursal activa global vía `context/branch` (cookie + provider); casi todo filtra por ella.
- Moneda: `lib/format.ts` (`fmtUSD`, `fmtVES`, `fmtNum`, `fmtDate`, `initials`, y para
  doble moneda `fmtDual`, `fmtByCurrency`, `usdToVes`, `vesToUsd`).
- Tasa BCV: `app/api/bcv/route.ts` (proxy dolarapi, caché 1 h) + `lib/bcv.ts`.
- **SKU**: `lib/sku.ts` genera `[CAT]-[slug del nombre]-[0001]` (correlativo por prefijo,
  resuelto en servidor). Sólo se autogenera si la variante no trae SKU propio.
- **Carga masiva (Excel)**: `lib/excel.ts` arma plantillas con listas desplegables (categoría,
  marca, talla, color, SKU, sucursal), exporta y lee `.xlsx`. Ver `docs/CARGA-MASIVA.md`.
  Productos: `components/productos/bulk-bar.tsx` + `importProducts/getProductsExport`.
  Inventario: plantilla/importación en `components/inventario/inventario-view.tsx`.
- **POS** (`components/ventas/pos-view.tsx`): cliente por cédula con alta inline
  (`findCustomerByDocument`/`createPosCustomer`), pagos mixtos con referencia y modal,
  borradores en **localStorage** (`lib/pos-drafts.ts`, vía `useSyncExternalStore`),
  y factura imprimible tras cobrar. El cobro se envía con `postCheckout`
  (`lib/sales/checkout-client.ts`, contrato en `lib/sales/checkout-types.ts`); el botón se gatea
  con estado propio (`submitting`), nunca con `pending`, y tras cobrar se llama `router.refresh()`
  para repintar el stock, que viene del servidor.
- **Factura/Reportes**: plantilla HTML imprimible `components/factura/invoice-template.tsx`
  (POS y descarga por venta en Reportes) y PDF con membrete
  `components/reportes/report-pdf.tsx`. Ver `docs/FACTURACION-Y-REPORTES.md`.
- **Cashea** (financiamiento): venta = inicial (efectivo en caja) + financiado (por cobrar a
  Cashea, USD). La inicial puede ser **0** (cuotas 0% inicial): entonces sólo va la línea `Cashea`. El POS captura con `CasheaPaymentForm` (`pos-view.tsx`) y `create_sale` recibe
  `p_cashea` (escribe `cashea_orders`). Módulo `/cashea` (`lib/queries/cashea.ts`,
  `app/(app)/cashea/*`, `components/cashea/cashea-view.tsx`) lista las cuentas por cobrar, las
  concilia (depósito + comisión) y muestra KPIs. Reportes/Dashboard separan **cobrado** vs
  **por cobrar** vía `payment_methods.is_financed`; los ingresos siguen devengados.
  El modal del POS captura el **canal** (`tienda|online`); el módulo `/cashea` y Reportes
  desglosan por canal (comisiones distintas entre tienda y marketplace).
  **Pago total (100%) en Cashea Online**: el cliente paga todo y el dinero llega entero a la
  tienda. Inicial = total, financiado 0, sin línea `Cashea` en `sale_payments`; `create_sale`
  crea la orden ya `cobrada` (sin comisión, `settled_amount` 0). En Tienda no se admite
  (financiado 0 en tienda es una venta normal; `create_sale` lo rechaza).
- **Keep-alive** (`supabase/keep_alive.sql`, `app/api/keep-alive/route.ts`, `lib/keep-alive.ts`,
  `vercel.json`): Vercel Cron (09:00 UTC) llama `/api/keep-alive`, que ejecuta `wm.keep_alive()` con
  la llave secreta y escribe en `wm.heartbeat` (máx. una vez por hora) para que el proyecto
  Supabase gratuito no se pause (7 días sin actividad). Ruta pública en el proxy; si existe
  `CRON_SECRET` exige `Bearer`. Configuración → Empresa muestra el último latido (aviso >3 días).
  Aplicar `keep_alive.sql` antes de desplegar (sin él la ruta da 500).
- **Cierre diario** (`supabase/daily_closures.sql`, `components/cierres/*`): cada renglón lleva un
  `source` que dice a qué cuenta va. `sale`/`legacy` = caja de la sucursal (lo único que suma al
  total de caja); `cashea_online` = inicial de una venta Cashea Online con cualquier método
  («Cashea Online · <método>»), otra cuenta; `cashea_settlement` = depósito conciliado de Cashea.
  Pantalla y ticket agrupan por cuenta con `lib/closure-groups.ts`.

- **Limpieza del catálogo (ecommerce)**: estructura nueva aditiva en `supabase/catalog_taxonomy.sql`
  (opciones de variante, familias de color, líneas, atributos, fotos por color, alias de SKU);
  propuesta y Excel de revisión en `lib/catalog-migration/` + `scripts/catalogo/`. Runbook:
  `docs/CATALOGO-LIMPIEZA.md`. Conexión a producción desde scripts con `scripts/catalogo/psql.sh`.
- **Editor de producto (plan 3a)** (`components/productos/product-editor.tsx` + `editor/*`, acciones
  en `app/(app)/productos/actions.ts` y `media-actions.ts`, reglas puras en `lib/catalog/*`):
  clasificación con categorías de **segundo nivel** + marca + línea + características
  (`category_attributes`), ficha técnica (`specs`), indicador «listo para tienda»
  (`productReadiness`) y filtros «Incompletos» y «Faltan fotos» en la lista. Las fotos son
  recomendadas: «Listo · faltan fotos» no bloquea la publicación. Variantes desde maestros (`color_id`,
  `option_value_id`) con generador de combinaciones (máx. 300); al guardar se reescribe el texto
  legado `color`/`color_hex`/`size` con `legacyText` (editar sólo precio/costo/estado no revalida
  ni reescribe color/opción: `variantMastersChanged`). SKU en mayúsculas (`normalizeSku`); un SKU
  que ya es alias no se puede reusar.
  - **Fotos**: `wm.product_media` (`color_id` null = General). Nuevas en
    `wm-public/product-images/<productId>/<mediaId>.<ext>`; las 177 viejas siguen en
    `product-images/<productId>.png`. JPG/PNG/WebP, máx. 6 MB, una por envío. Foto principal
    (`pickMainPhoto`): primera General por `sort_order`, si no la primera del primer color con fotos.
    Borrar una foto (o un producto) quita la fila y sólo borra el archivo si ninguna otra fila usa
    esa ruta y la ruta pasa `isProductImagePath`. Orden de colores (chips y foto principal):
    `orderProductColors`. Subida con plazo de 60 s por foto.
  - **Borrado**: producto o variante con ventas, compras, stock o SKU anteriores **no se borra**
    (mensaje «Desactívalo en su lugar»).
  - Guardar no toca una categoría/marca/línea que no cambió aunque esté inactiva
    (`resolveMasterField`). Filtros `.in()` con muchos ids van por grupos de 100 (`lib/chunk.ts`).
  - POS e inventario buscan también por SKU viejo (`variant_sku_aliases`); la importación de stock
    rechaza el archivo entero si trae un SKU viejo y su variante actual en la misma sucursal.
  - **Maestros (plan 3b)**: Configuración → **Catálogo** (`components/configuracion/catalogo/*`,
    acciones `app/(app)/configuracion/catalog-actions.ts`, datos `getCatalogAdminData`, reglas
    `lib/catalog/masters.ts`): categorías (árbol de 2 niveles), marcas y líneas, colores (hex +
    familia), tallas/opciones y características. Escribir exige permiso **Inventario** (= RLS).
    Sólo se borra lo que no se usa (un color tampoco si tiene fotos); lo usado se desactiva. La
    base lo garantiza (`supabase/catalog_master_guards.sql`: FK RESTRICT e índices únicos en
    `lower(name)`). La sección carga sus datos al abrirse (`loadCatalogAdminData`).
    Nombres únicos sin mayúsculas ni acentos; el slug se genera al crear y no cambia al renombrar.
    La sección vieja «Inventario» (tarjetas simples, `addMaster`/`deleteMaster`, `wm.sizes`) se quitó.
  - **Texto legado**: disparadores `SECURITY DEFINER` de `supabase/catalog_view.sql` copian
    `colors.name/hex` y `option_values.label` a `product_variants.color/color_hex/size` al renombrar.
  - **Vista `wm.v_catalog`** (`security_invoker`, sólo `authenticated`): una fila por variante con
    producto, marca, línea, departamento/categoría, color, opción, características, fotos del color
    y generales, stock por sucursal. Fuente para el ecommerce. Pantalla de lectura:
    `/productos/catalogo` (usa las consultas TS del 3a, no la vista).
  - Despliegue: `scripts/catalogo/sync-fotos-sueltas.sql` (idempotente; `-v commit=0|1`) registra
    como General los `product-images/<id>.png` sin fila. El 2026-11-16 no había ninguno por registrar
    (5 archivos sueltos son de productos que ya no existen).

## Cómo correr
```bash
npm run dev      # http://localhost:3000  (→ /login)
SUPABASE_LOCAL_DIR=/ruta/al/proyecto scripts/dev-local.sh 3100 # app contra Supabase local
npm run dev:<cliente>   # app contra UN cliente (multi-negocio): dev:fraric, dev:pruebas, dev:join
npm run build    # build de producción
npm run lint
```

## Multi-negocio (arrancar otro negocio desde cero)
El mismo esquema se reutiliza para varios negocios; **cada negocio = un proyecto Supabase aparte**.
El arranque vive en **`supabase/bootstrap/`** (3 scripts `psql`, estado final, sin data demo):
`01_schema.sql` (estructura completa), `02_seed.sql` (seed mínimo: 6 roles + matriz de 60 permisos +
10 métodos de pago + 1 sucursal + `settings` + `online_settings`) y `03_owner.sql` (primer usuario, Super Admin,
parametrizado). Comando guiado: **`/nuevo-negocio`** (`.claude/commands/nuevo-negocio.md`). Runbook
para humanos: **`docs/NUEVO-NEGOCIO.md`**. Facturas/OC arrancan en `FAC-000001`/`OC-1`.
- La parte base de `01_schema.sql` es un **snapshot escrito a mano**: al cambiar el esquema,
  volver a sincronizarlo (ver `supabase/bootstrap/README.md`). Al final incluye mediante `\ir`
  `projects_courses.sql`, `daily_closures.sql`, `catalog_view.sql`,
  `catalog_master_guards.sql` y los ocho scripts de tienda. Excluye los seeds demo.
- Las vistas usan `security_invoker` → requieren Postgres 15+ (Supabase ya lo cumple).
- Nada de la marca va fijo en el código: el título de la pestaña sale de `settings.company_name`
  (plantilla `%s · <negocio>` en `app/layout.tsx`); las páginas declaran sólo su parte.
- **Un archivo y un comando por cliente**: cada negocio tiene `.env.cliente-<nombre>` (sección
  «App» = las variables de su despliegue + `DEV_PORT` + sección «Bootstrap») y su script
  `"dev:<nombre>": "scripts/dev-cliente.sh <nombre>"` en `package.json`. Registrados: `fraric`
  (World Medics, 3200), `pruebas` (Tienda de Pruebas, 3300), `join` (Join Active, 3400).
  `scripts/dev-cliente.sh <nombre> --check` valida sin levantar. Compila en `.next-cliente`
  (`NEXT_DIST_DIR`) para convivir con `npm run dev`, un cliente a la vez, y la borra al cambiar de
  cliente; nunca hereda Resend/webhooks/BD de `.env.local`. Plantilla y alta de un cliente nuevo:
  `docs/NUEVO-NEGOCIO.md §6` (lo hace `/nuevo-negocio` en su paso 5).

## Estado de módulos
Ver `docs/PROGRESS.md`. Orden por dependencias:
Auth → Shell → Sucursales → Productos → Inventario → Clientes → Ventas(POS) →
Dashboard → Usuarios → Reportes → Configuración.

## Primer ingreso
Guía completa en **`docs/PRIMER-INGRESO.md`**. Resumen: entrar en `/login` con una cuenta
Super Admin (la del owner creado por `03_owner.sql`, o la tuya); el resto del personal
se da de alta en **Usuarios → Invitar** y activa su cuenta en `/invite` (mismo correo).
Acceso gateado por `wm.profiles` (no por estar en `auth.users`).

## Storage
Bucket público **`wm-public`** (avatares en `avatars/`, marca en `brand/`). Los archivos se
leen por URL pública conocida; el listado vía `storage.objects` solo está disponible para
  miembros del ERP (`wm_authenticated_read` exige `wm.is_member()`). Escritura y eliminación
  exigen ser miembro activo del ERP (`storage_wm_public_write.sql`). Subidas desde
Configuración (perfil/marca) vía `components/configuracion/image-upload.tsx`; URLs en
`profiles.avatar_url` / `settings.logo_url` / `settings.logo_dark_url` / `settings.favicon_url`.
Cada asset de marca (logo, logo oscuro, favicon) se puede eliminar desde Configuración.

## Branding dinámico
La marca subida en **Configuración → Marca** se consume en todo el sistema (render en servidor,
sin parpadeo) vía `getBranding()` (`lib/queries/branding.ts`, cacheado por request → RPC
`wm.branding()`, seguro para el login no autenticado):
- **Logos** (`settings.logo_url` + `settings.logo_dark_url`): se muestran en el **login**
  (`app/(auth)/layout.tsx`) y en el **header del sidebar** (`components/shell/sidebar.tsx`)
  vía `components/shell/brand-mark.tsx`. El componente renderiza ambas imágenes y alterna
  por la clase `dark` del `<html>`; si no hay logo oscuro, el tema oscuro usa el logo claro.
  Si no hay logo, cae al glifo `<Logo/>` + nombre/subtítulo. Cada asset se puede **eliminar**
  desde Configuración → Marca: `removeBrandAsset` pone la columna en `null` y borra el archivo
  del bucket `wm-public` (best-effort).
- **Favicon** (`favicon_url`): se inyecta en `generateMetadata` del root layout (`app/layout.tsx`)
  con un único icon link `faviconUrl ?? "/favicon-default.ico"`. El archivo estático se movió
  a `public/favicon-default.ico` (fue `app/favicon.ico`). Las acciones de marca
  (`app/(app)/configuracion/actions.ts`) revalidan el root layout (`revalidatePath("/", "layout")`)
  para que el favicon/logo no queden cacheados. El favicon también se puede eliminar.
- **Color primario** (`primary_color`): se aplica con un `<style>` server-rendered en el root
  layout (`lib/brand-css.ts` → `buildBrandStyle`), sobrescribiendo `--brand`, `--brand-2`,
  `--brand-soft`, `--primary`, `--primary-foreground`, `--ring`, `--sidebar-primary`,
  `--sidebar-primary-foreground`, `--sidebar-ring`, `--chart-1`. Mismo color en claro/oscuro;
  el texto contrastante (negro/blanco) se elige por luminancia. `accent_color` no se cablea.

## Pendientes / notas
- Supabase (panel, no código): ver `docs/PRIMER-INGRESO.md §5` — confirmación de correo
  off o SMTP, registro Auth habilitado, y activar **"Leaked password protection"** (advisor WARN).
- Cambio de contraseña dentro del ERP aún no está cableado (la sección Seguridad de
  Configuración es informativa); usar Supabase → Auth → Users o reset por correo (SMTP).
- Si PostgREST dejara de ver `wm` tras un cambio de plataforma: añadir `wm` en
  Dashboard → API → Exposed schemas (fallback de la exposición por SQL).
- Reportes: el desglose por método usa `wm.sale_payments`; las ventas previas a esa tabla
  (seed) caen a un *fallback* usando `sales.payment_method` + `total` (moneda inferida por
  `payment_methods.currency`). Ventas nuevas guardan el desglose real de pagos.
- Los borradores del POS viven sólo en el navegador (localStorage), no en la BD.

## Reparto con Codex
- Tú entiendes el problema, planeas, decides la arquitectura y revisas lo que vuelve.
- La construcción repetitiva, los refactors grandes y los errores atorados van a Codex.
- Ese pase lo haces tú con el subagente codex-rescue, por tu cuenta. No esperas a que el usuario lo pida.
- Nada de lo que vuelve de Codex se da por bueno sin tu revisión.
- Al usuario le cuentas qué le pediste a Codex y qué volvió.
- Si Codex falla dos veces en la misma tarea, la tarea vuelve a ti. No hay tercer intento.
