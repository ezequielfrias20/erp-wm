-- Prueba de supabase/catalog_view.sql: la aplica DOS veces (idempotencia), renombra un color y
-- una talla y comprueba el texto legado de las variantes, verifica la vista y deshace todo con
-- ROLLBACK. Correr desde la raíz del repo:
--   scripts/catalogo/psql.sh -X -f supabase/tests/catalog_view_rollback.sql
\set ON_ERROR_STOP 1
begin;
\i supabase/catalog_view.sql
\i supabase/catalog_view.sql

do $$
declare
  c_id uuid; ov_id uuid; n_bad int; n_view int; n_var int; n_dupe int;
begin
  -- Color con variantes: renombrar y cambiar hex.
  select color_id into c_id from wm.product_variants where color_id is not null limit 1;
  update wm.colors set name = name || ' (prueba)', hex = '#123456' where id = c_id;
  select count(*) into n_bad from wm.product_variants v join wm.colors c on c.id = v.color_id
   where v.color_id = c_id and (v.color is distinct from c.name or v.color_hex is distinct from c.hex);
  if n_bad > 0 then raise exception 'texto de color sin sincronizar en % variantes', n_bad; end if;

  -- Talla con variantes: renombrar.
  select option_value_id into ov_id from wm.product_variants where option_value_id is not null limit 1;
  update wm.option_values set label = label || ' (prueba)' where id = ov_id;
  select count(*) into n_bad from wm.product_variants v join wm.option_values o on o.id = v.option_value_id
   where v.option_value_id = ov_id and v.size is distinct from o.label;
  if n_bad > 0 then raise exception 'texto de talla sin sincronizar en % variantes', n_bad; end if;

  -- Vista: una fila por variante, sin duplicados.
  select count(*) into n_view from wm.v_catalog;
  select count(*) into n_var from wm.product_variants;
  if n_view <> n_var then raise exception 'v_catalog tiene % filas y hay % variantes', n_view, n_var; end if;
  select count(*) - count(distinct variant_id) into n_dupe from wm.v_catalog;
  if n_dupe <> 0 then raise exception 'v_catalog repite % variantes', n_dupe; end if;

  -- Stock de la vista = inventario.
  if (select coalesce(sum(stock_total), 0) from wm.v_catalog) <> (select coalesce(sum(quantity), 0) from wm.inventory) then
    raise exception 'stock de v_catalog distinto del inventario';
  end if;

  raise notice 'OK: texto legado sincronizado; v_catalog % filas = variantes; stock cuadra', n_view;
end $$;

select department_name, category_name, count(*) as variantes,
       count(*) filter (where jsonb_array_length(color_photos) > 0) as con_foto_color
from wm.v_catalog
group by 1, 2
order by 1, 2
limit 30;

rollback;
