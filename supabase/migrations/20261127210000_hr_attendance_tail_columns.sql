-- After the month days: NJ, commentaire, net à payer, validation.
begin;

update public.hr_attendance_columns set sort_order = 110 where code = 'NJ';
update public.hr_attendance_columns set sort_order = 120, label_fr = 'Commentaire' where code = 'COMMENTAIRE';
update public.hr_attendance_columns set sort_order = 140, label_fr = 'Validation' where code = 'VALIDATION';

insert into public.hr_attendance_columns
  (code, label_fr, label_ar, kind, source, value_type, catalog_kind, sort_order, is_system)
values
  ('NET_A_PAYER', 'Net à payer', 'الصافي للدفع', 'INPUT', null, 'number', null, 130, true)
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
  r.code in ('ADMIN_RH', 'GERANT', 'ADMIN_FINANCE')
from public.hr_attendance_columns c
cross join public.sys_roles r
where c.code = 'NET_A_PAYER'
  and r.code <> 'SUPER_ADMIN'
on conflict (column_id, role_id) do update set
  can_view = excluded.can_view,
  can_edit = excluded.can_edit;

commit;
