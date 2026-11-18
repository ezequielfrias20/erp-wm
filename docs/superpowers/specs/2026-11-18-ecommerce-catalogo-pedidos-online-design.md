# Tienda online (catálogo + solicitudes) y módulo «Pedidos online» — diseño

Fecha: 2026-11-18 · Estado: listo para aprobación

## 1. Intención

El cliente (World Medics) quiere una tienda web que muestre **su propio catálogo e inventario**
(productos, variantes, fotos, precios, disponibilidad) leído en vivo del ERP, sin duplicar datos.
La venta no se cobra en la web: el comprador **solicita** y la tienda gestiona el cobro y la entrega
por WhatsApp. El ERP sigue siendo la única fuente de verdad de catálogo, stock y ventas.

Debe ser **seguro**: la web pública no puede leer nada del negocio que no sea el catálogo, ni
escribir en el ERP salvo crear una solicitud validada.

## 2. Objetivos, no-objetivos, anti-objetivos

**Objetivos (fase 1)**
- Catálogo público: departamentos/categorías, marca, línea, color, talla/opción, características,
  fotos (por color y generales), precio USD (+ VES con tasa BCV), disponibilidad **por sucursal**.
- El comprador elige **la sucursal de cada producto**; el carrito se agrupa por sucursal y avisa
  cuando hay más de una («serán N facturas y N envíos»).
- Checkout sin cuenta: nombre, teléfono (WhatsApp), correo opcional, cédula opcional, nota.
- Al enviar se crea una **solicitud** en el ERP que **aparta el stock por poco tiempo**.
- Módulo ERP **Pedidos online**: ver, aceptar (con apartado firme), rechazar, extender, cancelar,
  escribir al cliente por WhatsApp con texto preparado, y **convertir en venta** vía POS (una venta
  por sucursal).
- Los apartados vigentes descuentan disponibilidad en la tienda **y en el POS**.

**No-objetivos (fase 1)**
- Pago en línea, cuentas de cliente, carritos guardados en servidor, cupones.
- Envío automático de WhatsApp (API de Meta). Queda un punto de enganche para conectarla después.
- Cálculo de costos de envío / integración con transportistas.
- Diseño visual de la tienda (marca, maquetas): se define en un paso propio; este documento cubre
  función, datos y seguridad.

**Anti-objetivos (sería un fracaso aunque funcione)**
- Que la tienda pueda leer costos, proveedores, ventas, clientes, usuarios o datos fiscales.
- Que alguien pueda **bloquear inventario** con solicitudes falsas en masa.
- Que el POS venda unidades que están apartadas para un pedido online (o al revés).
- Que el stock se descuente dos veces, o que una venta quede sin descontar su apartado.
- Que la tienda caiga si el ERP (la app Next.js) cae, o que el ERP caiga por tráfico de la tienda.

## 3. Decisiones tomadas con el cliente

| Tema | Decisión |
|---|---|
| Alcance fase 1 | Solo catálogo + solicitud; cobro por WhatsApp gestionado por la tienda. |
| Stock mostrado | Suma de todas las sucursales, mostrando en qué sucursal está cada producto. |
| Pedido → venta | **Convertir en venta**: el pedido abre el POS con el carrito cargado; se cobra con el flujo normal (pagos mixtos, Cashea, factura, cierre diario). |
| Apartado | Dos etapas: **corto** al crear la solicitud; **firme** cuando la tienda acepta. Vencido → se libera solo. |
| Sucursal | **La elige el comprador** por producto. Al aceptar, el personal puede cambiarla. |
| Varias sucursales | Se avisa al comprador: facturas y envíos distintos. Una venta por sucursal. |
| WhatsApp | La tienda escribe al cliente desde el ERP (enlace `wa.me` con texto preparado). |
| Confirmación al cliente | Fase 1: pantalla de confirmación + correo si lo dejó. WhatsApp automático (Meta) después, sin rehacer nada. |
| Arquitectura | App aparte + rol de base de datos propio (`storefront`) que solo ve el esquema `shop`. |
| Bloqueo en mostrador | Solo se protege lo apartado: el POS no puede vender unidades apartadas para pedidos online; fuera de eso, igual que hoy. |

