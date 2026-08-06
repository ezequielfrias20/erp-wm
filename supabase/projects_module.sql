-- =============================================================================
--  WM ERP — módulo Proyectos (conferencias/eventos puntuales)
--  Idempotente para aplicar sobre una base existente.
--
--  Correr con:
--    psql "$CONN" -v ON_ERROR_STOP=1 -f supabase/projects_module.sql
-- =============================================================================

create table if not exists wm.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  event_date date,
  location text,
  logo_url text,
  ticket_title text,
  ticket_subtitle text,
  ticket_details text,
  ticket_instructions text,
  ticket_footer text,
  ticket_accent_color text default '#0ea5e9',
  organizer_name text,
  organizer_email text,
  organizer_phone text,
  status text not null default 'Abierto'
    check (status in ('Borrador','Abierto','Cerrado','Cancelado')),
  goal int,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_ticket_accent_color_chk
    check (
      ticket_accent_color is null
      or ticket_accent_color ~ '^#[0-9A-Fa-f]{6}$'
    )
);

alter table wm.projects
  add column if not exists logo_url text,
  add column if not exists ticket_title text,
  add column if not exists ticket_subtitle text,
  add column if not exists ticket_details text,
  add column if not exists ticket_instructions text,
  add column if not exists ticket_footer text,
  add column if not exists ticket_accent_color text default '#0ea5e9',
  add column if not exists organizer_name text,
  add column if not exists organizer_email text,
  add column if not exists organizer_phone text;

alter table wm.projects
  drop constraint if exists projects_ticket_accent_color_chk,
  add constraint projects_ticket_accent_color_chk
    check (
      ticket_accent_color is null
      or ticket_accent_color ~ '^#[0-9A-Fa-f]{6}$'
    );

create table if not exists wm.project_registrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references wm.projects(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  document text not null,
  email text not null,
  phone text not null,
  payment_method text not null
    check (payment_method in ('Pago móvil','Efectivo USD','Zelle/Zinli','Binance','Cashea')),
  currency text not null default 'USD' check (currency in ('USD','VES')),
  amount numeric(14,2),
  amount_usd numeric(12,2),
  exchange_rate numeric(12,4),
  paid_at date not null default current_date,
  payment_reference text,
  receipt_url text,
  status text not null default 'Por validar'
    check (status in ('Por validar','Confirmado','Cancelado')),
  ticket_hash text,
  ticket_payload text,
  ticket_qr_url text,
  ticket_status text not null default 'No emitido'
    check (ticket_status in ('No emitido','Disponible','Usado','Anulado')),
  ticket_issued_at timestamptz,
  ticket_email_sent_at timestamptz,
  ticket_email_id text,
  ticket_used_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_registrations_reference_chk
    check (payment_method = 'Efectivo USD' or nullif(payment_reference, '') is not null),
  constraint project_registrations_receipt_chk
    check (payment_method = 'Efectivo USD' or nullif(receipt_url, '') is not null)
);

alter table wm.project_registrations
  add column if not exists currency text not null default 'USD',
  add column if not exists amount numeric(14,2),
  add column if not exists exchange_rate numeric(12,4),
  add column if not exists paid_at date not null default current_date,
  add column if not exists ticket_hash text,
  add column if not exists ticket_payload text,
  add column if not exists ticket_qr_url text,
  add column if not exists ticket_status text not null default 'No emitido',
  add column if not exists ticket_issued_at timestamptz,
  add column if not exists ticket_email_sent_at timestamptz,
  add column if not exists ticket_email_id text,
  add column if not exists ticket_used_at timestamptz;

update wm.project_registrations
   set currency = case when payment_method = 'Pago móvil' then 'VES' else 'USD' end
 where currency is null
    or (payment_method = 'Pago móvil' and currency <> 'VES')
    or (payment_method <> 'Pago móvil' and currency <> 'USD');

update wm.project_registrations
   set amount = amount_usd
 where amount is null and amount_usd is not null and currency = 'USD';

-- Backfill defensivo para filas viejas de Pago móvil creadas antes de guardar moneda/tasa.
-- Si son datos reales, revisa estas filas y ajusta la tasa/monto al valor histórico correcto.
update wm.project_registrations
   set exchange_rate = coalesce(exchange_rate, 113),
       amount = coalesce(amount, round(amount_usd * coalesce(exchange_rate, 113), 2))
 where currency = 'VES'
   and amount_usd is not null
   and (exchange_rate is null or amount is null);

