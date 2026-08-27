-- Performance indexes for the query shapes used by the ERP.
-- Apply with psql after checking the production plans with EXPLAIN ANALYZE.
-- CONCURRENTLY keeps production tables writable while indexes are built.

alter table wm.sales add column if not exists request_id uuid;
create unique index concurrently if not exists sales_user_request_uidx
  on wm.sales (user_id, request_id) where request_id is not null;

create index concurrently if not exists sales_branch_created_desc_idx
  on wm.sales (branch_id, created_at desc);

create index concurrently if not exists sales_branch_status_created_desc_idx
  on wm.sales (branch_id, status, created_at desc);

create index concurrently if not exists sales_customer_status_idx
  on wm.sales (customer_id, status)
  where customer_id is not null;

create index concurrently if not exists customers_branch_name_idx
  on wm.customers (branch_id, name);

create index concurrently if not exists customers_branch_document_lower_idx
  on wm.customers (branch_id, lower(document))
  where document is not null;

create index concurrently if not exists purchase_orders_status_expected_idx
  on wm.purchase_orders (status, expected_date);

create index concurrently if not exists inventory_branch_quantity_idx
  on wm.inventory (branch_id, quantity);

create index concurrently if not exists project_registrations_project_created_desc_idx
  on wm.project_registrations (project_id, created_at desc);

create index concurrently if not exists audit_log_created_desc_idx
  on wm.audit_log (created_at desc);

-- Refresh planner statistics after a large import before measuring query plans:
-- analyze wm.sales; analyze wm.sale_items; analyze wm.inventory;

create or replace function wm.inventory_status_counts(p_branch_id uuid default null)
returns table(low_stock bigint, out_stock bigint)
language sql
stable
security invoker
set search_path = wm, public
as $$
  select
    count(*) filter (where i.quantity > 0 and i.quantity < i.min_stock) as low_stock,
    count(*) filter (where i.quantity = 0) as out_stock
  from wm.inventory i
  where p_branch_id is null or i.branch_id = p_branch_id;
$$;

grant execute on function wm.inventory_status_counts(uuid) to authenticated;

create or replace function wm.write_audit(
  p_action text,
  p_module text,
  p_severity text default 'edit'
)
returns void
language plpgsql
security definer
set search_path = wm, public
as $$
declare
  v_profile wm.profiles;
begin
  select * into v_profile from wm.profiles where id = wm.my_profile_id();
  insert into wm.audit_log (user_id, who, action, module, severity)
  values (
    v_profile.id,
    coalesce(v_profile.full_name, 'Sistema'),
    p_action,
    p_module,
    p_severity
  );
end;
$$;

grant execute on function wm.write_audit(text, text, text) to authenticated;

create or replace function wm.report_payments(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  sale_id uuid,
  method text,
  currency text,
  amount numeric,
  amount_usd numeric
)
language sql
stable
security invoker
set search_path = wm, public
as $$
  select sp.sale_id, sp.method, sp.currency, sp.amount, sp.amount_usd
  from wm.sale_payments sp
  join wm.sales s on s.id = sp.sale_id
  where s.status = 'Pagada'
    and s.created_at >= p_from
    and s.created_at <= p_to
    and (p_branch_id is null or s.branch_id = p_branch_id);
$$;

grant execute on function wm.report_payments(uuid, timestamptz, timestamptz)
  to authenticated;
