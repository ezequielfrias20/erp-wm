-- Funciones de personal para pedidos online; todas las escrituras se revierten.
-- Correr desde la raíz: scripts/catalogo/psql.sh -X -f supabase/tests/online_orders_staff_rollback.sql
\set ON_ERROR_STOP 1
begin;

-- R1: no consumir secuencias de numeración en producción.
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
\i supabase/online_orders_staff.sql
\i supabase/online_orders_staff.sql
update wm.online_settings set firm_hold_hours = 24 where id = 1;

create temporary table staff_test_ids (name text primary key, id uuid not null);
grant select on pg_temp.staff_test_ids to authenticated;

do $$
declare
  v_variant uuid;
  v_a uuid;
  v_b uuid;
  v_off uuid;
  v_short uuid;
  v_order uuid;
  v_item uuid;
  v_inventory_user uuid;
begin
  select id into v_variant from wm.product_variants order by id limit 1;
  if v_variant is null then
    raise exception 'prueba sin datos: se requiere una variante';
  end if;
  insert into pg_temp.staff_test_ids values ('variant', v_variant);
  insert into wm.branches (code, city, name, online_enabled)
    values ('T3-' || gen_random_uuid()::text, 'Prueba', 'T3 A', true)
    returning id into v_a;
  insert into wm.branches (code, city, name, online_enabled)
    values ('T3-' || gen_random_uuid()::text, 'Prueba', 'T3 B', true)
    returning id into v_b;
  insert into wm.branches (code, city, name, online_enabled)
    values ('T3-' || gen_random_uuid()::text, 'Prueba', 'T3 Sin web', false)
    returning id into v_off;
  insert into wm.branches (code, city, name, online_enabled)
    values ('T3-' || gen_random_uuid()::text, 'Prueba', 'T3 Sin stock', true)
    returning id into v_short;
  insert into pg_temp.staff_test_ids values
    ('a', v_a), ('b', v_b), ('off', v_off), ('short', v_short);
  insert into wm.inventory (variant_id, branch_id, quantity)
    values (v_variant, v_a, 100), (v_variant, v_b, 100),
           (v_variant, v_off, 100), (v_variant, v_short, 1);

  insert into wm.online_orders (request_id, customer_name, customer_phone, soft_expires_at)
    values (gen_random_uuid(), 'T3 aceptar', '+584141234567', now() + interval '30 minutes')
    returning id into v_order;
  insert into pg_temp.staff_test_ids values ('accept', v_order);
  insert into wm.online_order_items
    (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
    values (v_order, v_variant, v_a, 2, 10, 'Producto T3', 'Variante T3', 'T3-SKU');

  insert into wm.online_orders (request_id, customer_name, customer_phone, soft_expires_at)
    values (gen_random_uuid(), 'T3 mover', '+584141234567', now() + interval '30 minutes')
    returning id into v_order;
  insert into pg_temp.staff_test_ids values ('move', v_order);
  insert into wm.online_order_items
    (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
    values (v_order, v_variant, v_a, 1, 10, 'Producto T3', 'Variante T3', 'T3-SKU')
    returning id into v_item;
  insert into pg_temp.staff_test_ids values ('move_item', v_item);

  insert into wm.online_orders (request_id, customer_name, customer_phone, soft_expires_at)
    values (gen_random_uuid(), 'T3 sucursal cerrada', '+584141234567', now() + interval '30 minutes')
    returning id into v_order;
  insert into pg_temp.staff_test_ids values ('disabled', v_order);
  insert into wm.online_order_items
    (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
    values (v_order, v_variant, v_a, 1, 10, 'Producto T3', 'Variante T3', 'T3-SKU')
    returning id into v_item;
  insert into pg_temp.staff_test_ids values ('disabled_item', v_item);

  insert into wm.online_orders (request_id, customer_name, customer_phone, soft_expires_at)
    values (gen_random_uuid(), 'T3 quitar', '+584141234567', now() + interval '30 minutes')
    returning id into v_order;
  insert into pg_temp.staff_test_ids values ('delete', v_order);
  insert into wm.online_order_items
    (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
    values (v_order, v_variant, v_a, 1, 10, 'Producto T3', 'Variante T3', 'T3-SKU')
    returning id into v_item;
  insert into pg_temp.staff_test_ids values ('delete_item', v_item);

  insert into wm.online_orders (request_id, customer_name, customer_phone, soft_expires_at)
    values (gen_random_uuid(), 'T3 vencido con stock', '+584141234567', now() - interval '1 minute')
    returning id into v_order;
  insert into pg_temp.staff_test_ids values ('expired_ok', v_order);
  insert into wm.online_order_items
    (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
    values (v_order, v_variant, v_b, 1, 10, 'Producto T3', 'Variante T3', 'T3-SKU');

  insert into wm.online_orders (request_id, customer_name, customer_phone, soft_expires_at)
    values (gen_random_uuid(), 'T3 vencido sin stock', '+584141234567', now() - interval '1 minute')
    returning id into v_order;
  insert into pg_temp.staff_test_ids values ('expired_fail', v_order);
  insert into wm.online_order_items
    (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
    values (v_order, v_variant, v_short, 1, 10, 'Producto T3', 'Variante T3', 'T3-SKU');

  insert into wm.online_orders (request_id, customer_name, customer_phone, soft_expires_at,
    status, firm_expires_at)
    values (gen_random_uuid(), 'T3 competidor', '+584141234567',
      now() + interval '30 minutes', 'aceptada', now() + interval '24 hours')
    returning id into v_order;
  insert into wm.online_order_items
    (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
    values (v_order, v_variant, v_short, 1, 10, 'Producto T3', 'Variante T3', 'T3-SKU');

  insert into wm.online_orders (request_id, customer_name, customer_phone, soft_expires_at)
    values (gen_random_uuid(), 'T3 rechazar', '+584141234567', now() + interval '30 minutes')
    returning id into v_order;
  insert into pg_temp.staff_test_ids values ('reject', v_order);
  insert into wm.online_order_items
    (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
    values (v_order, v_variant, v_a, 1, 10, 'Producto T3', 'Variante T3', 'T3-SKU');

  insert into wm.online_orders (request_id, customer_name, customer_phone, soft_expires_at)
    values (gen_random_uuid(), 'T3 cancelar', '+584141234567', now() + interval '30 minutes')
    returning id into v_order;
  insert into pg_temp.staff_test_ids values ('cancel', v_order);
  insert into wm.online_order_items
    (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
    values (v_order, v_variant, v_a, 1, 10, 'Producto T3', 'Variante T3', 'T3-SKU');

  insert into wm.online_orders (request_id, customer_name, customer_phone, soft_expires_at)
    values (gen_random_uuid(), 'T3 extender', '+584141234567', now() + interval '30 minutes')
    returning id into v_order;
  insert into pg_temp.staff_test_ids values ('extend', v_order);
  insert into wm.online_order_items
    (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
    values (v_order, v_variant, v_b, 1, 10, 'Producto T3', 'Variante T3', 'T3-SKU');

  insert into wm.online_orders (request_id, customer_name, customer_phone, soft_expires_at,
    status, firm_expires_at)
    values (gen_random_uuid(), 'T3 extender vencido', '+584141234567',
      now() - interval '2 days', 'aceptada', now() - interval '1 minute')
    returning id into v_order;
  insert into pg_temp.staff_test_ids values ('extend_expired', v_order);
  insert into wm.online_order_items
    (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
    values (v_order, v_variant, v_short, 1, 10, 'Producto T3', 'Variante T3', 'T3-SKU');

  insert into wm.online_orders (request_id, customer_name, customer_phone, soft_expires_at)
    values (gen_random_uuid(), 'T3 sin permiso', '+584141234567', now() + interval '30 minutes')
    returning id into v_order;
  insert into pg_temp.staff_test_ids values ('unauthorized', v_order);
  insert into wm.online_order_items
    (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
    values (v_order, v_variant, v_a, 1, 10, 'Producto T3', 'Variante T3', 'T3-SKU');

  insert into wm.online_orders (request_id, customer_name, customer_phone, soft_expires_at)
    values (gen_random_uuid(), 'T3 colisión', '+584141234567', now() + interval '30 minutes')
    returning id into v_order;
  insert into pg_temp.staff_test_ids values ('collision', v_order);
  insert into wm.online_order_items
    (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
    values (v_order, v_variant, v_a, 1, 10, 'Producto T3', 'Variante T3', 'T3-SKU')
    returning id into v_item;
  insert into pg_temp.staff_test_ids values ('collision_item', v_item);
  insert into wm.online_order_items
    (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
    values (v_order, v_variant, v_b, 1, 10, 'Producto T3', 'Variante T3', 'T3-SKU');

  -- El rol Inventario tiene Ventas 1. Usar un usuario real no enlazado o crearlo
  -- dentro de la transacción para que auth.uid() represente al perfil sin permiso.
  if not exists (select 1 from wm.role_permissions
                  where role = 'Inventario' and module = 'Ventas' and level = 1) then
    raise exception 'prueba sin datos: Inventario debe tener Ventas 1';
  end if;
  select user_id into v_inventory_user from wm.profiles
   where role = 'Inventario' and status = 'Activo' and system_access = true
     and user_id is not null order by id limit 1;
  if v_inventory_user is null then
    select u.id into v_inventory_user from auth.users u
     where not exists (select 1 from wm.profiles p where p.user_id = u.id)
     order by u.id limit 1;
    if v_inventory_user is null then
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
        values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated',
          'staff-test-' || gen_random_uuid()::text || '@example.invalid', '')
        returning id into v_inventory_user;
    end if;
    insert into wm.profiles (user_id, full_name, email, role, status, system_access)
      values (v_inventory_user, 'Inventario T3',
        'test-inventario-' || gen_random_uuid()::text || '@example.invalid',
        'Inventario', 'Activo', true);
  end if;
  insert into pg_temp.staff_test_ids values ('inventory_user', v_inventory_user);
end $$;

select user_id as admin_user_id from wm.profiles
 where role = 'Super Admin' and status = 'Activo' and system_access = true
   and user_id is not null
 order by id limit 1 \gset
select set_config('request.jwt.claims',
  json_build_object('sub', :'admin_user_id', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_a uuid := (select id from pg_temp.staff_test_ids where name = 'a');
  v_b uuid := (select id from pg_temp.staff_test_ids where name = 'b');
  v_off uuid := (select id from pg_temp.staff_test_ids where name = 'off');
  v_accept uuid := (select id from pg_temp.staff_test_ids where name = 'accept');
  v_move uuid := (select id from pg_temp.staff_test_ids where name = 'move');
  v_move_item uuid := (select id from pg_temp.staff_test_ids where name = 'move_item');
  v_disabled uuid := (select id from pg_temp.staff_test_ids where name = 'disabled');
  v_disabled_item uuid := (select id from pg_temp.staff_test_ids where name = 'disabled_item');
  v_delete uuid := (select id from pg_temp.staff_test_ids where name = 'delete');
  v_delete_item uuid := (select id from pg_temp.staff_test_ids where name = 'delete_item');
  v_expired_ok uuid := (select id from pg_temp.staff_test_ids where name = 'expired_ok');
  v_expired_fail uuid := (select id from pg_temp.staff_test_ids where name = 'expired_fail');
  v_reject uuid := (select id from pg_temp.staff_test_ids where name = 'reject');
  v_cancel uuid := (select id from pg_temp.staff_test_ids where name = 'cancel');
  v_extend uuid := (select id from pg_temp.staff_test_ids where name = 'extend');
  v_extend_expired uuid := (select id from pg_temp.staff_test_ids where name = 'extend_expired');
  v_collision uuid := (select id from pg_temp.staff_test_ids where name = 'collision');
  v_collision_item uuid := (select id from pg_temp.staff_test_ids where name = 'collision_item');
  v_order wm.online_orders;
  v_prior_expiry timestamptz;
  v_hours int;
  v_rejected boolean;
begin
  v_order := wm.online_order_accept(v_accept);
  if v_order.status <> 'aceptada'
     or v_order.accepted_by is null or v_order.accepted_at is null
     or v_order.firm_expires_at <> now() + interval '24 hours'
     or (select coalesce(sum(held), 0) from wm.online_holds where order_id = v_accept) <> 2 then
    raise exception 'accept no creó el apartado firme por 24 h';
  end if;

  v_order := wm.online_order_accept(v_move,
    jsonb_build_array(jsonb_build_object('item_id', v_move_item, 'branch_id', v_b, 'quantity', 2)));
  if v_order.status <> 'aceptada'
     or (select branch_id from wm.online_order_items where id = v_move_item) <> v_b
     or (select quantity from wm.online_order_items where id = v_move_item) <> 2 then
    raise exception 'accept no movió/corrigió la línea';
  end if;

  v_rejected := false;
  begin
    perform wm.online_order_accept(v_disabled,
      jsonb_build_array(jsonb_build_object('item_id', v_disabled_item, 'branch_id', v_off, 'quantity', 1)));
  exception when others then
    if sqlerrm not like '%no está habilitada para pedidos online%' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'accept permitió una sucursal sin tienda'; end if;

  v_rejected := false;
  begin
    perform wm.online_order_accept(v_delete,
      jsonb_build_array(jsonb_build_object('item_id', v_delete_item, 'branch_id', v_a, 'quantity', 0)));
  exception when others then
    if sqlerrm not like '%al menos un producto%' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'accept permitió borrar la única línea'; end if;
  v_rejected := false;
  begin
    perform wm.online_order_accept(v_delete,
      jsonb_build_array(jsonb_build_object('item_id', v_delete_item, 'branch_id', v_a, 'quantity', -1)));
  exception when others then
    if sqlerrm not like '%cantidad entera no negativa%' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'accept permitió una cantidad negativa'; end if;
  v_rejected := false;
  begin
    perform wm.online_order_accept(v_delete,
      jsonb_build_array(jsonb_build_object('item_id', v_delete_item, 'branch_id', v_a, 'quantity', '1')));
  exception when others then
    if sqlerrm not like '%cantidad entera no negativa%' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'accept permitió una cantidad de texto'; end if;

  v_order := wm.online_order_accept(v_expired_ok);
  if v_order.status <> 'aceptada' or v_order.firm_expires_at <= now() then
    raise exception 'accept rechazó una solicitud vencida con stock';
  end if;
  v_rejected := false;
  begin
    perform wm.online_order_accept(v_expired_fail);
  exception when others then
    if sqlerrm not like '%«Producto T3» en T3 Sin stock: pides 1, hay 0%' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'accept apartó stock ya tomado por otro pedido'; end if;

  v_rejected := false;
  begin
    perform wm.online_order_accept(v_disabled,
      jsonb_build_array(jsonb_build_object('item_id', v_move_item, 'branch_id', v_a, 'quantity', 1)));
  exception when others then
    if sqlerrm not like '%no pertenece a este pedido%' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'accept aceptó una línea de otro pedido'; end if;

  v_rejected := false;
  begin
    perform wm.online_order_accept(v_collision,
      jsonb_build_array(jsonb_build_object('item_id', v_collision_item, 'branch_id', v_b, 'quantity', 1)));
  exception when others then
    if sqlerrm not like '%ya tiene «Producto T3» en esa sucursal%' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'accept no detectó líneas duplicadas al mover'; end if;
  v_order := wm.online_order_accept(v_collision,
    jsonb_build_array(jsonb_build_object('item_id', v_collision_item, 'branch_id', v_a, 'quantity', 0)));
  if v_order.status <> 'aceptada'
     or exists (select 1 from wm.online_order_items where id = v_collision_item)
     or (select count(*) from wm.online_order_items where order_id = v_collision) <> 1 then
    raise exception 'accept no borró la línea con cantidad cero';
  end if;

  v_rejected := false;
  begin
    perform wm.online_order_reject(v_accept);
  exception when others then
    if sqlerrm not like '%Solo se puede rechazar un pedido solicitado%' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'reject permitió un pedido aceptado'; end if;
  v_order := wm.online_order_reject(v_reject, 'Sin disponibilidad');
  if v_order.status <> 'rechazada' or v_order.closed_by is null
     or v_order.closed_at is null or v_order.close_reason <> 'Sin disponibilidad'
     or (select count(*) from wm.online_holds where order_id = v_reject) <> 0 then
    raise exception 'reject no cerró/liberó el pedido';
  end if;

  perform wm.online_order_accept(v_cancel);
  v_order := wm.online_order_cancel(v_cancel, 'Cliente desistió');
  if v_order.status <> 'cancelada' or v_order.closed_by is null
     or v_order.closed_at is null or v_order.close_reason <> 'Cliente desistió'
     or (select count(*) from wm.online_holds where order_id = v_cancel) <> 0
     or exists (select 1 from wm.online_order_items where order_id = v_cancel and released_at is null) then
    raise exception 'cancel no cerró/liberó el pedido sin ventas';
  end if;

  v_order := wm.online_order_accept(v_extend);
  v_prior_expiry := v_order.firm_expires_at;
  v_order := wm.online_order_extend(v_extend);
  if v_order.firm_expires_at <> v_prior_expiry + interval '24 hours' then
    raise exception 'extend no sumó 24 h al apartado firme';
  end if;
  foreach v_hours in array array[0, -1, 169] loop
    v_rejected := false;
    begin
      perform wm.online_order_extend(v_extend, v_hours);
    exception when others then
      if sqlerrm not like '%Las horas de extensión deben estar entre 1 y 168%' then raise; end if;
      v_rejected := true;
    end;
    if not v_rejected then raise exception 'extend aceptó % horas', v_hours; end if;
  end loop;
  v_rejected := false;
  begin
    perform wm.online_order_extend(v_extend_expired);
  exception when others then
    if sqlerrm not like '%«Producto T3» en T3 Sin stock: pides 1, hay 0%' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'extend reactivó un apartado vencido sin stock'; end if;

  if (select count(*) from wm.audit_log a join wm.online_orders o
         on a.action = 'Aceptó el pedido online ' || o.number
        where o.id in (v_accept, v_move, v_expired_ok, v_cancel, v_extend, v_collision)
          and a.module = 'Ventas' and a.severity = 'edit') <> 6
     or (select count(*) from wm.audit_log a join wm.online_orders o
           on a.action = 'Rechazó el pedido online ' || o.number
          where o.id = v_reject and a.module = 'Ventas' and a.severity = 'edit') <> 1
     or (select count(*) from wm.audit_log a join wm.online_orders o
           on a.action = 'Canceló el pedido online ' || o.number
          where o.id = v_cancel and a.module = 'Ventas' and a.severity = 'edit') <> 1
     or (select count(*) from wm.audit_log a join wm.online_orders o
           on a.action = 'Extendió el pedido online ' || o.number
          where o.id = v_extend and a.module = 'Ventas' and a.severity = 'edit') <> 1 then
    raise exception 'una acción exitosa no dejó exactamente una fila de auditoría';
  end if;
end $$;
reset role;

-- El borrado de settings se hace como postgres; la llamada se prueba como miembro ERP.
delete from wm.online_settings where id = 1;
set local role authenticated;
do $$
declare v_rejected boolean := false;
begin
  begin
    perform wm.online_order_extend((select id from pg_temp.staff_test_ids where name = 'extend'));
  exception when others then
    if sqlerrm not like '%Falta la configuración de pedidos online%' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'extend aceptó configuración ausente'; end if;
end $$;
reset role;
insert into wm.online_settings (id, firm_hold_hours) values (1, 24);

select set_config('request.jwt.claims',
  json_build_object('sub', (select id from pg_temp.staff_test_ids where name = 'inventory_user'),
    'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_rejected boolean := false;
begin
  begin
    perform wm.online_order_accept(
      (select id from pg_temp.staff_test_ids where name = 'unauthorized'));
  exception when others then
    if sqlerrm not like '%No autorizado para gestionar pedidos online%' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'perfil con Ventas 1 pudo aceptar'; end if;
end $$;
reset role;

rollback;
