-- Screen key consumed by caisse RLS: erp_has_perm('caisse', ...).
-- No input UI. Does not alter fin_* or the finance screen.
-- SUPER_ADMIN already passes erp_has_perm; the row is still stored, as for other screens.
-- ADMIN_FINANCE gets the same full matrix row as on the finance screen.
-- Other roles stay without a caisse row until a later grant.

insert into public.sys_screens (code, path, module, label_fr, label_ar, sort_order)
values ('caisse', '/caisse', 'caisse', 'Caisse', 'صندوق', 515)
on conflict (code) do update set
  path = excluded.path,
  module = excluded.module,
  label_fr = excluded.label_fr,
  label_ar = excluded.label_ar,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select r.id, s.id, true, true, true, true, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code in ('SUPER_ADMIN', 'ADMIN_FINANCE')
  and s.code = 'caisse'
on conflict (role_id, screen_id) do update set
  can_create = true,
  can_read = true,
  can_update = true,
  can_delete = true,
  can_print = true,
  can_export = true;
