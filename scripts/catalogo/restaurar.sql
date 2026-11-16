-- Deshace una limpieza del catálogo ya aplicada, desde su esquema de respaldo y su registro.
-- Es sólo el CUERPO (sin begin/commit): lo envuelven scripts/catalogo/restaurar.sh (real) y
-- aplicar.sql con -v ensayo=1 (ensayo dentro de la simulación).
--
--   -v backup_schema=wm_respaldo_catalogo_<AAAAMMDD>
--   -v run_id=<runId del plan>
--
-- Qué conserva: ventas, compras y movimientos de stock hechos DESPUÉS de la limpieza. El stock
-- de una variante fusionada vuelve a ella y se descuenta de la que la absorbió; las líneas de
-- venta que apuntaban a la fusionada antes de la limpieza vuelven a ella; las nuevas se quedan.
-- Qué no hace: si se crearon productos o variantes después de la limpieza, aborta (habría que
-- decidir a mano qué hacer con ellos). Supone que product_media, product_attribute_values,
-- category_attributes, attributes y product_lines sólo tienen lo que puso la limpieza (el ERP
-- todavía no los escribe: plan 3).

-- ===== R0. Respaldo y corrida =========================================================
create temp table _b_products on commit drop as table :"backup_schema".products;
create temp table _b_variants on commit drop as table :"backup_schema".product_variants;
create temp table _b_inventory on commit drop as table :"backup_schema".inventory;
create temp table _b_categories on commit drop as table :"backup_schema".categories;
create temp table _b_brands on commit drop as table :"backup_schema".brands;
create temp table _b_colors on commit drop as table :"backup_schema".colors;
create temp table _b_sale_items on commit drop as table :"backup_schema".sale_items;
create temp table _b_purchase_items on commit drop as table :"backup_schema".purchase_order_items;
create temp table _r on commit drop as
  select :'run_id'::uuid as run_id,
         (select min(created_at) from wm.catalog_migration_log where run_id = :'run_id'::uuid) as at;

-- Fusiones de la corrida: SKU viejo → variante que lo absorbió.
create temp table _r_merge on commit drop as
  select b.id as old_id, a.variant_id as into_id
    from wm.variant_sku_aliases a join _b_variants b on b.sku = a.sku
   where a.created_at = (select at from _r);

do $$
begin
  if (select at from _r) is null then
    raise exception 'No hay registro de la corrida % en catalog_migration_log', (select run_id from _r);
  end if;
  if exists (select 1 from wm.products p where not exists (select 1 from _b_products b where b.id = p.id))
     or exists (select 1 from wm.product_variants v where not exists (select 1 from _b_variants b where b.id = v.id)) then
    raise exception 'Hay productos o variantes creados después de la limpieza: resolverlos a mano antes de restaurar';
  end if;
end$$;

create temp table _r_before on commit drop as select
  (select count(*) from wm.sale_items where variant_id is not null) as sale_lines,
  (select count(*) from wm.purchase_order_items where variant_id is not null) as purchase_lines;
create temp table _r_before_stock on commit drop as
  select branch_id, sum(quantity)::bigint as qty, sum(reserved)::bigint as res from wm.inventory group by branch_id;

-- ===== R1. Soltar lo nuevo que referencia maestros nuevos ============================
update wm.product_variants set color_id = null, option_value_id = null
 where color_id is not null or option_value_id is not null;
delete from wm.product_media;
delete from wm.product_attribute_values;
update wm.products set line_id = null where line_id is not null;

-- Nombres y slugs nuevos fuera del camino (se borran al final) para que los viejos vuelvan
-- sin chocar con los índices únicos.
update wm.categories c set name = c.name || ' ~' || c.id, slug = null
 where not exists (select 1 from _b_categories b where b.id = c.id);
update wm.categories c set slug = null where slug is not null;
update wm.brands x set name = x.name || ' ~' || x.id, slug = null
 where not exists (select 1 from _b_brands b where b.id = x.id);
update wm.colors x set name = x.name || ' ~' || x.id, slug = null
 where not exists (select 1 from _b_colors b where b.id = x.id);

-- ===== R2. Maestros como estaban ======================================================
insert into wm.categories select b.* from _b_categories b
 where not exists (select 1 from wm.categories c where c.id = b.id);