## 4. Enfoques considerados

1. **App aparte + rol de BD `storefront` sobre esquema `shop` (ELEGIDO).** La BD pone el límite:
   aunque la tienda tenga un fallo, no puede tocar `wm`. Tienda y ERP se despliegan y caen por
   separado. Coste: segundo repo; copiar utilidades pequeñas (formato, BCV).
2. App aparte que llama a una API dentro del ERP (`/api/tienda/*` con secreto). Descartado: el ERP
   necesitaría una credencial amplia para atender a la tienda, y acopla disponibilidad.
3. Tienda dentro del repo del ERP. Descartado: superficie pública en la misma app que la
   administración; mayor radio de daño ante un error de configuración.
4. Exponer `shop` por PostgREST con la anon key. Descartado: `crear_solicitud` sería llamable en
   bucle desde el navegador sin verificación anti-bots → bloqueo de inventario.

## 5. Arquitectura

```
Navegador ──▶ Tienda (Next.js, repo propio, deploy propio)
                 │ solo servidor (RSC / Route Handlers / Server Actions)
                 │ Postgres: rol storefront vía pooler de transacciones (6543)
                 ▼
          Supabase ERP (cfggippjujceebovvhsa)
            shop.*  (vistas + funciones SECURITY DEFINER)  ← único acceso del rol
            wm.*    (sin permisos para storefront)
Fotos: URL pública del bucket (no pasan por la BD)
ERP (Next.js existente): módulo Pedidos online + POS + create_sale
```

### 5.1 Rol `storefront`
- `create role storefront login password '<secreto>' noinherit;` sin `bypassrls`, sin
  pertenencia a `authenticated`/`anon`/`service_role`.
- `grant usage on schema shop`; `grant select` sobre las vistas `shop.*`;
  `grant execute` sobre `shop.crear_solicitud` (y cualquier otra función `shop.*` de lectura).
- **Ningún** `grant` sobre `wm`. `revoke all on schema wm from storefront` explícito (y de
  `public` donde aplique) para que un `grant ... to public` futuro no lo abra.
- Las vistas `shop.*` **no** usan `security_invoker` (el rol no tiene acceso a `wm`); son vistas
  propiedad de `postgres` que filtran y proyectan columnas. Por eso **solo** se concede `select` a
  `storefront` (nunca a `anon`/`authenticated`).
- `shop` **no** se añade a `pgrst.db_schemas`.
- Conexión desde la tienda: usuario `storefront.cfggippjujceebovvhsa` en
  `aws-1-us-west-2.pooler.supabase.com:6543` (modo transacción, sin sentencias preparadas).
  La contraseña vive solo en variables de entorno del deploy de la tienda.
- Límites del rol: `alter role storefront set statement_timeout = '5s'` y límite de conexiones.

### 5.2 Esquema `shop` (contrato público, solo lectura salvo una función)
Vistas (nombres orientativos; el constructor puede ajustar):
- `shop.products` / `shop.variants` (o una sola `shop.catalog` derivada de `wm.v_catalog`):
  solo productos `is_active and visible_in_catalog` **y «listo para tienda»** (mismos criterios que
  `productReadiness` en `lib/catalog/readiness.ts`: categoría de 2.º nivel, marca, descripción,
  características obligatorias de la categoría, foto por cada color activo —o una general si hay un
  solo color— o al menos una foto si no hay colores; la versión SQL debe mantenerse en sync con la
  de TS y llevar una prueba que lo compare). Variantes `is_active`. Columnas de comprador:
  ids, slugs, nombre, descripción, specs, marca, línea, departamento/categoría, color (nombre, hex,
  familia, slug), opción (tipo, etiqueta, orden), características, fotos (color y generales),
  precio. **Nunca** `cost`, proveedor, ni stock crudo.
