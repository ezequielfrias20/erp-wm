# Catálogo organizado y clasificado (listo para ecommerce) — diseño

**Fecha:** 2026-11-11
**Estado:** aprobado (2026-11-11), pendiente de plan de implementación

## Intención

El cliente (World Medics, tienda **multimarca** de uniformes médicos y equipos médicos,
2 sucursales: Maracay y San Juan de los Morros) va a tener un ecommerce. Ese ecommerce se
construirá **después y en otro proyecto**, y leerá **directo de esta misma base de Supabase**
(catálogo, precios y stock de una sola fuente).

Este proyecto **no** construye el ecommerce. Su objetivo es dejar el catálogo del ERP tan
ordenado y clasificado que el ecommerce solo tenga que **leer y filtrar**, sin arreglar datos.
Hoy no es posible: un mismo modelo está partido en decenas de productos, la «talla» se usa
para cualquier cosa, los colores son texto libre y duplicado, y no hay dónde poner fotos por
color.

La tienda es multimarca, así que **filtrar es lo más importante**: por marca, color, modelo
(línea), género (dama/caballero) y talla, y además por atributos propios de cada tipo de
producto. Los filtros tienen que funcionar **entre marcas** (filtrar «jogger» o «stretch»
debe traer Figs, World Medics y cualquier otra marca a la vez). Referencia de la experiencia
buscada: wearfigs.com (producto = modelo; el color es una opción con sus propias fotos y no
va en el nombre; la talla es la otra opción; filtros por tipo de producto).

## Estado actual (medido en producción el 2026-11-11, solo lectura)

- **433 productos, 1.103 variantes, 52 categorías, 11 marcas, 47 «tallas», 85 colores.**
- **Modelos partidos en muchos productos:** «Figs Dama» existe 38 veces y «Figs Caballero» 18
  veces, cada uno con **una sola** variante (un color y una talla). Los gorros (129 productos,
  la categoría más grande) son un producto por diseño y por amarre: «Gorro Baby Yoda Moño» y
  «Gorro Baby Yoda Tiras» son dos productos.
- **Los uniformes World Medics sí están bien armados:** un producto por modelo
  («Mao Stretch Dama Recta») con variantes color × talla. Su nombre ya codifica línea, tela,
  género y corte.
- **La «talla» se usa para cualquier cosa:** amarres (Moño 53, Tiras 36, Elástica 10),
  diseños (Bob Esponja, Mafalda, Stitch…), Con Voz/Sin Voz, Genérico/Original, y restos de
  una importación con sucursal y precio pegados («XS · San Juan de los Morros · $35»). Esos
  restos **no** son precios por sucursal: el precio y la sucursal ya están en sus campos.
- **Colores sucios:** `product_variants.color` es **texto libre** (más `color_hex` copiado), sin
  vínculo con `wm.colors`. El maestro tiene duplicados (mostaza/Mostaza, Verde Oliva/Verde
  Olivo, Verde Qx/Verde Quirófano, «Naranja *», «Caqui *»), 20 colores con el hex de relleno
  `#0EA5E9` (el azul de la marca), y estampados guardados como color («Cuadrada Azul»,
  «Pinguino Lila»).
- **Variantes repetidas:** 25 grupos (57 variantes, 32 sobrantes) con mismo producto + color
  + talla. Ej.: «Amarillo M» ×4 en Mao Stretch Dama Recta.
- **Categorías planas e inconsistentes:** 52, muchas con un solo producto y algunas casi
  repetidas («Plantilas ECG»/«Plantilla ECG», «ORL»/«ORL Generico»). «Uniformes» es un solo
  saco de 92 productos que además contiene bolsos Figs y un «Modelo anatómico Diente».
- **Datos faltantes:** 123 productos sin marca, 27 sin categoría, 147 sin descripción,
  141 variantes sin color ni talla, 10 variantes con precio 0.
- **Fotos:** existe **una foto por producto** (181 archivos en `wm-public/product-images/{productId}.png`,
  helper `lib/product-images.ts`). No hay fotos por color.
- **Historial que no se puede perder:** 3.683 ventas y 5.328 líneas de venta apuntan a
  `product_variants`. Las líneas guardan además una copia en texto
  (`sale_items.description`, p. ej. «Mao Stretch Dama Recta (Color: Rosado, Talla: M)»), así
  que el historial se sigue leyendo aunque cambien los nombres.
- **El precio varía por talla dentro de un mismo color** (71 casos, p. ej. L/XL más caras):
  el precio se queda **por variante**.

