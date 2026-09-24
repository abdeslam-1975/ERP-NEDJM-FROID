-- بطاقة السوابق العدلية / Extrait du casier judiciaire
-- Slot téléversement fiche employé (sans OCR).

begin;

insert into public.hr_catalogs (kind, code, label_ar, label_fr, extra, sort_order, is_active)
values
  (
    'document_type',
    'CASIER_JUDICIAIRE',
    'بطاقة السوابق العدلية',
    'Extrait du casier judiciaire',
    '{"upload_slot":true,"block_level":"recruit"}'::jsonb,
    75,
    true
  )
on conflict (kind, code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  extra = coalesce(public.hr_catalogs.extra, '{}'::jsonb) || excluded.extra,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

commit;
