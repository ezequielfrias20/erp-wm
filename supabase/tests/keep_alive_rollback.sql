-- Prueba de supabase/keep_alive.sql: la aplica DOS veces (idempotencia), verifica y deshace
-- todo con ROLLBACK. Correr desde la raíz del repo contra un negocio de PRUEBA (nunca producción):
--   psql -X -f supabase/tests/keep_alive_rollback.sql
\set ON_ERROR_STOP 1
begin;
\i supabase/keep_alive.sql
\i supabase/keep_alive.sql

do $$
declare
  v1 timestamptz;
  v2 timestamptz;
  v_beats bigint;
begin
  -- Dos latidos seguidos: el segundo no escribe (límite de una escritura por hora).
  update wm.heartbeat set last_beat_at = null, beats = 0 where id = 1;
  v1 := wm.keep_alive();
  v2 := wm.keep_alive();
  select beats into v_beats from wm.heartbeat where id = 1;
  if v1 is null or v1 is distinct from v2 or v_beats <> 1 then
    raise exception 'dos latidos seguidos: v1=%, v2=%, beats=% (esperado mismo valor y beats=1)', v1, v2, v_beats;
  end if;

  -- Pasada la hora, vuelve a escribir.
  update wm.heartbeat set last_beat_at = now() - interval '2 hours' where id = 1;
  perform wm.keep_alive();
  select beats into v_beats from wm.heartbeat where id = 1;
  if v_beats <> 2 then
    raise exception 'tras 2 h: beats=% (esperado 2)', v_beats;
  end if;

  -- Si alguien borra la fila, el latido la recrea.
  delete from wm.heartbeat;
  v1 := wm.keep_alive();
  if v1 is null or not exists (select 1 from wm.heartbeat where id = 1) then
    raise exception 'fila borrada: keep_alive devolvió % y la fila id=1 no volvió', v1;
  end if;

  -- Permisos: sólo service_role ejecuta; nadie escribe directo en la tabla.
  if has_function_privilege('anon', 'wm.keep_alive()', 'execute') then
    raise exception 'anon puede ejecutar wm.keep_alive()';
  end if;
  if has_function_privilege('authenticated', 'wm.keep_alive()', 'execute') then
    raise exception 'authenticated puede ejecutar wm.keep_alive()';
  end if;
  if not has_function_privilege('service_role', 'wm.keep_alive()', 'execute') then
    raise exception 'service_role no puede ejecutar wm.keep_alive()';
  end if;
  if has_table_privilege('authenticated', 'wm.heartbeat', 'insert') then
    raise exception 'authenticated puede insertar en wm.heartbeat';
  end if;
  if not has_table_privilege('authenticated', 'wm.heartbeat', 'select') then
    raise exception 'authenticated no puede leer wm.heartbeat';
  end if;

  raise notice 'keep_alive OK';
end$$;
rollback;
