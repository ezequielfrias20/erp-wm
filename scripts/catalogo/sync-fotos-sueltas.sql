-- Plan 3a — paso de despliegue: registra como foto General cada archivo viejo
-- `product-images/<uuid-del-producto>.png` del bucket wm-public que no tenga fila en
-- wm.product_media (el editor nuevo sólo muestra fotos con fila). Idempotente.
--
--   scripts/catalogo/psql.sh -X -v commit=0 -f scripts/catalogo/sync-fotos-sueltas.sql   # simular
--   scripts/catalogo/psql.sh -X -v commit=1 -f scripts/catalogo/sync-fotos-sueltas.sql   # aplicar
--
-- Archivos cuyo producto ya no existe se informan y no se tocan.
\set ON_ERROR_STOP on
\if :{?commit}
\else
  \set commit 0
\endif

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create temp table _sueltas on commit drop as
select o.name as path,
       substring(o.name from '^product-images/([0-9a-f-]{36})\.png$') as product_text
from storage.objects o
where o.bucket_id = 'wm-public'
  and o.name ~ '^product-images/[0-9a-f-]{36}\.png$'
  and not exists (select 1 from wm.product_media m where m.path = o.name);

\echo 'Archivos sin fila cuyo producto ya no existe (no se tocan):'
select s.path
from _sueltas s
where not exists (select 1 from wm.products p where p.id::text = s.product_text)
order by s.path;

with candidatas as (
  select s.path, p.id as product_id
  from _sueltas s
  join wm.products p on p.id::text = s.product_text
),
insertadas as (
  insert into wm.product_media (product_id, color_id, path, sort_order)
  select c.product_id, null, c.path,
         coalesce((select max(m.sort_order) + 1 from wm.product_media m
                   where m.product_id = c.product_id and m.color_id is null), 0)
  from candidatas c
  returning product_id, path
)
select count(*) as fotos_registradas from insertadas;

\if :commit
  commit;
  \echo 'COMMIT: cambios guardados.'
\else
  rollback;
  \echo 'ROLLBACK: simulación, nada se guardó.'
\endif