- `shop.availability`: por variante y sucursal habilitada para online, **disponible** =
  `quantity − apartados vigentes`, mínimo 0 (el `inventory.reserved` manual **no** cuenta: hoy no se
  resta en ningún lado y puede estar desactualizado), con **tope de exhibición**
  (p. ej. se muestra «10+» por encima de 10). Incluye nombre/ciudad de la sucursal, no su stock real
  por encima del tope.
- `shop.branches`: sucursales activas con `online_enabled`: id, nombre, ciudad, dirección
  pública, teléfono público.
- `shop.taxonomy`: departamentos/categorías, marcas, familias de color, tipos de opción (para
  filtros y navegación).
- `shop.settings`: nombre comercial, logos, colores de marca (lo mismo que `wm.branding()`), y los
  parámetros públicos de la tienda (número de WhatsApp de la tienda si se muestra, textos).

Función de escritura (la única):
- `shop.crear_solicitud(p jsonb) returns jsonb` — `SECURITY DEFINER`, `search_path` fijo, ejecutable
  solo por `storefront`. Ver §6.2.

### 5.3 Fotos
- Se sirven por URL pública del bucket (`wm-public/product-images/...`). La vista devuelve rutas;
  la tienda arma la URL pública y usa `next/image` (o transformaciones de Supabase).
- **Corrección de seguridad incluida en el proyecto:** la política `for select to public` sobre
  `storage.objects` del bucket `wm-public` (`01_schema.sql` ~1141) permite **listar** todo el
  bucket (incluidos `avatars/` del personal) con la anon key. Se **reemplaza** por una política
  `select` solo para `authenticated` (Storage necesita `select` para `remove()` y upsert, que el ERP
  usa al borrar fotos y assets de marca). Las URLs públicas del bucket siguen funcionando sin
  política para `anon`. Probar después: subir/borrar foto de producto, logo y avatar en el ERP.

## 6. Modelo de datos y reglas (ERP)

### 6.1 Tablas nuevas en `wm` (orientativo)
- `online_orders`: número legible (`W-000001`, secuencia propia), datos del comprador (nombre,
  teléfono normalizado E.164 +58, correo, cédula, nota), estado, `soft_expires_at`,
  `firm_expires_at`, `accepted_by`, `accepted_at`, `rejected_reason`, `customer_id` (se enlaza al
  convertir), timestamps, IP/huella de origen para abuso.
- `online_order_items`: variante, sucursal elegida, cantidad, **precio unitario congelado** al crear
  (leído de la BD, nunca del cliente), descripción congelada (nombre, color, opción, SKU),
  `sale_id` (se llena al convertir).
- Apartados: se derivan de `online_order_items` de pedidos en estado vigente (no se usa
  `inventory.reserved`, que es un número **manual** editable en Inventario/Excel).
- `branches.online_enabled boolean not null default false` — la sucursal decide si vende online.
- Configuración (en `settings` o tabla propia): minutos del apartado corto (default **30**),
  horas del apartado firme (default **24**), plantillas de mensaje WhatsApp, topes anti-abuso.

### 6.2 Estados y apartados

```
solicitada ──(tienda acepta)──▶ aceptada ──(todas las sucursales convertidas)──▶ completada
    │                              │  └─(se convierte una parte)─▶ (sigue aceptada, parcial)
    ├─(vence corto)─▶ vencida      ├─(vence firme)─▶ vencida
    ├─(tienda rechaza)─▶ rechazada └─(tienda cancela)─▶ cancelada
```

