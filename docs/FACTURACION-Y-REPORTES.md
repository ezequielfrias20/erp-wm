# Facturación y Reportes

## Métodos de pago y monedas

`wm.payment_methods` tiene `currency` (`USD|VES`) y `requires_reference`:

| Método | Moneda | Referencia |
|---|---|---|
| Efectivo USD | USD | no |
| Zelle, Binance | USD | sí |
| Efectivo VES, Tarjeta débito/crédito | VES | no |
| Pago Móvil, Transferencia | VES | sí |
| Mixto | — | meta-método: abre el modal de pago mixto |

Los métodos VES se cobran/expresan en **bolívares**; los USD en **dólares**. En la UI y en
los documentos siempre se muestra el **equivalente y la tasa BCV** (`lib/format.ts`:
`fmtDual`, `fmtByCurrency`, `usdToVes`, `vesToUsd`).

## Modelo de pagos por venta

Cada venta guarda sus pagos en `wm.sale_payments` (`method`, `currency`, `amount` nativo,
`amount_usd` normalizado, `reference`). El RPC `wm.create_sale(... p_payments jsonb ...)` los
inserta de forma atómica; si hay más de un pago, `sales.payment_method = 'Mixto'`.

En el POS (`components/ventas/pos-view.tsx`):
- **Pago único**: se elige el método; si requiere referencia, se pide; si es VES se muestra
  el monto en Bs.
- **Pago mixto**: modal donde se agregan líneas `{método, monto, referencia}` hasta cubrir el
  total (indica cuánto falta). Soporta montos en USD y VES (convierte con la tasa).

## Factura (plantilla HTML imprimible)

Componente `components/factura/invoice-template.tsx`:
- `InvoiceDocument` — documento con estilos *inline* (imprime igual sin depender del tema):
  membrete (logo + datos de empresa desde `settings`), cliente, ítems, totales (USD + Bs),
  y pagos con su moneda/referencia y la tasa.
- `printNode(node)` — imprime el nodo en un **iframe aislado** → PDF vectorial real (no
  captura de pantalla). Espera a que cargue el logo antes de abrir el diálogo.

Se usa en dos lugares:
1. **POS**: al cobrar, se muestra el detalle de la venta con botón **Imprimir factura**.
2. **Reportes**: en la tabla de ventas, al abrir una venta se puede **Descargar factura**.

Los datos de empresa salen de `wm.settings` (`company_name`, `rif`, `fiscal_address`,
`phone`, `logo_url`). Configurarlos en **Configuración → Empresa / Marca**.

## Reportes (`/reportes`)

Página: `app/(app)/reportes/page.tsx` (rango por `searchParams`), consultas en
`lib/queries/reports.ts`, vista `components/reportes/reportes-view.tsx`.

- **Rango desde/hasta**: filtros de fecha que recalculan **todo** (KPIs, tendencia,
  desgloses, ventas). Por defecto: inicio de mes → hoy. Respeta la **sucursal activa**.
- **KPIs**: ingresos, ganancia, margen, transacciones (con equivalente en Bs.).
- **Facturado por método de pago**: por método dentro del rango/sucursal, con **monto nativo
  + equivalente USD + tasa**. Se calcula desde `sale_payments`; las ventas antiguas (seed,
  sin filas de pago) caen a un *fallback* con `sales.payment_method`/`total`.
- **Ventas del período**: tabla con factura, fecha, cliente, método, total (USD + Bs). Al
  tocar una fila se abre el **detalle** (`getSaleDetail` vía `loadSaleDetail`) con la factura
  imprimible/descargable.
- **Detalle mensual**: tabla ingresos/costo/ganancia/margen/tx.

### Exportaciones
- **PDF**: `components/reportes/report-pdf.tsx` (`@react-pdf/renderer`) → `.pdf` descargable con
  **membrete** (logo + datos de empresa), KPIs, desglose por método, desglose mensual y la
  lista de ventas. Reemplaza el viejo `window.print()`.
- **Excel/CSV**: desglose mensual.
