-- Limpieza del catálogo (plan 2). Aplica el JSON de `npm run catalogo:limpieza` en UNA
-- transacción que se verifica a sí misma. No se corre a mano: usar scripts/catalogo/aplicar.sh.
--
--   -v plan_path=<ruta absoluta del plan JSON>
--   -v commit=0|1            0 = simulación (ROLLBACK), 1 = aplicar (COMMIT)
--   -v backup_schema=<esquema de respaldo, p. ej. wm_respaldo_catalogo_20261116>
--
-- Los datos nunca se interpolan como texto SQL: el plan entra como un único literal jsonb y
-- todo lo demás sale de jsonb_to_recordset.
\set ON_ERROR_STOP on
\set plan `cat :'plan_path'`

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Nadie escribe catálogo, stock ni ventas mientras dura la transacción (son segundos).
lock table wm.products, wm.product_variants, wm.inventory, wm.sale_items, wm.purchase_order_items,
  wm.categories, wm.brands, wm.colors in share row exclusive mode;

create temp table _plan on commit drop as select :'plan'::jsonb as doc;

-- ===== 1. Guarda: el catálogo es el de la foto ====================================
do $$
declare
  g jsonb := (select doc->'guard' from _plan);
  np int := (select count(*) from wm.products);
  nv int := (select count(*) from wm.product_variants);
  mx timestamptz := greatest((select max(updated_at) from wm.products), (select max(updated_at) from wm.product_variants));
begin
  if np <> (g->>'products')::int or nv <> (g->>'variants')::int or mx <> (g->>'maxUpdatedAt')::timestamptz then
    raise exception 'El catálogo cambió después de la foto (productos %/%, variantes %/%, última edición %/%): toma otra foto y vuelve a generar el plan',
      np, g->>'products', nv, g->>'variants', mx, g->>'maxUpdatedAt';
  end if;
end$$;

-- ===== 2. Antes ======================================================================
create temp table _before_stock on commit drop as
  select branch_id, sum(quantity)::bigint as qty, sum(reserved)::bigint as res from wm.inventory group by branch_id;
create temp table _before on commit drop as select
  (select count(*) from wm.sale_items where variant_id is not null) as sale_lines,
  (select count(*) from wm.purchase_order_items where variant_id is not null) as purchase_lines,
  (select count(*) from wm.products) as products,
  (select count(*) from wm.product_variants) as variants;

-- ===== 3. Respaldo (se va con el ROLLBACK en simulación) ============================
create schema :"backup_schema";
create table :"backup_schema".products as table wm.products;
create table :"backup_schema".product_variants as table wm.product_variants;
create table :"backup_schema".inventory as table wm.inventory;
create table :"backup_schema".categories as table wm.categories;
create table :"backup_schema".brands as table wm.brands;
create table :"backup_schema".colors as table wm.colors;
create table :"backup_schema".sale_items as select id, variant_id from wm.sale_items;
create table :"backup_schema".purchase_order_items as select id, variant_id from wm.purchase_order_items;

-- ===== 4. El plan como tablas ========================================================
create temp table _run on commit drop as select (doc->>'runId')::uuid as id from _plan;
create temp table _dept on commit drop as
  select * from jsonb_to_recordset((select doc->'departments' from _plan))
    as x(name text, slug text, "sortOrder" int, "reuseId" uuid);
create temp table _cat on commit drop as
  select * from jsonb_to_recordset((select doc->'categories' from _plan))
    as x(name text, slug text, department text, "sortOrder" int, "reuseId" uuid,
         "optionType" text, "requiresColor" boolean, attributes jsonb);
create temp table _legacy_cat on commit drop as
  select value::uuid as id from jsonb_array_elements_text((select doc->'legacyCategoryIds' from _plan));
create temp table _attr on commit drop as
  select * from jsonb_to_recordset((select doc->'attributes' from _plan))
    as x(code text, name text, "isMulti" boolean, "sortOrder" int, "values" jsonb);
create temp table _optval on commit drop as
  select * from jsonb_to_recordset((select doc->'optionValues' from _plan))
    as x(type text, label text, slug text, "sortOrder" int);
create temp table _brand on commit drop as
  select * from jsonb_to_recordset((select doc->'brands' from _plan)) as x(name text, slug text, "reuseId" uuid);
