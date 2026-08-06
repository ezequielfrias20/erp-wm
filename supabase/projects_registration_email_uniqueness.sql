-- ERP — Proyectos: correo único por proyecto para inscripciones.
-- Ejecutar en la BD viva después de revisar que no existan correos duplicados.

do $$
begin
  if exists (
    select 1
    from wm.project_registrations
    group by project_id, lower(email)
    having count(*) > 1
  ) then
    raise exception 'Existen inscripciones con el mismo correo dentro del mismo proyecto.';
  end if;
end $$;

create unique index if not exists project_registrations_project_email_uidx
  on wm.project_registrations(project_id, lower(email));
