-- Sonatrach penalty sits immediately before the pointage net.
begin;

update public.hr_attendance_columns set sort_order = 125 where code = 'NET_A_PAYER';
update public.hr_attendance_columns set sort_order = 140 where code = 'VALIDATION';

insert into public.hr_attendance_columns
  (code, label_fr, label_ar, kind, source, value_type, catalog_kind, sort_order, is_system)
values
  ('SANCTION_SONATRACH', 'Sanction Sonatrach', 'عقوبة سوناطراك', 'INPUT', null, 'number', null, 122, true)
on conflict (code) do update set
  label_fr = excluded.label_fr,
  label_ar = excluded.label_ar,
  kind = excluded.kind,
  value_type = excluded.value_type,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.hr_attendance_column_roles (column_id, role_id, can_view, can_edit)
select
  c.id,
  r.id,
  r.code <> 'CHEF_CHANTIER',
  false
from public.hr_attendance_columns c
cross join public.sys_roles r
where c.code = 'SANCTION_SONATRACH'
  and r.code <> 'SUPER_ADMIN'
on conflict (column_id, role_id) do update set
  can_view = excluded.can_view,
  can_edit = excluded.can_edit;

commit;
