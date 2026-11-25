-- Imagen del login configurable por negocio (Configuración → Marca).
--  · wm.settings.login_image_url: foto del panel derecho; null = fondo genérico con el color de marca.
--  · wm.branding() la devuelve al login sin sesión. Cambia el tipo de retorno, así que hay que
--    borrar y recrear la función (y volver a dar los permisos) en la misma transacción.
-- Idempotente. Aplicar:
--   psql -X -1 -v ON_ERROR_STOP=1 -c "set lock_timeout = '5s'" -f supabase/login_image.sql

alter table wm.settings add column if not exists login_image_url text;

drop function if exists wm.branding();
create function wm.branding()
returns table (
  company_name text,
  logo_url text,
  logo_dark_url text,
  favicon_url text,
  primary_color text,
  accent_color text,
  login_image_url text
)
language sql
security definer
set search_path = wm, public
stable
as $$
  select s.company_name, s.logo_url, s.logo_dark_url, s.favicon_url, s.primary_color,
         s.accent_color, s.login_image_url
  from wm.settings s
  where s.id = 1;
$$;

grant execute on function wm.branding() to anon, authenticated;

notify pgrst, 'reload schema';
