# Catálogo — 3a: editor de producto con fotos por color — diseño

**Fecha:** 2026-11-16
**Estado:** aprobado (2026-11-16)
**Spec padre:** `docs/superpowers/specs/2026-11-11-catalogo-listo-ecommerce-design.md` (§«Cambios
en el ERP», §7 Fotos, §8 «listo para tienda»). Hoja de ruta: `docs/superpowers/plans/2026-11-11-catalogo-00-hoja-de-ruta.md` (plan 3).

## Intención

La limpieza (plan 2, aplicada el 2026-11-16) dejó el catálogo de producción clasificado:
producto = modelo, variantes = color × talla/amarre tomados de maestros, categorías en árbol,
características por categoría y fotos en `wm.product_media`. Pero el ERP sigue con el editor
viejo: **una sola foto por producto**, color y talla como **texto libre**, categoría plana y sin
características. Todo lo que la tienda cree o edite desde ahí vuelve a quedar sin clasificar.

Se va a construir un ecommerce (otro proyecto) que lee esta misma base. Para que pueda mostrar
cada modelo con sus colores, **fotos por color** y tallas, la tienda tiene que poder mantener el
catálogo desde el ERP. El 3a es la pantalla para eso: el editor de producto nuevo. Después la
tienda toma las fotos y las sube desde la computadora.

## Objetivos

1. **Editor de producto** (`/productos/[id]`) que lee y escribe la estructura nueva: categoría de
   2.º nivel, marca, línea, características según la categoría, ficha técnica, colores con
   fotos y variantes color × opción desde los maestros.
2. **Fotos por color**: varias por color, más fotos generales del modelo, con orden y principal.
3. **Indicador «listo para tienda»** en el editor y filtro **«incompletos»** en la lista.
4. Que el resto del ERP **no rompa ni ensucie**: la foto principal sale de `product_media` en
   lista de productos, POS e inventario; el POS e inventario encuentran SKU viejos (alias); el
   texto legado (`color`, `color_hex`, `size`) se sigue escribiendo con el nombre canónico.

## No objetivos (3b u otros planes)

- Maestros en Configuración (árbol de categorías, líneas, colores con familia, opciones,
  características): **3b**. En 3a se usan los maestros tal como los dejó la limpieza; no se
  crean colores, tallas, líneas ni valores nuevos desde el editor.
- Vista de lectura para el ecommerce: **3b**.
- Guardas en la base (unicidad, `NOT NULL`), retiro de `color`/`size` en texto y de `wm.sizes`,
  plantillas de carga masiva nuevas: **plan 4**.
- Subir fotos desde el celular, cámara, recorte o edición de imágenes (se suben desde la
  computadora, ya editadas).

## Anti-objetivos

- Que crear o editar un producto o variante desde el ERP deje color o talla sin maestro.
- Perder o desligar las 177 fotos existentes (sus rutas son `product-images/<id viejo>.png`).
- Que POS, inventario, reportes o factura dejen de funcionar o muestren otra cosa.
- Duplicar una variante (mismo producto, color y opción).

## Restricciones

- Estilo del ERP (tokens del handoff, componentes `Card`, `Label`, shadcn) y sus patrones:
  lectura en Server Components, mutaciones con Server Actions en `app/(app)/productos/actions.ts`,
  `requireProductsEdit()` como guarda, `audit(...)`, `revalidatePath` de `/productos`,
  `/inventario` y `/ventas`.
- RLS: lectura cualquier miembro; escritura `has_module('Productos', 2)` en `products`,
  `product_variants`, `product_attribute_values`, `product_media`, `variant_sku_aliases`.
  Los maestros (`colors`, `option_values`, `attributes`…) son de solo lectura en 3a.
- Server Actions con `bodySizeLimit: "8mb"` (`next.config.ts`): una foto por envío, hasta
  **6 MB**, JPG/PNG/WebP (ampliación de los 4 MB actuales: son fotos de computadora).
- Bucket `wm-public`; las fotos nuevas van a `product-images/<productId>/<mediaId>.<ext>`. Las
  177 rutas viejas se conservan tal cual.
- Producción en uso diario: no hay migración de esquema prevista. Si hiciera falta una, es aditiva
  e idempotente (`supabase/*.sql`, bootstrap y `apply_pending.sh`).
