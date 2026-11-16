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
| 16 | Catálogo clasificado para ecommerce | 🚧 | Planes 1 y 2 ✅ (limpieza aplicada en producción 2026-11-16); plan 3 en curso; ver detalle abajo |

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
  **Inicial 0%**: Cashea a veces aprueba cuotas sin inicial; el modal lo admite (botón *Sin inicial
  (0%)*). Entonces no se cobra nada en caja, `sale_payments` lleva sólo la línea `Cashea` por el
  total (`sales.payment_method='Cashea'`) y `cashea_orders.initial_amount=0`. Sin cambios de esquema.
  **Pago total (100%)**, sólo canal Online (botón *Pago total (100%)*): el cliente paga todo en
  Cashea Online y el dinero llega entero a la tienda. Inicial = total, financiado 0, sin línea
  `Cashea`; `create_sale` (`supabase/create_sale_tax_included.sql`, también en el bootstrap) crea
  la orden ya `cobrada`, sin comisión. Financiado 0 en Tienda se rechaza (es una venta normal).
  `/cashea` la marca con la etiqueta *Pago 100%*; en el cierre la inicial cae en *Cashea Online*.
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
- **Cierre diario y Cashea** (`supabase/daily_closures.sql`, `lib/closure-groups.ts`): la inicial de
  una venta **Cashea Online** va a otra cuenta, así que el cierre la marca `source='cashea_online'`
  («Cashea Online · <método>», cualquier método) y el **Depósito Cashea** sigue en
  `cashea_settlement`. Pantalla y ticket agrupan en **Caja de la sucursal / Cashea Online /
  Depósito Cashea**, cada bloque con su confirmado, diferencia y total; sólo la caja suma al total
  de caja. La inicial de Cashea en tienda sigue en la caja bajo su método. Los cierres guardados
  antes (renglón «Cashea Online (Pago móvil)» con `source='sale'`) se reconocen por el nombre.

## Fase 15 — Branding dinámico (logo, favicon, color)

Migraciones: `wm_branding_fn`, `wm_settings_logo_dark`. Plan/spec en `docs/superpowers/`.

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
  bucket `wm-public` (best-effort); usa la policy `DELETE` ya existente del bootstrap
  (`wm_authenticated_delete`).
- **Color primario**: `<style>` server-rendered (`lib/brand-css.ts`) que sobrescribe los tokens
  de marca (`--brand`, `--primary`, `--ring`, `--sidebar-*`, `--chart-1`), igual en claro/oscuro;
  helpers de color con pruebas unitarias (vitest, nuevo runner).

## Fase 16 — Catálogo clasificado para ecommerce (en curso)

Spec: `docs/superpowers/specs/2026-11-11-catalogo-listo-ecommerce-design.md` · Hoja de ruta (4
planes): `docs/superpowers/plans/2026-11-11-catalogo-00-hoja-de-ruta.md` · Runbook:
`docs/CATALOGO-LIMPIEZA.md`.

- **Plan 1 ✅** — migración aditiva `catalog_taxonomy` aplicada en producción (2026-11-13), plegada
  al bootstrap y a `apply_pending.sh`. Propuesta de clasificación y Excel de revisión
  (`lib/catalog-migration/`, `scripts/catalogo/`): 423 productos → 339, 53 variantes repetidas.
  Excel enviado a la tienda para revisión.
- **Plan 2 ✅** — limpieza aplicada en producción el **2026-11-16 07:15** (Caracas), corrida
  `369b3933-e5b2-433d-9f4d-6d90fae975c6`, respaldo en el esquema `wm_respaldo_catalogo_20261116`
  (restauración ensayada: `scripts/catalogo/restaurar.sh`). Resultado: 423 → 339 productos (338
  activos), 1.128 → 1.072 variantes (56 fusionadas, con su SKU como alias), 3 departamentos + 18
  categorías, 88 colores con familia, 304 atributos, 177 fotos en `product_media` (65 por color).
  Criterio de éxito verificado: 0 faltantes, 0 repetidas; stock (2.681) y líneas de venta (5.572)
  iguales. Entradas: propuesta aprobada + `pendientes-final-2026-11-15.xlsx` + decisiones del usuario
  y de la tienda (`backups/catalogo/decisiones-usuario-2026-11-15.txt`). Faltan fotos: 24 de 260
  combinaciones producto × color tienen la suya; 233 de 338 productos activos no tienen ninguna.
