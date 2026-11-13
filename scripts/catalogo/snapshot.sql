-- Foto del catálogo de producción en un solo JSON (una sola sentencia = una sola foto consistente).
-- La corre scripts/catalogo/snapshot.sh en una transacción de solo lectura.
select json_build_object(
  'taken_at', now(),
  'branches', (
    select coalesce(json_agg(json_build_object('id', b.id, 'name', b.name) order by b.name), '[]'::json)
    from wm.branches b),
  'categories', (
    select coalesce(json_agg(json_build_object('id', c.id, 'name', c.name) order by c.name), '[]'::json)
    from wm.categories c),
  'brands', (
    select coalesce(json_agg(json_build_object('id', b.id, 'name', b.name) order by b.name), '[]'::json)
    from wm.brands b),
  'colors', (
    select coalesce(json_agg(json_build_object('id', c.id, 'name', c.name, 'hex', c.hex) order by c.name), '[]'::json)
    from wm.colors c),
  'products', (
    select coalesce(json_agg(json_build_object(
      'id', p.id,
      'name', p.name,
      'description', p.description,
      'category_id', p.category_id,
      'brand_id', p.brand_id,
      'is_active', p.is_active,
      'visible_in_catalog', p.visible_in_catalog,
      'has_image', exists(
        select 1 from storage.objects o
        where o.bucket_id = 'wm-public' and o.name = 'product-images/' || p.id || '.png'),
      'created_at', p.created_at,
      'updated_at', p.updated_at
    ) order by p.name, p.id), '[]'::json)
    from wm.products p),
  'variants', (
    select coalesce(json_agg(json_build_object(
      'id', v.id,
      'product_id', v.product_id,
      'sku', v.sku,
      'color', v.color,
      'color_hex', v.color_hex,
      'size', v.size,
      'price', v.price,
      'cost', v.cost,
      'is_active', v.is_active,
      'stock', coalesce(
        (select json_object_agg(i.branch_id, i.quantity) from wm.inventory i where i.variant_id = v.id),
        '{}'::json),
      'sale_lines', (select count(*) from wm.sale_items si where si.variant_id = v.id),
      'created_at', v.created_at,
      'updated_at', v.updated_at
    ) order by v.sku), '[]'::json)
    from wm.product_variants v)
);
