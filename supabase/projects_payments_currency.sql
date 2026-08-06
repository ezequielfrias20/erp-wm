-- =============================================================================
--  WM ERP — ajuste de moneda/tasa para pagos del módulo Proyectos.
--  Idempotente para bases donde ya existe `wm.project_registrations`.
-- =============================================================================

alter table wm.project_registrations
  add column if not exists currency text not null default 'USD',
  add column if not exists amount numeric(14,2),
  add column if not exists exchange_rate numeric(12,4),
  add column if not exists paid_at date not null default current_date;

update wm.project_registrations
   set currency = case when payment_method = 'Pago móvil' then 'VES' else 'USD' end
 where currency is null
    or (payment_method = 'Pago móvil' and currency <> 'VES')
    or (payment_method <> 'Pago móvil' and currency <> 'USD');

update wm.project_registrations
   set amount = amount_usd
 where amount is null and amount_usd is not null and currency = 'USD';

-- Backfill defensivo para filas viejas de Pago móvil creadas antes de guardar moneda/tasa.
-- Si son datos reales, revisa estas filas y ajusta la tasa/monto al valor histórico correcto.
update wm.project_registrations
   set exchange_rate = coalesce(exchange_rate, 113),
       amount = coalesce(amount, round(amount_usd * coalesce(exchange_rate, 113), 2))
 where currency = 'VES'
   and amount_usd is not null
   and (exchange_rate is null or amount is null);

alter table wm.project_registrations
  drop constraint if exists project_registrations_currency_chk,
  add constraint project_registrations_currency_chk
    check (
      (payment_method = 'Pago móvil' and currency = 'VES') or
      (payment_method <> 'Pago móvil' and currency = 'USD')
    );

alter table wm.project_registrations
  drop constraint if exists project_registrations_rate_chk,
  add constraint project_registrations_rate_chk
    check (currency = 'USD' or exchange_rate is not null);

notify pgrst, 'reload schema';
