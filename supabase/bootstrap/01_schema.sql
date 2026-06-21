-- =============================================================================
--  ERP — esquema `wm` (ESTRUCTURA, estado final). Idempotente sobre BD vacía.
--  Genera tablas, funciones, RLS, vistas, RPC y bucket de storage IGUAL que la
--  instancia de referencia, pero SIN datos. La data mínima va en 02_seed.sql.
--
--  Consolidado a estado final desde las migraciones MCP del proyecto de referencia
--  (se excluyen los seeds demo; las migraciones incrementales —create_sale v1..v4,
--   columnas de payment_methods/cashea_orders— se pliegan al estado final).
--  Re-extraer con:  docs/NUEVO-NEGOCIO.md  /  supabase/bootstrap/README.md
--
--  Correr con:  psql "$CONN" -v ON_ERROR_STOP=1 -f 01_schema.sql
-- =============================================================================

-- ===== 0. Esquema, exposición PostgREST, grants, utilitarios =================
create schema if not exists wm;

-- Exponer `wm` a PostgREST (aditivo: conserva public y graphql_public).
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, wm';
notify pgrst, 'reload config';

grant usage on schema wm to anon, authenticated, service_role;

alter default privileges in schema wm grant all on tables to authenticated, service_role;
alter default privileges in schema wm grant all on sequences to authenticated, service_role;
alter default privileges in schema wm grant execute on routines to authenticated, service_role;

-- Trigger genérico updated_at (search_path fijo).
create or replace function wm.set_updated_at()
returns trigger language plpgsql set search_path = wm, public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Numeración de facturas y órdenes de compra.
-- Un negocio nuevo arranca desde cero: FAC-000001 y OC-1.
-- (Para continuar otra numeración, ajustar el "start with" o setval; ver README.)
create sequence if not exists wm.invoice_seq start with 1;
create sequence if not exists wm.po_seq start with 1;

create or replace function wm.next_invoice()
returns text language sql volatile set search_path = wm, public as $$
  select 'FAC-' || lpad(nextval('wm.invoice_seq')::text, 6, '0');
$$;

create or replace function wm.next_po()
returns text language sql volatile set search_path = wm, public as $$
  select 'OC-' || nextval('wm.po_seq')::text;
$$;

-- ===== 1. Tablas ============================================================

