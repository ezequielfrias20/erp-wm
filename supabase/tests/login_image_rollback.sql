-- Prueba de supabase/login_image.sql: la aplica DOS veces (idempotencia), verifica y deshace
-- todo con ROLLBACK. Correr desde la raíz del repo contra un negocio de PRUEBA (nunca producción):
--   psql -X -f supabase/tests/login_image_rollback.sql
\set ON_ERROR_STOP 1
begin;
\i supabase/login_image.sql
\i supabase/login_image.sql

update wm.settings set login_image_url = 'https://ejemplo.test/login.webp' where id = 1;

-- El login no tiene sesión: anon debe leer la imagen por la función, nunca la tabla.
set local role anon;
do $$
declare v_url text;
begin
  select login_image_url into v_url from wm.branding();
  if v_url is distinct from 'https://ejemplo.test/login.webp' then
    raise exception 'FALLO: anon no recibe la imagen del login (%)', v_url;
  end if;
  begin
    perform 1 from wm.settings;
    if found then raise exception 'FALLO: anon puede leer wm.settings'; end if;
  exception when insufficient_privilege then null;
  end;
end$$;
reset role;

rollback;
\echo OK login_image
