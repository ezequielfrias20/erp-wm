# Limpieza del catálogo (runbook del desarrollador)

Reorganización del catálogo para que quede clasificado y listo para el ecommerce.
Diseño: `docs/superpowers/specs/2026-11-11-catalogo-listo-ecommerce-design.md` ·
Hoja de ruta: `docs/superpowers/plans/2026-11-11-catalogo-00-hoja-de-ruta.md`.

Los archivos generados (fotos JSON y Excel) contienen datos del negocio y viven en
`backups/catalogo/`, que **no** se commitea.

## Conexión a producción

Los scripts leen la contraseña de `.env.local` (línea `SUPABASE_DB_URL=…@db.<ref>.supabase.co…`)
y conectan por el pooler en modo sesión. Para consultas a mano:

```bash
scripts/catalogo/psql.sh -X -c "select count(*) from wm.products"
```

No hagas `source scripts/catalogo/pg-env.sh` en tu terminal: la contraseña quedaría en el
entorno de la sesión.

**TLS:** para que se verifique el certificado del servidor, descarga el certificado de
Supabase (Project Settings → Database → SSL Configuration → Download certificate) y guárdalo en
`~/.postgresql/supabase-prod-ca-2021.crt` (o apunta `CATALOGO_PGSSLROOTCERT` a él). Sin ese
archivo la conexión se cifra pero no verifica el servidor, y los scripts lo avisan.

## 1. Estructura nueva (una sola vez)

```bash
# Prueba: aplica dos veces, verifica y deshace (no deja nada)
scripts/catalogo/psql.sh -X -f supabase/tests/catalog_taxonomy_rollback.sql
# Aplicar de verdad (aditivo: sólo tablas y columnas nuevas)
scripts/catalogo/psql.sh -X -1 -v ON_ERROR_STOP=1 -f supabase/catalog_taxonomy.sql
scripts/catalogo/psql.sh -X -f supabase/catalog_taxonomy_check.sql   # → catalog_taxonomy OK
```

## 2. Foto de producción

```bash
scripts/catalogo/snapshot.sh        # imprime backups/catalogo/snapshot-<UTC>.json
```

Corre en una transacción de solo lectura.

## 3. Excel de revisión

```bash
npm run catalogo:excel -- --snapshot backups/catalogo/snapshot-<UTC>.json
# → backups/catalogo/revision-catalogo-<fecha>.xlsx + resumen por consola
```

Antes de enviarlo, revisa el resumen:

- **Colores sin equivalencia** debe ser 0. Si no, agrega el color (o alias) en
  `lib/catalog-migration/taxonomy.ts` y vuelve a generar.
- **Grupos con más productos unidos**: no debe haber uniones absurdas (por ejemplo, un
  «Gorro» que une decenas de diseños). Si las hay, corrige la regla en
  `lib/catalog-migration/parse.ts`, con su test.
- Los **textos de talla sin reconocer** no se corrigen en código: llegan a la tienda como nota.

## 4. Envío a la tienda

Qué decirle a la persona que revisa:

1. Que lea primero la hoja **Instrucciones**.
2. Que corrija sobre el **mismo archivo** y lo devuelva completo (no copias ni otra plantilla).
3. Que mientras revisa, evite crear o editar productos en el ERP. Lo que cambie después de la
   fecha de la foto se revisará aparte.
4. Que todo producto activo debe quedar con categoría, marca y las características
   obligatorias. Si algo no aplica, puede poner **Estado = Desactivar**.

Guarda el archivo devuelto como `backups/catalogo/revision-devuelta-<fecha>.xlsx`.

### Excel de pendientes (cuando la propuesta ya está aprobada)

Si la tienda aprueba la propuesta sin cambios, no hace falta que revise todo de nuevo: se le
manda sólo lo que impide cumplir el criterio de éxito.

```bash
npm run catalogo:excel -- --snapshot backups/catalogo/snapshot-<UTC>.json --pendientes
# → backups/catalogo/pendientes-catalogo-<fecha>.xlsx
```

- **Productos:** sólo los activos sin categoría, sin marca o sin algún atributo obligatorio de
  su categoría (`lib/catalog-migration/completeness.ts`). La columna gris «Falta completar»
  dice qué falta; la celda obligatoria vacía va en **amarillo** y el atributo que no aplica a
  la categoría, en **gris**.
- **Variantes:** sólo las activas con nota del sistema (precio 0, precio distinto al de su
  repetida…). Su lista de productos es el catálogo completo (`_listas`, columna E).
- `_info` lleva `scope = incomplete`. Plan 2 aplica la propuesta automática y encima lo que
  venga en este archivo; lo que no viene en él se aplica tal como se aprobó.

