-- Verificación de supabase/catalog_taxonomy.sql. Lanza excepción ante el primer faltante.
do $$
declare
  t text;
  c text;
  pol text;
  n int;
begin
  foreach t in array array[
    'option_types','option_values','color_families','product_lines','attributes',
    'attribute_values','category_attributes','product_attribute_values','product_media',
    'variant_sku_aliases','catalog_migration_log'
  ] loop
    if to_regclass('wm.' || t) is null then
      raise exception 'catalog_taxonomy: falta la tabla wm.%', t;
    end if;
    if not (select relrowsecurity from pg_class where oid = ('wm.' || t)::regclass) then
      raise exception 'catalog_taxonomy: falta RLS en wm.%', t;
    end if;
  end loop;

  foreach c in array array[
    'colors.slug','colors.family_id','colors.swatch_url','colors.is_active',
    'brands.slug','brands.logo_url','brands.description',
    'categories.parent_id','categories.option_type_id','categories.requires_color',
    'products.slug','products.line_id','products.specs',
    'product_variants.color_id','product_variants.option_value_id'
  ] loop
    if not exists (
      select 1 from pg_attribute a
      where a.attrelid = ('wm.' || split_part(c, '.', 1))::regclass
        and a.attname = split_part(c, '.', 2) and not a.attisdropped
    ) then
      raise exception 'catalog_taxonomy: falta la columna wm.%', c;
    end if;
  end loop;

  foreach pol in array array[
    'product_media.product_media_sel','product_media.product_media_ins',
    'option_values.option_values_upd','catalog_migration_log.catalog_migration_log_sel'
  ] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'wm' and tablename = split_part(pol, '.', 1)
        and policyname = split_part(pol, '.', 2)
    ) then
      raise exception 'catalog_taxonomy: falta la política %', pol;
    end if;
  end loop;

  select count(*) into n from wm.option_types where code in ('talla', 'amarre');
  if n <> 2 then raise exception 'catalog_taxonomy: faltan tipos de opción (hay %)', n; end if;

  select count(*) into n from wm.option_values v join wm.option_types t on t.id = v.option_type_id
  where t.code = 'talla';
  if n < 11 then raise exception 'catalog_taxonomy: faltan valores de talla (hay %)', n; end if;

  select count(*) into n from wm.option_values v join wm.option_types t on t.id = v.option_type_id
  where t.code = 'amarre';
  if n < 3 then raise exception 'catalog_taxonomy: faltan valores de amarre (hay %)', n; end if;

  select count(*) into n from wm.color_families;
  if n < 8 then raise exception 'catalog_taxonomy: faltan familias de color (hay %)', n; end if;

  raise notice 'catalog_taxonomy OK';
end$$;
