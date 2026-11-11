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

## 5. Lo que sigue

Plan 2 (simulación y aplicación de la limpieza): lee el archivo devuelto, valida el criterio
de éxito, detecta lo cambiado después de la foto, simula con `ROLLBACK` y luego aplica.