alter table wm.project_registrations
  drop constraint if exists project_registrations_currency_chk,
  add constraint project_registrations_currency_chk
    check (
      (payment_method = 'Pago móvil' and currency = 'VES') or
      (payment_method <> 'Pago móvil' and currency = 'USD')
    );

alter table wm.project_registrations
  drop constraint if exists project_registrations_rate_chk,
  add constraint project_registrations_rate_chk
    check (currency = 'USD' or exchange_rate is not null);

alter table wm.project_registrations
  drop constraint if exists project_registrations_ticket_status_chk,
  add constraint project_registrations_ticket_status_chk
    check (ticket_status in ('No emitido','Disponible','Usado','Anulado'));

create index if not exists projects_status_idx on wm.projects(status);
create index if not exists projects_event_date_idx on wm.projects(event_date);
create index if not exists project_registrations_project_id_idx on wm.project_registrations(project_id);
create index if not exists project_registrations_status_idx on wm.project_registrations(status);
create index if not exists project_registrations_payment_method_idx on wm.project_registrations(payment_method);
create index if not exists project_registrations_document_idx on wm.project_registrations(document);
create unique index if not exists project_registrations_reference_uidx
  on wm.project_registrations(lower(payment_reference))
  where payment_reference is not null and btrim(payment_reference) <> '';
create unique index if not exists project_registrations_ticket_hash_uidx
  on wm.project_registrations(ticket_hash)
  where ticket_hash is not null;
create unique index if not exists project_registrations_project_document_uidx
  on wm.project_registrations(project_id, lower(document));
create unique index if not exists project_registrations_project_email_uidx
  on wm.project_registrations(project_id, lower(email));

drop trigger if exists projects_set_updated_at on wm.projects;
create trigger projects_set_updated_at
  before update on wm.projects
  for each row execute function wm.set_updated_at();

drop trigger if exists project_registrations_set_updated_at on wm.project_registrations;
create trigger project_registrations_set_updated_at
  before update on wm.project_registrations
  for each row execute function wm.set_updated_at();

alter table wm.projects enable row level security;
alter table wm.project_registrations enable row level security;

drop policy if exists projects_sel on wm.projects;
drop policy if exists projects_ins on wm.projects;
drop policy if exists projects_upd on wm.projects;
drop policy if exists projects_del on wm.projects;
drop policy if exists project_registrations_sel on wm.project_registrations;
drop policy if exists project_registrations_ins on wm.project_registrations;
drop policy if exists project_registrations_upd on wm.project_registrations;
drop policy if exists project_registrations_del on wm.project_registrations;

create policy projects_sel on wm.projects
  for select to authenticated using (wm.is_member());
create policy projects_ins on wm.projects
  for insert to authenticated with check (wm.has_module('Proyectos', 2));
create policy projects_upd on wm.projects
  for update to authenticated using (wm.has_module('Proyectos', 2))
  with check (wm.has_module('Proyectos', 2));
create policy projects_del on wm.projects
  for delete to authenticated using (wm.has_module('Proyectos', 2));

create policy project_registrations_sel on wm.project_registrations
  for select to authenticated using (wm.is_member());
create policy project_registrations_ins on wm.project_registrations
  for insert to authenticated with check (wm.has_module('Proyectos', 2));
create policy project_registrations_upd on wm.project_registrations
  for update to authenticated using (wm.has_module('Proyectos', 2))
  with check (wm.has_module('Proyectos', 2));
create policy project_registrations_del on wm.project_registrations
  for delete to authenticated using (wm.has_module('Proyectos', 2));

grant select, insert, update, delete on wm.projects to authenticated;
grant select, insert, update, delete on wm.project_registrations to authenticated;

insert into wm.role_permissions (role, module, level) values
  ('Super Admin','Proyectos',2),
  ('Administrador','Proyectos',2),
  ('Gerente','Proyectos',2),
  ('Vendedor','Proyectos',1),
  ('Inventario','Proyectos',0),
  ('Cajero','Proyectos',1)
on conflict (role, module) do update set level = excluded.level;

notify pgrst, 'reload schema';
