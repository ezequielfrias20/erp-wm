-- Escritura de wm-public solo para miembros; todo se revierte.
-- Correr desde la raíz: scripts/catalogo/psql.sh -X -f supabase/tests/storage_wm_public_write_rollback.sql
\set ON_ERROR_STOP 1
begin;
-- Supabase bloquea DELETE directo en storage.objects; se permite solo dentro de esta transacción.
set local storage.allow_delete_query = 'true';

\i supabase/storage_wm_public_write.sql
\i supabase/storage_wm_public_write.sql

do $$
begin
  if (select count(*) from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname in ('wm_authenticated_insert', 'wm_authenticated_update',
                           'wm_authenticated_delete')
        and roles = array['authenticated'::name]
        and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'wm[.]is_member\(\)') <> 3 then
    raise exception 'faltan políticas de escritura de wm-public con wm.is_member()';
  end if;
end $$;

select set_config('test.storage_object', 'test/' || gen_random_uuid()::text || '.png', true);
insert into storage.objects (bucket_id, name)
values ('wm-public', current_setting('test.storage_object', true));

-- Un JWT autenticado sin perfil en wm no puede modificar ni crear objetos.
select set_config('request.jwt.claims',
  json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_count int;
  v_rejected boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('wm-public', 'test/' || gen_random_uuid()::text || '.png');
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'usuario ajeno al ERP pudo insertar en wm-public'; end if;

  update storage.objects set name = name || '.cambio'
   where bucket_id = 'wm-public' and name = current_setting('test.storage_object', true);
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'usuario ajeno al ERP pudo actualizar wm-public'; end if;

  delete from storage.objects
   where bucket_id = 'wm-public' and name = current_setting('test.storage_object', true);
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'usuario ajeno al ERP pudo borrar de wm-public'; end if;
end $$;
reset role;

select user_id as admin_user_id from wm.profiles
 where role = 'Super Admin' and status = 'Activo' and system_access = true
   and user_id is not null order by id limit 1 \gset
select set_config('request.jwt.claims',
  json_build_object('sub', :'admin_user_id', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_count int;
begin
  insert into storage.objects (bucket_id, name)
  values ('wm-public', 'test/' || gen_random_uuid()::text || '.png');
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'miembro ERP no pudo insertar en wm-public'; end if;

  delete from storage.objects
   where bucket_id = 'wm-public' and name = current_setting('test.storage_object', true);
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'miembro ERP no pudo borrar de wm-public'; end if;
end $$;
reset role;

rollback;