- **Vigencia sin depender de tareas programadas:** un apartado cuenta solo si el pedido está en
  `solicitada` con `soft_expires_at > now()` o en `aceptada` con `firm_expires_at > now()` y la línea
  aún no tiene `sale_id`. El estado «vencida» que ve el personal se calcula igual; un job opcional
  (pg_cron) puede fijarlo en la tabla, pero la disponibilidad **nunca** depende de él.
- **`shop.crear_solicitud`** (en una transacción):
  1. Valida forma y topes: máx. unidades por línea (p. ej. 10), por pedido (p. ej. 30), máx. líneas,
     teléfono válido, máx. **solicitudes vigentes por teléfono** (p. ej. 2).
  2. Para cada línea, bloquea la fila `inventory (variant, branch)` (`for update`, en orden estable
     para evitar interbloqueos), comprueba variante activa/visible, sucursal `online_enabled`, y
     disponible ≥ cantidad. Si falla alguna, rechaza **toda** la solicitud con el detalle por línea.
  3. Inserta pedido + líneas con precio y descripción congelados desde la BD.
  4. Devuelve número, vencimiento, líneas agrupadas por sucursal y totales.
- **Aceptar** (ERP, permiso Ventas 2): por línea el personal puede **cambiar la sucursal** (solo a
  una con disponible suficiente, revalidado con bloqueo), **reducir cantidad o quitar** una línea.
  No se agregan productos (eso se conversa por WhatsApp y se maneja en el POS). Pasa a `aceptada`
  con `firm_expires_at = now() + horas`.
- **Rescatar vencidos:** una solicitud cuyo apartado corto venció (y que no fue rechazada ni
  cancelada) **se puede aceptar igual**: aceptar revalida disponibilidad con bloqueo y vuelve a
  apartar; si no alcanza, el personal ve qué líneas faltan y puede ajustar (cambiar sucursal, reducir
  o quitar). Lo mismo para convertir un grupo aceptado cuyo apartado firme venció (ver §6.3).
- **Extender**: suma horas al apartado firme.
- **Rechazar / cancelar**: libera al instante; motivo opcional.

### 6.3 Convertir en venta (por sucursal)
- En el pedido, cada grupo de sucursal tiene **«Convertir en venta»**. Abre el POS en esa sucursal
  con un borrador cargado: líneas del grupo con el **precio congelado del pedido**, y el cliente
  resuelto (buscar por cédula o teléfono; si no existe, crearlo con los datos del pedido al
  confirmar).
- El POS envía un identificador del grupo (`online_order_id` + `branch_id`) en el checkout.
  `create_sale` (nueva versión) en la **misma transacción**: valida que el grupo exista y esté
  `aceptada`. Si su apartado firme sigue vigente, esas unidades se toman del apartado; si **venció**
  (el cliente pagó tarde), se convierte igual validando contra el disponible normal y, si no alcanza,
  se rechaza con el detalle. Luego descuenta inventario, escribe
  `sale_id` en esas líneas (lo que **consume** el apartado) y, si ya no quedan grupos sin venta,
  pasa el pedido a `completada`. Idempotente: un grupo ya convertido no se convierte dos veces.
- El personal puede editar el carrito en el POS (p. ej. el cliente cambió de talla por WhatsApp).
  Regla: las líneas que coinciden con el grupo consumen su apartado; cualquier línea extra se valida
  contra disponible normal. Si el carrito ya no contiene una línea del grupo, esa línea se libera.
- Una venta anulada después no reabre el pedido (fase 1).
- **Marca de venta online:** `sales.online_order_id` (nullable, FK a `online_orders`) para que
  Reportes y Dashboard puedan separar ventas online de las de mostrador (filtro/columna «Canal»).
- **Caja, cierre y comisión:** la venta convertida es una venta normal **de esa sucursal**: el dinero
  va a la caja de la sucursal según el método de pago (`source = 'sale'` en el cierre diario), y la
  comisión es del vendedor seleccionado en el POS, como cualquier venta.

