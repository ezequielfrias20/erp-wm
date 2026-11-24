-- Run from repository root against a local Supabase copy with catalog data; everything rolls back.
\set ON_ERROR_STOP 1
begin;
alter table wm.sales alter column invoice_number set default ('TEST-' || gen_random_uuid()::text);
\i supabase/shop_top_products.sql
\i supabase/shop_top_products.sql

do $$
declare
  v_branch uuid; v_p uuid[]; v_v uuid[]; v_hidden uuid; v_s uuid; v_row record; v_n int;
begin
  -- Las ventas propias de la copia quedan fuera de la ventana.
  update wm.sales set created_at = now() - interval '90 days';
  select id into v_branch from wm.branches limit 1;
  select array_agg(product_id), array_agg(variant_id) into v_p, v_v from (
    select v.product_id, (array_agg(v.variant_id))[1] as variant_id
    from shop.variants v group by v.product_id order by v.product_id limit 5) x;
  select v.id into v_hidden from wm.product_variants v
   where not exists (select 1 from wm.v_published_shop_products q where q.product_id = v.product_id) limit 1;
  if cardinality(v_p) < 5 or v_hidden is null or v_branch is null then
    raise exception 'faltan datos de catálogo para la prueba';
  end if;

  -- [1] 3 u en 1 venta; [2] 3 u en 2 ventas (gana el empate); [3] Pendiente 5 u.
  insert into wm.sales (branch_id) values (v_branch) returning id into v_s;
  insert into wm.sale_items (sale_id, variant_id, quantity)
    values (v_s, v_v[1], 3), (v_s, v_v[2], 2), (v_s, v_hidden, 99), (v_s, null, 99);
  insert into wm.sales (branch_id) values (v_branch) returning id into v_s;
  insert into wm.sale_items (sale_id, variant_id, quantity) values (v_s, v_v[2], 1);
  insert into wm.sales (branch_id, status) values (v_branch, 'Pendiente') returning id into v_s;
  insert into wm.sale_items (sale_id, variant_id, quantity) values (v_s, v_v[3], 5);
  -- No cuentan: anulada, reembolso y fuera de la ventana.
  insert into wm.sales (branch_id, status) values (v_branch, 'Anulada') returning id into v_s;
  insert into wm.sale_items (sale_id, variant_id, quantity) values (v_s, v_v[4], 50);
  insert into wm.sales (branch_id, status) values (v_branch, 'Reembolso') returning id into v_s;
  insert into wm.sale_items (sale_id, variant_id, quantity) values (v_s, v_v[4], 50);
  insert into wm.sales (branch_id, created_at) values (v_branch, now() - interval '31 days') returning id into v_s;
  insert into wm.sale_items (sale_id, variant_id, quantity) values (v_s, v_v[5], 50);

  select count(*) into v_n from shop.top_products;
  if v_n <> 3 then raise exception 'esperaba 3 productos, hay %', v_n; end if;
  select array_agg(product_id order by rank) as ids, array_agg(units_sold order by rank) as u,
         array_agg(rank order by rank) as r into v_row from shop.top_products;
  if v_row.ids <> array[v_p[3], v_p[2], v_p[1]] or v_row.u <> array[5, 3, 3] or v_row.r <> array[1, 2, 3] then
    raise exception 'orden o unidades inesperados: %', v_row;
  end if;
  if (select string_agg(column_name || ':' || data_type, ',' order by ordinal_position)
      from information_schema.columns where table_schema = 'shop' and table_name = 'top_products')
     <> 'product_id:uuid,units_sold:integer,rank:integer' then
    raise exception 'columnas distintas al contrato';
  end if;
  if not has_table_privilege('storefront', 'shop.top_products', 'select')
     or has_table_privilege('storefront', 'shop.top_products', 'insert, update, delete')
     or has_table_privilege('storefront', 'wm.sales', 'select')
     or has_table_privilege('anon', 'shop.top_products', 'select')
     or has_table_privilege('authenticated', 'shop.top_products', 'select') then
    raise exception 'permisos inesperados';
  end if;
  raise notice 'shop_top_products OK';
end $$;
\i supabase/shop_top_products_revert.sql
rollback;
