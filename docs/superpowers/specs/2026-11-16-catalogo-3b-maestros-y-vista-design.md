# Catálogo 3b — maestros en Configuración y vista del catálogo

**Fecha:** 2026-11-16 · **Spec madre:** `2026-11-11-catalogo-listo-ecommerce-design.md` (§«Cambios en el
ERP → Configuración → maestros» y §9 «Vista de lectura») · **Antes:** plan 3a (editor de producto).

El usuario pidió «realiza tu propuesta» sin más preguntas; las decisiones de abajo son mías salvo
donde se dice otra cosa.

## Para qué

Que la tienda mantenga sola sus listas del catálogo (colores, tallas/amarres, características,
líneas, árbol de departamentos y categorías) sin pedírselo al desarrollador, y que exista una forma
de **ver el catálogo como lo verá la tienda en línea** (para revisarlo) y una **fuente de datos**
para el ecommerce (proyecto aparte, misma base).

## Hoy

- Configuración → «Inventario» tiene 4 tarjetas simples (`MasterCard`, `addMaster`/`deleteMaster`)
  que **chocan con la estructura nueva**: crean categorías sin departamento, colores sin hex real ni
  familia, editan `wm.sizes` (tabla vieja que el editor ya no usa) y **borran de verdad** (un color
  en uso → error de FK; una categoría → productos sin categoría; un valor de característica →
  se borra en cascada de los productos).
- Maestros en producción: 3 departamentos + 18 categorías, 15 marcas, 10 líneas, 88 colores en 8
  familias, 2 tipos de opción (Talla 11, Amarre 3), 10 características con 39 valores.
- RLS de todos los maestros: escribir exige `has_module('Inventario', 2)`.

## Objetivos

1. **Configuración → «Catálogo»** (reemplaza la sección «Inventario» y sus 4 tarjetas) con 5
   pestañas: **Categorías** (árbol de 2 niveles), **Marcas y líneas**, **Colores**, **Tallas y
   opciones**, **Características**.
2. Crear, renombrar, ordenar, activar/desactivar. **Borrar sólo lo que no se usa**; lo usado se
   desactiva (deja de ofrecerse en el editor sin romper nada). Mensaje: «En uso por N … Desactívalo
   en su lugar.» Tipos de opción y características no tienen `is_active`: se borran sólo si no se
   usan.
3. Renombrar un color (o cambiar su hex) o una talla/opción **actualiza el texto legado** de las
   variantes (`color`, `color_hex`, `size`), que POS, factura y reportes todavía leen.
4. **Vista en la base `wm.v_catalog`** (`security_invoker`, una fila por variante, sólo
   `authenticated`) con todo lo que el ecommerce necesita.
5. **Pantalla de solo lectura `/productos/catalogo`**: Departamento → Categoría → productos con
   foto principal, colores, fotos por color, tallas, características y si está «listo para tienda».

## No objetivos

- Familias de color editables (quedan las 8 fijas), muestra/imagen de color estampado (swatch),
  logo de marca, retiro de `wm.sizes` y de las columnas legado (plan 4), exponer la vista a `anon`
  (lo decide el proyecto del ecommerce), cambiar la RLS.

## Decisiones (mías)

- **Permiso:** editar maestros exige `canEdit(…, "Inventario")` (coincide con la RLS; sin migración
  de políticas). Sin ese permiso las pestañas se ven en modo lectura.
- **Slug:** se genera del nombre al crear y **no cambia al renombrar** (será URL de la tienda);
  si choca se agrega `-2`, `-3`… Se puede editar a mano en el diálogo.
- **Unicidad sin distinguir mayúsculas:** colores por nombre; valores de opción por tipo; valores
  de característica por característica; líneas por marca; categorías y marcas por nombre (la base
  ya lo exige con mayúsculas exactas).
- **Árbol de 2 niveles:** departamento (sin padre) → categoría (padre = departamento). Sólo las
  categorías llevan tipo de opción, «exige color» y características (con «obligatoria»). Un
  departamento no se desactiva mientras tenga categorías activas. Una categoría se puede mover de
  departamento.
- **Cambiar el tipo de opción de una categoría** se permite con aviso: las variantes existentes no
  se tocan y el indicador del editor las marca (comportamiento del 3a).
- **Texto legado:** disparadores en la base (`SECURITY DEFINER`) al actualizar `wm.colors.name/hex`
  y `wm.option_values.label`: atómico y cubre a cualquier escritor.
- **Orden:** flechas subir/bajar (como las fotos del 3a); se guarda `sort_order` 0..n.
- **Caché:** toda escritura invalida `getCatalogMasters` y `getCatalogRefs` y revalida
  `/configuracion` y `/productos`.
- **Vista:** columnas de producto (id, nombre, slug, descripción, ficha, activo, visible), marca,
  línea, departamento, categoría, variante (id, sku, activa, precio), color (id, nombre, hex,
  familia), opción (tipo, valor, orden), características del producto (jsonb
  `[{attribute, values[]}]`), fotos del color de la variante y fotos generales (jsonb de rutas en
  orden), stock por sucursal (jsonb) y total. El cálculo de «foto principal» queda al consumidor.
- **Pantalla:** usa las consultas de TypeScript del 3a (foto principal con `pickMainPhoto`,
  `productReadiness`) para coincidir exactamente con el editor; no lee la vista. Botón «Ver
  catálogo» en `/productos`. Filtros: buscar, departamento/categoría, marca, «sólo listos».

## Migración

`supabase/catalog_view.sql`: disparadores de texto legado + `wm.v_catalog`. Aditiva. Se prueba con
`supabase/tests/catalog_view_rollback.sql` (transacción con ROLLBACK contra producción) y se aplica
**sólo con confirmación del usuario**; luego se pliega a `apply_pending.sh` y al bootstrap.

## Riesgos que un usuario notaría

1. Desactivar un color que tiene variantes: el editor lo muestra «(inactivo)» y no deja elegirlo
   para variantes nuevas; las existentes siguen vendiéndose.
2. Renombrar «Azul Marino» → el POS y la factura muestran el nombre nuevo en las variantes (las
   ventas pasadas conservan su copia en `sale_items.description`).
3. Dos personas editando la misma lista: gana la última escritura (aceptado).
4. Borrar algo en uso: bloqueado con el número de usos.
5. Catálogo con 339 productos: la pantalla carga en una sola consulta por tabla (sin N+1).
