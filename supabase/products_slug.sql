-- Slug obligatorio en wm.products. La tienda (wm.v_published_shop_products) sólo publica
-- productos con slug, pero el ERP no lo generaba al crear (editor ni Excel): los slugs
-- venían sólo de la limpieza del catálogo y todo producto nuevo quedaba fuera de la tienda.
--
-- La base lo genera ahora al insertar (o si alguien lo vacía) con el mismo formato que
-- lib/catalog-migration/cleanup-plan.ts → slugify: sin acentos, minúsculas, guiones.
-- Repetidos: «figs-dama», «figs-dama-2», … El slug no cambia al renombrar el producto
-- (es la URL de la ficha en la tienda). Rellena los que faltan y fija NOT NULL.
-- Idempotente. Necesita catalog_taxonomy.sql (columna slug + índice único products_slug_key).

create or replace function wm.slugify(p_text text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select coalesce(nullif(pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.lower(pg_catalog.regexp_replace(
      normalize(coalesce(p_text, ''), NFD), '[̀-ͯ]', '', 'g')),
    '[^a-z0-9]+', '-', 'g'), '-'), ''), 'x');
$$;
revoke all on function wm.slugify(text) from public, anon;
grant execute on function wm.slugify(text) to authenticated;

-- Primer slug libre para p_name, ignorando el propio producto (p_exclude).
-- El candado por raíz evita que dos altas simultáneas con el mismo nombre choquen.
create or replace function wm.unique_product_slug(p_name text, p_exclude uuid default null)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v_root text := wm.slugify(p_name);
  v_candidate text := v_root;
  v_suffix int := 1;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('wm.products.slug:' || v_root));
  while exists (select 1 from wm.products p
                where p.slug = v_candidate and p.id is distinct from p_exclude) loop
    v_suffix := v_suffix + 1;
    v_candidate := v_root || '-' || v_suffix;
  end loop;
  return v_candidate;
end;
$$;
revoke all on function wm.unique_product_slug(text, uuid) from public, anon, authenticated;

create or replace function wm.products_fill_slug()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.slug is null or pg_catalog.btrim(new.slug) = '' then
    new.slug := wm.unique_product_slug(new.name, new.id);
  end if;
  return new;
end;
$$;
revoke all on function wm.products_fill_slug() from public, anon, authenticated;

drop trigger if exists products_fill_slug on wm.products;
create trigger products_fill_slug
  before insert or update of slug on wm.products
  for each row execute function wm.products_fill_slug();

-- Relleno: uno por uno (un solo UPDATE no vería los slugs que asigna a las filas
-- anteriores y repetiría «figs-dama-2»). Los más antiguos se quedan con el slug corto.
do $$
declare r record;
begin
  for r in select id, name from wm.products
           where slug is null or btrim(slug) = '' order by created_at, id loop
    update wm.products set slug = wm.unique_product_slug(r.name, r.id) where id = r.id;
  end loop;
end $$;

alter table wm.products alter column slug set not null;
