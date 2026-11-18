-- Pedidos online: aplicar dos veces, comprobar apartados/RLS y deshacer todo.
-- Correr desde la raíz: scripts/catalogo/psql.sh -X -f supabase/tests/online_orders_rollback.sql
\set ON_ERROR_STOP 1
begin;

-- R1: las secuencias de producción no se revierten con ROLLBACK.
alter table wm.sales alter column invoice_number
  set default ('TEST-' || gen_random_uuid()::text);
-- En instalaciones donde la tabla ya exista, protegerla antes del primer \i.
do $$
begin
  if to_regclass('wm.online_orders') is not null then
    execute 'alter table wm.online_orders alter column number set default (''TEST-'' || gen_random_uuid()::text)';
  end if;
end $$;

\i supabase/online_orders.sql
-- En la primera instalación, la tabla nace en el \i anterior.
alter table wm.online_orders alter column number
  set default ('TEST-' || gen_random_uuid()::text);
\i supabase/online_orders.sql

do $$
declare
  v_variant_id uuid;
  v_branch_id uuid;
  v_order_id uuid;
  v_item_id uuid;
  v_sale_id uuid;
  v_number text;
  v_count int;
begin
  select v.id, b.id into v_variant_id, v_branch_id
  from wm.product_variants v cross join wm.branches b
  where not exists (
    select 1 from wm.online_holds h
    where h.variant_id = v.id and h.branch_id = b.id
  )
  limit 1;
  if v_variant_id is null or v_branch_id is null then
    raise exception 'prueba sin datos: se requiere una variante y sucursal sin apartados vigentes';
  end if;

  if (select count(*) from wm.online_settings) <> 1
     or (select soft_hold_minutes from wm.online_settings where id = 1) <> 30
     or (select display_stock_cap from wm.online_settings where id = 1) <> 10 then
    raise exception 'online_settings debe contener una fila con valores por defecto';
  end if;

  insert into wm.online_orders (request_id, customer_name, customer_phone, soft_expires_at)
  values (gen_random_uuid(), 'Prueba de apartado', '+584141234567', now() + interval '30 minutes')
  returning id, number into v_order_id, v_number;
  if v_number !~ '^TEST-[0-9a-f-]{36}$' then
    raise exception 'el default de prueba no protegió la secuencia de pedidos: %', v_number;
  end if;

  insert into wm.online_order_items
    (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
  values (v_order_id, v_variant_id, v_branch_id, 2, 12.50, 'Producto de prueba', 'Variante de prueba', 'TEST-SKU')
  returning id into v_item_id;

  if wm.online_held(v_variant_id, v_branch_id) <> 2
     or (select count(*) from wm.online_holds where order_id = v_order_id and held = 2) <> 1 then
    raise exception 'pedido solicitado vigente debe apartar dos unidades';
  end if;
  if (select total from wm.v_online_orders where id = v_order_id) <> 25.00
     or (select branch_count from wm.v_online_orders where id = v_order_id) <> 1 then
    raise exception 'total o cantidad de sucursales incorrectos';
  end if;

  update wm.online_orders set soft_expires_at = now() - interval '1 minute' where id = v_order_id;
  if wm.online_held(v_variant_id, v_branch_id) <> 0
     or (select effective_status from wm.v_online_orders where id = v_order_id) <> 'vencida'
     or (select status from wm.online_orders where id = v_order_id) <> 'solicitada' then
    raise exception 'el vencimiento corto no liberó el apartado o cambió el estado guardado';
  end if;

  update wm.online_orders
     set status = 'aceptada', firm_expires_at = now() + interval '24 hours'
   where id = v_order_id;
  if wm.online_held(v_variant_id, v_branch_id) <> 2
     or wm.online_held(v_variant_id, v_branch_id, v_order_id) <> 0 then
    raise exception 'apartado firme o exclusión de pedido incorrectos';
  end if;

  update wm.online_orders set firm_expires_at = now() - interval '1 minute' where id = v_order_id;
  if wm.online_held(v_variant_id, v_branch_id) <> 0
     or (select effective_status from wm.v_online_orders where id = v_order_id) <> 'vencida' then
    raise exception 'el vencimiento firme no liberó el apartado';
  end if;
  update wm.online_orders set firm_expires_at = now() + interval '24 hours' where id = v_order_id;

  -- El número de factura también está protegido por el default TEST dentro de esta transacción.
  insert into wm.sales (branch_id) values (v_branch_id) returning id into v_sale_id;
  update wm.online_order_items set sale_id = v_sale_id where id = v_item_id;
  if wm.online_held(v_variant_id, v_branch_id) <> 0 then
    raise exception 'una línea vendida todavía aparta inventario';
  end if;
  update wm.online_order_items set sale_id = null, released_at = now() where id = v_item_id;
  if wm.online_held(v_variant_id, v_branch_id) <> 0 then
    raise exception 'una línea liberada todavía aparta inventario';
  end if;

  -- Una sola llamada a la secuencia W: R1 permite este hueco no fiscal.
  if wm.next_online_order() !~ '^W-[0-9]{6}$' then
    raise exception 'next_online_order no tiene formato W-000001';
  end if;

  begin
    insert into wm.online_orders (request_id, customer_name, customer_phone, soft_expires_at)
    values (gen_random_uuid(), 'Teléfono inválido', '04141234567', now() + interval '30 minutes');
    raise exception 'se aceptó un teléfono fuera de E.164';
  exception when check_violation then
    null;
  end;

  select count(*) into v_count from wm.online_orders where id = v_order_id;
  if v_count <> 1 then raise exception 'el pedido de prueba desapareció'; end if;
  raise notice 'OK: apartados derivados, vencimientos, venta/liberación, formato y E.164';
end $$;

do $$
begin
  if not exists (
    select 1 from wm.profiles
    where role = 'Super Admin' and status = 'Activo' and system_access = true and user_id is not null
  ) then
    raise exception 'prueba sin datos: se requiere un Super Admin autenticado';
  end if;
  if has_table_privilege('authenticated', 'wm.online_orders', 'INSERT') then
    raise exception 'authenticated conserva permiso INSERT directo en pedidos';
  end if;
end $$;

-- Conceder INSERT solo durante la prueba para comprobar que RLS también lo bloquea.
grant insert on wm.online_orders to authenticated;
select user_id as admin_user_id from wm.profiles
 where role = 'Super Admin' and status = 'Activo' and system_access = true and user_id is not null
 limit 1 \gset
select set_config('request.jwt.claims',
  json_build_object('sub', :'admin_user_id', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare v_count int;
begin
  select count(*) into v_count from wm.online_orders
   where customer_name = 'Prueba de apartado';
  if v_count <> 1 then
    raise exception 'Super Admin no puede leer pedidos online';
  end if;
  begin
    insert into wm.online_orders (request_id, customer_name, customer_phone, soft_expires_at)
    values (gen_random_uuid(), 'Inserción directa', '+584141234567', now() + interval '30 minutes');
    raise exception 'authenticated pudo insertar un pedido directamente';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'OK: Super Admin lee pedidos y la inserción directa está bloqueada';
end $$;

reset role;
rollback;