## Objetivos

1. **Nueva estructura del catálogo:**
   **Departamento → Categoría → Producto (modelo) → Color (con fotos) → Segunda opción (con stock)**.
2. **Listas fijas compartidas (maestros)** para marca, línea/modelo, colores (con familia),
   tallas/opciones y atributos de filtro. Nada de texto libre en lo que se filtra.
3. **Limpieza de los datos actuales** mediante un Excel de revisión semiautomático
   (ver «Proceso de limpieza»), aplicado de una sola vez sin perder historial.
4. **Pantallas del ERP adaptadas:** editor de producto con atributos por categoría y fotos
   por color, maestros en Configuración, plantillas de Excel de carga masiva actualizadas.
5. **Guardas para que el desorden no vuelva:** la base y la app impiden colores/tallas a
   mano, variantes repetidas y productos incompletos sin que se note.

## Criterio de éxito (lo más importante)

**Todo el catálogo activo queda clasificado**, de modo que el ecommerce pueda filtrar por
cualquier dimensión definida sin arreglar datos. Concretamente, al terminar la limpieza:

- El **100 %** de los productos activos tiene categoría de 2.º nivel (y por lo tanto
  departamento), **marca** y **todos los atributos obligatorios** de su categoría (género,
  corte, tela, etc. según corresponda). Línea/modelo donde la marca la tenga.
- El **100 %** de las variantes activas tiene su color y su segunda opción tomados de los
  maestros cuando su categoría los usa. Cero texto libre en lo que se filtra.
- **Cero** variantes repetidas, **cero** colores duplicados, **cero** valores que no sean talla
  dentro de las tallas.
- Las dimensiones filtrables son: departamento, categoría, marca, línea/modelo, color y
  familia de color, talla/opción, cada atributo de la categoría, precio y disponibilidad por
  sucursal. Agregar un filtro nuevo después (un atributo nuevo) es **cargar datos**, no
  cambiar código.

Esto es **bloqueante**: la simulación rechaza el Excel si algún producto o variante activa
queda sin clasificar, y la limpieza no se aplica hasta que esté completo. Lo que **no** bloquea
(porque depende de que la tienda tome fotos y escriba textos) son las fotos y las
descripciones; eso lo sigue el indicador «listo para tienda» (§8).

## No objetivos

- Construir el ecommerce, su conexión, exponer datos a `anon`, carrito, pagos o reserva de
  stock online. (Se acordó que leerá esta misma base, pero eso es otro proyecto.)
- Decidir de qué sucursal sale el stock online.
- Tomar o conseguir las fotos (el proyecto da dónde subirlas, no las fotos).
- Precios por sucursal.
- Separar uniformes en piezas: **los uniformes siempre se venden como conjunto** (un conjunto
  = un producto).

## Anti-objetivos (sería un fracaso aunque «funcione»)

- Perder o romper el historial: ventas, líneas de venta, órdenes de compra o el stock por
  sucursal.
- Que el POS, el inventario o los reportes dejen de funcionar durante o después del cambio.
- Que el desorden vuelva al mes porque el sistema todavía permite escribir colores o tallas
  a mano, crear variantes repetidas o dejar productos sin clasificar sin que nadie lo vea.
- Meter la taxonomía específica de World Medics en el bootstrap multi-negocio (los otros
  negocios arrancan con maestros genéricos, no con «Mao Stretch»).

## Restricciones

- **Producción en uso** (`cfggippjujceebovvhsa`, esquema `wm`): el POS vende todos los días.
  La aplicación de la limpieza debe ser una transacción corta, en horario sin ventas.
- **Claves foráneas actuales que muerden:** `inventory.variant_id` es `ON DELETE CASCADE`
  (borrar una variante borra su stock) y `sale_items.variant_id` /
  `purchase_order_items.variant_id` son `ON DELETE SET NULL` (borrar una variante desvincula
  ventas). Por eso **fusionar = re-apuntar referencias y sumar stock primero, borrar después**.
  Nunca borrar una variante o producto con referencias sin re-apuntarlas.
- **Migraciones** como `.sql` idempotentes en `supabase/` aplicados con `psql -1 -f`
  (producción no tiene `supabase_migrations`). Al cambiar el esquema: actualizar
  `lib/database.types.ts` (tipos a mano) y el snapshot `supabase/bootstrap/01_schema.sql`;
  seeds genéricos en `02_seed.sql`.
- **RLS:** lectura para miembros activos; escritura con `wm.has_module('Productos', 2)`.
  Las tablas nuevas siguen el mismo modelo.
