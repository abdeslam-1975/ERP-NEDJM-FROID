-- Employee fiche layout (photo storage + identity fields + section labels)

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hr-photos',
  'hr-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists hr_photos_select on storage.objects;
create policy hr_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'hr-photos');

drop policy if exists hr_photos_insert on storage.objects;
create policy hr_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'hr-photos'
    and public.erp_has_perm('employees', 'update', null)
  );

drop policy if exists hr_photos_update on storage.objects;
create policy hr_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'hr-photos'
    and public.erp_has_perm('employees', 'update', null)
  );

drop policy if exists hr_photos_delete on storage.objects;
create policy hr_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'hr-photos'
    and public.erp_has_perm('employees', 'update', null)
  );

insert into public.hr_employee_fields (
  code, label_ar, label_fr, value_type, catalog_kind, storage_group,
  section_ar, section_fr, sort_order, is_system, is_active, is_required
) values
  ('id_type_code', 'نوع الوثيقة', 'Type de pièce', 'catalog', 'id_type', 'extra',
    'II. وثيقة الهوية والعنوان', 'II. Pièce d''identité & adresse', 310, false, true, false),
  ('id_number', 'رقم الوثيقة', 'N° pièce', 'text', null, 'extra',
    'II. وثيقة الهوية والعنوان', 'II. Pièce d''identité & adresse', 320, false, true, false),
  ('id_issued_on', 'تاريخ الإصدار', 'Délivré le', 'date', null, 'extra',
    'II. وثيقة الهوية والعنوان', 'II. Pièce d''identité & adresse', 330, false, true, false),
  ('id_expires_on', 'تاريخ الانتهاء', 'Expire le', 'date', null, 'extra',
    'II. وثيقة الهوية والعنوان', 'II. Pièce d''identité & adresse', 340, false, true, false),
  ('id_issued_by', 'صادرة عن', 'Par la daïra de', 'text', null, 'extra',
    'II. وثيقة الهوية والعنوان', 'II. Pièce d''identité & adresse', 350, false, true, false)
on conflict (code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  value_type = excluded.value_type,
  catalog_kind = excluded.catalog_kind,
  section_ar = excluded.section_ar,
  section_fr = excluded.section_fr,
  sort_order = excluded.sort_order,
  is_active = true;

update public.hr_employee_fields set
  section_ar = 'رأس البطاقة',
  section_fr = 'En-tête',
  sort_order = case code
    when 'photo_url' then 1
    when 'matricule' then 2
    when 'status' then 3
    when 'last_name' then 4
    when 'first_name' then 5
    when 'last_name_ar' then 6
    when 'first_name_ar' then 7
    when 'nss' then 8
    else sort_order
  end
where code in ('photo_url','matricule','status','last_name','first_name','last_name_ar','first_name_ar','nss');

update public.hr_employee_fields set
  section_ar = 'I. معلومات شخصية',
  section_fr = 'I. Informations personnelles',
  sort_order = case code
    when 'birth_date' then 100
    when 'birth_place_fr' then 110
    when 'birth_act_no' then 120
    when 'marital_code' then 130
    when 'sex_code' then 140
    when 'blood_code' then 150
    when 'father_name' then 160
    when 'mother_name' then 170
    when 'nationality' then 180
    when 'commune_birth' then 190
    when 'wilaya_birth' then 200
    when 'birth_place_ar' then 210
    else sort_order
  end
where code in (
  'birth_date','birth_place_fr','birth_place_ar','birth_act_no','marital_code',
  'sex_code','blood_code','father_name','mother_name','nationality','commune_birth','wilaya_birth'
);

update public.hr_employee_fields set
  section_ar = 'II. وثيقة الهوية والعنوان',
  section_fr = 'II. Pièce d''identité & adresse',
  sort_order = case code
    when 'nin' then 360
    when 'commune' then 370
    when 'wilaya_code' then 380
    when 'postal_code' then 390
    when 'address_fr' then 400
    when 'address_ar' then 410
    else sort_order
  end
where code in ('nin','commune','wilaya_code','postal_code','address_fr','address_ar');

update public.hr_employee_fields set
  section_ar = 'III. الوضعية المهنية',
  section_fr = 'III. Situation professionnelle',
  sort_order = case code
    when 'hired_at' then 500
    when 'declaration_date' then 510
    when 'payment_mode_code' then 520
    when 'account_no' then 530
    when 'account_key' then 540
    when 'email' then 550
    when 'level_code' then 560
    when 'diploma_fr' then 570
    when 'diploma_ar' then 580
    when 'experience_years' then 590
    when 'phone' then 600
    when 'whatsapp' then 610
    when 'languages' then 620
    when 'irg_category' then 630
    when 'social_profile_code' then 640
    else sort_order
  end
where code in (
  'hired_at','declaration_date','payment_mode_code','account_no','account_key','email',
  'level_code','diploma_fr','diploma_ar','experience_years','phone','whatsapp','languages',
  'irg_category','social_profile_code'
);

commit;
