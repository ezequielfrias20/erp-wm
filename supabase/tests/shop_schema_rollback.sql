-- Run from repository root against a local Supabase copy; all fixture changes roll back.
\set ON_ERROR_STOP 1
begin;

-- R1: sequence values do not roll back, so use test defaults before inserts.
alter table wm.sales alter column invoice_number
  set default ('TEST-' || gen_random_uuid()::text);
do $$ begin
  if pg_catalog.to_regclass('wm.online_orders') is not null then
    execute 'alter table wm.online_orders alter column number set default (''TEST-'' || gen_random_uuid()::text)';
  end if;
end $$;
\i supabase/online_orders.sql
alter table wm.online_orders alter column number
  set default ('TEST-' || gen_random_uuid()::text);
\i supabase/online_orders.sql
\i supabase/shop_schema.sql
\i supabase/shop_schema.sql

create temporary table shop_test_ids (name text primary key, id uuid not null);

do $$
declare
  v_tag text := pg_catalog.replace(gen_random_uuid()::text, '-', '');
  v_parent uuid;
  v_category uuid;
  v_required_category uuid;
  v_color_category uuid;
  v_option_category uuid;
  v_brand uuid;
  v_red uuid;
  v_blue uuid;
  v_type uuid;
  v_other_type uuid;
  v_wrong_option uuid;
  v_attribute uuid;
  v_branch uuid;
  v_off_branch uuid;
  v_product uuid;
  v_variant uuid;
  v_case text;
  v_expected boolean;