- **Los SKU actuales se conservan** (puede haber etiquetas/códigos impresos). Al fusionar
  productos, las variantes conservan su SKU.
- **Quien revisa la clasificación es personal de la tienda**, no técnico, y le llega el Excel
  por medio del desarrollador. El Excel debe entenderse solo: español, listas desplegables,
  instrucciones en una hoja aparte.
- La app debe **funcionar entre fases**: el esquema nuevo entra de forma aditiva y el código
  no puede depender de datos que aún no se limpiaron.
- **El catálogo se sigue editando** (última edición de productos/variantes: 2026-11-10) y la
  revisión de la tienda puede tardar semanas. *Mi llamada:* **no** se congela el catálogo.
  El Excel lleva la fecha de la foto de datos; la simulación detecta y lista lo creado o
  modificado después (por `created_at`/`updated_at`), y eso se resuelve en una segunda ronda
  corta con la tienda antes de aplicar. Se le pide a la tienda evitar crear productos nuevos
  durante la revisión, pero el proceso no depende de que lo cumpla. Los editores nuevos de la
  fase 3 deben funcionar con datos sin limpiar o salir a producción después de la limpieza.
- **Códigos de barras:** ninguna variante tiene `barcode` hoy (0 de 1.103); el POS busca por
  texto de SKU.
- **World Medics es el único negocio en producción** (confirmado por el cliente, 2026-11-11).
  Las guardas y el retiro de las columnas de texto se aplican **sin modo de compatibilidad**
  para catálogos sin limpiar. Los negocios nuevos arrancan desde `supabase/bootstrap/` ya con
  la estructura nueva y las guardas activas, con maestros genéricos (familias de color, tallas
  base, tipos de opción) y sin la taxonomía de World Medics.

## Diseño

### 1. Jerarquía: departamento → categoría

Dos niveles. Los productos cuelgan del **segundo nivel**. Propuesta inicial de árbol (la tienda
la valida en el Excel; ver Apéndice A para el mapeo de las 52 categorías actuales):

- **Uniformes:** Conjuntos · Batas y chaquetas · Gorros
- **Equipos médicos:** Estetoscopios · Tensiómetros · Oxímetros · Termómetros ·
  Otoscopios y ORL · Glucómetros y consumibles · Exploración física · Terapia y rehabilitación ·
  Instrumental y práctica · Repuestos y accesorios de equipos
- **Accesorios:** Identificación (lanyards, portacarnets, pines) · Bolsos y morrales ·
  Papelería · Otros accesorios

*Mi recomendación de forma:* `categories.parent_id` (autorreferencia) + `slug` único, en vez
de una tabla `departments` aparte. Queda a criterio del builder.

### 2. Producto = modelo

- El **nombre no lleva color** (ni talla, ni amarre). «Figs Dama» ×38 pasa a ser 1 producto
  (o tantos como modelos Figs reales haya; eso lo dice la tienda en el Excel).
- **Dama y caballero son productos distintos** (como Figs), con el atributo Género.
- Campos del producto: nombre, `slug` único, categoría (2.º nivel), **marca** (obligatoria),
  **línea/modelo** (opcional, ver §3), descripción, atributos (§4), `visible_in_catalog`
  (= publicado en tienda; ya existe), `tags` (ya existe).
- *Mi llamada:* una **ficha técnica** opcional `specs` (lista clave → valor, p. ej.
  «Composición», «Garantía», «Incluye») para que los equipos y las telas tengan detalle sin
  inventar columnas por tipo. El builder decide si es `jsonb` o tabla.

### 3. Marca y línea

- **Marca** pasa a ser central (filtro principal en una tienda multimarca): `brands` gana
  `slug`, `logo_url` y `description` para poder tener páginas «Comprar por marca».
- **Línea / modelo** (Mao, Altu, Esencial, Básico, Cargo, Pro, Colors, Elite… en World Medics;
  los modelos de Figs que la tienda identifique): maestro **propio de cada marca**
  (`brand_id` + nombre + slug). Es el filtro «modelo» que pidió el cliente.
- Duda abierta para la tienda (va en el Excel): ¿«Gorro Med» y «Toons» son marcas o líneas?

### 4. Atributos de filtro (definidos por datos)

Los filtros dependen del tipo de producto, así que se definen como datos, no como columnas:

