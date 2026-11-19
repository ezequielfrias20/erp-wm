# Tienda online — Fase 2: módulo «Pedidos online» en el ERP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el personal gestione en el ERP las solicitudes que llegan de la tienda: verlas, aceptarlas (eligiendo sucursal), rechazarlas, extenderlas o cancelarlas, escribir al cliente por WhatsApp con mensajes preparados, convertir cada sucursal del pedido en una venta desde el POS, enterarse de las solicitudes nuevas, y configurar tiempos, plantillas y sucursales que venden online.

**Architecture:** La base ya está en producción (fase 1): tablas `wm.online_orders`/`online_order_items`/`online_settings`, vista `wm.v_online_orders` (`effective_status`, `expires_at`, `total`, `branch_count`), RPCs `wm.online_order_accept|reject|cancel|extend` y `wm.create_sale(..., p_online_order_id)`. Este plan es **solo app**: lecturas en Server Components (`lib/queries/online-orders.ts`), mutaciones con Server Actions que llaman a las RPCs, reglas puras testeadas en `lib/online-orders/*`, y el cobro sigue por el Route Handler del POS. Sin cambios de esquema.

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript, Tailwind v4 + shadcn/ui, sonner, lucide-react, Supabase (`@supabase/ssr`, esquema `wm`), vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-ecommerce-catalogo-pedidos-online-design.md` (§6.2–6.5, §11). Contrato de la tienda: `docs/TIENDA-INTEGRACION.md`. Plan anterior (base): `docs/superpowers/plans/2026-11-18-tienda-fase1-base-erp.md`.

## Global Constraints

- Permisos: el módulo usa **Ventas** — ver con nivel 1, gestionar (aceptar/rechazar/cancelar/extender/convertir) con nivel 2 (`canView`/`canEdit` de `lib/permissions.ts`). La configuración «Tienda online» exige **Configuración** 2 (tiempos y plantillas, RLS de `online_settings`) y **Sucursales** 2 para activar `branches.online_enabled` (RLS de `branches`).
- Ruta: `/pedidos-online` (lista) y `/pedidos-online/[id]` (detalle). Entrada de menú «Pedidos online» en la sección «Principal», debajo de «Ventas», icono `Globe` de lucide, `module: "Ventas"`, badge de solicitudes nuevas.
- Estados mostrados (de `effective_status`): `solicitada` → «Nueva», `aceptada` → «Aceptada», `completada` → «Completada», `rechazada` → «Rechazada», `cancelada` → «Cancelada», `vencida` → «Vencida».
- Textos al usuario en español (es-VE); dinero con `fmtUSD`/`fmtVES`/`fmtDual` de `lib/format.ts`; fechas/horas en hora de Caracas con los helpers existentes.
- Tokens visuales del handoff (`text-text-2`, `text-text-3`, `bg-surface-2`, `text-warning`, `bg-success-soft`, `.tr-row`, `.shadow-card-sm`…). Componentes de `components/ui/`. Nada de colores sueltos.
- Server Actions devuelven `{ error?: string }` y en el cliente se llaman con `try/catch` + `reportActionError` (`lib/action-error.ts`), sin colgar `pending`.
- No hay cambios de esquema SQL en este plan. Si una tarea descubre que necesita uno, se detiene y lo reporta.
- Pruebas: vitest para todo lo puro en `lib/online-orders/*`. Las pantallas se verifican en el navegador contra el **Supabase local** (Task 1), nunca contra producción.
- Usuarios con sucursal asignada (`getProfileBranchScope`): sólo convierten grupos de su sucursal; la lista se filtra por la sucursal activa (pedidos con al menos una línea en ella; «Todas» = todos).

## Review Focus

1. **Convertir un grupo cuya sucursal no es la activa** → el botón cambia la sucursal activa y abre el POS; si el usuario está atado a otra sucursal, el botón está deshabilitado con explicación. Test en Task 6 (`canConvertGroup`).
2. **Pedido vencido mientras el personal lo mira** → la pantalla muestra «Vencida» al recargar y los botones válidos siguen siendo los de la regla de la base (aceptar una solicitada vencida = rescatar; convertir una aceptada vencida). Test en Task 2 (`availableActions`).
3. **Teléfono del cliente con formato raro o inválido** → el enlace de WhatsApp usa sólo dígitos del E.164 guardado; si no hay teléfono válido, el botón no aparece. Test en Task 2 (`buildWhatsAppUrl`).
4. **Plantilla editada con una variable desconocida o vacía** → se deja el texto tal cual (`{foo}` queda literal) y nunca se rompe la pantalla; plantilla vacía usa la predeterminada. Test en Task 2 (`renderTemplate`).
5. **Doble clic en «Aceptar»/«Convertir»** → una sola acción (botones gateados con estado propio, no con `pending` compartido); la segunda llamada de la base falla limpia con su mensaje («no está aceptado» / estado inválido) y se muestra como toast. Test en Task 4 (botón deshabilitado mientras corre) por verificación en navegador.

---

### Task 1: Entorno local para ver la app contra el Supabase local

**Files:**
- Create: `scripts/dev-local.sh`
- Modify: `docs/PROGRESS.md` (una línea en «Cómo verificar»), `CLAUDE.md` (sección «Cómo correr»: una línea)

**Interfaces:**
- Produces: `scripts/dev-local.sh [puerto]` — exporta `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (y la publishable si el código la lee) del Supabase local que indique `SUPABASE_LOCAL_DIR` (carpeta con `supabase/config.toml`, leído con `supabase status -o env --workdir "$SUPABASE_LOCAL_DIR"`), y corre `next dev -p ${1:-3100}`. Las variables de proceso ganan a `.env.local`, así que `npm run dev` normal no cambia. Aborta con mensaje en español si `SUPABASE_LOCAL_DIR` no está o `supabase status` falla.

- [ ] **Step 1:** Escribir `scripts/dev-local.sh` (bash, `set -euo pipefail`, sin secretos en el archivo).
- [ ] **Step 2:** Verificar: con el Supabase local de pruebas levantado (el controlador indica `SUPABASE_LOCAL_DIR`), crear un usuario de acceso local: en la copia local, `update auth.users set encrypted_password = crypt('<clave local>', gen_salt('bf')), email_confirmed_at = now() where id = <user_id del Super Admin local>` (a mano, no en el repo). Correr `SUPABASE_LOCAL_DIR=… scripts/dev-local.sh`, entrar en `http://localhost:3100/login` con el correo anonimizado de ese perfil. Expected: entra al dashboard y `/ventas` carga.
- [ ] **Step 3:** Commit `chore(dev): script para correr la app contra el Supabase local`.

---

### Task 2: Reglas puras del módulo

**Files:**
- Create: `lib/online-orders/types.ts`, `lib/online-orders/rules.ts`, `lib/online-orders/whatsapp.ts`
- Test: `lib/online-orders/rules.test.ts`, `lib/online-orders/whatsapp.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `OnlineOrderStatus = "solicitada" | "aceptada" | "completada" | "rechazada" | "cancelada" | "vencida"` (efectivo).
  - `OnlineOrderItemView = { id: string; variantId: string; branchId: string; branchName: string; quantity: number; unitPrice: number; productName: string; variantLabel: string; sku: string; saleId: string | null; invoiceNumber: string | null; releasedAt: string | null }`.
  - `OnlineOrderView = { id: string; number: string; status: OnlineOrderStatus; storedStatus: Exclude<OnlineOrderStatus,"vencida">; customerName: string; customerPhone: string; customerEmail: string | null; customerDocument: string | null; notes: string | null; createdAt: string; expiresAt: string | null; softExpiresAt: string; firmExpiresAt: string | null; total: number; branchCount: number; closeReason: string | null; items: OnlineOrderItemView[] }`.
  - `BranchGroup = { branchId: string; branchName: string; items: OnlineOrderItemView[]; subtotal: number; state: "pendiente" | "vendido" | "liberado" }`.
  - `OrderAction = "aceptar" | "rechazar" | "extender" | "cancelar" | "convertir"`.
- Produces (`rules.ts`):
  - `STATUS_LABEL: Record<OnlineOrderStatus, string>` (Global Constraints) y `STATUS_TONE: Record<OnlineOrderStatus, "brand" | "success" | "muted" | "danger" | "warning">` (`solicitada` brand, `aceptada` warning, `completada` success, `rechazada`/`cancelada` muted, `vencida` danger).
  - `groupByBranch(items: OnlineOrderItemView[]): BranchGroup[]` — orden por `branchName`; `state`: «vendido» si todas tienen `saleId`, «liberado» si todas tienen `releasedAt` sin venta, si no «pendiente»; `subtotal` = Σ quantity×unitPrice redondeado a 2.
  - `availableActions(order: Pick<OnlineOrderView,"status"|"storedStatus">, canEdit: boolean): OrderAction[]` — sin `canEdit` → `[]`. `storedStatus = "solicitada"` (vigente o vencida) → `["aceptar","rechazar"]`. `storedStatus = "aceptada"` → `["convertir","extender","cancelar"]`. Otros → `[]`.
  - `canConvertGroup(group: BranchGroup, opts: { assignedBranchId: string | null }): { ok: true } | { ok: false; reason: string }` — `state !== "pendiente"` → `«Este grupo ya no tiene productos pendientes»`; `assignedBranchId` y distinto de `group.branchId` → `«Sólo puedes vender en tu sucursal»`.
  - `timeLeftLabel(expiresAt: string | null, now: Date): string` — `null` → `«—»`; vencido → `«Vencido»`; < 60 min → `«Vence en N min»`; si no `«Vence en H h M min»`.
- Produces (`whatsapp.ts`):
  - `TemplateKey = "recibida" | "aceptada" | "rechazada" | "no_disponible" | "por_vencer"`.
  - `DEFAULT_TEMPLATES: Record<TemplateKey, string>` con este texto exacto:
    - recibida: `Hola {nombre}, recibimos tu solicitud {numero}. La estamos revisando y te escribimos por aquí para confirmar disponibilidad y pago.`
    - aceptada: `Hola {nombre}, confirmamos tu pedido {numero}:\n{lineas}\nTotal: {total}\n{sucursales}\nTus productos quedan apartados hasta {vence}. Para pagar te indicamos los datos por este medio.`
    - rechazada: `Hola {nombre}, lamentablemente no podemos procesar tu solicitud {numero}.{motivo} Disculpa las molestias.`
    - no_disponible: `Hola {nombre}, sobre tu solicitud {numero}: algunos productos ya no están disponibles. ¿Te ofrecemos una alternativa?`
    - por_vencer: `Hola {nombre}, tu pedido {numero} vence {vence}. ¿Confirmamos el pago para no liberar los productos?`
  - `renderTemplate(template: string, vars: Record<string, string>): string` — reemplaza las `{clave}` conocidas y deja literales las desconocidas. No elige plantilla: `getOnlineSettings` ya entrega la predeterminada cuando la guardada está vacía.
  - `templateVars(order: OnlineOrderView, groups: BranchGroup[], now: Date): Record<string, string>` — `nombre` (primer nombre), `numero`, `lineas` (una por línea: `• {cantidad} × {producto} ({variante}) — {precio}`), `total` (`fmtUSD`), `sucursales` (`Sale de: A, B` y, si hay >1, `· serán N facturas y N envíos`), `vence` (fecha/hora local de `expiresAt`), `motivo` (` Motivo: {closeReason}.` o vacío).
  - `buildWhatsAppUrl(phoneE164: string, text: string): string | null` — sólo dígitos; si no cumple `^\+[1-9][0-9]{7,14}$` → `null`; si cumple → `https://wa.me/<dígitos>?text=<encodeURIComponent(text)>`.

- [ ] **Step 1: Write the failing tests**

```ts
// rules.test.ts (extracto; un it por caso)
expect(groupByBranch([itemA1, itemB1, itemA2]).map(g => g.branchName)).toEqual(["Caracas Centro", "Valencia"]);
expect(groupByBranch([{...itemA1, saleId: "s1"}])[0].state).toBe("vendido");
expect(groupByBranch([{...itemA1, releasedAt: "2026-11-19T10:00:00Z"}])[0].state).toBe("liberado");
expect(groupByBranch([itemA1 /*2×31.25*/])[0].subtotal).toBe(62.5);
expect(availableActions({ status: "vencida", storedStatus: "solicitada" }, true)).toEqual(["aceptar", "rechazar"]);
expect(availableActions({ status: "vencida", storedStatus: "aceptada" }, true)).toEqual(["convertir", "extender", "cancelar"]);
expect(availableActions({ status: "completada", storedStatus: "completada" }, true)).toEqual([]);
expect(availableActions({ status: "solicitada", storedStatus: "solicitada" }, false)).toEqual([]);
expect(canConvertGroup(pendingGroupA, { assignedBranchId: "B" })).toEqual({ ok: false, reason: "Sólo puedes vender en tu sucursal" });
expect(canConvertGroup({ ...pendingGroupA, state: "vendido" }, { assignedBranchId: null }).ok).toBe(false);
expect(timeLeftLabel("2026-11-19T10:30:00Z", new Date("2026-11-19T10:00:00Z"))).toBe("Vence en 30 min");
expect(timeLeftLabel("2026-11-19T09:00:00Z", new Date("2026-11-19T10:00:00Z"))).toBe("Vencido");
// whatsapp.test.ts
expect(buildWhatsAppUrl("+584141234567", "Hola ñ")).toBe("https://wa.me/584141234567?text=Hola%20%C3%B1");
expect(buildWhatsAppUrl("04141234567", "x")).toBeNull();
expect(renderTemplate("Hola {nombre} {foo}", { nombre: "Ana" })).toBe("Hola Ana {foo}");
expect(templateVars(order2Groups, groups2, now).sucursales).toContain("serán 2 facturas y 2 envíos");
expect(templateVars(orderRejected, [], now).motivo).toBe(" Motivo: Sin stock.");
```

- [ ] **Step 2: Run** `npx vitest run lib/online-orders` → FAIL (módulos no existen).
- [ ] **Step 3: Implement** los tres archivos según Interfaces.
- [ ] **Step 4: Run** `npx vitest run lib/online-orders` → PASS; `npx tsc --noEmit` → 0 errores.
- [ ] **Step 5: Commit** `feat(pedidos-online): reglas puras, estados y mensajes de WhatsApp`.

---

### Task 3: Lecturas y acciones del módulo

**Files:**
- Create: `lib/queries/online-orders.ts`, `app/(app)/pedidos-online/actions.ts`, `lib/online-orders/map.ts`
- Test: `lib/online-orders/map.test.ts`

**Interfaces:**
- Consumes: Task 2 types/rules.
- Produces (`map.ts`, puro): `mapOrderRow(row: VOnlineOrderRow, items: ItemRow[], branchNames: Map<string,string>, invoices: Map<string,string>): OnlineOrderView` (números como `Number(...)`; `status` = `effective_status`, `storedStatus` = `status`).
- Produces (`lib/queries/online-orders.ts`, `server-only`):
  - `listOnlineOrders(opts: { branchId: string | null; status: OnlineOrderStatus | "activas" | "todas"; q?: string; limit?: number }): Promise<OnlineOrderView[]>` — lee `v_online_orders` ordenado por `created_at desc` (límite 200); «activas» = `effective_status in ('solicitada','aceptada','vencida')` y `storedStatus in ('solicitada','aceptada')`; `q` filtra por número, nombre o teléfono (`ilike`); con `branchId`, sólo pedidos con alguna línea en esa sucursal (consulta de `online_order_items` por `branch_id`, ids en grupos de 100 con `lib/chunk.ts`).
  - `getOnlineOrder(id: string): Promise<OnlineOrderView | null>` — pedido + líneas + nombres de sucursal + número de factura de cada `sale_id`.
  - `countNewOnlineOrders(branchId: string | null): Promise<{ count: number; latestNumber: string | null; latestAt: string | null }>` — `effective_status = 'solicitada'`.
  - `getOnlineSettings(): Promise<{ softHoldMinutes: number; firmHoldHours: number; storeWhatsapp: string | null; templates: Record<TemplateKey,string> }>` — plantillas = `DEFAULT_TEMPLATES` sobrescritas por las no vacías de `whatsapp_templates`.
  - `getOnlineOrderForPos(orderId: string, branchId: string): Promise<PosOnlineOrder | null>` — sólo si `storedStatus = 'aceptada'` y hay líneas pendientes en `branchId`. `PosOnlineOrder = { orderId: string; number: string; branchId: string; holdLive: boolean; customer: { name: string; phone: string; email: string | null; document: string | null }; matchedCustomerId: string | null; lines: { variantId: string; quantity: number; unitPrice: number; productName: string; variantLabel: string; sku: string }[] }`. `matchedCustomerId`: cliente con `document` igual (`ilike`) si hay cédula; si no, con `phone` cuyos últimos 10 dígitos coincidan; si no, `null`.
- Produces (`actions.ts`, `"use server"`): `acceptOnlineOrder(orderId: string, lines: { itemId: string; branchId: string; quantity: number }[]): Promise<{ error?: string }>`, `rejectOnlineOrder(orderId: string, reason: string | null)`, `cancelOnlineOrder(orderId: string, reason: string | null)`, `extendOnlineOrder(orderId: string, hours: number | null)`. Cada una: sesión + `canEdit(perms,"Ventas")`, llama la RPC (`p_lines` en snake_case: `item_id`, `branch_id`, `quantity`), traduce el error de Postgres a su `message` tal cual (la base ya da mensajes en español), `revalidatePath("/pedidos-online")` y `revalidatePath(\`/pedidos-online/${orderId}\`)`.

- [ ] **Step 1: Write the failing test** `map.test.ts`: una fila de `v_online_orders` con `effective_status: "vencida"`, `status: "solicitada"`, `total: "87.50"` → `status "vencida"`, `storedStatus "solicitada"`, `total 87.5`; líneas mapeadas con `branchName` e `invoiceNumber` de los mapas.
- [ ] **Step 2: Run** `npx vitest run lib/online-orders/map.test.ts` → FAIL.
- [ ] **Step 3: Implement** `map.ts`, las consultas y las acciones.
- [ ] **Step 4: Run** `npx vitest run lib/online-orders && npx tsc --noEmit && npm run lint` → PASS / 0 errores.
- [ ] **Step 5: Commit** `feat(pedidos-online): consultas y acciones del personal`.

---

### Task 4: Lista y detalle de pedidos

**Files:**
- Create: `app/(app)/pedidos-online/page.tsx`, `app/(app)/pedidos-online/[id]/page.tsx`, `components/pedidos-online/orders-list.tsx`, `components/pedidos-online/order-detail.tsx`, `components/pedidos-online/accept-dialog.tsx`, `components/pedidos-online/whatsapp-menu.tsx`, `components/pedidos-online/status-badge.tsx`
- Modify: `components/shell/nav-items.ts` (entrada nueva; el badge llega en Task 7)

**Interfaces:**
- Consumes: Tasks 2–3.
- Lista (`/pedidos-online?estado=activas|solicitada|aceptada|completada|rechazada|cancelada|vencida|todas&q=`; por defecto `activas`): sin `canView(Ventas)` → `redirect("/dashboard")`. Columnas: Número, Cliente (nombre + teléfono), Sucursales (chips), Total (`fmtDual` con tasa BCV), Estado (badge), Vence (`timeLeftLabel`), Creado. Fila → detalle. Estado vacío: «No hay pedidos online con este filtro».
- Detalle: cabecera (número, estado, vence, cliente con teléfono/correo/cédula, nota); un bloque por `BranchGroup` (líneas con producto, variante, SKU, cantidad, precio, subtotal; estado del grupo; factura si vendido); total; aviso si `branchCount > 1`: «Este pedido sale de N tiendas: serán N facturas y N envíos». Botones según `availableActions`:
  - **Aceptar** abre `accept-dialog`: por línea, selector de sucursal (sólo sucursales activas con `online_enabled`; la actual primero) y cantidad (0–cantidad original; 0 = quitar). Confirmar llama `acceptOnlineOrder` sólo con las líneas cambiadas. Mensaje de error de la base en toast.
  - **Rechazar**: diálogo con motivo opcional → `rejectOnlineOrder`.
  - **Extender**: diálogo con horas (por defecto `firmHoldHours`, 1–168) → `extendOnlineOrder`.
  - **Cancelar**: confirmación con motivo opcional → `cancelOnlineOrder`.
  - **Convertir en venta** por grupo: no se renderiza en esta tarea; lo agrega Task 6.
  - **WhatsApp** (`whatsapp-menu`): menú con las 5 plantillas; cada opción abre `buildWhatsAppUrl(customerPhone, renderTemplate(template, templateVars(...)))` en pestaña nueva; si la URL es `null`, el menú no aparece.
  - Cada botón tiene su propio estado `busy` y queda deshabilitado mientras su acción corre.

- [ ] **Step 1:** Implementar páginas y componentes según Interfaces, siguiendo el estilo de `components/cashea/cashea-view.tsx`.
- [ ] **Step 2: Verify** `npx tsc --noEmit && npm run lint` → 0 errores.
- [ ] **Step 3: Verify in browser** (Task 1, app local): en la copia local crear dos solicitudes con `shop.crear_solicitud` como `storefront` (una con 2 sucursales). Expected: aparecen en «Activas» con estado «Nueva»; el detalle muestra 2 grupos y el aviso de 2 facturas; aceptar cambiando una línea de sucursal → «Aceptada», vence en ~24 h; extender 2 h suma 2 h; rechazar la otra con motivo → «Rechazada»; el menú de WhatsApp abre `wa.me/58…` con el texto rellenado; doble clic en Aceptar no dispara dos llamadas.
- [ ] **Step 4: Commit** `feat(pedidos-online): lista y detalle con aceptar, rechazar, extender, cancelar y WhatsApp`.

---

### Task 5: Configuración → «Tienda online»

**Files:**
- Create: `components/configuracion/tienda-online-section.tsx`, `app/(app)/configuracion/online-actions.ts`
- Modify: `components/configuracion/configuracion-view.tsx` (sección `{ id: "tienda", label: "Tienda online", icon: Globe }` después de «Ventas»; se carga al abrirse como Catálogo)

**Interfaces:**
- Consumes: `getOnlineSettings` (Task 3), `DEFAULT_TEMPLATES` (Task 2).
- Produces (`online-actions.ts`): `loadOnlineStoreConfig(): Promise<{ data?: { settings: …; branches: { id: string; name: string; city: string; isActive: boolean; onlineEnabled: boolean }[]; canEditSettings: boolean; canEditBranches: boolean }; error?: string }>`; `saveOnlineSettings(input: { softHoldMinutes: number; firmHoldHours: number; storeWhatsapp: string | null; templates: Partial<Record<TemplateKey,string>> }): Promise<{ error?: string }>` — valida `softHoldMinutes` 5–240, `firmHoldHours` 1–168, `storeWhatsapp` vacío o E.164 (`^\+[1-9][0-9]{7,14}$`), plantillas ≤ 1000 caracteres; guarda vacías como ausentes (vuelven a la predeterminada); `setBranchOnline(branchId: string, enabled: boolean): Promise<{ error?: string }>` (exige `canEdit(Sucursales)`).
- UI: tiempos (minutos del apartado corto, horas del firme), WhatsApp de la tienda, 5 plantillas con la lista de variables disponibles (`{nombre} {numero} {lineas} {total} {sucursales} {vence} {motivo}`) y botón «Restaurar predeterminada», lista de sucursales con interruptor «Vende online». Controles deshabilitados según permisos.

- [ ] **Step 1: Write the failing test** `lib/online-orders/settings.test.ts` para `validateOnlineSettings(input)` (función pura en `lib/online-orders/settings.ts` que usan las acciones): `softHoldMinutes: 4` → `«El apartado corto debe estar entre 5 y 240 minutos»`; `firmHoldHours: 169` → `«El apartado firme debe estar entre 1 y 168 horas»`; `storeWhatsapp: "0414…"` → `«El WhatsApp de la tienda debe ir en formato +58…»`; válido → `null`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** función, acciones y sección. **Step 4: Run** `npx vitest run lib/online-orders && npx tsc --noEmit && npm run lint` → PASS.
- [ ] **Step 5: Verify in browser** (local): cambiar horas a 48 → aceptar un pedido nuevo vence en ~48 h; activar «Vende online» en una sucursal → aparece en `shop.branches` (consulta como `storefront`); editar la plantilla «aceptada» y verla en el menú de WhatsApp; restaurar.
- [ ] **Step 6: Commit** `feat(configuracion): sección Tienda online (tiempos, plantillas y sucursales)`.

---

### Task 6: Convertir en venta desde el POS

**Files:**
- Modify: `app/(app)/ventas/page.tsx` (lee `searchParams.pedido`), `components/ventas/pos-view.tsx` (prop opcional `onlineOrder`), `lib/sales/checkout-types.ts` (sin cambios si ya tiene `online_order_id`), `components/pedidos-online/order-detail.tsx` (botón por grupo)
- Create: `components/ventas/online-order-banner.tsx`, `lib/online-orders/pos.ts`
- Test: `lib/online-orders/pos.test.ts`

**Interfaces:**
- Consumes: `getOnlineOrderForPos` (Task 3), `canConvertGroup` (Task 2), `createPosCustomer` (`app/(app)/ventas/actions.ts`), `setActiveBranch` (`lib/branch-actions.ts`).
- Produces (`pos.ts`, puro):
  - `stockWithOwnHold(products: PosProduct[], order: PosOnlineOrder): PosProduct[]` — si `order.holdLive`, suma a `stock` de cada variante del pedido su `quantity` (son unidades propias apartadas); si no, sin cambios.
  - `cartFromOnlineOrder(order: PosOnlineOrder, products: PosProduct[]): { lines: CartLineSeed[]; missing: string[] }` — `CartLineSeed = { variantId: string; qty: number; price: number }` con `price = unitPrice` (precio congelado); `missing` = descripciones de variantes que no están en `products`.
- Flujo:
  - En el detalle, cada grupo `pendiente` con acción «convertir» muestra **Convertir en venta** si `canConvertGroup(...).ok`; si no, deshabilitado con `title` = `reason`. Al pulsar: si la sucursal activa ≠ `group.branchId`, `await setActiveBranch(group.branchId)`; luego `router.push(\`/ventas?pedido=${orderId}\`)`.
  - `/ventas?pedido=` carga `getOnlineOrderForPos(pedido, branchId activa)`. Si es `null`: toast «Ese pedido no tiene productos pendientes en esta sucursal» y POS normal.
  - El POS, con `onlineOrder`: banner `online-order-banner` («Convirtiendo pedido W-000123 · {cliente} · {teléfono}» con enlace «Ver pedido» y «Cancelar conversión» que limpia el modo y quita `?pedido`); carrito sembrado con `cartFromOnlineOrder` (precio de cada línea = precio congelado, editable como cualquier línea); `missing` en toast de aviso; cliente: si `matchedCustomerId` existe se selecciona; si no, el banner ofrece **Crear cliente del pedido** que llama `createPosCustomer({ name, phone, email, document, branch_id })` y lo selecciona. El cobro manda `online_order_id: onlineOrder.orderId` (ya soportado por el Route Handler). Tras cobrar con éxito: el banner cambia a «Pedido W-000123: venta FAC-… registrada» con enlace al pedido, y el modo pedido se limpia.
  - El modo pedido **no** se guarda en borradores de `localStorage`.
  - `online_orders.customer_id` no se rellena en esta fase (sólo lo escriben funciones de la base); el cliente queda en la venta (`sales.customer_id`).
  - Los topes anti-abuso de `online_settings` (unidades, líneas, solicitudes por teléfono, tope de exhibición) no se editan en esta fase: quedan con sus valores por defecto.

- [ ] **Step 1: Write the failing tests** `pos.test.ts`: `stockWithOwnHold` suma 2 a la variante V con `holdLive: true` y no suma con `false`; `cartFromOnlineOrder` usa `unitPrice` 31.25 aunque el producto cueste 35, y lista en `missing` una variante ausente.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** `npx vitest run && npx tsc --noEmit && npm run lint` → PASS (suite completa).
- [ ] **Step 5: Verify in browser** (local): pedido aceptado con 2 grupos (sucursales A y B). Desde el detalle, «Convertir» del grupo A abre el POS en A con el carrito y precios del pedido; crear el cliente del pedido; cobrar → factura; el pedido queda con A «vendido» y sigue «Aceptada»; «Convertir» de B → tras cobrar, pedido «Completada». Con un usuario atado a A, el botón de B está deshabilitado con «Sólo puedes vender en tu sucursal». Un pedido con la reserva vencida convierte si hay stock.
- [ ] **Step 6: Commit** `feat(ventas): convertir un pedido online en venta desde el POS`.

---

### Task 7: Aviso de solicitudes nuevas

**Files:**
- Create: `app/api/pedidos-online/resumen/route.ts`, `components/pedidos-online/new-orders-watcher.tsx`
- Modify: `components/shell/shell-data.ts` (`onlineNew: number` en `ShellSummary` y `EMPTY_SHELL_SUMMARY`), `lib/queries/shell.ts` (conteo con `countNewOnlineOrders`, sólo si `canView(Ventas)`), `components/shell/nav-items.ts` (`badgeKey: "onlineNew"` en «Pedidos online"; el tipo `badgeKey` pasa a `"lowStock" | "onlineNew"`), `components/shell/sidebar.tsx` (badge genérico por clave), `components/shell/app-shell.tsx` (monta el watcher)

**Interfaces:**
- Produces: `GET /api/pedidos-online/resumen` → `{ count: number; latestNumber: string | null; latestAt: string | null }` con `cache-control: no-store`, 401 sin sesión, 403 sin `canView(Ventas)`, filtrado por la sucursal activa. `NewOrdersWatcher` (cliente): consulta cada **60 s** (y al volver la pestaña a visible); si `latestAt` es más reciente que el último visto (en memoria; el primero no avisa), `toast` «Nueva solicitud online {latestNumber}» con acción «Ver» → `/pedidos-online/...` (o a la lista) y `router.refresh()` para el badge. Usa `AbortSignal.timeout(10_000)`; errores silenciosos.
- Pura: `shouldNotify(prev: string | null, next: string | null): boolean` en `lib/online-orders/rules.ts` (test: `null→x` false la primera vez se maneja en el watcher; `a<b` true; igual false; `b→null` false).

- [ ] **Step 1: Write the failing test** para `shouldNotify` en `rules.test.ts`. **Step 2: Run** → FAIL. **Step 3: Implement** todo lo de Files. **Step 4: Run** `npx vitest run && npx tsc --noEmit && npm run lint` → PASS.
- [ ] **Step 5: Verify in browser** (local): con la app abierta en `/dashboard`, crear una solicitud como `storefront`; en ≤ 60 s aparece el toast y el badge «Pedidos online» sube a 1; aceptarla → el badge baja tras navegar.
- [ ] **Step 6: Commit** `feat(pedidos-online): aviso y contador de solicitudes nuevas`.

---

### Task 8: Documentación y cierre

**Files:**
- Modify: `CLAUDE.md` (Convenciones: módulo «Pedidos online» — rutas, permisos, conversión desde el POS, aviso por sondeo de 60 s, Configuración → Tienda online, `scripts/dev-local.sh`), `docs/PROGRESS.md` (fila 17 y detalle), `docs/TIENDA-INTEGRACION.md` §12 (la sucursal se habilita en Configuración → Tienda online)

- [ ] **Step 1:** Actualizar los tres documentos.
- [ ] **Step 2: Run** `npm test && npx tsc --noEmit && npm run lint && npm run build` → todo verde.
- [ ] **Step 3: Commit** `docs(pedidos-online): módulo documentado`.
