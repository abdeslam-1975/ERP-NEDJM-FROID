-- Fiche Employé : postes organisés, niveaux d'études, affectation, ordre des champs.

begin;

-- ─── Affectation (Administration + ateliers éditables en catalogue) ───
insert into public.hr_catalog_kinds (code, label_ar, label_fr, extra_hint, sort_order, is_active)
values (
  'affectation',
  'التعيين',
  'Affectation',
  'Administration + options hors chantiers. Les chantiers actifs s''ajoutent automatiquement dans la fiche.',
  85,
  true
)
on conflict (code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  extra_hint = excluded.extra_hint,
  is_active = true;

insert into public.hr_catalogs (kind, code, label_ar, label_fr, extra, sort_order, is_active)
values (
  'affectation',
  'ADMINISTRATION',
  'الإدارة',
  'Administration',
  '{"source":"fixed"}'::jsonb,
  10,
  true
)
on conflict (kind, code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  is_active = true,
  sort_order = excluded.sort_order;

-- Synchroniser les chantiers actifs vers le catalogue (codes = SITE_<uuid sans tirets trop longs → use site id)
insert into public.hr_catalogs (kind, code, label_ar, label_fr, extra, sort_order, is_active)
select
  'affectation',
  'SITE:' || s.id::text,
  coalesce(nullif(trim(s.name_ar), ''), s.name_fr),
  s.name_fr,
  jsonb_build_object('source', 'site', 'site_id', s.id::text),
  100 + row_number() over (order by s.name_fr),
  true
from public.ref_sites s
where s.is_active is true
on conflict (kind, code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  extra = excluded.extra,
  is_active = true,
  sort_order = excluded.sort_order;

-- ─── Niveaux d'études (du plus bas au plus haut) ───
update public.hr_catalogs
set is_active = false
where kind = 'study_level'
  and code not in (
    'CEP', 'BEM', 'CAP', 'BT', 'BAC', 'TS', 'LICENCE', 'MASTER'
  );

insert into public.hr_catalogs (kind, code, label_ar, label_fr, extra, sort_order, is_active)
values
  ('study_level', 'CEP', 'شهادة التعليم الابتدائي', 'Certificat d''enseignement primaire', '{}'::jsonb, 10, true),
  ('study_level', 'BEM', 'شهادة التعليم المتوسط', 'Brevet d''enseignement moyen', '{}'::jsonb, 20, true),
  ('study_level', 'CAP', 'شهادة الكفاءة المهنية', 'Certificat d''aptitude professionnelle', '{}'::jsonb, 30, true),
  ('study_level', 'BT', 'شهادة تقني', 'Brevet de technicien', '{}'::jsonb, 40, true),
  ('study_level', 'BAC', 'بكالوريا', 'Baccalauréat', '{}'::jsonb, 50, true),
  ('study_level', 'TS', 'تقني سامي', 'Technicien supérieur / DEUA', '{}'::jsonb, 60, true),
  ('study_level', 'LICENCE', 'ليسانس', 'Licence', '{}'::jsonb, 70, true),
  ('study_level', 'MASTER', 'ماستر', 'Master', '{}'::jsonb, 80, true)
on conflict (kind, code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  sort_order = excluded.sort_order,
  is_active = true;

-- ─── Postes (job_title) par catégorie ───
update public.hr_catalogs
set is_active = false
where kind = 'job_title';

insert into public.hr_catalogs (kind, code, label_ar, label_fr, extra, sort_order, is_active)
values
  -- Ingénieurs / Cadres
  ('job_title', 'INGENIEUR', 'مهندس', 'Ingénieur',
    '{"category_fr":"Ingénieurs / Cadres","category_ar":"مهندسون / إطارات"}'::jsonb, 110, true),
  ('job_title', 'ING_ELECTROMECANIQUE', 'مهندس كهروميكانيك', 'Ingénieur électro-mécanique',
    '{"category_fr":"Ingénieurs / Cadres","category_ar":"مهندسون / إطارات"}'::jsonb, 120, true),
  ('job_title', 'ING_FROID_CLIM', 'مهندس تبريد وتكييف', 'Ingénieur en froid et climatisation',
    '{"category_fr":"Ingénieurs / Cadres","category_ar":"مهندسون / إطارات"}'::jsonb, 130, true),
  -- Techniciens
  ('job_title', 'TECHNICIEN_SUPERIEUR', 'تقني سامي', 'Technicien supérieur',
    '{"category_fr":"Techniciens Supérieurs & Techniciens","category_ar":"تقنيون سامون وتقنيون"}'::jsonb, 210, true),
  ('job_title', 'TS_FROID', 'تقني سامي تبريد', 'TS en Froid / TS en Froid HVAC',
    '{"category_fr":"Techniciens Supérieurs & Techniciens","category_ar":"تقنيون سامون وتقنيون"}'::jsonb, 220, true),
  ('job_title', 'TECH_FROID_HVAC', 'تقني تبريد HVAC', 'Technicien en Froid HVAC',
    '{"category_fr":"Techniciens Supérieurs & Techniciens","category_ar":"تقنيون سامون وتقنيون"}'::jsonb, 230, true),
  -- Ouvriers
  ('job_title', 'ELECTROMECANICIEN', 'كهروميكانيكي', 'Électromécanicien',
    '{"category_fr":"Ouvriers Qualifiés / Spécialisés","category_ar":"عمال مؤهلون / متخصصون"}'::jsonb, 310, true),
  ('job_title', 'ELECTRICIEN_INDUSTRIEL', 'كهربائي صناعي', 'Électricien industriel',
    '{"category_fr":"Ouvriers Qualifiés / Spécialisés","category_ar":"عمال مؤهلون / متخصصون"}'::jsonb, 320, true),
  ('job_title', 'ELECTRICIEN_BATIMENT', 'كهربائي مباني', 'Électricien bâtiment',
    '{"category_fr":"Ouvriers Qualifiés / Spécialisés","category_ar":"عمال مؤهلون / متخصصون"}'::jsonb, 330, true),
  ('job_title', 'FRIGORISTE', 'فني تبريد', 'Frigoriste',
    '{"category_fr":"Ouvriers Qualifiés / Spécialisés","category_ar":"عمال مؤهلون / متخصصون"}'::jsonb, 340, true),
  ('job_title', 'CHAUFFEUR', 'سائق', 'Chauffeur',
    '{"category_fr":"Ouvriers Qualifiés / Spécialisés","category_ar":"عمال مؤهلون / متخصصون"}'::jsonb, 350, true),
  ('job_title', 'FACTOTUM', 'عامل متعدد المهام', 'Factotum',
    '{"category_fr":"Ouvriers Qualifiés / Spécialisés","category_ar":"عمال مؤهلون / متخصصون"}'::jsonb, 360, true),
  ('job_title', 'AGENT_FRIGORISTE', 'عون تبريد', 'Agent frigoriste',
    '{"category_fr":"Ouvriers Qualifiés / Spécialisés","category_ar":"عمال مؤهلون / متخصصون"}'::jsonb, 370, true),
  -- Aides
  ('job_title', 'AIDE_FRIGORISTE', 'مساعد تبريد', 'Aide frigoriste',
    '{"category_fr":"Aides / Assistants","category_ar":"مساعدون"}'::jsonb, 410, true),
  ('job_title', 'AIDE_ELECTRICIEN', 'مساعد كهربائي', 'Aide électricien',
    '{"category_fr":"Aides / Assistants","category_ar":"مساعدون"}'::jsonb, 420, true)
on conflict (kind, code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  extra = excluded.extra,
  sort_order = excluded.sort_order,
  is_active = true;

-- ─── Métadonnées champs fiche ───
update public.hr_employee_fields set
  label_fr = 'Poste Occupé',
  label_ar = 'المنصب',
  value_type = 'catalog',
  catalog_kind = 'job_title',
  section_fr = 'III. Situation professionnelle',
  section_ar = 'III. الوضعية المهنية',
  sort_order = 500,
  is_active = true
where code = 'poste';

update public.hr_employee_fields set
  label_fr = 'Affectation',
  label_ar = 'التعيين',
  value_type = 'catalog',
  catalog_kind = 'affectation',
  section_fr = 'III. Situation professionnelle',
  section_ar = 'III. الوضعية المهنية',
  sort_order = 510,
  is_active = true
where code = 'affectation';

update public.hr_employee_fields set
  label_fr = 'Date de recrutement',
  label_ar = 'تاريخ التوظيف',
  section_fr = 'III. Situation professionnelle',
  section_ar = 'III. الوضعية المهنية',
  sort_order = 520,
  is_active = true
where code = 'hired_at';

update public.hr_employee_fields set
  label_fr = 'Date de déclaration',
  label_ar = 'تاريخ التصريح',
  section_fr = 'III. Situation professionnelle',
  section_ar = 'III. الوضعية المهنية',
  sort_order = 530,
  is_active = true
where code = 'declaration_date';

-- Éviter A+ / A+ en base si label_ar = label_fr déjà (affichage corrigé côté UI aussi)
update public.hr_catalogs
set label_ar = label_fr
where kind = 'blood' and label_ar = label_fr;

commit;
