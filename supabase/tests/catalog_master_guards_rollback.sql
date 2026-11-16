-- Prueba de supabase/catalog_master_guards.sql: la aplica DOS veces (idempotencia), comprueba que
-- la base rechaza borrar maestros en uso y nombres repetidos con otras mayúsculas, y deshace todo
-- con ROLLBACK. Correr desde la raíz del repo:
--   scripts/catalogo/psql.sh -X -f supabase/tests/catalog_master_guards_rollback.sql
\set ON_ERROR_STOP 1
begin;
\i supabase/catalog_master_guards.sql
\i supabase/catalog_master_guards.sql

do $$
declare
  v_id uuid; v_name text; ok boolean;
begin
  -- Categoría con productos: no se borra.
  select category_id into v_id from wm.products where category_id is not null limit 1;
  if v_id is null then raise exception 'prueba sin datos: no hay productos con categoría'; end if;
  begin delete from wm.categories where id = v_id; ok := false;
  exception when foreign_key_violation then ok := true; end;
  if not ok then raise exception 'se pudo borrar una categoría con productos'; end if;

  -- Marca con productos: no se borra.
  select brand_id into v_id from wm.products where brand_id is not null limit 1;
  begin delete from wm.brands where id = v_id; ok := false;
  exception when foreign_key_violation then ok := true; end;
  if not ok then raise exception 'se pudo borrar una marca con productos'; end if;

  -- Color con fotos: no se borra.
  select color_id into v_id from wm.product_media where color_id is not null limit 1;
  if v_id is null then raise exception 'prueba sin datos: no hay fotos con color'; end if;
  begin delete from wm.colors where id = v_id; ok := false;
  exception when foreign_key_violation then ok := true; end;
  if not ok then raise exception 'se pudo borrar un color con fotos'; end if;

  -- Valor de característica en productos: no se borra.
  select attribute_value_id into v_id from wm.product_attribute_values limit 1;
  if v_id is null then raise exception 'prueba sin datos: no hay características en productos'; end if;
  begin delete from wm.attribute_values where id = v_id; ok := false;
  exception when foreign_key_violation then ok := true; end;
  if not ok then raise exception 'se pudo borrar un valor de característica en uso'; end if;

  -- Tipo de opción usado por categorías: no se borra.
  select option_type_id into v_id from wm.categories where option_type_id is not null limit 1;
  begin delete from wm.option_types where id = v_id; ok := false;
  exception when foreign_key_violation then ok := true; end;
  if not ok then raise exception 'se pudo borrar un tipo de opción en uso'; end if;

  -- Nombre repetido con otras mayúsculas: rechazado.
  select name into v_name from wm.colors limit 1;
  begin insert into wm.colors (name, hex) values (upper(v_name), '#000000'); ok := false;
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'se aceptó un color repetido con otras mayúsculas'; end if;

  -- Tipo de opción sin uso: se borra con sus valores en un paso.
  insert into wm.option_types (code, name) values ('prueba-guardas', 'Prueba guardas') returning id into v_id;
  insert into wm.option_values (option_type_id, label, slug) values (v_id, 'A', 'a'), (v_id, 'B', 'b');
  delete from wm.option_types where id = v_id;
  if exists (select 1 from wm.option_values where option_type_id = v_id) then
    raise exception 'quedaron valores de un tipo de opción borrado';
  end if;

  raise notice 'OK: la base rechaza borrar maestros en uso y nombres repetidos; tipo sin uso se borra entero';
end $$;

rollback;
