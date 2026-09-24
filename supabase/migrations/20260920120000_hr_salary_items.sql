-- Rubriques de salaire: managed from RH Paramètres, not hardcoded.

begin;

insert into public.hr_catalog_kinds (code, label_ar, label_fr, extra_hint, sort_order, is_active)
values (
  'salary_item',
  'بنود الأجر',
  'Rubriques de salaire',
  '{"nature":"indemnite|prime|retenue","amount":"montant","taxable":"imposable","unit":"month|day"}',
  82,
  true
)
on conflict (code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  extra_hint = excluded.extra_hint,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.hr_catalogs (kind, code, label_ar, label_fr, extra, sort_order, is_active)
values
  (
    'salary_item',
    'PANIER',
    'وجبة العامل',
    'Indemnité de panier',
    '{"nature":"indemnite","amount":0,"taxable":false,"unit":"month"}'::jsonb,
    10,
    true
  ),
  (
    'salary_item',
    'HYGIENE',
    'مستلزمات النظافة',
    'Indemnité d''hygiène',
    '{"nature":"indemnite","amount":0,"taxable":false,"unit":"month"}'::jsonb,
    20,
    true
  )
on conflict (kind, code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  extra = excluded.extra,
  is_active = true;

comment on table public.hr_catalogs is
  'Listes RH 100% UI, y compris les rubriques de salaire (kind=salary_item).';

commit;
