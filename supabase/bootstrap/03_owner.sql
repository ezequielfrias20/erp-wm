-- =============================================================================
--  ERP — OWNER (primer usuario, Super Admin). Crea el usuario de Auth + su perfil.
--  Desde este login, el owner administra TODO el negocio (sucursales, usuarios,
--  catálogo, inventario, ventas) desde la UI.
--
--  Idempotente: si el email ya existe en auth.users NO se duplica ni se cambia la
--  contraseña (para resetearla, ver supabase/bootstrap/README.md).
--
--  Parámetros (obligatorios):
--    -v owner_email='dueno@negocio.com'
--    -v owner_name='Nombre Apellido'
--    -v owner_password='ContraseñaSegura'
--
--  Correr con:
--    psql "$CONN" -v ON_ERROR_STOP=1 \
--      -v owner_email='dueno@negocio.com' \
--      -v owner_name='Nombre Apellido' \
--      -v owner_password='ContraseñaSegura' \
--      -f 03_owner.sql
--
--  Si la inserción directa en auth.users fallara (cambios internos de Supabase),
--  usar el FALLBACK del README (crear el usuario en el Dashboard + claim_profile).
-- =============================================================================

-- ----- Validación de parámetros ---------------------------------------------
\if :{?owner_email}
\else
  \echo '>>> ERROR: falta -v owner_email=...'
  \quit 1
\endif
\if :{?owner_name}
\else
  \echo '>>> ERROR: falta -v owner_name=...'
  \quit 1
\endif
\if :{?owner_password}
\else
  \echo '>>> ERROR: falta -v owner_password=...'
  \quit 1
\endif

-- crypt() / gen_salt() para hashear la contraseña (Supabase: esquema extensions)
create extension if not exists pgcrypto with schema extensions;

-- ----- 1. Usuario de Auth (solo si no existe ese email) ----------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  lower(:'owner_email'),
  extensions.crypt(:'owner_password', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', :'owner_name'::text),
  now(),
  now()
where not exists (
  select 1 from auth.users where email = lower(:'owner_email')
);

-- ----- 2. Identidad email (solo si no existe) --------------------------------
insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id::text,
  u.id,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(), now(), now()
from auth.users u
where u.email = lower(:'owner_email')
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

-- ----- 3. Perfil del ERP (Super Admin, enlazado al auth user) ----------------
insert into wm.profiles (user_id, full_name, email, role, branch_id, status, last_sign_in_at)
select
  u.id,
  :'owner_name'::text,
  lower(:'owner_email'),
  'Super Admin',
  (select id from wm.branches order by code limit 1),
  'Activo',
  null
from auth.users u
where u.email = lower(:'owner_email')
on conflict (email) do update set
  user_id   = excluded.user_id,
  full_name = excluded.full_name,
  role      = 'Super Admin',
  status    = 'Activo',
  branch_id = coalesce(wm.profiles.branch_id, excluded.branch_id);

-- ----- Verificación ----------------------------------------------------------
do $$
declare v_ok int;
begin
  select count(*) into v_ok
  from wm.profiles p
  join auth.users u on u.id = p.user_id
  where p.role = 'Super Admin' and p.status = 'Activo';
  if v_ok = 0 then
    raise exception 'No se creó/enlazó el owner Super Admin';
  end if;
  raise notice 'Owner OK · Super Admin activo enlazado a Auth (% perfil/es)', v_ok;
end$$;