- **Atributo** (código, nombre, si es selección única o múltiple) con sus **valores**
  (nombre, slug, orden). Cada **categoría** declara qué atributos aplican y cuáles son
  obligatorios. Así el ecommerce puede preguntar «¿qué filtros tiene Conjuntos?» y obtener
  la respuesta de la base.
- Atributos iniciales propuestos:
  - **Género** (Dama / Caballero / Unisex) — uniformes, gorros cuando aplique.
  - **Corte** (Recta / Ancha / Jogger) — conjuntos.
  - **Tela** (Stretch / Mic / Algodón / Poliéster…) — conjuntos y batas.
  - **Largo** (Corta / Larga) — batas y chaquetas.
  - **Diseño / temática** — gorros (animales, personajes, especialidades…).
  - **Tipo** (Digital / Manual / Doble manguera…) y **Voz** (Con voz / Sin voz) — tensiómetros.
  - *Mi sugerencia, opcional:* **Especialidad** (Enfermería, Odontología, Bioanálisis,
    Anestesiología…) multiselección, como el «Shop by profession» de Figs; varios gorros ya
    son temáticos de especialidad.
- Los valores son **compartidos entre marcas** (un solo «Jogger» para todas).

### 5. Variantes: color × segunda opción

- **Eje 1: Color** — `color_id` hacia el maestro de colores (deja de ser texto libre).
  Es el eje que lleva las fotos.
- **Eje 2: una opción tipada según la categoría** — Talla en uniformes, **Amarre**
  (Moño / Tiras / Elástica) en gorros, Presentación donde haga falta; los equipos
  normalmente no tienen segundo eje. Los valores salen de un maestro.
  *Mi recomendación de forma:* tipos de opción + valores de opción, y la categoría dice qué
  tipo usa; la UI rotula el eje según el tipo («Talla», «Amarre»). Alternativa aceptable:
  conservar `sizes` y añadirle un `kind`. Lo decide el builder.
- **El stock, el precio, el costo, el SKU y el código de barras siguen en la variante**
  (la unidad física que se cuenta en el estante es «Blanco XS»).
- **Unicidad:** no puede haber dos variantes del mismo producto con el mismo color y la misma
  opción (restricción única en la base; los nulos cuentan como valor para esta regla).
- **SKU de variantes fusionadas:** al fusionar duplicadas desaparecen 32 SKU. De los 25 grupos,
  19 variantes tienen stock y en 2 grupos hay stock en más de una variante, así que puede
  haber unidades etiquetadas con un SKU que deja de existir. *Mi llamada:* tabla de **alias de
  SKU** (SKU viejo → variante sobreviviente) y la búsqueda del POS e inventario la consulta.
  Es pequeña y evita reetiquetar.
- Las columnas de texto actuales (`color`, `color_hex`, `size`) se mantienen solo durante la
  transición y luego se retiran o quedan como solo-lectura de respaldo (decisión del builder),
  siempre que POS, reportes y factura lean de los maestros.

### 6. Colores

- Un solo maestro limpio: nombre, slug, **hex real**, **familia** (Azules, Verdes, Rojos,
  Rosados, Morados, Amarillos/Naranjas, Neutros, Estampados/Multicolor).
- Un color puede ser un **estampado**: se permite una imagen de muestra (swatch) en lugar del
  hex. Detalle de forma: builder.
- Duplicados se fusionan (mostaza/Mostaza → Mostaza). Los «colores» que en realidad son
  diseños se resuelven en el Excel (pasan a color estampado o a atributo Diseño).

### 7. Fotos

- Tabla de medios del producto: producto, **color opcional** (vacío = foto general del
  producto), ruta en storage, texto alternativo, orden. La primera del color es la principal
  de ese color; la primera general (o, si no hay, la del primer color) es la principal del
  producto.
- Storage: bucket existente `wm-public`, carpeta `product-images/` (forma exacta de las rutas:
  builder). Formatos y tamaño máximo actuales (`lib/product-images.ts`: jpeg/png/webp, 4 MB).
- **Migración de las 181 fotos existentes:** cada foto pasa a ser una fila de medios. Si el
  producto viejo se fusiona en otro y tenía un solo color (caso Figs y gorros), la foto queda
  asignada **a ese color** del producto destino; si no, queda como foto general.
- Las pantallas que hoy muestran la foto (POS, inventario, productos) pasan a usar la foto
  principal del producto.

### 8. Indicador «listo para tienda»

*Mi llamada:* cada producto muestra si está **completo**: categoría de 2.º nivel, marca,
atributos obligatorios de su categoría, descripción, al menos una foto por cada color con
variantes activas, y ninguna variante con precio 0. La lista de productos permite filtrar
«incompletos». Es la herramienta para que el catálogo se mantenga listo después de la limpieza.

