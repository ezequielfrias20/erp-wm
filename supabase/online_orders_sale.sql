-- create_sale: respeta apartados online y convierte líneas del pedido por sucursal.
-- Product variant prices are final prices with IVA included.
-- The sale subtotal stores the final-price subtotal before discount.
-- IVA is extracted from the final total instead of added on top.
-- Cashea: financed_amount = 0 sólo se admite en canal online (pago total 100%);
-- esa orden nace `cobrada`, sin comisión ni nada por cobrar.

alter table wm.sales add column if not exists request_id uuid;
create unique index if not exists sales_user_request_uidx
  on wm.sales (user_id, request_id) where request_id is not null;

-- Evita dos sobrecargas ambiguas para PostgREST.
drop function if exists wm.create_sale(uuid, uuid, jsonb, numeric, numeric, jsonb, text, jsonb, uuid, text);

create or replace function wm.create_sale(
  p_branch_id uuid,
  p_customer_id uuid,
  p_payments jsonb,
  p_discount_pct numeric,
  p_rate numeric,
  p_items jsonb,
  p_status text default 'Pagada'::text,
  p_cashea jsonb default null,
  p_seller_id uuid default null,
  p_seller_code text default null,
  p_online_order_id uuid default null
)
returns wm.sales
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile uuid := wm.my_profile_id();
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_taxbase numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_sale wm.sales;
  v_method text;
  v_seller uuid;
  v_seller_commission_pct numeric := 2;
  v_npay int := coalesce(pg_catalog.jsonb_array_length(p_payments), 0);
  v_request_id uuid := nullif(p_items->0->>'request_id', '')::uuid;
  it jsonb;
  pay jsonb;
  v_cashea_financed numeric;
  v_cashea_channel text;
  v_online_order wm.online_orders;
  v_stock int;
  v_held int;
  v_item record;
