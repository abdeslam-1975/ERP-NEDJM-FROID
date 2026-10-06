-- HR documents managed from the UI: the company identity printed on them (one row) and one
-- editable template per document (letters, ordres de mission, titre de congé, fiche, contrats).
-- Seeds print exactly what the code-built documents printed.

begin;

create table if not exists public.hr_company_profile (
  id text primary key default 'default' check (id = 'default'),
  name_fr text not null default '',
  name_ar text not null default '',
  short_name text not null default '',
  address_fr text not null default '',
  address_ar text not null default '',
  city_fr text not null default '',
  city_ar text not null default '',
  city_short text not null default '',
  manager_name_fr text not null default '',
  manager_name_ar text not null default '',
  manager_title_fr text not null default '',
  manager_title_ar text not null default '',
  hr_service text not null default '',
  default_departure text not null default '',
  doc_prefix text not null default '',
  phone text not null default '',
  email text not null default '',
  nif text not null default '',
  nis text not null default '',
  rc text not null default '',
  ai text not null default '',
  bank text not null default '',
  updated_by uuid references public.sys_users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_hr_company_profile_u on public.hr_company_profile;
create trigger trg_hr_company_profile_u before update on public.hr_company_profile
  for each row execute function public.erp_set_updated_at();

drop trigger if exists trg_hr_company_profile_audit on public.hr_company_profile;
create trigger trg_hr_company_profile_audit
  after insert or update or delete on public.hr_company_profile
  for each row execute function public.sys_audit_row_change();

alter table public.hr_company_profile enable row level security;

drop policy if exists hr_company_profile_read on public.hr_company_profile;
create policy hr_company_profile_read on public.hr_company_profile
  for select to authenticated using (true);

drop policy if exists hr_company_profile_insert on public.hr_company_profile;
create policy hr_company_profile_insert on public.hr_company_profile
  for insert to authenticated
  with check (public.erp_has_perm('hr_settings', 'update', null));

drop policy if exists hr_company_profile_update on public.hr_company_profile;
create policy hr_company_profile_update on public.hr_company_profile
  for update to authenticated
  using (public.erp_has_perm('hr_settings', 'update', null))
  with check (public.erp_has_perm('hr_settings', 'update', null));

grant select, insert, update on public.hr_company_profile to authenticated;

comment on table public.hr_company_profile is
  'Identité de l''entreprise imprimée sur les documents RH (raison sociale, siège, signataire, préfixe des références).';

insert into public.hr_company_profile (id, name_fr, name_ar, short_name, address_fr, address_ar, city_fr, city_ar, city_short, manager_name_fr, manager_name_ar, manager_title_fr, manager_title_ar, hr_service, default_departure, doc_prefix)
values ('default', 'E.U.R.L. NEDJM FROID', 'مؤسسة نجم التبريد', 'NEDJM FROID', 'Lotissement coopérative immobilière n° 01 du 19 mars 1962, Hassi Messaoud, wilaya de Ouargla', 'تجزئة التعاونية العقارية رقم "01" 19 مارس 1962 حاسي مسعود ولاية ورقلة', 'Hassi Messaoud', 'حاسي مسعود', 'HMD', 'TOUZARI Saïd', 'توزاري السعيد', 'Le Gérant', 'المسير', 'Service RH', 'Hassi Messaoud', 'NF')
on conflict (id) do nothing;

-- Arabic headings of the fiche sections (were fixed in the code).
update public.hr_fiche_settings s
set sections = (
  select coalesce(
    jsonb_agg(
      case when e.sec ? 'title_ar' then e.sec else e.sec || jsonb_build_object('title_ar', coalesce(m.ar, '')) end
      order by e.ord
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(s.sections) with ordinality as e(sec, ord)
  left join (values
    ('affiliation', 'النسب والعنوان'),
    ('identite', 'الهوية والوضعية الإدارية'),
    ('pro', 'الوضعية المهنية والدراسة'),
    ('contacts', 'وسائل الاتصال')
  ) as m(id, ar) on m.id = e.sec->>'id'
)
where jsonb_typeof(s.sections) = 'array';

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'lettre_attest_fr', 1, 'approved', $lettre_attest_fr$<!doctype html>
<html lang="fr" dir="ltr">
<head>
  <meta charset="utf-8">
  <title>ATTESTATION DE TRAVAIL <span data-bare data-field="numero_raw"></span></title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap">
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    .page {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      padding: 38mm 20mm 30mm 20mm;
      font-family: "Times New Roman", Georgia, serif;
      font-size: 15px;
      line-height: 1.8;
    }
    .letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
    }
    .content { position: relative; z-index: 1; }
    .meta { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 8mm; }
    .recipient { width: 60%; margin-bottom: 6mm; margin-inline-start: auto; }
    .recipient .mode { font-style: italic; font-size: 0.9em; }
    h1 {
      text-align: center;
      font-size: 22px;
      letter-spacing: 1.5px;
      text-decoration: underline;
      margin: 4mm 0 10mm;
    }
    .subtitle { text-align: center; font-weight: 700; margin-bottom: 8mm; }
    .object { font-weight: 700; text-decoration: underline; margin-bottom: 5mm; }
    p { text-align: justify; margin: 0 0 4mm; text-indent: 10mm; }
    table { border-collapse: collapse; width: 100%; margin: 4mm 0 6mm; font-size: 0.92em; }
    th, td { border: 1px solid #333; padding: 1.5mm 3mm; text-align: left; }
    .lines thead th { background: #eee; }
    .num { text-align: right; white-space: nowrap; width: 38mm; }
    .details th { width: 45%; background: #f3f3f3; }
    .fait { margin-top: 8mm; text-align: right; font-weight: 700; }
    .signs { display: flex; justify-content: flex-end; margin-top: 8mm; font-weight: 700; }
    .signs div { min-width: 60mm; text-align: center; min-height: 28mm; }
    @media print {
      html, body, .letterhead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">
  <img class="letterhead" src="" data-attr-src="letterhead" alt="">
  <div class="content">
    <div class="meta"><span>N° : <span data-bare data-field="numero"></span></span><span data-if="matricule">Matricule : <span data-bare data-field="matricule"></span></span></div>
    
    <h1>ATTESTATION DE TRAVAIL</h1>
    
    
    <div data-bare data-if="!custom_body" data-letter-body>
    <p>Nous soussignés, <span data-bare data-field="company.name_fr"></span>, attestons par la présente que <span data-bare data-field="civ"></span> <span data-bare data-field="nom"></span>, <span data-bare data-field="ne"></span> le <span data-bare data-field="birth_date"></span> à <span data-bare data-field="birth_place"></span>, est employé<span data-bare data-field="e"></span> au sein de notre entreprise en qualité de <span data-bare data-field="poste"></span>, depuis le <span data-bare data-field="start"></span> à ce jour.</p>
    <p>La présente attestation est délivrée à l'intéressé<span data-bare data-field="e"></span>, sur sa demande, pour servir et valoir ce que de droit.</p>
    </div>
    <p data-each="custom_body" data-field="$item"></p>
    
    
    <div class="fait">Fait à <span data-bare data-field="company.city_fr"></span>, le <span data-bare data-field="date_doc"></span></div>
    <div class="signs"><div><span data-bare data-field="company.manager_title_fr"></span></div></div>
  </div>
</div>
</body>
</html>$lettre_attest_fr$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'lettre_attest_fr' and status = 'approved');

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'lettre_attest_ar', 1, 'approved', $lettre_attest_ar$<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>إفادة عمل <span data-bare data-field="numero_raw"></span></title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap">
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    .page {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      padding: 38mm 20mm 30mm 20mm;
      font-family: Amiri, "Traditional Arabic", Tahoma, serif;
      font-size: 17px;
      line-height: 2;
    }
    .letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
    }
    .content { position: relative; z-index: 1; }
    .meta { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 8mm; }
    .recipient { width: 60%; margin-bottom: 6mm; margin-inline-start: auto; }
    .recipient .mode { font-style: italic; font-size: 0.9em; }
    h1 {
      text-align: center;
      font-size: 26px;
      letter-spacing: 0;
      text-decoration: underline;
      margin: 4mm 0 10mm;
    }
    .subtitle { text-align: center; font-weight: 700; margin-bottom: 8mm; }
    .object { font-weight: 700; text-decoration: underline; margin-bottom: 5mm; }
    p { text-align: justify; margin: 0 0 4mm; text-indent: 0; }
    table { border-collapse: collapse; width: 100%; margin: 4mm 0 6mm; font-size: 0.92em; }
    th, td { border: 1px solid #333; padding: 1.5mm 3mm; text-align: right; }
    .lines thead th { background: #eee; }
    .num { text-align: left; white-space: nowrap; width: 38mm; }
    .details th { width: 45%; background: #f3f3f3; }
    .fait { margin-top: 8mm; text-align: left; font-weight: 700; }
    .signs { display: flex; justify-content: flex-start; margin-top: 8mm; font-weight: 700; }
    .signs div { min-width: 60mm; text-align: center; min-height: 28mm; }
    @media print {
      html, body, .letterhead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">
  <img class="letterhead" src="" data-attr-src="letterhead" alt="">
  <div class="content" data-ltr-numbers>
    <div class="meta"><span>الرقم : <span data-bare data-field="numero"></span></span><span data-if="matricule">رقم التسجيل : <span data-bare data-field="matricule"></span></span></div>
    
    <h1>إفادة عمل</h1>
    
    
    <div data-bare data-if="!custom_body" data-letter-body>
    <p>نحن الموقعين أدناه، <span data-bare data-field="company.name_ar"></span>، نشهد بأن <span data-bare data-field="civ"></span> <span data-bare data-field="nom"></span> <span data-bare data-field="a_ne"></span> بتاريخ <span data-bare data-field="birth_date"></span> بـ <span data-bare data-field="birth_place"></span>، <span data-bare data-field="a_works"></span> لدى مؤسستنا بصفة <span data-bare data-field="poste"></span> منذ <span data-bare data-field="start"></span> إلى يومنا هذا.</p>
    <p>سلمت هذه الإفادة لـ<span data-bare data-field="a_concerned"></span> بناءً على طلب<span data-bare data-field="a_her"></span> لاستعمالها في حدود ما يسمح به القانون.</p>
    </div>
    <p data-each="custom_body" data-field="$item"></p>
    
    
    <div class="fait">حرر في <span data-bare data-field="company.city_ar"></span> بتاريخ <span data-bare data-field="date_doc"></span></div>
    <div class="signs"><div><span data-bare data-field="company.manager_title_ar"></span></div></div>
  </div>
</div>
</body>
</html>$lettre_attest_ar$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'lettre_attest_ar' and status = 'approved');

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'lettre_certif_fr', 1, 'approved', $lettre_certif_fr$<!doctype html>
<html lang="fr" dir="ltr">
<head>
  <meta charset="utf-8">
  <title>CERTIFICAT DE TRAVAIL <span data-bare data-field="numero_raw"></span></title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap">
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    .page {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      padding: 38mm 20mm 30mm 20mm;
      font-family: "Times New Roman", Georgia, serif;
      font-size: 15px;
      line-height: 1.8;
    }
    .letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
    }
    .content { position: relative; z-index: 1; }
    .meta { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 8mm; }
    .recipient { width: 60%; margin-bottom: 6mm; margin-inline-start: auto; }
    .recipient .mode { font-style: italic; font-size: 0.9em; }
    h1 {
      text-align: center;
      font-size: 22px;
      letter-spacing: 1.5px;
      text-decoration: underline;
      margin: 4mm 0 10mm;
    }
    .subtitle { text-align: center; font-weight: 700; margin-bottom: 8mm; }
    .object { font-weight: 700; text-decoration: underline; margin-bottom: 5mm; }
    p { text-align: justify; margin: 0 0 4mm; text-indent: 10mm; }
    table { border-collapse: collapse; width: 100%; margin: 4mm 0 6mm; font-size: 0.92em; }
    th, td { border: 1px solid #333; padding: 1.5mm 3mm; text-align: left; }
    .lines thead th { background: #eee; }
    .num { text-align: right; white-space: nowrap; width: 38mm; }
    .details th { width: 45%; background: #f3f3f3; }
    .fait { margin-top: 8mm; text-align: right; font-weight: 700; }
    .signs { display: flex; justify-content: flex-end; margin-top: 8mm; font-weight: 700; }
    .signs div { min-width: 60mm; text-align: center; min-height: 28mm; }
    @media print {
      html, body, .letterhead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">
  <img class="letterhead" src="" data-attr-src="letterhead" alt="">
  <div class="content">
    <div class="meta"><span>N° : <span data-bare data-field="numero"></span></span><span data-if="matricule">Matricule : <span data-bare data-field="matricule"></span></span></div>
    
    <h1>CERTIFICAT DE TRAVAIL</h1>
    
    
    <div data-bare data-if="!custom_body" data-letter-body>
    <p>Nous soussignés, <span data-bare data-field="company.name_fr"></span>, certifions que <span data-bare data-field="civ"></span> <span data-bare data-field="nom"></span>, <span data-bare data-field="ne"></span> le <span data-bare data-field="birth_date"></span> à <span data-bare data-field="birth_place"></span>, a été employé<span data-bare data-field="e"></span> au sein de notre entreprise en qualité de <span data-bare data-field="poste"></span>, du <span data-bare data-field="start"></span> au <span data-bare data-field="end"></span>.</p>
    <p><span data-bare data-field="il"></span> nous quitte libre de tout engagement.</p>
    <p>Le présent certificat est délivré à l'intéressé<span data-bare data-field="e"></span> pour servir et valoir ce que de droit.</p>
    </div>
    <p data-each="custom_body" data-field="$item"></p>
    
    
    <div class="fait">Fait à <span data-bare data-field="company.city_fr"></span>, le <span data-bare data-field="date_doc"></span></div>
    <div class="signs"><div><span data-bare data-field="company.manager_title_fr"></span></div></div>
  </div>
</div>
</body>
</html>$lettre_certif_fr$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'lettre_certif_fr' and status = 'approved');

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'lettre_certif_ar', 1, 'approved', $lettre_certif_ar$<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>شهادة عمل <span data-bare data-field="numero_raw"></span></title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap">
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    .page {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      padding: 38mm 20mm 30mm 20mm;
      font-family: Amiri, "Traditional Arabic", Tahoma, serif;
      font-size: 17px;
      line-height: 2;
    }
    .letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
    }
    .content { position: relative; z-index: 1; }
    .meta { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 8mm; }
    .recipient { width: 60%; margin-bottom: 6mm; margin-inline-start: auto; }
    .recipient .mode { font-style: italic; font-size: 0.9em; }
    h1 {
      text-align: center;
      font-size: 26px;
      letter-spacing: 0;
      text-decoration: underline;
      margin: 4mm 0 10mm;
    }
    .subtitle { text-align: center; font-weight: 700; margin-bottom: 8mm; }
    .object { font-weight: 700; text-decoration: underline; margin-bottom: 5mm; }
    p { text-align: justify; margin: 0 0 4mm; text-indent: 0; }
    table { border-collapse: collapse; width: 100%; margin: 4mm 0 6mm; font-size: 0.92em; }
    th, td { border: 1px solid #333; padding: 1.5mm 3mm; text-align: right; }
    .lines thead th { background: #eee; }
    .num { text-align: left; white-space: nowrap; width: 38mm; }
    .details th { width: 45%; background: #f3f3f3; }
    .fait { margin-top: 8mm; text-align: left; font-weight: 700; }
    .signs { display: flex; justify-content: flex-start; margin-top: 8mm; font-weight: 700; }
    .signs div { min-width: 60mm; text-align: center; min-height: 28mm; }
    @media print {
      html, body, .letterhead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">
  <img class="letterhead" src="" data-attr-src="letterhead" alt="">
  <div class="content" data-ltr-numbers>
    <div class="meta"><span>الرقم : <span data-bare data-field="numero"></span></span><span data-if="matricule">رقم التسجيل : <span data-bare data-field="matricule"></span></span></div>
    
    <h1>شهادة عمل</h1>
    
    
    <div data-bare data-if="!custom_body" data-letter-body>
    <p>نحن الموقعين أدناه، <span data-bare data-field="company.name_ar"></span>، نشهد بأن <span data-bare data-field="civ"></span> <span data-bare data-field="nom"></span> <span data-bare data-field="a_ne"></span> بتاريخ <span data-bare data-field="birth_date"></span> بـ <span data-bare data-field="birth_place"></span>، قد <span data-bare data-field="a_worked"></span> لدى مؤسستنا بصفة <span data-bare data-field="poste"></span> من <span data-bare data-field="start"></span> إلى <span data-bare data-field="end"></span>.</p>
    <p>وقد <span data-bare data-field="a_left"></span> مؤسستنا <span data-bare data-field="a_free"></span> من كل التزام.</p>
    <p>سلمت هذه الشهادة لـ<span data-bare data-field="a_concerned"></span> لاستعمالها في حدود ما يسمح به القانون.</p>
    </div>
    <p data-each="custom_body" data-field="$item"></p>
    
    
    <div class="fait">حرر في <span data-bare data-field="company.city_ar"></span> بتاريخ <span data-bare data-field="date_doc"></span></div>
    <div class="signs"><div><span data-bare data-field="company.manager_title_ar"></span></div></div>
  </div>
</div>
</body>
</html>$lettre_certif_ar$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'lettre_certif_ar' and status = 'approved');

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'lettre_stc_fr', 1, 'approved', $lettre_stc_fr$<!doctype html>
<html lang="fr" dir="ltr">
<head>
  <meta charset="utf-8">
  <title>REÇU POUR SOLDE DE TOUT COMPTE <span data-bare data-field="numero_raw"></span></title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap">
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    .page {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      padding: 38mm 20mm 30mm 20mm;
      font-family: "Times New Roman", Georgia, serif;
      font-size: 15px;
      line-height: 1.8;
    }
    .letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
    }
    .content { position: relative; z-index: 1; }
    .meta { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 8mm; }
    .recipient { width: 60%; margin-bottom: 6mm; margin-inline-start: auto; }
    .recipient .mode { font-style: italic; font-size: 0.9em; }
    h1 {
      text-align: center;
      font-size: 22px;
      letter-spacing: 1.5px;
      text-decoration: underline;
      margin: 4mm 0 10mm;
    }
    .subtitle { text-align: center; font-weight: 700; margin-bottom: 8mm; }
    .object { font-weight: 700; text-decoration: underline; margin-bottom: 5mm; }
    p { text-align: justify; margin: 0 0 4mm; text-indent: 10mm; }
    table { border-collapse: collapse; width: 100%; margin: 4mm 0 6mm; font-size: 0.92em; }
    th, td { border: 1px solid #333; padding: 1.5mm 3mm; text-align: left; }
    .lines thead th { background: #eee; }
    .num { text-align: right; white-space: nowrap; width: 38mm; }
    .details th { width: 45%; background: #f3f3f3; }
    .fait { margin-top: 8mm; text-align: right; font-weight: 700; }
    .signs { display: flex; justify-content: space-between; margin-top: 8mm; font-weight: 700; }
    .signs div { min-width: 60mm; text-align: center; min-height: 28mm; }
    @media print {
      html, body, .letterhead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">
  <img class="letterhead" src="" data-attr-src="letterhead" alt="">
  <div class="content">
    <div class="meta"><span>N° : <span data-bare data-field="numero"></span></span><span data-if="matricule">Matricule : <span data-bare data-field="matricule"></span></span></div>
    
    <h1>REÇU POUR SOLDE DE TOUT COMPTE</h1>
    
    
    <div data-bare data-if="!custom_body" data-letter-body>
    <p>Je soussigné<span data-bare data-field="e"></span> <span data-bare data-field="civ"></span> <span data-bare data-field="nom"></span>, matricule <span data-bare data-field="matricule_txt"></span>, ayant occupé le poste de <span data-bare data-field="poste"></span> du <span data-bare data-field="start"></span> au <span data-bare data-field="end"></span>, reconnais avoir reçu de <span data-bare data-field="company.name_fr"></span> la somme de <span data-bare data-field="amount"></span> DA (<span data-bare data-field="amount_words"></span>), pour solde de tout compte, en paiement des salaires, accessoires de salaire et indemnités de toute nature dus au titre de l'exécution et de la cessation de mon contrat de travail.</p>
    <p>Le présent reçu est établi en deux exemplaires, dont un m'a été remis.</p>
    </div>
    <p data-each="custom_body" data-field="$item"></p>
    <table class="lines" data-if="lines">
  <thead><tr><th>Désignation</th><th class="num">Montant (DA)</th></tr></thead>
  <tbody><tr data-each="lines"><td data-field="label"></td><td class="num" data-field="amount"></td></tr></tbody>
</table>
    
    <div class="fait">Fait à <span data-bare data-field="company.city_fr"></span>, le <span data-bare data-field="date_doc"></span></div>
    <div class="signs"><div>Le salarié (lu et approuvé)</div><div>L'employeur</div></div>
  </div>
</div>
</body>
</html>$lettre_stc_fr$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'lettre_stc_fr' and status = 'approved');

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'lettre_stc_ar', 1, 'approved', $lettre_stc_ar$<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>وصل تصفية كل حساب <span data-bare data-field="numero_raw"></span></title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap">
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    .page {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      padding: 38mm 20mm 30mm 20mm;
      font-family: Amiri, "Traditional Arabic", Tahoma, serif;
      font-size: 17px;
      line-height: 2;
    }
    .letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
    }
    .content { position: relative; z-index: 1; }
    .meta { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 8mm; }
    .recipient { width: 60%; margin-bottom: 6mm; margin-inline-start: auto; }
    .recipient .mode { font-style: italic; font-size: 0.9em; }
    h1 {
      text-align: center;
      font-size: 26px;
      letter-spacing: 0;
      text-decoration: underline;
      margin: 4mm 0 10mm;
    }
    .subtitle { text-align: center; font-weight: 700; margin-bottom: 8mm; }
    .object { font-weight: 700; text-decoration: underline; margin-bottom: 5mm; }
    p { text-align: justify; margin: 0 0 4mm; text-indent: 0; }
    table { border-collapse: collapse; width: 100%; margin: 4mm 0 6mm; font-size: 0.92em; }
    th, td { border: 1px solid #333; padding: 1.5mm 3mm; text-align: right; }
    .lines thead th { background: #eee; }
    .num { text-align: left; white-space: nowrap; width: 38mm; }
    .details th { width: 45%; background: #f3f3f3; }
    .fait { margin-top: 8mm; text-align: left; font-weight: 700; }
    .signs { display: flex; justify-content: space-between; margin-top: 8mm; font-weight: 700; }
    .signs div { min-width: 60mm; text-align: center; min-height: 28mm; }
    @media print {
      html, body, .letterhead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">
  <img class="letterhead" src="" data-attr-src="letterhead" alt="">
  <div class="content" data-ltr-numbers>
    <div class="meta"><span>الرقم : <span data-bare data-field="numero"></span></span><span data-if="matricule">رقم التسجيل : <span data-bare data-field="matricule"></span></span></div>
    
    <h1>وصل تصفية كل حساب</h1>
    
    
    <div data-bare data-if="!custom_body" data-letter-body>
    <p>أنا <span data-bare data-field="a_signed"></span> أدناه <span data-bare data-field="civ"></span> <span data-bare data-field="nom"></span>، رقم التسجيل <span data-bare data-field="matricule_txt"></span>، <span data-bare data-field="a_who"></span> منصب <span data-bare data-field="poste"></span> من <span data-bare data-field="start"></span> إلى <span data-bare data-field="end"></span>، أقر بأنني استلمت من <span data-bare data-field="company.name_ar"></span> مبلغ <span data-bare data-field="amount"></span> دج (<span data-bare data-field="amount_words"></span>)، تصفيةً لكل حساب، مقابل الأجور وملحقاتها والتعويضات بجميع أنواعها المستحقة بعنوان تنفيذ عقد عملي وإنهائه.</p>
    <p>حرر هذا الوصل في نسختين، سلمت لي نسخة منهما.</p>
    </div>
    <p data-each="custom_body" data-field="$item"></p>
    <table class="lines" data-if="lines">
  <thead><tr><th>البيان</th><th class="num">المبلغ (دج)</th></tr></thead>
  <tbody><tr data-each="lines"><td data-field="label"></td><td class="num" data-field="amount"></td></tr></tbody>
</table>
    
    <div class="fait">حرر في <span data-bare data-field="company.city_ar"></span> بتاريخ <span data-bare data-field="date_doc"></span></div>
    <div class="signs"><div>إمضاء العامل (قرئ وصودق عليه)</div><div>المستخدم</div></div>
  </div>
</div>
</body>
</html>$lettre_stc_ar$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'lettre_stc_ar' and status = 'approved');

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'lettre_med1_fr', 1, 'approved', $lettre_med1_fr$<!doctype html>
<html lang="fr" dir="ltr">
<head>
  <meta charset="utf-8">
  <title>MISE EN DEMEURE <span data-bare data-field="numero_raw"></span></title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap">
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    .page {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      padding: 38mm 20mm 30mm 20mm;
      font-family: "Times New Roman", Georgia, serif;
      font-size: 15px;
      line-height: 1.8;
    }
    .letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
    }
    .content { position: relative; z-index: 1; }
    .meta { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 8mm; }
    .recipient { width: 60%; margin-bottom: 6mm; margin-inline-start: auto; }
    .recipient .mode { font-style: italic; font-size: 0.9em; }
    h1 {
      text-align: center;
      font-size: 22px;
      letter-spacing: 1.5px;
      text-decoration: underline;
      margin: 4mm 0 1mm;
    }
    .subtitle { text-align: center; font-weight: 700; margin-bottom: 8mm; }
    .object { font-weight: 700; text-decoration: underline; margin-bottom: 5mm; }
    p { text-align: justify; margin: 0 0 4mm; text-indent: 10mm; }
    table { border-collapse: collapse; width: 100%; margin: 4mm 0 6mm; font-size: 0.92em; }
    th, td { border: 1px solid #333; padding: 1.5mm 3mm; text-align: left; }
    .lines thead th { background: #eee; }
    .num { text-align: right; white-space: nowrap; width: 38mm; }
    .details th { width: 45%; background: #f3f3f3; }
    .fait { margin-top: 8mm; text-align: right; font-weight: 700; }
    .signs { display: flex; justify-content: flex-end; margin-top: 8mm; font-weight: 700; }
    .signs div { min-width: 60mm; text-align: center; min-height: 28mm; }
    @media print {
      html, body, .letterhead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">
  <img class="letterhead" src="" data-attr-src="letterhead" alt="">
  <div class="content">
    <div class="meta"><span>N° : <span data-bare data-field="numero"></span></span><span data-if="matricule">Matricule : <span data-bare data-field="matricule"></span></span></div>
    <div class="recipient"><div class="mode">Lettre recommandée avec accusé de réception</div><div><b>À : <span data-bare data-field="civ"></span> <span data-bare data-field="nom"></span></b></div><div data-if="recipient_address" data-field="recipient_address"></div></div>
    <h1>MISE EN DEMEURE</h1>
    <div class="subtitle">(Première mise en demeure)</div>
    <div class="object">Objet : Absence irrégulière — Mise en demeure de reprendre le travail</div>
    <div data-bare data-if="!custom_body" data-letter-body>
    <p><span data-bare data-field="civ"></span>,</p>
    <p>Nous avons constaté votre absence de votre poste de travail (<span data-bare data-field="poste"></span>) depuis le <span data-bare data-field="since"></span>, sans autorisation ni justification à ce jour.</p>
    <p>Par la présente, nous vous mettons en demeure de rejoindre votre poste de travail ou de justifier votre absence dans un délai de <span data-bare data-field="delai"></span> jours à compter de la réception de la présente.</p>
    <p>À défaut, nous serons dans l'obligation de prendre à votre encontre les mesures prévues par le règlement intérieur et la législation en vigueur.</p>
    <p>Veuillez agréer, <span data-bare data-field="civ"></span>, nos salutations distinguées.</p>
    </div>
    <p data-each="custom_body" data-field="$item"></p>
    
    
    <div class="fait">Fait à <span data-bare data-field="company.city_fr"></span>, le <span data-bare data-field="date_doc"></span></div>
    <div class="signs"><div><span data-bare data-field="company.manager_title_fr"></span></div></div>
  </div>
</div>
</body>
</html>$lettre_med1_fr$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'lettre_med1_fr' and status = 'approved');

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'lettre_med1_ar', 1, 'approved', $lettre_med1_ar$<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>إعذار <span data-bare data-field="numero_raw"></span></title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap">
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    .page {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      padding: 38mm 20mm 30mm 20mm;
      font-family: Amiri, "Traditional Arabic", Tahoma, serif;
      font-size: 17px;
      line-height: 2;
    }
    .letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
    }
    .content { position: relative; z-index: 1; }
    .meta { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 8mm; }
    .recipient { width: 60%; margin-bottom: 6mm; margin-inline-start: auto; }
    .recipient .mode { font-style: italic; font-size: 0.9em; }
    h1 {
      text-align: center;
      font-size: 26px;
      letter-spacing: 0;
      text-decoration: underline;
      margin: 4mm 0 1mm;
    }
    .subtitle { text-align: center; font-weight: 700; margin-bottom: 8mm; }
    .object { font-weight: 700; text-decoration: underline; margin-bottom: 5mm; }
    p { text-align: justify; margin: 0 0 4mm; text-indent: 0; }
    table { border-collapse: collapse; width: 100%; margin: 4mm 0 6mm; font-size: 0.92em; }
    th, td { border: 1px solid #333; padding: 1.5mm 3mm; text-align: right; }
    .lines thead th { background: #eee; }
    .num { text-align: left; white-space: nowrap; width: 38mm; }
    .details th { width: 45%; background: #f3f3f3; }
    .fait { margin-top: 8mm; text-align: left; font-weight: 700; }
    .signs { display: flex; justify-content: flex-start; margin-top: 8mm; font-weight: 700; }
    .signs div { min-width: 60mm; text-align: center; min-height: 28mm; }
    @media print {
      html, body, .letterhead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">
  <img class="letterhead" src="" data-attr-src="letterhead" alt="">
  <div class="content" data-ltr-numbers>
    <div class="meta"><span>الرقم : <span data-bare data-field="numero"></span></span><span data-if="matricule">رقم التسجيل : <span data-bare data-field="matricule"></span></span></div>
    <div class="recipient"><div class="mode">رسالة موصى عليها مع إشعار بالاستلام</div><div><b>إلى : <span data-bare data-field="civ"></span> <span data-bare data-field="nom"></span></b></div><div data-if="recipient_address" data-field="recipient_address"></div></div>
    <h1>إعذار</h1>
    <div class="subtitle">(الإعذار الأول)</div>
    <div class="object">الموضوع : غياب غير مبرر — إعذار بالالتحاق بمنصب العمل</div>
    <div data-bare data-if="!custom_body" data-letter-body>
    <p><span data-bare data-field="civ"></span>،</p>
    <p>لقد لاحظنا غيابك عن منصب عملك (<span data-bare data-field="poste"></span>) منذ <span data-bare data-field="since"></span> دون ترخيص أو مبرر إلى يومنا هذا.</p>
    <p>وعليه، نعذرك بموجب هذه الرسالة بضرورة الالتحاق بمنصب عملك أو تبرير غيابك في أجل أقصاه <span data-bare data-field="delai"></span> أيام ابتداءً من تاريخ استلامك لهذا الإعذار.</p>
    <p>وفي حالة عدم الامتثال، سنضطر إلى اتخاذ الإجراءات المنصوص عليها في النظام الداخلي والتشريع المعمول به.</p>
    <p>تقبلوا منا فائق التقدير والاحترام.</p>
    </div>
    <p data-each="custom_body" data-field="$item"></p>
    
    
    <div class="fait">حرر في <span data-bare data-field="company.city_ar"></span> بتاريخ <span data-bare data-field="date_doc"></span></div>
    <div class="signs"><div><span data-bare data-field="company.manager_title_ar"></span></div></div>
  </div>
</div>
</body>
</html>$lettre_med1_ar$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'lettre_med1_ar' and status = 'approved');

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'lettre_med2_fr', 1, 'approved', $lettre_med2_fr$<!doctype html>
<html lang="fr" dir="ltr">
<head>
  <meta charset="utf-8">
  <title>MISE EN DEMEURE <span data-bare data-field="numero_raw"></span></title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap">
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    .page {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      padding: 38mm 20mm 30mm 20mm;
      font-family: "Times New Roman", Georgia, serif;
      font-size: 15px;
      line-height: 1.8;
    }
    .letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
    }
    .content { position: relative; z-index: 1; }
    .meta { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 8mm; }
    .recipient { width: 60%; margin-bottom: 6mm; margin-inline-start: auto; }
    .recipient .mode { font-style: italic; font-size: 0.9em; }
    h1 {
      text-align: center;
      font-size: 22px;
      letter-spacing: 1.5px;
      text-decoration: underline;
      margin: 4mm 0 1mm;
    }
    .subtitle { text-align: center; font-weight: 700; margin-bottom: 8mm; }
    .object { font-weight: 700; text-decoration: underline; margin-bottom: 5mm; }
    p { text-align: justify; margin: 0 0 4mm; text-indent: 10mm; }
    table { border-collapse: collapse; width: 100%; margin: 4mm 0 6mm; font-size: 0.92em; }
    th, td { border: 1px solid #333; padding: 1.5mm 3mm; text-align: left; }
    .lines thead th { background: #eee; }
    .num { text-align: right; white-space: nowrap; width: 38mm; }
    .details th { width: 45%; background: #f3f3f3; }
    .fait { margin-top: 8mm; text-align: right; font-weight: 700; }
    .signs { display: flex; justify-content: flex-end; margin-top: 8mm; font-weight: 700; }
    .signs div { min-width: 60mm; text-align: center; min-height: 28mm; }
    @media print {
      html, body, .letterhead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">
  <img class="letterhead" src="" data-attr-src="letterhead" alt="">
  <div class="content">
    <div class="meta"><span>N° : <span data-bare data-field="numero"></span></span><span data-if="matricule">Matricule : <span data-bare data-field="matricule"></span></span></div>
    <div class="recipient"><div class="mode">Lettre recommandée avec accusé de réception</div><div><b>À : <span data-bare data-field="civ"></span> <span data-bare data-field="nom"></span></b></div><div data-if="recipient_address" data-field="recipient_address"></div></div>
    <h1>MISE EN DEMEURE</h1>
    <div class="subtitle">(Deuxième et dernière mise en demeure)</div>
    <div class="object">Objet : Absence irrégulière — Mise en demeure de reprendre le travail</div>
    <div data-bare data-if="!custom_body" data-letter-body>
    <p><span data-bare data-field="civ"></span>,</p>
    <p>Malgré notre première mise en demeure n° <span data-bare data-field="ref"></span> du <span data-bare data-field="ref_date"></span>, restée sans suite, vous n'avez toujours pas rejoint votre poste de travail (<span data-bare data-field="poste"></span>), que vous avez quitté depuis le <span data-bare data-field="since"></span>.</p>
    <p>Nous vous mettons en demeure, pour la deuxième et dernière fois, de reprendre votre travail dans un délai de <span data-bare data-field="delai"></span> jours à compter de la réception de la présente.</p>
    <p>Passé ce délai, votre absence sera considérée comme un abandon de poste et entraînera votre licenciement pour faute grave, sans préavis ni indemnités, conformément à la réglementation en vigueur.</p>
    <p>Veuillez agréer, <span data-bare data-field="civ"></span>, nos salutations distinguées.</p>
    </div>
    <p data-each="custom_body" data-field="$item"></p>
    
    
    <div class="fait">Fait à <span data-bare data-field="company.city_fr"></span>, le <span data-bare data-field="date_doc"></span></div>
    <div class="signs"><div><span data-bare data-field="company.manager_title_fr"></span></div></div>
  </div>
</div>
</body>
</html>$lettre_med2_fr$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'lettre_med2_fr' and status = 'approved');

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'lettre_med2_ar', 1, 'approved', $lettre_med2_ar$<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>إعذار <span data-bare data-field="numero_raw"></span></title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap">
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    .page {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      padding: 38mm 20mm 30mm 20mm;
      font-family: Amiri, "Traditional Arabic", Tahoma, serif;
      font-size: 17px;
      line-height: 2;
    }
    .letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
    }
    .content { position: relative; z-index: 1; }
    .meta { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 8mm; }
    .recipient { width: 60%; margin-bottom: 6mm; margin-inline-start: auto; }
    .recipient .mode { font-style: italic; font-size: 0.9em; }
    h1 {
      text-align: center;
      font-size: 26px;
      letter-spacing: 0;
      text-decoration: underline;
      margin: 4mm 0 1mm;
    }
    .subtitle { text-align: center; font-weight: 700; margin-bottom: 8mm; }
    .object { font-weight: 700; text-decoration: underline; margin-bottom: 5mm; }
    p { text-align: justify; margin: 0 0 4mm; text-indent: 0; }
    table { border-collapse: collapse; width: 100%; margin: 4mm 0 6mm; font-size: 0.92em; }
    th, td { border: 1px solid #333; padding: 1.5mm 3mm; text-align: right; }
    .lines thead th { background: #eee; }
    .num { text-align: left; white-space: nowrap; width: 38mm; }
    .details th { width: 45%; background: #f3f3f3; }
    .fait { margin-top: 8mm; text-align: left; font-weight: 700; }
    .signs { display: flex; justify-content: flex-start; margin-top: 8mm; font-weight: 700; }
    .signs div { min-width: 60mm; text-align: center; min-height: 28mm; }
    @media print {
      html, body, .letterhead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">
  <img class="letterhead" src="" data-attr-src="letterhead" alt="">
  <div class="content" data-ltr-numbers>
    <div class="meta"><span>الرقم : <span data-bare data-field="numero"></span></span><span data-if="matricule">رقم التسجيل : <span data-bare data-field="matricule"></span></span></div>
    <div class="recipient"><div class="mode">رسالة موصى عليها مع إشعار بالاستلام</div><div><b>إلى : <span data-bare data-field="civ"></span> <span data-bare data-field="nom"></span></b></div><div data-if="recipient_address" data-field="recipient_address"></div></div>
    <h1>إعذار</h1>
    <div class="subtitle">(الإعذار الثاني والأخير)</div>
    <div class="object">الموضوع : غياب غير مبرر — إعذار بالالتحاق بمنصب العمل</div>
    <div data-bare data-if="!custom_body" data-letter-body>
    <p><span data-bare data-field="civ"></span>،</p>
    <p>رغم إعذارنا الأول رقم <span data-bare data-field="ref"></span> المؤرخ في <span data-bare data-field="ref_date"></span> الذي بقي دون رد، لم <span data-bare data-field="a_join"></span> بعد بمنصب عملك (<span data-bare data-field="poste"></span>) الذي تغيبت عنه منذ <span data-bare data-field="since"></span>.</p>
    <p>وعليه، نعذرك للمرة الثانية والأخيرة بضرورة الالتحاق بمنصب عملك في أجل أقصاه <span data-bare data-field="delai"></span> أيام ابتداءً من تاريخ استلامك لهذا الإعذار.</p>
    <p>وبانقضاء هذا الأجل، يعتبر غيابك إهمالاً للمنصب ويترتب عنه تسريحك بسبب خطأ جسيم دون مهلة إشعار ولا تعويض، طبقاً للتنظيم المعمول به.</p>
    <p>تقبلوا منا فائق التقدير والاحترام.</p>
    </div>
    <p data-each="custom_body" data-field="$item"></p>
    
    
    <div class="fait">حرر في <span data-bare data-field="company.city_ar"></span> بتاريخ <span data-bare data-field="date_doc"></span></div>
    <div class="signs"><div><span data-bare data-field="company.manager_title_ar"></span></div></div>
  </div>
</div>
</body>
</html>$lettre_med2_ar$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'lettre_med2_ar' and status = 'approved');

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'lettre_leave_fr', 1, 'approved', $lettre_leave_fr$<!doctype html>
<html lang="fr" dir="ltr">
<head>
  <meta charset="utf-8">
  <title>TITRE DE CONGÉ <span data-bare data-field="numero_raw"></span></title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap">
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    .page {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      padding: 38mm 20mm 30mm 20mm;
      font-family: "Times New Roman", Georgia, serif;
      font-size: 15px;
      line-height: 1.8;
    }
    .letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
    }
    .content { position: relative; z-index: 1; }
    .meta { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 8mm; }
    .recipient { width: 60%; margin-bottom: 6mm; margin-inline-start: auto; }
    .recipient .mode { font-style: italic; font-size: 0.9em; }
    h1 {
      text-align: center;
      font-size: 22px;
      letter-spacing: 1.5px;
      text-decoration: underline;
      margin: 4mm 0 10mm;
    }
    .subtitle { text-align: center; font-weight: 700; margin-bottom: 8mm; }
    .object { font-weight: 700; text-decoration: underline; margin-bottom: 5mm; }
    p { text-align: justify; margin: 0 0 4mm; text-indent: 10mm; }
    table { border-collapse: collapse; width: 100%; margin: 4mm 0 6mm; font-size: 0.92em; }
    th, td { border: 1px solid #333; padding: 1.5mm 3mm; text-align: left; }
    .lines thead th { background: #eee; }
    .num { text-align: right; white-space: nowrap; width: 38mm; }
    .details th { width: 45%; background: #f3f3f3; }
    .fait { margin-top: 8mm; text-align: right; font-weight: 700; }
    .signs { display: flex; justify-content: space-between; margin-top: 8mm; font-weight: 700; }
    .signs div { min-width: 60mm; text-align: center; min-height: 28mm; }
    @media print {
      html, body, .letterhead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">
  <img class="letterhead" src="" data-attr-src="letterhead" alt="">
  <div class="content">
    <div class="meta"><span>N° : <span data-bare data-field="numero"></span></span><span data-if="matricule">Matricule : <span data-bare data-field="matricule"></span></span></div>
    
    <h1>TITRE DE CONGÉ</h1>
    
    
    <div data-bare data-if="!custom_body" data-letter-body>
    <p>Il est accordé à <span data-bare data-field="civ"></span> <span data-bare data-field="nom"></span>, matricule <span data-bare data-field="matricule_txt"></span>, <span data-bare data-field="poste"></span>, un congé de <span data-bare data-field="days"></span> jour(s) (<span data-bare data-field="leave_kind"></span>), du <span data-bare data-field="from"></span> au <span data-bare data-field="to"></span> inclus.</p>
    <p>L'intéressé<span data-bare data-field="e"></span> devra reprendre son poste de travail le <span data-bare data-field="reprise"></span>.</p>
    </div>
    <p data-each="custom_body" data-field="$item"></p>
    
    <table class="details"><tr><th>Nature du congé</th><td data-field="leave_kind"></td></tr><tr><th>Du</th><td data-field="from"></td></tr><tr><th>Au</th><td data-field="to"></td></tr><tr><th>Nombre de jours</th><td data-field="days"></td></tr><tr><th>Date de reprise</th><td data-field="reprise"></td></tr><tr data-if="leave_balance"><th>Reliquat après congé</th><td><span data-bare data-field="leave_balance"></span> j</td></tr></table>
    <div class="fait">Fait à <span data-bare data-field="company.city_fr"></span>, le <span data-bare data-field="date_doc"></span></div>
    <div class="signs"><div>L'intéressé(e)</div><div>La Direction</div></div>
  </div>
</div>
</body>
</html>$lettre_leave_fr$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'lettre_leave_fr' and status = 'approved');

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'lettre_leave_ar', 1, 'approved', $lettre_leave_ar$<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>سند عطلة <span data-bare data-field="numero_raw"></span></title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap">
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    .page {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      padding: 38mm 20mm 30mm 20mm;
      font-family: Amiri, "Traditional Arabic", Tahoma, serif;
      font-size: 17px;
      line-height: 2;
    }
    .letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
    }
    .content { position: relative; z-index: 1; }
    .meta { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 8mm; }
    .recipient { width: 60%; margin-bottom: 6mm; margin-inline-start: auto; }
    .recipient .mode { font-style: italic; font-size: 0.9em; }
    h1 {
      text-align: center;
      font-size: 26px;
      letter-spacing: 0;
      text-decoration: underline;
      margin: 4mm 0 10mm;
    }
    .subtitle { text-align: center; font-weight: 700; margin-bottom: 8mm; }
    .object { font-weight: 700; text-decoration: underline; margin-bottom: 5mm; }
    p { text-align: justify; margin: 0 0 4mm; text-indent: 0; }
    table { border-collapse: collapse; width: 100%; margin: 4mm 0 6mm; font-size: 0.92em; }
    th, td { border: 1px solid #333; padding: 1.5mm 3mm; text-align: right; }
    .lines thead th { background: #eee; }
    .num { text-align: left; white-space: nowrap; width: 38mm; }
    .details th { width: 45%; background: #f3f3f3; }
    .fait { margin-top: 8mm; text-align: left; font-weight: 700; }
    .signs { display: flex; justify-content: space-between; margin-top: 8mm; font-weight: 700; }
    .signs div { min-width: 60mm; text-align: center; min-height: 28mm; }
    @media print {
      html, body, .letterhead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">
  <img class="letterhead" src="" data-attr-src="letterhead" alt="">
  <div class="content" data-ltr-numbers>
    <div class="meta"><span>الرقم : <span data-bare data-field="numero"></span></span><span data-if="matricule">رقم التسجيل : <span data-bare data-field="matricule"></span></span></div>
    
    <h1>سند عطلة</h1>
    
    
    <div data-bare data-if="!custom_body" data-letter-body>
    <p>تمنح لـ<span data-bare data-field="civ"></span> <span data-bare data-field="nom"></span>، رقم التسجيل <span data-bare data-field="matricule_txt"></span>، <span data-bare data-field="poste"></span>، <span data-bare data-field="leave_kind"></span> مدتها <span data-bare data-field="days"></span> يوماً، من <span data-bare data-field="from"></span> إلى <span data-bare data-field="to"></span> (مدمج).</p>
    <p>وعلى <span data-bare data-field="a_concerned"></span> الالتحاق بمنصب عمل<span data-bare data-field="a_her"></span> يوم <span data-bare data-field="reprise"></span>.</p>
    </div>
    <p data-each="custom_body" data-field="$item"></p>
    
    <table class="details"><tr><th>طبيعة العطلة</th><td data-field="leave_kind"></td></tr><tr><th>من</th><td data-field="from"></td></tr><tr><th>إلى</th><td data-field="to"></td></tr><tr><th>عدد الأيام</th><td data-field="days"></td></tr><tr><th>تاريخ الاستئناف</th><td data-field="reprise"></td></tr><tr data-if="leave_balance"><th>الرصيد المتبقي</th><td><span data-bare data-field="leave_balance"></span> يوم</td></tr></table>
    <div class="fait">حرر في <span data-bare data-field="company.city_ar"></span> بتاريخ <span data-bare data-field="date_doc"></span></div>
    <div class="signs"><div>المعني(ة)</div><div>المديرية</div></div>
  </div>
</div>
</body>
</html>$lettre_leave_ar$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'lettre_leave_ar' and status = 'approved');

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'ordre_mission', 1, 'approved', $ordre_mission$<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title data-field="doc_title"></title>
  <style>
    @font-face { font-family: "IBM Plex Sans"; font-style: normal; font-weight: 400 600; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: "IBM Plex Sans"; font-style: normal; font-weight: 400 600; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin-ext.woff2") format("woff2"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 400; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 400; font-display: swap; src: url("/fonts/om/ibm-plex-sans-arabic-400.woff2") format("woff2"); unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 500; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 500; font-display: swap; src: url("/fonts/om/ibm-plex-sans-arabic-500.woff2") format("woff2"); unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 600; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 600; font-display: swap; src: url("/fonts/om/ibm-plex-sans-arabic-600.woff2") format("woff2"); unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
    @font-face { font-family: "Noto Naskh Arabic"; font-style: normal; font-weight: 700; font-display: swap; src: url("/fonts/om/noto-naskh-arabic-700.woff2") format("woff2"); unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    #om-print-view {
      display: flex;
      flex-direction: column;
      width: 210mm;
      height: 297mm;
      position: relative;
      overflow: hidden;
      padding: 33mm 13mm 28mm 13mm;
      font-family: "IBM Plex Sans", "IBM Plex Sans Arabic", "Segoe UI", sans-serif;
      color: #111;
      background: #fff;
    }
    .om-letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
      pointer-events: none;
    }
    .om-head, .om-stack, .om-foot { position: relative; z-index: 1; }
    .om-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 3.5mm; }
    .om-ref { font-size: 13px; font-weight: 500; }
    .om-ref b { font-weight: 600; margin-left: 2mm; letter-spacing: .4px; }
    .om-title { display: inline-flex; flex-direction: column; color: #0d0d0d; }
    .om-title-ar { font-family: "Noto Naskh Arabic", "IBM Plex Sans Arabic", serif; font-size: 58px; font-weight: 700; line-height: 1.2; direction: rtl; text-align: center; white-space: nowrap; }
    /* Zero width + full min-width: the Arabic word alone sets the block width. */
    .om-title-fr { display: flex; justify-content: space-between; width: 0; min-width: 100%; font-size: 12.5px; font-weight: 600; line-height: 1; margin-top: .8mm; padding-top: 1.6mm; border-top: 1.2pt solid #0d0d0d; }
    .om-stack { flex: 1 1 auto; display: flex; flex-direction: column; gap: 2.5mm; min-height: 0; }
    .om-block { display: flex; flex-direction: column; }
    .om-id { flex: 1.15 1 0; }
    .om-trip { flex: 1 1 0; }
    .om-trans { flex: 1.3 1 0; }
    .om-sec { display: flex; align-items: center; gap: 3mm; padding: 1.5mm 0 1mm; font-size: 11.5px; font-weight: 600; letter-spacing: 1.6px; }
    .om-rule { flex: 1; border-top: .8pt solid #111; }
    .om-rows { flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; padding: 0 1mm; }
    .om-row { display: grid; grid-template-columns: 34% 32% 34%; align-items: center; column-gap: 2.5mm; min-height: 7mm; }
    .om-fr { text-align: left; font-weight: 400; font-size: 12px; line-height: 1.3; color: #333; }
    .om-ar { text-align: right; font-weight: 400; font-size: 13px; line-height: 1.35; direction: rtl; color: #333; font-family: "IBM Plex Sans Arabic", sans-serif; }
    .om-val { text-align: center; font-size: 13px; font-weight: 600; line-height: 1.3; padding: 0 1.5mm; }
    .om-val:empty::before { content: ""; display: block; margin: 0 4mm; border-bottom: 1pt dotted #8a8a8a; height: 3.5mm; }
    .om-sub { display: block; font-weight: 400; font-size: 10.5px; margin-top: .3mm; color: #666; }
    .om-indent { padding-left: 6mm; }
    .om-modes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2mm; padding: 1.5mm 1mm; }
    .om-mode { display: flex; align-items: center; gap: 2mm; font-size: 12px; color: #333; }
    .om-check { width: 4.2mm; height: 4.2mm; border: .8pt solid #111; border-radius: 1mm; display: grid; place-items: center; font-size: 11px; font-weight: 600; line-height: 1; flex: 0 0 auto; color: #111; }
    .om-mode small { display: block; direction: rtl; font-size: 12px; text-align: left; font-family: "IBM Plex Sans Arabic", sans-serif; }
    .om-sign { flex: 1.45 1 0; display: grid; grid-template-columns: 1fr auto 1fr; column-gap: 5mm; min-height: 0; }
    .om-col { display: flex; flex-direction: column; min-width: 0; }
    .om-divider { border-left: .8pt solid #111; margin-top: 1.5mm; }
    .om-kv { display: grid; grid-template-columns: 24mm 1fr; align-items: baseline; gap: 2mm; min-height: 7.5mm; padding: 0 1mm; }
    .om-kv .om-val { text-align: left; font-size: 12px; padding: 0; }
    .om-kv .om-val:empty::before { margin: 0 8mm 0 0; }
    .om-visa { flex: 1; align-items: start; padding-top: 1.5mm; }
    .om-sign .om-row { grid-template-columns: 33% 37% 30%; padding: 0 1mm; }
    .om-sign .om-fr { font-size: 11.5px; }
    .om-sign .om-ar { font-size: 12.5px; }
    .om-sign .om-row .om-val { font-size: 12px; }
    .om-declare { margin: 2.5mm 1mm 0; font-size: 11.5px; line-height: 1.55; color: #333; font-style: italic; }
    .om-foot { display: grid; grid-template-columns: 1fr 1fr; column-gap: 10mm; align-items: end; font-size: 12px; color: #333; padding: 2.5mm 1mm 0; border-top: .8pt solid #111; margin-top: 2mm; }
    .om-foot-line { display: grid; grid-template-columns: auto 1fr auto; align-items: baseline; gap: 3mm; }
    .om-foot .om-val { color: #111; }
    .om-foot .om-ar { font-size: 13px; }
    @media print {
      html, body, .om-letterhead {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
<div id="om-print-view">
  <img class="om-letterhead" src="" data-attr-src="letterhead" alt="">
  <div class="om-head">
    <div class="om-ref">Réf :<b data-field="reference"></b></div>
    <div class="om-title">
      <div class="om-title-ar">أمر بمهمة</div>
      <div class="om-title-fr" aria-label="ORDRE DE MISSION"><span>O</span><span>R</span><span>D</span><span>R</span><span>E</span><span>&nbsp;</span><span>D</span><span>E</span><span>&nbsp;</span><span>M</span><span>I</span><span>S</span><span>S</span><span>I</span><span>O</span><span>N</span></div>
    </div>
  </div>
  <div class="om-stack">
    <section class="om-block om-id">
      <div class="om-sec"><span>I. IDENTIFICATION DU MISSIONNAIRE</span><span class="om-rule"></span></div>
      <div class="om-rows">
        <div class="om-row"><div class="om-fr">Matricule :</div><div class="om-val" data-field="matricule"></div><div class="om-ar">الرقم التسلسلي :</div></div>
        <div class="om-row"><div class="om-fr">Nom et Prénom :</div><div class="om-val" data-field="nom_complet"></div><div class="om-ar">الاسم واللقب :</div></div>
        <div class="om-row"><div class="om-fr">Affectation :</div><div class="om-val" data-field="affectation"></div><div class="om-ar">التعيين :</div></div>
        <div class="om-row"><div class="om-fr">Code affectation :</div><div class="om-val" data-field="code_affectation"></div><div class="om-ar">رمز التعيين :</div></div>
        <div class="om-row"><div class="om-fr">Fonction :</div><div class="om-val" data-field="poste"></div><div class="om-ar">الوظيفة :</div></div>
      </div>
    </section>
    <section class="om-block om-trip">
      <div class="om-sec"><span>II. ITINÉRAIRE DE LA MISSION</span><span class="om-rule"></span></div>
      <div class="om-rows">
        <div class="om-row"><div class="om-fr">Destination(s) :</div><div class="om-val" data-field="destinations"></div><div class="om-ar">الوجهة :</div></div>
        <div class="om-row"><div class="om-fr">Départ :<span class="om-sub">(lieu et date)</span></div><div class="om-val" data-field="depart"></div><div class="om-ar">الذهاب :<span class="om-sub">(المكان والتاريخ)</span></div></div>
        <div class="om-row"><div class="om-fr">Retour :<span class="om-sub">(lieu et date)</span></div><div class="om-val" data-field="retour"></div><div class="om-ar">العودة :<span class="om-sub">(المكان والتاريخ)</span></div></div>
        <div class="om-row"><div class="om-fr">Objet de la mission :</div><div class="om-val" data-field="motif"></div><div class="om-ar">سبب المهمة :</div></div>
      </div>
    </section>
    <section class="om-block om-trans">
      <div class="om-sec"><span>III. MODE DE TRANSPORT</span><span class="om-rule"></span></div>
      <div class="om-modes">
        <div class="om-mode"><span class="om-check" data-field="mode_tous"></span><span>Tous moyens de transport<small>جميع وسائل النقل</small></span></div>
        <div class="om-mode"><span class="om-check" data-field="mode_service"></span><span>Véhicule de service<small>سيارة المصلحة</small></span></div>
      </div>
      <div class="om-rows">
        <div class="om-row"><div class="om-fr">Modèle :</div><div class="om-val" data-field="modele"></div><div class="om-ar">النوع :</div></div>
        <div class="om-row"><div class="om-fr">Immatriculation :</div><div class="om-val" data-field="immat"></div><div class="om-ar">لوح الترقيم :</div></div>
        <div class="om-row"><div class="om-fr">Kilométrage : au départ :</div><div class="om-val" data-field="km_depart"></div><div class="om-ar">حساب العداد : عند الذهاب :</div></div>
        <div class="om-row"><div class="om-fr"><span class="om-indent">au retour :</span></div><div class="om-val" data-field="km_retour"></div><div class="om-ar">عند العودة :</div></div>
      </div>
    </section>
    <section class="om-sign">
      <div class="om-col">
        <div class="om-sec"><span>IV. VALIDATION</span><span class="om-rule"></span></div>
        <div class="om-kv"><span class="om-fr">Établi par :</span><span class="om-val" data-field="donneur"></span></div>
        <div class="om-kv"><span class="om-fr">Fonction :</span><span class="om-val" data-field="piece_fonction"></span></div>
        <div class="om-kv om-visa"><span class="om-fr">Visa :</span></div>
      </div>
      <div class="om-divider"></div>
      <div class="om-col">
        <div class="om-sec"><span>V. SIGNATURE DU MISSIONNAIRE</span><span class="om-rule"></span></div>
        <div class="om-row"><div class="om-fr">Pièce d'identité :</div><div class="om-val" data-field="piece_type"></div><div class="om-ar">وثيقة التعريف :</div></div>
        <div class="om-row"><div class="om-fr">N° :</div><div class="om-val" data-field="piece_num"></div><div class="om-ar">رقم :</div></div>
        <p class="om-declare">Je déclare avoir lu et pris connaissance des conditions de la présente mission et les accepter.</p>
      </div>
    </section>
  </div>
  <div class="om-foot">
    <div class="om-foot-line"><span>Le :</span><span class="om-val" data-field="date_doc"></span><span class="om-ar">بتاريخ :</span></div>
    <div class="om-foot-line"><span>Fait à :</span><span class="om-val" data-field="fait_a"></span><span class="om-ar">حرر في :</span></div>
  </div>
</div>
</body>
</html>$ordre_mission$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'ordre_mission' and status = 'approved');

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'ordre_mission_v1', 1, 'approved', $ordre_mission_v1$<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>ORDRE DE MISSION <span data-bare data-field="numero"></span></title>
  <style>
    @font-face { font-family: "Cairo"; font-style: normal; font-weight: 700; font-display: swap; src: url("/fonts/om/cairo-arabic-700.woff2") format("woff2"); unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    #om-print-view {
      display: flex;
      flex-direction: column;
      width: 210mm;
      height: 297mm;
      position: relative;
      overflow: hidden;
      padding: 30mm 12mm 22mm 12mm;
      font-family: Arial, Tahoma, sans-serif;
      color: #111;
      background: #fff;
    }
    .om-letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
      pointer-events: none;
    }
    .om-head, .om-stack, .om-foot {
      position: relative;
      z-index: 1;
    }
    .om-head {
      display: grid;
      grid-template-columns: 1.05fr 1fr;
      align-items: center;
      flex: 0 0 auto;
      margin-bottom: 3.5mm;
      gap: 4mm;
    }
    .om-idbox {
      border: 1.4pt solid #111;
      border-radius: 11px;
      padding: 3mm 6mm 3mm 4mm;
    }
    .om-idrow {
      display: grid;
      grid-template-columns: 32mm 1fr 36mm;
      align-items: end;
      gap: 2.5mm;
      margin-bottom: 2.2mm;
    }
    .om-idrow:last-child { margin-bottom: 0; }
    .om-title { text-align: center; text-decoration: none; line-height: 1.25; }
    .om-title-ar {
      font-family: Cairo, Amiri, "Traditional Arabic", Tahoma, sans-serif;
      font-size: 22px;
      font-weight: bold;
      direction: rtl;
      letter-spacing: 0.4px;
      margin-bottom: 1.8mm;
      line-height: 1.25;
    }
    .om-title-fr {
      font-family: "Times New Roman", Georgia, "Palatino Linotype", serif;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 1.4px;
      text-transform: uppercase;
    }
    .om-stack {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: 4mm;
      min-height: 0;
    }
    .om-box {
      border: 1.4pt solid #111;
      border-radius: 12px;
      padding: 4.5mm 7mm 4.5mm 5mm;
      display: flex;
      flex-direction: column;
      justify-content: space-evenly;
    }
    .om-box-emp { flex: 0.85 1 0; }
    .om-box-trip { flex: 1.25 1 0; }
    .om-box-trans { flex: 1.1 1 0; }
    .om-row {
      display: grid;
      grid-template-columns: 34% 32% 34%;
      align-items: center;
      column-gap: 2.5mm;
      min-height: 9mm;
    }
    .om-fr { text-align: left; font-weight: 700; font-size: 13px; line-height: 1.35; }
    .om-ar {
      text-align: right;
      font-weight: 700;
      font-size: 13px;
      line-height: 1.45;
      direction: rtl;
      font-family: Arial, Tahoma, sans-serif;
      padding-right: 15px;
    }
    .om-val {
      text-align: center;
      font-size: 14px;
      font-weight: 800;
      line-height: 1.35;
      min-height: 6mm;
      padding: 0 1.5mm;
    }
    .om-sub { display: block; font-weight: 700; font-size: 12px; margin-top: 0.6mm; }
    .om-hint { display: block; font-weight: 600; font-size: 11px; margin-top: 0.4mm; }
    .om-indent { padding-left: 8mm; }
    .om-bottom {
      flex: 1.05 1 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4mm;
    }
    .om-bottom .om-box { height: 100%; padding: 4mm 7mm 4mm 4.5mm; }
    .om-bottom .om-row { grid-template-columns: 38% 28% 34%; min-height: 10mm; }
    .om-box-donneur .om-row { grid-template-columns: 32% 38% 30%; }
    .om-box-donneur .om-val {
      font-size: 10.5px;
      font-weight: 700;
      line-height: 1.15;
      overflow-wrap: anywhere;
      word-break: break-word;
      padding: 0 1mm;
    }
    .om-foot {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: 1.15fr 1fr;
      align-items: end;
      font-weight: 700;
      font-size: 13.5px;
      padding: 3.5mm 2mm 0 2mm;
    }
    .om-foot-line { display: flex; align-items: baseline; gap: 3.5mm; }
    .om-foot .om-val { flex: 1; min-width: 32mm; font-size: 14px; font-weight: 800; }
    .om-hmd { letter-spacing: 0.5px; font-weight: 800; font-size: 14px; }
    @media print {
      html, body, .om-letterhead {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
<div id="om-print-view">
  <img class="om-letterhead" src="" data-attr-src="letterhead" alt="">
  <div class="om-head">
    <div class="om-idbox">
      <div class="om-idrow"><span class="om-fr">N°:</span><span class="om-val" data-field="numero"></span><span class="om-ar">رقم :</span></div>
      <div class="om-idrow"><span class="om-fr">MATRICULE:</span><span class="om-val" data-field="matricule"></span><span class="om-ar">الرقم التسلسلي:</span></div>
    </div>
    <div class="om-title">
      <div class="om-title-ar">أمر بمهمة</div>
      <div class="om-title-fr">ORDRE DE MISSION</div>
    </div>
  </div>
  <div class="om-stack">
    <div class="om-box om-box-emp">
      <div class="om-row"><div class="om-fr">Nom et Prénom :</div><div class="om-val" data-field="nom_complet"></div><div class="om-ar">الاسم واللقب :</div></div>
      <div class="om-row"><div class="om-fr">Affectation :</div><div class="om-val" data-field="affectation"></div><div class="om-ar">تعيين :</div></div>
      <div class="om-row"><div class="om-fr">Fonction :</div><div class="om-val" data-field="poste"></div><div class="om-ar">الوظيفة :</div></div>
    </div>
    <div class="om-box om-box-trip">
      <div class="om-row"><div class="om-fr">Se rendre à: 1<sup>er</sup> destination:</div><div class="om-val" data-field="dest1"></div><div class="om-ar">يسافر إلى: الوجهة الأولى :</div></div>
      <div class="om-row"><div class="om-fr om-indent">2<sup>ème</sup> destination:</div><div class="om-val" data-field="dest2"></div><div class="om-ar">الوجهة الثانية :</div></div>
      <div class="om-row"><div class="om-fr">Départ:<span class="om-sub">Lieu et date et heure:</span></div><div class="om-val" data-field="depart_heure"></div><div class="om-ar">الذهاب :<span class="om-sub">المكان والتاريخ والساعة :</span></div></div>
      <div class="om-row"><div class="om-fr">Retour:<span class="om-sub">Lieu et date et heure:</span></div><div class="om-val" data-field="retour_heure"></div><div class="om-ar">العودة :<span class="om-sub">المكان والتاريخ والساعة :</span></div></div>
      <div class="om-row"><div class="om-fr">Motif du déplacement:</div><div class="om-val" data-field="motif"></div><div class="om-ar">سبب السفر :</div></div>
    </div>
    <div class="om-box om-box-trans">
      <div class="om-row"><div class="om-fr">Moyen de transport:<span class="om-hint">( Train – Avion – Taxi)</span></div><div class="om-val" data-field="moyen"></div><div class="om-ar">وسائل النقل :<span class="om-hint">(قطار - طائرة - تاكسي ...)</span></div></div>
      <div class="om-row"><div class="om-fr">Véhicule de l'entreprise: Modèle:</div><div class="om-val" data-field="modele"></div><div class="om-ar">مركبة المؤسسة : النوع :</div></div>
      <div class="om-row"><div class="om-fr">Immatriculation:</div><div class="om-val" data-field="immat"></div><div class="om-ar">لوح الترقيم :</div></div>
      <div class="om-row"><div class="om-fr">Kilométrage: au départ:</div><div class="om-val" data-field="km_depart"></div><div class="om-ar">حساب العداد : عند الذهاب :</div></div>
      <div class="om-row"><div class="om-fr om-indent">au retour:</div><div class="om-val" data-field="km_retour"></div><div class="om-ar">عند العودة :</div></div>
    </div>
    <div class="om-bottom">
      <div class="om-box om-box-donneur">
        <div class="om-row"><div class="om-fr">Donneur de l'OM</div><div class="om-val" data-field="donneur"></div><div class="om-ar">مسلم أمر المهمة :</div></div>
        <div class="om-row"><div class="om-fr">Mr/Entreprise:</div><div class="om-val" data-field="company.name_fr"></div><div class="om-ar">السيد(ة) المؤسسة :</div></div>
        <div class="om-row"><div class="om-fr">Fonction :</div><div class="om-val" data-field="piece_fonction"></div><div class="om-ar">الوظيفة :</div></div>
      </div>
      <div class="om-box">
        <div class="om-row"><div class="om-fr">pièce d'identité :</div><div class="om-val" data-field="piece_type"></div><div class="om-ar">وثيقة التعريف :</div></div>
        <div class="om-row"><div class="om-fr">N° :</div><div class="om-val" data-field="piece_num"></div><div class="om-ar">رقم :</div></div>
        <div class="om-row"><div class="om-fr">Délivré le :</div><div class="om-val" data-field="piece_delivre"></div><div class="om-ar">سلمت بتاريخ :</div></div>
        <div class="om-row"><div class="om-fr">à :</div><div class="om-val" data-field="piece_lieu"></div><div class="om-ar">في :</div></div>
      </div>
    </div>
  </div>
  <div class="om-foot">
    <div class="om-foot-line"><span class="om-fr">Le :</span><span class="om-val" data-field="date_doc"></span><span class="om-ar">بتاريخ :</span></div>
    <div class="om-foot-line" style="justify-content:flex-end;"><span class="om-fr">Fait à :</span><span class="om-hmd" data-field="fait_a"></span><span class="om-ar">حرر في :</span></div>
  </div>
</div>
</body>
</html>$ordre_mission_v1$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'ordre_mission_v1' and status = 'approved');

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'titre_conge', 1, 'approved', $titre_conge$<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title data-field="doc_title"></title>
  <style>
    @font-face { font-family: "IBM Plex Sans"; font-style: normal; font-weight: 400 600; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: "IBM Plex Sans"; font-style: normal; font-weight: 400 600; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin-ext.woff2") format("woff2"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 400; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 400; font-display: swap; src: url("/fonts/om/ibm-plex-sans-arabic-400.woff2") format("woff2"); unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 500; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 500; font-display: swap; src: url("/fonts/om/ibm-plex-sans-arabic-500.woff2") format("woff2"); unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 600; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 600; font-display: swap; src: url("/fonts/om/ibm-plex-sans-arabic-600.woff2") format("woff2"); unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
    @font-face { font-family: "Noto Naskh Arabic"; font-style: normal; font-weight: 700; font-display: swap; src: url("/fonts/om/noto-naskh-arabic-700.woff2") format("woff2"); unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    #om-print-view {
      display: flex;
      flex-direction: column;
      width: 210mm;
      height: 297mm;
      position: relative;
      overflow: hidden;
      padding: 33mm 13mm 28mm 13mm;
      font-family: "IBM Plex Sans", "IBM Plex Sans Arabic", "Segoe UI", sans-serif;
      color: #111;
      background: #fff;
    }
    .om-letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
      pointer-events: none;
    }
    .om-head, .om-stack, .om-foot { position: relative; z-index: 1; }
    .om-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 3.5mm; }
    .om-ref { font-size: 13px; font-weight: 500; }
    .om-ref b { font-weight: 600; margin-left: 2mm; letter-spacing: .4px; }
    .om-title { display: inline-flex; flex-direction: column; color: #0d0d0d; }
    .om-title-ar { font-family: "Noto Naskh Arabic", "IBM Plex Sans Arabic", serif; font-size: 58px; font-weight: 700; line-height: 1.2; direction: rtl; text-align: center; white-space: nowrap; }
    /* Zero width + full min-width: the Arabic word alone sets the block width. */
    .om-title-fr { display: flex; justify-content: space-between; width: 0; min-width: 100%; font-size: 12.5px; font-weight: 600; line-height: 1; margin-top: .8mm; padding-top: 1.6mm; border-top: 1.2pt solid #0d0d0d; }
    .om-stack { flex: 1 1 auto; display: flex; flex-direction: column; gap: 2.5mm; min-height: 0; }
    .om-block { display: flex; flex-direction: column; }
    .om-id { flex: 1.15 1 0; }
    .om-trip { flex: 1 1 0; }
    .om-trans { flex: 1.3 1 0; }
    .om-sec { display: flex; align-items: center; gap: 3mm; padding: 1.5mm 0 1mm; font-size: 11.5px; font-weight: 600; letter-spacing: 1.6px; }
    .om-rule { flex: 1; border-top: .8pt solid #111; }
    .om-rows { flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; padding: 0 1mm; }
    .om-row { display: grid; grid-template-columns: 34% 32% 34%; align-items: center; column-gap: 2.5mm; min-height: 7mm; }
    .om-fr { text-align: left; font-weight: 400; font-size: 12px; line-height: 1.3; color: #333; }
    .om-ar { text-align: right; font-weight: 400; font-size: 13px; line-height: 1.35; direction: rtl; color: #333; font-family: "IBM Plex Sans Arabic", sans-serif; }
    .om-val { text-align: center; font-size: 13px; font-weight: 600; line-height: 1.3; padding: 0 1.5mm; }
    .om-val:empty::before { content: ""; display: block; margin: 0 4mm; border-bottom: 1pt dotted #8a8a8a; height: 3.5mm; }
    .om-sub { display: block; font-weight: 400; font-size: 10.5px; margin-top: .3mm; color: #666; }
    .om-indent { padding-left: 6mm; }
    .om-modes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2mm; padding: 1.5mm 1mm; }
    .om-mode { display: flex; align-items: center; gap: 2mm; font-size: 12px; color: #333; }
    .om-check { width: 4.2mm; height: 4.2mm; border: .8pt solid #111; border-radius: 1mm; display: grid; place-items: center; font-size: 11px; font-weight: 600; line-height: 1; flex: 0 0 auto; color: #111; }
    .om-mode small { display: block; direction: rtl; font-size: 12px; text-align: left; font-family: "IBM Plex Sans Arabic", sans-serif; }
    .om-sign { flex: 1.45 1 0; display: grid; grid-template-columns: 1fr auto 1fr; column-gap: 5mm; min-height: 0; }
    .om-col { display: flex; flex-direction: column; min-width: 0; }
    .om-divider { border-left: .8pt solid #111; margin-top: 1.5mm; }
    .om-kv { display: grid; grid-template-columns: 24mm 1fr; align-items: baseline; gap: 2mm; min-height: 7.5mm; padding: 0 1mm; }
    .om-kv .om-val { text-align: left; font-size: 12px; padding: 0; }
    .om-kv .om-val:empty::before { margin: 0 8mm 0 0; }
    .om-visa { flex: 1; align-items: start; padding-top: 1.5mm; }
    .om-sign .om-row { grid-template-columns: 33% 37% 30%; padding: 0 1mm; }
    .om-sign .om-fr { font-size: 11.5px; }
    .om-sign .om-ar { font-size: 12.5px; }
    .om-sign .om-row .om-val { font-size: 12px; }
    .om-declare { margin: 2.5mm 1mm 0; font-size: 11.5px; line-height: 1.55; color: #333; font-style: italic; }
    .om-foot { display: grid; grid-template-columns: 1fr 1fr; column-gap: 10mm; align-items: end; font-size: 12px; color: #333; padding: 2.5mm 1mm 0; border-top: .8pt solid #111; margin-top: 2mm; }
    .om-foot-line { display: grid; grid-template-columns: auto 1fr auto; align-items: baseline; gap: 3mm; }
    .om-foot .om-val { color: #111; }
    .om-foot .om-ar { font-size: 13px; }
    @media print {
      html, body, .om-letterhead {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
<div id="om-print-view">
  <img class="om-letterhead" src="" data-attr-src="letterhead" alt="">
  <div class="om-head">
    <div class="om-ref">Réf :<b data-field="reference"></b></div>
    <div class="om-title">
      <div class="om-title-ar">إجازة</div>
      <div class="om-title-fr" aria-label="TITRE DE CONGÉ"><span>T</span><span>I</span><span>T</span><span>R</span><span>E</span><span>&nbsp;</span><span>D</span><span>E</span><span>&nbsp;</span><span>C</span><span>O</span><span>N</span><span>G</span><span>É</span></div>
    </div>
  </div>
  <div class="om-stack">
    <section class="om-block om-id">
      <div class="om-sec"><span>I. IDENTIFICATION DE L'INTÉRESSÉ(E)</span><span class="om-rule"></span></div>
      <div class="om-rows">
        <div class="om-row"><div class="om-fr">Matricule :</div><div class="om-val" data-field="matricule"></div><div class="om-ar">الرقم التسلسلي :</div></div>
        <div class="om-row"><div class="om-fr">Nom et Prénom :</div><div class="om-val" data-field="nom_complet"></div><div class="om-ar">الاسم واللقب :</div></div>
        <div class="om-row"><div class="om-fr">Affectation :</div><div class="om-val" data-field="affectation"></div><div class="om-ar">التعيين :</div></div>
        
        <div class="om-row"><div class="om-fr">Fonction :</div><div class="om-val" data-field="poste"></div><div class="om-ar">الوظيفة :</div></div>
      </div>
    </section>
    <section class="om-block om-trip">
      <div class="om-sec"><span>II. DÉTAIL DU CONGÉ</span><span class="om-rule"></span></div>
      <div class="om-rows">
        <div class="om-row"><div class="om-fr">Nature du congé :</div><div class="om-val" data-field="nature"></div><div class="om-ar">طبيعة الإجازة :</div></div>
        <div class="om-row"><div class="om-fr">Période :<span class="om-sub">(du … au …)</span></div><div class="om-val" data-field="periode"></div><div class="om-ar">الفترة :<span class="om-sub">(من … إلى …)</span></div></div>
        <div class="om-row"><div class="om-fr">Nombre de jours :</div><div class="om-val" data-field="jours"></div><div class="om-ar">عدد الأيام :</div></div>
      </div>
    </section>
    <section class="om-block om-trans">
      <div class="om-sec"><span>III. MODE DE TRANSPORT</span><span class="om-rule"></span></div>
      <div class="om-modes">
        <div class="om-mode"><span class="om-check" data-field="mode_tous"></span><span>Tous moyens de transport<small>جميع وسائل النقل</small></span></div>
        <div class="om-mode"><span class="om-check" data-field="mode_service"></span><span>Véhicule de service<small>سيارة المصلحة</small></span></div>
      </div>
      <div class="om-rows">
        <div class="om-row"><div class="om-fr">Modèle :</div><div class="om-val" data-field="modele"></div><div class="om-ar">النوع :</div></div>
        <div class="om-row"><div class="om-fr">Immatriculation :</div><div class="om-val" data-field="immat"></div><div class="om-ar">لوح الترقيم :</div></div>
        <div class="om-row"><div class="om-fr">Kilométrage : au départ :</div><div class="om-val" data-field="km_depart"></div><div class="om-ar">حساب العداد : عند الذهاب :</div></div>
        <div class="om-row"><div class="om-fr"><span class="om-indent">au retour :</span></div><div class="om-val" data-field="km_retour"></div><div class="om-ar">عند العودة :</div></div>
      </div>
    </section>
    <section class="om-sign">
      <div class="om-col">
        <div class="om-sec"><span>IV. VALIDATION</span><span class="om-rule"></span></div>
        <div class="om-kv"><span class="om-fr">Établi par :</span><span class="om-val" data-field="donneur"></span></div>
        <div class="om-kv"><span class="om-fr">Fonction :</span><span class="om-val" data-field="piece_fonction"></span></div>
        <div class="om-kv om-visa"><span class="om-fr">Visa :</span></div>
      </div>
      <div class="om-divider"></div>
      <div class="om-col">
        <div class="om-sec"><span>V. SIGNATURE DE L'INTÉRESSÉ(E)</span><span class="om-rule"></span></div>
        <div class="om-row"><div class="om-fr">Pièce d'identité :</div><div class="om-val" data-field="piece_type"></div><div class="om-ar">وثيقة التعريف :</div></div>
        <div class="om-row"><div class="om-fr">N° :</div><div class="om-val" data-field="piece_num"></div><div class="om-ar">رقم :</div></div>
        <p class="om-declare">Je m'engage à reprendre mon poste<span data-bare data-if="reprise"> le <span data-bare data-field="reprise"></span></span> à l'issue du présent congé.</p>
      </div>
    </section>
  </div>
  <div class="om-foot">
    <div class="om-foot-line"><span>Le :</span><span class="om-val" data-field="date_doc"></span><span class="om-ar">بتاريخ :</span></div>
    <div class="om-foot-line"><span>Fait à :</span><span class="om-val" data-field="fait_a"></span><span class="om-ar">حرر في :</span></div>
  </div>
</div>
</body>
</html>$titre_conge$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'titre_conge' and status = 'approved');

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'fiche_renseignements', 1, 'approved', $fiche_renseignements$<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title data-field="doc_title"></title>
  <style>
    @font-face { font-family: "IBM Plex Sans"; font-style: normal; font-weight: 400 600; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: "IBM Plex Sans"; font-style: normal; font-weight: 400 600; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin-ext.woff2") format("woff2"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 400; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 400; font-display: swap; src: url("/fonts/om/ibm-plex-sans-arabic-400.woff2") format("woff2"); unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 500; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 500; font-display: swap; src: url("/fonts/om/ibm-plex-sans-arabic-500.woff2") format("woff2"); unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 600; font-display: swap; src: url("/fonts/om/ibm-plex-sans-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: "IBM Plex Sans Arabic"; font-style: normal; font-weight: 600; font-display: swap; src: url("/fonts/om/ibm-plex-sans-arabic-600.woff2") format("woff2"); unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
    @font-face { font-family: "Noto Naskh Arabic"; font-style: normal; font-weight: 700; font-display: swap; src: url("/fonts/om/noto-naskh-arabic-700.woff2") format("woff2"); unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC; }
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    #om-print-view {
      display: flex;
      flex-direction: column;
      width: 210mm;
      height: 297mm;
      position: relative;
      overflow: hidden;
      padding: 33mm 13mm 26mm 13mm;
      font-family: "IBM Plex Sans", "IBM Plex Sans Arabic", "Segoe UI", sans-serif;
      color: #111;
      background: #fff;
    }
    .om-letterhead {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      z-index: 0;
      pointer-events: none;
    }
    .om-head, .om-stack, .om-foot { position: relative; z-index: 1; }
    .om-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 3mm; }
    .om-ref { font-size: 13px; font-weight: 500; }
    .om-ref b { font-weight: 600; margin-left: 2mm; letter-spacing: .4px; }
    .om-title { display: inline-flex; flex-direction: column; color: #0d0d0d; }
    .om-title-ar { font-family: "Noto Naskh Arabic", "IBM Plex Sans Arabic", serif; font-size: 46px; font-weight: 700; line-height: 1.2; direction: rtl; text-align: center; white-space: nowrap; }
    /* Zero width + full min-width: the Arabic word alone sets the block width. */
    .om-title-fr { display: flex; justify-content: space-between; width: 0; min-width: 100%; font-size: 11.5px; font-weight: 600; line-height: 1; margin-top: .8mm; padding-top: 1.6mm; border-top: 1.2pt solid #0d0d0d; }
    .om-stack { flex: 1 1 auto; display: flex; flex-direction: column; gap: 1.6mm; min-height: 0; }
    .om-block { display: flex; flex-direction: column; min-height: 0; }
    .om-sec { display: flex; align-items: center; gap: 3mm; padding: 1.2mm 0 .8mm; font-size: 11px; font-weight: 600; letter-spacing: 1.4px; }
    .om-rule { flex: 1; border-top: .8pt solid #111; }
    .fx-sec-ar { font-family: "IBM Plex Sans Arabic", sans-serif; font-size: 12.5px; letter-spacing: 0; direction: rtl; }
    .om-rows { flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; padding: 0 1mm; }
    .fx-id { display: grid; grid-template-columns: 1fr 27mm; column-gap: 5mm; flex: 1; min-height: 0; }
    .fx-photo { align-self: center; width: 27mm; height: 34mm; border: .8pt solid #111; border-radius: 1mm; object-fit: cover; display: grid; place-items: center; text-align: center; font-size: 10px; line-height: 1.4; color: #888; }
    .fx-line { display: grid; column-gap: 6mm; }
    .fx-line.cols-1 { grid-template-columns: 1fr; }
    .fx-line.cols-2 { grid-template-columns: 1fr 1fr; }
    .fx-line.cols-3 { grid-template-columns: repeat(3, 1fr); }
    .fx-line.cols-4 { grid-template-columns: repeat(4, 1fr); }
    .fx-cell { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; column-gap: 2mm; min-height: 6mm; min-width: 0; }
    .om-fr { text-align: left; font-weight: 400; font-size: 11px; line-height: 1.25; color: #333; white-space: nowrap; }
    .om-ar { text-align: right; font-weight: 400; font-size: 12px; line-height: 1.3; direction: rtl; color: #333; font-family: "IBM Plex Sans Arabic", sans-serif; white-space: nowrap; }
    .om-val { text-align: center; font-size: 12px; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; }
    .om-val:empty::before { content: ""; display: block; margin: 0 1mm; border-bottom: 1pt dotted #8a8a8a; height: 3.2mm; }
    .om-sign { flex: 0 0 38mm; margin-top: 1.5mm; display: grid; grid-template-columns: 1fr auto 1fr; column-gap: 5mm; min-height: 0; }
    .om-col { display: flex; flex-direction: column; min-width: 0; }
    .om-divider { border-left: .8pt solid #111; margin-top: 1.5mm; }
    .om-declare { margin: 1.5mm 1mm 0; font-size: 11px; line-height: 1.5; color: #333; font-style: italic; }
    .om-declare-ar { margin: .5mm 1mm 0; font-size: 12px; line-height: 1.5; color: #333; direction: rtl; text-align: right; font-family: "IBM Plex Sans Arabic", sans-serif; }
    .fx-admin { margin: 1.5mm 1mm 0; font-size: 11.5px; line-height: 1.5; color: #333; }
    .fx-admin b { font-weight: 600; color: #111; }
    .fx-visa { margin: auto 1mm 0; font-size: 11px; color: #333; }
    .om-foot { display: grid; grid-template-columns: 1fr 1fr; column-gap: 10mm; align-items: end; font-size: 12px; color: #333; padding: 2.5mm 1mm 0; border-top: .8pt solid #111; margin-top: 2mm; }
    .om-foot-line { display: grid; grid-template-columns: auto 1fr auto; align-items: baseline; gap: 3mm; }
    .om-foot .om-val { color: #111; }
    .om-foot .om-ar { font-size: 13px; }
    @media print {
      html, body, .om-letterhead {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
<div id="om-print-view">
  <img class="om-letterhead" src="" data-attr-src="letterhead" alt="">
  <div class="om-head">
    <div class="om-ref"><span data-bare data-field="matricule_label"></span><b data-field="matricule"></b></div>
    <div class="om-title">
      <div class="om-title-ar">بطاقة المعلومات</div>
      <div class="om-title-fr" aria-label="" data-attr-aria-label="title_fr"><span data-each="title_letters" data-field="$item"></span></div>
    </div>
  </div>
  <div class="om-stack">
    <section class="om-block" style="" data-attr-style="identity_style">
      <div class="om-sec"><span>I. IDENTIFICATION DE L'EMPLOYÉ(E)</span><span class="om-rule"></span><span class="fx-sec-ar">هوية العامل(ة)</span></div>
      <div class="fx-id">
        <div class="om-rows">
          <div class="fx-line" data-each="identity_rows" data-attr-class="css"><div class="fx-cell" data-each="cells"><span class="om-fr" data-field="label_fr"></span><span class="om-val" data-field="value"></span><span class="om-ar" data-field="label_ar"></span></div></div>
        </div>
        <img class="fx-photo" data-if="photo" src="" data-attr-src="photo" alt="">
        <div class="fx-photo" data-if="!photo">Photo<br>صورة</div>
      </div>
    </section>
    <section class="om-block" data-each="sections" style="" data-attr-style="style">
      <div class="om-sec"><span data-field="heading"></span><span class="om-rule"></span><span class="fx-sec-ar" data-if="title_ar" data-field="title_ar"></span></div>
      <div class="om-rows">
        <div class="fx-line" data-each="rows" data-attr-class="css"><div class="fx-cell" data-each="cells"><span class="om-fr" data-field="label_fr"></span><span class="om-val" data-field="value"></span><span class="om-ar" data-field="label_ar"></span></div></div>
      </div>
    </section>
    <section class="om-sign">
      <div class="om-col">
        <div class="om-sec"><span data-field="sign_left_heading"></span><span class="om-rule"></span><span class="fx-sec-ar">العامل(ة)</span></div>
        <p class="om-declare">Je certifie l'exactitude des renseignements ci-dessus.<span data-bare data-if="sign_left_sub"> <span data-bare data-field="sign_left_sub"></span>.</span></p>
        <p class="om-declare-ar">أشهد بصحة المعلومات المذكورة أعلاه.</p>
        <div class="fx-visa">Signature :</div>
      </div>
      <div class="om-divider"></div>
      <div class="om-col">
        <div class="om-sec"><span data-field="sign_right_heading"></span><span class="om-rule"></span><span class="fx-sec-ar">الإدارة</span></div>
        <div class="fx-admin">
          <b data-if="sig_right_line1" data-field="sig_right_line1"></b><br data-if="sig_right_line1">
          <span data-bare data-field="sig_right_line2"></span>
        </div>
        <div class="fx-visa">Visa :</div>
      </div>
    </section>
  </div>
  <div class="om-foot">
    <div class="om-foot-line"><span>Le :</span><span class="om-val" data-field="today"></span><span class="om-ar">بتاريخ :</span></div>
    <div class="om-foot-line"><span>Fait à :</span><span class="om-val" data-field="company.city_short"></span><span class="om-ar">حرر في :</span></div>
  </div>
</div>
</body>
</html>$fiche_renseignements$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'fiche_renseignements' and status = 'approved');

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'contrat_cdd', 1, 'approved', $contrat_cdd$<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>عقد عمل محدد المدة <span data-bare data-field="numero"></span> - <span data-bare data-field="nom"></span></title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap">
  <style>
    @page {
      size: A4 portrait;
      margin: 16mm 17mm 18mm 17mm;
      @bottom-center { content: counter(page) "/" counter(pages); font: 12px "Times New Roman", serif; }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    body {
      direction: rtl;
      font-family: Amiri, "Traditional Arabic", "Sakkal Majalla", "Times New Roman", serif;
      font-size: 16px;
      line-height: 1.85;
    }
    h1 {
      text-align: center;
      font-size: 30px;
      margin: 0 0 2mm;
      line-height: 1.4;
    }
    h1 span { border-bottom: 2px solid #111; padding: 0 4mm 1mm; }
    .numero { text-align: center; font-size: 19px; margin: 0 0 3mm; }
    p { margin: 0 0 1.5mm; text-align: justify; }
    .party { font-weight: 700; font-size: 18px; margin: 2mm 0 1mm; }
    .party span { border-bottom: 1.5px solid #111; padding-bottom: 0.5mm; }
    .indent { text-indent: 8mm; }
    .row { display: grid; grid-template-columns: 1fr 1fr; column-gap: 8mm; }
    .line { margin: 0 0 0.8mm; }
    .center { text-align: center; }
    h3 { font-size: 17px; margin: 2.5mm 0 1mm; font-weight: 700; break-after: avoid; }
    .article p, ul.reasons li { break-inside: avoid; orphans: 2; widows: 2; }
    ul.reasons { list-style: none; margin: 1mm 0 0; padding: 0 12mm 0 0; }
    ul.reasons li { margin: 0 0 0.6mm; }
    ul.reasons .num { display: inline-block; min-width: 6mm; }
    ul.reasons .box { font-size: 18px; margin-left: 1.5mm; font-family: "Segoe UI Symbol", "DejaVu Sans", sans-serif; }
    .blank { display: inline-block; min-width: 35mm; border-bottom: 1px dotted #555; }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      margin-top: 8mm;
      min-height: 42mm;
      break-inside: avoid;
      font-weight: 700;
      font-size: 17px;
    }
    .signatures div:last-child { text-align: left; }
    .copies { display: grid; grid-template-columns: auto 1fr; column-gap: 10mm; margin-top: 4mm; break-inside: avoid; }
    .closing { text-align: center; margin: 5mm 0 0; }
  </style>
</head>
<body>
  <h1><span>عقد عمل محدد المدة</span></h1>
  <div class="numero">رقم: <strong data-if="numero" data-field="numero"></strong><span class="blank" data-if="!numero"></span></div>
  <p>تطبيقًا للإجراءات المنصوص عليها في القانون رقم : 11/90 المؤرخ في 21 أفريل 1990 المتعلق بعلاقات العمل.</p>
  <p>يبرم هذا العقد المحدد المدة بين:</p>

  <div class="party"><span>مـن جـهـة:</span></div>
  <p class="indent">السيّد : <strong><span data-bare data-field="company.manager_name_ar"></span></strong> مسير <span data-bare data-field="company.name_ar"></span> الكائن مقرها بـ: <span data-bare data-field="company.address_ar"></span>، وهذا بموجب تعديل القانون الأساسي المؤرخ في 2019/11/28 تحت رقم الفهرس 2019/951: بمكتب الأستاذ معماش النجاعي موثق بحي زادي مسعود عمارة س رقم 105 الطابق الأول بسطيف.</p>

  <div class="party"><span>ومـن جهـة أخـرى:</span></div>
  <div class="line">السيّد (ة): <strong data-if="nom" data-field="nom"></strong><span class="blank" data-if="!nom"></span></div>
  <div class="line">الرقم التسلسلي: <strong data-if="matricule" data-field="matricule"></strong><span class="blank" data-if="!matricule"></span></div>
  <div class="row line"><div>المولود(ة) بتاريخ: <strong data-if="birth_date" data-field="birth_date"></strong><span class="blank" data-if="!birth_date"></span></div><div>بـ: <strong data-if="birth_place" data-field="birth_place"></strong><span class="blank" data-if="!birth_place"></span></div></div>
  <div class="row line"><div>إبن (ة): <strong data-if="father" data-field="father"></strong><span class="blank" data-if="!father"></span></div><div>و: <strong data-if="mother" data-field="mother"></strong><span class="blank" data-if="!mother"></span></div></div>
  <div class="line">الحالة العائلية: <strong data-if="marital" data-field="marital"></strong><span class="blank" data-if="!marital"></span></div>
  <div class="line">الحامل (ة) لـ: <span data-bare data-field="id_piece"></span> رقم: <strong data-if="id_number" data-field="id_number"></strong><span class="blank" data-if="!id_number"></span> الصادر(ة) في: <strong data-if="id_issued_on" data-field="id_issued_on"></strong><span class="blank" data-if="!id_issued_on"></span> عن سلطة الاصدار:</div>
  <div class="line"><strong data-if="id_issued_by" data-field="id_issued_by"></strong><span class="blank" data-if="!id_issued_by"></span></div>
  <div class="line">الساكن (ة) بـ: <strong data-if="address" data-field="address"></strong><span class="blank" data-if="!address"></span></div>

  <div class="article">
    <h3>المادة الأولى:</h3>
    <div class="line center">يَشْغَل السيد(ة) المتعاقد معه منصب: <strong data-if="poste" data-field="poste"></strong><span class="blank" data-if="!poste"></span></div>
    <div class="row line"><div>ابتداء من تاريخ: <strong data-if="start_date" data-field="start_date"></strong><span class="blank" data-if="!start_date"></span></div><div>إلى غاية: <strong data-if="end_date" data-field="end_date"></strong><span class="blank" data-if="!end_date"></span></div></div>
  </div>

  <div class="article">
    <h3>المادة الثانية:</h3>
    <p>يوظف السيد (ة) المذكور أعلاه في المنصب المتاح وهذا لأجل أحد الأسباب المذكورة في المادة 12 من القانون: 11/90 المتعلق بعلاقات العمل وهي:</p>
    <ul class="reasons"><li><span class="num">1-</span><span class="box"><span data-bare data-if="cdd_reason == 1">&#x2612;</span><span data-bare data-if="cdd_reason != 1">&#x2610;</span></span>عندما يوظف العامل(ة) عمل مرتبط بعقود وأشغال أو خدمات غير متجددة.</li><li><span class="num">2-</span><span class="box"><span data-bare data-if="cdd_reason == 2">&#x2612;</span><span data-bare data-if="cdd_reason != 2">&#x2610;</span></span>عندما يتعلق الأمر باستخلاف عامل مثبت في منصب تغيب عنه مؤقتاً.</li><li><span class="num">3-</span><span class="box"><span data-bare data-if="cdd_reason == 3">&#x2612;</span><span data-bare data-if="cdd_reason != 3">&#x2610;</span></span>عندما يتطلب الأمر من الهيئة المستخدمة إجراء أشغال ذات طابع منقطع.</li><li><span class="num">4-</span><span class="box"><span data-bare data-if="cdd_reason == 4">&#x2612;</span><span data-bare data-if="cdd_reason != 4">&#x2610;</span></span>عندما يبرر ذلك بتزايد العمل أو أسباب موسمية.</li><li><span class="num">5-</span><span class="box"><span data-bare data-if="cdd_reason == 5">&#x2612;</span><span data-bare data-if="cdd_reason != 5">&#x2610;</span></span>عندما يتعلق الأمر بنشاطات أو أشغال ذات مدة محدودة.</li></ul>
  </div>

  <div class="article">
    <h3>المادة الثالثة:</h3>
    <p class="indent">يخضع العامل (ة) لفترة تجريبية قدرها <span data-bare data-field="essai"></span>، من خلالها يمكن للطرفين فسخ العقد دون إشعار مسبق ولا تعويض، ولا تدخل في حساب المدة كل العطل المرضية مهما كانت طبيعتها.</p>
  </div>
  <div class="article">
    <h3>المادة الرابعة:</h3>
    <p class="indent">يؤدي العامل (ة) عمله حسب التوقيت المعتمد في الورشة (التي ينتمي إليها) والمتمثل في أربعة أسابيع عمل فعلي في مقابل ثلاثة أسابيع عطلة تعويضية وأسبوع عطلة سنوية.</p>
  </div>
  <div class="article">
    <h3>المادة الخامسة:</h3>
    <p class="indent">ينتهي العقد خلال الفترة المتفق عليها ويمكن تجديده بطلب من المستخدِم (L'employeur).</p>
  </div>
  <div class="article">
    <h3>المادة السادسة:</h3>
    <p class="indent">إنّ مدّة الإخطار المسبق يجب أن لا تقل عن <span data-bare data-field="preavis"></span> وفي حالة التّخلي عن المنصب دون ذلك من غير القوة القاهرة (أسباب قوية ومقنعة) يتحمل العامل (ة) كل الخسائر المترتبة وإن لزم يتابع قضائيا.</p>
  </div>
  <div class="article">
    <h3>المادة السابعة:</h3>
    <p class="indent">يستفيد العامل (ة) مقابل عمله أجرا قدره <strong><span data-bare data-ltr-numbers data-field="net"></span> دج</strong> (<span data-bare data-field="net_words"></span>) دينار جزائري الأجر الصافي (Net à Payer) عن كل شهر عمل فعلي.</p>
  </div>
  <div class="article">
    <h3>المادة الثامنة:</h3>
    <p class="indent">يستفيد العامل خلال العطلة التعويضية متوسط <strong><span data-bare data-ltr-numbers data-field="recup"></span> دج</strong> (<span data-bare data-field="recup_words"></span>) دينار جزائري تحسب على أساس عدد أيام عطلته كالتالي: <span data-bare data-ltr-numbers data-field="recup"></span> دج تُقسّم على عدد أيام الشهر وتُضرب في عدد أيام العطلة.</p>
  </div>
  <div class="article">
    <h3>المادة التاسعة:</h3>
    <p class="indent">يخضع العامل (ة) لاقتطاع قدره <strong><span data-bare data-ltr-numbers data-field="retenue"></span> دج</strong> (<span data-bare data-field="retenue_words"></span>) دينار جزائري عن كل يوم غياب غير مبرر، وفي حال وجود تبرير يسلم إلى الإدارة في غضون 24 ساعة الموالية للغياب، وإن كان طبيا يصادق عليه من قبل صندوق الضمان الاجتماعي.</p>
  </div>
  <div class="article">
    <h3>المادة العاشرة:</h3>
    <p class="indent">يخضع العامل (ة) لأحكام هذا العقد ولقوانين النظام الداخلي للمؤسسة المؤرخ في 2010/05/03 والمصادق عليه من طرف السلطات المعنية والممثلة في محكمة المقر ومفتشية العمل لدائرة حاسي مسعود.</p>
  </div>
  <div class="article">
    <h3>المادة الحادية عشر:</h3>
    <p class="indent">يعد النظام الداخلي للمؤسسة المصدر الأساسي لهذا العقد وفي حال وجود أي إشكال أو تصادم في هذا الأخير فلا بد من الرجوع والعودة إلى النظام الداخلي للمؤسسة.</p>
  </div>

  <div class="article"><h3>ملاحظة:</h3><p class="indent">إن النظام الداخلي متوفر ومنشور على مستوى حرم المؤسسة &quot;قاعدة الحياة&quot; وجميع الورشات وتسلَّم نسخة من هذا الأخير لكل عامل من عمال المؤسسة.</p></div>

  <p class="closing">إطلع المعني على مواد العقد ووافق عليه.</p>
  <div class="signatures"><div>توقيع المعني وبصمته</div><div>توقيع الهيئة المستخدمة</div></div>
  <div class="copies"><div>يوقع العقد في ثلاث نسخ أصلية:</div><div><div>- نسخة للعامل.</div><div>- نسختين لإدارة المؤسسة.</div></div></div>
</body>
</html>$contrat_cdd$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'contrat_cdd' and status = 'approved');

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'contrat_cdi', 1, 'approved', $contrat_cdi$<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>عقد عمل غير محدد المدة <span data-bare data-field="numero"></span> - <span data-bare data-field="nom"></span></title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap">
  <style>
    @page {
      size: A4 portrait;
      margin: 16mm 17mm 18mm 17mm;
      @bottom-center { content: counter(page) "/" counter(pages); font: 12px "Times New Roman", serif; }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    body {
      direction: rtl;
      font-family: Amiri, "Traditional Arabic", "Sakkal Majalla", "Times New Roman", serif;
      font-size: 16px;
      line-height: 1.85;
    }
    h1 {
      text-align: center;
      font-size: 30px;
      margin: 0 0 2mm;
      line-height: 1.4;
    }
    h1 span { border-bottom: 2px solid #111; padding: 0 4mm 1mm; }
    .numero { text-align: center; font-size: 19px; margin: 0 0 3mm; }
    p { margin: 0 0 1.5mm; text-align: justify; }
    .party { font-weight: 700; font-size: 18px; margin: 2mm 0 1mm; }
    .party span { border-bottom: 1.5px solid #111; padding-bottom: 0.5mm; }
    .indent { text-indent: 8mm; }
    .row { display: grid; grid-template-columns: 1fr 1fr; column-gap: 8mm; }
    .line { margin: 0 0 0.8mm; }
    .center { text-align: center; }
    h3 { font-size: 17px; margin: 2.5mm 0 1mm; font-weight: 700; break-after: avoid; }
    .article p, ul.reasons li { break-inside: avoid; orphans: 2; widows: 2; }
    ul.reasons { list-style: none; margin: 1mm 0 0; padding: 0 12mm 0 0; }
    ul.reasons li { margin: 0 0 0.6mm; }
    ul.reasons .num { display: inline-block; min-width: 6mm; }
    ul.reasons .box { font-size: 18px; margin-left: 1.5mm; font-family: "Segoe UI Symbol", "DejaVu Sans", sans-serif; }
    .blank { display: inline-block; min-width: 35mm; border-bottom: 1px dotted #555; }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      margin-top: 8mm;
      min-height: 42mm;
      break-inside: avoid;
      font-weight: 700;
      font-size: 17px;
    }
    .signatures div:last-child { text-align: left; }
    .copies { display: grid; grid-template-columns: auto 1fr; column-gap: 10mm; margin-top: 4mm; break-inside: avoid; }
    .closing { text-align: center; margin: 5mm 0 0; }
  </style>
</head>
<body>
  <h1><span>عقد عمل غير محدد المدة</span></h1>
  <div class="numero">رقم: <strong data-if="numero" data-field="numero"></strong><span class="blank" data-if="!numero"></span></div>
  <p>تطبيقًا للإجراءات المنصوص عليها في القانون رقم : 11/90 المؤرخ في 21 أفريل 1990 المتعلق بعلاقات العمل.</p>
  <p>يبرم هذا العقد غير المحدد المدة بين:</p>

  <div class="party"><span>مـن جـهـة:</span></div>
  <p class="indent">السيّد : <strong><span data-bare data-field="company.manager_name_ar"></span></strong> مسير <span data-bare data-field="company.name_ar"></span> الكائن مقرها بـ: <span data-bare data-field="company.address_ar"></span>، وهذا بموجب تعديل القانون الأساسي المؤرخ في 2019/11/28 تحت رقم الفهرس 2019/951: بمكتب الأستاذ معماش النجاعي موثق بحي زادي مسعود عمارة س رقم 105 الطابق الأول بسطيف.</p>

  <div class="party"><span>ومـن جهـة أخـرى:</span></div>
  <div class="line">السيّد (ة): <strong data-if="nom" data-field="nom"></strong><span class="blank" data-if="!nom"></span></div>
  <div class="line">الرقم التسلسلي: <strong data-if="matricule" data-field="matricule"></strong><span class="blank" data-if="!matricule"></span></div>
  <div class="row line"><div>المولود(ة) بتاريخ: <strong data-if="birth_date" data-field="birth_date"></strong><span class="blank" data-if="!birth_date"></span></div><div>بـ: <strong data-if="birth_place" data-field="birth_place"></strong><span class="blank" data-if="!birth_place"></span></div></div>
  <div class="row line"><div>إبن (ة): <strong data-if="father" data-field="father"></strong><span class="blank" data-if="!father"></span></div><div>و: <strong data-if="mother" data-field="mother"></strong><span class="blank" data-if="!mother"></span></div></div>
  <div class="line">الحالة العائلية: <strong data-if="marital" data-field="marital"></strong><span class="blank" data-if="!marital"></span></div>
  <div class="line">الحامل (ة) لـ: <span data-bare data-field="id_piece"></span> رقم: <strong data-if="id_number" data-field="id_number"></strong><span class="blank" data-if="!id_number"></span> الصادر(ة) في: <strong data-if="id_issued_on" data-field="id_issued_on"></strong><span class="blank" data-if="!id_issued_on"></span> عن سلطة الاصدار:</div>
  <div class="line"><strong data-if="id_issued_by" data-field="id_issued_by"></strong><span class="blank" data-if="!id_issued_by"></span></div>
  <div class="line">الساكن (ة) بـ: <strong data-if="address" data-field="address"></strong><span class="blank" data-if="!address"></span></div>

  <div class="article">
    <h3>المادة الأولى:</h3>
    <div class="line center">يَشْغَل السيد(ة) المتعاقد معه منصب: <strong data-if="poste" data-field="poste"></strong><span class="blank" data-if="!poste"></span></div>
    <div class="row line"><div>ابتداء من تاريخ: <strong data-if="start_date" data-field="start_date"></strong><span class="blank" data-if="!start_date"></span></div><div></div></div>
  </div>

  

  <div class="article">
    <h3>المادة الثانية:</h3>
    <p class="indent">يخضع العامل (ة) لفترة تجريبية قدرها <span data-bare data-field="essai"></span>، من خلالها يمكن للطرفين فسخ العقد دون إشعار مسبق ولا تعويض، ولا تدخل في حساب المدة كل العطل المرضية مهما كانت طبيعتها.</p>
  </div>
  <div class="article">
    <h3>المادة الثالثة:</h3>
    <p class="indent">يؤدي العامل (ة) عمله حسب التوقيت المعتمد في الورشة (التي ينتمي إليها) والمتمثل في أربعة أسابيع عمل فعلي في مقابل ثلاثة أسابيع عطلة تعويضية وأسبوع عطلة سنوية.</p>
  </div>
  <div class="article">
    <h3>المادة الرابعة:</h3>
    <p class="indent">إنّ مدّة الإخطار المسبق يجب أن لا تقل عن <span data-bare data-field="preavis"></span> وفي حالة التّخلي عن المنصب دون ذلك من غير القوة القاهرة (أسباب قوية ومقنعة) يتحمل العامل (ة) كل الخسائر المترتبة وإن لزم يتابع قضائيا.</p>
  </div>
  <div class="article">
    <h3>المادة الخامسة:</h3>
    <p class="indent">يستفيد العامل (ة) مقابل عمله أجرا قدره <strong><span data-bare data-ltr-numbers data-field="net"></span> دج</strong> (<span data-bare data-field="net_words"></span>) دينار جزائري الأجر الصافي (Net à Payer) عن كل شهر عمل فعلي.</p>
  </div>
  <div class="article">
    <h3>المادة السادسة:</h3>
    <p class="indent">يستفيد العامل خلال العطلة التعويضية متوسط <strong><span data-bare data-ltr-numbers data-field="recup"></span> دج</strong> (<span data-bare data-field="recup_words"></span>) دينار جزائري تحسب على أساس عدد أيام عطلته كالتالي: <span data-bare data-ltr-numbers data-field="recup"></span> دج تُقسّم على عدد أيام الشهر وتُضرب في عدد أيام العطلة.</p>
  </div>
  <div class="article">
    <h3>المادة السابعة:</h3>
    <p class="indent">يخضع العامل (ة) لاقتطاع قدره <strong><span data-bare data-ltr-numbers data-field="retenue"></span> دج</strong> (<span data-bare data-field="retenue_words"></span>) دينار جزائري عن كل يوم غياب غير مبرر، وفي حال وجود تبرير يسلم إلى الإدارة في غضون 24 ساعة الموالية للغياب، وإن كان طبيا يصادق عليه من قبل صندوق الضمان الاجتماعي.</p>
  </div>
  <div class="article">
    <h3>المادة الثامنة:</h3>
    <p class="indent">يخضع العامل (ة) لأحكام هذا العقد ولقوانين النظام الداخلي للمؤسسة المؤرخ في 2010/05/03 والمصادق عليه من طرف السلطات المعنية والممثلة في محكمة المقر ومفتشية العمل لدائرة حاسي مسعود.</p>
  </div>
  <div class="article">
    <h3>المادة التاسعة:</h3>
    <p class="indent">يعد النظام الداخلي للمؤسسة المصدر الأساسي لهذا العقد وفي حال وجود أي إشكال أو تصادم في هذا الأخير فلا بد من الرجوع والعودة إلى النظام الداخلي للمؤسسة.</p>
  </div>

  <div class="article"><h3>ملاحظة:</h3><p class="indent">إن النظام الداخلي متوفر ومنشور على مستوى حرم المؤسسة &quot;قاعدة الحياة&quot; وجميع الورشات وتسلَّم نسخة من هذا الأخير لكل عامل من عمال المؤسسة.</p></div>

  <p class="closing">إطلع المعني على مواد العقد ووافق عليه.</p>
  <div class="signatures"><div>توقيع المعني وبصمته</div><div>توقيع الهيئة المستخدمة</div></div>
  <div class="copies"><div>يوقع العقد في ثلاث نسخ أصلية:</div><div><div>- نسخة للعامل.</div><div>- نسختين لإدارة المؤسسة.</div></div></div>
</body>
</html>$contrat_cdi$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (select 1 from public.doc_templates where doc_type = 'contrat_cdi' and status = 'approved');

-- The contract wording now lives in the contrat_cdd / contrat_cdi templates; the old block template was never filled.
do $$
begin
  if to_regclass('public.hr_contract_print_template') is not null
     and not exists (select 1 from public.hr_contract_print_template) then
    drop table public.hr_contract_print_template;
  end if;
end;
$$;

commit;
