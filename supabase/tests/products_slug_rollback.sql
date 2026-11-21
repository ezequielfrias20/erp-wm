-- Prueba de supabase/products_slug.sql: la aplica DOS veces (idempotencia), verifica y deshace
-- todo con ROLLBACK. Correr desde la raíz del repo contra un negocio de PRUEBA (nunca producción):
--   psql -X -f supabase/tests/products_slug_rollback.sql
\set ON_ERROR_STOP 1
begin;
-- Simula productos creados antes de este script (sin slug) para probar el relleno.
alter table wm.products alter column slug drop not null;
drop trigger if exists products_fill_slug on wm.products;
insert into wm.products (id, name, created_at) values
  ('00000000-0000-4000-8000-000000000001', 'Prueba Slug Dama', now() - interval '3 days'),
  ('00000000-0000-4000-8000-000000000002', 'Prueba Slug Dama', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000003', '  Prueba Slug Dama ', now() - interval '1 day');

\i supabase/products_slug.sql
\i supabase/products_slug.sql

do $$
declare v text;
begin
  -- Formato idéntico a slugify() de TS.
  if wm.slugify('Pantalón Ñandú  *Talla* XL') <> 'pantalon-nandu-talla-xl' then
    raise exception 'slugify acentos: %', wm.slugify('Pantalón Ñandú  *Talla* XL');
  end if;
  if wm.slugify('¡¿?!') <> 'x' or wm.slugify(null) <> 'x' then
    raise exception 'slugify vacío debe dar x';
  end if;

  -- Relleno: el más antiguo se queda con el corto; los repetidos llevan sufijo.
  select string_agg(slug, ',' order by created_at) into v from wm.products
  where id::text like '00000000-0000-4000-8000-00000000000%';
  if v <> 'prueba-slug-dama,prueba-slug-dama-2,prueba-slug-dama-3' then
    raise exception 'relleno: %', v;
  end if;

  if exists (select 1 from wm.products where slug is null) then
    raise exception 'quedaron productos sin slug';
  end if;
  if (select attnotnull from pg_attribute
      where attrelid = 'wm.products'::regclass and attname = 'slug') is not true then
    raise exception 'slug debería ser NOT NULL';
  end if;

  -- Alta nueva sin slug (como el editor y el Excel): se genera.
  insert into wm.products (id, name) values ('00000000-0000-4000-8000-000000000004', 'Prueba Slug Dama');
  select slug into v from wm.products where id = '00000000-0000-4000-8000-000000000004';
  if v <> 'prueba-slug-dama-4' then raise exception 'alta nueva: %', v; end if;

  -- Slug explícito se respeta.
  insert into wm.products (id, name, slug) values ('00000000-0000-4000-8000-000000000005', 'Otro', 'mi-slug-propio');
  select slug into v from wm.products where id = '00000000-0000-4000-8000-000000000005';
  if v <> 'mi-slug-propio' then raise exception 'slug explícito: %', v; end if;

  -- Renombrar no cambia el slug (URL estable).
  update wm.products set name = 'Nombre Nuevo' where id = '00000000-0000-4000-8000-000000000005';
  select slug into v from wm.products where id = '00000000-0000-4000-8000-000000000005';
  if v <> 'mi-slug-propio' then raise exception 'renombrar cambió el slug: %', v; end if;

  -- Vaciarlo lo regenera (y no choca consigo mismo).
  update wm.products set slug = '' where id = '00000000-0000-4000-8000-000000000001';
  select slug into v from wm.products where id = '00000000-0000-4000-8000-000000000001';
  if v <> 'prueba-slug-dama' then raise exception 'vaciar: %', v; end if;
  update wm.products set slug = null where id = '00000000-0000-4000-8000-000000000005';
  select slug into v from wm.products where id = '00000000-0000-4000-8000-000000000005';
  if v <> 'nombre-nuevo' then raise exception 'null: %', v; end if;

  -- Permisos: nadie fuera del dueño llama a las funciones internas.
  if has_function_privilege('authenticated', 'wm.unique_product_slug(text, uuid)', 'execute')
     or has_function_privilege('anon', 'wm.slugify(text)', 'execute') then
    raise exception 'permisos de funciones demasiado abiertos';
  end if;
end $$;

\echo 'products_slug: OK'
rollback;
