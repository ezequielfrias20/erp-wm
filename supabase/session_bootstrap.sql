-- session_bootstrap: resuelve perfil + permisos del usuario autenticado en UNA sola
-- llamada. Antes la app hacía tres viajes de red en serie por navegación
-- (auth.getUser -> claim_profile -> role_permissions); ahora el JWT se verifica en
-- local con la JWKS y esta función devuelve todo lo demás junto.
--
-- Aplicar después de sales_commissions.sql (necesita profiles.system_access).

create or replace function wm.session_bootstrap()
returns jsonb
language plpgsql
security definer
set search_path = wm, public
as $$
declare
  v_profile wm.profiles;
  v_perms jsonb;
begin
  v_profile := wm.claim_profile();
  if v_profile.id is null then
    return null;
  end if;

  select coalesce(jsonb_object_agg(rp.module, rp.level), '{}'::jsonb)
    into v_perms
    from wm.role_permissions rp
   where rp.role = v_profile.role;

  return jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'permissions', v_perms
  );
end;
$$;

grant execute on function wm.session_bootstrap() to authenticated;

-- La matriz de permisos se lee por rol en cada bootstrap.
create index if not exists role_permissions_role_idx
  on wm.role_permissions (role);
