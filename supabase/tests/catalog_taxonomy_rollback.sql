-- Prueba de supabase/catalog_taxonomy.sql: la aplica DOS veces (idempotencia), verifica y
-- deshace todo con ROLLBACK. Correr desde la raíz del repo:
--   scripts/catalogo/psql.sh -X -f supabase/tests/catalog_taxonomy_rollback.sql
\set ON_ERROR_STOP 1
begin;
\i supabase/catalog_taxonomy.sql
\i supabase/catalog_taxonomy.sql
\i supabase/catalog_taxonomy_check.sql
rollback;
