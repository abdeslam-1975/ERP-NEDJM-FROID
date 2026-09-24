-- Employee grid columns are UI-defined. Custom values live in hr_employees.attrs.

begin;

alter table public.hr_employees
  add column if not exists attrs jsonb not null default '{}'::jsonb;

create table if not exists public.hr_employee_fields (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label_ar text not null,
  label_fr text not null,
  value_type text not null default 'text'
    check (value_type in ('text', 'date', 'number', 'catalog')),
  catalog_kind text references public.hr_catalog_kinds(code),
  storage_group text not null default 'extra'
    check (storage_group in (
      'core', 'civil', 'contacts', 'bank', 'social', 'qualifications', 'extra'
    )),
  section_ar text,
  section_fr text,
  sort_order integer not null default 0,
  is_system boolean not null default false,
  is_active boolean not null default true,
  is_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hr_employee_fields_sort_idx
  on public.hr_employee_fields (is_active, sort_order);

drop trigger if exists trg_hr_emp_fields_u on public.hr_employee_fields;
create trigger trg_hr_emp_fields_u before update on public.hr_employee_fields
  for each row execute function public.erp_set_updated_at();

alter table public.hr_employee_fields enable row level security;

drop policy if exists hr_emp_fields_read on public.hr_employee_fields;
create policy hr_emp_fields_read on public.hr_employee_fields
  for select to authenticated
  using (public.erp_has_perm('employees','read', null));

drop policy if exists hr_emp_fields_write on public.hr_employee_fields;
create policy hr_emp_fields_write on public.hr_employee_fields
  for all to authenticated
  using (public.erp_has_perm('employees','update', null))
  with check (public.erp_has_perm('employees','update', null));

grant select, insert, update, delete on public.hr_employee_fields to authenticated;

insert into public.hr_employee_fields (
  code, label_ar, label_fr, value_type, catalog_kind, storage_group,
  section_ar, section_fr, sort_order, is_system, is_active, is_required
) values
  ('matricule', 'الرقم', 'Matricule', 'text', null, 'core', 'الهوية', 'Identité', 10, true, true, true),
  ('status', 'الحالة', 'Statut', 'text', null, 'core', 'الهوية', 'Identité', 20, true, true, true),
  ('last_name', 'اللقب باللاتينية', 'Nom', 'text', null, 'core', 'الهوية', 'Identité', 30, true, true, true),
  ('first_name', 'الاسم باللاتينية', 'Prénom', 'text', null, 'core', 'الهوية', 'Identité', 40, true, true, true),
  ('last_name_ar', 'اللقب', 'Nom AR', 'text', null, 'core', 'الهوية', 'Identité', 50, true, true, false),
  ('first_name_ar', 'الاسم', 'Prénom AR', 'text', null, 'core', 'الهوية', 'Identité', 60, true, true, false),
  ('nss', 'رقم الضمان', 'NSS', 'text', null, 'core', 'الهوية', 'Identité', 70, true, true, false),
  ('nin', 'رقم التعريف', 'NIN', 'text', null, 'core', 'الهوية', 'Identité', 80, true, true, false),
  ('birth_date', 'تاريخ الميلاد', 'Naissance', 'date', null, 'core', 'الهوية', 'Identité', 90, true, true, false),
  ('hired_at', 'تاريخ التوظيف', 'Embauche', 'date', null, 'core', 'الهوية', 'Identité', 100, true, true, false),
  ('photo_url', 'صورة', 'Photo', 'text', null, 'core', 'الهوية', 'Identité', 110, true, true, false),
  ('irg_category', 'صنف الضريبة', 'IRG', 'text', null, 'core', 'الهوية', 'Identité', 120, true, true, false),
  ('sex_code', 'الجنس', 'Sexe', 'catalog', 'sex', 'civil', 'الحالة المدنية', 'État civil', 200, true, true, false),
  ('marital_code', 'الوضعية العائلية', 'Situation', 'catalog', 'marital', 'civil', 'الحالة المدنية', 'État civil', 210, true, true, false),
  ('blood_code', 'فصيلة الدم', 'Groupe sanguin', 'catalog', 'blood', 'civil', 'الحالة المدنية', 'État civil', 220, true, true, false),
  ('birth_place_fr', 'مكان الميلاد لاتيني', 'Lieu naissance FR', 'text', null, 'civil', 'الحالة المدنية', 'État civil', 230, true, true, false),
  ('birth_place_ar', 'مكان الميلاد', 'Lieu naissance AR', 'text', null, 'civil', 'الحالة المدنية', 'État civil', 240, true, true, false),
  ('birth_act_no', 'رقم عقد الميلاد', 'N° acte', 'text', null, 'civil', 'الحالة المدنية', 'État civil', 250, true, true, false),
  ('father_name', 'الأب', 'Père', 'text', null, 'civil', 'الحالة المدنية', 'État civil', 260, true, true, false),
  ('mother_name', 'الأم', 'Mère', 'text', null, 'civil', 'الحالة المدنية', 'État civil', 270, true, true, false),
  ('nationality', 'الجنسية', 'Nationalité', 'text', null, 'civil', 'الحالة المدنية', 'État civil', 280, true, true, false),
  ('wilaya_birth', 'ولاية الميلاد', 'Wilaya naissance', 'text', null, 'civil', 'الحالة المدنية', 'État civil', 290, true, true, false),
  ('commune_birth', 'بلدية الميلاد', 'Commune naissance', 'text', null, 'civil', 'الحالة المدنية', 'État civil', 300, true, true, false),
  ('address_fr', 'العنوان لاتيني', 'Adresse FR', 'text', null, 'contacts', 'التواصل', 'Contact', 400, true, true, false),
  ('address_ar', 'العنوان', 'Adresse AR', 'text', null, 'contacts', 'التواصل', 'Contact', 410, true, true, false),
  ('wilaya_code', 'الولاية', 'Wilaya', 'text', null, 'contacts', 'التواصل', 'Contact', 420, true, true, false),
  ('commune', 'البلدية', 'Commune', 'text', null, 'contacts', 'التواصل', 'Contact', 430, true, true, false),
  ('postal_code', 'الرمز البريدي', 'Code postal', 'text', null, 'contacts', 'التواصل', 'Contact', 440, true, true, false),
  ('phone', 'الهاتف', 'Téléphone', 'text', null, 'contacts', 'التواصل', 'Contact', 450, true, true, false),
  ('whatsapp', 'واتساب', 'WhatsApp', 'text', null, 'contacts', 'التواصل', 'Contact', 460, true, true, false),
  ('email', 'البريد', 'Email', 'text', null, 'contacts', 'التواصل', 'Contact', 470, true, true, false),
  ('payment_mode_code', 'طريقة الدفع', 'Paiement', 'catalog', 'payment_mode', 'bank', 'الحساب', 'Banque', 500, true, true, false),
  ('account_no', 'رقم الحساب', 'N° compte', 'text', null, 'bank', 'الحساب', 'Banque', 510, true, true, false),
  ('account_key', 'المفتاح', 'Clé', 'text', null, 'bank', 'الحساب', 'Banque', 520, true, true, false),
  ('declaration_date', 'تاريخ التصريح', 'Déclaration', 'date', null, 'social', 'الضمان', 'Social', 600, true, true, false),
  ('social_profile_code', 'ملف الاشتراك', 'Profil social', 'catalog', 'social_profile', 'social', 'الضمان', 'Social', 610, true, true, false),
  ('level_code', 'المستوى', 'Niveau', 'catalog', 'study_level', 'qualifications', 'المؤهلات', 'Qualifications', 700, true, true, false),
  ('diploma_fr', 'الشهادة لاتيني', 'Diplôme FR', 'text', null, 'qualifications', 'المؤهلات', 'Qualifications', 710, true, true, false),
  ('diploma_ar', 'الشهادة', 'Diplôme AR', 'text', null, 'qualifications', 'المؤهلات', 'Qualifications', 720, true, true, false),
  ('experience_years', 'سنوات الخبرة', 'Expérience', 'number', null, 'qualifications', 'المؤهلات', 'Qualifications', 730, true, true, false),
  ('languages', 'اللغات', 'Langues', 'text', null, 'qualifications', 'المؤهلات', 'Qualifications', 740, true, true, false)
on conflict (code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  value_type = excluded.value_type,
  catalog_kind = excluded.catalog_kind,
  storage_group = excluded.storage_group,
  section_ar = excluded.section_ar,
  section_fr = excluded.section_fr,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  is_required = excluded.is_required;

comment on table public.hr_employee_fields is
  'Colonnes de la fiche employé. Ajout/suppression depuis l''écran, pas depuis le code.';

commit;
