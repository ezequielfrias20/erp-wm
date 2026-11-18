-- Conversión de pedidos online en ventas; todo se deshace en producción.
-- Correr desde la raíz: scripts/catalogo/psql.sh -X -f supabase/tests/online_orders_sale_rollback.sql
\set ON_ERROR_STOP 1
begin;

-- R1: ninguna venta ni pedido de esta prueba consume numeración de producción.
alter table wm.sales alter column invoice_number
  set default ('TEST-' || gen_random_uuid()::text);
do $$
begin
  if pg_catalog.to_regclass('wm.online_orders') is not null then
    execute 'alter table wm.online_orders alter column number set default (''TEST-'' || gen_random_uuid()::text)';
  end if;
end $$;

\i supabase/online_orders.sql
alter table wm.online_orders alter column number
  set default ('TEST-' || gen_random_uuid()::text);
\i supabase/online_orders.sql
\i supabase/online_orders_sale.sql
\i supabase/online_orders_sale.sql

create temporary table sale_test_ids (name text primary key, id uuid not null);
grant select on pg_temp.sale_test_ids to authenticated;

do $$
declare
  v_a uuid;
  v_b uuid;
  v_v uuid;
  v_w uuid;
  v_x uuid;
  v_seller uuid;
begin
  select id into v_a from wm.branches order by id limit 1;
  select id into v_b from wm.branches where id <> v_a order by id limit 1;
  if v_a is null or v_b is null then
    raise exception 'prueba sin datos: se requieren dos sucursales';
  end if;
  select id into v_v from wm.product_variants v
   where not exists (select 1 from wm.online_holds h
                      where h.variant_id = v.id and h.branch_id = v_a)
   order by id limit 1;
  select id into v_w from wm.product_variants v
   where id <> v_v
     and not exists (select 1 from wm.online_holds h
                      where h.variant_id = v.id and h.branch_id = v_b)
   order by id limit 1;
  select id into v_x from wm.product_variants v
   where id not in (v_v, v_w)
     and not exists (select 1 from wm.online_holds h
                      where h.variant_id = v.id and h.branch_id = v_a)
   order by id limit 1;
  if v_v is null or v_w is null or v_x is null then
    raise exception 'prueba sin datos: se requieren tres variantes sin apartados vigentes';
  end if;
  select id into v_seller from wm.profiles
   where role = 'Vendedor' and status = 'Activo' order by id limit 1;
  if v_seller is null then
    insert into wm.profiles (full_name, role, status, system_access)
    values ('Vendedor de prueba online', 'Vendedor', 'Activo', false)
    returning id into v_seller;
  end if;
  insert into pg_temp.sale_test_ids values
    ('a', v_a), ('b', v_b), ('v', v_v), ('w', v_w), ('x', v_x), ('seller', v_seller);
  insert into wm.inventory (variant_id, branch_id, quantity)
    values (v_v, v_a, 3), (v_w, v_b, 3), (v_x, v_a, 3)
    on conflict (variant_id, branch_id) do update set quantity = excluded.quantity;
  if (select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'wm' and p.proname = 'create_sale') <> 1 then
    raise exception 'debe existir una sola función wm.create_sale';
  end if;
end $$;

select user_id as admin_user_id from wm.profiles
 where role = 'Super Admin' and status = 'Activo' and system_access = true
   and user_id is not null
 order by id limit 1 \gset
select set_config('request.jwt.claims',
  json_build_object('sub', :'admin_user_id', 'role', 'authenticated')::text, true);
set local role authenticated;

-- Sin apartados, conserva la venta hasta cero aunque el ticket exceda el stock.
do $$
declare
  v_a uuid := (select id from pg_temp.sale_test_ids where name = 'a');
  v_v uuid := (select id from pg_temp.sale_test_ids where name = 'v');
  v_seller uuid := (select id from pg_temp.sale_test_ids where name = 'seller');
  v_sale wm.sales;
begin
  v_sale := wm.create_sale(v_a, null, '[]'::jsonb, 0, 1,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'variant_id', v_v, 'description', 'V', 'quantity', 5,
      'unit_price', 10, 'cost', 0)), p_seller_id => v_seller);
  if (select quantity from wm.inventory where variant_id = v_v and branch_id = v_a) <> 0
     or v_sale.invoice_number !~ '^TEST-[0-9a-f-]{36}$' then
    raise exception 'venta sin apartados debe conservar el descuento de stock hasta cero';
  end if;
