-- Ejecutar desde la raíz; datos y DDL se revierten al final.
\set ON_ERROR_STOP 1
begin;

-- R1: no consumir secuencias de producción en pruebas con ROLLBACK.
alter table wm.sales alter column invoice_number
  set default ('TEST-' || gen_random_uuid()::text);
do $$ begin
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
\i supabase/online_orders_staff.sql
\i supabase/online_orders_staff.sql
\i supabase/shop_schema.sql
\i supabase/shop_schema.sql
\i supabase/shop_crear_solicitud.sql
\i supabase/shop_crear_solicitud.sql

update wm.online_settings set soft_hold_minutes = 30, max_units_per_line = 10,
  max_units_per_order = 30, max_lines = 20, max_open_per_phone = 2 where id = 1;

create temporary table shop_request_test (
  name text primary key, id uuid, payload jsonb, result jsonb
);
grant select, update on pg_temp.shop_request_test to storefront;

do $$
declare
  v_tag text := pg_catalog.replace(gen_random_uuid()::text, '-', '');
  v_parent uuid;
  v_category uuid;
  v_brand uuid;
  v_color uuid;
  v_product uuid;
  v_hidden_product uuid;
  v_variant uuid;
  v_hidden_variant uuid;
  v_branch uuid;
  v_branch_2 uuid;
  v_off_branch uuid;
  v_base jsonb;
  v_line jsonb;
begin
  insert into wm.categories (name, slug)
    values ('T5 dept ' || v_tag, 't5-dept-' || v_tag) returning id into v_parent;
  insert into wm.categories (name, slug, parent_id)
    values ('T5 cat ' || v_tag, 't5-cat-' || v_tag, v_parent) returning id into v_category;
  insert into wm.brands (name, slug)
    values ('T5 brand ' || v_tag, 't5-brand-' || v_tag) returning id into v_brand;
  insert into wm.colors (name, slug)
    values ('T5 color ' || v_tag, 't5-color-' || v_tag) returning id into v_color;
  insert into wm.branches (code, city, name, online_enabled)
    values ('T5A-' || v_tag, 'Caracas', 'T5 A', true) returning id into v_branch;
  insert into wm.branches (code, city, name, online_enabled)
    values ('T5B-' || v_tag, 'Valencia', 'T5 B', true) returning id into v_branch_2;
  insert into wm.branches (code, city, name, online_enabled)
    values ('T5C-' || v_tag, 'Caracas', 'T5 offline', false) returning id into v_off_branch;
  insert into wm.products (name, slug, description, category_id, brand_id)
    values ('T5 published', 't5-published-' || v_tag, 'T5 description', v_category, v_brand)
    returning id into v_product;
  insert into wm.product_variants (product_id, sku, price, color_id)
    values (v_product, 'T5-SKU-' || v_tag, 12.50, v_color) returning id into v_variant;
  insert into wm.product_media (product_id, color_id, path)
    values (v_product, v_color, 't5/' || v_tag || '/photo.webp');
  insert into wm.inventory (variant_id, branch_id, quantity)
    values (v_variant, v_branch, 10), (v_variant, v_branch_2, 5);
  insert into wm.products (name, slug, description, category_id, brand_id, visible_in_catalog)
    values ('T5 hidden', 't5-hidden-' || v_tag, 'T5 description', v_category, v_brand, false)
    returning id into v_hidden_product;
  insert into wm.product_variants (product_id, sku, price, color_id)
    values (v_hidden_product, 'T5-HIDDEN-' || v_tag, 9, v_color)
    returning id into v_hidden_variant;
  insert into wm.product_media (product_id, color_id, path)
    values (v_hidden_product, v_color, 't5/' || v_tag || '/hidden.webp');

  if not exists (select 1 from shop.variants where variant_id = v_variant)
     or not exists (select 1 from shop.branches where branch_id = v_branch_2) then
    raise exception 'fixture no publicada en shop';
  end if;
  v_line := pg_catalog.jsonb_build_object('variant_id', v_variant,
    'branch_id', v_branch, 'quantity', 2, 'unit_price', 0.01);
  v_base := pg_catalog.jsonb_build_object('request_id', gen_random_uuid(),
    'customer', pg_catalog.jsonb_build_object('name', 'Cliente T5',
      'phone', '+584141234567', 'email', 'cliente@example.com'),
    'items', pg_catalog.jsonb_build_array(v_line));
  insert into pg_temp.shop_request_test (name, id, payload)
    values ('main', v_variant, v_base), ('branch', v_branch, null),
           ('branch_2', v_branch_2, null), ('off_branch', v_off_branch, null),
           ('hidden_variant', v_hidden_variant, null);
