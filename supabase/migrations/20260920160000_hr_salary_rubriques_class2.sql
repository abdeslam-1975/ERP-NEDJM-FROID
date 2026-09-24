-- Official GAS Excel: class 2 codes 200-203 exist without labels.
-- Keep them so the four classes are complete; SUPER_ADMIN can rename later.

begin;

insert into public.hr_salary_rubriques (
  code, label_ar, label_fr, nature, unit, category, cotisable, taxable, apply_scope, default_amount, sort_order, is_active
) values
  ('200', 'بند 200 (بدون تسمية في الملف)', 'Rubrique 200 (sans libellé dans le fichier)', 'indemnite', 'month', '2', true, false, 'contract', 0, 200, true),
  ('201', 'بند 201 (بدون تسمية في الملف)', 'Rubrique 201 (sans libellé dans le fichier)', 'indemnite', 'month', '2', true, false, 'contract', 0, 201, true),
  ('202', 'بند 202 (بدون تسمية في الملف)', 'Rubrique 202 (sans libellé dans le fichier)', 'indemnite', 'month', '2', true, false, 'contract', 0, 202, true),
  ('203', 'بند 203 (بدون تسمية في الملف)', 'Rubrique 203 (sans libellé dans le fichier)', 'indemnite', 'month', '2', true, false, 'contract', 0, 203, true)
on conflict (code) do update set
  category = excluded.category,
  cotisable = excluded.cotisable,
  taxable = excluded.taxable,
  sort_order = excluded.sort_order,
  is_active = true,
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr;

comment on table public.hr_salary_rubriques is
  'Dictionnaire issu de Les Rubriques de salaire.xlsx (classes 1-4, y compris 200-203 sans libellé source).';

commit;
