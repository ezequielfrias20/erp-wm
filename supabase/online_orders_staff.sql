-- Gestión de pedidos online por personal con permiso Ventas 2.
-- El pedido se bloquea antes del inventario; las parejas variante/sucursal
-- se bloquean en orden estable para concordar con create_sale.

create or replace function wm.online_order_accept(
  p_order_id uuid, p_lines jsonb default '[]'::jsonb
)
returns wm.online_orders
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_profile uuid := wm.my_profile_id();
  v_order wm.online_orders;
  v_line jsonb;
  v_updates jsonb := '{}'::jsonb;
  v_item_id uuid;
  v_item wm.online_order_items;
  v_candidate record;
  v_collision record;
  v_stock int;
  v_held int;
  v_branch_name text;
  v_branch_enabled boolean;
  v_hours int;
begin
  if v_profile is null or not wm.has_module('Ventas', 2) then
    raise exception 'No autorizado para gestionar pedidos online';
  end if;
  select * into v_order from wm.online_orders where id = p_order_id for update;
  if not found or v_order.status <> 'solicitada' then
    raise exception 'Solo se puede aceptar un pedido solicitado';
  end if;
  if p_lines is null or pg_catalog.jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Las líneas del pedido deben ser una lista';
  end if;

  for v_line in select value from pg_catalog.jsonb_array_elements(p_lines) loop
    if pg_catalog.jsonb_typeof(v_line) <> 'object'
       or v_line->>'item_id' is null
       or v_line->>'branch_id' is null
       or v_line->>'quantity' is null
       or pg_catalog.jsonb_typeof(v_line->'quantity') <> 'number'
       or (v_line->>'quantity') !~ '^(0|[1-9][0-9]*)$' then
      raise exception 'Cada línea requiere item_id, branch_id y una cantidad entera no negativa';
    end if;
    v_item_id := (v_line->>'item_id')::uuid;
    if v_updates ? v_item_id::text then
      raise exception 'La línea % está repetida', v_item_id;
    end if;
    select * into v_item from wm.online_order_items
     where id = v_item_id and order_id = p_order_id;
    if not found then
      raise exception 'La línea % no pertenece a este pedido', v_item_id;
    end if;
    -- Valida los tipos/rangos antes de usarlos en las consultas de inventario.
    perform (v_line->>'branch_id')::uuid, (v_line->>'quantity')::int;
    v_updates := v_updates || pg_catalog.jsonb_build_object(v_item_id::text, v_line);
  end loop;

  if not exists (
    select 1 from wm.online_order_items i
     where i.order_id = p_order_id
       and coalesce((v_updates->i.id::text->>'quantity')::int, i.quantity) > 0
  ) then
    raise exception 'El pedido debe conservar al menos un producto';
  end if;

  -- Una línea movida no se fusiona implícitamente con otra del mismo producto.
  select i.product_name, b.name as branch_name into v_collision
    from wm.online_order_items i
    join wm.online_order_items other
      on other.order_id = i.order_id and other.id <> i.id
     and other.variant_id = i.variant_id
    join wm.branches b on b.id = (v_updates->i.id::text->>'branch_id')::uuid
   where i.order_id = p_order_id
     and v_updates ? i.id::text
     and (v_updates->i.id::text->>'quantity')::int > 0
     and (v_updates->i.id::text->>'branch_id')::uuid <> i.branch_id
     and other.branch_id = (v_updates->i.id::text->>'branch_id')::uuid
   limit 1;
  if found then
    raise exception 'El pedido ya tiene «%» en esa sucursal; ajusta la cantidad de esa línea',
      v_collision.product_name;
  end if;
  -- También evita dos líneas diferentes movidas al mismo destino.
  select pg_catalog.min(i.product_name) as product_name into v_collision
    from wm.online_order_items i
   where i.order_id = p_order_id
     and coalesce((v_updates->i.id::text->>'quantity')::int, i.quantity) > 0
   group by i.variant_id,
     coalesce((v_updates->i.id::text->>'branch_id')::uuid, i.branch_id)
  having pg_catalog.count(*) > 1
   limit 1;
  if found then
    raise exception 'El pedido ya tiene «%» en esa sucursal; ajusta la cantidad de esa línea',
      v_collision.product_name;
  end if;

  for v_candidate in
    select i.variant_id,
           coalesce((v_updates->i.id::text->>'branch_id')::uuid, i.branch_id) as branch_id,
           coalesce((v_updates->i.id::text->>'quantity')::int, i.quantity) as quantity,
           i.product_name
      from wm.online_order_items i
     where i.order_id = p_order_id
       and coalesce((v_updates->i.id::text->>'quantity')::int, i.quantity) > 0
     order by i.variant_id,
       coalesce((v_updates->i.id::text->>'branch_id')::uuid, i.branch_id)
  loop
    select name, online_enabled into v_branch_name, v_branch_enabled
      from wm.branches where id = v_candidate.branch_id;
    if v_branch_enabled is distinct from true then
      raise exception 'La sucursal % no está habilitada para pedidos online',
        coalesce(v_branch_name, v_candidate.branch_id::text);
    end if;
    select quantity into v_stock from wm.inventory
     where variant_id = v_candidate.variant_id and branch_id = v_candidate.branch_id
     for update;
    v_held := wm.online_held(v_candidate.variant_id, v_candidate.branch_id, p_order_id);
    if v_candidate.quantity > coalesce(v_stock, 0) - v_held then
      raise exception '«%» en %: pides %, hay %', v_candidate.product_name,
        v_branch_name, v_candidate.quantity, coalesce(v_stock, 0) - v_held;
    end if;
  end loop;

  delete from wm.online_order_items i
   where i.order_id = p_order_id
     and v_updates ? i.id::text
     and (v_updates->i.id::text->>'quantity')::int = 0;
  update wm.online_order_items i
     set branch_id = (v_updates->i.id::text->>'branch_id')::uuid,
         quantity = (v_updates->i.id::text->>'quantity')::int
   where i.order_id = p_order_id and v_updates ? i.id::text;

  select firm_hold_hours into v_hours from wm.online_settings where id = 1;
  if v_hours is null then
    raise exception 'Falta la configuración de pedidos online';
  end if;
  update wm.online_orders
     set status = 'aceptada',
         firm_expires_at = pg_catalog.now() + pg_catalog.make_interval(hours => v_hours),
         accepted_by = v_profile, accepted_at = pg_catalog.now()
   where id = p_order_id returning * into v_order;
  insert into wm.audit_log (user_id, who, action, module, severity)
  select v_profile, full_name, 'Aceptó el pedido online ' || v_order.number, 'Ventas', 'edit'
    from wm.profiles where id = v_profile;
  return v_order;
