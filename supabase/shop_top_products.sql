-- Tienda online: más vendidos de los últimos 30 días (contrato: docs/TIENDA-INTEGRACION.md §4.10).
-- Aditivo e idempotente. Necesita shop_schema.sql. Cuenta ventas de wm.sales (tienda física y
-- pedidos online ya convertidos en venta); excluye anuladas y reembolsadas. Sin datos de clientes
-- ni de facturas. Misma definición en shop_schema.sql (estado final): si cambias una, cambia la otra.
-- Reversión: supabase/shop_top_products_revert.sql
-- Aplicar: psql -X -1 -v ON_ERROR_STOP=1 -c "set lock_timeout = '5s'" -f supabase/shop_top_products.sql

create or replace view shop.top_products as
select t.product_id, t.units_sold,
       (row_number() over (order by t.units_sold desc, t.sales_count desc,
                           t.last_sale desc, t.product_id))::int as rank
from (
  select v.product_id, sum(si.quantity)::int as units_sold,
         count(distinct s.id) as sales_count, max(s.created_at) as last_sale
  from wm.sales s
  join wm.sale_items si on si.sale_id = s.id
  join wm.product_variants v on v.id = si.variant_id
  where s.created_at >= now() - interval '30 days'
    and s.status not in ('Reembolso', 'Anulada')
  group by v.product_id
) t
join wm.v_published_shop_products pub on pub.product_id = t.product_id;

revoke all on shop.top_products from public, anon, authenticated;
grant select on shop.top_products to storefront;