- **Fotos sueltas al desplegar** (*mi llamada*): hoy hay 5 archivos `product-images/<id>.png` sin
  fila en `product_media` (y el editor viejo puede subir más hasta que se despliegue el 3a, porque
  escribe sólo el archivo). Al desplegar se corre un paso idempotente que, para cada
  `product-images/<productId>.png` de un producto que existe y sin fila, crea su fila como foto
  General. Desde el 3a, nada escribe fotos sin su fila.

## Enfoques considerados

1. **Ampliar el editor actual en la misma página** — elegido. Todo el producto en un lugar, con
   el estilo actual; las fotos quedan junto al aviso de qué falta.
2. Datos en el editor y fotos en `/productos/[id]/fotos` — una pantalla dedicada a cargar en lote,
   pero separa el aviso «faltan fotos de Negro» de donde se arregla.
3. Asistente paso a paso — bueno para crear, malo para lo que más se hará ahora (agregar fotos a
   productos existentes). Descartado.

## Diseño

### 1. Página del editor (`/productos/[id]`)

Mismo esqueleto de columnas que hoy. Tarjetas:

- **Encabezado**: nombre, activo/visible (como hoy) y la insignia **«Listo para tienda»** o
  **«Incompleto (N)»**; al abrirla, la lista de lo que falta con un enlace a su sección.
- **Información**: nombre, descripción (como hoy) y **ficha técnica** (`products.specs`,
  pares etiqueta → valor; agregar, editar, quitar, ordenar).
- **Clasificación** (reemplaza «Organización»):
  - Categoría: selector agrupado por departamento (sólo categorías de 2.º nivel).
  - Marca; **Línea** filtrada por la marca (vacía si la marca no tiene líneas).
  - **Características**: una por cada atributo de la categoría (`category_attributes`), con su
    lista de valores; obligatorias marcadas; las de selección múltiple (Especialidad) permiten
    varios valores. Al cambiar de categoría se muestran las de la nueva y se avisa que las que
    no aplican se quitan al guardar.
  - Etiquetas (como hoy).
- **Colores y fotos** (reemplaza «Galería del producto»): ver §2.
- **Variantes**: ver §3.
- **Precios**, **Estado** e **Inventario**: como hoy.

### 2. Colores y fotos

- Fila de **chips**: «General» + un chip por cada color que tiene variantes del producto o fotos.
  Cada chip muestra la muestra del color (hex), el nombre y el número de fotos; con ⚠ si el
  color tiene variantes activas y 0 fotos.
- Al elegir un chip se ven **sus fotos** en cuadrícula, en orden. La primera es la
  **principal** (★) de ese color. Acciones: subir (botón o **arrastrar varias a la vez** desde la
  computadora), reordenar (arrastrar o flechas), marcar como principal (la pasa al primer lugar)
  y borrar (con confirmación).
- Cada subida es un envío independiente (una foto por Server Action) con barra de avance por
  archivo; si una falla, las demás siguen y la fallida queda marcada con el motivo.
- **Foto principal del producto** (la que usan lista, POS e inventario y después el ecommerce):
  la primera «General»; si no hay generales, la principal del primer color con variantes activas
  (orden de los chips).
- Borrar una foto borra su fila de `product_media` y su archivo en storage, salvo que otra fila
  use la misma ruta.
- Las 177 fotos existentes aparecen en su chip (65 por color, el resto en «General»).

### 3. Variantes

- Lista **agrupada por color**; cada fila: opción (talla/amarre), SKU, precio, costo, stock por
  sucursal, activo, editar y borrar.
- **Borrar con historia** (*mi llamada*, sigue al spec padre: «nunca borrar con referencias»): no
  se puede borrar una variante con ventas o compras, con stock en alguna sucursal o con SKU alias;
  se ofrece **Desactivar** con el motivo. Igual para el producto: no se borra si alguna de sus
  variantes no se puede borrar. Hoy 773 variantes tienen ventas o compras. Borrar sigue
  disponible para lo creado por error (sin historia, sin stock, sin alias).
- El **segundo eje** lo dice la categoría (`categories.option_type_id`): Talla, Amarre o ninguno.
  El color se pide si la categoría lo exige (`requires_color`); si no, es opcional.