-- Sucursales
create table wm.branches (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  city text not null,
  name text not null,
  address text,
  phone text,
  manager_id uuid,
  monthly_goal numeric(14,2) not null default 0,
  color text,
  map_x numeric(6,2),
  map_y numeric(6,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Catálogos base
create table wm.categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  slug text,
  color text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table wm.brands (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table wm.sizes (
  id uuid primary key default gen_random_uuid(),
  label text unique not null,
  sort_order int not null default 0
);

create table wm.colors (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  hex text,
  sort_order int not null default 0
);

create table wm.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Productos y variantes
create table wm.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category_id uuid references wm.categories(id) on delete set null,
  brand_id uuid references wm.brands(id) on delete set null,
  tax_rate numeric(5,2) not null default 16,
  is_active boolean not null default true,
  visible_in_catalog boolean not null default true,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table wm.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references wm.products(id) on delete cascade,
  sku text unique not null,
  color text,
  color_hex text,
  size text,
  barcode text,
  price numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Inventario por variante × sucursal
create table wm.inventory (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references wm.product_variants(id) on delete cascade,
  branch_id uuid not null references wm.branches(id) on delete cascade,
  quantity int not null default 0,
  reserved int not null default 0,
  min_stock int not null default 0,
  updated_at timestamptz not null default now(),
  unique (variant_id, branch_id)
);

-- Perfiles (personal del ERP). Enlaza a auth.users en el primer login (claim_profile).
create table wm.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  email text unique not null,
  phone text,
  role text not null default 'Vendedor'
    check (role in ('Super Admin','Administrador','Gerente','Vendedor','Inventario','Cajero')),
  branch_id uuid references wm.branches(id) on delete set null,
  status text not null default 'Activo' check (status in ('Activo','Inactivo')),
  avatar_url text,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FK circular: responsable de sucursal -> perfil
alter table wm.branches
  add constraint branches_manager_fk
  foreign key (manager_id) references wm.profiles(id) on delete set null;

-- Clientes
create table wm.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  document text,
  segment text not null default 'Nuevo'
    check (segment in ('VIP','Frecuente','Nuevo','Inactivo')),
  city text,
  branch_id uuid references wm.branches(id) on delete set null,
  since date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table wm.customer_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references wm.customers(id) on delete cascade,
  type text not null check (type in ('compra','pago','nota','registro')),
  title text not null,
  detail text,
  amount numeric(12,2),
  occurred_at timestamptz not null default now()
);

-- Ventas
create table wm.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique not null default wm.next_invoice(),
  customer_id uuid references wm.customers(id) on delete set null,
  branch_id uuid not null references wm.branches(id) on delete restrict,
  user_id uuid references wm.profiles(id) on delete set null,
  payment_method text,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  discount_pct numeric(5,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  exchange_rate numeric(12,4),
  total_ves numeric(16,2),
  status text not null default 'Pagada'
    check (status in ('Pagada','Pendiente','Reembolso','Anulada')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table wm.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references wm.sales(id) on delete cascade,
  variant_id uuid references wm.product_variants(id) on delete set null,
  description text,
  quantity int not null default 1,
  unit_price numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0
);

-- Pagos por venta (uno o varios). Lo escribe el RPC create_sale.
create table wm.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references wm.sales(id) on delete cascade,
  method text not null,
  currency text not null default 'VES',
  amount numeric not null default 0,      -- monto en la moneda nativa del método
  amount_usd numeric not null default 0,  -- normalizado a USD para agregaciones
  reference text,
  created_at timestamptz not null default now(),
  constraint sale_payments_currency_chk check (currency in ('USD','VES'))
);

-- Cuentas por cobrar a Cashea (1:1 con la venta). Todo en USD.
create table wm.cashea_orders (
  id                uuid primary key default gen_random_uuid(),
  sale_id           uuid not null unique references wm.sales(id) on delete cascade,
  branch_id         uuid not null references wm.branches(id),
  reference         text not null,                 -- nro de orden Cashea
  total             numeric not null,              -- snapshot del total USD
  initial_amount    numeric not null default 0,    -- inicial cobrado, USD
  financed_amount   numeric not null,              -- por cobrar, USD
  commission_pct    numeric not null default 0,    -- % retenido por Cashea
  commission_amount numeric,                       -- al conciliar
  net_amount        numeric,                       -- neto recibido (al conciliar)
  status            text not null default 'pendiente'
                    check (status in ('pendiente','cobrada','anulada')),
  channel           text not null default 'tienda'
                    check (channel in ('tienda','online')),
  settled_at        timestamptz,
  settled_amount    numeric,                       -- lo que Cashea depositó (USD)
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Órdenes de compra
create table wm.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default wm.next_po(),
  supplier_id uuid references wm.suppliers(id) on delete set null,
  branch_id uuid references wm.branches(id) on delete set null,
  status text not null default 'Pendiente'
    check (status in ('Pendiente','Confirmado','En tránsito','Recibido')),
  expected_date date,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table wm.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references wm.purchase_orders(id) on delete cascade,
  variant_id uuid references wm.product_variants(id) on delete set null,
  quantity int not null default 1,
  cost numeric(12,2) not null default 0
);

-- Roles y permisos
create table wm.roles (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  sort_order int not null default 0
);

create table wm.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  module text not null,
  level int not null default 0 check (level in (0,1,2)),
  unique (role, module)
);

-- Configuración del sistema
-- payment_methods: estado final (currency/requires_reference/is_financed plegados).
create table wm.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  enabled boolean not null default true,
  sort_order int not null default 0,
  currency text not null default 'VES' check (currency in ('USD','VES')),
  requires_reference boolean not null default false,
  is_financed boolean not null default false
);

create table wm.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'BCV',
  rate numeric(12,4) not null,
  fetched_at timestamptz not null default now(),
  effective_date date not null default current_date
);

create table wm.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references wm.profiles(id) on delete set null,
  who text,
  action text not null,
  module text,
  ip text,
  severity text not null default 'ok' check (severity in ('ok','edit','sys','warn')),
  created_at timestamptz not null default now()
);