### 9. Vista de lectura del catálogo

*Mi llamada:* una vista plana `security_invoker` (producto + marca + línea + categoría y
departamento + atributos + variantes con color/opción/precio + foto principal + stock por
sucursal) que sirve hoy para verificar la limpieza y mañana como punto de partida del
ecommerce. **No** se expone a `anon` en este proyecto.

## Proceso de limpieza

1. **Respaldo** de las tablas de catálogo, inventario, `sale_items` y
   `purchase_order_items` antes de tocar nada.
2. **Esquema nuevo, aditivo:** tablas y columnas nuevas, nulas, sin restricciones que rompan
   los datos viejos. Se hace un relleno automático de lo seguro (p. ej. `color_id` cuando el
   texto coincide exactamente con un color del maestro).
3. **Generar el Excel de revisión** con un script que **propone** la clasificación:
   - **Productos:** fila por producto actual → producto destino (agrupación para fusionar),
     nombre nuevo, departamento/categoría, marca, línea, atributos. Para los uniformes World
     Medics la propuesta sale de parsear el nombre (línea, tela, género, corte); Figs y gorros
     se agrupan por nombre base sin color/amarre.
   - **Variantes:** fila por variante → producto destino, color propuesto, opción propuesta
     (separando lo que hoy está mal en «talla»), y marca de **duplicada → fusionar con SKU X**.
     *Mi llamada:* el producto destino se elige **por variante** y puede ser un **producto
     nuevo**, así que un producto actual se puede **dividir** además de fusionar (p. ej. Con
     Voz / Sin Voz, Genérico / Original, o un diseño de gorro que hoy está en «talla» y debe
     ser su propio producto). Al dividir, la foto del producto viejo se copia como foto
     general a cada producto destino, y la tienda la corrige después si hace falta.
   - **Colores, categorías, marcas:** mapeo de lo actual a lo canónico (hex y familia en
     colores).
   - Hoja **Instrucciones** y listas desplegables en todas las columnas de maestros.
4. **La tienda revisa y corrige** (el desarrollador le hace llegar el archivo).
5. **Importar en modo simulación:** valida el Excel corregido y produce un reporte (errores,
   fusiones que se harán, productos que quedarán vacíos, stock antes/después por sucursal) sin
   escribir nada. **Si algún producto o variante activa queda sin la clasificación del
   «Criterio de éxito», la simulación falla** y el reporte lista exactamente qué falta, para
   devolverlo a la tienda.
6. **Aplicar en una sola transacción**, fuera de horario de ventas:
   crear maestros → fusionar productos (re-apuntar variantes y fotos al destino) → fusionar
   variantes duplicadas (sumar stock por sucursal en la sobreviviente, re-apuntar
   `sale_items` y `purchase_order_items`, luego borrar la sobrante) → asignar atributos,
   colores y opciones → borrar productos que quedaron vacíos. Guardar un **registro de
   correspondencias** viejo → nuevo (producto y variante) para trazabilidad.
7. **Verificar:** stock total por sucursal igual al de antes; número de líneas de venta con
   variante igual al de antes; ninguna variante sin color/opción donde la categoría lo exige;
   se cumple el «Criterio de éxito» completo (consultas de conteo que deben dar 0 faltantes).
8. **Activar las guardas:** restricción de unicidad de variantes, `NOT NULL` donde aplique,
   y retirar el uso de las columnas de texto viejas.

*Mi llamada:* los scripts de generación/aplicación son de **un solo uso** y viven en el repo
(p. ej. `scripts/catalogo/`), ejecutados por el desarrollador contra producción; **no** son una
pantalla del ERP.

*Mi llamada — reportes históricos:* los reportes y el dashboard leen categoría y producto a
través de la variante (`v_sale_lines`, `v_customer_favorites`), así que después de la limpieza
**el historial se reagrupa con la estructura nueva** (p. ej. todas las ventas de los 38
«Figs Dama» suman en un solo producto). Es lo deseable para comparar periodos. Seguro de
respaldo: el registro de correspondencias guarda el producto, la categoría y la marca **viejos**
de cada variante, así que la vista antigua se puede reconstruir si alguna vez hace falta.
`sale_items.description` y las facturas no cambian.