end$function$;
revoke all on function wm.online_order_accept(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function wm.online_order_accept(uuid, jsonb) to authenticated;

create or replace function wm.online_order_reject(
  p_order_id uuid, p_reason text default null
)
returns wm.online_orders
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_profile uuid := wm.my_profile_id();
  v_order wm.online_orders;
begin
  if v_profile is null or not wm.has_module('Ventas', 2) then
    raise exception 'No autorizado para gestionar pedidos online';
  end if;
  select * into v_order from wm.online_orders where id = p_order_id for update;
  if not found or v_order.status <> 'solicitada' then
    raise exception 'Solo se puede rechazar un pedido solicitado';
  end if;
  update wm.online_orders
     set status = 'rechazada', closed_by = v_profile,
         closed_at = pg_catalog.now(), close_reason = p_reason
   where id = p_order_id returning * into v_order;
  insert into wm.audit_log (user_id, who, action, module, severity)
  select v_profile, full_name, 'Rechazó el pedido online ' || v_order.number, 'Ventas', 'edit'
    from wm.profiles where id = v_profile;
  return v_order;
end$function$;
revoke all on function wm.online_order_reject(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function wm.online_order_reject(uuid, text) to authenticated;

create or replace function wm.online_order_cancel(
  p_order_id uuid, p_reason text default null
)
returns wm.online_orders
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_profile uuid := wm.my_profile_id();
  v_order wm.online_orders;
  v_has_sales boolean;
begin
  if v_profile is null or not wm.has_module('Ventas', 2) then
    raise exception 'No autorizado para gestionar pedidos online';
  end if;
  select * into v_order from wm.online_orders where id = p_order_id for update;
  if not found or v_order.status <> 'aceptada' then
    raise exception 'Solo se puede cancelar un pedido aceptado';
  end if;
  update wm.online_order_items
     set released_at = pg_catalog.now()
   where order_id = p_order_id and sale_id is null and released_at is null;
  select exists (select 1 from wm.online_order_items
                  where order_id = p_order_id and sale_id is not null)
    into v_has_sales;
  update wm.online_orders
     set status = case when v_has_sales then 'completada' else 'cancelada' end,
         closed_by = v_profile, closed_at = pg_catalog.now(), close_reason = p_reason
   where id = p_order_id returning * into v_order;
  insert into wm.audit_log (user_id, who, action, module, severity)
  select v_profile, full_name, 'Canceló el pedido online ' || v_order.number, 'Ventas', 'edit'
    from wm.profiles where id = v_profile;
  return v_order;
end$function$;
revoke all on function wm.online_order_cancel(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function wm.online_order_cancel(uuid, text) to authenticated;

create or replace function wm.online_order_extend(
  p_order_id uuid, p_hours int default null
)
returns wm.online_orders
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_profile uuid := wm.my_profile_id();
  v_order wm.online_orders;
  v_hours int;
  v_candidate record;
  v_stock int;
  v_held int;
  v_branch_name text;
  v_branch_enabled boolean;
begin
  if v_profile is null or not wm.has_module('Ventas', 2) then
    raise exception 'No autorizado para gestionar pedidos online';
  end if;
  select * into v_order from wm.online_orders where id = p_order_id for update;
  if not found or v_order.status <> 'aceptada' then
    raise exception 'Solo se puede extender un pedido aceptado';
  end if;
  if p_hours is null then
    select firm_hold_hours into v_hours from wm.online_settings where id = 1;
  else
    v_hours := p_hours;
  end if;
  if v_hours is null or v_hours <= 0 then
    raise exception 'Las horas de extensión deben ser mayores que cero';
  end if;
  if v_order.firm_expires_at <= pg_catalog.now() then
    for v_candidate in
      select variant_id, branch_id, quantity, product_name
        from wm.online_order_items
       where order_id = p_order_id and sale_id is null and released_at is null
       order by variant_id, branch_id
    loop
      select name, online_enabled into v_branch_name, v_branch_enabled
        from wm.branches where id = v_candidate.branch_id;
      if v_branch_enabled is distinct from true then
        raise exception 'La sucursal % no está habilitada para pedidos online',
          coalesce(v_branch_name, v_candidate.branch_id::text);
      end if;
      select quantity into v_stock from wm.inventory
       where variant_id = v_candidate.variant_id and branch_id = v_candidate.branch_id
       for update;
      v_held := wm.online_held(v_candidate.variant_id, v_candidate.branch_id, p_order_id);
      if v_candidate.quantity > coalesce(v_stock, 0) - v_held then
        raise exception '«%» en %: pides %, hay %', v_candidate.product_name,
          v_branch_name, v_candidate.quantity, coalesce(v_stock, 0) - v_held;
      end if;
    end loop;
  end if;
  update wm.online_orders
     set firm_expires_at = greatest(firm_expires_at, pg_catalog.now())
                           + pg_catalog.make_interval(hours => v_hours)
   where id = p_order_id returning * into v_order;
  insert into wm.audit_log (user_id, who, action, module, severity)
  select v_profile, full_name, 'Extendió el pedido online ' || v_order.number, 'Ventas', 'edit'
    from wm.profiles where id = v_profile;
  return v_order;
end$function$;
revoke all on function wm.online_order_extend(uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function wm.online_order_extend(uuid, int) to authenticated;

notify pgrst, 'reload schema';