create table wm.settings (
  id int primary key default 1 check (id = 1),
  company_name text,
  rif text,
  fiscal_address text,
  phone text,
  taxpayer_type text,
  iva_retention boolean not null default false,
  iva_general numeric(5,2) not null default 16,
  currency text not null default 'USD',
  auto_update_rate boolean not null default true,
  logo_url text,
  favicon_url text,
  primary_color text default '#0EA5E9',
  accent_color text default '#0EA5E9',
  notifications jsonb not null default '{"low_stock":true,"daily_sales_email":true,"realtime_sales":true,"security_events":true}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ===== 2. Índices ===========================================================
create index on wm.product_variants(product_id);
create index on wm.inventory(branch_id);
create index on wm.inventory(variant_id);
create index on wm.customers(branch_id);
create index on wm.customer_events(customer_id);
create index on wm.sales(branch_id);
create index on wm.sales(customer_id);
create index on wm.sales(created_at);
create index on wm.sale_items(sale_id);
create index on wm.sale_items(variant_id);
create index on wm.purchase_orders(supplier_id);
create index on wm.purchase_orders(branch_id);
create index on wm.purchase_order_items(po_id);
create index on wm.audit_log(created_at);
create index on wm.profiles(branch_id);
create index sale_payments_sale_id_idx on wm.sale_payments(sale_id);
create index sale_payments_method_idx  on wm.sale_payments(method);
create index cashea_orders_status_idx  on wm.cashea_orders(status);
create index cashea_orders_branch_idx  on wm.cashea_orders(branch_id);
create index cashea_orders_created_idx on wm.cashea_orders(created_at);
create index cashea_orders_channel_idx on wm.cashea_orders(channel);

-- ===== 3. Triggers updated_at ===============================================
do $$
declare t text;
begin
  foreach t in array array[
    'branches','categories','brands','suppliers','products','product_variants',
    'profiles','customers','sales','purchase_orders','settings'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on wm.%I for each row execute function wm.set_updated_at();',
      t, t);
  end loop;
end$$;

create trigger set_updated_at before update on wm.cashea_orders
  for each row execute function wm.set_updated_at();

-- ===== 4. Helpers de autorización (SECURITY DEFINER, evitan recursión RLS) ===
create or replace function wm.my_profile_id()
returns uuid language sql stable security definer set search_path = wm, public as $$
  select id from wm.profiles where user_id = auth.uid() and status = 'Activo' limit 1;
$$;

create or replace function wm.is_member()
returns boolean language sql stable security definer set search_path = wm, public as $$
  select exists(select 1 from wm.profiles where user_id = auth.uid() and status = 'Activo');
$$;

create or replace function wm.my_role()
returns text language sql stable security definer set search_path = wm, public as $$
  select role from wm.profiles where user_id = auth.uid() and status = 'Activo' limit 1;
$$;

create or replace function wm.has_module(p_module text, p_min int default 1)
returns boolean language sql stable security definer set search_path = wm, public as $$
  select exists(
    select 1
    from wm.profiles pr
    join wm.role_permissions rp on rp.role = pr.role
    where pr.user_id = auth.uid()
      and pr.status = 'Activo'
      and rp.module = p_module
      and rp.level >= p_min
  );
$$;

grant execute on function wm.my_profile_id() to authenticated, anon;
grant execute on function wm.is_member() to authenticated, anon;
grant execute on function wm.my_role() to authenticated, anon;
grant execute on function wm.has_module(text, int) to authenticated, anon;

-- ===== 5. RLS: habilitar en todas las tablas de wm ==========================
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'wm' loop
    execute format('alter table wm.%I enable row level security;', t);
  end loop;
end$$;

-- Políticas estándar por módulo (lectura: cualquier miembro; escritura: nivel 2).
do $$
declare
  tbl text;
  modu text;
  map jsonb := '{
    "branches":"Sucursales",
    "categories":"Inventario",
    "brands":"Inventario",
    "sizes":"Inventario",
    "colors":"Inventario",
    "suppliers":"Inventario",
    "products":"Productos",
    "product_variants":"Productos",
    "inventory":"Inventario",
    "customers":"Clientes",
    "customer_events":"Clientes",
    "sales":"Ventas",
    "sale_items":"Ventas",
    "purchase_orders":"Inventario",
    "purchase_order_items":"Inventario",
    "roles":"Usuarios",
    "role_permissions":"Usuarios",
    "payment_methods":"Configuración",
    "settings":"Configuración"
  }';
begin
  for tbl, modu in select key, value from jsonb_each_text(map) loop
    execute format('create policy %I on wm.%I for select to authenticated using (wm.is_member());', tbl||'_sel', tbl);
    execute format('create policy %I on wm.%I for insert to authenticated with check (wm.has_module(%L,2));', tbl||'_ins', tbl, modu);
    execute format('create policy %I on wm.%I for update to authenticated using (wm.has_module(%L,2)) with check (wm.has_module(%L,2));', tbl||'_upd', tbl, modu, modu);
    execute format('create policy %I on wm.%I for delete to authenticated using (wm.has_module(%L,2));', tbl||'_del', tbl, modu);
  end loop;
end$$;

