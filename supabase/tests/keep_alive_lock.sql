-- Prueba de supabase/keep_alive.sql: un latido dentro de la hora NO bloquea ni toca la fila.
-- (INSERT … ON CONFLICT DO UPDATE … WHERE falso igual bloquea la fila: graba xmax y escribe WAL,
-- así que quien martille la ruta abierta generaría escrituras.) Necesita un latido ya confirmado
-- por otra transacción, por eso el primer paso sí escribe un latido real (inofensivo).
-- Correr sólo contra un negocio de PRUEBA:  psql -X -f supabase/tests/keep_alive_lock.sql
\set ON_ERROR_STOP 1

-- 1) Latido confirmado (si ya hay uno de hace menos de 1 h, no cambia nada).
select wm.keep_alive();

-- 2) En otra transacción, un latido más no debe bloquear la fila.
begin;
do $$
declare
  x_antes xid;
  x_despues xid;
begin
  select xmax into x_antes from wm.heartbeat where id = 1;
  perform wm.keep_alive();
  select xmax into x_despues from wm.heartbeat where id = 1;
  if x_antes is distinct from x_despues then
    raise exception 'latido dentro de la hora bloqueó la fila: xmax % → %', x_antes, x_despues;
  end if;
  raise notice 'keep_alive_lock OK';
end$$;
rollback;
