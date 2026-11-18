-- Pedidos online, apartados derivados de líneas vigentes y configuración.
-- Aditivo e idempotente; se incorpora al bootstrap en una tarea posterior.

create sequence if not exists wm.online_order_seq start with 1;
revoke all on sequence wm.online_order_seq from public, anon, authenticated;
grant usage on sequence wm.online_order_seq to service_role;

create or replace function wm.next_online_order()
returns text
language sql volatile security definer
set search_path = ''
as $$
  select 'W-' || pg_catalog.lpad(
    pg_catalog.nextval('wm.online_order_seq'::pg_catalog.regclass)::pg_catalog.text, 6, '0'
  );
$$;
revoke all on function wm.next_online_order() from public, anon, authenticated;
grant execute on function wm.next_online_order() to service_role;

create table if not exists wm.online_settings (
  id int primary key default 1 check (id = 1),
  soft_hold_minutes int not null default 30 check (soft_hold_minutes > 0),
  firm_hold_hours int not null default 24 check (firm_hold_hours > 0),
  max_units_per_line int not null default 10 check (max_units_per_line > 0),
  max_units_per_order int not null default 30 check (max_units_per_order > 0),
  max_lines int not null default 20 check (max_lines > 0),
  max_open_per_phone int not null default 2 check (max_open_per_phone > 0),
  display_stock_cap int not null default 10 check (display_stock_cap > 0),
  store_whatsapp text,
  whatsapp_templates jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table wm.branches add column if not exists online_enabled boolean not null default false;

create table if not exists wm.online_orders (
  id uuid primary key default gen_random_uuid(),
  number text unique not null default wm.next_online_order(),
  request_id uuid unique not null,
  status text not null default 'solicitada'
    check (status in ('solicitada', 'aceptada', 'completada', 'rechazada', 'cancelada')),
  customer_name text not null,
  customer_phone text not null check (customer_phone ~ '^\+[1-9][0-9]{7,14}$'),
  customer_email text,
  customer_document text,
  notes text,
  soft_expires_at timestamptz not null,
  firm_expires_at timestamptz,
  accepted_by uuid references wm.profiles(id) on delete set null,
  accepted_at timestamptz,
  closed_by uuid references wm.profiles(id) on delete set null,
  closed_at timestamptz,
  close_reason text,
  customer_id uuid references wm.customers(id) on delete set null,
  source_ip inet,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'wm.online_orders'::pg_catalog.regclass
      and conname = 'online_orders_accepted_has_firm_expiry'
  ) then
    alter table wm.online_orders
      add constraint online_orders_accepted_has_firm_expiry
      check (status <> 'aceptada' or firm_expires_at is not null);
  end if;
end $$;

create index if not exists online_orders_status_created_idx
  on wm.online_orders (status, created_at desc);
create index if not exists online_orders_customer_phone_idx
  on wm.online_orders (customer_phone);

create table if not exists wm.online_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references wm.online_orders(id) on delete cascade,
  variant_id uuid not null references wm.product_variants(id) on delete restrict,
  branch_id uuid not null references wm.branches(id) on delete restrict,
  quantity int not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  product_name text not null,
  variant_label text not null,
  sku text not null,
  sale_id uuid references wm.sales(id) on delete set null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, variant_id, branch_id)
);

create index if not exists online_order_items_active_idx
  on wm.online_order_items (variant_id, branch_id)
  where sale_id is null and released_at is null;

alter table wm.sales add column if not exists online_order_id uuid
  references wm.online_orders(id) on delete set null;
create index if not exists sales_online_order_id_idx
  on wm.sales (online_order_id) where online_order_id is not null;

drop trigger if exists online_settings_set_updated_at on wm.online_settings;
create trigger online_settings_set_updated_at
  before update on wm.online_settings
  for each row execute function wm.set_updated_at();

drop trigger if exists online_orders_set_updated_at on wm.online_orders;
create trigger online_orders_set_updated_at
  before update on wm.online_orders
  for each row execute function wm.set_updated_at();

