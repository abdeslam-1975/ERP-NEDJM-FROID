-- Public stills of the home page. The manifest (manifest.json) and the pictures live in this
-- bucket; the super admin replaces them from Paramètres → Accueil. The dashboard never hard-codes a scene.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dashboard-scenes',
  'dashboard-scenes',
  true,
  1572864,
  array['image/png', 'image/jpeg', 'image/webp', 'application/json']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists dashboard_scenes_select on storage.objects;
create policy dashboard_scenes_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'dashboard-scenes');

drop policy if exists dashboard_scenes_insert on storage.objects;
create policy dashboard_scenes_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dashboard-scenes' and public.erp_is_super_admin());

drop policy if exists dashboard_scenes_update on storage.objects;
create policy dashboard_scenes_update on storage.objects
  for update to authenticated
  using (bucket_id = 'dashboard-scenes' and public.erp_is_super_admin())
  with check (bucket_id = 'dashboard-scenes' and public.erp_is_super_admin());

drop policy if exists dashboard_scenes_delete on storage.objects;
create policy dashboard_scenes_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'dashboard-scenes' and public.erp_is_super_admin());
