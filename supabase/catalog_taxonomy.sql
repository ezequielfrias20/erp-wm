-- Catálogo clasificado, listo para ecommerce (estructura ADITIVA, idempotente).
-- Spec: docs/superpowers/specs/2026-11-11-catalogo-listo-ecommerce-design.md
-- Plan: docs/superpowers/plans/2026-11-11-catalogo-01-esquema-y-excel-revision.md (Task 2)
--
-- Agrega tablas y columnas NULAS: no cambia ningún dato existente. La taxonomía propia de
-- World Medics (árbol de categorías, atributos, líneas, colores canónicos) NO va aquí: la
-- aplica la limpieza (plan 2) desde el Excel revisado. Aquí sólo hay seeds genéricos.
--
-- Prueba (aplica dos veces + verifica + ROLLBACK):
--   source scripts/catalogo/pg-env.sh && psql -X -f supabase/tests/catalog_taxonomy_rollback.sql

-- ===== 1. Opciones de variante (segundo eje: talla, amarre…) ================
create table if not exists wm.option_types (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  sort_order int not null default 0
);

create table if not exists wm.option_values (
  id uuid primary key default gen_random_uuid(),
  option_type_id uuid not null references wm.option_types(id) on delete restrict,
  label text not null,
  slug text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  unique (option_type_id, slug)
);

-- ===== 2. Colores con familia ===============================================
create table if not exists wm.color_families (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  slug text unique not null,
  hex text,
  sort_order int not null default 0
);

alter table wm.colors
  add column if not exists slug text,
  add column if not exists family_id uuid references wm.color_families(id) on delete set null,
  add column if not exists swatch_url text,
  add column if not exists is_active boolean not null default true;
create unique index if not exists colors_slug_key on wm.colors(slug) where slug is not null;

-- ===== 3. Marcas y líneas / modelos ==========================================
alter table wm.brands
  add column if not exists slug text,
  add column if not exists logo_url text,
  add column if not exists description text;
create unique index if not exists brands_slug_key on wm.brands(slug) where slug is not null;

create table if not exists wm.product_lines (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references wm.brands(id) on delete cascade,
  name text not null,
  slug text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, slug)
);

-- ===== 4. Categorías en árbol (departamento → categoría) =====================
alter table wm.categories
  add column if not exists parent_id uuid references wm.categories(id) on delete restrict,
  add column if not exists option_type_id uuid references wm.option_types(id) on delete set null,
  add column if not exists requires_color boolean not null default false;
create unique index if not exists categories_slug_key on wm.categories(slug) where slug is not null;
create index if not exists categories_parent_idx on wm.categories(parent_id);

-- ===== 5. Atributos de filtro (definidos por datos) ==========================
create table if not exists wm.attributes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  is_multi boolean not null default false,
  sort_order int not null default 0
);

create table if not exists wm.attribute_values (
  id uuid primary key default gen_random_uuid(),
  attribute_id uuid not null references wm.attributes(id) on delete cascade,
  name text not null,
  slug text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  unique (attribute_id, slug)
);

create table if not exists wm.category_attributes (
  category_id uuid not null references wm.categories(id) on delete cascade,
  attribute_id uuid not null references wm.attributes(id) on delete cascade,
  is_required boolean not null default false,
  sort_order int not null default 0,
  primary key (category_id, attribute_id)
);

create table if not exists wm.product_attribute_values (
  product_id uuid not null references wm.products(id) on delete cascade,
  attribute_value_id uuid not null references wm.attribute_values(id) on delete cascade,
  primary key (product_id, attribute_value_id)
);
create index if not exists product_attribute_values_value_idx
  on wm.product_attribute_values(attribute_value_id);

-- ===== 6. Producto (modelo) y variante (color × opción) ======================
alter table wm.products
  add column if not exists slug text,
  add column if not exists line_id uuid references wm.product_lines(id) on delete set null,
  add column if not exists specs jsonb not null default '[]'::jsonb;  -- [{label, value}]
create unique index if not exists products_slug_key on wm.products(slug) where slug is not null;
create index if not exists products_line_idx on wm.products(line_id);

alter table wm.product_variants
  add column if not exists color_id uuid references wm.colors(id) on delete restrict,
  add column if not exists option_value_id uuid references wm.option_values(id) on delete restrict;
create index if not exists product_variants_color_idx on wm.product_variants(color_id);
create index if not exists product_variants_option_idx on wm.product_variants(option_value_id);

-- ===== 7. Fotos por producto y color =========================================
create table if not exists wm.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references wm.products(id) on delete cascade,
  color_id uuid references wm.colors(id) on delete set null,  -- null = foto general
  path text not null,
  alt text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists product_media_product_idx
  on wm.product_media(product_id, color_id, sort_order);

