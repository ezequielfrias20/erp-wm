-- =============================================================================
--  WM ERP — tickets QR y referencias únicas para módulo Proyectos.
--  Idempotente para bases donde ya existe `wm.project_registrations`.
-- =============================================================================

alter table wm.project_registrations
  add column if not exists ticket_hash text,
  add column if not exists ticket_payload text,
  add column if not exists ticket_qr_url text,
  add column if not exists ticket_status text not null default 'No emitido',
  add column if not exists ticket_issued_at timestamptz,
  add column if not exists ticket_email_sent_at timestamptz,
  add column if not exists ticket_email_id text,
  add column if not exists ticket_used_at timestamptz;

alter table wm.project_registrations
  drop constraint if exists project_registrations_ticket_status_chk,
  add constraint project_registrations_ticket_status_chk
    check (ticket_status in ('No emitido','Disponible','Usado','Anulado'));

create unique index if not exists project_registrations_reference_uidx
  on wm.project_registrations(lower(payment_reference))
  where payment_reference is not null and btrim(payment_reference) <> '';

create unique index if not exists project_registrations_ticket_hash_uidx
  on wm.project_registrations(ticket_hash)
  where ticket_hash is not null;

notify pgrst, 'reload schema';
