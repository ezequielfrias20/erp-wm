-- =============================================================================
-- WM ERP - cursos y horarios sobre el modulo Proyectos.
--
-- Esta ampliacion es estrictamente aditiva:
-- - Los proyectos existentes permanecen como "Evento".
-- - Las inscripciones existentes no necesitan grupo, orden ni jornadas.
-- - El flujo historico de QR de una sola entrada sigue funcionando sin cambios.
-- =============================================================================

alter table wm.projects
  add column if not exists project_type text not null default 'Evento',
  add column if not exists public_slug text,
  add column if not exists public_registration_enabled boolean not null default false,
  add column if not exists registration_opens_at timestamptz,
  add column if not exists registration_closes_at timestamptz,
  add column if not exists default_price_usd numeric(12,2),
  add column if not exists registration_payment_instructions text,
  add column if not exists timezone text not null default 'America/Caracas';

alter table wm.projects
  drop constraint if exists projects_project_type_chk,
  add constraint projects_project_type_chk
    check (project_type in ('Evento','Curso'));

alter table wm.projects
  drop constraint if exists projects_default_price_chk,
  add constraint projects_default_price_chk
    check (default_price_usd is null or default_price_usd > 0);

alter table wm.projects
  drop constraint if exists projects_registration_window_chk,
  add constraint projects_registration_window_chk
    check (
      registration_opens_at is null
      or registration_closes_at is null
      or registration_closes_at > registration_opens_at
    );

create unique index if not exists projects_public_slug_uidx
  on wm.projects(lower(public_slug))
  where public_slug is not null and btrim(public_slug) <> '';

create table if not exists wm.project_groups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references wm.projects(id) on delete cascade,
  name text not null,
  slug text not null,
  capacity int not null check (capacity > 0),
  price_usd numeric(12,2) not null check (price_usd > 0),
  status text not null default 'Borrador'
    check (status in ('Borrador','Abierto','Cerrado','Cancelado')),
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_groups_registration_window_chk
    check (
      registration_opens_at is null
      or registration_closes_at is null
      or registration_closes_at > registration_opens_at
    )
);

create unique index if not exists project_groups_project_slug_uidx
  on wm.project_groups(project_id, lower(slug));
create index if not exists project_groups_project_status_idx
  on wm.project_groups(project_id, status);

create table if not exists wm.project_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references wm.project_groups(id) on delete cascade,
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  instructor text,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_sessions_time_chk check (ends_at > starts_at)
);

create index if not exists project_sessions_group_starts_idx
  on wm.project_sessions(group_id, starts_at);

create table if not exists wm.project_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references wm.projects(id) on delete cascade,
  group_id uuid not null references wm.project_groups(id) on delete restrict,
  code text not null unique,
  quantity int not null check (quantity between 1 and 10),
  currency text not null check (currency in ('USD','VES')),
  amount numeric(14,2) not null check (amount > 0),
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  exchange_rate numeric(12,4),
  payment_method text not null
    check (payment_method in ('Pago móvil','Efectivo USD','Zelle/Zinli','Binance','Cashea')),
  payment_reference text,
  receipt_url text,
  receipt_storage_path text,
  status text not null default 'Por validar'
    check (status in ('Por validar','Confirmado','Cancelado','Vencido')),
  reservation_expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_orders_rate_chk
    check (currency = 'USD' or exchange_rate is not null),
  constraint project_orders_receipt_chk
    check (
      payment_method = 'Efectivo USD'
      or (
        nullif(payment_reference, '') is not null
        and (
          nullif(receipt_url, '') is not null
          or nullif(receipt_storage_path, '') is not null
        )
      )
    )
);

create index if not exists project_orders_project_created_idx
  on wm.project_orders(project_id, created_at desc);
create index if not exists project_orders_group_status_idx
  on wm.project_orders(group_id, status);
create unique index if not exists project_orders_reference_uidx
  on wm.project_orders(lower(payment_reference))
  where payment_reference is not null and btrim(payment_reference) <> '';