-- ===== 8. Alias de SKU y registro de la limpieza =============================
create table if not exists wm.variant_sku_aliases (
  sku text primary key,
  variant_id uuid not null references wm.product_variants(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists wm.catalog_migration_log (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  entity text not null,
  old_id uuid,
  new_id uuid,
  old_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists catalog_migration_log_run_idx
  on wm.catalog_migration_log(run_id, entity);

-- ===== 9. updated_at =========================================================
drop trigger if exists product_lines_set_updated_at on wm.product_lines;
create trigger product_lines_set_updated_at before update on wm.product_lines
  for each row execute function wm.set_updated_at();

-- ===== 10. RLS ===============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'option_types','option_values','color_families','product_lines','attributes',
    'attribute_values','category_attributes','product_attribute_values','product_media',
    'variant_sku_aliases','catalog_migration_log'
  ] loop
    execute format('alter table wm.%I enable row level security;', t);
  end loop;
end$$;

-- Políticas estándar por módulo (lectura: cualquier miembro; escritura: nivel 2).
do $$
declare
  tbl text;
  modu text;
  map jsonb := '{
    "option_types":"Inventario",
    "option_values":"Inventario",
    "color_families":"Inventario",
    "product_lines":"Inventario",
    "attributes":"Inventario",
    "attribute_values":"Inventario",
    "category_attributes":"Inventario",
    "product_attribute_values":"Productos",
    "product_media":"Productos",
    "variant_sku_aliases":"Productos"
  }';
begin
  for tbl, modu in select key, value from jsonb_each_text(map) loop
    execute format('drop policy if exists %I on wm.%I;', tbl||'_sel', tbl);
    execute format('drop policy if exists %I on wm.%I;', tbl||'_ins', tbl);
    execute format('drop policy if exists %I on wm.%I;', tbl||'_upd', tbl);
    execute format('drop policy if exists %I on wm.%I;', tbl||'_del', tbl);
    execute format('create policy %I on wm.%I for select to authenticated using (wm.is_member());', tbl||'_sel', tbl);
    execute format('create policy %I on wm.%I for insert to authenticated with check (wm.has_module(%L,2));', tbl||'_ins', tbl, modu);
    execute format('create policy %I on wm.%I for update to authenticated using (wm.has_module(%L,2)) with check (wm.has_module(%L,2));', tbl||'_upd', tbl, modu, modu);
    execute format('create policy %I on wm.%I for delete to authenticated using (wm.has_module(%L,2));', tbl||'_del', tbl, modu);
  end loop;
end$$;

-- El registro de la limpieza sólo se lee desde la app; lo escribe el script como postgres.
drop policy if exists catalog_migration_log_sel on wm.catalog_migration_log;
create policy catalog_migration_log_sel on wm.catalog_migration_log
  for select to authenticated using (wm.is_member());

grant select, insert, update, delete on
  wm.option_types, wm.option_values, wm.color_families, wm.product_lines, wm.attributes,
  wm.attribute_values, wm.category_attributes, wm.product_attribute_values, wm.product_media,
  wm.variant_sku_aliases
  to authenticated;
grant select on wm.catalog_migration_log to authenticated;

-- ===== 11. Seeds genéricos (también en bootstrap/02_seed.sql) ================
insert into wm.option_types (code, name, sort_order) values
  ('talla', 'Talla', 1),
  ('amarre', 'Amarre', 2)
on conflict (code) do nothing;

insert into wm.option_values (option_type_id, label, slug, sort_order)
select t.id, v.label, v.slug, v.sort_order
from wm.option_types t
join (values
  ('talla', 'XXS', 'xxs', 1),
  ('talla', 'XS', 'xs', 2),
  ('talla', 'S', 's', 3),
  ('talla', 'S-M', 's-m', 4),
  ('talla', 'M', 'm', 5),
  ('talla', 'L', 'l', 6),
  ('talla', 'L-XL', 'l-xl', 7),
  ('talla', 'XL', 'xl', 8),
  ('talla', '2XL', '2xl', 9),
  ('talla', '3XL', '3xl', 10),
  ('talla', 'Única', 'unica', 11),
  ('amarre', 'Moño', 'mono', 1),
  ('amarre', 'Tiras', 'tiras', 2),
  ('amarre', 'Elástica', 'elastica', 3)
) as v(type_code, label, slug, sort_order) on v.type_code = t.code
on conflict (option_type_id, slug) do nothing;

insert into wm.color_families (name, slug, hex, sort_order) values
  ('Azules', 'azules', '#2563EB', 1),
  ('Verdes', 'verdes', '#16A34A', 2),
  ('Rojos', 'rojos', '#DC2626', 3),
  ('Rosados', 'rosados', '#EC4899', 4),
  ('Morados', 'morados', '#7C3AED', 5),
  ('Amarillos y naranjas', 'amarillos-y-naranjas', '#F59E0B', 6),
  ('Neutros', 'neutros', '#6B7280', 7),
  ('Estampados', 'estampados', null, 8)
on conflict (slug) do nothing;