- **Diálogo de variante**: color (lista de `wm.colors` activos, con muestra y búsqueda), opción
  (valores del tipo de la categoría, en su orden), SKU (autogenerado si se deja vacío), precio,
  costo, stock inicial por sucursal (sólo al crear), activo. **No hay texto libre** para color ni
  opción.
- **Generar combinaciones**: se marcan colores y valores de opción; se muestran las
  combinaciones que **faltan** (las que ya existen salen marcadas y deshabilitadas); se indica
  precio y costo para todas; crea las variantes con SKU automático y stock 0.
- Toda escritura de variante:
  - guarda `color_id` y `option_value_id`;
  - **sincroniza el texto legado** `color` = nombre del color, `color_hex` = su hex,
    `size` = etiqueta de la opción (o `null`);
  - rechaza duplicados (mismo producto, color y opción, con `null` como valor) con un mensaje
    claro;
  - si el producto cambia de categoría a otra con distinto tipo de opción o que exige color, las
    variantes que quedan sin lo exigido se marcan en el indicador (no se borran ni se cambian).
- `generateSku` también evita los SKU que existen como alias (`variant_sku_aliases`), para no
  reemitir un SKU fusionado.

### 4. «Listo para tienda»

Función pura `productReadiness(product, …) → { ready: boolean, missing: Missing[] }` en `lib/`,
con tests, usada por el editor y por la lista. Falta algo si:

- no tiene categoría de 2.º nivel, o no tiene marca;
- le falta alguna característica obligatoria de su categoría;
- no tiene descripción;
- **fotos** (*mi llamada*): cada color con variantes activas tiene al menos una foto de ese color;
  si el producto tiene **un solo color**, una foto General también vale; si sus variantes no
  tienen color, basta una foto cualquiera. Se aplica según los colores de las variantes, no según
  `requires_color`: hay 219 variantes de equipos con color (p. ej. estetoscopios) y el ecommerce
  muestra fotos por color también para ellos;
- alguna variante activa tiene precio 0, o le falta el color o la opción que exige su categoría.

La **línea no cuenta** para «listo» (*mi llamada*): que una marca tenga líneas no significa que
todos sus productos pertenezcan a una (p. ej. «Estuche para Estetoscopio» de Littmann). Hoy hay
32 productos activos sin línea con marca que sí tiene líneas; la línea queda como opcional.

Se calcula sólo para productos activos. Guardar **no se bloquea** por estar incompleto (para no
frenar una venta); el bloqueo en la base es del plan 4.

### 5. Lista de productos (`/productos`)

- Miniatura = foto principal (§2).
- Filtros: departamento, categoría, marca, línea, color, talla/opción y **«Incompletos»**
  (más la búsqueda actual). Contador de incompletos visible.
- **Nuevo producto**: diálogo con nombre, categoría y marca obligatorios; al crear, abre el editor.

### 6. POS e inventario

- Miniaturas desde la foto principal (§2) en vez de `product-images/<id>.png`.
- Buscar por SKU también encuentra los **alias**: un SKU fusionado muestra la variante que lo
  absorbió (el carrito y la venta usan la variante real).
- **Entradas de SKU en Inventario** (*mi llamada*): la entrada manual de stock acepta un SKU alias
  y la registra en la variante real. La importación de stock por Excel también traduce los alias;
  si un archivo trae un SKU viejo y su variante real (o dos alias de la misma), esas filas se
  rechazan con su número de fila, porque la importación *fija* la cantidad y una pisaría a la
  otra en silencio.

### 7. Datos que hoy no se tocan

- La carga masiva por Excel (`lib/excel.ts`) sigue escribiendo texto (plan 4). Lo que entre por
  ahí aparece como incompleto en el indicador.
- `wm.sizes` y la tarjeta «Tallas» de Configuración siguen como están (3b / plan 4).

## Lo que queda al builder

- Reparto en componentes y archivos, y si la lógica de lectura va en `lib/queries/` o en la página.
- Cómo se ordenan y reordenan las fotos (arrastrar con una librería ya presente o flechas) y la
  interacción exacta del arrastre de archivos.
- Texto de los mensajes y del indicador, siguiendo el tono del ERP.
- Si la foto principal se resuelve en SQL (vista/consulta) o en TypeScript.
- Cómo se ve la ficha técnica (lista editable simple).
