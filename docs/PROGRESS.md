# Progreso de implementación — World Medics ERP

Estado por fase. Actualizar al cerrar cada módulo. Leyenda: ✅ hecho · 🚧 en curso · ⬜ pendiente.

| # | Fase / Módulo | Estado | Notas |
|---|---|---|---|
| 0 | Scaffold (Next 16, Tailwind v4, shadcn, tokens, providers, BCV, format) | ✅ | Tokens del handoff en `globals.css`; Inter; sonner; next-themes |
| 1 | Supabase: esquema `wm`, tablas, RLS, grants, seed, admin, tipos | ✅ | Login validado end-to-end; advisor sin errores (solo WARN) |
| 2 | Auth (login, aceptar invitación, middleware, contexto sesión/rol) | ✅ | `proxy.ts` gatea rutas; `claim_profile` enlaza perfil por email; login validado en runtime |
| 3 | Shell (sidebar, header, tema, sucursal global, BCV, notif, perfil) | ✅ | shadcn=Radix (new-york); tokens del handoff; tipos `wm` como `type` (no interface) |
| 4 | Sucursales (CRUD + mapa + ranking + detalle) | ✅ | Validado con Playwright (claro/oscuro); vista `v_branch_stats`; tasa BCV en vivo |
| 5 | Productos (lista + detalle/editor con variantes) | ✅ | `v_product_summary`; lista + editor `/productos/[id]` con CRUD de variantes |
| 6 | Inventario (tabla stock, KPIs, filtros, editar) | ✅ | `v_inventory`; KPIs, tabs, filtros, ajuste de stock, export CSV; filtra por sucursal activa |
| 7 | Clientes (lista + detalle + timeline + CRUD) | ✅ | `v_customer_stats`, `v_customer_favorites`; maestro-detalle, KPIs, historial, notas, CRUD |
| 8 | Ventas / POS (carrito, cobro, descuento de inventario) | ✅ | RPC `create_sale` (atómica, SECURITY DEFINER); validado: FAC-008422 creada + inventario descontado |
| 9 | Dashboard (KPIs, gráficos, listas, filtrado por sucursal) | ✅ | `v_sale_lines`; 8 KPIs, área Recharts, donas pagos/categorías, listas; validado visualmente |
| 10 | Usuarios y permisos (lista, invitar, matriz de permisos) | ✅ | Tabla con filtros, drawer de detalle, matriz editable (click cicla nivel), invitar/editar/eliminar |
| 11 | Reportes (filtros, gráficos, tabla detalle, exportar) | ✅ | Desglose mensual ingresos/costo/ganancia/margen, KPIs, tendencia, breakdown, export CSV/PDF |
| 12 | Configuración (perfil, empresa, marca, apariencia, ventas, inventario, notif, auditoría) | ✅ | 9 secciones; perfil/empresa/ventas/notif/colores persistentes; maestros CRUD; auditoría |
| 13 | Mejoras operativas (carga masiva, POS avanzado, reportes con rango y factura) | ✅ | Ver detalle abajo; build de producción OK |
| 14 | Cashea (financiamiento: inicial en caja + cuenta por cobrar, conciliación, comisión) | ✅ | Ver detalle abajo; build de producción OK |

## Fase 13 — Mejoras operativas

Migraciones: `wm_payment_methods_currency`, `wm_sale_payments`, `wm_create_sale_v2`.
Librerías: `exceljs`, `@react-pdf/renderer`.

- **Productos**: SKU autogenerado `[CAT]-[slug]-[0001]` (`lib/sku.ts`); plantilla Excel de 2 hojas
  (Productos + Variantes) con listas desplegables, importación y exportación `.xlsx`
  (`components/productos/bulk-bar.tsx`, `importProducts/getProductsExport`).
- **Inventario**: corregida la alineación de la tabla de stock (`minmax(0,…)` + `truncate`);
  plantilla/importación/exportación Excel con selector de SKU y sucursal; `importInventory`
  soporta `reservado`.
- **Configuración**: alta/baja de **Marcas** en la sección Inventario.
- **Ventas/POS**: búsqueda de cliente por cédula con alta inline y auto-selección; métodos
  `Zelle`/`Binance` (USD); número de referencia obligatorio donde aplica; **pago mixto** (modal,
  multi-método con restante); **borradores** en localStorage (guardar/restaurar/eliminar);
  factura imprimible tras cobrar. `create_sale` ahora recibe `p_payments[]` y guarda `sale_payments`.
- **Reportes**: rango **desde/hasta** (recalcula todo); KPIs con equivalente en Bs.; tabla de
  ventas del período con **detalle + descarga de factura**; **facturado por método de pago**
  (moneda nativa + equivalente USD + tasa); **PDF con membrete** (logo + datos de empresa)
  vía `@react-pdf` en lugar de `window.print()`.
- **Doble moneda**: helpers `fmtDual`/`fmtByCurrency` en `lib/format.ts`; siempre se muestra la tasa.

## Fase 14 — Cashea (financiamiento / cuentas por cobrar)

Migraciones: `wm_payment_methods_is_financed`, `wm_cashea_orders`, `wm_cashea_orders_rls`,
`wm_create_sale_v3`, `wm_cashea_void_on_sale_status`, `wm_cashea_orders_channel`, `wm_create_sale_v4`.

