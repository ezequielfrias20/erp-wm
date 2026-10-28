-- Cierres diarios por sucursal. Los importes son una foto: ventas posteriores no
-- modifican el cierre guardado. Las fechas de negocio usan America/Caracas.
create table if not exists wm.daily_closures (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references wm.branches(id) on delete restrict,
  business_date date not null,
  snapshot jsonb not null,
  notes text,
  created_by uuid references wm.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint daily_closures_branch_date_key unique (branch_id, business_date),
  constraint daily_closures_snapshot_object_chk check (jsonb_typeof(snapshot) = 'object')
);

create index if not exists daily_closures_branch_date_idx
  on wm.daily_closures(branch_id, business_date desc);
alter table wm.daily_closures enable row level security;
drop policy if exists daily_closures_select on wm.daily_closures;
create policy daily_closures_select on wm.daily_closures for select to authenticated
  using (
    wm.is_member() and (
      wm.my_role() = 'Super Admin'
      or branch_id = (select branch_id from wm.profiles where id = wm.my_profile_id())
    )
  );
revoke all on wm.daily_closures from anon, authenticated;
grant select on wm.daily_closures to authenticated;

-- Mismos renglones para la vista previa y el guardado. El método financiado
-- Cashea se excluye; la inicial ya figura bajo el método con que se cobró.
-- Un depósito conciliado se cuenta el día de settled_at, por separado.
create or replace function wm.daily_closure_preview(p_branch_id uuid, p_date date)
returns jsonb
language plpgsql stable security definer set search_path = wm, public
as $function$
declare
  v_profile wm.profiles;
  v_rows jsonb;
  v_sales_count bigint;
  v_captured_at timestamptz := now();
begin
  select * into v_profile from wm.profiles where id = wm.my_profile_id();
  if v_profile.id is null or not wm.has_module('Ventas', 1) then
    raise exception 'No autorizado para consultar cierres';
  end if;
  if v_profile.role <> 'Super Admin' and v_profile.branch_id is distinct from p_branch_id then
    raise exception 'No puedes consultar otra sucursal';
  end if;
  if p_date is null or p_date > (v_captured_at at time zone 'America/Caracas')::date then
    raise exception 'Fecha de cierre inválida';
  end if;
  if not exists (select 1 from wm.branches where id = p_branch_id) then
    raise exception 'Sucursal inválida';
  end if;

  select count(*) into v_sales_count from wm.sales s
   where s.branch_id = p_branch_id and s.status = 'Pagada'
     and (s.created_at at time zone 'America/Caracas')::date = p_date
     and s.created_at <= v_captured_at;

  with sales_of_day as (
    select s.* from wm.sales s
     where s.branch_id = p_branch_id and s.status = 'Pagada'
       and (s.created_at at time zone 'America/Caracas')::date = p_date
       and s.created_at <= v_captured_at
  ), payment_lines as (
    select 'sale'::text as source, sp.method, sp.currency,
           sp.amount::numeric as amount, sp.amount_usd::numeric as amount_usd
      from sales_of_day s join wm.sale_payments sp on sp.sale_id = s.id
      left join wm.payment_methods pm on pm.name = sp.method
     where not coalesce(pm.is_financed, false) and sp.method <> 'Cashea'
    union all
    select 'legacy',
           'Histórico · ' || coalesce(s.payment_method, 'Sin método'),
           coalesce(pm.currency, 'USD'),
           case when pm.currency = 'VES' then coalesce(s.total_ves, round(s.total * coalesce(s.exchange_rate, 0), 2))
                else s.total end,
           s.total
      from sales_of_day s
      left join wm.payment_methods pm on pm.name = s.payment_method
     where not exists (select 1 from wm.sale_payments sp where sp.sale_id = s.id)
       and not coalesce(pm.is_financed, false) and s.payment_method is distinct from 'Cashea'
    union all
    select 'cashea_settlement', 'Depósito Cashea', 'USD',
           coalesce(c.settled_amount, 0), coalesce(c.settled_amount, 0)
      from wm.cashea_orders c
     where c.branch_id = p_branch_id and c.status = 'cobrada'
       and (c.settled_at at time zone 'America/Caracas')::date = p_date
       and c.settled_at <= v_captured_at
  ), keys as (
    select 'sale'::text as source, pm.name as method, pm.currency
      from wm.payment_methods pm
     where pm.enabled and not pm.is_financed and pm.name <> 'Mixto'
    union
    select source, method, currency from payment_lines
    union
    select 'cashea_settlement', 'Depósito Cashea', 'USD'
  ), totals as (
    select k.source, k.method, k.currency,
           round(coalesce(sum(p.amount), 0), 2) as expected,
           round(coalesce(sum(p.amount_usd), 0), 2) as expected_usd
      from keys k left join payment_lines p
        on p.source = k.source and p.method = k.method and p.currency = k.currency
     group by k.source, k.method, k.currency
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'source', source, 'method', method, 'currency', currency,
    'expected', expected, 'expected_usd', expected_usd
  ) order by source, method, currency), '[]'::jsonb)
    into v_rows from totals;

  return jsonb_build_object(
    'branch_id', p_branch_id,
    'branch_name', (select name from wm.branches where id = p_branch_id),
    'business_date', p_date,
    'captured_at', v_captured_at, 'sales_count', v_sales_count,
    'rows', v_rows
  );
