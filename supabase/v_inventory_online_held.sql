-- Mantener las columnas existentes de wm.v_inventory en su orden; agregar online_held al final.
create or replace view wm.v_inventory with (security_invoker = true) as
select i.id,
    i.variant_id,
    i.branch_id,
    i.quantity,
    i.reserved,
    i.min_stock,
    pv.sku,
    pv.color,
    pv.color_hex,
    pv.size,
    pv.price,
    pv.cost,
    p.id as product_id,
    p.name as product_name,
    c.name as category,
    c.color as category_color,
    br.name as brand,
    b.city as branch_city,
    b.code as branch_code,
    case
      when i.quantity = 0 then 'Agotado'::text
      when i.quantity < i.min_stock then 'Stock bajo'::text
      else 'En stock'::text
    end as estado,
    i.quantity::numeric * pv.cost as stock_value,
    coalesce(holds.online_held, 0)::int as online_held
from wm.inventory i
join wm.product_variants pv on pv.id = i.variant_id
join wm.products p on p.id = pv.product_id
left join wm.categories c on c.id = p.category_id
left join wm.brands br on br.id = p.brand_id
join wm.branches b on b.id = i.branch_id
left join lateral (
  select coalesce(sum(h.held), 0)::int as online_held
  from wm.online_holds h
  where h.variant_id = i.variant_id and h.branch_id = i.branch_id
) holds on true;

grant all on wm.v_inventory to postgres, authenticated, service_role;
notify pgrst, 'reload schema';
