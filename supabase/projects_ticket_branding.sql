-- =============================================================================
--  WM ERP — identidad visual y contenido de entradas para módulo Proyectos.
--  Idempotente para bases donde ya existe `wm.projects`.
-- =============================================================================

alter table wm.projects
  add column if not exists logo_url text,
  add column if not exists ticket_title text,
  add column if not exists ticket_subtitle text,
  add column if not exists ticket_details text,
  add column if not exists ticket_instructions text,
  add column if not exists ticket_footer text,
  add column if not exists ticket_accent_color text default '#0ea5e9',
  add column if not exists organizer_name text,
  add column if not exists organizer_email text,
  add column if not exists organizer_phone text;

alter table wm.projects
  drop constraint if exists projects_ticket_accent_color_chk,
  add constraint projects_ticket_accent_color_chk
    check (
      ticket_accent_color is null
      or ticket_accent_color ~ '^#[0-9A-Fa-f]{6}$'
    );

notify pgrst, 'reload schema';
