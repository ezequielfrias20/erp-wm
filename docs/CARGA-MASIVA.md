# Carga masiva por Excel — Productos e Inventario

Guía de las plantillas `.xlsx` para cargar el catálogo y el inventario sin tipear
registro por registro. Las columnas de catálogo (categoría, marca, talla, color, SKU,
sucursal) son **listas desplegables** para evitar errores de tipeo.

Helpers técnicos en `lib/excel.ts` (ExcelJS): `buildWorkbookBlob`, `downloadBlob`,
`parseSheet`. Las listas se guardan en una hoja oculta y se referencian por rango.

---

## Productos (módulo Productos → botones Plantilla / Importar / Exportar)

Componente: `components/productos/bulk-bar.tsx`. Acciones de servidor:
`importProducts` y `getProductsExport` en `app/(app)/productos/actions.ts`.

La plantilla tiene **dos hojas**:

### Hoja `Productos` (1 fila por producto)
| Columna | Tipo | Notas |
|---|---|---|
| Nombre | texto | Obligatorio. Clave para enlazar variantes. |
| Categoría | lista ▼ | Debe existir en el sistema (Configuración → Inventario). |
| Marca | lista ▼ | Debe existir (Configuración → Inventario → Marcas). |
| % IVA | número | Por defecto 16. |
| Visible en catálogo | lista ▼ (Sí/No) | Por defecto Sí. |
| Descripción | texto | Opcional. |

### Hoja `Variantes` (1 fila por variante; se agrupa por el nombre del producto)
| Columna | Tipo | Notas |
|---|---|---|
| Producto | texto | Debe coincidir con un Nombre de la hoja Productos (texto libre). |
| Talla | lista ▼ | Opcional. |
| Color | lista ▼ | Opcional; el color hex se toma del maestro de colores. |
| Precio (USD) | número | |
| Costo (USD) | número | |
| SKU (opcional) | texto | Si se deja vacío se **autogenera** `[CAT]-[slug]-[0001]`. |
| Código de barras | texto | Opcional. |

### Reglas de importación
- Productos: se **upsertan por nombre** (si existe, se actualiza; si no, se crea).
- Variantes: se **upsertan por (producto + talla + color)**. Si la variante existe, se
  actualizan precio/costo/color/código; si no, se crea (con SKU dado o autogenerado).
- SKU autogenerado: `[abreviatura categoría]-[slug del nombre]-[correlativo 0001]`
  (correlativo por prefijo, resuelto en servidor — ver `lib/sku.ts`).
- El resultado muestra creados/actualizados/omitidos y una lista de avisos (p. ej. categoría
  o marca inexistente).
- **Exportar** vuelca el catálogo actual con la misma estructura (sirve de respaldo y para
  re-importar).

---

## Inventario (módulo Inventario → botones Plantilla / Importar / Exportar)

Componente: `components/inventario/inventario-view.tsx`. Acción de servidor:
`importInventory` en `app/(app)/inventario/actions.ts`.

Plantilla con **una hoja** `Inventario`:

| Columna | Tipo | Notas |
|---|---|---|
| Producto (SKU) | lista ▼ | Lista de variantes existentes (`SKU — Producto Talla Color`). |
| Sucursal | lista ▼ | Ciudad de la sucursal (también acepta el código: CCS, VLN…). |
| Stock | número | Existencia. |
| Reservado | número | Opcional; si se omite, no se resetea el valor previo. |
| Mínimo | número | Opcional; si se omite, no se resetea el valor previo. |

### Reglas de importación
- Se mapea SKU → variante y sucursal (ciudad/código) → sucursal. Las filas que no
  coincidan se omiten (se reporta el conteo).
- Upsert por `(variant_id, branch_id)`. `reservado` y `mínimo` omitidos conservan su valor.
- También se acepta un **CSV** con cabeceras `sku, sucursal, stock, reservado, minimo`
  (o pegar el texto) como alternativa a la plantilla `.xlsx`.
- **Exportar** genera un `.xlsx` re-importable (más columnas informativas de sólo lectura).

---

## Prerrequisitos
- Crear primero **Categorías, Marcas, Tallas y Colores** en
  **Configuración → Inventario** para que aparezcan en las listas desplegables.
- Para inventario, los **productos/variantes** deben existir antes (cargar Productos primero).