end $$;

grant storefront to postgres;
set local role storefront;
do $$
declare
  v_payload jsonb := (select payload from pg_temp.shop_request_test where name = 'main');
  v_result jsonb;
begin
  v_result := shop.crear_solicitud(v_payload);
  if v_result->>'ok' <> 'true'
     or v_result->'order'->>'number' !~ '^TEST-[0-9a-f-]{36}$'
     or v_result->'order'->>'status' <> 'solicitada'
     or pg_catalog.jsonb_array_length(v_result->'order'->'groups') <> 1
     or (v_result->'order'->>'total')::numeric <> 25.00
     or (v_result->'order'->'groups'->0->'items'->0->>'unit_price')::numeric <> 12.50 then
    raise exception 'solicitud inicial incorrecta: %', v_result;
  end if;
  update pg_temp.shop_request_test set result = v_result where name = 'main';
  if shop.crear_solicitud(v_payload)->'order'->>'order_id'
     <> v_result->'order'->>'order_id' then
    raise exception 'reintento creó otra solicitud';
  end if;
  v_result := shop.crear_solicitud(pg_catalog.jsonb_set(
    v_payload, '{customer,phone}', '"+584141234568"'::jsonb));
  if v_result->>'code' <> 'invalid_input'
     or v_result->>'message' <> 'Identificador de solicitud ya usado'
     or v_result ? 'order' then
    raise exception 'request_id reutilizado con otro teléfono expuso pedido: %', v_result;
  end if;
end $$;
reset role;

do $$
declare
  v_variant uuid := (select id from pg_temp.shop_request_test where name = 'main');
  v_branch uuid := (select id from pg_temp.shop_request_test where name = 'branch');
  v_order uuid := (select (result->'order'->>'order_id')::uuid
                   from pg_temp.shop_request_test where name = 'main');
begin
  if wm.online_held(v_variant, v_branch) <> 2
     or (select count(*) from wm.online_orders where id = v_order) <> 1 then
    raise exception 'reintento duplicó el apartado';
  end if;
  update wm.online_orders set soft_expires_at = pg_catalog.now() - interval '1 minute'
    where id = v_order;
  if wm.online_held(v_variant, v_branch) <> 0 then
    raise exception 'el apartado vencido no se liberó';
  end if;
end $$;

set local role storefront;
do $$
declare
  v_base jsonb := (select payload from pg_temp.shop_request_test where name = 'main');
  v_variant uuid := (select id from pg_temp.shop_request_test where name = 'main');
  v_branch uuid := (select id from pg_temp.shop_request_test where name = 'branch');
  v_branch_2 uuid := (select id from pg_temp.shop_request_test where name = 'branch_2');
  v_off uuid := (select id from pg_temp.shop_request_test where name = 'off_branch');
  v_hidden uuid := (select id from pg_temp.shop_request_test where name = 'hidden_variant');
  v_line jsonb;
  v_payload jsonb;
  v_result jsonb;
  v_many jsonb := '[]'::jsonb;
  v_idx int;