end $$;
reset role;
update wm.inventory set quantity = 3
 where variant_id = (select id from pg_temp.sale_test_ids where name = 'v')
   and branch_id = (select id from pg_temp.sale_test_ids where name = 'a');

-- P1 aparta dos V en A.
with o as (
  insert into wm.online_orders (request_id, status, customer_name, customer_phone,
    soft_expires_at, firm_expires_at)
  values (gen_random_uuid(), 'aceptada', 'Prueba P1', '+584141234567',
    now() + interval '30 minutes', now() + interval '24 hours')
  returning id
)
insert into pg_temp.sale_test_ids select 'p1', id from o;
insert into wm.online_order_items
  (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
select p.id, v.id, a.id, 2, 10, 'V', 'V', 'TEST-V'
  from pg_temp.sale_test_ids p, pg_temp.sale_test_ids v, pg_temp.sale_test_ids a
 where p.name = 'p1' and v.name = 'v' and a.name = 'a';
set local role authenticated;
do $$
declare
  v_a uuid := (select id from pg_temp.sale_test_ids where name = 'a');
  v_v uuid := (select id from pg_temp.sale_test_ids where name = 'v');
  v_seller uuid := (select id from pg_temp.sale_test_ids where name = 'seller');
  v_ticket jsonb;
  v_rejected boolean;
begin
  v_ticket := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'variant_id', v_v, 'description', 'V', 'quantity', 2,
    'unit_price', 10, 'cost', 0));
  v_rejected := false;
  begin
    perform wm.create_sale(v_a, null, '[]'::jsonb, 0, 1, v_ticket,
      p_seller_id => v_seller);
  exception when others then
    if sqlerrm not like '%apartadas para pedidos online%' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'se vendieron dos V apartadas por P1'; end if;

  v_ticket := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'variant_id', v_v, 'description', 'V', 'quantity', 1,
    'unit_price', 10, 'cost', 0));
  perform wm.create_sale(v_a, null, '[]'::jsonb, 0, 1, v_ticket,
    p_seller_id => v_seller);
  if (select quantity from wm.inventory where variant_id = v_v and branch_id = v_a) <> 2 then
    raise exception 'una V libre no redujo el stock a dos';
  end if;
end $$;
reset role;
update wm.inventory set quantity = 3
 where variant_id = (select id from pg_temp.sale_test_ids where name = 'v')
   and branch_id = (select id from pg_temp.sale_test_ids where name = 'a');
set local role authenticated;
do $$
declare
  v_a uuid := (select id from pg_temp.sale_test_ids where name = 'a');
  v_v uuid := (select id from pg_temp.sale_test_ids where name = 'v');
  v_seller uuid := (select id from pg_temp.sale_test_ids where name = 'seller');
  v_rejected boolean := false;
begin
  begin
    perform wm.create_sale(v_a, null, '[]'::jsonb, 0, 1,
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('variant_id', v_v, 'description', 'V',
          'quantity', 1, 'unit_price', 10, 'cost', 0),
        pg_catalog.jsonb_build_object('variant_id', v_v, 'description', 'V',
          'quantity', 1, 'unit_price', 10, 'cost', 0)),
      p_seller_id => v_seller);
  exception when others then
    if sqlerrm not like '%apartadas para pedidos online%' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'dos líneas de V eludieron el apartado de P1'; end if;
end $$;
reset role;
update wm.online_orders set status = 'cancelada'
 where id = (select id from pg_temp.sale_test_ids where name = 'p1');

