-- Official employee form labels and fields from the previous HR fiche.

begin;

update public.hr_employee_fields
set is_active = true,
    label_fr = 'Commune de naissance',
    label_ar = 'بلدية الميلاد',
    sort_order = 185,
    section_ar = 'I. معلومات شخصية',
    section_fr = 'I. Informations personnelles'
where code = 'commune_birth';

update public.hr_employee_fields
set is_active = true,
    label_fr = 'Commune (Résidence)',
    label_ar = 'بلدية الإقامة',
    sort_order = 365,
    section_ar = 'II. وثيقة الهوية والعنوان',
    section_fr = 'II. Pièce d''identité & adresse'
where code = 'commune';

update public.hr_employee_fields
set is_active = true,
    label_fr = 'Wilaya',
    label_ar = 'الولاية',
    sort_order = 370,
    section_ar = 'II. وثيقة الهوية والعنوان',
    section_fr = 'II. Pièce d''identité & adresse'
where code = 'wilaya_code';

update public.hr_employee_fields
set label_fr = 'Poste Occupé',
    label_ar = 'المنصب',
    catalog_kind = 'job_title',
    value_type = 'catalog'
where code = 'poste';

update public.hr_employee_fields
set label_fr = 'Affectation (Contrat)',
    label_ar = 'التعيين'
where code = 'affectation';

update public.hr_employee_fields
set label_fr = 'CCP / RIP',
    label_ar = 'رقم الحساب'
where code = 'account_no';

update public.hr_employee_fields
set label_fr = 'Tél (+213)',
    label_ar = 'الهاتف'
where code = 'phone';

update public.hr_employee_fields
set label_fr = 'WhatsApp (+213)',
    label_ar = 'واتساب'
where code = 'whatsapp';

update public.hr_employee_fields
set label_fr = 'Adresse Résidentielle',
    label_ar = 'العنوان'
where code = 'address_fr';

update public.hr_employee_fields
set is_active = false
where code in (
  'payment_mode_code',
  'account_key',
  'diploma_ar',
  'wilaya_birth',
  'birth_place_ar',
  'address_ar',
  'irg_category',
  'social_profile_code'
);

commit;
