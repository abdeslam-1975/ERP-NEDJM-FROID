-- Employee fiche print/form layout is stored in DB and edited from the RH UI.

begin;

insert into public.hr_catalog_kinds (code, label_ar, label_fr, extra_hint, sort_order, is_active)
values ('wilaya', 'الولاية', 'Wilaya', 'Liste des wilayas', 80, true)
on conflict (code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  is_active = true;

insert into public.hr_catalogs (kind, code, label_ar, label_fr, extra, sort_order)
values
  ('wilaya', 'Adrar', 'أدرار', 'Adrar', '{}'::jsonb, 1),
  ('wilaya', 'Chlef', 'الشلف', 'Chlef', '{}'::jsonb, 2),
  ('wilaya', 'Laghouat', 'الأغواط', 'Laghouat', '{}'::jsonb, 3),
  ('wilaya', 'Oum El Bouaghi', 'أم البواقي', 'Oum El Bouaghi', '{}'::jsonb, 4),
  ('wilaya', 'Batna', 'باتنة', 'Batna', '{}'::jsonb, 5),
  ('wilaya', 'Béjaïa', 'بجاية', 'Béjaïa', '{}'::jsonb, 6),
  ('wilaya', 'Biskra', 'بسكرة', 'Biskra', '{}'::jsonb, 7),
  ('wilaya', 'Béchar', 'بشار', 'Béchar', '{}'::jsonb, 8),
  ('wilaya', 'Blida', 'البليدة', 'Blida', '{}'::jsonb, 9),
  ('wilaya', 'Bouira', 'البويرة', 'Bouira', '{}'::jsonb, 10),
  ('wilaya', 'Tamanrasset', 'تمنراست', 'Tamanrasset', '{}'::jsonb, 11),
  ('wilaya', 'Tébessa', 'تبسة', 'Tébessa', '{}'::jsonb, 12),
  ('wilaya', 'Tlemcen', 'تلمسان', 'Tlemcen', '{}'::jsonb, 13),
  ('wilaya', 'Tiaret', 'تيارت', 'Tiaret', '{}'::jsonb, 14),
  ('wilaya', 'Tizi Ouzou', 'تيزي وزو', 'Tizi Ouzou', '{}'::jsonb, 15),
  ('wilaya', 'Alger', 'الجزائر', 'Alger', '{}'::jsonb, 16),
  ('wilaya', 'Djelfa', 'الجلفة', 'Djelfa', '{}'::jsonb, 17),
  ('wilaya', 'Jijel', 'جيجل', 'Jijel', '{}'::jsonb, 18),
  ('wilaya', 'Sétif', 'سطيف', 'Sétif', '{}'::jsonb, 19),
  ('wilaya', 'Saïda', 'سعيدة', 'Saïda', '{}'::jsonb, 20),
  ('wilaya', 'Skikda', 'سكيكدة', 'Skikda', '{}'::jsonb, 21),
  ('wilaya', 'Sidi Bel Abbès', 'سيدي بلعباس', 'Sidi Bel Abbès', '{}'::jsonb, 22),
  ('wilaya', 'Annaba', 'عنابة', 'Annaba', '{}'::jsonb, 23),
  ('wilaya', 'Guelma', 'قالمة', 'Guelma', '{}'::jsonb, 24),
  ('wilaya', 'Constantine', 'قسنطينة', 'Constantine', '{}'::jsonb, 25),
  ('wilaya', 'Médéa', 'المدية', 'Médéa', '{}'::jsonb, 26),
  ('wilaya', 'Mostaganem', 'مستغانم', 'Mostaganem', '{}'::jsonb, 27),
  ('wilaya', 'M''Sila', 'المسيلة', 'M''Sila', '{}'::jsonb, 28),
  ('wilaya', 'Mascara', 'معسكر', 'Mascara', '{}'::jsonb, 29),
  ('wilaya', 'Ouargla', 'ورقلة', 'Ouargla', '{}'::jsonb, 30),
  ('wilaya', 'Oran', 'وهران', 'Oran', '{}'::jsonb, 31),
  ('wilaya', 'El Bayadh', 'البيض', 'El Bayadh', '{}'::jsonb, 32),
  ('wilaya', 'Illizi', 'إليزي', 'Illizi', '{}'::jsonb, 33),
  ('wilaya', 'Bordj Bou Arreridj', 'برج بوعريريج', 'Bordj Bou Arreridj', '{}'::jsonb, 34),
  ('wilaya', 'Boumerdès', 'بومرداس', 'Boumerdès', '{}'::jsonb, 35),
  ('wilaya', 'El Tarf', 'الطارف', 'El Tarf', '{}'::jsonb, 36),
  ('wilaya', 'Tindouf', 'تندوف', 'Tindouf', '{}'::jsonb, 37),
  ('wilaya', 'Tissemsilt', 'تيسمسيلت', 'Tissemsilt', '{}'::jsonb, 38),
  ('wilaya', 'El Oued', 'الوادي', 'El Oued', '{}'::jsonb, 39),
  ('wilaya', 'Khenchela', 'خنشلة', 'Khenchela', '{}'::jsonb, 40),
  ('wilaya', 'Souk Ahras', 'سوق أهراس', 'Souk Ahras', '{}'::jsonb, 41),
  ('wilaya', 'Tipaza', 'تيبازة', 'Tipaza', '{}'::jsonb, 42),
  ('wilaya', 'Mila', 'ميلة', 'Mila', '{}'::jsonb, 43),
  ('wilaya', 'Aïn Defla', 'عين الدفلى', 'Aïn Defla', '{}'::jsonb, 44),
  ('wilaya', 'Naâma', 'النعامة', 'Naâma', '{}'::jsonb, 45),
  ('wilaya', 'Aïn Témouchent', 'عين تموشنت', 'Aïn Témouchent', '{}'::jsonb, 46),
  ('wilaya', 'Ghardaïa', 'غرداية', 'Ghardaïa', '{}'::jsonb, 47),
  ('wilaya', 'Relizane', 'غليزان', 'Relizane', '{}'::jsonb, 48),
  ('wilaya', 'Timimoun', 'تيميمون', 'Timimoun', '{}'::jsonb, 49),
  ('wilaya', 'Bordj Badji Mokhtar', 'برج باجي مختار', 'Bordj Badji Mokhtar', '{}'::jsonb, 50),
  ('wilaya', 'Ouled Djellal', 'أولاد جلال', 'Ouled Djellal', '{}'::jsonb, 51),
  ('wilaya', 'Béni Abbès', 'بني عباس', 'Béni Abbès', '{}'::jsonb, 52),
  ('wilaya', 'In Salah', 'عين صالح', 'In Salah', '{}'::jsonb, 53),
  ('wilaya', 'In Guezzam', 'عين قزام', 'In Guezzam', '{}'::jsonb, 54),
  ('wilaya', 'Touggourt', 'تقرت', 'Touggourt', '{}'::jsonb, 55),
  ('wilaya', 'Djanet', 'جانت', 'Djanet', '{}'::jsonb, 56),
  ('wilaya', 'El M''Ghair', 'المغير', 'El M''Ghair', '{}'::jsonb, 57),
  ('wilaya', 'El Meniaa', 'المنيعة', 'El Meniaa', '{}'::jsonb, 58)
on conflict (kind, code) do nothing;

update public.hr_employee_fields
set value_type = 'catalog',
    catalog_kind = 'wilaya',
    label_fr = 'Wilaya',
    label_ar = 'الولاية'
where code = 'wilaya_code';

update public.hr_employee_fields set label_fr = 'Nom' where code = 'last_name';
update public.hr_employee_fields set label_fr = 'Prénom' where code = 'first_name';
update public.hr_employee_fields set label_fr = 'Né(e) le' where code = 'birth_date';
update public.hr_employee_fields set label_fr = 'à' where code = 'birth_place_fr';
update public.hr_employee_fields set label_fr = 'Commune de naiss' where code = 'commune_birth';
update public.hr_employee_fields set label_fr = 'N° Acte naiss' where code = 'birth_act_no';
update public.hr_employee_fields set label_fr = 'Nationalité' where code = 'nationality';
update public.hr_employee_fields set label_fr = 'Sexe' where code = 'sex_code';
update public.hr_employee_fields set label_fr = 'Situation' where code = 'marital_code';
update public.hr_employee_fields set label_fr = 'G.Sanguin' where code = 'blood_code';
update public.hr_employee_fields set label_fr = 'Prénom du Père' where code = 'father_name';
update public.hr_employee_fields set label_fr = 'Nom/Prénom Mère' where code = 'mother_name';
update public.hr_employee_fields set label_fr = 'Type de la pièce' where code = 'id_type_code';
update public.hr_employee_fields set label_fr = 'N° Pièce' where code = 'id_number';
update public.hr_employee_fields set label_fr = 'Délivré le' where code = 'id_issued_on';
update public.hr_employee_fields set label_fr = 'Expire le' where code = 'id_expires_on';
update public.hr_employee_fields set label_fr = 'Par la Daïra de' where code = 'id_issued_by';
update public.hr_employee_fields set label_fr = 'NIN' where code = 'nin';
update public.hr_employee_fields set label_fr = 'N° NSS' where code = 'nss';
update public.hr_employee_fields set label_fr = 'Date Recrutement' where code = 'hired_at';
update public.hr_employee_fields set label_fr = 'Déclaration' where code = 'declaration_date';
update public.hr_employee_fields set label_fr = 'Niveau' where code = 'level_code';
update public.hr_employee_fields set label_fr = 'Diplôme' where code = 'diploma_fr';
update public.hr_employee_fields set label_fr = 'Expérience' where code = 'experience_years';
update public.hr_employee_fields set label_fr = 'Langues' where code = 'languages';
update public.hr_employee_fields set label_fr = 'Tél' where code = 'phone';
update public.hr_employee_fields set label_fr = 'Email' where code = 'email';

create table if not exists public.hr_fiche_settings (
  id uuid primary key,
  title text not null,
  matricule_label text not null,
  letterhead_url text,
  phone_prefix text not null default '+213',
  phone_codes jsonb not null default '["phone","whatsapp"]'::jsonb,
  uppercase_codes jsonb not null default '["last_name"]'::jsonb,
  suffixes jsonb not null default '{"experience_years":" Ans"}'::jsonb,
  identity_left jsonb not null default '[]'::jsonb,
  identity_right jsonb not null default '[]'::jsonb,
  photo_field text not null default 'photo_url',
  sections jsonb not null default '[]'::jsonb,
  sig_left_title text not null default '',
  sig_left_sub text not null default '',
  sig_right_title text not null default '',
  sig_right_line1 text not null default '',
  sig_right_line2 text not null default '',
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_hr_fiche_settings_u on public.hr_fiche_settings;
create trigger trg_hr_fiche_settings_u before update on public.hr_fiche_settings
  for each row execute function public.erp_set_updated_at();

alter table public.hr_fiche_settings enable row level security;

drop policy if exists hr_fiche_settings_read on public.hr_fiche_settings;
create policy hr_fiche_settings_read on public.hr_fiche_settings
  for select to authenticated using (true);

drop policy if exists hr_fiche_settings_write on public.hr_fiche_settings;
create policy hr_fiche_settings_write on public.hr_fiche_settings
  for all to authenticated
  using (public.erp_has_perm('hr_settings','update', null))
  with check (public.erp_has_perm('hr_settings','update', null));

grant select, insert, update, delete on public.hr_fiche_settings to authenticated;

insert into public.hr_fiche_settings (
  id, title, matricule_label, letterhead_url, phone_prefix, phone_codes,
  uppercase_codes, suffixes, identity_left, identity_right, photo_field,
  sections, sig_left_title, sig_left_sub, sig_right_title, sig_right_line1, sig_right_line2
) values (
  '00000000-0000-0000-0000-000000000001',
  'FICHE DE RENSEIGNEMENTS',
  'Matricule N°:',
  null,
  '+213',
  '["phone","whatsapp"]'::jsonb,
  '["last_name"]'::jsonb,
  '{"experience_years":" Ans"}'::jsonb,
  '["last_name","birth_date","commune_birth","nationality","marital_code"]'::jsonb,
  '["first_name","birth_place_fr","birth_act_no","sex_code","blood_code"]'::jsonb,
  'photo_url',
  '[
    {"id":"affiliation","title":"AFFILIATION & ADRESSE","rows":[["father_name"],["mother_name"],["commune","wilaya_code","postal_code"],["address_fr"]]},
    {"id":"identite","title":"IDENTITÉ & ADMINISTRATIVE","rows":[["id_type_code","id_number"],["id_issued_on","id_expires_on"],["id_issued_by"],["nin","nss"],["account_no"]]},
    {"id":"pro","title":"SITUATION PROFESSIONNELLE & ÉTUDES","rows":[["poste"],["affectation"],["hired_at","declaration_date"],["level_code","diploma_fr"],["experience_years","languages"]]},
    {"id":"contacts","title":"CONTACTS","rows":[["phone","whatsapp"],["email"]]}
  ]'::jsonb,
  'L''Employé(e)',
  'Lu et approuvé',
  'L''Administration',
  'Service RH',
  'Administration'
)
on conflict (id) do nothing;

comment on table public.hr_fiche_settings is
  'Modèle d''impression de la fiche employé. Modifiable depuis Paramètres RH.';

commit;