begin
  insert into wm.categories (name, slug) values ('T4 dept ' || v_tag, 't4-dept-' || v_tag)
    returning id into v_parent;
  insert into wm.categories (name, slug, parent_id)
    values ('T4 cat ' || v_tag, 't4-cat-' || v_tag, v_parent)
    returning id into v_category;
  insert into wm.brands (name, slug) values ('T4 brand ' || v_tag, 't4-brand-' || v_tag)
    returning id into v_brand;
  insert into wm.colors (name, slug, sort_order)
    values ('T4 red ' || v_tag, 't4-red-' || v_tag, 1) returning id into v_red;
  insert into wm.colors (name, slug, sort_order)
    values ('T4 blue ' || v_tag, 't4-blue-' || v_tag, 2) returning id into v_blue;
  insert into wm.option_types (code, name) values ('t4-size-' || v_tag, 'T4 size')
    returning id into v_type;
  insert into wm.option_types (code, name) values ('t4-other-' || v_tag, 'T4 other')
    returning id into v_other_type;
  insert into wm.option_values (option_type_id, label, slug)
    values (v_other_type, 'Wrong', 't4-wrong-' || v_tag) returning id into v_wrong_option;
  insert into wm.categories (name, slug, parent_id, option_type_id)
    values ('T4 option cat ' || v_tag, 't4-option-' || v_tag, v_parent, v_type)
    returning id into v_option_category;
  insert into wm.categories (name, slug, parent_id, requires_color)
    values ('T4 color cat ' || v_tag, 't4-color-' || v_tag, v_parent, true)
    returning id into v_color_category;
  insert into wm.categories (name, slug, parent_id)
    values ('T4 required cat ' || v_tag, 't4-required-' || v_tag, v_parent)
    returning id into v_required_category;
  insert into wm.attributes (code, name) values ('t4-attr-' || v_tag, 'T4 attribute')
    returning id into v_attribute;
  insert into wm.category_attributes (category_id, attribute_id, is_required)
    values (v_required_category, v_attribute, true);
  insert into wm.branches (code, city, name, online_enabled)
    values ('T4A-' || v_tag, 'Prueba', 'T4 online', true) returning id into v_branch;
  insert into wm.branches (code, city, name, online_enabled)
    values ('T4B-' || v_tag, 'Prueba', 'T4 offline', false) returning id into v_off_branch;
  insert into pg_temp.shop_test_ids values ('branch', v_branch), ('off_branch', v_off_branch),
    ('red', v_red), ('blue', v_blue);

  foreach v_case in array array[
    'complete', 'hidden', 'category', 'firstLevel', 'brand', 'description',
    'attribute', 'photoTwoColors', 'generalOneColor', 'noColorNoPhoto',
    'price', 'variantColor', 'optionMissing', 'optionWrong', 'inactive', 'noSlug'
  ] loop
    insert into wm.products (name, slug, description, category_id, brand_id,
                             is_active, visible_in_catalog)
    values ('T4 ' || v_case || ' ' || v_tag,
            case when v_case = 'noSlug' then null
                 else 't4-' || pg_catalog.lower(v_case) || '-' || v_tag end,
            case when v_case = 'description' then E'  \t ' else 'T4 description' end,
            case when v_case = 'category' then null
                 when v_case = 'firstLevel' then v_parent
                 when v_case = 'attribute' then v_required_category
                 when v_case = 'variantColor' then v_color_category
                 when v_case in ('optionMissing', 'optionWrong') then v_option_category
                 else v_category end,
            case when v_case = 'brand' then null else v_brand end,
            v_case <> 'inactive', v_case <> 'hidden')
    returning id into v_product;
    insert into wm.product_variants (product_id, sku, price, color_id, option_value_id)
      values (v_product, 'T4-' || v_case || '-' || v_tag,
              case when v_case = 'price' then 0 else 12 end,
              case when v_case in ('noColorNoPhoto', 'variantColor') then null else v_red end,
              case when v_case = 'optionWrong' then v_wrong_option else null end)
      returning id into v_variant;
    if v_case not in ('photoTwoColors', 'noColorNoPhoto') then
      insert into wm.product_media (product_id, color_id, path, sort_order)
        values (v_product,
                case when v_case in ('generalOneColor', 'variantColor') then null else v_red end,
                't4/' || v_tag || '/' || v_case || '.webp', 1);
    end if;
    if v_case = 'photoTwoColors' then
      insert into wm.product_media (product_id, color_id, path)
        values (v_product, v_red, 't4/' || v_tag || '/red.webp');
      insert into wm.product_variants (product_id, sku, price, color_id)
        values (v_product, 'T4-blue-' || v_tag, 12, v_blue);
    end if;
    if v_case = 'complete' then
      insert into wm.inventory (variant_id, branch_id, quantity)
        values (v_variant, v_branch, 3), (v_variant, v_off_branch, 3);
      insert into pg_temp.shop_test_ids values ('variant', v_variant);
    elsif v_case = 'generalOneColor' then
      insert into wm.inventory (variant_id, branch_id, quantity)
        values (v_variant, v_branch, 100);
      insert into pg_temp.shop_test_ids values ('cap_variant', v_variant);
    end if;
    insert into pg_temp.shop_test_ids values (v_case, v_product);
    v_expected := v_case in ('complete', 'hidden', 'generalOneColor', 'inactive', 'noSlug');
    if wm.product_is_shop_ready(v_product) is distinct from v_expected then
      raise exception 'readiness parity failed for % (expected %)', v_case, v_expected;
    end if;
  end loop;
end $$;

do $$
declare
  v_role text;
  v_schema text;
  v_relation record;
  v_expected record;
  v_columns text[];
  v_setting text;
  v_privileged_function_count int;
  v_privileged_functions text;
  v_usable_schemas text[];
  v_variant uuid := (select id from pg_temp.shop_test_ids where name = 'variant');
  v_branch uuid := (select id from pg_temp.shop_test_ids where name = 'branch');
  v_off uuid := (select id from pg_temp.shop_test_ids where name = 'off_branch');
  v_product uuid := (select id from pg_temp.shop_test_ids where name = 'complete');
  v_photo_product uuid := (select id from pg_temp.shop_test_ids where name = 'photoTwoColors');
  v_order uuid;
