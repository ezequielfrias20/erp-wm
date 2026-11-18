-- El bucket público conserva sus URLs, pero no permite listar objetos sin sesión.
-- Correr desde la raíz: scripts/catalogo/psql.sh -X -f supabase/tests/storage_no_public_list_rollback.sql
\set ON_ERROR_STOP 1
begin;

\i supabase/storage_no_public_list.sql
\i supabase/storage_no_public_list.sql

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'wm_public_read'
  ) then
    raise exception 'wm_public_read todavía existe';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd = 'SELECT'
      and roles && array['public'::name, 'anon'::name]
      and qual ~ $re$bucket_id[[:space:]]*=[[:space:]]*'wm-public'$re$
  ) then
    raise exception 'public/anon todavía puede listar wm-public mediante una política SELECT';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'wm_authenticated_read' and cmd = 'SELECT'
      and roles = array['authenticated'::name]
      and qual ~ $re$bucket_id[[:space:]]*=[[:space:]]*'wm-public'$re$
      and qual ~ $re$wm[.]is_member\(\)$re$
  ) then
    raise exception 'falta wm_authenticated_read para wm-public y authenticated';
  end if;

  if not exists (
    select 1 from storage.buckets
    where id = 'wm-public' and public is true
  ) then
    raise exception 'wm-public ya no es un bucket público';
  end if;

  if exists (
    select 1
    from (values
      ('wm_authenticated_insert', 'INSERT'),
      ('wm_authenticated_update', 'UPDATE'),
      ('wm_authenticated_delete', 'DELETE'),
      ('wm_private_projects_select', 'SELECT'),
      ('wm_private_projects_insert', 'INSERT'),
      ('wm_private_projects_update', 'UPDATE'),
      ('wm_private_projects_delete', 'DELETE')
    ) as expected(policyname, cmd)
    where not exists (
      select 1 from pg_policies p
      where p.schemaname = 'storage' and p.tablename = 'objects'
        and p.policyname = expected.policyname and p.cmd = expected.cmd
    )
  ) then
    raise exception 'faltan políticas de escritura autenticada o de proyectos privados';
  end if;

  raise notice 'OK: wm-public sigue público sin listado anónimo; políticas autenticadas preservadas';
end $$;

-- Verificación real de RLS: un objeto visible para un miembro no aparece para anon.
select set_config('wm_test.storage_object', 'test/' || gen_random_uuid()::text || '.png', true);
insert into storage.objects (bucket_id, name)
values ('wm-public', current_setting('wm_test.storage_object', true));

set local role anon;
do $$
begin
  if (select count(*) from storage.objects
      where bucket_id = 'wm-public' and name = current_setting('wm_test.storage_object', true)) <> 0 then
    raise exception 'anon pudo listar wm-public';
  end if;
end $$;
reset role;

set local role authenticated;
do $$
begin
  if (select count(*) from storage.objects
      where bucket_id = 'wm-public' and name = current_setting('wm_test.storage_object', true)) <> 0 then
    raise exception 'usuario autenticado ajeno al ERP pudo listar wm-public';
  end if;
end $$;
reset role;

select user_id as admin_user_id from wm.profiles
where role = 'Super Admin' and status = 'Activo' and system_access = true
  and user_id is not null order by id limit 1 \gset
select set_config('request.jwt.claims',
  json_build_object('sub', :'admin_user_id', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if (select count(*) from storage.objects
      where bucket_id = 'wm-public' and name = current_setting('wm_test.storage_object', true)) < 1 then
    raise exception 'miembro ERP no pudo listar wm-public';
  end if;
end $$;
reset role;

rollback;
