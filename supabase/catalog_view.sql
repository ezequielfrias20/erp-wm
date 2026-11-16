-- Catálogo 3b: texto legado sincronizado con los maestros + vista de lectura del catálogo.
-- ADITIVA e idempotente. Spec: docs/superpowers/specs/2026-11-16-catalogo-3b-maestros-y-vista-design.md
--
-- Prueba (aplica dos veces + verifica + ROLLBACK):
--   scripts/catalogo/psql.sh -X -f supabase/tests/catalog_view_rollback.sql

-- ===== 1. Texto legado de variantes (color, color_hex, size) ===================
-- POS, factura y reportes todavía leen esas columnas de texto. Al renombrar un color, cambiar su
-- hex o renombrar una talla/opción, las variantes se actualizan en la misma transacción.
-- SECURITY DEFINER: quien edita maestros (permiso Inventario) puede no tener permiso de Productos;
-- la función sólo copia el nombre canónico a las variantes que apuntan a ese maestro.

create or replace function wm.sync_variant_color_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update wm.product_variants v
     set color = new.name,
         color_hex = new.hex
   where v.color_id = new.id
     and (v.color is distinct from new.name or v.color_hex is distinct from new.hex);
  return null;
end;
$$;

create or replace function wm.sync_variant_option_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update wm.product_variants v
     set size = new.label
   where v.option_value_id = new.id
     and v.size is distinct from new.label;
  return null;
end;
$$;

revoke all on function wm.sync_variant_color_text() from public, anon, authenticated;
revoke all on function wm.sync_variant_option_text() from public, anon, authenticated;

drop trigger if exists colors_sync_variant_text on wm.colors;
create trigger colors_sync_variant_text
  after update of name, hex on wm.colors
  for each row
  when (old.name is distinct from new.name or old.hex is distinct from new.hex)
  execute function wm.sync_variant_color_text();

drop trigger if exists option_values_sync_variant_text on wm.option_values;
create trigger option_values_sync_variant_text
  after update of label on wm.option_values
  for each row
  when (old.label is distinct from new.label)
  execute function wm.sync_variant_option_text();

-- ===== 2. Vista de lectura del catálogo (una fila por variante) ================
-- security_invoker: cada lector ve sólo lo que su RLS le permite. No se expone a anon.
-- La «foto principal» la decide el consumidor: aquí van las fotos del color y las generales.

create or replace view wm.v_catalog
with (security_invoker = true)
as
select
  p.id                    as product_id,
  p.name                  as product_name,
  p.slug                  as product_slug,
  p.description,
  p.specs,
  p.is_active             as product_is_active,
  p.visible_in_catalog,
  b.id                    as brand_id,
  b.name                  as brand_name,
  b.slug                  as brand_slug,
  l.id                    as line_id,
  l.name                  as line_name,
  l.slug                  as line_slug,
  coalesce(parent.id, c.id)     as department_id,
  coalesce(parent.name, c.name) as department_name,
  coalesce(parent.slug, c.slug) as department_slug,
  case when parent.id is not null then c.id end   as category_id,
  case when parent.id is not null then c.name end as category_name,
  case when parent.id is not null then c.slug end as category_slug,
  v.id                    as variant_id,
  v.sku,
  v.is_active             as variant_is_active,
  v.price,
  col.id                  as color_id,
  col.name                as color_name,
  col.slug                as color_slug,
  col.hex                 as color_hex,
  fam.name                as color_family,
  ot.code                 as option_type_code,
  ot.name                 as option_type_name,
  ov.id                   as option_value_id,
  ov.label                as option_label,
  ov.sort_order           as option_sort,
  coalesce(attrs.attributes, '[]'::jsonb)      as attributes,
  coalesce(cphotos.paths, '[]'::jsonb)         as color_photos,
  coalesce(gphotos.paths, '[]'::jsonb)         as general_photos,
  coalesce(stock.by_branch, '{}'::jsonb)       as stock_by_branch,
  coalesce(stock.total, 0)                     as stock_total
from wm.product_variants v
join wm.products p on p.id = v.product_id
left join wm.brands b on b.id = p.brand_id
left join wm.product_lines l on l.id = p.line_id
left join wm.categories c on c.id = p.category_id
left join wm.categories parent on parent.id = c.parent_id
left join wm.colors col on col.id = v.color_id
left join wm.color_families fam on fam.id = col.family_id
left join wm.option_values ov on ov.id = v.option_value_id
left join wm.option_types ot on ot.id = ov.option_type_id
left join lateral (
  select jsonb_agg(jsonb_build_object('attribute', a.name, 'code', a.code, 'values', vals.names)
                   order by a.sort_order, a.name) as attributes
  from (
    select av.attribute_id, jsonb_agg(av.name order by av.sort_order, av.name) as names
    from wm.product_attribute_values pav
    join wm.attribute_values av on av.id = pav.attribute_value_id
    where pav.product_id = p.id
    group by av.attribute_id
  ) vals
  join wm.attributes a on a.id = vals.attribute_id
) attrs on true
left join lateral (
  select jsonb_agg(m.path order by m.sort_order, m.id) as paths
  from wm.product_media m
  where m.product_id = p.id and v.color_id is not null and m.color_id = v.color_id
) cphotos on true
left join lateral (
  select jsonb_agg(m.path order by m.sort_order, m.id) as paths
  from wm.product_media m
  where m.product_id = p.id and m.color_id is null
) gphotos on true
left join lateral (
  select jsonb_object_agg(i.branch_id::text, i.quantity) as by_branch, sum(i.quantity)::int as total
  from wm.inventory i
  where i.variant_id = v.id
) stock on true;

revoke all on wm.v_catalog from public, anon;
grant select on wm.v_catalog to authenticated;