*Mi llamada — scripts viejos de carga:* `scripts/import-inventory.mjs`,
`scripts/import-products-inventory.mjs` y `scripts/restore-final-prices.mjs` (última
modificación en agosto, carga inicial) son de donde viene buena parte del desorden y chocarían
con las guardas nuevas. Se retiran; las cargas masivas pasan solo por las plantillas del ERP.

## Cambios en el ERP

- **Editor de producto:** categoría en árbol, marca, línea filtrada por marca, atributos según
  la categoría, ficha técnica, descripción; **generador de variantes** (elegir colores y tallas
  → crea las combinaciones); sección de **fotos por color** con orden; indicador «listo para
  tienda».
- **Configuración → maestros:** categorías (árbol), marcas (logo, slug, descripción), líneas
  por marca, colores (hex obligatorio, familia), opciones/tallas por tipo, atributos y valores,
  qué atributos aplica cada categoría. Crear un color exige hex y familia.
- **Lista de productos:** filtros por departamento, categoría, marca, línea, atributo y
  «incompletos».
- **Carga masiva (Excel):** plantillas nuevas con las columnas nuevas y listas desplegables;
  la importación **rechaza** valores que no existan en los maestros (no los crea sola).
- **POS, inventario, reportes, factura, cierres:** leen color y opción desde los maestros; la
  presentación «Color / Talla» se mantiene. `sale_items.description` sigue guardando la copia
  en texto.
- **Documentación:** `CLAUDE.md`, `docs/PROGRESS.md`, `docs/CARGA-MASIVA.md`, tipos y
  snapshot del bootstrap.

## Fases sugeridas

1. Esquema aditivo + relleno automático seguro (la app sigue igual).
2. Script del Excel de revisión → se envía a la tienda.
3. ERP adaptado a la estructura nueva (puede avanzar mientras la tienda revisa).
4. Simulación → aplicación de la limpieza en producción → verificación.
5. Guardas activadas + retiro de columnas de texto + plantillas de carga masiva nuevas.

El orden exacto y la partición en tareas quedan para el plan.

## Lo que queda al builder

- Forma exacta de las tablas (nombres, `parent_id` vs tabla aparte, opción tipada vs `kind`),
  índices y políticas RLS (siguiendo el modelo existente).
- Formato de rutas de fotos y si se generan miniaturas.
- Si `specs` es `jsonb` o tabla.
- Formato del registro de correspondencias y del reporte de simulación.
- Si las columnas de texto viejas se borran o quedan como respaldo de solo lectura.
- Parseo de nombres y heurísticas de agrupación para la propuesta del Excel.

## Apéndice A — Mapeo propuesto de categorías actuales

Propuesta inicial; la tienda la corrige en el Excel.

| Nuevo (departamento / categoría) | Categorías actuales |
|---|---|
| Uniformes / Conjuntos | Uniformes (salvo lo que no es conjunto), Estampadas |
| Uniformes / Batas y chaquetas | Batas Médicas; chaquetas y batas largas hoy en «Uniformes» |
| Uniformes / Gorros | Gorros, Gorro Migraña |
| Equipos médicos / Estetoscopios | Estetoscopio |
| Equipos médicos / Repuestos y accesorios de equipos | Accesorio Esteto, Respuesto Littmann |
| Equipos médicos / Tensiómetros | Tensiometro |
| Equipos médicos / Oxímetros | Oximetro |
| Equipos médicos / Termómetros | Termometro |
| Equipos médicos / Otoscopios y ORL | Otoscopio, Video Otoscopio, ORL, ORL Generico, Kit De Exploracion |
| Equipos médicos / Glucómetros y consumibles | Glucometro, Lancetas, Tiras Reactivas |
| Equipos médicos / Exploración física | Martillo Reflejo, Martillo Taylor, Linternas, Puntador Lasser, Cinta Metrica, Goniometro, Plicometro, Doppler, Plantilas ECG, Plantilla ECG |
| Equipos médicos / Terapia y rehabilitación | Tens, Nebulizador, Cinta Kinestesica, Bandas Elasticas, Medias Compresivas |
| Equipos médicos / Instrumental y práctica | Tijeras Trauma, Kit De Sutura, Torniquetes, Pad De Practica, Kit, Kit Generico + Pad, «Modelo anatómico Diente» |
| Accesorios / Identificación | Lanyard, Portacarnet, Pines |
| Accesorios / Bolsos y morrales | Bolso, Morral, Portadocumentos, bolsos Figs hoy en «Uniformes» |
| Accesorios / Papelería | Libretas, Boligrafo, Libro |
| Accesorios / Otros accesorios | Rompe Ampollas, Control, Maxikoala (por confirmar) |
