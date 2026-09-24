-- =============================================================================
-- GRH hub — catalogs UI-driven, employee satellites, documents, attendance, payroll
-- No legal rates or attendance codes are hardcoded in application logic.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Screens
-- ---------------------------------------------------------------------------
insert into public.sys_screens (code, module, label_fr, path, sort_order)
values
  ('hr_hub',            'hr', 'Espace RH',                 '/rh',                 115),
  ('hr_documents',      'hr', 'Documents RH',              '/rh/documents',       132),
  ('hr_attendance',     'hr', 'Présence',                  '/rh/presence',        134),
  ('hr_payroll',        'hr', 'Paie',                      '/rh/paie',            136),
  ('hr_payroll_slips',  'hr', 'Bulletins',                 '/rh/paie/bulletins',  137),
  ('hr_payroll_social', 'hr', 'Déclarations sociales',     '/rh/paie/social',     138),
  ('hr_payroll_tax',    'hr', 'Retenue IRG',               '/rh/paie/fiscal',     139),
  ('hr_settings',       'hr', 'Paramètres RH',              '/rh/parametres',      140)
on conflict (code) do update set
  module = excluded.module,
  label_fr = excluded.label_fr,
  path = excluded.path,
  sort_order = excluded.sort_order;

insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select r.id, s.id,
  case when r.code in ('SUPER_ADMIN','ADMIN_RH','GERANT') then true else false end,
  true,
  case when r.code in ('SUPER_ADMIN','ADMIN_RH','GERANT') then true
       when r.code = 'CHEF_CHANTIER' and s.code in ('hr_attendance','employees') then true
       else false end,
  case when r.code in ('SUPER_ADMIN','ADMIN_RH') then true else false end,
  true,
  true
from public.sys_roles r
cross join public.sys_screens s
where r.code in ('SUPER_ADMIN','ADMIN_RH','GERANT','ADMIN_FINANCE','CHEF_CHANTIER','READ_ONLY')
  and s.code in (
    'hr_hub','employees','contracts','hr_documents','hr_attendance',
    'hr_payroll','hr_payroll_slips','hr_payroll_social','hr_payroll_tax','hr_settings','legendes'
  )
on conflict (role_id, screen_id) do update set
  can_create = excluded.can_create,
  can_read = excluded.can_read,
  can_update = excluded.can_update,
  can_delete = excluded.can_delete,
  can_print = excluded.can_print,
  can_export = excluded.can_export;

-- ---------------------------------------------------------------------------
-- Catalogs (all dropdowns live here)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_catalog_kinds (
  code text primary key,
  label_ar text not null,
  label_fr text not null,
  extra_hint text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_catalogs (
  id uuid primary key default gen_random_uuid(),
  kind text not null references public.hr_catalog_kinds(code) on delete cascade,
  code text not null,
  label_ar text not null,
  label_fr text not null,
  extra jsonb not null default '{}'::jsonb,
  color_bg text,
  color_fg text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, code)
);

create index if not exists hr_catalogs_kind_idx on public.hr_catalogs (kind, sort_order);

-- ---------------------------------------------------------------------------
-- Employee satellites (identity hub remains hr_employees)
-- ---------------------------------------------------------------------------
alter table public.hr_employees
  add column if not exists last_name_ar text,
  add column if not exists first_name_ar text,
  add column if not exists photo_url text;

