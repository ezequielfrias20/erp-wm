-- Las URLs públicas de wm-public siguen disponibles; solo usuarios autenticados
-- pueden consultar storage.objects para borrar o reemplazar archivos del ERP.
drop policy if exists "wm_public_read" on storage.objects;
drop policy if exists "wm_authenticated_read" on storage.objects;

create policy "wm_authenticated_read" on storage.objects
  for select to authenticated using (bucket_id = 'wm-public');
