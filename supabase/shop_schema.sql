-- Public, read-only storefront contract. Run as postgres after online_orders.sql.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'storefront') then
    create role storefront login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end $$;
alter role storefront set statement_timeout = '5s';
alter role storefront connection limit 20;

create schema if not exists shop authorization postgres;
alter schema shop owner to postgres;
revoke all on schema shop from public, anon, authenticated;
grant usage on schema shop to storefront;

-- The required readiness checks mirror lib/catalog/readiness.ts; photos are
-- recommended only. This owner-owned view needs no wm grant to storefront.
create or replace view wm.v_product_shop_ready as
select p.id as product_id,
  case when not p.is_active then true else
    c.parent_id is not null
    and p.brand_id is not null
    and nullif(pg_catalog.btrim(p.description, E' \t\n\r\f'), '') is not null
    and not exists (
      select 1 from wm.category_attributes ca
      where ca.category_id = p.category_id and ca.is_required
        and not exists (
          select 1 from wm.product_attribute_values pav
          join wm.attribute_values av on av.id = pav.attribute_value_id
          where pav.product_id = p.id and av.attribute_id = ca.attribute_id
        )
    )
    and not exists (
      select 1 from wm.product_variants v
      left join wm.option_values ov on ov.id = v.option_value_id
      where v.product_id = p.id and v.is_active
        and (v.price <= 0
          or (c.requires_color and v.color_id is null)
          or (c.option_type_id is not null
              and (v.option_value_id is null or ov.option_type_id is distinct from c.option_type_id)))
    )
  end as ready
from wm.products p
left join wm.categories c on c.id = p.category_id;
revoke all on wm.v_product_shop_ready from public, anon, authenticated, storefront;

create or replace function wm.product_is_shop_ready(p_product_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select r.ready from wm.v_product_shop_ready r
                   where r.product_id = p_product_id), false);
$$;
revoke all on function wm.product_is_shop_ready(uuid) from public, anon, authenticated, storefront;

create or replace view wm.v_published_shop_products as
select p.id as product_id
from wm.products p
join wm.v_product_shop_ready r on r.product_id = p.id and r.ready
join wm.categories c on c.id = p.category_id and c.is_active
join wm.categories d on d.id = c.parent_id and d.is_active
join wm.brands b on b.id = p.brand_id and b.is_active
where p.is_active and p.visible_in_catalog and p.slug is not null
  and exists (select 1 from wm.product_variants v
              where v.product_id = p.id and v.is_active and v.price > 0);
revoke all on wm.v_published_shop_products from public, anon, authenticated, storefront;

create or replace view shop.store_settings as
select s.company_name, s.logo_url, s.logo_dark_url, s.favicon_url,
       s.primary_color, s.accent_color, o.store_whatsapp,
       o.soft_hold_minutes, o.max_units_per_line, o.max_units_per_order,
       o.max_lines, o.max_open_per_phone, o.display_stock_cap
from wm.settings s cross join wm.online_settings o;

create or replace view shop.branches as
select b.id as branch_id, b.code, b.name, b.city, b.address, b.phone
from wm.branches b where b.is_active and b.online_enabled;

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

create or replace view shop.categories as
with counts as (
  select p.category_id, count(*)::int as product_count
  from wm.products p join wm.v_published_shop_products pub on pub.product_id = p.id
  group by p.category_id
), nodes as (
  select c.id as category_id, c.parent_id, 2 as level, c.name, c.slug,
         c.sort_order, n.product_count
  from counts n join wm.categories c on c.id = n.category_id
  union all
  select d.id, d.parent_id, 1, d.name, d.slug, d.sort_order,
         sum(n.product_count)::int
  from counts n join wm.categories c on c.id = n.category_id
  join wm.categories d on d.id = c.parent_id
  group by d.id, d.parent_id, d.name, d.slug, d.sort_order
)
select category_id, parent_id, level, name, slug, sort_order, product_count from nodes;

create or replace view shop.brands as
select b.id as brand_id, b.name, b.slug, b.logo_url, b.description,
       coalesce((select jsonb_agg(jsonb_build_object('line_id', ln.id,
                         'name', ln.name, 'slug', ln.slug) order by ln.sort_order, ln.name, ln.id)
                 from wm.product_lines ln
                 where ln.brand_id = b.id
                   and exists (select 1 from wm.products p
                               join wm.v_published_shop_products pub on pub.product_id = p.id
                               where p.line_id = ln.id)), '[]'::jsonb) as lines,
       count(*)::int as product_count
from wm.brands b
join wm.products p on p.brand_id = b.id
join wm.v_published_shop_products pub on pub.product_id = p.id
group by b.id, b.name, b.slug, b.logo_url, b.description;

create or replace view shop.color_families as
select distinct f.id as family_id, f.name, f.slug, f.hex, f.sort_order
from wm.color_families f
join wm.colors c on c.family_id = f.id and c.is_active
join wm.product_variants v on v.color_id = c.id and v.is_active and v.price > 0
join wm.v_published_shop_products pub on pub.product_id = v.product_id;

create or replace view shop.option_values as
select distinct ot.code as option_type_code, ot.name as option_type_name,
       ov.id as option_value_id, ov.label, ov.slug, ov.sort_order
from wm.option_values ov
join wm.option_types ot on ot.id = ov.option_type_id
join wm.product_variants v on v.option_value_id = ov.id and v.is_active and v.price > 0
join wm.v_published_shop_products pub on pub.product_id = v.product_id
where ov.is_active;

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

revoke all on all tables in schema shop from public, anon, authenticated;
grant select on all tables in schema shop to storefront;