update wm.categories c
   set name = b.name, slug = b.slug, color = b.color, sort_order = b.sort_order, is_active = b.is_active,
       parent_id = b.parent_id, option_type_id = b.option_type_id, requires_color = b.requires_color
  from _b_categories b where c.id = b.id;

update wm.brands x
   set name = b.name, slug = b.slug, logo_url = b.logo_url, description = b.description, is_active = b.is_active
  from _b_brands b where x.id = b.id;

insert into wm.colors select b.* from _b_colors b
 where not exists (select 1 from wm.colors c where c.id = b.id);
update wm.colors x
   set name = b.name, slug = b.slug, hex = b.hex, family_id = b.family_id, swatch_url = b.swatch_url,
       sort_order = b.sort_order, is_active = b.is_active
  from _b_colors b where x.id = b.id;

-- ===== R3. Productos y variantes ======================================================
insert into wm.products select b.* from _b_products b
 where not exists (select 1 from wm.products p where p.id = b.id);
update wm.products p
   set name = b.name, slug = b.slug, description = b.description, category_id = b.category_id,
       brand_id = b.brand_id, line_id = b.line_id, is_active = b.is_active
  from _b_products b where p.id = b.id;

insert into wm.product_variants select b.* from _b_variants b
 where not exists (select 1 from wm.product_variants v where v.id = b.id);
update wm.product_variants v
   set product_id = b.product_id, color = b.color, color_hex = b.color_hex, size = b.size,
       color_id = b.color_id, option_value_id = b.option_value_id, is_active = b.is_active
  from _b_variants b where v.id = b.id;

-- ===== R4. Stock de las fusionadas: vuelve a ellas y se descuenta de quien lo absorbió ===
update wm.inventory i
   set quantity = i.quantity - x.qty, reserved = i.reserved - x.res
  from (select m.into_id, bi.branch_id, sum(bi.quantity) as qty, sum(bi.reserved) as res
          from _b_inventory bi join _r_merge m on m.old_id = bi.variant_id
         group by m.into_id, bi.branch_id) x
 where i.variant_id = x.into_id and i.branch_id = x.branch_id;
insert into wm.inventory (id, variant_id, branch_id, quantity, reserved, min_stock, updated_at)
select bi.id, bi.variant_id, bi.branch_id, bi.quantity, bi.reserved, bi.min_stock, bi.updated_at
  from _b_inventory bi join _r_merge m on m.old_id = bi.variant_id;
-- min_stock de las que absorbieron, como estaba; filas que creó la fusión y quedaron en cero, fuera.
update wm.inventory i set min_stock = bi.min_stock
  from _b_inventory bi where bi.id = i.id and i.variant_id in (select into_id from _r_merge);
delete from wm.inventory i
 where i.variant_id in (select into_id from _r_merge)
   and not exists (select 1 from _b_inventory bi where bi.variant_id = i.variant_id and bi.branch_id = i.branch_id)
   and i.quantity = 0 and i.reserved = 0;

-- ===== R5. Historial: lo que apuntaba a una fusionada vuelve a ella ===================
update wm.sale_items s set variant_id = b.variant_id
  from _b_sale_items b join _r_merge m on m.old_id = b.variant_id
 where s.id = b.id and s.variant_id = m.into_id;
update wm.purchase_order_items s set variant_id = b.variant_id
  from _b_purchase_items b join _r_merge m on m.old_id = b.variant_id
 where s.id = b.id and s.variant_id = m.into_id;

-- ===== R6. Borrar lo que creó la limpieza ============================================
delete from wm.variant_sku_aliases where created_at = (select at from _r);
delete from wm.product_lines where created_at = (select at from _r);
delete from wm.category_attributes;
delete from wm.attributes;  -- attribute_values en cascada
delete from wm.categories c
 where not exists (select 1 from _b_categories b where b.id = c.id) and c.parent_id is not null;
delete from wm.categories c where not exists (select 1 from _b_categories b where b.id = c.id);
delete from wm.brands x where not exists (select 1 from _b_brands b where b.id = x.id);
delete from wm.colors x where not exists (select 1 from _b_colors b where b.id = x.id);

insert into wm.catalog_migration_log (run_id, entity, old_data)
select run_id, 'restore', jsonb_build_object('backup_schema', :'backup_schema') from _r;

