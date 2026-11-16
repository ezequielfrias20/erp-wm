-- Catálogo 3b (pendientes): candados en la base para los maestros. Idempotente.
-- Configuración → Catálogo ya comprueba estas reglas, pero entre «comprobar» y «borrar/guardar» otra
-- persona puede asignar el valor o crear el mismo nombre. Aquí la base lo impide siempre.
--
-- Prueba (aplica dos veces + verifica + ROLLBACK):
--   scripts/catalogo/psql.sh -X -f supabase/tests/catalog_master_guards_rollback.sql

-- ===== 1. Borrar un maestro en uso: RESTRICT en vez de SET NULL / CASCADE =========
-- Antes: borrar una categoría/marca/línea dejaba productos sin ella; borrar un color pasaba sus
-- fotos a «General»; borrar un valor de característica lo quitaba de los productos; borrar un
-- tipo de opción dejaba categorías sin opción; borrar una característica la quitaba de las
-- categorías. Ahora la base rechaza el borrado mientras se use.

alter table wm.products drop constraint if exists products_category_id_fkey;
alter table wm.products add constraint products_category_id_fkey
  foreign key (category_id) references wm.categories(id) on delete restrict;

alter table wm.products drop constraint if exists products_brand_id_fkey;
alter table wm.products add constraint products_brand_id_fkey
  foreign key (brand_id) references wm.brands(id) on delete restrict;

alter table wm.products drop constraint if exists products_line_id_fkey;
alter table wm.products add constraint products_line_id_fkey
  foreign key (line_id) references wm.product_lines(id) on delete restrict;

alter table wm.product_media drop constraint if exists product_media_color_id_fkey;
alter table wm.product_media add constraint product_media_color_id_fkey
  foreign key (color_id) references wm.colors(id) on delete restrict;

alter table wm.product_attribute_values drop constraint if exists product_attribute_values_attribute_value_id_fkey;
alter table wm.product_attribute_values add constraint product_attribute_values_attribute_value_id_fkey
  foreign key (attribute_value_id) references wm.attribute_values(id) on delete restrict;

alter table wm.categories drop constraint if exists categories_option_type_id_fkey;
alter table wm.categories add constraint categories_option_type_id_fkey
  foreign key (option_type_id) references wm.option_types(id) on delete restrict;

alter table wm.category_attributes drop constraint if exists category_attributes_attribute_id_fkey;
alter table wm.category_attributes add constraint category_attributes_attribute_id_fkey
  foreign key (attribute_id) references wm.attributes(id) on delete restrict;

-- ===== 2. Borrar un tipo de opción sin uso en un solo paso (atómico) ==============
-- Sus valores se van con él; si alguno lo usa una variante, product_variants.option_value_id
-- (RESTRICT) hace fallar todo el borrado.
alter table wm.option_values drop constraint if exists option_values_option_type_id_fkey;
alter table wm.option_values add constraint option_values_option_type_id_fkey
  foreign key (option_type_id) references wm.option_types(id) on delete cascade;

-- ===== 3. Nombres únicos sin distinguir mayúsculas ==================================
create unique index if not exists colors_name_lower_key on wm.colors (lower(name));
create unique index if not exists categories_name_lower_key on wm.categories (lower(name));
create unique index if not exists brands_name_lower_key on wm.brands (lower(name));
create unique index if not exists product_lines_brand_name_lower_key on wm.product_lines (brand_id, lower(name));
create unique index if not exists option_types_name_lower_key on wm.option_types (lower(name));
create unique index if not exists option_values_type_label_lower_key on wm.option_values (option_type_id, lower(label));
create unique index if not exists attributes_name_lower_key on wm.attributes (lower(name));
create unique index if not exists attribute_values_attr_name_lower_key on wm.attribute_values (attribute_id, lower(name));