-- profiles (cada quien ve a todos; edita su propia fila o si tiene Usuarios:2)
create policy profiles_sel on wm.profiles for select to authenticated using (wm.is_member());
create policy profiles_ins on wm.profiles for insert to authenticated with check (wm.has_module('Usuarios',2));
create policy profiles_upd on wm.profiles for update to authenticated
  using (user_id = auth.uid() or wm.has_module('Usuarios',2))
  with check (user_id = auth.uid() or wm.has_module('Usuarios',2));
create policy profiles_del on wm.profiles for delete to authenticated using (wm.has_module('Usuarios',2));

-- exchange_rates (cualquier miembro registra tasa; Config:2 para borrar)
create policy rates_sel on wm.exchange_rates for select to authenticated using (wm.is_member());
create policy rates_ins on wm.exchange_rates for insert to authenticated with check (wm.is_member());
create policy rates_del on wm.exchange_rates for delete to authenticated using (wm.has_module('Configuración',2));

-- audit_log (cualquier miembro inserta; nadie edita/borra)
create policy audit_sel on wm.audit_log for select to authenticated using (wm.is_member());
create policy audit_ins on wm.audit_log for insert to authenticated with check (wm.is_member());

-- sale_payments (lectura: miembro; escritura: Ventas:2)
create policy sale_payments_select on wm.sale_payments for select using (wm.is_member());
create policy sale_payments_write  on wm.sale_payments for all
  using (wm.has_module('Ventas', 2)) with check (wm.has_module('Ventas', 2));
grant select, insert, update, delete on wm.sale_payments to authenticated;

-- cashea_orders (lectura: miembro; insert: Ventas:2; conciliar/update: Reportes:2)
create policy cashea_orders_select on wm.cashea_orders for select using (wm.is_member());
create policy cashea_orders_insert on wm.cashea_orders for insert with check (wm.has_module('Ventas', 2));
create policy cashea_orders_update on wm.cashea_orders for update
  using (wm.has_module('Reportes', 2)) with check (wm.has_module('Reportes', 2));

-- ===== 6. claim_profile (enlaza perfil invitado al auth user en primer login) =
create or replace function wm.claim_profile()
returns wm.profiles
language plpgsql
security definer
set search_path = wm, public
as $$
declare prof wm.profiles;
begin
  select * into prof from wm.profiles where user_id = auth.uid();
  if found then
    update wm.profiles set last_sign_in_at = now() where id = prof.id returning * into prof;
    return prof;
  end if;

  update wm.profiles
     set user_id = auth.uid(), last_sign_in_at = now()
   where lower(email) = lower(auth.email())
     and user_id is null
     and status = 'Activo'
   returning * into prof;

  return prof;
end$$;

grant execute on function wm.claim_profile() to authenticated;

-- ===== 7. Trigger: anular cuenta Cashea si la venta se reembolsa/anula =======
create or replace function wm.cashea_sync_void()
returns trigger
language plpgsql
security definer
set search_path to 'wm', 'public'
as $function$
begin
  if new.status in ('Reembolso', 'Anulada') and coalesce(old.status, '') is distinct from new.status then
    update wm.cashea_orders
       set status = 'anulada'
     where sale_id = new.id
       and status <> 'anulada';
  end if;
  return new;
end$function$;

drop trigger if exists cashea_void_on_sale_status on wm.sales;
create trigger cashea_void_on_sale_status
  after update of status on wm.sales
  for each row execute function wm.cashea_sync_void();

-- ===== 8. Vistas ============================================================
create or replace view wm.v_inventory
with (security_invoker = true) as
select
  i.id, i.variant_id, i.branch_id, i.quantity, i.reserved, i.min_stock,
  pv.sku, pv.color, pv.color_hex, pv.size, pv.price, pv.cost,
  p.id as product_id, p.name as product_name,
  c.name as category, c.color as category_color,
  br.name as brand, b.city as branch_city, b.code as branch_code,
  case
    when i.quantity = 0 then 'Agotado'
    when i.quantity < i.min_stock then 'Stock bajo'
    else 'En stock'
  end as estado,
  (i.quantity * pv.cost) as stock_value
from wm.inventory i
join wm.product_variants pv on pv.id = i.variant_id
join wm.products p on p.id = pv.product_id
left join wm.categories c on c.id = p.category_id
left join wm.brands br on br.id = p.brand_id
join wm.branches b on b.id = i.branch_id;
grant select on wm.v_inventory to authenticated;