- **Modelo contable**: una venta Cashea es un pago mixto = **inicial** (efectivo real en caja) +
  **financiado** (`total − inicial`, cuenta por cobrar a Cashea, en USD; no es deuda del cliente).
  La venta queda `Pagada`; lo pendiente vive en `cashea_orders.status`. Dos fuentes de verdad:
  `sale_payments` cuadra la venta (lleva la línea `Cashea`), `cashea_orders` es el libro de
  cuentas por cobrar (referencia, financiado, comisión, neto, conciliación).
- **`payment_methods.is_financed`** (nueva columna) distingue financiamiento de efectivo sin
  hardcodear `'Cashea'`. Método `Cashea` sembrado (USD, requiere referencia, `is_financed`).
- **POS** (`pos-view.tsx`): botón **Cashea** (junto a Mixto) → `CasheaPaymentForm`: captura la
  inicial (uno o varios métodos, no Cashea) + referencia de orden; calcula `financia Cashea`.
  `create_sale` recibe `p_cashea` y escribe `cashea_orders` en la misma transacción.
- **Factura**: la línea Cashea se rotula "Financiado por Cashea (por cobrar)" + resumen inicial/financiado.
- **Módulo `/cashea`** (`lib/queries/cashea.ts`, `app/(app)/cashea/*`, `components/cashea/*`):
  lista de órdenes con filtros (estado/rango), KPIs (ventas Cashea, inicial cobrada, por cobrar,
  cobrado, comisión) y acción **"Marcar cobrada"** (depósito + comisión derivada + anti-doble-conciliación).
  Gateado por módulo **Reportes**; nav en sección Gestión.
- **Reportes/Dashboard**: el desglose por método marca lo financiado como "por cobrar"; Reportes
  añade bloque "Cashea · conciliación" (también en PDF); Dashboard separa la rebanada Cashea del
  efectivo y añade KPI **"Por cobrar a Cashea"**. Ingresos siguen siendo devengados (sin cambio).
- **Anulación**: trigger en `wm.sales` pone `cashea_orders.status='anulada'` si la venta pasa a
  Reembolso/Anulada (`ON DELETE CASCADE` cubre borrados).
- **Canal Tienda/Online**: `cashea_orders.channel` (`tienda|online`, default tienda) distingue ventas
  en sucursal del **marketplace** de la app (comisiones distintas). Selector en el modal del POS;
  el módulo `/cashea` filtra por canal, muestra badge y tarjetas comparativas **Tienda vs Online**
  (ventas, por cobrar, cobrado, comisión); Reportes (vista + PDF) desglosan Cashea por canal.

## Fase 15 — Branding dinámico (logo, favicon, color)

Migraciones: `wm_branding_fn`, `wm_settings_logo_dark`, `wm_storage_brand_delete`. Plan/spec en `docs/superpowers/`.

- El **logo**, **favicon** y **color primario** subidos en Configuración → Marca ya se consumen
  en el sistema (render en servidor, sin parpadeo) vía `getBranding()` → RPC `wm.branding()`
  (`SECURITY DEFINER`, expone solo la marca; segura para el login no autenticado).
- **Logos por tema**: `settings.logo_url` (claro/base) + `settings.logo_dark_url` (oscuro, opcional).
  `BrandMark` (`components/shell/brand-mark.tsx`) renderiza ambas y alterna por la clase `dark`
  del `<html>`; si no hay logo oscuro, el tema oscuro usa el logo claro. Sin logo, cae al glifo + nombre.
- **Favicon**: `public/favicon-default.ico` (fue `app/favicon.ico`); `generateMetadata` emite un único
  icon link `faviconUrl ?? "/favicon-default.ico"`. Las acciones de marca revalidan el root layout
  para que no quede cacheado.
- **Eliminación de marca**: cada asset (logo, logo oscuro, favicon) se puede eliminar desde
  Configuración → Marca: `removeBrandAsset` pone la columna en `null` y borra el archivo del
  bucket `wm-public` (best-effort); policy `DELETE` en storage gatea la eliminación.
- **Color primario**: `<style>` server-rendered (`lib/brand-css.ts`) que sobrescribe los tokens
  de marca (`--brand`, `--primary`, `--ring`, `--sidebar-*`, `--chart-1`), igual en claro/oscuro;
  helpers de color con pruebas unitarias (vitest, nuevo runner).

## Cómo reanudar
1. Leer `CLAUDE.md` (stack, Supabase, RLS, credenciales, convenciones).
2. Revisar la última fila ✅/🚧 de esta tabla y continuar por la siguiente ⬜.
3. `npm run dev` y entrar con `pedro.salas@worldmedics.ve` / `WorldMedics.2026`.
4. La base de datos `wm` ya está creada y sembrada; no hace falta recrearla.

## Decisiones clave
- Solo invitación (sin registro público). Primer admin = Pedro Salas (Super Admin).
- Esquema `wm` aislado dentro del proyecto Supabase `crm_cubo_labs`.
- Tasa BCV en vivo desde dolarapi (`/v1/dolares/oficial`, campo `promedio`).
- Filtro global por sucursal en todo el sistema.