-- P2: dos sucursales. Atender A deja B pendiente; atender B completa.
with o as (
  insert into wm.online_orders (request_id, status, customer_name, customer_phone,
    soft_expires_at, firm_expires_at)
  values (gen_random_uuid(), 'aceptada', 'Prueba P2', '+584141234567',
    now() + interval '30 minutes', now() + interval '24 hours')
  returning id
)
insert into pg_temp.sale_test_ids select 'p2', id from o;
insert into wm.online_order_items
  (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
select p.id, v.id, a.id, 2, 10, 'V', 'V', 'TEST-V'
  from pg_temp.sale_test_ids p, pg_temp.sale_test_ids v, pg_temp.sale_test_ids a
 where p.name = 'p2' and v.name = 'v' and a.name = 'a';
insert into wm.online_order_items
  (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
select p.id, w.id, b.id, 1, 10, 'W', 'W', 'TEST-W'
  from pg_temp.sale_test_ids p, pg_temp.sale_test_ids w, pg_temp.sale_test_ids b
 where p.name = 'p2' and w.name = 'w' and b.name = 'b';
set local role authenticated;
do $$
declare
  v_a uuid := (select id from pg_temp.sale_test_ids where name = 'a');
  v_b uuid := (select id from pg_temp.sale_test_ids where name = 'b');
  v_v uuid := (select id from pg_temp.sale_test_ids where name = 'v');
  v_w uuid := (select id from pg_temp.sale_test_ids where name = 'w');
  v_p2 uuid := (select id from pg_temp.sale_test_ids where name = 'p2');
  v_seller uuid := (select id from pg_temp.sale_test_ids where name = 'seller');
  v_sale wm.sales;
begin
  v_sale := wm.create_sale(v_a, null, '[]'::jsonb, 0, 1,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'variant_id', v_v, 'description', 'V', 'quantity', 2,
      'unit_price', 10, 'cost', 0)),
    p_seller_id => v_seller, p_online_order_id => v_p2);
  if v_sale.online_order_id is distinct from v_p2
     or (select sale_id from wm.online_order_items
          where order_id = v_p2 and branch_id = v_a) is distinct from v_sale.id
     or (select sale_id from wm.online_order_items
          where order_id = v_p2 and branch_id = v_b) is not null
     or (select status from wm.online_orders where id = v_p2) <> 'aceptada' then
    raise exception 'P2 no quedó parcialmente convertido tras venta en A';
  end if;
  v_sale := wm.create_sale(v_b, null, '[]'::jsonb, 0, 1,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'variant_id', v_w, 'description', 'W', 'quantity', 1,
      'unit_price', 10, 'cost', 0)),
    p_seller_id => v_seller, p_online_order_id => v_p2);
  if (select sale_id from wm.online_order_items
       where order_id = v_p2 and branch_id = v_b) is distinct from v_sale.id
     or (select status from wm.online_orders where id = v_p2) <> 'completada'
     or (select closed_at from wm.online_orders where id = v_p2) is null then
    raise exception 'P2 no se completó tras venta en B';
  end if;
end $$;
reset role;

-- P3: ticket de otra variante X; libera V y cierra el pedido.
update wm.inventory set quantity = 3
 where variant_id = (select id from pg_temp.sale_test_ids where name = 'v')
   and branch_id = (select id from pg_temp.sale_test_ids where name = 'a');
with o as (
  insert into wm.online_orders (request_id, status, customer_name, customer_phone,
    soft_expires_at, firm_expires_at)
  values (gen_random_uuid(), 'aceptada', 'Prueba P3', '+584141234567',
    now() + interval '30 minutes', now() + interval '24 hours')
  returning id
)
insert into pg_temp.sale_test_ids select 'p3', id from o;
insert into wm.online_order_items
  (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
select p.id, v.id, a.id, 2, 10, 'V', 'V', 'TEST-V'
  from pg_temp.sale_test_ids p, pg_temp.sale_test_ids v, pg_temp.sale_test_ids a
 where p.name = 'p3' and v.name = 'v' and a.name = 'a';
set local role authenticated;
do $$
declare
  v_a uuid := (select id from pg_temp.sale_test_ids where name = 'a');
  v_x uuid := (select id from pg_temp.sale_test_ids where name = 'x');
  v_p3 uuid := (select id from pg_temp.sale_test_ids where name = 'p3');
  v_seller uuid := (select id from pg_temp.sale_test_ids where name = 'seller');
begin
  perform wm.create_sale(v_a, null, '[]'::jsonb, 0, 1,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'variant_id', v_x, 'description', 'X', 'quantity', 1,
      'unit_price', 10, 'cost', 0)),
    p_seller_id => v_seller, p_online_order_id => v_p3);
  if (select released_at from wm.online_order_items where order_id = v_p3) is null
     or (select sale_id from wm.online_order_items where order_id = v_p3) is not null
     or (select status from wm.online_orders where id = v_p3) <> 'completada' then
    raise exception 'P3 no liberó la variante ausente del ticket';
  end if;
end $$;
reset role;

