-- Sales commissions: employee codes, seller attribution and editable monthly reporting.
-- Apply on an existing WM ERP database, then deploy the matching app changes.

alter table wm.profiles
  alter column email drop not null;

alter table wm.profiles
  add column if not exists employee_code text,
  add column if not exists system_access boolean not null default true,
  add column if not exists commission_pct numeric(5,2) default 2;

update wm.profiles
   set commission_pct = 2
 where commission_pct is null;

alter table wm.profiles
  alter column commission_pct set default 2,
  alter column commission_pct set not null;

alter table wm.profiles
  drop constraint if exists profiles_commission_pct_chk,
  add constraint profiles_commission_pct_chk
    check (commission_pct >= 0 and commission_pct <= 100);

update wm.profiles
   set employee_code = null
 where employee_code is not null
   and btrim(employee_code) = '';

alter table wm.profiles
  drop constraint if exists profiles_employee_code_not_blank,
  add constraint profiles_employee_code_not_blank
    check (employee_code is null or btrim(employee_code) <> '');

alter table wm.profiles
  drop constraint if exists profiles_employee_code_format_chk,
  add constraint profiles_employee_code_format_chk
    check (employee_code is null or employee_code ~ '^[0-9]{4}$') not valid;

alter table wm.profiles
  drop constraint if exists profiles_system_access_email_chk,
  add constraint profiles_system_access_email_chk
    check (system_access = false or email is not null);

create unique index if not exists profiles_employee_code_key
  on wm.profiles (lower(employee_code))
  where employee_code is not null;

alter table wm.sales
  add column if not exists seller_id uuid references wm.profiles(id) on delete set null,
  add column if not exists seller_commission_pct numeric(5,2) default 2;

alter table wm.sales
  drop constraint if exists sales_seller_commission_pct_chk,
  add constraint sales_seller_commission_pct_chk
    check (seller_commission_pct >= 0 and seller_commission_pct <= 100);

update wm.sales s
   set seller_commission_pct = p.commission_pct
  from wm.profiles p
 where s.seller_id = p.id
   and s.seller_id is not null;

update wm.sales
   set seller_commission_pct = 2
 where seller_commission_pct is null;

alter table wm.sales
  alter column seller_commission_pct set default 2,
  alter column seller_commission_pct set not null;

create index if not exists sales_seller_id_idx on wm.sales(seller_id);

create or replace function wm.my_profile_id()
returns uuid language sql stable security definer set search_path = wm, public as $$
  select id from wm.profiles
   where user_id = auth.uid() and status = 'Activo' and system_access = true
   limit 1;
$$;

create or replace function wm.is_member()
returns boolean language sql stable security definer set search_path = wm, public as $$
  select exists(
    select 1 from wm.profiles
     where user_id = auth.uid() and status = 'Activo' and system_access = true
  );
$$;

create or replace function wm.my_role()
returns text language sql stable security definer set search_path = wm, public as $$
  select role from wm.profiles
   where user_id = auth.uid() and status = 'Activo' and system_access = true
   limit 1;
$$;

create or replace function wm.has_module(p_module text, p_min int default 1)
returns boolean language sql stable security definer set search_path = wm, public as $$
  select exists(
    select 1
    from wm.profiles pr
    join wm.role_permissions rp on rp.role = pr.role
    where pr.user_id = auth.uid()
      and pr.status = 'Activo'
      and pr.system_access = true
      and rp.module = p_module
      and rp.level >= p_min
  );
$$;

create or replace function wm.claim_profile()
returns wm.profiles
language plpgsql
security definer
set search_path = wm, public
as $$
declare prof wm.profiles;
begin
  select * into prof
    from wm.profiles
   where user_id = auth.uid()
     and status = 'Activo'
     and system_access = true;
  if found then
    update wm.profiles set last_sign_in_at = now() where id = prof.id returning * into prof;
    return prof;
  end if;

  update wm.profiles
     set user_id = auth.uid(), last_sign_in_at = now()
   where lower(email) = lower(auth.email())
     and user_id is null
     and status = 'Activo'
     and system_access = true
   returning * into prof;

  return prof;
end$$;

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
  p_seller_code text default null
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
  v_seller uuid;
  v_seller_commission_pct numeric := 2;
  v_npay int := coalesce(jsonb_array_length(p_payments), 0);
  v_request_id uuid := nullif(p_items->0->>'request_id', '')::uuid;
  it jsonb;
  pay jsonb;
begin
  if v_profile is null or not wm.has_module('Ventas', 2) then
    raise exception 'No autorizado para registrar ventas';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El ticket no tiene productos';
  end if;
  if v_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_profile::text || ':' || v_request_id::text, 0));
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
    request_id, customer_id, branch_id, user_id, seller_id, seller_commission_pct, payment_method,
    subtotal, discount, discount_pct, tax, total,
    exchange_rate, total_ves, status
  ) values (
    v_request_id, p_customer_id, p_branch_id, v_profile, v_seller, coalesce(v_seller_commission_pct, 2), v_method,
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