begin
  select pg_catalog.array_agg(n.nspname::text order by n.nspname)
    into v_usable_schemas
  from pg_catalog.pg_namespace n
  where pg_catalog.has_schema_privilege('storefront', n.oid, 'USAGE')
    and n.nspname !~ '^pg_(toast_)?temp_' and n.nspname <> 'pg_toast';
  if v_usable_schemas is distinct from
     array['information_schema', 'pg_catalog', 'public', 'shop']::text[] then
    raise exception 'esquemas utilizables por storefront inesperados: %', v_usable_schemas;
  end if;
  foreach v_schema in array array['wm', 'auth', 'storage'] loop
    if pg_catalog.has_schema_privilege('storefront', v_schema, 'USAGE')
       or pg_catalog.has_schema_privilege('storefront', v_schema, 'CREATE') then
      raise exception 'storefront tiene acceso al esquema %', v_schema;
    end if;
  end loop;
  if not pg_catalog.has_schema_privilege('storefront', 'shop', 'USAGE')
     or pg_catalog.has_function_privilege('storefront',
          'wm.product_is_shop_ready(uuid)', 'EXECUTE') then
    raise exception 'permisos de esquema o función incorrectos';
  end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if pg_catalog.has_schema_privilege(v_role, 'shop', 'USAGE') then
      raise exception '% tiene USAGE en shop', v_role;
    end if;
  end loop;
  for v_relation in
    select n.nspname, c.oid, c.relname from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('wm', 'public', 'auth', 'storage')
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    if pg_catalog.has_table_privilege('storefront', v_relation.oid, 'SELECT')
       or pg_catalog.has_table_privilege('storefront', v_relation.oid, 'INSERT')
       or pg_catalog.has_table_privilege('storefront', v_relation.oid, 'UPDATE')
       or pg_catalog.has_table_privilege('storefront', v_relation.oid, 'DELETE') then
      raise exception 'storefront tiene privilegios de tabla en %.%',
        v_relation.nspname, v_relation.relname;
    end if;
  end loop;
  for v_relation in
    select n.nspname, c.oid, c.relname from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname not in ('shop', 'pg_catalog', 'information_schema', 'pg_toast')
      and n.nspname !~ '^pg_(toast_)?temp_'
      and pg_catalog.has_schema_privilege('storefront', n.oid, 'USAGE')
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    if pg_catalog.has_table_privilege('storefront', v_relation.oid, 'SELECT') then
      raise exception 'storefront puede leer %.% fuera de shop',
        v_relation.nspname, v_relation.relname;
    end if;
  end loop;
  select count(*)::int,
         pg_catalog.string_agg(
           pg_catalog.format('%I.%I(%s)', n.nspname, p.proname,
             pg_catalog.pg_get_function_identity_arguments(p.oid)), ', '
           order by n.nspname, p.proname, p.oid)
    into v_privileged_function_count, v_privileged_functions
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and n.nspname not in ('shop', 'pg_catalog', 'information_schema', 'pg_toast')
    and n.nspname !~ '^pg_(toast_)?temp_'
    and pg_catalog.has_schema_privilege('storefront', n.oid, 'USAGE')
    and pg_catalog.has_function_privilege('storefront', p.oid, 'EXECUTE');
  if v_privileged_function_count <> 0 then
    raise exception 'storefront puede ejecutar funciones SECURITY DEFINER fuera de shop: %',
      v_privileged_functions;
  end if;
  for v_expected in
    select * from (values
      ('store_settings', array['company_name','logo_url','logo_dark_url','favicon_url','primary_color','accent_color','store_whatsapp','soft_hold_minutes','max_units_per_line','max_units_per_order','max_lines','max_open_per_phone','display_stock_cap']),
      ('branches', array['branch_id','code','name','city','address','phone']),
      ('categories', array['category_id','parent_id','level','name','slug','sort_order','product_count']),
      ('brands', array['brand_id','name','slug','logo_url','description','lines','product_count']),
      ('color_families', array['family_id','name','slug','hex','sort_order']),
      ('option_values', array['option_type_code','option_type_name','option_value_id','label','slug','sort_order']),
      ('products', array['product_id','slug','name','description','specs','brand_id','brand_name','brand_slug','line_id','line_name','line_slug','department_id','department_name','department_slug','category_id','category_name','category_slug','option_type_code','option_type_name','attributes','general_photos','main_photo','price_min','price_max','in_stock','updated_at']),
      ('variants', array['variant_id','product_id','sku','price','color_id','color_name','color_slug','color_hex','color_family_name','color_family_slug','color_sort','option_value_id','option_label','option_slug','option_sort','color_photos','available_total']),
      ('availability', array['variant_id','branch_id','available'])
    ) e(view_name, columns_expected)
  loop
    select array_agg(a.attname::text order by a.attnum) into v_columns
    from pg_catalog.pg_attribute a
    where a.attrelid = pg_catalog.to_regclass('shop.' || v_expected.view_name)
      and a.attnum > 0 and not a.attisdropped;
    if v_columns is distinct from v_expected.columns_expected then
      raise exception 'columnas de shop.% incorrectas: %', v_expected.view_name, v_columns;
    end if;
    if not pg_catalog.has_table_privilege('storefront',
           pg_catalog.to_regclass('shop.' || v_expected.view_name), 'SELECT')
       or pg_catalog.has_table_privilege('storefront',
           pg_catalog.to_regclass('shop.' || v_expected.view_name), 'INSERT')
       or pg_catalog.has_table_privilege('storefront',
           pg_catalog.to_regclass('shop.' || v_expected.view_name), 'UPDATE')
       or pg_catalog.has_table_privilege('storefront',
           pg_catalog.to_regclass('shop.' || v_expected.view_name), 'DELETE') then
      raise exception 'shop.% no es de solo lectura para storefront', v_expected.view_name;
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_attribute a
             join pg_catalog.pg_class c on c.oid = a.attrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'shop' and a.attnum > 0 and not a.attisdropped
               and a.attname in ('cost', 'stock_value', 'supplier_id', 'rif')) then
    raise exception 'shop expone una columna privada';
  end if;
  select s.setconfig::text into v_setting
  from pg_catalog.pg_db_role_setting s
  join pg_catalog.pg_roles r on r.oid = s.setrole
  where r.rolname = 'authenticator' and s.setconfig::text like '%pgrst.db_schemas%'
  limit 1;
  if v_setting is not null and v_setting ~ '(^|[, =])shop([, }]|$)' then
    raise exception 'shop está expuesto por PostgREST: %', v_setting;
  end if;

  if (select count(*) from shop.products where product_id = v_product) <> 1
     or (select count(*) from shop.store_settings) <> 1
     or (select main_photo from shop.products where product_id =
           (select id from pg_temp.shop_test_ids where name = 'generalOneColor')) is null
     or (select count(*) from shop.products where product_id = (select id from pg_temp.shop_test_ids where name = 'hidden')) <> 0
     or (select count(*) from shop.products where product_id = (select id from pg_temp.shop_test_ids where name = 'noSlug')) <> 0
     or (select count(*) from shop.products where product_id = (select id from pg_temp.shop_test_ids where name = 'description')) <> 0
     or (select count(*) from shop.variants where product_id = (select id from pg_temp.shop_test_ids where name = 'price')) <> 0
     or (select count(*) from shop.branches where branch_id = v_off) <> 0
     or (select count(*) from shop.availability where branch_id = v_off) <> 0 then
    raise exception 'filtros de publicación incorrectos';
  end if;
  -- Entre colores con variantes activas, nombre antes que sort_order.
  insert into wm.product_media (product_id, color_id, path)
  values (v_photo_product, (select id from pg_temp.shop_test_ids where name = 'blue'), 't4/active-blue.webp');
  update wm.colors set name = 'Z rojo ' || gen_random_uuid()::text
   where id = (select id from pg_temp.shop_test_ids where name = 'red');
  update wm.colors set name = 'A azul ' || gen_random_uuid()::text
   where id = (select id from pg_temp.shop_test_ids where name = 'blue');
  if (select main_photo from shop.products where product_id = v_photo_product)
     is distinct from 't4/active-blue.webp' then
    raise exception 'main_photo no ordenó colores activos por nombre';
  end if;
  update wm.colors set name = 'A inactivo ' || gen_random_uuid()::text, is_active = false
   where id = (select id from pg_temp.shop_test_ids where name = 'red');
  update wm.colors set name = 'Z activo ' || gen_random_uuid()::text
   where id = (select id from pg_temp.shop_test_ids where name = 'blue');
  if (select main_photo from shop.products where product_id = v_photo_product)
     is distinct from (select path from wm.product_media
                        where product_id = v_photo_product
                          and color_id = (select id from pg_temp.shop_test_ids where name = 'red')
                        order by sort_order, id limit 1) then
    raise exception 'main_photo ignoró un color con maestro inactivo y variante activa';
  end if;
  update wm.product_variants set is_active = false
   where product_id = v_photo_product
     and color_id = (select id from pg_temp.shop_test_ids where name = 'red');
  if (select main_photo from shop.products where product_id = v_photo_product)
     is distinct from 't4/active-blue.webp' then
    raise exception 'main_photo incluyó un color sin variantes activas';
  end if;
  insert into wm.product_media (product_id, color_id, path)
  values (v_photo_product, null, 't4/general.webp');
  if (select main_photo from shop.products where product_id = v_photo_product)
     is distinct from 't4/general.webp' then
    raise exception 'main_photo no priorizó la foto general';
  end if;
  if (select available from shop.availability where variant_id = v_variant and branch_id = v_branch) <> 3
     or (select available_total from shop.variants where variant_id = v_variant) <> 3
     or (select available from shop.availability
         where variant_id = (select id from pg_temp.shop_test_ids where name = 'cap_variant')
           and branch_id = v_branch) <> (select display_stock_cap from wm.online_settings where id = 1)
     or exists (select 1 from shop.availability a cross join wm.online_settings s
                where a.available > s.display_stock_cap or a.available <= 0) then
    raise exception 'disponibilidad inicial o tope incorrecto';
  end if;
  insert into wm.online_orders (request_id, status, customer_name, customer_phone,
                                soft_expires_at, firm_expires_at)
    values (gen_random_uuid(), 'aceptada', 'T4 test', '+584141234567',
            now() + interval '30 minutes', now() + interval '24 hours')
    returning id into v_order;
  insert into wm.online_order_items
    (order_id, variant_id, branch_id, quantity, unit_price, product_name, variant_label, sku)
    values (v_order, v_variant, v_branch, 1, 12, 'T4 test', 'T4 test', 'T4-test');
  if (select available from shop.availability where variant_id = v_variant and branch_id = v_branch) <> 2 then
    raise exception 'pedido aceptado no redujo disponibilidad';
  end if;