create temp table _line on commit drop as
  select * from jsonb_to_recordset((select doc->'lines' from _plan)) as x(brand text, name text, slug text, "sortOrder" int);
create temp table _color on commit drop as
  select * from jsonb_to_recordset((select doc->'colors' from _plan))
    as x(name text, slug text, hex text, family text, "sortOrder" int, "reuseId" uuid);
create temp table _legacy_color on commit drop as
  select value::uuid as id from jsonb_array_elements_text((select doc->'legacyColorIds' from _plan));
create temp table _prod on commit drop as
  select * from jsonb_to_recordset((select doc->'products' from _plan))
    as x(id uuid, "mergeIds" jsonb, name text, slug text, description text, category text, brand text,
         line text, "isActive" boolean, attributes jsonb);
create temp table _merge_prod on commit drop as
  select p.id as into_id, m.value::uuid as id from _prod p, jsonb_array_elements_text(p."mergeIds") m;
create temp table _var on commit drop as
  select * from jsonb_to_recordset((select doc->'variants' from _plan))
    as x(id uuid, sku text, "productId" uuid, color text, option jsonb, "isActive" boolean, "mergeIntoId" uuid);
create temp table _vmerge on commit drop as
  select id, sku, "mergeIntoId" as into_id from _var where "mergeIntoId" is not null;
create temp table _media on commit drop as
  select * from jsonb_to_recordset((select doc->'media' from _plan))
    as x("productId" uuid, color text, path text, "sortOrder" int);

-- Toda variante y producto del plan existe (la guarda cuenta; esto confirma los ids).
do $$
begin
  if exists (select 1 from _var x where not exists (select 1 from wm.product_variants v where v.id = x.id))
     or exists (select 1 from _prod x where not exists (select 1 from wm.products p where p.id = x.id))
     or (select count(*) from _var) <> (select count(*) from wm.product_variants) then
    raise exception 'El plan no corresponde a las variantes/productos de la base';
  end if;
end$$;

-- ===== 5. Registro de lo viejo (para reconstruir reportes viejos) ===================
insert into wm.catalog_migration_log (run_id, entity, old_id, old_data)
select r.id, 'variant', v.id, jsonb_build_object(
  'sku', v.sku, 'product_id', p.id, 'product_name', p.name,
  'category_id', c.id, 'category_name', c.name, 'brand_id', b.id, 'brand_name', b.name,
  'color', v.color, 'color_hex', v.color_hex, 'size', v.size, 'is_active', v.is_active)
from _run r, wm.product_variants v
join wm.products p on p.id = v.product_id
left join wm.categories c on c.id = p.category_id
left join wm.brands b on b.id = p.brand_id;

insert into wm.catalog_migration_log (run_id, entity, old_id, old_data)
select r.id, 'product', p.id, to_jsonb(p) from _run r, wm.products p;

-- ===== 6. Maestros ====================================================================
-- Slugs viejos fuera: las filas se reutilizan o se borran, y el índice único es inmediato.
update wm.categories set slug = null where slug is not null;

update wm.categories c
   set name = d.name, slug = d.slug, sort_order = d."sortOrder", parent_id = null,
       option_type_id = null, requires_color = false, is_active = true
  from _dept d where c.id = d."reuseId";
insert into wm.categories (name, slug, sort_order, is_active)
select name, slug, "sortOrder", true from _dept where "reuseId" is null;

update wm.categories c
   set name = k.name, slug = k.slug, sort_order = k."sortOrder", parent_id = d.id,
       option_type_id = ot.id, requires_color = k."requiresColor", is_active = true
  from _cat k
  join wm.categories d on d.name = k.department and d.parent_id is null
  left join wm.option_types ot on ot.code = k."optionType"
 where c.id = k."reuseId";
insert into wm.categories (name, slug, sort_order, is_active, parent_id, option_type_id, requires_color)
select k.name, k.slug, k."sortOrder", true, d.id, ot.id, k."requiresColor"
  from _cat k
  join wm.categories d on d.name = k.department and d.parent_id is null
  left join wm.option_types ot on ot.code = k."optionType"
 where k."reuseId" is null;