end
$function$;

create or replace function wm.close_daily(p_branch_id uuid, p_date date, p_counted jsonb, p_notes text default null)
returns wm.daily_closures
language plpgsql security definer set search_path = wm, public
as $function$
declare
  v_preview jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_row jsonb;
  v_counted_row jsonb;
  v_amount numeric;
  v_closure wm.daily_closures;
begin
  if not wm.has_module('Ventas', 2) then
    raise exception 'No autorizado para guardar cierres';
  end if;
  if p_counted is null or jsonb_typeof(p_counted) <> 'array' then
    raise exception 'Debes confirmar los montos de cada método';
  end if;

  if p_branch_id is null or p_date is null then
    raise exception 'Sucursal y fecha son obligatorias';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_branch_id::text || ':' || p_date::text, 0));
  if exists (select 1 from wm.daily_closures where branch_id = p_branch_id and business_date = p_date) then
    raise exception 'Esta sucursal ya tiene un cierre guardado para la fecha';
  end if;
  v_preview := wm.daily_closure_preview(p_branch_id, p_date);
  if jsonb_array_length(p_counted) <> jsonb_array_length(v_preview->'rows') then
    raise exception 'Los métodos de pago cambiaron. Actualiza la vista previa';
  end if;

  for v_row in select value from jsonb_array_elements(v_preview->'rows') loop
    select value into v_counted_row from jsonb_array_elements(p_counted)
     where value->>'source' = v_row->>'source'
       and value->>'method' = v_row->>'method'
       and value->>'currency' = v_row->>'currency';
    if v_counted_row is null or jsonb_typeof(v_counted_row->'amount') <> 'number' then
      raise exception 'Falta un monto confirmado. Actualiza la vista previa';
    end if;
    v_amount := (v_counted_row->>'amount')::numeric;
    if v_amount < 0 or v_amount <> round(v_amount, 2) then
      raise exception 'Los montos confirmados deben ser positivos y tener máximo dos decimales';
    end if;
    v_rows := v_rows || jsonb_build_array(v_row || jsonb_build_object(
      'counted', v_amount,
      'difference', v_amount - (v_row->>'expected')::numeric
    ));
  end loop;

  insert into wm.daily_closures (branch_id, business_date, snapshot, notes, created_by)
  values (p_branch_id, p_date, v_preview || jsonb_build_object(
            'rows', v_rows,
            'closed_by_name', (select full_name from wm.profiles where id = wm.my_profile_id()),
            'company', (select jsonb_build_object(
              'name', company_name, 'rif', rif, 'address', fiscal_address,
              'phone', phone, 'logoUrl', logo_url
            ) from wm.settings where id = 1)
          ),
          nullif(left(btrim(p_notes), 1000), ''), wm.my_profile_id())
  returning * into v_closure;

  insert into wm.audit_log (user_id, who, action, module, severity)
  select v_closure.created_by, p.full_name,
         'Guardó cierre diario ' || p_date::text || ' para sucursal ' || b.name,
         'Ventas', 'edit'
    from wm.profiles p, wm.branches b
   where p.id = v_closure.created_by and b.id = p_branch_id;
  return v_closure;
end
$function$;

revoke all on function wm.daily_closure_preview(uuid, date) from public, anon;
revoke all on function wm.close_daily(uuid, date, jsonb, text) from public, anon;
grant execute on function wm.daily_closure_preview(uuid, date) to authenticated;
grant execute on function wm.close_daily(uuid, date, jsonb, text) to authenticated;
notify pgrst, 'reload schema';
