-- Super admin controls: employee activity list, document codes, cash opening
-- date and amounts (or a person they delegate), and screens added from the UI.

begin;

-- ---------------------------------------------------------------------------
-- Employee activity: free codes, list owned by the super admin
-- ---------------------------------------------------------------------------
alter table public.hr_employees
  alter column status type text using status::text;
alter table public.hr_employees
  alter column status set default 'ACTIVE';
alter table public.hr_employees
  drop constraint if exists hr_employees_status_code;
alter table public.hr_employees
  add constraint hr_employees_status_code check (status ~ '^[A-Z][A-Z0-9_]{0,39}$');

insert into public.hr_catalog_kinds (code, label_ar, label_fr, extra_hint, sort_order) values
  ('employee_status', 'حالة نشاط العامل', 'Statut d''activité',
   '{"working":"true = compte comme actif (filtre et paie)","default":"true = proposé quand la cellule Excel est vide"}', 40)
on conflict (code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  extra_hint = excluded.extra_hint;

insert into public.hr_catalogs (kind, code, label_ar, label_fr, extra, sort_order) values
  ('employee_status', 'ACTIVE', 'نشط', 'Actif', '{"working":true,"default":true}', 10),
  ('employee_status', 'INACTIVE', 'غير نشط', 'Inactif', '{"working":false}', 20),
  ('employee_status', 'SUSPENDED', 'موقوف', 'Suspendu', '{"working":false}', 30),
  ('employee_status', 'DISABLED', 'معطّل', 'Désactivé', '{"working":false}', 40),
  ('employee_status', 'INVITED', 'مدعو', 'Invité', '{"working":false}', 50)
on conflict (kind, code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  extra = excluded.extra,
  sort_order = excluded.sort_order;

create or replace function public.hr_catalog_employee_status_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.kind = 'employee_status' and not public.erp_is_super_admin(auth.uid()) then
      raise exception 'Réservé au super administrateur.' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.kind = 'employee_status' and not public.erp_is_super_admin(auth.uid()) then
    raise exception 'Réservé au super administrateur.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists hr_catalog_employee_status_guard on public.hr_catalogs;
create trigger hr_catalog_employee_status_guard
  before insert or update or delete on public.hr_catalogs
  for each row execute function public.hr_catalog_employee_status_guard();

-- ---------------------------------------------------------------------------
-- Document codes: automatic OM / CNG, or codes chosen by the super admin
-- ---------------------------------------------------------------------------
alter table public.hr_company_profile
  add column if not exists doc_code_mode text not null default 'auto',
  add column if not exists doc_code_om text not null default 'OM',
  add column if not exists doc_code_cng text not null default 'CNG';

alter table public.hr_company_profile drop constraint if exists hr_company_profile_doc_code_mode;
alter table public.hr_company_profile
  add constraint hr_company_profile_doc_code_mode check (doc_code_mode in ('auto', 'manual'));
alter table public.hr_company_profile drop constraint if exists hr_company_profile_doc_code_om;
alter table public.hr_company_profile
  add constraint hr_company_profile_doc_code_om check (doc_code_om ~ '^[A-Z0-9]{1,8}$');
alter table public.hr_company_profile drop constraint if exists hr_company_profile_doc_code_cng;
alter table public.hr_company_profile
  add constraint hr_company_profile_doc_code_cng check (doc_code_cng ~ '^[A-Z0-9]{1,8}$');

create or replace function public.hr_company_doc_codes_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.doc_code_mode is distinct from old.doc_code_mode
     or new.doc_code_om is distinct from old.doc_code_om
     or new.doc_code_cng is distinct from old.doc_code_cng then
    if not public.erp_is_super_admin(auth.uid()) then
      raise exception 'Réservé au super administrateur.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists hr_company_doc_codes_guard on public.hr_company_profile;
create trigger hr_company_doc_codes_guard
  before update on public.hr_company_profile
  for each row execute function public.hr_company_doc_codes_guard();

-- ---------------------------------------------------------------------------
-- Cash opening date and who may edit the opening balances
-- ---------------------------------------------------------------------------
alter table public.caisse_rights
  add column if not exists manage_openings boolean not null default false;

create table if not exists public.caisse_settings (
  id integer primary key check (id = 1),
  opening_date date not null default date '2025-12-31'
);
insert into public.caisse_settings (id) values (1) on conflict (id) do nothing;

create or replace function public.caisse_can_manage_openings()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.erp_is_super_admin(auth.uid())
    or exists (
      select 1 from public.caisse_rights r
      where r.user_id = auth.uid() and r.manage_openings
    );
$$;

revoke all on function public.caisse_can_manage_openings() from public;
grant execute on function public.caisse_can_manage_openings() to authenticated;

drop policy if exists caisse_journal_openings_write on public.caisse_journal_openings;
create policy caisse_journal_openings_write on public.caisse_journal_openings
  for all to authenticated
  using (public.caisse_can_manage_openings())
  with check (public.caisse_can_manage_openings());

alter table public.caisse_settings enable row level security;
drop policy if exists caisse_settings_read on public.caisse_settings;
create policy caisse_settings_read on public.caisse_settings
  for select to authenticated using (true);
drop policy if exists caisse_settings_write on public.caisse_settings;
create policy caisse_settings_write on public.caisse_settings
  for update to authenticated
  using (public.caisse_can_manage_openings())
  with check (public.caisse_can_manage_openings());
grant select, update on public.caisse_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Screens added from the interface, by the super admin
-- ---------------------------------------------------------------------------
create table if not exists public.sys_ui_custom_screens (
  code text primary key,
  label_fr text not null,
  label_ar text not null default '',
  group_key text not null,
  icon text not null default 'docs',
  body text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint sys_ui_custom_screens_code check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  constraint sys_ui_custom_screens_label check (char_length(trim(label_fr)) between 1 and 80)
);

alter table public.sys_ui_custom_screens enable row level security;
drop policy if exists sys_ui_custom_screens_read on public.sys_ui_custom_screens;
create policy sys_ui_custom_screens_read on public.sys_ui_custom_screens
  for select to authenticated using (true);
drop policy if exists sys_ui_custom_screens_write on public.sys_ui_custom_screens;
create policy sys_ui_custom_screens_write on public.sys_ui_custom_screens
  for all to authenticated
  using (public.erp_is_super_admin(auth.uid()))
  with check (public.erp_is_super_admin(auth.uid()));
grant select, insert, update, delete on public.sys_ui_custom_screens to authenticated;

commit;
