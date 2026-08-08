-- create_sale: product variant prices are final prices with IVA included.
-- The sale subtotal stores the final-price subtotal before discount.
-- IVA is extracted from the final total instead of added on top.

create or replace function wm.create_sale(
  p_branch_id uuid,
  p_customer_id uuid,
  p_payments jsonb,
  p_discount_pct numeric,
  p_rate numeric,
  p_items jsonb,
  p_status text default 'Pagada'::text,
  p_cashea jsonb default null
)
returns wm.sales
language plpgsql
security definer
set search_path to 'wm', 'public'
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
  v_npay int := coalesce(jsonb_array_length(p_payments), 0);
  it jsonb;
  pay jsonb;
begin
  if v_profile is null or not wm.has_module('Ventas', 2) then
    raise exception 'No autorizado para registrar ventas';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El ticket no tiene productos';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_subtotal := v_subtotal + (it->>'quantity')::numeric * (it->>'unit_price')::numeric;
  end loop;

  v_discount := round(v_subtotal * coalesce(p_discount_pct, 0) / 100.0, 2);
  v_total    := round(v_subtotal - v_discount, 2);
  v_taxbase  := round(v_total / 1.16, 2);
  v_tax      := round(v_total - v_taxbase, 2);

  if v_npay > 1 then
    v_method := 'Mixto';
  elsif v_npay = 1 then
    v_method := p_payments->0->>'method';
  else
    v_method := null;
  end if;

  insert into wm.sales (
    customer_id, branch_id, user_id, payment_method,
    subtotal, discount, discount_pct, tax, total,
    exchange_rate, total_ves, status
  ) values (
    p_customer_id, p_branch_id, v_profile, v_method,
    round(v_subtotal, 2), v_discount, coalesce(p_discount_pct, 0), v_tax, v_total,
    p_rate, round(v_total * coalesce(p_rate, 0), 2), coalesce(p_status, 'Pagada')
  )
  returning * into v_sale;

  for it in select * from jsonb_array_elements(p_items) loop
    insert into wm.sale_items (sale_id, variant_id, description, quantity, unit_price, cost, line_total)
    values (
      v_sale.id,
      (it->>'variant_id')::uuid,
      it->>'description',
      (it->>'quantity')::int,
      (it->>'unit_price')::numeric,
      coalesce((it->>'cost')::numeric, 0),
      round((it->>'quantity')::numeric * (it->>'unit_price')::numeric, 2)
    );

    if coalesce(p_status, 'Pagada') = 'Pagada' then
      update wm.inventory
         set quantity = greatest(0, quantity - (it->>'quantity')::int)
       where variant_id = (it->>'variant_id')::uuid
         and branch_id = p_branch_id;
    end if;
  end loop;

  if v_npay > 0 then
    for pay in select * from jsonb_array_elements(p_payments) loop
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
    insert into wm.cashea_orders (
      sale_id, branch_id, reference, total,
      initial_amount, financed_amount, commission_pct, status, channel
    ) values (
      v_sale.id, p_branch_id,
      coalesce(p_cashea->>'reference', ''),
      v_total,
      coalesce((p_cashea->>'initial_amount')::numeric, 0),
      coalesce((p_cashea->>'financed_amount')::numeric, v_total),
      coalesce((p_cashea->>'commission_pct')::numeric, 0),
      'pendiente',
      case when coalesce(p_cashea->>'channel','tienda') = 'online' then 'online' else 'tienda' end
    );
  end if;

  if p_customer_id is not null then
    insert into wm.customer_events (customer_id, type, title, detail, amount)
    values (
      p_customer_id, 'compra',
      'Compra ' || v_sale.invoice_number,
      coalesce(v_method, '—') || ' · ' || jsonb_array_length(p_items) || ' artículo(s)',
      v_total
    );
  end if;

  insert into wm.audit_log (user_id, who, action, module, severity)
  select v_profile, full_name, 'Registró la venta ' || v_sale.invoice_number, 'Ventas', 'edit'
  from wm.profiles where id = v_profile;

  return v_sale;
end$function$;

notify pgrst, 'reload schema';