### 6.4 Disponibilidad en el POS y en `create_sale`
- Hoy el POS muestra `v_inventory.quantity` y `create_sale` descuenta con `greatest(0, …)` **sin
  validar** stock en el servidor. Cambio:
  - POS muestra y limita por **disponible** (`quantity − apartados vigentes`), y ve
    cuánto está apartado (p. ej. «3 disp. · 2 apartados online»).
  - `create_sale` bloquea las filas de inventario y valida en el servidor con la regla **«solo se
    protege lo apartado»** (decisión del cliente): si la variante **no** tiene apartados vigentes en
    esa sucursal, la venta se comporta como hoy (puede vender aunque el sistema diga 0;
    `greatest(0, …)`). Si **sí** tiene apartados vigentes (de otros pedidos), rechaza la venta cuando
    la cantidad supere `quantity − apartados vigentes`, con mensaje claro por producto
    («2 unidades apartadas para pedidos online»). Las unidades apartadas del propio grupo que se
    está convirtiendo sí se pueden vender. No hay anulación por gerente en fase 1.
  - El POS, en el cliente, aplica la misma regla para avisar antes de cobrar.
- Inventario (pantalla) muestra la columna «Apartado online» por sucursal.

### 6.5 Notificaciones
- **Al cliente (fase 1):** pantalla de confirmación con número, sucursales, vencimiento y aviso de
  que la tienda le escribirá por WhatsApp; correo si lo dejó (proveedor de correo que ya usa el ERP,
  enviado desde el servidor de la tienda). Punto de enganche único
  `notifySolicitudRecibida(pedido)` en la tienda: hoy correo; mañana también WhatsApp (API Meta).
- **A la tienda:** contador de solicitudes nuevas en el menú «Pedidos online» y aviso en pantalla
  (sonner) al llegar una nueva mientras el ERP está abierto. Mecanismo a elección del constructor
  (sondeo ligero o Realtime), sin exponer datos a `anon`.
- **WhatsApp desde el ERP:** botón por pedido con plantilla según el estado (recibida, aceptada con
  instrucciones de pago, rechazada, producto no disponible, por vencer). Abre
  `https://wa.me/<telefono>?text=<mensaje>`. Las plantillas se editan en Configuración e interpolan
  número, nombre, líneas, totales por sucursal y vencimiento.

## 7. Tienda (app nueva)

- Next.js 16 + React 19 + TypeScript + Tailwind v4 (mismo stack que el ERP). Repo y deploy propios.
- Datos solo desde el servidor con `postgres` (cliente SQL) usando el rol `storefront`. Nada de
  Supabase en el navegador.
- Páginas: inicio, listado por departamento/categoría con filtros (marca, familia de color, talla,
  disponibilidad, sucursal), ficha de producto (selector de color → fotos de ese color; selector de
  opción; disponibilidad por sucursal; elegir sucursal y cantidad), carrito agrupado por sucursal
  con aviso de facturas/envíos distintos, checkout, confirmación.
- Carrito en el navegador (localStorage). Antes del checkout se revalida contra el servidor.
- Precios en USD con equivalente VES por tasa BCV (misma fuente que el ERP, caché 1 h).
- Caché: catálogo con ISR/`revalidate` (p. ej. 5 min) y disponibilidad más fresca (p. ej. 30–60 s o
  al cargar la ficha). Revalidación por webhook desde el ERP: opcional, no en fase 1.
- Anti-abuso del checkout: Cloudflare Turnstile verificado en servidor; límite por IP en el Route
  Handler/Server Action; la RPC aplica además los topes por teléfono y unidades.
