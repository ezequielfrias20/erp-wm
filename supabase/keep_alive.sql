-- =============================================================================
--  ERP — keep-alive: latido diario para que Supabase no pause el proyecto.
--
--  Los proyectos del plan gratuito se pausan tras 7 días sin actividad real en la base.
--  Vercel Cron llama a GET /api/keep-alive una vez al día; la ruta ejecuta wm.keep_alive()
--  con la llave secreta y esa función escribe aquí. La escritura se limita a una por hora,
--  así que la ruta puede quedar abierta sin que sirva para martillar la base.
--
--  Idempotente. Correr con:
--    psql "$CONN" -v ON_ERROR_STOP=1 -f supabase/keep_alive.sql
--  Diseño: docs/superpowers/specs/2026-11-21-keep-alive-supabase-design.md
-- =============================================================================

create table if not exists wm.heartbeat (
  id smallint primary key default 1 check (id = 1),
  last_beat_at timestamptz,
  beats bigint not null default 0
);

insert into wm.heartbeat (id) values (1) on conflict (id) do nothing;

alter table wm.heartbeat enable row level security;

drop policy if exists heartbeat_select on wm.heartbeat;
create policy heartbeat_select on wm.heartbeat for select to authenticated
  using (wm.is_member());

revoke all on wm.heartbeat from anon, authenticated;
grant select on wm.heartbeat to authenticated;

create or replace function wm.keep_alive()
returns timestamptz
language plpgsql
security definer
set search_path = wm, public
as $$
declare
  v_last timestamptz;
begin
  -- Dentro de la hora: sólo lectura. Sin esta salida, el upsert de abajo bloquea la fila aunque
  -- su WHERE dé falso (graba xmax y escribe WAL) y la ruta abierta generaría escrituras.
  select last_beat_at into v_last from wm.heartbeat where id = 1;
  if v_last is not null and v_last >= now() - interval '1 hour' then
    return v_last;
  end if;

  -- Dos llamadas simultáneas pueden pasar el chequeo a la vez: las ordena el WHERE del upsert.
  insert into wm.heartbeat as h (id, last_beat_at, beats) values (1, now(), 1)
  on conflict (id) do update set last_beat_at = now(), beats = h.beats + 1
   where h.last_beat_at is null or h.last_beat_at < now() - interval '1 hour';

  return (select last_beat_at from wm.heartbeat where id = 1);
end;
$$;

revoke all on function wm.keep_alive() from public, anon, authenticated;
grant execute on function wm.keep_alive() to service_role;

notify pgrst, 'reload schema';