insert into wm.attributes (code, name, is_multi, sort_order)
select code, name, "isMulti", "sortOrder" from _attr
on conflict (code) do update set name = excluded.name, is_multi = excluded.is_multi, sort_order = excluded.sort_order;
insert into wm.attribute_values (attribute_id, name, slug, sort_order)
select a.id, v.name, v.slug, v."sortOrder"
  from _attr x
  join wm.attributes a on a.code = x.code
  cross join jsonb_to_recordset(x."values") as v(name text, slug text, "sortOrder" int)
on conflict (attribute_id, slug) do update set name = excluded.name, sort_order = excluded.sort_order, is_active = true;

delete from wm.category_attributes ca using _cat k, wm.categories c
 where c.name = k.name and c.parent_id is not null and ca.category_id = c.id;
insert into wm.category_attributes (category_id, attribute_id, is_required, sort_order)
select c.id, a.id, ka.required, ka."sortOrder"
  from _cat k
  join wm.categories c on c.name = k.name and c.parent_id is not null
  cross join jsonb_to_recordset(k.attributes) as ka(code text, required boolean, "sortOrder" int)
  join wm.attributes a on a.code = ka.code;

insert into wm.option_values (option_type_id, label, slug, sort_order)
select ot.id, x.label, x.slug, x."sortOrder" from _optval x join wm.option_types ot on ot.code = x.type
on conflict (option_type_id, slug) do update set label = excluded.label, sort_order = excluded.sort_order, is_active = true;

update wm.brands b set name = x.name, slug = x.slug, is_active = true from _brand x where b.id = x."reuseId";
insert into wm.brands (name, slug, is_active) select name, slug, true from _brand where "reuseId" is null;

insert into wm.product_lines (brand_id, name, slug, sort_order)
select b.id, x.name, x.slug, x."sortOrder" from _line x join wm.brands b on b.name = x.brand
on conflict (brand_id, slug) do update set name = excluded.name, sort_order = excluded.sort_order, is_active = true;

-- Colores viejos (duplicados, con asterisco…) fuera antes de renombrar: nadie los referencia
-- todavía (color_id está vacío hasta el paso 9).
insert into wm.catalog_migration_log (run_id, entity, old_id, old_data)
select r.id, 'color', c.id, to_jsonb(c) from _run r, wm.colors c join _legacy_color l on l.id = c.id;
delete from wm.colors c using _legacy_color l
 where c.id = l.id
   and not exists (select 1 from wm.product_variants v where v.color_id = c.id)
   and not exists (select 1 from wm.product_media m where m.color_id = c.id);

update wm.colors c
   set name = x.name, slug = x.slug, hex = x.hex, family_id = f.id, sort_order = x."sortOrder", is_active = true
  from _color x left join wm.color_families f on f.name = x.family
 where c.id = x."reuseId";
insert into wm.colors (name, slug, hex, family_id, sort_order, is_active)
select x.name, x.slug, x.hex, f.id, x."sortOrder", true
  from _color x left join wm.color_families f on f.name = x.family
 where x."reuseId" is null;

-- ===== 7. Productos ===================================================================
update wm.product_variants v set product_id = x."productId"
  from _var x where v.id = x.id and v.product_id is distinct from x."productId";

update wm.products p
   set name = x.name, slug = x.slug, category_id = c.id, brand_id = b.id, line_id = l.id, is_active = x."isActive",
       description = coalesce(x.description, p.description)
  from _prod x
  left join wm.categories c on c.name = x.category and c.parent_id is not null
  left join wm.brands b on b.name = x.brand
  left join wm.product_lines l on l.brand_id = b.id and l.name = x.line
 where p.id = x.id;

delete from wm.product_attribute_values pav using _prod x where pav.product_id = x.id;
insert into wm.product_attribute_values (product_id, attribute_value_id)
select x.id, av.id
  from _prod x
  cross join jsonb_to_recordset(x.attributes) as a(code text, value text)
  join wm.attributes at on at.code = a.code
  join wm.attribute_values av on av.attribute_id = at.id and av.name = a.value
on conflict do nothing;

insert into wm.product_media (product_id, color_id, path, sort_order)
select m."productId", c.id, m.path, m."sortOrder" from _media m left join wm.colors c on c.name = m.color;

