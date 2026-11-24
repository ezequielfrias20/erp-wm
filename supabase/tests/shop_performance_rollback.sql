-- Run from repository root against a local Supabase copy with catalog data; everything rolls back.
-- Compares the old and new definitions of the storefront views, with and without live holds.
\set ON_ERROR_STOP 1
begin;
alter table wm.online_orders alter column number
  set default ('TEST-' || gen_random_uuid()::text);

-- Holds: live soft, expired soft, live firm, released, and one above the stock of its cell.
do $$
declare
  v_cells record; v_order uuid; v_n int := 0;
begin
  for v_cells in
    select i.variant_id, i.branch_id, i.quantity, v.price
    from wm.inventory i
    join wm.branches b on b.id = i.branch_id and b.is_active and b.online_enabled
    join wm.product_variants v on v.id = i.variant_id and v.is_active and v.price > 0
    join wm.v_published_shop_products p on p.product_id = v.product_id
    where i.quantity > 0 order by i.variant_id, i.branch_id limit 60
  loop
    v_n := v_n + 1;
    insert into wm.online_orders (request_id, status, customer_name, customer_phone,
                                  soft_expires_at, firm_expires_at)
    values (gen_random_uuid(), case when v_n % 5 = 2 then 'aceptada' else 'solicitada' end,
            'Prueba', '+10000000000',
            case when v_n % 5 = 1 then now() - interval '1 hour' else now() + interval '1 hour' end,
            case when v_n % 5 = 2 then now() + interval '1 hour' end)
    returning id into v_order;
    insert into wm.online_order_items (order_id, variant_id, branch_id, quantity, unit_price,
                                       product_name, variant_label, sku, released_at)
    values (v_order, v_cells.variant_id, v_cells.branch_id,
            case when v_n % 5 = 4 then v_cells.quantity + 1 else 1 end, v_cells.price,
            'x', 'x', 'x', case when v_n % 5 = 3 then now() end);
  end loop;
  if v_n < 60 then raise exception 'faltan datos de catálogo para la prueba (% celdas)', v_n; end if;
end $$;

\i supabase/shop_performance_revert.sql
create temp table o_products as select * from shop.products;
create temp table o_variants as select * from shop.variants;
create temp table o_availability as select * from shop.availability;
create temp table o_cols as
  select table_name::text, ordinal_position::int, column_name::text, data_type::text
  from information_schema.columns where table_schema = 'shop';

\i supabase/shop_performance.sql
\i supabase/shop_performance.sql

do $$
declare v_n bigint;
begin
  select count(*) into v_n from ((select * from o_products except all select * from shop.products)
    union all (select * from shop.products except all select * from o_products)) x;
  if v_n <> 0 then raise exception 'products: % diferencias', v_n; end if;
  select count(*) into v_n from ((select * from o_variants except all select * from shop.variants)
    union all (select * from shop.variants except all select * from o_variants)) x;
  if v_n <> 0 then raise exception 'variants: % diferencias', v_n; end if;
  select count(*) into v_n from ((select * from o_availability except all select * from shop.availability)
    union all (select * from shop.availability except all select * from o_availability)) x;
  if v_n <> 0 then raise exception 'availability: % diferencias', v_n; end if;

  select count(*) into v_n from shop.variants v
    left join (select variant_id, sum(available) s from shop.availability group by 1) a using (variant_id)
    where v.available_total is distinct from coalesce(a.s, 0);
  if v_n <> 0 then raise exception 'available_total: % diferencias', v_n; end if;
  select count(*) into v_n from shop.products p
    where p.in_stock is distinct from exists (
      select 1 from shop.availability a join shop.variants v using (variant_id)
      where v.product_id = p.product_id);
  if v_n <> 0 then raise exception 'in_stock: % diferencias', v_n; end if;

  select count(*) into v_n from (
    (select * from o_cols except select table_name::text, ordinal_position::int, column_name::text, data_type::text
       from information_schema.columns where table_schema = 'shop')
    union all
    (select table_name::text, ordinal_position::int, column_name::text, data_type::text
       from information_schema.columns where table_schema = 'shop' except select * from o_cols)) x;
  if v_n <> 0 then raise exception 'cambió el contrato de columnas (%)', v_n; end if;
  if not has_table_privilege('storefront', 'shop.products', 'select')
     or not has_table_privilege('storefront', 'shop.variants', 'select')
     or not has_table_privilege('storefront', 'shop.availability', 'select')
     or has_table_privilege('anon', 'shop.products', 'select')
     or has_table_privilege('authenticated', 'shop.variants', 'select') then
    raise exception 'permisos inesperados en las vistas';
  end if;
  raise notice 'shop_performance OK';
end $$;
rollback;
