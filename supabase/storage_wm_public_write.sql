-- Solo miembros activos del ERP pueden escribir en el bucket público.
drop policy if exists "wm_authenticated_insert" on storage.objects;
drop policy if exists "wm_authenticated_update" on storage.objects;
drop policy if exists "wm_authenticated_delete" on storage.objects;

create policy "wm_authenticated_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'wm-public' and wm.is_member());
create policy "wm_authenticated_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'wm-public' and wm.is_member())
  with check (bucket_id = 'wm-public' and wm.is_member());
create policy "wm_authenticated_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'wm-public' and wm.is_member());
