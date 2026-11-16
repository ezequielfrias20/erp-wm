# Catálogo listo para ecommerce — hoja de ruta

**Spec:** `docs/superpowers/specs/2026-11-11-catalogo-listo-ecommerce-design.md`

El spec se implementa en **cuatro planes secuenciales**. Cada uno deja software funcionando y
verificable por sí solo. Rama de trabajo: `feat/catalogo-ecommerce`.

| # | Plan | Entrega | Depende de | Estado |
|---|------|---------|------------|--------|
| 1 | `2026-11-11-catalogo-01-esquema-y-excel-revision.md` | Esquema nuevo (aditivo) aplicado en producción + Excel de revisión generado desde una foto de producción, listo para enviar a la tienda | — | aplicado 2026-11-13 |
| 2 | `2026-11-15-catalogo-02-limpieza.md` — Simulación y aplicación de la limpieza | Lector del Excel revisado, validación contra el «Criterio de éxito», detección de cambios posteriores a la foto, SQL de aplicación (maestros, fusiones, divisiones, alias de SKU, fotos → `product_media`, registro de correspondencias, texto legado `color`/`size` sincronizado con los nombres canónicos), simulación con `ROLLBACK`, aplicación real y verificación | Plan 1 + Excel devuelto por la tienda | aplicado 2026-11-16 |
| 3 | ERP adaptado | Maestros en Configuración, editor de producto (árbol, línea, atributos, ficha técnica, generador de variantes, fotos por color), indicador «listo para tienda» y filtro «incompletos», búsqueda por alias de SKU en POS/inventario, foto principal desde `product_media`, vista de lectura del catálogo | Plan 1 (se desarrolla mientras la tienda revisa); **se despliega después del plan 2** | en curso |
| 4 | Guardas y retiro de lo viejo | Unicidad de variantes, obligatoriedad, vistas leyendo de los maestros, retiro de `color`/`color_hex`/`size` y de `wm.sizes`, plantillas de carga masiva nuevas que rechazan valores desconocidos, retiro de `scripts/import-*.mjs` y `scripts/restore-final-prices.mjs`, documentación (`CLAUDE.md`, `docs/PROGRESS.md`, `docs/CARGA-MASIVA.md`) | Planes 2 y 3 desplegados | por escribir |

## Por qué este orden

- El Excel (plan 1) es el camino crítico: la revisión de la tienda puede tardar semanas.
- El ERP nuevo (plan 3) se construye en paralelo a esa revisión, pero se despliega **después**
  de aplicar la limpieza (plan 2). Así nunca tiene que convivir con datos sin limpiar.
- La aplicación (plan 2) escribe a la vez las claves nuevas (`color_id`, `option_value_id`) y
  el texto legado con el nombre canónico. El ERP actual sigue funcionando entre el plan 2 y el
  despliegue del plan 3.
- Las guardas (plan 4) van al final, cuando ya no queda código que lea el texto legado.

## Desviación consciente del spec

El spec menciona un «relleno automático seguro de `color_id`» en la fase 1. Se omite: en la
fase 1 apuntaría a colores que la limpieza va a fusionar. El plan 2 asigna todas las claves
en una sola transacción.