Guarda el archivo devuelto como `backups/catalogo/pendientes-devuelto-<fecha>.xlsx`.

## 5. Preparar la limpieza (reporte y plan)

Con los Excel devueltos (se aplican en orden; el último gana):

```bash
scripts/catalogo/snapshot.sh                       # foto nueva, justo antes
npm run catalogo:limpieza -- \
  --snapshot backups/catalogo/snapshot-<nueva>.json \
  --base backups/catalogo/snapshot-<de la revisión>.json \
  --revisado backups/catalogo/pendientes-final-<fecha>.xlsx
# → backups/catalogo/reporte-<UTC>.md y, sin bloqueantes, plan-<UTC>.json
```

- **Bloqueantes** (sale con 1): productos o variantes activas sin la clasificación del
  «Criterio de éxito», valores que no están en las listas (con archivo, hoja, fila y columna),
  fusiones inválidas o variantes repetidas. Se resuelven con la tienda y se vuelve a correr.
- **Cambios posteriores a la foto:** lo creado o editado después de la foto de la revisión
  recibe la propuesta automática; si queda incompleto, aparece como bloqueante.
- Un Excel generado con otra versión de `taxonomy.ts` no se aplica (hay que regenerarlo).

## 6. Simulación y aplicación

```bash
scripts/catalogo/aplicar.sh backups/catalogo/plan-<UTC>.json             # simulación: ROLLBACK
scripts/catalogo/aplicar.sh backups/catalogo/plan-<UTC>.json --aplicar   # pide escribir APLICAR
```

`scripts/catalogo/aplicar.sql` corre todo en **una transacción** (≈15 s) que bloquea catálogo,
inventario y líneas de venta/compra mientras dura:

1. **Guarda:** si el número de productos/variantes o la última edición no son los de la foto,
   aborta («toma otra foto»). Por eso la foto y el plan se generan justo antes de aplicar.
2. **Respaldo** en el esquema `wm_respaldo_catalogo_<AAAAMMDD>` (productos, variantes,
   inventario, categorías, marcas, colores y los `variant_id` de ventas y compras).
3. Registro de cada producto y variante viejos en `wm.catalog_migration_log` (`run_id` del plan).
4. Maestros, productos (une grupos), variantes repetidas (suma stock, re-apunta ventas y
   compras, deja el SKU como alias), color/opción/texto legado, fotos a `product_media`, y
   borra lo que quedó vacío.
5. **Verificación** (si algo falla, aborta y no queda nada): stock y reservado por sucursal,
   líneas de venta y compra con variante, conteos, todo resuelto contra los maestros y el
   criterio de éxito completo (0 faltantes, 0 repetidas, 0 colores duplicados).

La aplicación real va en **horario sin ventas**: simular primero, revisar el resumen y, en el
mismo momento, aplicar.

**Antes de la aplicación real, ensayar la restauración** (aplica, restaura y comprueba que
catálogo, inventario e historial quedan idénticos al respaldo; termina en `ROLLBACK`):

```bash
scripts/catalogo/aplicar.sh backups/catalogo/plan-<UTC>.json --ensayar-restauracion
```

**Restaurar** una limpieza ya aplicada (simula por defecto; `--aplicar` pide escribir
RESTAURAR). `run_id` es el `runId` del plan (también está en `wm.catalog_migration_log`):

```bash
scripts/catalogo/restaurar.sh wm_respaldo_catalogo_<AAAAMMDD> <run_id>
scripts/catalogo/restaurar.sh wm_respaldo_catalogo_<AAAAMMDD> <run_id> --aplicar
```

- Vuelve productos, variantes, categorías, marcas y colores a como estaban; devuelve el stock
  de cada variante fusionada (descontándolo de la que lo absorbió) y las líneas de venta y
  compra que le pertenecían. Las ventas y movimientos **posteriores** a la limpieza se quedan.
- Borra lo que creó la limpieza (fotos en `product_media`, atributos, líneas, alias).
- Aborta si después de la limpieza se crearon productos o variantes (se resuelven a mano).
- Se verifica sola: stock por sucursal y líneas de venta/compra iguales a antes de restaurar,
  cada fila de stock de las fusionadas de vuelta, y catálogo igual al respaldo.

Borrar el respaldo cuando ya no haga falta: `drop schema wm_respaldo_catalogo_<fecha> cascade`.

## 7. Lo que sigue

Plan 3 (ERP adaptado) y plan 4 (guardas y retiro de las columnas de texto). Ver
`docs/superpowers/plans/2026-11-11-catalogo-00-hoja-de-ruta.md`.
