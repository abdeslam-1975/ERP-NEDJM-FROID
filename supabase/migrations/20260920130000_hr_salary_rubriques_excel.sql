-- Rubriques de salaire extracted from "Les Rubriques de salaire.xlsx".
-- Dictionary only: amounts and later payroll use stay UI-managed, not hardcoded.

begin;

insert into public.hr_catalog_kinds (code, label_ar, label_fr, extra_hint, sort_order, is_active)
values
  (
    'salary_tax_class',
    'صنف البند',
    'Classe cotisable / imposable',
    '{"cotisable":true,"taxable":true}',
    81,
    true
  ),
  (
    'salary_item',
    'بنود الأجر',
    'Rubriques de salaire',
    '{"nature":"indemnite|prime|rappel|remboursement","amount":"montant","taxable":"imposable","cotisable":"cotisable","unit":"month|day|percent","category":"1|2|3|4"}',
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
    'salary_tax_class',
    '1',
    'خاضع للضمان والضريبة',
    'Salaire Cotisable/Imposable',
    '{"cotisable":true,"taxable":true}'::jsonb,
    1,
    true
  ),
  (
    'salary_tax_class',
    '2',
    'خاضع للضمان وغير خاضع للضريبة',
    'Salaire Cotisable/Non Imposable',
    '{"cotisable":true,"taxable":false}'::jsonb,
    2,
    true
  ),
  (
    'salary_tax_class',
    '3',
    'خاضع للضريبة وغير خاضع للضمان',
    'Salaire Imposable Non Cotisable',
    '{"cotisable":false,"taxable":true}'::jsonb,
    3,
    true
  ),
  (
    'salary_tax_class',
    '4',
    'غير خاضع للضمان ولا للضريبة',
    'Salaire Non Cotisable et Non Imposable',
    '{"cotisable":false,"taxable":false}'::jsonb,
    4,
    true
  )