-- P4 solicitada: conversión prohibida.
with o as (
  insert into wm.online_orders (request_id, customer_name, customer_phone, soft_expires_at)
  values (gen_random_uuid(), 'Prueba P4', '+584141234567', now() + interval '30 minutes')
  returning id
)
insert into pg_temp.sale_test_ids select 'p4', id from o;
insert into wm.online_order_items
  (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
select p.id, x.id, a.id, 1, 10, 'X', 'X', 'TEST-X'
  from pg_temp.sale_test_ids p, pg_temp.sale_test_ids x, pg_temp.sale_test_ids a
 where p.name = 'p4' and x.name = 'x' and a.name = 'a';
set local role authenticated;
do $$
declare
  v_a uuid := (select id from pg_temp.sale_test_ids where name = 'a');
  v_x uuid := (select id from pg_temp.sale_test_ids where name = 'x');
  v_p4 uuid := (select id from pg_temp.sale_test_ids where name = 'p4');
  v_seller uuid := (select id from pg_temp.sale_test_ids where name = 'seller');
  v_rejected boolean := false;
begin
  begin
    perform wm.create_sale(v_a, null, '[]'::jsonb, 0, 1,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'variant_id', v_x, 'description', 'X', 'quantity', 1,
        'unit_price', 10, 'cost', 0)),
      p_seller_id => v_seller, p_online_order_id => v_p4);
  exception when others then
    if sqlerrm not like '%no está aceptado%' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'P4 solicitada se convirtió en venta'; end if;
end $$;
reset role;
update wm.online_orders set status = 'cancelada'
 where id = (select id from pg_temp.sale_test_ids where name = 'p4');

-- P5 aceptada pero vencida: se permite cobrar; reintento devuelve la misma venta.
update wm.inventory set quantity = 3
 where variant_id = (select id from pg_temp.sale_test_ids where name = 'v')
   and branch_id = (select id from pg_temp.sale_test_ids where name = 'a');
with o as (
  insert into wm.online_orders (request_id, status, customer_name, customer_phone,
    soft_expires_at, firm_expires_at)
  values (gen_random_uuid(), 'aceptada', 'Prueba P5', '+584141234567',
    now() - interval '2 hours', now() - interval '1 hour')
  returning id
)
insert into pg_temp.sale_test_ids select 'p5', id from o;
insert into wm.online_order_items
  (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
select p.id, v.id, a.id, 2, 10, 'V', 'V', 'TEST-V'
  from pg_temp.sale_test_ids p, pg_temp.sale_test_ids v, pg_temp.sale_test_ids a
 where p.name = 'p5' and v.name = 'v' and a.name = 'a';
set local role authenticated;
do $$
declare
  v_a uuid := (select id from pg_temp.sale_test_ids where name = 'a');
  v_v uuid := (select id from pg_temp.sale_test_ids where name = 'v');
  v_p5 uuid := (select id from pg_temp.sale_test_ids where name = 'p5');
  v_seller uuid := (select id from pg_temp.sale_test_ids where name = 'seller');
  v_request uuid := gen_random_uuid();
  v_ticket jsonb;
  v_first wm.sales;
  v_second wm.sales;
  v_updated_at timestamptz;
  v_closed_at timestamptz;
begin
  v_ticket := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'variant_id', v_v, 'description', 'V', 'quantity', 2,
    'unit_price', 10, 'cost', 0, 'request_id', v_request));
  v_first := wm.create_sale(v_a, null, '[]'::jsonb, 0, 1, v_ticket,
    p_seller_id => v_seller, p_online_order_id => v_p5);
  select updated_at, closed_at into v_updated_at, v_closed_at
    from wm.online_orders where id = v_p5;
  v_second := wm.create_sale(v_a, null, '[]'::jsonb, 0, 1, v_ticket,
    p_seller_id => v_seller, p_online_order_id => v_p5);
  if v_first.id is distinct from v_second.id
     or v_first.online_order_id is distinct from v_p5
     or (select count(*) from wm.sales where request_id = v_request) <> 1
     or (select status from wm.online_orders where id = v_p5) <> 'completada'
     or (select updated_at from wm.online_orders where id = v_p5) is distinct from v_updated_at
     or (select closed_at from wm.online_orders where id = v_p5) is distinct from v_closed_at
     or (select sale_id from wm.online_order_items where order_id = v_p5) is distinct from v_first.id then
    raise exception 'P5 vencida o reintento idempotente falló';
  end if;
  raise notice 'OK: stock libre, suma por variante, conversión parcial/total, liberación, estados e idempotencia';
end $$;

reset role;
rollback;