create or replace view wm.v_branch_stats
with (security_invoker = true) as
select
  b.id, b.code, b.city, b.name, b.address, b.phone,
  b.monthly_goal, b.color, b.map_x, b.map_y, b.is_active, b.manager_id,
  p.full_name as manager_name,
  coalesce(inv.total_units, 0) as inventory_units,
  coalesce(s.month_sales, 0) as month_sales
from wm.branches b
left join wm.profiles p on p.id = b.manager_id
left join lateral (
  select sum(quantity) as total_units from wm.inventory where branch_id = b.id
) inv on true
left join lateral (
  select sum(total) as month_sales
  from wm.sales
  where branch_id = b.id
    and status not in ('Reembolso','Anulada')
    and date_trunc('month', created_at) = date_trunc('month', now())
) s on true;
grant select on wm.v_branch_stats to authenticated;

create or replace view wm.v_product_summary
with (security_invoker = true) as
select
  p.id, p.name, p.is_active, p.visible_in_catalog, p.tax_rate,
  p.category_id, p.brand_id,
  c.name as category, c.color as category_color, b.name as brand,
  count(distinct pv.id) as variant_count,
  coalesce(min(pv.price), 0) as min_price,
  coalesce(max(pv.price), 0) as max_price,
  coalesce(sum(i.quantity), 0) as total_stock
from wm.products p
left join wm.categories c on c.id = p.category_id
left join wm.brands b on b.id = p.brand_id
left join wm.product_variants pv on pv.product_id = p.id
left join wm.inventory i on i.variant_id = pv.id
group by p.id, c.name, c.color, b.name;
grant select on wm.v_product_summary to authenticated;

create or replace view wm.v_customer_stats
with (security_invoker = true) as
select
  c.id, c.name, c.email, c.phone, c.document, c.segment, c.city,
  c.branch_id, c.since, c.notes, c.created_at,
  b.city as branch_city,
  coalesce(s.spent, 0) as total_spent,
  coalesce(s.orders, 0) as orders_count,
  case when coalesce(s.orders,0) > 0 then round(s.spent / s.orders, 2) else 0 end as avg_ticket
from wm.customers c
left join wm.branches b on b.id = c.branch_id
left join lateral (
  select sum(total) as spent, count(*) as orders
  from wm.sales
  where customer_id = c.id and status not in ('Anulada','Reembolso')
) s on true;
grant select on wm.v_customer_stats to authenticated;

create or replace view wm.v_customer_favorites
with (security_invoker = true) as
select s.customer_id, p.name as product_name, sum(si.quantity)::int as qty
from wm.sale_items si
join wm.sales s on s.id = si.sale_id
join wm.product_variants pv on pv.id = si.variant_id
join wm.products p on p.id = pv.product_id
where s.customer_id is not null
group by s.customer_id, p.name;
grant select on wm.v_customer_favorites to authenticated;

create or replace view wm.v_sale_lines
with (security_invoker = true) as
select
  si.id, s.id as sale_id, s.branch_id, s.created_at, s.status, s.payment_method,
  si.quantity, si.line_total, si.cost,
  p.name as product_name, c.name as category, c.color as category_color
from wm.sale_items si
join wm.sales s on s.id = si.sale_id
left join wm.product_variants pv on pv.id = si.variant_id
left join wm.products p on p.id = pv.product_id
left join wm.categories c on c.id = p.category_id;
grant select on wm.v_sale_lines to authenticated;

-- ===== 9. RPC create_sale (v4: pagos mixtos + Cashea con canal) =============
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
  v_taxbase  := v_subtotal - v_discount;
  v_tax      := round(v_taxbase * 0.16, 2);
  v_total    := round(v_taxbase + v_tax, 2);

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

  -- cuenta por cobrar a Cashea (con canal tienda|online)
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

-- ===== 10. Storage: bucket público para activos (avatares, logo, favicon) ===
insert into storage.buckets (id, name, public)
values ('wm-public', 'wm-public', true)
on conflict (id) do nothing;

drop policy if exists "wm_public_read" on storage.objects;
drop policy if exists "wm_authenticated_insert" on storage.objects;
drop policy if exists "wm_authenticated_update" on storage.objects;
drop policy if exists "wm_authenticated_delete" on storage.objects;

create policy "wm_public_read" on storage.objects
  for select to public using (bucket_id = 'wm-public');
create policy "wm_authenticated_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'wm-public');
create policy "wm_authenticated_update" on storage.objects
  for update to authenticated using (bucket_id = 'wm-public') with check (bucket_id = 'wm-public');
create policy "wm_authenticated_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'wm-public');

notify pgrst, 'reload schema';
