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