alter table wm.project_registrations
  add column if not exists group_id uuid,
  add column if not exists order_id uuid,
  add column if not exists receipt_storage_path text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_registrations_group_id_fkey'
      and conrelid = 'wm.project_registrations'::regclass
  ) then
    alter table wm.project_registrations
      add constraint project_registrations_group_id_fkey
      foreign key (group_id) references wm.project_groups(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'project_registrations_order_id_fkey'
      and conrelid = 'wm.project_registrations'::regclass
  ) then
    alter table wm.project_registrations
      add constraint project_registrations_order_id_fkey
      foreign key (order_id) references wm.project_orders(id) on delete set null;
  end if;
end $$;

alter table wm.project_registrations
  drop constraint if exists project_registrations_receipt_chk,
  add constraint project_registrations_receipt_chk
    check (
      payment_method = 'Efectivo USD'
      or nullif(receipt_url, '') is not null
      or nullif(receipt_storage_path, '') is not null
    );

create index if not exists project_registrations_group_status_idx
  on wm.project_registrations(group_id, status)
  where group_id is not null;
create index if not exists project_registrations_order_id_idx
  on wm.project_registrations(order_id)
  where order_id is not null;

create table if not exists wm.project_checkins (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references wm.project_registrations(id) on delete cascade,
  session_id uuid not null references wm.project_sessions(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references wm.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  constraint project_checkins_registration_session_key
    unique (registration_id, session_id)
);

create index if not exists project_checkins_session_checked_idx
  on wm.project_checkins(session_id, checked_in_at);
create index if not exists project_checkins_registration_idx
  on wm.project_checkins(registration_id);

drop trigger if exists project_groups_set_updated_at on wm.project_groups;
create trigger project_groups_set_updated_at
  before update on wm.project_groups
  for each row execute function wm.set_updated_at();

drop trigger if exists project_sessions_set_updated_at on wm.project_sessions;
create trigger project_sessions_set_updated_at
  before update on wm.project_sessions
  for each row execute function wm.set_updated_at();

drop trigger if exists project_orders_set_updated_at on wm.project_orders;
create trigger project_orders_set_updated_at
  before update on wm.project_orders
  for each row execute function wm.set_updated_at();

create or replace function wm.guard_course_capacity_on_confirmation()
returns trigger
language plpgsql
security invoker
set search_path = wm, public
as $$
declare
  v_capacity int;
  v_confirmed int;
begin
  if new.group_id is null
     or new.status <> 'Confirmado'
     or old.status = 'Confirmado' then
    return new;
  end if;

  select capacity into v_capacity
  from wm.project_groups
  where id = new.group_id
  for update;

  select count(*)::int into v_confirmed
  from wm.project_registrations
  where group_id = new.group_id
    and status = 'Confirmado'
    and id <> new.id;

  if v_confirmed >= v_capacity then
    raise exception 'El grupo ya alcanzo su capacidad confirmada.';
  end if;
  return new;
end;
$$;

drop trigger if exists project_registrations_guard_course_capacity
  on wm.project_registrations;
create trigger project_registrations_guard_course_capacity
  before update of status on wm.project_registrations
  for each row execute function wm.guard_course_capacity_on_confirmation();

alter table wm.project_groups enable row level security;
alter table wm.project_sessions enable row level security;
alter table wm.project_orders enable row level security;
alter table wm.project_checkins enable row level security;

drop policy if exists project_groups_sel on wm.project_groups;
drop policy if exists project_groups_ins on wm.project_groups;
drop policy if exists project_groups_upd on wm.project_groups;
drop policy if exists project_groups_del on wm.project_groups;
create policy project_groups_sel on wm.project_groups
  for select to authenticated using (wm.is_member());
create policy project_groups_ins on wm.project_groups
  for insert to authenticated with check (wm.has_module('Proyectos', 2));
create policy project_groups_upd on wm.project_groups
  for update to authenticated using (wm.has_module('Proyectos', 2))
  with check (wm.has_module('Proyectos', 2));
create policy project_groups_del on wm.project_groups
  for delete to authenticated using (wm.has_module('Proyectos', 2));

drop policy if exists project_sessions_sel on wm.project_sessions;
drop policy if exists project_sessions_ins on wm.project_sessions;
drop policy if exists project_sessions_upd on wm.project_sessions;
drop policy if exists project_sessions_del on wm.project_sessions;
create policy project_sessions_sel on wm.project_sessions
  for select to authenticated using (wm.is_member());
create policy project_sessions_ins on wm.project_sessions
  for insert to authenticated with check (wm.has_module('Proyectos', 2));
create policy project_sessions_upd on wm.project_sessions
  for update to authenticated using (wm.has_module('Proyectos', 2))
  with check (wm.has_module('Proyectos', 2));
create policy project_sessions_del on wm.project_sessions
  for delete to authenticated using (wm.has_module('Proyectos', 2));

drop policy if exists project_orders_sel on wm.project_orders;
drop policy if exists project_orders_ins on wm.project_orders;
drop policy if exists project_orders_upd on wm.project_orders;
drop policy if exists project_orders_del on wm.project_orders;
create policy project_orders_sel on wm.project_orders
  for select to authenticated using (wm.is_member());
create policy project_orders_ins on wm.project_orders
  for insert to authenticated with check (wm.has_module('Proyectos', 2));
create policy project_orders_upd on wm.project_orders
  for update to authenticated using (wm.has_module('Proyectos', 2))
  with check (wm.has_module('Proyectos', 2));
create policy project_orders_del on wm.project_orders
  for delete to authenticated using (wm.has_module('Proyectos', 2));

drop policy if exists project_checkins_sel on wm.project_checkins;
drop policy if exists project_checkins_ins on wm.project_checkins;
drop policy if exists project_checkins_upd on wm.project_checkins;
drop policy if exists project_checkins_del on wm.project_checkins;
create policy project_checkins_sel on wm.project_checkins
  for select to authenticated using (wm.is_member());
create policy project_checkins_ins on wm.project_checkins
  for insert to authenticated with check (wm.has_module('Proyectos', 2));
create policy project_checkins_upd on wm.project_checkins
  for update to authenticated using (wm.has_module('Proyectos', 2))
  with check (wm.has_module('Proyectos', 2));
create policy project_checkins_del on wm.project_checkins
  for delete to authenticated using (wm.has_module('Proyectos', 2));

grant select, insert, update, delete on wm.project_groups to authenticated;
grant select, insert, update, delete on wm.project_sessions to authenticated;
grant select, insert, update, delete on wm.project_orders to authenticated;
grant select, insert, update, delete on wm.project_checkins to authenticated;
grant usage on schema wm to service_role;
grant select, insert, update, delete on wm.project_groups to service_role;
grant select, insert, update, delete on wm.project_sessions to service_role;
grant select, insert, update, delete on wm.project_orders to service_role;
grant select, insert, update, delete on wm.project_registrations to service_role;
grant select, insert, update, delete on wm.project_checkins to service_role;

insert into storage.buckets (id, name, public)
values ('wm-private', 'wm-private', false)
on conflict (id) do update set public = false;

drop policy if exists "wm_private_projects_select" on storage.objects;
drop policy if exists "wm_private_projects_insert" on storage.objects;
drop policy if exists "wm_private_projects_update" on storage.objects;
drop policy if exists "wm_private_projects_delete" on storage.objects;

create policy "wm_private_projects_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'wm-private' and wm.is_member());
create policy "wm_private_projects_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'wm-private' and wm.has_module('Proyectos', 2));
create policy "wm_private_projects_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'wm-private' and wm.has_module('Proyectos', 2))
  with check (bucket_id = 'wm-private' and wm.has_module('Proyectos', 2));
create policy "wm_private_projects_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'wm-private' and wm.has_module('Proyectos', 2));

create or replace function wm.create_course_order(
  p_project_id uuid,
  p_group_id uuid,
  p_code text,
  p_currency text,
  p_amount numeric,
  p_amount_usd numeric,
  p_exchange_rate numeric,
  p_payment_method text,
  p_payment_reference text,
  p_receipt_storage_path text,
  p_attendees jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = wm, public
as $$
declare
  v_project wm.projects%rowtype;
  v_group wm.project_groups%rowtype;
  v_order wm.project_orders%rowtype;
  v_attendee jsonb;
  v_quantity int;
  v_reserved int;
  v_index int := 0;
  v_reference text;
  v_registration_ids jsonb := '[]'::jsonb;
  v_registration_id uuid;
begin
  if jsonb_typeof(p_attendees) <> 'array' then
    raise exception 'La lista de estudiantes no es valida.';
  end if;

  v_quantity := jsonb_array_length(p_attendees);
  if v_quantity < 1 or v_quantity > 10 then
    raise exception 'La cantidad debe estar entre 1 y 10.';
  end if;

  select * into v_project
  from wm.projects
  where id = p_project_id
  for update;

  if not found
     or v_project.project_type <> 'Curso'
     or v_project.status <> 'Abierto'
     or not v_project.public_registration_enabled then
    raise exception 'El curso no esta abierto para inscripciones.';
  end if;

  if v_project.registration_opens_at is not null and now() < v_project.registration_opens_at then
    raise exception 'Las inscripciones aun no han comenzado.';
  end if;
  if v_project.registration_closes_at is not null and now() > v_project.registration_closes_at then
    raise exception 'Las inscripciones ya finalizaron.';
  end if;

  select * into v_group
  from wm.project_groups
  where id = p_group_id and project_id = p_project_id
  for update;

  if not found or v_group.status <> 'Abierto' then
    raise exception 'El horario seleccionado no esta disponible.';
  end if;
  if v_group.registration_opens_at is not null and now() < v_group.registration_opens_at then
    raise exception 'Las inscripciones para este horario aun no han comenzado.';
  end if;
  if v_group.registration_closes_at is not null and now() > v_group.registration_closes_at then
    raise exception 'Las inscripciones para este horario ya finalizaron.';
  end if;

  select count(*)::int into v_reserved
  from wm.project_registrations r
  left join wm.project_orders o on o.id = r.order_id
  where r.group_id = p_group_id
    and r.status in ('Por validar','Confirmado')
    and (
      r.order_id is null
      or o.status = 'Confirmado'
      or (
        o.status = 'Por validar'
        and (o.reservation_expires_at is null or o.reservation_expires_at > now())
      )
    );

  if v_reserved + v_quantity > v_group.capacity then
    raise exception 'No quedan suficientes cupos para este horario.';
  end if;

  insert into wm.project_orders (
    project_id, group_id, code, quantity, currency, amount, amount_usd,
    exchange_rate, payment_method, payment_reference, receipt_storage_path,
    reservation_expires_at, notes
  ) values (
    p_project_id, p_group_id, p_code, v_quantity, p_currency,
    round(p_amount * v_quantity, 2), round(p_amount_usd * v_quantity, 2),
    p_exchange_rate, p_payment_method, nullif(p_payment_reference, ''),
    nullif(p_receipt_storage_path, ''), now() + interval '24 hours', p_notes
  ) returning * into v_order;

  for v_attendee in select value from jsonb_array_elements(p_attendees)
  loop
    v_index := v_index + 1;
    v_reference := case
      when p_payment_method = 'Efectivo USD' then null
      when v_quantity = 1 then p_payment_reference
      else p_payment_reference || '-' || right(p_code, 6) || '-' || v_index::text
    end;

    insert into wm.project_registrations (
      project_id, group_id, order_id, first_name, last_name, document, email,
      phone, payment_method, currency, amount, amount_usd, exchange_rate,
      paid_at, payment_reference, receipt_storage_path, status, notes
    ) values (
      p_project_id, p_group_id, v_order.id,
      btrim(v_attendee->>'firstName'), btrim(v_attendee->>'lastName'),
      btrim(v_attendee->>'document'), lower(btrim(v_attendee->>'email')),
      btrim(v_attendee->>'phone'), p_payment_method, p_currency,
      p_amount, p_amount_usd, p_exchange_rate, current_date, v_reference,
      nullif(p_receipt_storage_path, ''), 'Por validar', p_notes
    ) returning id into v_registration_id;

    v_registration_ids := v_registration_ids || jsonb_build_array(v_registration_id);
  end loop;

  return jsonb_build_object(
    'id', v_order.id,
    'code', v_order.code,
    'status', v_order.status,
    'quantity', v_order.quantity,
    'registrationIds', v_registration_ids,
    'reservationExpiresAt', v_order.reservation_expires_at
  );
end;
$$;

revoke all on function wm.create_course_order(
  uuid, uuid, text, text, numeric, numeric, numeric, text, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function wm.create_course_order(
  uuid, uuid, text, text, numeric, numeric, numeric, text, text, text, jsonb, text
) to service_role;

notify pgrst, 'reload schema';