begin
  if shop.crear_solicitud(v_base)->'order'->>'order_id'
     <> (select result->'order'->>'order_id' from pg_temp.shop_request_test where name = 'main') then
    raise exception 'reintento vencido no devolvió el mismo pedido';
  end if;
  v_payload := pg_catalog.jsonb_set(v_base, '{request_id}', pg_catalog.to_jsonb(gen_random_uuid()));
  v_payload := pg_catalog.jsonb_set(v_payload, '{customer,phone}', '"04141234567"'::jsonb);
  if shop.crear_solicitud(v_payload)->>'code' <> 'invalid_input' then
    raise exception 'teléfono no E.164 aceptado';
  end if;
  v_payload := pg_catalog.jsonb_set(v_base, '{request_id}', pg_catalog.to_jsonb(gen_random_uuid()));
  v_payload := pg_catalog.jsonb_set(v_payload, '{customer,email}',
    pg_catalog.to_jsonb(pg_catalog.repeat('a', 250) || '@x.com'));
  if shop.crear_solicitud(v_payload)->>'code' <> 'invalid_input' then
    raise exception 'correo de más de 254 caracteres aceptado';
  end if;
  v_payload := pg_catalog.jsonb_set(v_base, '{request_id}', pg_catalog.to_jsonb(gen_random_uuid()));
  v_payload := pg_catalog.jsonb_set(v_payload, '{customer,name}',
    pg_catalog.to_jsonb(E'Cliente\nT5'::text));
  if shop.crear_solicitud(v_payload)->>'code' <> 'invalid_input' then
    raise exception 'nombre con carácter de control aceptado';
  end if;
  v_payload := pg_catalog.jsonb_set(v_base, '{request_id}', pg_catalog.to_jsonb(gen_random_uuid()));
  v_payload := pg_catalog.jsonb_set(v_payload, '{items}',
    (v_base->'items') || (v_base->'items'));
  if shop.crear_solicitud(v_payload)->>'code' <> 'invalid_input' then
    raise exception 'línea repetida aceptada';
  end if;
  v_payload := pg_catalog.jsonb_set(v_base, '{request_id}', pg_catalog.to_jsonb(gen_random_uuid()));
  v_payload := pg_catalog.jsonb_set(v_payload, '{items,0,quantity}', '11'::jsonb);
  if shop.crear_solicitud(v_payload)->>'code' <> 'too_many_units' then
    raise exception 'tope por línea no aplicado';
  end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'variant_id', gen_random_uuid(), 'branch_id', v_branch, 'quantity', 1))
    into v_many from pg_catalog.generate_series(1, 1000) as n;
  v_payload := pg_catalog.jsonb_set(v_base, '{request_id}', pg_catalog.to_jsonb(gen_random_uuid()));
  v_payload := pg_catalog.jsonb_set(v_payload, '{items}', v_many);
  if shop.crear_solicitud(v_payload)->>'code' <> 'too_many_lines' then
    raise exception 'tope temprano de 1000 líneas no aplicado';
  end if;
  -- A missing/invalid JSON shape must be a business error, not a cast exception.
  v_payload := pg_catalog.jsonb_set(v_base, '{request_id}', pg_catalog.to_jsonb(gen_random_uuid()));
  v_payload := pg_catalog.jsonb_set(v_payload, '{items}', '{}'::jsonb);
  if shop.crear_solicitud(v_payload)->>'code' <> 'invalid_input' then
    raise exception 'items no array aceptado';
  end if;
  v_payload := pg_catalog.jsonb_set(v_base, '{request_id}', pg_catalog.to_jsonb(gen_random_uuid()));
  v_payload := pg_catalog.jsonb_set(v_payload, '{items,0,quantity}', '"1.5"'::jsonb);
  if shop.crear_solicitud(v_payload)->>'code' <> 'invalid_input' then
    raise exception 'cantidad no entera aceptada';
  end if;
  v_payload := pg_catalog.jsonb_set(v_base, '{request_id}', pg_catalog.to_jsonb(gen_random_uuid()));
  v_payload := pg_catalog.jsonb_set(v_payload, '{items,0,variant_id}', '"bad-uuid"'::jsonb);
  if shop.crear_solicitud(v_payload)->>'code' <> 'invalid_input' then
    raise exception 'uuid inválido aceptado';
  end if;

  v_payload := pg_catalog.jsonb_set(v_base, '{request_id}', pg_catalog.to_jsonb(gen_random_uuid()));
  v_payload := pg_catalog.jsonb_set(v_payload, '{items,0,variant_id}', pg_catalog.to_jsonb(v_hidden));
  if shop.crear_solicitud(v_payload)->>'code' <> 'not_found' then
    raise exception 'producto oculto aceptado';
  end if;
  v_payload := pg_catalog.jsonb_set(v_base, '{request_id}', pg_catalog.to_jsonb(gen_random_uuid()));
  v_payload := pg_catalog.jsonb_set(v_payload, '{items,0,branch_id}', pg_catalog.to_jsonb(v_off));
  if shop.crear_solicitud(v_payload)->>'code' <> 'not_found' then
    raise exception 'sucursal deshabilitada aceptada';
  end if;

  -- Two live requests for another phone; third must be rejected.
  for v_idx in 1..2 loop
    v_payload := pg_catalog.jsonb_set(v_base, '{request_id}', pg_catalog.to_jsonb(gen_random_uuid()));
    v_payload := pg_catalog.jsonb_set(v_payload, '{customer,phone}', '"+584241234567"'::jsonb);
    v_payload := pg_catalog.jsonb_set(v_payload, '{items,0,quantity}', '1'::jsonb);
    if shop.crear_solicitud(v_payload)->>'ok' <> 'true' then
      raise exception 'solicitud vigente % falló', v_idx;
    end if;
  end loop;
  v_payload := pg_catalog.jsonb_set(v_payload, '{request_id}', pg_catalog.to_jsonb(gen_random_uuid()));
  if shop.crear_solicitud(v_payload)->>'code' <> 'too_many_open_requests' then
    raise exception 'tercera solicitud vigente aceptada';
  end if;

  v_payload := pg_catalog.jsonb_set(v_base, '{request_id}', pg_catalog.to_jsonb(gen_random_uuid()));
  v_payload := pg_catalog.jsonb_set(v_payload, '{customer,phone}', '"+584141234568"'::jsonb);
  v_line := pg_catalog.jsonb_build_object('variant_id', v_variant,
    'branch_id', v_branch_2, 'quantity', 1);
  v_payload := pg_catalog.jsonb_set(v_payload, '{items}',
    pg_catalog.jsonb_build_array(v_base->'items'->0, v_line));
  v_result := shop.crear_solicitud(v_payload);
  if v_result->>'ok' <> 'true'
     or pg_catalog.jsonb_array_length(v_result->'order'->'groups') <> 2
     or (v_result->'order'->>'total')::numeric <> 37.50
     or (v_result->'order'->'groups'->0->>'subtotal')::numeric
        + (v_result->'order'->'groups'->1->>'subtotal')::numeric <> 37.50 then
    raise exception 'agrupación por sucursal incorrecta: %', v_result;
  end if;

  v_payload := pg_catalog.jsonb_set(v_base, '{request_id}', pg_catalog.to_jsonb(gen_random_uuid()));
  v_payload := pg_catalog.jsonb_set(v_payload, '{customer,phone}', '"+584141234569"'::jsonb);
  v_payload := pg_catalog.jsonb_set(v_payload, '{items,0,quantity}', '7'::jsonb);
  v_result := shop.crear_solicitud(v_payload);
  if v_result->>'code' <> 'unavailable'
     or (v_result->'lines'->0->>'requested')::int <> 7
     or (v_result->'lines'->0->>'available')::int <> 6 then
    raise exception 'disponibilidad real incorrecta: %', v_result;
  end if;
