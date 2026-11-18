-- Única escritura concedida a la tienda. Ejecutar después de online_orders.sql y shop_schema.sql.
create or replace function shop.crear_solicitud(p_request jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_request_id uuid;
  v_order wm.online_orders;
  v_customer jsonb;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_bad_lines jsonb := '[]'::jsonb;
  v_line record;
  v_name text;
  v_phone text;
  v_email text;
  v_document text;
  v_notes text;
  v_source_ip pg_catalog.inet;
  v_total_units bigint := 0;
  v_settings wm.online_settings;
  v_stock int;
  v_available int;
  v_result jsonb;
  v_inserted_count bigint;
begin
  -- Serialize retries before reading the existing order. Canonical UUID text
  -- also makes case variations of a request_id take the same advisory lock.
  if pg_catalog.jsonb_typeof(p_request) is distinct from 'object'
     or pg_catalog.jsonb_typeof(p_request->'request_id') is distinct from 'string'
     or (p_request->>'request_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input',
      'message', 'El identificador de la solicitud no es válido.');
  end if;
  v_request_id := (p_request->>'request_id')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('shop:' || v_request_id::text, 0));
  select * into v_order from wm.online_orders where request_id = v_request_id;

  v_customer := p_request->'customer';
  if pg_catalog.jsonb_typeof(v_customer) is distinct from 'object'
     or pg_catalog.jsonb_typeof(v_customer->'phone') is distinct from 'string'
     or (v_customer->>'phone') !~ '^\+[1-9][0-9]{7,14}$' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input',
      'message', 'Revisa los datos de la solicitud.');
  end if;
  v_phone := v_customer->>'phone';
  if v_order.id is not null and v_order.customer_phone is distinct from v_phone then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input',
      'message', 'Identificador de solicitud ya usado');
  end if;

  if v_order.id is null then
    select * into v_settings from wm.online_settings where id = 1;
    if not found then
      raise exception 'Falta la configuración de pedidos online';
    end if;
    if pg_catalog.jsonb_typeof(p_request->'items') = 'array' then
      if pg_catalog.jsonb_array_length(p_request->'items') > v_settings.max_lines then
        return pg_catalog.jsonb_build_object('ok', false, 'code', 'too_many_lines',
          'message', 'El pedido tiene demasiadas líneas.');
      end if;
    end if;
    if pg_catalog.jsonb_typeof(v_customer) is distinct from 'object'
       or pg_catalog.jsonb_typeof(v_customer->'name') is distinct from 'string'
       or pg_catalog.char_length(pg_catalog.btrim(v_customer->>'name')) not between 2 and 120
       or (v_customer->>'name') ~ '[[:cntrl:]]'
       or pg_catalog.jsonb_typeof(p_request->'items') is distinct from 'array' then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input',
        'message', 'Revisa los datos de la solicitud.');
    end if;
    if pg_catalog.jsonb_array_length(p_request->'items') = 0 then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input',
        'message', 'El pedido debe contener al menos una línea.');
    end if;
    v_name := pg_catalog.btrim(v_customer->>'name');

    if (v_customer ? 'email' and pg_catalog.jsonb_typeof(v_customer->'email') not in ('string', 'null'))
       or (v_customer ? 'document' and pg_catalog.jsonb_typeof(v_customer->'document') not in ('string', 'null'))
       or (p_request ? 'notes' and pg_catalog.jsonb_typeof(p_request->'notes') not in ('string', 'null'))
       or (p_request ? 'source_ip' and pg_catalog.jsonb_typeof(p_request->'source_ip') not in ('string', 'null')) then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input',
        'message', 'Revisa los datos de la solicitud.');
    end if;
    v_email := v_customer->>'email';
    v_document := v_customer->>'document';
    v_notes := p_request->>'notes';
    if (v_email is not null and (pg_catalog.char_length(v_email) > 254
                                or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
       or (v_document is not null and v_document !~ '^[VEJPG]-?[0-9]{5,10}$')
       or pg_catalog.char_length(v_notes) > 500 then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input',
        'message', 'Revisa los datos de la solicitud.');
    end if;
    if p_request->>'source_ip' is not null then
      begin
        v_source_ip := (p_request->>'source_ip')::pg_catalog.inet;
      exception when invalid_text_representation then
        return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input',
          'message', 'La dirección IP no es válida.');
      end;
    end if;

    for v_item in select value from pg_catalog.jsonb_array_elements(p_request->'items') loop
      if pg_catalog.jsonb_typeof(v_item) is distinct from 'object'
         or pg_catalog.jsonb_typeof(v_item->'variant_id') is distinct from 'string'
         or pg_catalog.jsonb_typeof(v_item->'branch_id') is distinct from 'string'
         or (v_item->>'variant_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or (v_item->>'branch_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or pg_catalog.jsonb_typeof(v_item->'quantity') is distinct from 'number'
         or (v_item->>'quantity') !~ '^[1-9][0-9]*$' then
        return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input',
          'message', 'Revisa las líneas de la solicitud.');
      end if;
      if pg_catalog.length(v_item->>'quantity') > 10
         or (v_item->>'quantity')::numeric > 2147483647 then
        return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input',
          'message', 'Revisa las líneas de la solicitud.');
      end if;
      v_items := v_items || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('variant_id', (v_item->>'variant_id')::uuid,
          'branch_id', (v_item->>'branch_id')::uuid,
          'quantity', (v_item->>'quantity')::int));
    end loop;
    if exists (
      select 1 from pg_catalog.jsonb_to_recordset(v_items)
        as i(variant_id uuid, branch_id uuid)
      group by i.variant_id, i.branch_id having pg_catalog.count(*) > 1
    ) then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input',
        'message', 'Hay una variante repetida en la misma sucursal.');
    end if;
    select pg_catalog.sum(i.quantity) into v_total_units
      from pg_catalog.jsonb_to_recordset(v_items) as i(quantity int);
    if v_total_units > v_settings.max_units_per_order
       or exists (select 1 from pg_catalog.jsonb_to_recordset(v_items) as i(quantity int)
                  where i.quantity > v_settings.max_units_per_line) then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'too_many_units',
        'message', 'El pedido supera el máximo de unidades.');
    end if;
    -- Distinct checkout IDs for one phone must see each other's committed orders.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('shop:phone:' || v_phone, 0));
    if (select pg_catalog.count(*) from wm.v_online_orders
        where customer_phone = v_phone
          and effective_status in ('solicitada', 'aceptada')) >= v_settings.max_open_per_phone then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'too_many_open_requests',
        'message', 'Ya tienes solicitudes en revisión; te escribiremos por WhatsApp.');
    end if;

    for v_line in select * from pg_catalog.jsonb_to_recordset(v_items)
      as i(variant_id uuid, branch_id uuid, quantity int)
      order by variant_id, branch_id
    loop
      if not exists (select 1 from shop.variants where variant_id = v_line.variant_id)
         or not exists (select 1 from shop.branches where branch_id = v_line.branch_id) then
        v_bad_lines := v_bad_lines || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('variant_id', v_line.variant_id,
                                        'branch_id', v_line.branch_id));
      end if;
    end loop;
    if pg_catalog.jsonb_array_length(v_bad_lines) > 0 then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'not_found',
        'message', 'Algunos productos o sucursales ya no están disponibles.',
        'lines', v_bad_lines);
    end if;

    -- Keep the inventory lock sequence identical to create_sale and accept.
    for v_line in select * from pg_catalog.jsonb_to_recordset(v_items)
      as i(variant_id uuid, branch_id uuid, quantity int)
      order by variant_id, branch_id
    loop
      select quantity into v_stock from wm.inventory
       where variant_id = v_line.variant_id and branch_id = v_line.branch_id
       for update;
      v_available := coalesce(v_stock, 0)
                     - wm.online_held(v_line.variant_id, v_line.branch_id);
      if v_line.quantity > v_available then
        v_bad_lines := v_bad_lines || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('variant_id', v_line.variant_id,
            'branch_id', v_line.branch_id, 'requested', v_line.quantity,
            'available', greatest(v_available, 0)));
      end if;
    end loop;
    if pg_catalog.jsonb_array_length(v_bad_lines) > 0 then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'unavailable',
        'message', 'Algunos productos ya no tienen disponibilidad.', 'lines', v_bad_lines);
    end if;

    insert into wm.online_orders
      (request_id, customer_name, customer_phone, customer_email, customer_document,
       notes, source_ip, soft_expires_at)
    values (v_request_id, v_name, v_phone, v_email, v_document, v_notes,
            v_source_ip, pg_catalog.now() + pg_catalog.make_interval(mins => v_settings.soft_hold_minutes))
    returning * into v_order;

    insert into wm.online_order_items
      (order_id, variant_id, branch_id, quantity, unit_price, product_name,
       variant_label, sku)
    select v_order.id, i.variant_id, i.branch_id, i.quantity, v.price, p.name,
           coalesce(pg_catalog.concat_ws(' · ', v.color_name, v.option_label), ''), v.sku
      from pg_catalog.jsonb_to_recordset(v_items)
        as i(variant_id uuid, branch_id uuid, quantity int)
      join shop.variants v on v.variant_id = i.variant_id
      join wm.products p on p.id = v.product_id;
    get diagnostics v_inserted_count = row_count;
    if v_inserted_count <> pg_catalog.jsonb_array_length(v_items) then
      raise exception 'No se insertaron todas las líneas de la solicitud (% de %)',
        v_inserted_count, pg_catalog.jsonb_array_length(v_items);
    end if;
  end if;

  -- Rebuild from stored lines on every retry, including expired orders.
  with grouped as (
    select b.id as branch_id, b.name as branch_name, b.city,
           pg_catalog.round(pg_catalog.sum(i.quantity * i.unit_price), 2) as subtotal,
           pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'variant_id', i.variant_id, 'sku', i.sku, 'product_name', i.product_name,
             'variant_label', i.variant_label, 'quantity', i.quantity,
             'unit_price', i.unit_price,
             'line_total', pg_catalog.round(i.quantity * i.unit_price, 2))
             order by i.product_name, i.variant_id) as items
      from wm.online_order_items i
      join wm.branches b on b.id = i.branch_id
      where i.order_id = v_order.id
      group by b.id, b.name, b.city
  )
  select pg_catalog.jsonb_build_object('ok', true, 'order',
    pg_catalog.jsonb_build_object(
      'order_id', v_order.id, 'number', v_order.number, 'status', v_order.status,
      'soft_expires_at', v_order.soft_expires_at,
      'total', coalesce(pg_catalog.sum(g.subtotal), 0),
      'groups', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'branch_id', g.branch_id, 'branch_name', g.branch_name, 'city', g.city,
        'subtotal', g.subtotal, 'items', g.items)
        order by g.branch_name, g.branch_id), '[]'::jsonb)))
    into v_result
    from grouped g;
  return v_result;
end
$function$;

alter function shop.crear_solicitud(jsonb) owner to postgres;
revoke all on function shop.crear_solicitud(jsonb)
  from public, anon, authenticated, service_role, storefront;
grant execute on function shop.crear_solicitud(jsonb) to storefront;