-- ===== 8. Variantes repetidas: sumar stock, re-apuntar, alias, borrar ================
-- Agregado por (sobreviviente, sucursal) ANTES del upsert: varias sobrantes pueden caer en la
-- misma fila y «on conflict do update» no puede tocar la misma fila dos veces.
insert into wm.inventory (variant_id, branch_id, quantity, reserved, min_stock)
select m.into_id, i.branch_id, sum(i.quantity), sum(i.reserved), max(i.min_stock)
  from wm.inventory i join _vmerge m on m.id = i.variant_id
 group by m.into_id, i.branch_id
on conflict (variant_id, branch_id) do update
   set quantity = wm.inventory.quantity + excluded.quantity,
       reserved = wm.inventory.reserved + excluded.reserved,
       min_stock = greatest(wm.inventory.min_stock, excluded.min_stock);

update wm.sale_items s set variant_id = m.into_id from _vmerge m where s.variant_id = m.id;
update wm.purchase_order_items s set variant_id = m.into_id from _vmerge m where s.variant_id = m.id;
insert into wm.variant_sku_aliases (sku, variant_id) select sku, into_id from _vmerge;

insert into wm.catalog_migration_log (run_id, entity, old_id, new_id, old_data)
select r.id, 'variant_merge', v.id, m.into_id, to_jsonb(v) || jsonb_build_object(
  'inventory', (select coalesce(jsonb_agg(to_jsonb(i)), '[]') from wm.inventory i where i.variant_id = v.id))
  from _run r, _vmerge m join wm.product_variants v on v.id = m.id;
delete from wm.product_variants v using _vmerge m where v.id = m.id;

-- ===== 9. Variantes: color, opción, estado y texto legado ============================
update wm.product_variants v
   set color_id = c.id, color = c.name, color_hex = c.hex,
       option_value_id = ov.id, size = ov.label, is_active = x."isActive"
  from _var x
  left join wm.colors c on c.name = x.color
  left join wm.option_types ot on ot.code = x.option->>'type'
  left join wm.option_values ov on ov.option_type_id = ot.id and ov.label = x.option->>'label'
 where v.id = x.id and x."mergeIntoId" is null;

-- ===== 10. Borrar lo que quedó vacío =================================================
insert into wm.catalog_migration_log (run_id, entity, old_id, new_id, old_data)
select r.id, 'product_merge', m.id, m.into_id, '{}'::jsonb from _run r, _merge_prod m;
delete from wm.products p using _merge_prod m
 where p.id = m.id and not exists (select 1 from wm.product_variants v where v.product_id = p.id);

insert into wm.catalog_migration_log (run_id, entity, old_id, old_data)
select r.id, 'category', c.id, to_jsonb(c) from _run r, wm.categories c join _legacy_cat l on l.id = c.id;
delete from wm.categories c using _legacy_cat l
 where c.id = l.id
   and not exists (select 1 from wm.products p where p.category_id = c.id)
   and not exists (select 1 from wm.categories k where k.parent_id = c.id);

-- ===== 11. Verificación ==============================================================
do $$
declare
  b record;
  n int;
  problems text[] := '{}';