-- Una fila por línea vigente; el reloj libera apartados sin tareas programadas.
create or replace view wm.online_holds
with (security_invoker = true)
as
select i.variant_id, i.branch_id, i.order_id, i.quantity as held
from wm.online_order_items i
join wm.online_orders o on o.id = i.order_id
where i.sale_id is null
  and i.released_at is null
  and (
    (o.status = 'solicitada' and o.soft_expires_at > now())
    or (o.status = 'aceptada' and o.firm_expires_at > now())
  );

create or replace function wm.online_held(
  p_variant uuid, p_branch uuid, p_exclude_order uuid default null
)
returns int
language sql stable security definer
set search_path = ''
as $$
  select case
    -- SECURITY DEFINER cambia current_user al dueño; role conserva el rol de PostgREST.
    when (current_user = 'authenticated' or pg_catalog.current_setting('role', true) = 'authenticated')
      and not wm.is_member() then 0
    else coalesce(pg_catalog.sum(h.held), 0)::pg_catalog.int4
  end
  from wm.online_holds h
  where h.variant_id = p_variant
    and h.branch_id = p_branch
    and (p_exclude_order is null or h.order_id <> p_exclude_order);
$$;
revoke all on function wm.online_held(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function wm.online_held(uuid, uuid, uuid) to authenticated;

create or replace view wm.v_online_orders
with (security_invoker = true)
as
select
  o.id,
  o.number,
  o.request_id,
  o.status,
  o.customer_name,
  o.customer_phone,
  o.customer_email,
  o.customer_document,
  o.notes,
  o.soft_expires_at,
  o.firm_expires_at,
  o.accepted_by,
  o.accepted_at,
  o.closed_by,
  o.closed_at,
  o.close_reason,
  o.customer_id,
  o.source_ip,
  o.created_at,
  o.updated_at,
  case
    when o.status = 'solicitada' and o.soft_expires_at <= now() then 'vencida'
    when o.status = 'aceptada' and o.firm_expires_at <= now() then 'vencida'
    else o.status
  end as effective_status,
  case
    when o.status = 'solicitada' then o.soft_expires_at
    when o.status = 'aceptada' then o.firm_expires_at
    else null::timestamptz
  end as expires_at,
  coalesce(items.total, 0::numeric) as total,
  items.branch_count
from wm.online_orders o
cross join lateral (
  select
    pg_catalog.sum(i.quantity * i.unit_price) as total,
    pg_catalog.count(distinct i.branch_id)::int as branch_count
  from wm.online_order_items i
  where i.order_id = o.id
) items;

alter table wm.online_settings enable row level security;
alter table wm.online_orders enable row level security;
alter table wm.online_order_items enable row level security;

drop policy if exists online_settings_sel on wm.online_settings;
drop policy if exists online_settings_upd on wm.online_settings;
drop policy if exists online_orders_sel on wm.online_orders;
drop policy if exists online_order_items_sel on wm.online_order_items;

create policy online_settings_sel on wm.online_settings
  for select to authenticated using (wm.is_member());
create policy online_settings_upd on wm.online_settings
  for update to authenticated
  using (wm.has_module('Configuración', 2))
  with check (wm.has_module('Configuración', 2));
create policy online_orders_sel on wm.online_orders
  for select to authenticated using (wm.is_member());
create policy online_order_items_sel on wm.online_order_items
  for select to authenticated using (wm.is_member());

-- El bootstrap concede ALL por defecto a authenticated: reducirlo explícitamente.
revoke all on wm.online_settings, wm.online_orders, wm.online_order_items
  from public, anon, authenticated;
grant select, update on wm.online_settings to authenticated;
grant select on wm.online_orders, wm.online_order_items to authenticated;
revoke all on wm.online_holds, wm.v_online_orders from public, anon, authenticated;
grant select on wm.online_holds, wm.v_online_orders to authenticated;

insert into wm.online_settings (id) values (1) on conflict (id) do nothing;
