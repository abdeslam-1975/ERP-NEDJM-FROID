-- Nombre d'enfants (situation familiale M / D / V) + métadonnée fiche.

begin;

alter table public.hr_employee_civil
  add column if not exists children_count integer
    check (children_count is null or (children_count >= 0 and children_count <= 30));

insert into public.hr_employee_fields (
  code, label_ar, label_fr, value_type, catalog_kind, storage_group,
  section_ar, section_fr, sort_order, is_system, is_active, is_required
) values (
  'children_count',
  'عدد الأبناء',
  'Nombre d''enfants',
  'number',
  null,
  'civil',
  'I. معلومات شخصية',
  'I. Informations personnelles',
  135,
  true,
  true,
  false
)
on conflict (code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  value_type = excluded.value_type,
  storage_group = excluded.storage_group,
  section_ar = excluded.section_ar,
  section_fr = excluded.section_fr,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  is_active = excluded.is_active;

comment on column public.hr_employee_civil.children_count is
  'Nombre d''enfants — pertinent si marital_code ∈ {M, D, V}. Obligatoire seulement si is_required sur hr_employee_fields.';

commit;