end $$;

grant storefront to postgres;
set local role storefront;
do $$
declare v_denied boolean := false;
begin
  if (select count(*) from shop.products) < 1
     or (select count(*) from shop.variants) < 1
     or (select count(*) from shop.availability) < 1 then
    raise exception 'el catálogo no es legible como storefront';
  end if;
  begin
    perform 1 from wm.products limit 1;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then raise exception 'storefront pudo leer wm.products'; end if;
  -- Las formas de las consultas de §5 deben ser ejecutables por el rol real.
  perform p.product_id, p.slug, p.name, p.brand_name, p.main_photo,
          p.price_min, p.price_max, p.in_stock
  from shop.products p
  where p.category_slug is not null
    and (null::text is null or p.brand_slug = null::text)
    and (null::text is null or exists (
      select 1 from shop.variants v where v.product_id = p.product_id
        and v.color_family_slug = null::text))
    and (null::text is null or exists (
      select 1 from shop.variants v where v.product_id = p.product_id
        and v.option_slug = null::text))
    and (false = false or p.in_stock)
  order by p.name limit 1 offset 0;
  perform v.variant_id from shop.variants v
  order by v.color_sort nulls last, v.option_sort nulls last limit 1;
  perform a.variant_id, a.branch_id, a.available, b.name, b.city
  from shop.availability a join shop.branches b using (branch_id)
  limit 1;
  perform q.product_id, q.slug, q.name, q.main_photo, q.price_min
  from (select distinct p.product_id, p.slug, p.name, p.main_photo, p.price_min
        from shop.products p left join shop.variants v using (product_id)
        where p.name ilike '%T4%' or p.brand_name ilike '%T4%' or v.sku ilike 'T4%'
        limit 24) q;
end $$;
reset role;

rollback;