-- ===== R7. Verificación ===============================================================
do $$
declare
  n int;
  problems text[] := '{}';
begin
  -- El total por sucursal no cambia al restaurar (sólo se mueve entre variantes).
  select count(*) into n from _r_before_stock o
    full join (select branch_id, sum(quantity)::bigint qty, sum(reserved)::bigint res from wm.inventory group by branch_id) s
      on s.branch_id = o.branch_id
   where o.qty is distinct from s.qty or o.res is distinct from s.res;
  if n > 0 then problems := problems || format('stock por sucursal cambió en %s sucursales', n); end if;
  if (select count(*) from wm.sale_items where variant_id is not null) <> (select sale_lines from _r_before) then
    problems := problems || 'líneas de venta con variante cambiaron';
  end if;
  if (select count(*) from wm.purchase_order_items where variant_id is not null) <> (select purchase_lines from _r_before) then
    problems := problems || 'líneas de compra con variante cambiaron';
  end if;

  -- Cada fila de stock de una variante fusionada volvió (el total por sucursal no lo detecta).
  select count(*) into n from _b_inventory bi join _r_merge m on m.old_id = bi.variant_id
   where not exists (select 1 from wm.inventory i where i.id = bi.id and i.variant_id = bi.variant_id);
  if n > 0 then problems := problems || format('%s filas de stock de variantes fusionadas no volvieron', n); end if;

  -- Catálogo igual al respaldo en todo lo que tocó la limpieza.
  select count(*) into n from (
    (select id, name, slug, description, category_id, brand_id, line_id, is_active from wm.products
     except select id, name, slug, description, category_id, brand_id, line_id, is_active from _b_products)
    union all
    (select id, name, slug, description, category_id, brand_id, line_id, is_active from _b_products
     except select id, name, slug, description, category_id, brand_id, line_id, is_active from wm.products)) d;
  if n > 0 then problems := problems || format('%s productos distintos del respaldo', n); end if;
  select count(*) into n from (
    (select id, product_id, sku, color, color_hex, size, color_id, option_value_id, is_active from wm.product_variants
     except select id, product_id, sku, color, color_hex, size, color_id, option_value_id, is_active from _b_variants)
    union all
    (select id, product_id, sku, color, color_hex, size, color_id, option_value_id, is_active from _b_variants
     except select id, product_id, sku, color, color_hex, size, color_id, option_value_id, is_active from wm.product_variants)) d;
  if n > 0 then problems := problems || format('%s variantes distintas del respaldo', n); end if;
  select count(*) into n from (
    (select id, name, slug, sort_order, is_active, parent_id, option_type_id, requires_color from wm.categories
     except select id, name, slug, sort_order, is_active, parent_id, option_type_id, requires_color from _b_categories)
    union all
    (select id, name, slug, sort_order, is_active, parent_id, option_type_id, requires_color from _b_categories
     except select id, name, slug, sort_order, is_active, parent_id, option_type_id, requires_color from wm.categories)) d;
  if n > 0 then problems := problems || format('%s categorías distintas del respaldo', n); end if;
  select count(*) into n from (
    (select id, name, slug, is_active from wm.brands except select id, name, slug, is_active from _b_brands)
    union all
    (select id, name, slug, is_active from _b_brands except select id, name, slug, is_active from wm.brands)) d;
  if n > 0 then problems := problems || format('%s marcas distintas del respaldo', n); end if;
  select count(*) into n from (
    (select id, name, slug, hex, family_id, is_active from wm.colors except select id, name, slug, hex, family_id, is_active from _b_colors)
    union all
    (select id, name, slug, hex, family_id, is_active from _b_colors except select id, name, slug, hex, family_id, is_active from wm.colors)) d;
  if n > 0 then problems := problems || format('%s colores distintos del respaldo', n); end if;
  if exists (select 1 from wm.variant_sku_aliases where created_at = (select at from _r))
     or exists (select 1 from wm.product_media) or exists (select 1 from wm.attributes) then
    problems := problems || 'quedaron alias, fotos o atributos de la limpieza';
  end if;

  if array_length(problems, 1) > 0 then
    raise exception 'La restauración no cuadra: %', array_to_string(problems, ' | ');
  end if;
  raise notice 'Restauración OK: catálogo igual al respaldo; stock por sucursal y líneas de venta/compra intactos.';
end$$;