create table if not exists public.hr_employee_civil (
  employee_id uuid primary key references public.hr_employees(id) on delete cascade,
  sex_code text,
  marital_code text,
  blood_code text,
  birth_place_ar text,
  birth_place_fr text,
  birth_act_no text,
  father_name text,
  mother_name text,
  nationality text,
  commune_birth text,
  wilaya_birth text,
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_employee_contacts (
  employee_id uuid primary key references public.hr_employees(id) on delete cascade,
  address_ar text,
  address_fr text,
  wilaya_code text,
  commune text,
  postal_code text,
  phone text,
  whatsapp text,
  email text,
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_employee_bank (
  employee_id uuid primary key references public.hr_employees(id) on delete cascade,
  payment_mode_code text,
  account_no text,
  account_key text,
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_employee_social (
  employee_id uuid primary key references public.hr_employees(id) on delete cascade,
  declaration_date date,
  social_profile_code text,
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_employee_qualifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  level_code text,
  diploma_ar text,
  diploma_fr text,
  experience_years numeric(5,1),
  languages text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists hr_employee_qualifications_one_idx
  on public.hr_employee_qualifications (employee_id);

alter table public.hr_contracts
  add column if not exists contract_type_code text,
  add column if not exists work_regime_code text,
  add column if not exists poste_ar text,
  add column if not exists poste_fr text,
  add column if not exists salaire_net_recup_monthly numeric(14,2);

-- ---------------------------------------------------------------------------
-- Official files + correspondence
-- ---------------------------------------------------------------------------
create table if not exists public.hr_employee_files (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  doc_type_code text not null,
  file_url text,
  issued_on date,
  expires_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hr_employee_files_emp_idx on public.hr_employee_files (employee_id);

create table if not exists public.hr_correspondences (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete restrict,
  site_id uuid references public.ref_sites(id),
  type_code text not null,
  number text not null unique,
  status_code text not null default 'DRAFT',
  start_date date,
  end_date date,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hr_correspondences_emp_idx on public.hr_correspondences (employee_id, start_date);

-- ---------------------------------------------------------------------------
-- Attendance + payroll
-- ---------------------------------------------------------------------------
alter table public.ref_legendes
  add column if not exists color_bg text,
  add column if not exists color_fg text,
  add column if not exists source_mode text not null default 'BOTH';

create table if not exists public.hr_attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  site_id uuid not null references public.ref_sites(id),
  work_date date not null,
  legend_code text not null references public.ref_legendes(code),
  source_code text not null default 'MANUAL',
  correspondence_id uuid references public.hr_correspondences(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, site_id, work_date)
);

create index if not exists hr_attendance_month_idx
  on public.hr_attendance (site_id, work_date);

create table if not exists public.hr_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_year integer not null,
  period_month integer not null check (period_month between 1 and 12),
  site_id uuid references public.ref_sites(id),
  status_code text not null default 'DRAFT',
  notes text,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_year, period_month, site_id)
);

create table if not exists public.hr_payroll_slips (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.hr_payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete restrict,
  hr_contract_id uuid references public.hr_contracts(id),
  days_worked numeric(8,3) not null default 0,
  days_paid numeric(8,3) not null default 0,
  net_target numeric(14,2) not null default 0,
  gross_amount numeric(14,2) not null default 0,
  employee_ss numeric(14,2) not null default 0,
  employer_ss numeric(14,2) not null default 0,
  cacobatph numeric(14,2) not null default 0,
  irg_amount numeric(14,2) not null default 0,
  net_payable numeric(14,2) not null default 0,
  status_code text not null default 'DRAFT',
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, employee_id)
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_hr_catalog_kinds_u on public.hr_catalog_kinds;
create trigger trg_hr_catalog_kinds_u before update on public.hr_catalog_kinds
  for each row execute function public.erp_set_updated_at();
drop trigger if exists trg_hr_catalogs_u on public.hr_catalogs;
create trigger trg_hr_catalogs_u before update on public.hr_catalogs
  for each row execute function public.erp_set_updated_at();
drop trigger if exists trg_hr_civil_u on public.hr_employee_civil;
create trigger trg_hr_civil_u before update on public.hr_employee_civil
  for each row execute function public.erp_set_updated_at();
drop trigger if exists trg_hr_contacts_u on public.hr_employee_contacts;
create trigger trg_hr_contacts_u before update on public.hr_employee_contacts
  for each row execute function public.erp_set_updated_at();
drop trigger if exists trg_hr_bank_u on public.hr_employee_bank;
create trigger trg_hr_bank_u before update on public.hr_employee_bank
  for each row execute function public.erp_set_updated_at();
drop trigger if exists trg_hr_social_u on public.hr_employee_social;
create trigger trg_hr_social_u before update on public.hr_employee_social
  for each row execute function public.erp_set_updated_at();
drop trigger if exists trg_hr_qual_u on public.hr_employee_qualifications;
create trigger trg_hr_qual_u before update on public.hr_employee_qualifications
  for each row execute function public.erp_set_updated_at();
drop trigger if exists trg_hr_files_u on public.hr_employee_files;
create trigger trg_hr_files_u before update on public.hr_employee_files
  for each row execute function public.erp_set_updated_at();
drop trigger if exists trg_hr_corr_u on public.hr_correspondences;
create trigger trg_hr_corr_u before update on public.hr_correspondences
  for each row execute function public.erp_set_updated_at();
drop trigger if exists trg_hr_att_u on public.hr_attendance;
create trigger trg_hr_att_u before update on public.hr_attendance
  for each row execute function public.erp_set_updated_at();
drop trigger if exists trg_hr_run_u on public.hr_payroll_runs;
create trigger trg_hr_run_u before update on public.hr_payroll_runs
  for each row execute function public.erp_set_updated_at();
drop trigger if exists trg_hr_slip_u on public.hr_payroll_slips;
create trigger trg_hr_slip_u before update on public.hr_payroll_slips
  for each row execute function public.erp_set_updated_at();

create or replace function public.hr_next_matricule()
returns text
language plpgsql
stable
as $$
declare
  yy text := to_char((now() at time zone 'Africa/Algiers'), 'YY');
  max_n integer := 0;
  m text;
begin
  for m in select matricule from public.hr_employees where matricule ~ ('^[0-9]+/' || yy || '$')
  loop
    max_n := greatest(max_n, split_part(m, '/', 1)::integer);
  end loop;
  return lpad((max_n + 1)::text, 2, '0') || '/' || yy;
end;
$$;

create or replace function public.hr_next_doc_number(p_prefix text)
returns text
language plpgsql
as $$
declare
  yy text := to_char((now() at time zone 'Africa/Algiers'), 'YY');
  max_n integer := 0;
  m text;
begin
  for m in
    select number from public.hr_correspondences
    where number ~ ('^[0-9]+/' || yy || '$')
  loop
    max_n := greatest(max_n, split_part(m, '/', 1)::integer);
  end loop;
  return lpad((max_n + 1)::text, 6, '0') || '/' || yy;
end;
$$;

create or replace function public.hr_apply_correspondence_attendance()
returns trigger
language plpgsql
as $$
declare
  legend text;
  d date;
  site uuid;
begin
  select nullif(extra->>'generates_legend', '') into legend
  from public.hr_catalogs
  where kind = 'correspondence_type' and code = new.type_code and is_active
  limit 1;

  if legend is null or new.start_date is null or new.end_date is null then
    return new;
  end if;
  if not exists (select 1 from public.ref_legendes l where l.code = legend and l.is_active) then
    return new;
  end if;

  site := new.site_id;
  if site is null then
    select c.site_id into site
    from public.hr_contracts c
    where c.employee_id = new.employee_id
      and c.affectation_principale
      and c.status = 'ACTIVE'
    order by c.start_date desc
    limit 1;
  end if;
  if site is null then
    return new;
  end if;

  d := new.start_date;
  while d <= new.end_date loop
    insert into public.hr_attendance (
      employee_id, site_id, work_date, legend_code, source_code, correspondence_id
    ) values (new.employee_id, site, d, legend, 'AUTO', new.id)
    on conflict (employee_id, site_id, work_date) do update set
      legend_code = excluded.legend_code,
      source_code = 'AUTO',
      correspondence_id = excluded.correspondence_id,
      updated_at = now();
    d := d + 1;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_hr_corr_attendance on public.hr_correspondences;
create trigger trg_hr_corr_attendance
  after insert or update of type_code, start_date, end_date, site_id, employee_id
  on public.hr_correspondences
  for each row execute function public.hr_apply_correspondence_attendance();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.hr_catalog_kinds enable row level security;
alter table public.hr_catalogs enable row level security;
alter table public.hr_employee_civil enable row level security;
alter table public.hr_employee_contacts enable row level security;
alter table public.hr_employee_bank enable row level security;
alter table public.hr_employee_social enable row level security;
alter table public.hr_employee_qualifications enable row level security;
alter table public.hr_employee_files enable row level security;
alter table public.hr_correspondences enable row level security;
alter table public.hr_attendance enable row level security;
alter table public.hr_payroll_runs enable row level security;
alter table public.hr_payroll_slips enable row level security;

drop policy if exists hr_kind_read on public.hr_catalog_kinds;
create policy hr_kind_read on public.hr_catalog_kinds for select to authenticated using (true);
drop policy if exists hr_kind_write on public.hr_catalog_kinds;
create policy hr_kind_write on public.hr_catalog_kinds for all to authenticated
  using (public.erp_has_perm('hr_settings','update', null))
  with check (public.erp_has_perm('hr_settings','update', null));

drop policy if exists hr_cat_read on public.hr_catalogs;
create policy hr_cat_read on public.hr_catalogs for select to authenticated using (true);
drop policy if exists hr_cat_write on public.hr_catalogs;
create policy hr_cat_write on public.hr_catalogs for all to authenticated
  using (public.erp_has_perm('hr_settings','update', null))
  with check (public.erp_has_perm('hr_settings','update', null));

drop policy if exists hr_civil_read on public.hr_employee_civil;
create policy hr_civil_read on public.hr_employee_civil for select to authenticated
  using (public.erp_has_perm('employees','read', null));
drop policy if exists hr_civil_write on public.hr_employee_civil;
create policy hr_civil_write on public.hr_employee_civil for all to authenticated
  using (public.erp_has_perm('employees','update', null))
  with check (public.erp_has_perm('employees','update', null));

drop policy if exists hr_contacts_read on public.hr_employee_contacts;
create policy hr_contacts_read on public.hr_employee_contacts for select to authenticated
  using (public.erp_has_perm('employees','read', null));
drop policy if exists hr_contacts_write on public.hr_employee_contacts;
create policy hr_contacts_write on public.hr_employee_contacts for all to authenticated
  using (public.erp_has_perm('employees','update', null))
  with check (public.erp_has_perm('employees','update', null));

drop policy if exists hr_bank_read on public.hr_employee_bank;
create policy hr_bank_read on public.hr_employee_bank for select to authenticated
  using (public.erp_has_perm('employees','read', null));
drop policy if exists hr_bank_write on public.hr_employee_bank;
create policy hr_bank_write on public.hr_employee_bank for all to authenticated
  using (public.erp_has_perm('employees','update', null))
  with check (public.erp_has_perm('employees','update', null));

drop policy if exists hr_social_read on public.hr_employee_social;
create policy hr_social_read on public.hr_employee_social for select to authenticated
  using (public.erp_has_perm('employees','read', null));
drop policy if exists hr_social_write on public.hr_employee_social;
create policy hr_social_write on public.hr_employee_social for all to authenticated
  using (public.erp_has_perm('employees','update', null))
  with check (public.erp_has_perm('employees','update', null));

drop policy if exists hr_qual_read on public.hr_employee_qualifications;
create policy hr_qual_read on public.hr_employee_qualifications for select to authenticated
  using (public.erp_has_perm('employees','read', null));
drop policy if exists hr_qual_write on public.hr_employee_qualifications;
create policy hr_qual_write on public.hr_employee_qualifications for all to authenticated
  using (public.erp_has_perm('employees','update', null))
  with check (public.erp_has_perm('employees','update', null));

drop policy if exists hr_files_read on public.hr_employee_files;
create policy hr_files_read on public.hr_employee_files for select to authenticated
  using (public.erp_has_perm('hr_documents','read', null));
drop policy if exists hr_files_write on public.hr_employee_files;
create policy hr_files_write on public.hr_employee_files for all to authenticated
  using (public.erp_has_perm('hr_documents','update', null))
  with check (public.erp_has_perm('hr_documents','update', null));

drop policy if exists hr_corr_read on public.hr_correspondences;
create policy hr_corr_read on public.hr_correspondences for select to authenticated
  using (public.erp_has_perm('hr_documents','read', coalesce(site_id, null)));
drop policy if exists hr_corr_write on public.hr_correspondences;
create policy hr_corr_write on public.hr_correspondences for all to authenticated
  using (public.erp_has_perm('hr_documents','update', coalesce(site_id, null)))
  with check (public.erp_has_perm('hr_documents','update', coalesce(site_id, null)));

drop policy if exists hr_att_read on public.hr_attendance;
create policy hr_att_read on public.hr_attendance for select to authenticated
  using (public.erp_can_see_site(site_id) and public.erp_has_perm('hr_attendance','read', site_id));
drop policy if exists hr_att_write on public.hr_attendance;
create policy hr_att_write on public.hr_attendance for all to authenticated
  using (public.erp_has_perm('hr_attendance','update', site_id))
  with check (public.erp_has_perm('hr_attendance','update', site_id));

drop policy if exists hr_run_read on public.hr_payroll_runs;
create policy hr_run_read on public.hr_payroll_runs for select to authenticated
  using (public.erp_has_perm('hr_payroll','read', site_id));
drop policy if exists hr_run_write on public.hr_payroll_runs;
create policy hr_run_write on public.hr_payroll_runs for all to authenticated
  using (public.erp_has_perm('hr_payroll','update', site_id))
  with check (public.erp_has_perm('hr_payroll','update', site_id));

drop policy if exists hr_slip_read on public.hr_payroll_slips;
create policy hr_slip_read on public.hr_payroll_slips for select to authenticated
  using (public.erp_has_perm('hr_payroll_slips','read', null));
drop policy if exists hr_slip_write on public.hr_payroll_slips;
create policy hr_slip_write on public.hr_payroll_slips for all to authenticated
  using (public.erp_has_perm('hr_payroll_slips','update', null))
  with check (public.erp_has_perm('hr_payroll_slips','update', null));

grant select, insert, update, delete on
  public.hr_catalog_kinds, public.hr_catalogs,
  public.hr_employee_civil, public.hr_employee_contacts, public.hr_employee_bank,
  public.hr_employee_social, public.hr_employee_qualifications,
  public.hr_employee_files, public.hr_correspondences,
  public.hr_attendance, public.hr_payroll_runs, public.hr_payroll_slips
to authenticated;

grant execute on function public.hr_next_matricule() to authenticated;
grant execute on function public.hr_next_doc_number(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed catalogs + extra legends (data, not application constants)
-- ---------------------------------------------------------------------------
insert into public.hr_catalog_kinds (code, label_ar, label_fr, extra_hint, sort_order) values
  ('sex', 'الجنس', 'Sexe', null, 10),
  ('marital', 'الوضعية العائلية', 'Situation familiale', null, 20),
  ('blood', 'فصيلة الدم', 'Groupe sanguin', null, 30),
  ('id_type', 'نوع وثيقة الهوية', 'Type de pièce', null, 40),
  ('payment_mode', 'طريقة الدفع', 'Mode de paiement', null, 50),
  ('contract_type', 'نوع عقد العمل', 'Type de contrat', null, 60),
  ('work_regime', 'نظام العمل', 'Régime de travail', '{"work_days":"jours travail","rest_days":"jours repos"}', 70),
  ('job_title', 'المنصب', 'Poste', null, 80),
  ('study_level', 'المستوى الدراسي', 'Niveau d''études', null, 90),
  ('social_profile', 'ملف الاشتراك الاجتماعي', 'Profil social', null, 100),
  ('document_type', 'وثيقة رسمية', 'Document officiel', '{"block_level":"recruit|payroll|grace"}', 110),
  ('correspondence_type', 'مراسلة إدارية', 'Correspondance', '{"generates_legend":"code légende"}', 120),
  ('correspondence_status', 'حالة المراسلة', 'Statut correspondance', null, 130),
  ('transport_mode', 'وسيلة النقل', 'Moyen de transport', null, 140),
  ('attendance_source', 'مصدر الحضور', 'Source pointage', null, 150),
  ('payroll_status', 'حالة الكشف', 'Statut bulletin', null, 160),
  ('file_block', 'درجة الإلزام', 'Niveau de blocage', null, 170)
on conflict (code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  extra_hint = excluded.extra_hint,
  sort_order = excluded.sort_order;

insert into public.hr_catalogs (kind, code, label_ar, label_fr, extra, sort_order) values
  ('sex','M','ذكر','Masculin','{}',10),
  ('sex','F','أنثى','Féminin','{}',20),
  ('marital','C','أعزب','Célibataire','{}',10),
  ('marital','M','متزوج','Marié(e)','{}',20),
  ('marital','D','مطلق','Divorcé(e)','{}',30),
  ('marital','V','أرمل','Veuf(ve)','{}',40),
  ('blood','O+','O+','O+','{}',10),
  ('blood','O-','O-','O-','{}',20),
  ('blood','A+','A+','A+','{}',30),
  ('blood','A-','A-','A-','{}',40),
  ('blood','B+','B+','B+','{}',50),
  ('blood','B-','B-','B-','{}',60),
  ('blood','AB+','AB+','AB+','{}',70),
  ('blood','AB-','AB-','AB-','{}',80),
  ('id_type','CNI','بطاقة التعريف','Carte nationale','{}',10),
  ('id_type','PASSPORT','جواز سفر','Passeport','{}',20),
  ('payment_mode','CCP','حساب بريدي','CCP','{}',10),
  ('payment_mode','BANK','حساب بنكي','Banque','{}',20),
  ('payment_mode','CASH','نقدا','Caisse','{}',30),
  ('contract_type','CDI','عقد غير محدد المدة','CDI','{}',10),
  ('contract_type','CDD','عقد محدد المدة','CDD','{}',20),
  ('contract_type','CDD_CHANTIER','عقد ورشة','CDD Chantier','{}',30),
  ('work_regime','ADMIN','إداري','Administration','{"work_days":26,"rest_days":0}',10),
  ('work_regime','4X4','تناوب أربعة وأربعة','4x4','{"work_days":28,"rest_days":28}',20),
  ('work_regime','FAMILIAL','عائلي','Familial','{"work_days":26,"rest_days":0}',30),
  ('job_title','GERANT','مسير','Gérant','{}',10),
  ('job_title','TS_FROID','تقني سامي في التبريد','TS en froid','{}',20),
  ('job_title','FRIGORISTE','تقني تبريد','Frigoriste','{}',30),
  ('job_title','CHAUFFEUR','سائق','Chauffeur','{}',40),
  ('job_title','COMPTABLE','محاسب','Comptable','{}',50),
  ('study_level','BAC','بكالوريا','Bac','{}',10),
  ('study_level','TS','تقني سامي','Technicien supérieur','{}',20),
  ('study_level','ING','مهندس','Ingénieur','{}',30),
  ('social_profile','STANDARD','عادي','Standard','{}',10),
  ('social_profile','ABATTEMENT','تخفيض','Abattement','{}',20),
  ('document_type','CNI','بطاقة الهوية','Pièce d''identité','{"block_level":"recruit"}',10),
  ('document_type','BIRTH','شهادة الميلاد','Acte de naissance','{"block_level":"recruit"}',20),
  ('document_type','CONTRACT_SCAN','عقد موقع','Contrat signé','{"block_level":"payroll"}',30),
  ('document_type','MEDICAL','فحص طبي','Visite médicale','{"block_level":"grace"}',40),
  ('document_type','RIB','صك مشطوب','RIB / CCP','{"block_level":"grace"}',50),
  ('correspondence_type','OM','أمر بمهمة','Ordre de mission','{"generates_legend":"MS"}',10),
  ('correspondence_type','LEAVE','مقرر عطلة','Titre de congé','{"generates_legend":"CA"}',20),
  ('correspondence_type','CRP','راحة تعويضية','Récupération','{"generates_legend":"CRP"}',30),
  ('correspondence_type','ATTEST','شهادة عمل','Attestation','{}',40),
  ('correspondence_type','CONTRACT','عقد عمل مطبوع','Contrat de travail','{}',50),
  ('correspondence_status','DRAFT','مسودة','Brouillon','{}',10),
  ('correspondence_status','ISSUED','صادر','Émis','{}',20),
  ('correspondence_status','CLOSED','مغلق','Clôturé','{}',30),
  ('transport_mode','COMPANY','مركبة الشركة','Véhicule entreprise','{}',10),
  ('transport_mode','TAXI','سيارة أجرة','Taxi','{}',20),
  ('transport_mode','PLANE','طائرة','Avion','{}',30),
  ('transport_mode','TRAIN','قطار','Train','{}',40),
  ('attendance_source','AUTO','آلي من وثيقة','Automatique','{}',10),
  ('attendance_source','MANUAL','استثناء يدوي','Manuel','{}',20),
  ('payroll_status','DRAFT','مسودة','Brouillon','{}',10),
  ('payroll_status','VALIDATED','معتمد','Validé','{}',20),
  ('payroll_status','LOCKED','مقفل','Clôturé','{}',30),
  ('file_block','recruit','يمنع التوظيف','Blocage recrutement','{}',10),
  ('file_block','payroll','يمنع الكشف','Blocage paie','{}',20),
  ('file_block','grace','مهلة','Délai de grâce','{}',30)
on conflict (kind, code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  extra = excluded.extra,
  sort_order = excluded.sort_order;

insert into public.ref_legendes (code, label_fr, label_ar, coefficient, counts_as_presence, triggers_an_passthrough, is_system, color_bg, color_fg, source_mode)
values
  ('P',   'Présent', 'حاضر', 1.000, true,  false, true, '#10b981', '#FFFFFF', 'BOTH'),
  ('P/2', 'Demi présent', 'نصف حاضر', 0.500, true, false, true, '#10b981', '#FFFFFF', 'MANUAL'),
  ('MS',  'Mission', 'مهمة', 1.000, true,  false, true, '#0ea5e9', '#FFFFFF', 'BOTH'),
  ('CRP', 'Récupération', 'راحة تعويضية', 1.000, true, false, true, '#8b5cf6', '#FFFFFF', 'BOTH'),
  ('CA',  'Congé annuel', 'عطلة سنوية', 1.000, false, false, true, '#cbd5e1', '#000000', 'BOTH'),
  ('CM',  'Congé maladie', 'عطلة مرضية', 0.000, false, false, true, '#cbd5e1', '#000000', 'MANUAL'),
  ('CSS', 'Congé sans solde', 'عطلة دون أجر', 0.000, false, false, true, '#cbd5e1', '#000000', 'MANUAL'),
  ('AN',  'Absence injustifiée', 'غياب غير مبرر', 0.000, false, true, true, '#ef4444', '#FFFFFF', 'MANUAL'),
  ('AJ',  'Absence justifiée', 'غياب مبرر', 0.000, false, false, true, '#cbd5e1', '#000000', 'MANUAL'),
  ('AOP', 'Absence autorisée payée', 'غياب مرخص مدفوع', 1.000, false, false, true, '#fcd34d', '#000000', 'MANUAL'),
  ('W',   'Week-end', 'نهاية أسبوع', 0.000, false, false, true, '#e2e8f0', '#000000', 'AUTO'),
  ('JF',  'Jour férié', 'عيد رسمي', 1.000, false, false, true, '#fcd34d', '#000000', 'BOTH'),
  ('AP',  'Abandon de poste', 'تخلي عن المنصب', 0.000, false, false, true, '#ef4444', '#FFFFFF', 'MANUAL')
on conflict (code) do update set
  label_fr = excluded.label_fr,
  label_ar = excluded.label_ar,
  coefficient = excluded.coefficient,
  counts_as_presence = excluded.counts_as_presence,
  triggers_an_passthrough = excluded.triggers_an_passthrough,
  color_bg = excluded.color_bg,
  color_fg = excluded.color_fg,
  source_mode = excluded.source_mode,
  is_active = true;

comment on table public.hr_catalogs is
  'Listes RH 100% UI. Aucun code métier ne doit être figé dans l''application.';

commit;
