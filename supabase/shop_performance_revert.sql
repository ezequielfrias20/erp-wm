-- Reversión de shop_performance.sql: definiciones anteriores de las tres vistas.
-- Aplicar: psql -X -1 -v ON_ERROR_STOP=1 -c "set lock_timeout = '5s'" -f supabase/shop_performance_revert.sql

create or replace view shop.availability as
select i.variant_id, i.branch_id,
       least(i.quantity - coalesce(h.held, 0), os.display_stock_cap)::int as available
from wm.inventory i
join wm.branches b on b.id = i.branch_id and b.is_active and b.online_enabled
join wm.product_variants v on v.id = i.variant_id and v.is_active and v.price > 0
join wm.v_published_shop_products pub on pub.product_id = v.product_id
cross join wm.online_settings os
left join lateral (
  select sum(oi.quantity)::int as held
  from wm.online_order_items oi
  join wm.online_orders oo on oo.id = oi.order_id
  where oi.variant_id = i.variant_id and oi.branch_id = i.branch_id
    and oi.sale_id is null and oi.released_at is null
    and ((oo.status = 'solicitada' and oo.soft_expires_at > now())
      or (oo.status = 'aceptada' and oo.firm_expires_at > now()))
) h on true
where i.quantity - coalesce(h.held, 0) > 0;

create or replace view shop.products as
select p.id as product_id, p.slug, p.name, p.description, p.specs,
       b.id as brand_id, b.name as brand_name, b.slug as brand_slug,
       ln.id as line_id, ln.name as line_name, ln.slug as line_slug,
       d.id as department_id, d.name as department_name, d.slug as department_slug,
       c.id as category_id, c.name as category_name, c.slug as category_slug,
       ot.code as option_type_code, ot.name as option_type_name,
       coalesce(attrs.attributes, '[]'::jsonb) as attributes,
       coalesce(general.photos, '[]'::jsonb) as general_photos,
       coalesce(general.first_path, color_main.path) as main_photo,
       prices.price_min, prices.price_max,
       exists (select 1 from shop.availability a
               join wm.product_variants v on v.id = a.variant_id
               where v.product_id = p.id) as in_stock,
       p.updated_at
from wm.products p
join wm.v_published_shop_products pub on pub.product_id = p.id
join wm.brands b on b.id = p.brand_id
join wm.categories c on c.id = p.category_id
join wm.categories d on d.id = c.parent_id
left join wm.product_lines ln on ln.id = p.line_id
left join wm.option_types ot on ot.id = c.option_type_id
cross join lateral (
  select min(v.price) as price_min, max(v.price) as price_max
  from wm.product_variants v
  where v.product_id = p.id and v.is_active and v.price > 0
) prices
left join lateral (
  select jsonb_agg(jsonb_build_object('code', a.code, 'attribute', a.name,
           'values', val.names) order by a.sort_order, a.name, a.id) as attributes
  from (select av.attribute_id,
               jsonb_agg(av.name order by av.sort_order, av.name, av.id) as names
        from wm.product_attribute_values pav
        join wm.attribute_values av on av.id = pav.attribute_value_id
        where pav.product_id = p.id group by av.attribute_id) val
  join wm.attributes a on a.id = val.attribute_id
) attrs on true
left join lateral (
  select jsonb_agg(m.path order by m.sort_order, m.id) as photos,
         (array_agg(m.path order by m.sort_order, m.id))[1] as first_path
  from wm.product_media m where m.product_id = p.id and m.color_id is null
) general on true
left join lateral (
  select m.path from wm.product_media m
  join wm.colors col on col.id = m.color_id
  where m.product_id = p.id
    and exists (select 1 from wm.product_variants v
                where v.product_id = p.id and v.is_active and v.color_id = col.id)
  order by pg_catalog.lower(col.name), col.id,
           m.sort_order, m.id limit 1
) color_main on true;

create or replace view shop.variants as
select v.id as variant_id, v.product_id, v.sku, v.price,
       c.id as color_id, c.name as color_name, c.slug as color_slug, c.hex as color_hex,
       f.name as color_family_name, f.slug as color_family_slug,
       c.sort_order as color_sort,
       ov.id as option_value_id, ov.label as option_label, ov.slug as option_slug,
       ov.sort_order as option_sort,
       coalesce(photos.paths, '[]'::jsonb) as color_photos,
       coalesce((select sum(a.available)::int from shop.availability a
                 where a.variant_id = v.id), 0) as available_total
from wm.product_variants v
join wm.v_published_shop_products pub on pub.product_id = v.product_id
left join wm.colors c on c.id = v.color_id
left join wm.color_families f on f.id = c.family_id
left join wm.option_values ov on ov.id = v.option_value_id
left join lateral (
  select jsonb_agg(m.path order by m.sort_order, m.id) as paths
  from wm.product_media m where m.product_id = v.product_id and m.color_id = v.color_id
    and v.color_id is not null
) photos on true
where v.is_active and v.price > 0;