- **Plan 3a ✅** (2026-11-16) — editor de producto: clasificación (categoría de 2.º nivel, marca,
  línea, características), ficha técnica, indicador «listo para tienda», fotos por color
  (`product_media`), variantes desde maestros con generador, borrado bloqueado si hay historia;
  lista con filtros e «Incompletos»; POS e inventario con foto principal y búsqueda por SKU viejo;
  importación de stock que falla cerrada ante alias en conflicto. Spec
  `docs/superpowers/specs/2026-11-16-catalogo-3a-editor-producto-design.md`, plan
  `docs/superpowers/plans/2026-11-16-catalogo-03a-editor-producto.md`. Sin migración.
- **Plan 3b ⬜** — maestros en Configuración (colores, opciones, atributos, líneas) y vista de
  lectura del catálogo.
- **Pendientes del 3a (revisión final 2026-11-16) ⬜** — resolver junto con el 3b:
  1. Borrar un producto deja sus archivos de fotos en el almacenamiento (`deleteProduct` en
     `app/(app)/productos/actions.ts`): leer las rutas antes y quitar las que `mediaFileStillUsed`
     dé como no usadas.
  2. `deleteProductMedia` (`media-actions.ts`) no exige el prefijo `product-images/` antes de
     `storage.remove` (defensa extra; misma validación que `mediaPublicUrl`).
  3. El chequeo de alias en `saveVariant` distingue mayúsculas (`gor-gortir-0002` pasa):
     normalizar SKU (trim + mayúsculas) o usar `ilike`.
  4. Cambiar sólo precio/costo/estado de una variante exige categoría válida y color/opción
     activos: no revalidar color y opción si no cambian.
  5. Colores inactivos se muestran como «Color sin maestro» y el aviso de foto faltante sale sin
     nombre: cargar los nombres de colores sin filtrar por activos para mostrar.
  6. El orden de los chips de color y el de la foto principal pueden no coincidir (chips incluyen
     variantes inactivas y ordenan con `localeCompare` sin `numeric`; `getMainPhotoUrls` usa sólo
     activas y el orden de Postgres): una sola función de orden compartida.
  7. Importación de stock: el mensaje de conflicto dice «SKU anterior y actual» también cuando son
     dos filas del mismo SKU en la misma sucursal (`app/(app)/inventario/actions.ts`).
  8. Restos: `productImageUrl`/`productImagePath`/`PRODUCT_IMAGE_*` sin uso en
     `lib/product-images.ts`; `saveVariant` audita «Actualizó variante» también al crear.
  9. `/ventas` e `/inventario` hacen una vuelta en serie extra (`getMainPhotoUrls` y alias después
     del primer `Promise.all`): lanzarlas en paralelo.
  10. Fotos: archivos soltados durante una subida se ignoran sin aviso; la subida no tiene plazo
      (una petición colgada congela la cola de Server Actions); en la ficha técnica, filas con
      valor pero sin etiqueta se descartan sin aviso.
  11. Verificar en el navegador el editor de Mao Stretch Dama Recta (39 colores) en escritorio:
      chips con scroll y columna derecha visible.
- **Plan 4 ⬜** — guardas, retiro de `color`/`size` en texto y `wm.sizes`, plantillas de carga
  masiva nuevas (ojo: `lib/excel.ts` tiene el mismo bug de ExcelJS de validaciones solapadas que se
  corrigió en `lib/catalog-migration/workbook.ts`).

## Cómo reanudar
1. Leer `CLAUDE.md` (stack, Supabase, RLS, credenciales, convenciones).
2. Revisar la última fila ✅/🚧 de esta tabla y continuar por la siguiente ⬜.
3. `npm run dev` y entrar con `pedro.salas@worldmedics.ve` / `WorldMedics.2026`.
4. La base de datos `wm` ya está creada y sembrada; no hace falta recrearla.

## Decisiones clave
- Solo invitación (sin registro público). Primer admin = Pedro Salas (Super Admin).
- Esquema `wm` aislado (originalmente dentro de `crm_cubo_labs`; hoy producción WM vive en `cfggippjujceebovvhsa`).
- Tasa BCV en vivo desde dolarapi (`/v1/dolares/oficial`, campo `promedio`).
- Filtro global por sucursal en todo el sistema.