begin
  if v_profile is null or not wm.has_module('Ventas', 2) then
    raise exception 'No autorizado para registrar ventas';
  end if;
  if p_items is null or pg_catalog.jsonb_array_length(p_items) = 0 then
    raise exception 'El ticket no tiene productos';
  end if;
  if v_request_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profile::text || ':' || v_request_id::text, 0));
    select * into v_sale from wm.sales
    where user_id = v_profile and request_id = v_request_id;
    if found then return v_sale; end if;
  end if;
  if p_seller_id is null then
    raise exception 'Selecciona el vendedor de la venta';
  end if;

  select id, commission_pct into v_seller, v_seller_commission_pct
    from wm.profiles
     where id = p_seller_id
     and role = 'Vendedor'
     and status = 'Activo'
   limit 1;
  if v_seller is null then
    raise exception 'El vendedor seleccionado no es válido o está inactivo';
  end if;

  if p_online_order_id is not null then
    select * into v_online_order
      from wm.online_orders
     where id = p_online_order_id
     for update;
    if not found or v_online_order.status <> 'aceptada' then
      raise exception 'El pedido online % no está aceptado',
        coalesce(v_online_order.number, p_online_order_id::text);
    end if;
    if not exists (
      select 1 from wm.online_order_items
       where order_id = p_online_order_id
         and branch_id = p_branch_id
         and sale_id is null
         and released_at is null
    ) then
      raise exception 'El pedido % no tiene productos pendientes en esta sucursal',
        v_online_order.number;
    end if;
  end if;

  if coalesce(p_status, 'Pagada') = 'Pagada' then
    -- Bloquear variantes en orden estable y comprobar la suma de líneas del ticket.
    for v_item in
      select (item->>'variant_id')::uuid as variant_id,
             pg_catalog.sum((item->>'quantity')::int) as quantity,
             pg_catalog.min(item->>'description') as description
        from pg_catalog.jsonb_array_elements(p_items) as item
       group by (item->>'variant_id')::uuid
       order by (item->>'variant_id')::uuid
    loop
      select quantity into v_stock from wm.inventory
       where variant_id = v_item.variant_id and branch_id = p_branch_id
       for update;
      v_held := wm.online_held(v_item.variant_id, p_branch_id, p_online_order_id);
      if v_held > 0 and v_item.quantity > coalesce(v_stock, 0) - v_held then
        raise exception 'Solo puedes vender % de «%»: % unidad(es) están apartadas para pedidos online',
          greatest(coalesce(v_stock, 0) - v_held, 0), v_item.description, v_held;
      end if;
    end loop;
  end if;

  for it in select * from pg_catalog.jsonb_array_elements(p_items) loop
    v_subtotal := v_subtotal + (it->>'quantity')::numeric * (it->>'unit_price')::numeric;
  end loop;

  v_discount := pg_catalog.round(v_subtotal * coalesce(p_discount_pct, 0) / 100.0, 2);
  v_total    := pg_catalog.round(v_subtotal - v_discount, 2);
  v_taxbase  := pg_catalog.round(v_total / 1.16, 2);
  v_tax      := pg_catalog.round(v_total - v_taxbase, 2);

  if v_npay > 1 then
    v_method := 'Mixto';
  elsif v_npay = 1 then
    v_method := p_payments->0->>'method';
  else
    v_method := null;
  end if;

  insert into wm.sales (
    request_id, customer_id, branch_id, user_id, seller_id, seller_commission_pct, payment_method,
    subtotal, discount, discount_pct, tax, total,
    exchange_rate, total_ves, status, online_order_id
  ) values (
    v_request_id, p_customer_id, p_branch_id, v_profile, v_seller, coalesce(v_seller_commission_pct, 2), v_method,
    pg_catalog.round(v_subtotal, 2), v_discount, coalesce(p_discount_pct, 0), v_tax, v_total,
    p_rate, pg_catalog.round(v_total * coalesce(p_rate, 0), 2), coalesce(p_status, 'Pagada'), p_online_order_id
  )
  returning * into v_sale;

  for it in select * from pg_catalog.jsonb_array_elements(p_items) loop
    insert into wm.sale_items (sale_id, variant_id, description, quantity, unit_price, cost, line_total)
    values (
      v_sale.id,
      (it->>'variant_id')::uuid,
      it->>'description',
      (it->>'quantity')::int,
      (it->>'unit_price')::numeric,
      coalesce((it->>'cost')::numeric, 0),
      pg_catalog.round((it->>'quantity')::numeric * (it->>'unit_price')::numeric, 2)
    );

    if coalesce(p_status, 'Pagada') = 'Pagada' then
      update wm.inventory
         set quantity = greatest(0, quantity - (it->>'quantity')::int)
       where variant_id = (it->>'variant_id')::uuid
         and branch_id = p_branch_id;
    end if;
  end loop;

  if p_online_order_id is not null then
    -- La sucursal atendida deja de apartar: venta de líneas presentes, liberación del resto.
    update wm.online_order_items oi
       set sale_id = v_sale.id
     where oi.order_id = p_online_order_id
       and oi.branch_id = p_branch_id
       and oi.sale_id is null
       and oi.released_at is null
       and exists (
         select 1 from pg_catalog.jsonb_array_elements(p_items) as item
          where (item->>'variant_id')::uuid = oi.variant_id
       );
    update wm.online_order_items oi
       set released_at = pg_catalog.now()
     where oi.order_id = p_online_order_id
       and oi.branch_id = p_branch_id
       and oi.sale_id is null
       and oi.released_at is null;
    if not exists (
      select 1 from wm.online_order_items
       where order_id = p_online_order_id
         and sale_id is null
         and released_at is null
    ) then
      update wm.online_orders
         set status = 'completada', closed_at = pg_catalog.now(), closed_by = v_profile
       where id = p_online_order_id;
    end if;
  end if;

  if v_npay > 0 then
    for pay in select * from pg_catalog.jsonb_array_elements(p_payments) loop
      insert into wm.sale_payments (sale_id, method, currency, amount, amount_usd, reference)
      values (
        v_sale.id,
        pay->>'method',
        coalesce(pay->>'currency', 'VES'),
        coalesce((pay->>'amount')::numeric, 0),
        coalesce((pay->>'amount_usd')::numeric, 0),
        nullif(pay->>'reference', '')
      );
    end loop;
  end if;

  if p_cashea is not null then
    v_cashea_financed := coalesce((p_cashea->>'financed_amount')::numeric, v_total);
    v_cashea_channel := case when coalesce(p_cashea->>'channel','tienda') = 'online'
                             then 'online' else 'tienda' end;
    if v_cashea_financed < 0 then
      raise exception 'El monto financiado por Cashea no puede ser negativo';
    end if;
    -- Pago total (100%) sólo existe en Cashea Online: el dinero llegó entero a la
    -- tienda, no queda nada por cobrar y la orden nace conciliada, sin comisión.
    if v_cashea_financed = 0 and v_cashea_channel <> 'online' then
      raise exception 'En Cashea Tienda, si el cliente paga el total usa un método de pago normal';
    end if;
    insert into wm.cashea_orders (
      sale_id, branch_id, reference, total,
      initial_amount, financed_amount, commission_pct, status, channel,
      settled_at, settled_amount, commission_amount, net_amount
    ) values (
      v_sale.id, p_branch_id,
      coalesce(p_cashea->>'reference', ''),
      v_total,
      coalesce((p_cashea->>'initial_amount')::numeric, 0),
      v_cashea_financed,
      case when v_cashea_financed = 0 then 0
           else coalesce((p_cashea->>'commission_pct')::numeric, 0) end,
      case when v_cashea_financed = 0 then 'cobrada' else 'pendiente' end,
      v_cashea_channel,
      case when v_cashea_financed = 0 then pg_catalog.now() end,
      case when v_cashea_financed = 0 then 0 end,
      case when v_cashea_financed = 0 then 0 end,
      case when v_cashea_financed = 0 then 0 end
    );
  end if;

  if p_customer_id is not null then
    insert into wm.customer_events (customer_id, type, title, detail, amount)
    values (
      p_customer_id, 'compra',
      'Compra ' || v_sale.invoice_number,
      coalesce(v_method, '—') || ' · ' || pg_catalog.jsonb_array_length(p_items) || ' artículo(s)',
      v_total
    );
  end if;

  insert into wm.audit_log (user_id, who, action, module, severity)
  select v_profile, full_name, 'Registró la venta ' || v_sale.invoice_number, 'Ventas', 'edit'
  from wm.profiles where id = v_profile;

  return v_sale;
end$function$;

revoke all on function wm.create_sale(uuid, uuid, jsonb, numeric, numeric, jsonb, text, jsonb, uuid, text, uuid)
  from public;
grant execute on function wm.create_sale(uuid, uuid, jsonb, numeric, numeric, jsonb, text, jsonb, uuid, text, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
