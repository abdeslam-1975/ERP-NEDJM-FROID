-- ADMIN_RH / GERANT / ADMIN_FINANCE may read the IRG barème used by payroll.
-- Write remains SUPER_ADMIN (RLS on ref_bareme_irg*).

begin;

insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select r.id, s.id, false, true, false, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code in ('ADMIN_RH', 'GERANT', 'ADMIN_FINANCE')
  and s.code = 'irg'
on conflict (role_id, screen_id) do update set
  can_read = true,
  can_print = true,
  can_export = true;

commit;
