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
- Proyecto: **`crm_cubo_labs`** · ref **`yxwedegszxtujplffaac`** · us-west-1.
- Todas las tablas del ERP viven en el esquema **`wm`** (aislado del CRM en `public`).
  El esquema está expuesto a PostgREST vía `ALTER ROLE authenticator SET pgrst.db_schemas`.
- Clientes en `lib/supabase/{client,server,middleware}.ts`, todos con `db: { schema: "wm" }`.
- Tipos del esquema escritos a mano en `lib/database.types.ts` (el generador del MCP solo
  emite `public`). Mantener en sync al cambiar el esquema.
- Variables de entorno (`.env.local`, NO commiteado):
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_BCV_API`.

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
18. `wm_storage_brand_delete` — policy `DELETE` en `storage.objects` para el bucket `wm-public`
    (permite borrar logo/favicon al eliminarlos; el borrado real se gatea por permisos de módulo).
Bootstrap del admin (login) se hizo con `execute_sql` (crea `auth.users` + `auth.identities`).

### Modelo RLS
- Acceso **solo** a usuarios con fila en `wm.profiles` (`status='Activo'`) cuyo `user_id = auth.uid()`.
  Esto aísla del CRM (que comparte `auth.users`).
- Lectura (`select`): cualquier miembro activo. Escritura: `wm.has_module('<Módulo>', 2)`
  según la matriz `wm.role_permissions` (tomada del handoff). `profiles` permite además
  que cada quien edite su propia fila.
- Helpers (SECURITY DEFINER): `wm.is_member()`, `wm.my_role()`, `wm.my_profile_id()`, `wm.has_module(module, min)`.

### Credenciales del admin sembrado (Super Admin)
- **Email:** `pedro.salas@worldmedics.ve` · **Password:** `WorldMedics.2026`
- Los otros 6 perfiles del personal existen sin login (invite-only): se enlazan a `auth.users`
  al aceptar invitación. Registro público deshabilitado.

## Tablas (esquema `wm`)
branches, categories, brands, sizes, colors, suppliers, products, product_variants,
inventory, profiles, customers, customer_events, sales, sale_items, **sale_payments**,
**cashea_orders**, purchase_orders, purchase_order_items, roles, role_permissions,
payment_methods, exchange_rates, audit_log, settings. (Detalle de campos en `lib/database.types.ts`.)
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
- Rutas protegidas bajo `app/(app)/`; auth bajo `app/(auth)/`. `middleware.ts` refresca
  sesión y redirige a `/login`.
- Lectura inicial en Server Components; mutaciones con **Server Actions** en `app/(app)/<modulo>/actions.ts`.
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
  y factura imprimible tras cobrar.
- **Factura/Reportes**: plantilla HTML imprimible `components/factura/invoice-template.tsx`
  (POS y descarga por venta en Reportes) y PDF con membrete
  `components/reportes/report-pdf.tsx`. Ver `docs/FACTURACION-Y-REPORTES.md`.
- **Cashea** (financiamiento): venta = inicial (efectivo en caja) + financiado (por cobrar a
  Cashea, USD). El POS captura con `CasheaPaymentForm` (`pos-view.tsx`) y `create_sale` recibe
  `p_cashea` (escribe `cashea_orders`). Módulo `/cashea` (`lib/queries/cashea.ts`,
  `app/(app)/cashea/*`, `components/cashea/cashea-view.tsx`) lista las cuentas por cobrar, las
  concilia (depósito + comisión) y muestra KPIs. Reportes/Dashboard separan **cobrado** vs
  **por cobrar** vía `payment_methods.is_financed`; los ingresos siguen devengados.
  El modal del POS captura el **canal** (`tienda|online`); el módulo `/cashea` y Reportes
  desglosan por canal (comisiones distintas entre tienda y marketplace).

## Cómo correr
```bash
npm run dev      # http://localhost:3000  (→ /login)
npm run build    # build de producción
npm run lint
```

## Multi-negocio (arrancar otro negocio desde cero)
El mismo esquema se reutiliza para varios negocios; **cada negocio = un proyecto Supabase aparte**.
El arranque vive en **`supabase/bootstrap/`** (3 scripts `psql`, estado final, sin data demo):
`01_schema.sql` (estructura completa), `02_seed.sql` (seed mínimo: 6 roles + matriz de 54 permisos +
10 métodos de pago + 1 sucursal + `settings`) y `03_owner.sql` (primer usuario, Super Admin,
parametrizado). Comando guiado: **`/nuevo-negocio`** (`.claude/commands/nuevo-negocio.md`). Runbook
para humanos: **`docs/NUEVO-NEGOCIO.md`**. Facturas/OC arrancan en `FAC-000001`/`OC-1`.
- `01_schema.sql` es un **snapshot a mano** del esquema (como `lib/database.types.ts`): al cambiar
  el esquema por MCP, re-sincronizar (cómo, en `supabase/bootstrap/README.md`). Excluye los seeds
  demo y pliega las migraciones incrementales (solo `create_sale` v4; columnas dentro del `CREATE TABLE`).
- Las vistas usan `security_invoker` → requieren Postgres 15+ (Supabase ya lo cumple).

## Estado de módulos
Ver `docs/PROGRESS.md`. Orden por dependencias:
Auth → Shell → Sucursales → Productos → Inventario → Clientes → Ventas(POS) →
Dashboard → Usuarios → Reportes → Configuración.

## Primer ingreso
Guía completa en **`docs/PRIMER-INGRESO.md`**. Resumen: entrar en `/login` con el Super
Admin sembrado (`pedro.salas@worldmedics.ve` / `WorldMedics.2026`); el resto del personal
se da de alta en **Usuarios → Invitar** y activa su cuenta en `/invite` (mismo correo).
Acceso gateado por `wm.profiles` (no por estar en `auth.users`).

## Storage
Bucket público **`wm-public`** (avatares en `avatars/`, marca en `brand/`). Lectura
pública, escritura solo autenticados, eliminación solo autenticados. Subidas desde
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
