-- Reversión de shop_top_products.sql.
-- Aplicar: psql -X -1 -v ON_ERROR_STOP=1 -c "set lock_timeout = '5s'" -f supabase/shop_top_products_revert.sql
drop view if exists shop.top_products;