on conflict (kind, code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  extra = excluded.extra,
  is_active = true;

insert into public.hr_catalogs (kind, code, label_ar, label_fr, extra, sort_order, is_active)
values
  ('salary_item', '101', 'تدارك الأجر', 'Rappel Salaire',
    '{"nature":"rappel","amount":0,"unit":"day","category":"1","cotisable":true,"taxable":true,"rate_label":"Rappel Salaire*J"}'::jsonb, 101, true),
  ('salary_item', '102', 'تعويض الساعات الإضافية', 'Indemnité des Heures Supplémentaires',
    '{"nature":"indemnite","amount":0,"unit":"day","category":"1","cotisable":true,"taxable":true,"rate_label":"Indemnité des H/S*J"}'::jsonb, 102, true),
  ('salary_item', '103', 'تعويض العطلة/الاسترجاع', 'Indemnité du Congés/Récup',
    '{"nature":"indemnite","amount":0,"unit":"day","category":"1","cotisable":true,"taxable":true,"rate_label":"Indemnité du Congés/Récup*J"}'::jsonb, 103, true),
  ('salary_item', '104', 'تعويض العطلة السنوية', 'Indemnité du Congés Annuel',
    '{"nature":"indemnite","amount":0,"unit":"day","category":"1","cotisable":true,"taxable":true,"rate_label":"Indemnité du Congés Annuel*J"}'::jsonb, 104, true),
  ('salary_item', '105', 'تعويض الخبرة المهنية', 'Indemnité Experience Professionnelle',
    '{"nature":"indemnite","amount":0,"unit":"percent","category":"1","cotisable":true,"taxable":true,"rate_label":"Ind/Exp/Prof *%"}'::jsonb, 105, true),
  ('salary_item', '106', 'تعويض الإزعاج', 'Indemnité de Nuisance',
    '{"nature":"indemnite","amount":0,"unit":"month","category":"1","cotisable":true,"taxable":true,"rate_label":"Indemnité de Nuisance/F"}'::jsonb, 106, true),
  ('salary_item', '107', 'منحة المسؤولية', 'Prime de Responsabilité',
    '{"nature":"prime","amount":0,"unit":"percent","category":"1","cotisable":true,"taxable":true,"rate_label":"% Prime de Responsabilité"}'::jsonb, 107, true),
  ('salary_item', '108', 'منحة الخطر', 'Prime de Risque',
    '{"nature":"prime","amount":0,"unit":"percent","category":"1","cotisable":true,"taxable":true,"rate_label":"%Prime de Risque"}'::jsonb, 108, true),
  ('salary_item', '109', 'منحة السياقة', 'Prime de Conduite',
    '{"nature":"prime","amount":0,"unit":"day","category":"1","cotisable":true,"taxable":true,"rate_label":"Prime de Conduite / J"}'::jsonb, 109, true),
  ('salary_item', '110', 'منحة المردود الجماعي', 'Prime de Rendement Collectif',
    '{"nature":"prime","amount":0,"unit":"month","category":"1","cotisable":true,"taxable":true,"rate_label":"Prime de Rendement Collectif / F"}'::jsonb, 110, true),
  ('salary_item', '111', 'منحة المردود الفردي', 'Prime de Rendement Individuel',
    '{"nature":"prime","amount":0,"unit":"month","category":"1","cotisable":true,"taxable":true,"rate_label":"Prime de Rendement Individuel / F"}'::jsonb, 111, true),
  ('salary_item', '301', 'تعويض النقل', 'Indemnité de Transport',
    '{"nature":"indemnite","amount":0,"unit":"day","category":"3","cotisable":false,"taxable":true,"rate_label":"Indemnité de Transport/J"}'::jsonb, 301, true),
  ('salary_item', '302', 'وجبة العامل', 'Prime de Panier des Jours Travaillés',
    '{"nature":"prime","amount":0,"unit":"day","category":"3","cotisable":false,"taxable":true,"rate_label":"Prime de Panier des Jours Travaillés / J"}'::jsonb, 302, true),
  ('salary_item', '303', 'مستلزمات النظافة', 'Salissure',
    '{"nature":"indemnite","amount":0,"unit":"month","category":"3","cotisable":false,"taxable":true,"rate_label":"Salissure / F"}'::jsonb, 303, true),
  ('salary_item', '400', 'تعويض المنطقة المعزولة', 'Indemnité Forfaitaire Région Isolée',
    '{"nature":"indemnite","amount":0,"unit":"day","category":"4","cotisable":false,"taxable":false,"rate_label":"Indemn-Forf Region Isolée des Jrs/T*J"}'::jsonb, 400, true),
  ('salary_item', '401', 'تدارك تعويض المنطقة المعزولة', 'Rappel Indemnité Forfaitaire Région Isolée',
    '{"nature":"rappel","amount":0,"unit":"day","category":"4","cotisable":false,"taxable":false,"rate_label":"Rappel Indemn-Forf Region Isolée*J"}'::jsonb, 401, true),
  ('salary_item', '402', 'منحة العيد', 'Prime de l''Aïd',
    '{"nature":"prime","amount":0,"unit":"month","category":"4","cotisable":false,"taxable":false,"rate_label":"Prime de L''Aid / F"}'::jsonb, 402, true),
  ('salary_item', '403', 'منحة الزواج', 'Prime de Mariage',
    '{"nature":"prime","amount":0,"unit":"month","category":"4","cotisable":false,"taxable":false,"rate_label":"Prime de Mariage / F"}'::jsonb, 403, true),
  ('salary_item', '404', 'تعويض الوفاة', 'Indemnité de Décès',
    '{"nature":"indemnite","amount":0,"unit":"day","category":"4","cotisable":false,"taxable":false,"rate_label":"Indemnité de Décès*J"}'::jsonb, 404, true),
  ('salary_item', '405', 'تعويض المركبة', 'Indemnité de Véhicule',
    '{"nature":"indemnite","amount":0,"unit":"day","category":"4","cotisable":false,"taxable":false,"rate_label":"Indemnité de Véhicule / j"}'::jsonb, 405, true),
  ('salary_item', '406', 'استرجاع تكاليف الهاتف', 'Remboursement des Communications Téléphoniques',
    '{"nature":"remboursement","amount":0,"unit":"month","category":"4","cotisable":false,"taxable":false,"rate_label":"Remboursement des Communications Téléphonique /F"}'::jsonb, 406, true)
on conflict (kind, code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  extra = case
    when coalesce((public.hr_catalogs.extra->>'amount')::numeric, 0) <> 0
      then jsonb_set(excluded.extra, '{amount}', public.hr_catalogs.extra->'amount')
    else excluded.extra
  end,
  sort_order = excluded.sort_order,
  is_active = true;

update public.hr_catalogs
set is_active = false
where kind = 'salary_item'
  and code in ('PANIER', 'HYGIENE');

commit;