end $$;
reset role;

-- Simula una despublicación entre la comprobación y el INSERT de líneas.
do $$
declare
  v_request_id uuid := gen_random_uuid();
  v_payload jsonb := (select payload from pg_temp.shop_request_test where name = 'main');
begin
  v_payload := pg_catalog.jsonb_set(v_payload, '{request_id}', pg_catalog.to_jsonb(v_request_id));
  v_payload := pg_catalog.jsonb_set(v_payload, '{customer,phone}', '"+584141234570"'::jsonb);
  insert into pg_temp.shop_request_test (name, id, payload)
    values ('race', v_request_id, v_payload);
end $$;
create or replace function pg_temp.t5_unpublish_on_order()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.customer_phone = '+584141234570' then
    update wm.products set visible_in_catalog = false
     where id = (select v.product_id from wm.product_variants v
                  where v.id = (select id from pg_temp.shop_request_test where name = 'main'));
  end if;
  return new;
end
$function$;
drop trigger if exists t5_unpublish_on_order on wm.online_orders;
create trigger t5_unpublish_on_order after insert on wm.online_orders
  for each row execute function pg_temp.t5_unpublish_on_order();

set local role storefront;
do $$
declare
  v_payload jsonb := (select payload from pg_temp.shop_request_test where name = 'race');
  v_failed boolean := false;
begin
  begin
    perform shop.crear_solicitud(v_payload);
  exception when others then
    if sqlerrm not like 'No se insertaron todas las líneas de la solicitud%' then
      raise;
    end if;
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'despublicación concurrente creó una solicitud parcial';
  end if;
end $$;
reset role;

do $$
begin
  if exists (select 1 from wm.online_orders
             where request_id = (select id from pg_temp.shop_request_test where name = 'race'))
     or not exists (select 1 from shop.variants
                     where variant_id = (select id from pg_temp.shop_request_test where name = 'main')) then
    raise exception 'la excepción de línea parcial no revirtió la orden y despublicación';
  end if;
end $$;

do $$
begin
  if pg_catalog.has_schema_privilege('storefront', 'wm', 'USAGE')
     or exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'wm' and p.proname in ('online_order_accept', 'create_sale')
      and pg_catalog.has_function_privilege('storefront', p.oid, 'EXECUTE')) then
    raise exception 'storefront tiene acceso al esquema wm o a funciones de venta o aceptación';
  end if;
  if not pg_catalog.has_function_privilege('storefront',
       'shop.crear_solicitud(jsonb)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'shop.crear_solicitud(jsonb)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',
       'shop.crear_solicitud(jsonb)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role',
       'shop.crear_solicitud(jsonb)', 'EXECUTE') then
    raise exception 'privilegios de crear_solicitud incorrectos';
  end if;
end $$;

rollback;
