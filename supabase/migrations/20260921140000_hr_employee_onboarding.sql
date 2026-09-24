-- Employee onboarding: docs bucket, document slots (catalog-driven), fiche PDF archive

begin;

-- ---------------------------------------------------------------------------
-- Storage: scanned documents + fiche PDF
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hr-docs',
  'hr-docs',
  true,
  15728640,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists hr_docs_select on storage.objects;
create policy hr_docs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'hr-docs');

drop policy if exists hr_docs_insert on storage.objects;
create policy hr_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'hr-docs'
    and (
      public.erp_has_perm('hr_documents', 'update', null)
      or public.erp_has_perm('employees', 'update', null)
    )
  );

drop policy if exists hr_docs_update on storage.objects;
create policy hr_docs_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'hr-docs'
    and (
      public.erp_has_perm('hr_documents', 'update', null)
      or public.erp_has_perm('employees', 'update', null)
    )
  );

drop policy if exists hr_docs_delete on storage.objects;
create policy hr_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'hr-docs'
    and (
      public.erp_has_perm('hr_documents', 'update', null)
      or public.erp_has_perm('employees', 'update', null)
    )
  );

-- ---------------------------------------------------------------------------
-- File metadata: display name + storage path; one slot per type per employee
-- ---------------------------------------------------------------------------
alter table public.hr_employee_files
  add column if not exists file_name text,
  add column if not exists storage_path text;

create unique index if not exists hr_employee_files_emp_type_uq
  on public.hr_employee_files (employee_id, doc_type_code);

-- ---------------------------------------------------------------------------
-- Document slots: driven by catalog (no app hardcode). Super Admin edits via UI.
-- extra.upload_slot=true → shown on employee fiche Documents tab
-- extra.auto_generated=true → system PDF (not a manual upload slot)
-- ---------------------------------------------------------------------------
insert into public.hr_catalogs (kind, code, label_ar, label_fr, extra, sort_order, is_active)
values
  ('document_type', 'CNI', 'نسخة بطاقة التعريف الوطنية', 'Carte nationale d''identité',
   '{"upload_slot":true,"block_level":"recruit"}'::jsonb, 10, true),
  ('document_type', 'DRIVING_LICENSE', 'رخصة السياقة', 'Permis de conduire',
   '{"upload_slot":true,"block_level":"recruit"}'::jsonb, 20, true),
  ('document_type', 'BIRTH', 'شهادة الميلاد', 'Acte de naissance',
   '{"upload_slot":true,"block_level":"recruit"}'::jsonb, 30, true),
  ('document_type', 'FAMILY_STATUS', 'الشهادة العائلية / الحالة المدنية', 'Fiche familiale / état civil',
   '{"upload_slot":true,"block_level":"recruit"}'::jsonb, 40, true),
  ('document_type', 'RESIDENCE', 'شهادة الإقامة', 'Certificat de résidence',
   '{"upload_slot":true,"block_level":"recruit"}'::jsonb, 50, true),
  ('document_type', 'PHOTO_ID', 'صورة شمسية', 'Photo d''identité',
   '{"upload_slot":true,"block_level":"recruit"}'::jsonb, 60, true),
  ('document_type', 'SS_REGISTRATION', 'شهادة التسجيل في الضمان الاجتماعي', 'Attestation CNAS',
   '{"upload_slot":true,"block_level":"recruit"}'::jsonb, 70, true),
  ('document_type', 'CCP_CHEQUE', 'صك بريدي مشطوب', 'Chèque postal barré / CCP',
   '{"upload_slot":true,"block_level":"grace"}'::jsonb, 80, true),
  ('document_type', 'MEDICAL_CHEST', 'شهادة طبية صدرية وعامة', 'Certificat médical (thorax + général)',
   '{"upload_slot":true,"block_level":"grace"}'::jsonb, 90, true),
  ('document_type', 'DIPLOMAS', 'نسخ الشهادات التعليمية أو المهنية', 'Diplômes / attestations de formation',
   '{"upload_slot":true,"block_level":"recruit"}'::jsonb, 100, true),
  ('document_type', 'WORK_CERTS', 'شهادات العمل', 'Attestations de travail',
   '{"upload_slot":true,"block_level":"recruit"}'::jsonb, 110, true),
  ('document_type', 'FICHE_RENSEIGNEMENTS', 'Fiche de renseignements', 'Fiche de renseignements',
   '{"upload_slot":false,"auto_generated":true}'::jsonb, 900, true)
on conflict (kind, code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  extra = excluded.extra,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

-- Align legacy codes: keep history but hide from fiche upload slots
update public.hr_catalogs
set extra = coalesce(extra, '{}'::jsonb) || '{"upload_slot":false}'::jsonb
where kind = 'document_type'
  and code in ('CONTRACT_SCAN', 'RIB', 'MEDICAL');

commit;
