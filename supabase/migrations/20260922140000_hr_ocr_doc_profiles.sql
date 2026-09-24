-- Marquer les 3 types OCR (MVP) dans le référentiel documents.

begin;

update public.hr_catalogs
set extra = coalesce(extra, '{}'::jsonb) || '{"ocr_enabled":true,"ocr_profile":"CNI"}'::jsonb
where kind = 'document_type' and code = 'CNI';

update public.hr_catalogs
set extra = coalesce(extra, '{}'::jsonb) || '{"ocr_enabled":true,"ocr_profile":"BIRTH"}'::jsonb
where kind = 'document_type' and code = 'BIRTH';

update public.hr_catalogs
set extra = coalesce(extra, '{}'::jsonb) || '{"ocr_enabled":true,"ocr_profile":"SS_REGISTRATION"}'::jsonb
where kind = 'document_type' and code = 'SS_REGISTRATION';

commit;