begin
  -- Stock por sucursal y referencias del historial, iguales a antes.
  for b in
    select coalesce(o.branch_id, s.branch_id) as branch_id, o.qty as old_qty, s.qty as new_qty, o.res as old_res, s.res as new_res
      from _before_stock o
      full join (select branch_id, sum(quantity)::bigint qty, sum(reserved)::bigint res from wm.inventory group by branch_id) s
        on s.branch_id = o.branch_id
  loop
    if b.old_qty is distinct from b.new_qty or b.old_res is distinct from b.new_res then
      problems := problems || format('stock sucursal %s: %s→%s (reservado %s→%s)', b.branch_id, b.old_qty, b.new_qty, b.old_res, b.new_res);
    end if;
  end loop;
  if (select count(*) from wm.sale_items where variant_id is not null) <> (select sale_lines from _before) then
    problems := problems || 'líneas de venta con variante cambiaron';
  end if;
  if (select count(*) from wm.purchase_order_items where variant_id is not null) <> (select purchase_lines from _before) then
    problems := problems || 'líneas de compra con variante cambiaron';
  end if;
  if (select count(*) from wm.products) <> (select products from _before) - (select count(*) from _merge_prod) then
    problems := problems || 'quedaron productos fusionados sin borrar';
  end if;
  if (select count(*) from wm.product_variants) <> (select variants from _before) - (select count(*) from _vmerge) then
    problems := problems || 'el número de variantes no cuadra';
  end if;

  -- Todo lo que el plan nombra se resolvió contra los maestros.
  select count(*) into n from _var x join wm.product_variants v on v.id = x.id
   where (x.color is not null and v.color_id is null) or (x.option is not null and v.option_value_id is null);
  if n > 0 then problems := problems || format('%s variantes con color u opción sin resolver', n); end if;
  select count(*) into n from _prod x join wm.products p on p.id = x.id
   where (x.category is not null and p.category_id is null) or (x.brand is not null and p.brand_id is null)
      or (x.line is not null and p.line_id is null);
  if n > 0 then problems := problems || format('%s productos con categoría, marca o línea sin resolver', n); end if;
  select count(*) into n from _prod x join wm.products p on p.id = x.id
   where x.description is not null and p.description is distinct from x.description;
  if n > 0 then problems := problems || format('%s descripciones sin pasar al producto que queda', n); end if;
  select count(*) into n from _prod x cross join jsonb_array_elements(x.attributes) a;
  if n <> (select count(*) from wm.product_attribute_values) then
    problems := problems || format('atributos: plan %s, guardados %s', n, (select count(*) from wm.product_attribute_values));
  end if;
  if (select count(*) from wm.product_media) <> (select count(*) from _media) then
    problems := problems || 'fotos: no se guardaron todas';
  end if;

  -- Criterio de éxito.
  select count(*) into n from wm.products p left join wm.categories c on c.id = p.category_id
   where p.is_active and (c.id is null or c.parent_id is null or p.brand_id is null);
  if n > 0 then problems := problems || format('%s productos activos sin categoría de 2.º nivel o sin marca', n); end if;
  select count(*) into n from wm.products p
    join wm.category_attributes ca on ca.category_id = p.category_id and ca.is_required
   where p.is_active and not exists (
     select 1 from wm.product_attribute_values pav join wm.attribute_values av on av.id = pav.attribute_value_id
      where pav.product_id = p.id and av.attribute_id = ca.attribute_id);
  if n > 0 then problems := problems || format('%s atributos obligatorios vacíos en productos activos', n); end if;
  select count(*) into n from wm.product_variants v
    join wm.products p on p.id = v.product_id
    join wm.categories c on c.id = p.category_id
    left join wm.option_values ov on ov.id = v.option_value_id
   where v.is_active and p.is_active
     and ((c.requires_color and v.color_id is null)
       or (c.option_type_id is not null and (ov.id is null or ov.option_type_id <> c.option_type_id)));
  if n > 0 then problems := problems || format('%s variantes activas sin color u opción que exige su categoría', n); end if;
  select count(*) into n from (
    select 1 from wm.product_variants group by product_id, color_id, option_value_id having count(*) > 1) d;
  if n > 0 then problems := problems || format('%s grupos de variantes repetidas', n); end if;
  select count(*) into n from (select 1 from wm.colors group by lower(name) having count(*) > 1) d;
  if n > 0 then problems := problems || format('%s colores repetidos', n); end if;

  if array_length(problems, 1) > 0 then
    raise exception 'La verificación falló: %', array_to_string(problems, ' | ');
  end if;

  raise notice 'Verificación OK. Productos % → %, variantes % → % (% fusionadas, % alias), fotos %, categorías %, colores %, atributos guardados %',
    (select products from _before), (select count(*) from wm.products),
    (select variants from _before), (select count(*) from wm.product_variants),
    (select count(*) from _vmerge), (select count(*) from wm.variant_sku_aliases),
    (select count(*) from wm.product_media), (select count(*) from wm.categories), (select count(*) from wm.colors),
    (select count(*) from wm.product_attribute_values);
end$$;

\if :commit
commit;
\echo 'APLICADO (COMMIT).'
\else
rollback;
\echo 'SIMULACIÓN: todo se deshizo (ROLLBACK).'
\endif
