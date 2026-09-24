-- Add poste/affectation to the employee fiche; hide fields removed from the form.

begin;

insert into public.hr_employee_fields (
  code, label_ar, label_fr, value_type, catalog_kind, storage_group,
  section_ar, section_fr, sort_order, is_system, is_active, is_required
) values
  ('poste', 'المنصب', 'Poste occupé', 'text', null, 'extra',
    'III. الوضعية المهنية', 'III. Situation professionnelle', 505, false, true, false),
  ('affectation', 'التعيين', 'Affectation', 'text', null, 'extra',
    'III. الوضعية المهنية', 'III. Situation professionnelle', 508, false, true, false)
on conflict (code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  value_type = excluded.value_type,
  storage_group = excluded.storage_group,
  section_ar = excluded.section_ar,
  section_fr = excluded.section_fr,
  sort_order = excluded.sort_order,
  is_active = true,
  is_required = false;

update public.hr_employee_fields
set is_active = false
where code in (
  'commune_birth',
  'wilaya_birth',
  'birth_place_ar',
  'commune',
  'wilaya_code',
  'address_ar',
  'irg_category',
  'social_profile_code'
);

commit;