- Seguridad web: cabeceras (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`), sin datos del
  ERP en el bundle del cliente salvo lo que se renderiza.
- SEO básico: slugs (ya existen en productos/marcas/categorías/colores), metadata, sitemap.

## 8. Multi-negocio y despliegue
- La tienda se construye para World Medics, pero **sin datos del negocio en el código**: marca,
  textos y parámetros salen de `shop.settings`; la conexión y secretos, de variables de entorno.
  Así otro negocio puede desplegar la misma app con su propio proyecto Supabase. Integrarla a
  `/nuevo-negocio` no entra en fase 1.
- Repo nuevo hermano del ERP (p. ej. `wm-tienda`), creado por el dueño del proyecto.
- Todo lo nuevo de BD como `.sql` idempotente en `supabase/` + plegado en
  `supabase/bootstrap/01_schema.sql`/`02_seed.sql` y en `apply_pending.sh` (como el resto).
  El rol `storefront` se crea sin contraseña en el script; la contraseña se fija a mano por negocio.
- Tipos en `lib/database.types.ts`; `CLAUDE.md` y `docs/PROGRESS.md` actualizados.

## 9. Pruebas
- SQL con rollback (`supabase/tests/`):
  - `storefront` no puede leer ni escribir nada de `wm` (select/insert/update/delete en tablas
    clave, funciones `wm.*`), ni `storage.objects`.
  - `shop.*` no expone `cost` ni stock por encima del tope.
  - `crear_solicitud`: aparta; rechaza si no hay disponible; topes por teléfono y unidades; precio
    tomado de la BD aunque el cliente mande otro.
  - Vencimiento corto/firme libera sin job.
  - `create_sale`: sin apartados se comporta como hoy (vende aunque el sistema diga 0); con
    apartados de otro pedido rechaza lo que pase de `quantity − apartados`; consume el apartado del
    propio grupo; idempotente.
  - Concurrencia: dos solicitudes simultáneas por la última unidad → una gana.
- Reglas puras en TS (agrupado por sucursal, armado de mensajes WhatsApp, normalización de
  teléfono) con pruebas unitarias.

## 10. Fases sugeridas
1. **Base en el ERP:** esquema `shop`, rol, tablas de pedidos, apartados, disponibilidad,
   `create_sale` con validación + conversión, POS/Inventario mostrando disponible, política de
   storage corregida. Pruebas SQL.
2. **Módulo Pedidos online** en el ERP (lista, detalle, aceptar/rechazar/extender/cancelar,
   WhatsApp, convertir en venta, configuración de tiempos y plantillas, `online_enabled`).
3. **Tienda** (repo nuevo).

## 11. Decisiones mías (revisables)
- Permiso del módulo: reutiliza **Ventas** (nivel 1 ver, 2 gestionar) en vez de un módulo nuevo en
  la matriz.
- Tiempos por defecto 30 min / 24 h; topes 10 u./línea, 30 u./pedido, 2 solicitudes vigentes por
  teléfono; tope de exhibición «10+».
- `branches.online_enabled` por defecto `false` (cada sucursal se activa a mano).
- Al convertir se respeta el **precio congelado** del pedido aunque el precio del producto haya
  cambiado después.
- Al aceptar se puede cambiar sucursal, reducir o quitar líneas; no agregar.
- En la tienda solo sale lo **visible y listo para tienda** (no basta `visible_in_catalog`, que por
  defecto es `true`): un producto sin fotos o sin clasificar no se publica.
- El `inventory.reserved` manual no cuenta para la disponibilidad.
- Solicitudes y grupos vencidos se pueden rescatar si todavía hay stock.
- La venta convertida queda marcada (`sales.online_order_id`), entra a la caja de su sucursal y la
  comisión es del vendedor del POS.
- Tienda reutilizable por configuración, no por código.

## 12. Lo que queda al constructor
- Nombres exactos de vistas/columnas/funciones de `shop`, forma del JSON de `crear_solicitud`.
- Mecanismo del aviso en el ERP (sondeo vs Realtime) y job opcional de limpieza de vencidas.
- Proveedor de hosting de la tienda y de límite por IP; librería SQL concreta.
- Diseño de pantallas del módulo Pedidos online siguiendo el sistema visual del ERP.
