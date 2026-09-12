-- NEDJM FROID ERP — Phase 1A Foundation
-- Project: ykjqtprxgvdgkwzqxjky (eu-west-3, Postgres 17)
-- Approved by user 2026-09-12 — APPLY WITH STRICT ACCOUNTABILITY

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.audit_action as enum
  ('CREATE','UPDATE','DELETE','LOGIN','PRINT','EXPORT','REVERSE');

create type public.rbac_action as enum
  ('create','read','update','delete','print','export');

create type public.var_value_type as enum
  ('numeric','text','boolean','json','enum');

create type public.njm_divisor_mode as enum ('FIXED','CALENDAR');

create type public.activity_regime as enum ('BTPH','MAINTENANCE');

create type public.leave_funding as enum ('CACOBATPH_FUNDED','COMPANY_ACCRUAL');

create type public.irg_taxpayer_category as enum ('STANDARD','DISABLED_OR_RETIREE');

create type public.irg_rule_kind as enum (
  'EXEMPTION_THRESHOLD',
  'ABATEMENT_ON_TAX',
  'LISSAGE',
  'BASE_PREPROCESS',
  'NON_MONTHLY_WITHHOLDING'
);

create type public.irg_applies_to as enum ('TAX','BASE','GROSS');

create type public.contract_status as enum ('DRAFT','ACTIVE','SUSPENDED','ENDED');

create type public.adjustment_status as enum ('DRAFT','LOCKED','REVERSED');

create type public.user_status as enum ('INVITED','ACTIVE','SUSPENDED','DISABLED');

create type public.formula_token_kind as enum ('INPUT','RESOLVED','LEGAL_VAR');

-- ---------------------------------------------------------------------------
-- Updated-at helper
-- ---------------------------------------------------------------------------
create or replace function public.erp_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Calendar days (never stored as a legal constant)
-- ---------------------------------------------------------------------------
create or replace function public.ref_njm_calendar(p_date date)
returns integer
language sql
immutable
as $$
  select extract(day from (date_trunc('month', p_date) + interval '1 month - 1 day'))::int;
$$;

-- ---------------------------------------------------------------------------
-- SYS: roles, screens, permissions, users, site grants
-- ---------------------------------------------------------------------------
create table public.sys_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label_fr text not null,
  label_ar text,
  hierarchy_level integer not null check (hierarchy_level between 0 and 100),
  is_system boolean not null default false,
  require_mfa boolean not null default false,
  site_scoped_allowed boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sys_screens (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  path text not null unique,
  module text not null,
  label_fr text not null,
  label_ar text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sys_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.sys_roles(id) on delete cascade,
  screen_id uuid not null references public.sys_screens(id) on delete cascade,
  can_create boolean not null default false,
  can_read boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  can_print boolean not null default false,
  can_export boolean not null default false,
  unique (role_id, screen_id)
);

create table public.sys_users (
  id uuid primary key references auth.users(id) on delete restrict,
  email extensions.citext not null unique,
  full_name text not null,
  phone text,
  status public.user_status not null default 'INVITED',
  locale text not null default 'fr',
  must_reset_password boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ref_activity_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label_fr text not null,
  label_ar text,
  regime public.activity_regime not null,
  official_code text,
  leave_funding public.leave_funding not null,
  leave_days_per_month numeric(6,3),
  applies_cacobatph boolean not null default false,
  applies_intemperies boolean not null default false,
  conge_jour_formula text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ref_sites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_fr text not null,
  name_ar text,
  activity_code_id uuid references public.ref_activity_codes(id),
  wilaya text,
  commune text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sys_user_site_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.sys_users(id) on delete cascade,
  role_id uuid not null references public.sys_roles(id) on delete restrict,
  site_id uuid references public.ref_sites(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.sys_users(id),
  unique (user_id, role_id, site_id)
);

create unique index sys_user_site_roles_global_uq
  on public.sys_user_site_roles (user_id, role_id)
  where site_id is null;

-- ---------------------------------------------------------------------------
-- Period lock (required for AN draft → locked)
-- ---------------------------------------------------------------------------
create table public.sys_period_locks (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  locked_at timestamptz not null default now(),
  locked_by uuid not null references public.sys_users(id),
  unlocked_at timestamptz,
  unlocked_by uuid references public.sys_users(id),
  unique (year, month)
);

-- ---------------------------------------------------------------------------
-- Audit (append-only, partitioned)
-- ---------------------------------------------------------------------------
create table public.sys_audit_logs (
  id uuid not null default gen_random_uuid(),
  user_id uuid references public.sys_users(id),
  action public.audit_action not null,
  table_name text not null,
  target_id text,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  request_id uuid,
  occurred_at timestamptz not null default now(),
  primary key (id, occurred_at)
) partition by range (occurred_at);

create table public.sys_audit_logs_2026_09 partition of public.sys_audit_logs
  for values from ('2026-09-01') to ('2026-10-01');
create table public.sys_audit_logs_2026_10 partition of public.sys_audit_logs
  for values from ('2026-10-01') to ('2026-11-01');
create table public.sys_audit_logs_2026_11 partition of public.sys_audit_logs
  for values from ('2026-11-01') to ('2026-12-01');
create table public.sys_audit_logs_2026_12 partition of public.sys_audit_logs
  for values from ('2026-12-01') to ('2027-01-01');
create table public.sys_audit_logs_2027_01 partition of public.sys_audit_logs
  for values from ('2027-01-01') to ('2027-02-01');
create table public.sys_audit_logs_default partition of public.sys_audit_logs
  default;

create index sys_audit_logs_occurred_idx on public.sys_audit_logs (occurred_at desc);
create index sys_audit_logs_user_idx on public.sys_audit_logs (user_id, occurred_at desc);
create index sys_audit_logs_table_idx on public.sys_audit_logs (table_name, occurred_at desc);

create or replace function public.sys_audit_prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'sys_audit_logs is append-only';
end;
$$;

create trigger trg_sys_audit_no_update
  before update on public.sys_audit_logs
  for each row execute function public.sys_audit_prevent_mutation();

create trigger trg_sys_audit_no_delete
  before delete on public.sys_audit_logs
  for each row execute function public.sys_audit_prevent_mutation();

create or replace function public.sys_audit_write(
  p_user_id uuid,
  p_action public.audit_action,
  p_table_name text,
  p_target_id text,
  p_old jsonb,
  p_new jsonb,
  p_ip inet,
  p_user_agent text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_ts timestamptz := now();
begin
  insert into public.sys_audit_logs (
    user_id, action, table_name, target_id, old_values, new_values,
    ip_address, user_agent, request_id, occurred_at
  ) values (
    p_user_id, p_action, p_table_name, p_target_id, p_old, p_new,
    p_ip, p_user_agent, p_request_id, v_ts
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.sys_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_action public.audit_action;
  v_old jsonb;
  v_new jsonb;
  v_target text;
begin
  begin
    v_uid := auth.uid();
  exception when others then
    v_uid := null;
  end;

  if tg_op = 'INSERT' then
    v_action := 'CREATE';
    v_new := to_jsonb(new);
    v_target := new.id::text;
  elsif tg_op = 'UPDATE' then
    v_action := 'UPDATE';
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_target := new.id::text;
  else
    v_action := 'DELETE';
    v_old := to_jsonb(old);
    v_target := old.id::text;
  end if;

  perform public.sys_audit_write(
    v_uid, v_action, tg_table_name, v_target, v_old, v_new,
    null, null, null
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Legal variables (versioned)
-- ---------------------------------------------------------------------------
create table public.ref_global_vars (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label_fr text not null,
  label_ar text,
  description text,
  value_type public.var_value_type not null,
  unit text,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ref_global_var_versions (
  id uuid primary key default gen_random_uuid(),
  var_id uuid not null references public.ref_global_vars(id) on delete cascade,
  value_numeric numeric(18,6),
  value_text text,
  value_boolean boolean,
  value_json jsonb,
  effective_from date not null,
  effective_to date,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

alter table public.ref_global_var_versions
  add constraint ref_global_var_versions_no_overlap
  exclude using gist (
    var_id with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  );

-- ---------------------------------------------------------------------------
-- IRG engine (data, not code)
-- ---------------------------------------------------------------------------
create table public.ref_bareme_irg_versions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label_fr text not null,
  source_ref text,
  effective_from date not null,
  effective_to date,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table public.ref_bareme_irg (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.ref_bareme_irg_versions(id) on delete cascade,
  min_annual numeric(14,2) not null,
  max_annual numeric(14,2),
  rate numeric(7,4) not null check (rate >= 0 and rate <= 1),
  sort_order integer not null,
  check (max_annual is null or max_annual >= min_annual),
  unique (version_id, sort_order)
);

create table public.ref_irg_rule_sets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  taxpayer_category public.irg_taxpayer_category not null,
  label_fr text not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now()
);

create table public.ref_irg_rules (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.ref_irg_rule_sets(id) on delete cascade,
  kind public.irg_rule_kind not null,
  applies_to public.irg_applies_to,
  sequence integer not null,
  params jsonb not null default '{}'::jsonb,
  formula text,
  unique (rule_set_id, sequence)
);

-- ---------------------------------------------------------------------------
-- Formula whitelist + attendance codes
-- ---------------------------------------------------------------------------
create table public.ref_formula_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  kind public.formula_token_kind not null,
  label_fr text not null,
  resolution_notes text
);

create table public.ref_legendes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label_fr text not null,
  label_ar text,
  coefficient numeric(6,3) not null check (coefficient >= 0 and coefficient <= 1),
  counts_as_presence boolean not null default false,
  triggers_an_passthrough boolean not null default false,
  is_system boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- HR (minimal, required for legal precedence)
-- ---------------------------------------------------------------------------
create table public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  matricule text not null unique,
  last_name text not null,
  first_name text not null,
  nss text,
  nin text,
  birth_date date,
  irg_category public.irg_taxpayer_category not null default 'STANDARD',
  status public.user_status not null default 'ACTIVE',
  hired_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hr_contracts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete restrict,
  site_id uuid not null references public.ref_sites(id),
  activity_code_id uuid not null references public.ref_activity_codes(id),
  qualification_code text,
  affectation_principale boolean not null default false,
  salaire_base_monthly numeric(14,2) not null check (salaire_base_monthly >= 0),
  salaire_net_ref_monthly numeric(14,2) not null check (salaire_net_ref_monthly >= 0),
  currency char(3) not null default 'DZD',
  start_date date not null,
  end_date date,
  status public.contract_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

alter table public.hr_contracts
  add constraint hr_contracts_one_principale_excl
  exclude using gist (
    employee_id with =,
    daterange(start_date, coalesce(end_date, 'infinity'::date), '[]') with &&
  ) where (affectation_principale and status in ('DRAFT','ACTIVE','SUSPENDED'));

-- ---------------------------------------------------------------------------
-- Commercial
-- ---------------------------------------------------------------------------
create table public.com_client_contracts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.ref_sites(id),
  reference text not null unique,
  client_name text not null,
  start_date date not null,
  end_date date,
  status public.contract_status not null default 'DRAFT',
  default_daily_billing_rate numeric(14,2),
  use_default_billing_fallback boolean not null default false,
  an_penalty_formula text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.com_contract_rate_lines (
  id uuid primary key default gen_random_uuid(),
  client_contract_id uuid not null references public.com_client_contracts(id) on delete cascade,
  code text not null,
  label_fr text not null,
  unit text not null default 'JOUR',
  unit_price numeric(14,2) not null check (unit_price >= 0),
  is_daily_billing boolean not null default false,
  unique (client_contract_id, code)
);

create table public.com_contract_penalties (
  id uuid primary key default gen_random_uuid(),
  client_contract_id uuid not null references public.com_client_contracts(id) on delete cascade,
  code text not null,
  label_fr text not null,
  formula text not null,
  trigger_legende_id uuid references public.ref_legendes(id),
  is_active boolean not null default true,
  unique (client_contract_id, code)
);

create table public.com_draft_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id),
  hr_contract_id uuid not null references public.hr_contracts(id),
  client_contract_id uuid references public.com_client_contracts(id),
  site_id_physical uuid not null references public.ref_sites(id),
  activity_code_resolved uuid not null references public.ref_activity_codes(id),
  work_date date not null,
  legend_id uuid not null references public.ref_legendes(id),
  coefficient numeric(6,3) not null,
  status public.adjustment_status not null default 'DRAFT',
  amount numeric(14,2) not null default 0,
  warning_code text,
  formula_snapshot text not null,
  token_values_snapshot jsonb not null,
  period_year integer not null,
  period_month integer not null,
  reversed_by_id uuid references public.com_draft_adjustments(id),
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index com_draft_adjustments_active_uq
  on public.com_draft_adjustments (
    employee_id,
    work_date,
    legend_id,
    (coalesce(client_contract_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  where status <> 'REVERSED';

-- ---------------------------------------------------------------------------
-- Indexes (B-Tree)
-- ---------------------------------------------------------------------------
create index sys_user_site_roles_user_idx on public.sys_user_site_roles (user_id);
create index sys_user_site_roles_site_idx on public.sys_user_site_roles (site_id);
create index sys_permissions_role_idx on public.sys_permissions (role_id);
create index hr_contracts_employee_idx on public.hr_contracts (employee_id);
create index hr_contracts_site_idx on public.hr_contracts (site_id);
create index hr_contracts_principale_idx on public.hr_contracts (employee_id) where affectation_principale;
create index com_client_contracts_site_idx on public.com_client_contracts (site_id);
create index com_draft_adjustments_period_idx on public.com_draft_adjustments (period_year, period_month, status);
create index com_draft_adjustments_employee_idx on public.com_draft_adjustments (employee_id, work_date);
create index ref_global_var_versions_var_idx on public.ref_global_var_versions (var_id, effective_from);
create index ref_bareme_irg_version_idx on public.ref_bareme_irg (version_id, sort_order);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'sys_roles','sys_screens','sys_users','ref_activity_codes','ref_sites',
    'ref_global_vars','ref_legendes','hr_employees','hr_contracts',
    'com_client_contracts','com_draft_adjustments'
  ]
  loop
    execute format(
      'create trigger trg_%s_updated before update on public.%I
       for each row execute function public.erp_set_updated_at();', t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row-change audit on operational tables (not on sys_audit_logs)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'sys_roles','sys_screens','sys_permissions','sys_users','sys_user_site_roles',
    'sys_period_locks','ref_activity_codes','ref_sites','ref_global_vars',
    'ref_global_var_versions','ref_bareme_irg_versions','ref_bareme_irg',
    'ref_irg_rule_sets','ref_irg_rules','ref_legendes','hr_employees',
    'hr_contracts','com_client_contracts','com_contract_rate_lines',
    'com_contract_penalties','com_draft_adjustments'
  ]
  loop
    execute format(
      'create trigger trg_%s_audit after insert or update or delete on public.%I
       for each row execute function public.sys_audit_row_change();', t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Privilege + last SUPER_ADMIN guards
-- ---------------------------------------------------------------------------
create or replace function public.erp_is_super_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sys_user_site_roles usr
    join public.sys_roles r on r.id = usr.role_id
    join public.sys_users u on u.id = usr.user_id
    where usr.user_id = p_uid
      and usr.site_id is null
      and r.code = 'SUPER_ADMIN'
      and r.is_active
      and u.status = 'ACTIVE'
  );
$$;

create or replace function public.erp_guard_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target_level int;
  v_target_code text;
  v_site_ok boolean;
  v_actor uuid := auth.uid();
begin
  select hierarchy_level, code, site_scoped_allowed
    into v_target_level, v_target_code, v_site_ok
  from public.sys_roles where id = new.role_id;

  if v_target_code = 'SUPER_ADMIN' and new.site_id is not null then
    raise exception 'SUPER_ADMIN must be global (site_id null)';
  end if;

  if not v_site_ok and new.site_id is not null then
    raise exception 'Role % cannot be site-scoped', v_target_code;
  end if;

  -- Bootstrap: allow first assignment when no SUPER_ADMIN exists yet
  if v_target_level >= 80
     and not public.erp_is_super_admin(v_actor)
     and exists (
       select 1
       from public.sys_user_site_roles usr
       join public.sys_roles r on r.id = usr.role_id
       where r.code = 'SUPER_ADMIN'
     ) then
    raise exception 'Only SUPER_ADMIN can assign roles of level >= 80';
  end if;

  return new;
end;
$$;

create trigger trg_sys_user_site_roles_guard
  before insert or update on public.sys_user_site_roles
  for each row execute function public.erp_guard_role_assignment();

create or replace function public.erp_user_is_super_admin(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sys_user_site_roles usr
    join public.sys_roles r on r.id = usr.role_id
    where usr.user_id = p_uid
      and usr.site_id is null
      and r.code = 'SUPER_ADMIN'
      and r.is_active
  );
$$;

create or replace function public.erp_guard_last_super_admin()
returns trigger
language plpgsql
as $$
declare
  v_left int;
begin
  -- Only guard when the affected user currently holds SUPER_ADMIN
  if not public.erp_user_is_super_admin(old.id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.status <> 'ACTIVE') then
    select count(*) into v_left
    from public.sys_user_site_roles usr
    join public.sys_roles r on r.id = usr.role_id
    join public.sys_users u on u.id = usr.user_id
    where r.code = 'SUPER_ADMIN'
      and u.status = 'ACTIVE'
      and u.id <> old.id;
    if v_left = 0 then
      raise exception 'Cannot remove or disable the last SUPER_ADMIN';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_sys_users_last_admin
  before update or delete on public.sys_users
  for each row execute function public.erp_guard_last_super_admin();

-- ---------------------------------------------------------------------------
-- Effective role: site grant overrides global grant
-- ---------------------------------------------------------------------------
create or replace function public.erp_effective_role_id(p_uid uuid, p_site uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select usr.role_id
       from public.sys_user_site_roles usr
      where usr.user_id = p_uid and usr.site_id = p_site
      order by (select hierarchy_level from public.sys_roles r where r.id = usr.role_id) desc
      limit 1),
    (select usr.role_id
       from public.sys_user_site_roles usr
      where usr.user_id = p_uid and usr.site_id is null
      order by (select hierarchy_level from public.sys_roles r where r.id = usr.role_id) desc
      limit 1)
  );
$$;

create or replace function public.erp_has_perm(
  p_screen text,
  p_action public.rbac_action,
  p_site uuid default null,
  p_uid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.erp_is_super_admin(p_uid)
    or exists (
      select 1
      from public.sys_permissions p
      join public.sys_screens s on s.id = p.screen_id
      where p.role_id = public.erp_effective_role_id(p_uid, p_site)
        and s.code = p_screen
        and s.is_active
        and case p_action
          when 'create' then p.can_create
          when 'read' then p.can_read
          when 'update' then p.can_update
          when 'delete' then p.can_delete
          when 'print' then p.can_print
          when 'export' then p.can_export
        end
    );
$$;

create or replace function public.erp_can_see_site(p_site uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.erp_is_super_admin(p_uid)
      or exists (
        select 1 from public.sys_user_site_roles
        where user_id = p_uid and (site_id is null or site_id = p_site)
      );
$$;

-- ---------------------------------------------------------------------------
-- AN draft: reject writes into a locked period
-- ---------------------------------------------------------------------------
create or replace function public.com_guard_period_lock()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.sys_period_locks
    where year = new.period_year
      and month = new.period_month
      and unlocked_at is null
  ) and not public.erp_is_super_admin() then
    raise exception 'Period %-% is locked', new.period_year, new.period_month;
  end if;
  return new;
end;
$$;

create trigger trg_com_draft_period_lock
  before insert or update on public.com_draft_adjustments
  for each row execute function public.com_guard_period_lock();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.sys_roles enable row level security;
alter table public.sys_screens enable row level security;
alter table public.sys_permissions enable row level security;
alter table public.sys_users enable row level security;
alter table public.sys_user_site_roles enable row level security;
alter table public.sys_period_locks enable row level security;
alter table public.sys_audit_logs enable row level security;
alter table public.ref_activity_codes enable row level security;
alter table public.ref_sites enable row level security;
alter table public.ref_global_vars enable row level security;
alter table public.ref_global_var_versions enable row level security;
alter table public.ref_bareme_irg_versions enable row level security;
alter table public.ref_bareme_irg enable row level security;
alter table public.ref_irg_rule_sets enable row level security;
alter table public.ref_irg_rules enable row level security;
alter table public.ref_formula_tokens enable row level security;
alter table public.ref_legendes enable row level security;
alter table public.hr_employees enable row level security;
alter table public.hr_contracts enable row level security;
alter table public.com_client_contracts enable row level security;
alter table public.com_contract_rate_lines enable row level security;
alter table public.com_contract_penalties enable row level security;
alter table public.com_draft_adjustments enable row level security;

create policy sys_roles_read on public.sys_roles for select to authenticated
  using (exists (select 1 from public.sys_users u where u.id = auth.uid()));
create policy sys_roles_write on public.sys_roles for all to authenticated
  using (public.erp_is_super_admin()) with check (public.erp_is_super_admin());

create policy sys_screens_read on public.sys_screens for select to authenticated
  using (exists (select 1 from public.sys_users u where u.id = auth.uid()));
create policy sys_screens_write on public.sys_screens for all to authenticated
  using (public.erp_is_super_admin()) with check (public.erp_is_super_admin());

create policy sys_permissions_read on public.sys_permissions for select to authenticated
  using (exists (select 1 from public.sys_users u where u.id = auth.uid()));
create policy sys_permissions_write on public.sys_permissions for all to authenticated
  using (public.erp_is_super_admin()) with check (public.erp_is_super_admin());

create policy sys_users_read on public.sys_users for select to authenticated
  using (id = auth.uid() or public.erp_has_perm('users','read', null));
create policy sys_users_write on public.sys_users for all to authenticated
  using (public.erp_has_perm('users','update', null))
  with check (public.erp_has_perm('users','update', null));

create policy sys_usr_read on public.sys_user_site_roles for select to authenticated
  using (user_id = auth.uid() or public.erp_has_perm('users','read', site_id));
create policy sys_usr_write on public.sys_user_site_roles for all to authenticated
  using (public.erp_has_perm('users','update', site_id))
  with check (public.erp_has_perm('users','update', site_id));

create policy sys_locks_read on public.sys_period_locks for select to authenticated
  using (public.erp_has_perm('period_locks','read', null));
create policy sys_locks_write on public.sys_period_locks for all to authenticated
  using (public.erp_has_perm('period_locks','update', null))
  with check (public.erp_has_perm('period_locks','update', null));

create policy sys_audit_read on public.sys_audit_logs for select to authenticated
  using (public.erp_has_perm('audit','read', null));

create policy ref_dict_read on public.ref_activity_codes for select to authenticated using (true);
create policy ref_dict_write on public.ref_activity_codes for all to authenticated
  using (public.erp_is_super_admin()) with check (public.erp_is_super_admin());

create policy ref_sites_read on public.ref_sites for select to authenticated
  using (public.erp_can_see_site(id));
create policy ref_sites_write on public.ref_sites for all to authenticated
  using (public.erp_has_perm('sites','update', id))
  with check (public.erp_has_perm('sites','update', id));

create policy ref_vars_read on public.ref_global_vars for select to authenticated
  using (public.erp_has_perm('global_vars','read', null));
create policy ref_vars_write on public.ref_global_vars for all to authenticated
  using (public.erp_is_super_admin()) with check (public.erp_is_super_admin());

create policy ref_varver_read on public.ref_global_var_versions for select to authenticated
  using (public.erp_has_perm('global_vars','read', null));
create policy ref_varver_write on public.ref_global_var_versions for all to authenticated
  using (public.erp_is_super_admin()) with check (public.erp_is_super_admin());

create policy ref_irg_ver_read on public.ref_bareme_irg_versions for select to authenticated
  using (public.erp_has_perm('irg','read', null));
create policy ref_irg_ver_write on public.ref_bareme_irg_versions for all to authenticated
  using (public.erp_is_super_admin()) with check (public.erp_is_super_admin());

create policy ref_irg_br_read on public.ref_bareme_irg for select to authenticated
  using (public.erp_has_perm('irg','read', null));
create policy ref_irg_br_write on public.ref_bareme_irg for all to authenticated
  using (public.erp_is_super_admin()) with check (public.erp_is_super_admin());

create policy ref_irg_rs_read on public.ref_irg_rule_sets for select to authenticated
  using (public.erp_has_perm('irg','read', null));
create policy ref_irg_rs_write on public.ref_irg_rule_sets for all to authenticated
  using (public.erp_is_super_admin()) with check (public.erp_is_super_admin());

create policy ref_irg_rl_read on public.ref_irg_rules for select to authenticated
  using (public.erp_has_perm('irg','read', null));
create policy ref_irg_rl_write on public.ref_irg_rules for all to authenticated
  using (public.erp_is_super_admin()) with check (public.erp_is_super_admin());

create policy ref_tokens_read on public.ref_formula_tokens for select to authenticated using (true);
create policy ref_tokens_write on public.ref_formula_tokens for all to authenticated
  using (public.erp_is_super_admin()) with check (public.erp_is_super_admin());

create policy ref_leg_read on public.ref_legendes for select to authenticated using (true);
create policy ref_leg_write on public.ref_legendes for all to authenticated
  using (public.erp_is_super_admin()) with check (public.erp_is_super_admin());

create policy hr_emp_read on public.hr_employees for select to authenticated
  using (public.erp_has_perm('employees','read', null));
create policy hr_emp_write on public.hr_employees for all to authenticated
  using (public.erp_has_perm('employees','update', null))
  with check (public.erp_has_perm('employees','update', null));

create policy hr_ctr_read on public.hr_contracts for select to authenticated
  using (public.erp_can_see_site(site_id) and public.erp_has_perm('contracts','read', site_id));
create policy hr_ctr_write on public.hr_contracts for all to authenticated
  using (public.erp_has_perm('contracts','update', site_id))
  with check (public.erp_has_perm('contracts','update', site_id));

create policy com_ctr_read on public.com_client_contracts for select to authenticated
  using (public.erp_can_see_site(site_id) and public.erp_has_perm('client_contracts','read', site_id));
create policy com_ctr_write on public.com_client_contracts for all to authenticated
  using (public.erp_has_perm('client_contracts','update', site_id))
  with check (public.erp_has_perm('client_contracts','update', site_id));

create policy com_rate_read on public.com_contract_rate_lines for select to authenticated
  using (exists (
    select 1 from public.com_client_contracts c
    where c.id = client_contract_id and public.erp_can_see_site(c.site_id)
  ));
create policy com_rate_write on public.com_contract_rate_lines for all to authenticated
  using (exists (
    select 1 from public.com_client_contracts c
    where c.id = client_contract_id and public.erp_has_perm('client_contracts','update', c.site_id)
  ))
  with check (exists (
    select 1 from public.com_client_contracts c
    where c.id = client_contract_id and public.erp_has_perm('client_contracts','update', c.site_id)
  ));

create policy com_pen_read on public.com_contract_penalties for select to authenticated
  using (exists (
    select 1 from public.com_client_contracts c
    where c.id = client_contract_id and public.erp_can_see_site(c.site_id)
  ));
create policy com_pen_write on public.com_contract_penalties for all to authenticated
  using (exists (
    select 1 from public.com_client_contracts c
    where c.id = client_contract_id and public.erp_has_perm('client_contracts','update', c.site_id)
  ))
  with check (exists (
    select 1 from public.com_client_contracts c
    where c.id = client_contract_id and public.erp_has_perm('client_contracts','update', c.site_id)
  ));

create policy com_adj_read on public.com_draft_adjustments for select to authenticated
  using (public.erp_can_see_site(site_id_physical) and public.erp_has_perm('adjustments','read', site_id_physical));
create policy com_adj_write on public.com_draft_adjustments for all to authenticated
  using (public.erp_has_perm('adjustments','update', site_id_physical))
  with check (public.erp_has_perm('adjustments','update', site_id_physical));

-- ---------------------------------------------------------------------------
-- Grants (PostgREST)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon;

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.sys_roles, public.sys_screens, public.sys_permissions, public.sys_users, public.sys_user_site_roles,
  public.sys_period_locks, public.ref_activity_codes, public.ref_sites, public.ref_global_vars,
  public.ref_global_var_versions, public.ref_bareme_irg_versions, public.ref_bareme_irg,
  public.ref_irg_rule_sets, public.ref_irg_rules, public.ref_formula_tokens, public.ref_legendes,
  public.hr_employees, public.hr_contracts, public.com_client_contracts, public.com_contract_rate_lines,
  public.com_contract_penalties, public.com_draft_adjustments
to authenticated;

grant select on public.sys_audit_logs to authenticated;
revoke insert, update, delete, truncate on public.sys_audit_logs from public, anon, authenticated, service_role;

grant execute on function public.sys_audit_write(uuid, public.audit_action, text, text, jsonb, jsonb, inet, text, uuid) to authenticated;
grant execute on function public.ref_njm_calendar(date) to authenticated;
grant execute on function public.erp_has_perm(text, public.rbac_action, uuid, uuid) to authenticated;
grant execute on function public.erp_is_super_admin(uuid) to authenticated;
grant execute on function public.erp_can_see_site(uuid, uuid) to authenticated;
grant execute on function public.erp_effective_role_id(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed (data — not application constants). Expert-comptable must still sign off.
-- ---------------------------------------------------------------------------
insert into public.sys_roles (code, label_fr, hierarchy_level, is_system, require_mfa, site_scoped_allowed) values
  ('SUPER_ADMIN',    'Super administrateur', 100, true, true,  false),
  ('ADMIN_FINANCE',  'Admin finance',         80, true, true,  true),
  ('ADMIN_RH',       'Admin RH',              80, true, true,  true),
  ('GERANT',         'Gérant',                70, true, true,  true),
  ('CHEF_CHANTIER',  'Chef de chantier',      40, true, false, true),
  ('READ_ONLY',      'Lecture seule',         10, true, false, true);

insert into public.sys_screens (code, path, module, label_fr, sort_order) values
  ('castle',            '/',                         'shell',        'Tableau de bord', 10),
  ('users',             '/administration/utilisateurs','admin',       'Utilisateurs', 20),
  ('roles',             '/administration/roles',     'admin',        'Rôles', 30),
  ('permissions',       '/administration/permissions','admin',       'Matrice des droits', 40),
  ('audit',             '/administration/audit',     'admin',        'Journal d''audit', 50),
  ('period_locks',      '/administration/periodes',  'admin',        'Clôture des périodes', 60),
  ('global_vars',       '/referentiels/variables',   'ref',          'Variables légales', 70),
  ('irg',               '/referentiels/irg',         'ref',          'Barème IRG', 80),
  ('legendes',          '/referentiels/legendes',    'ref',          'Légendes de présence', 90),
  ('activity_codes',    '/referentiels/activites',   'ref',          'Codes d''activité', 100),
  ('sites',             '/referentiels/chantiers',   'ref',          'Chantiers', 110),
  ('employees',         '/rh/employes',              'hr',           'Employés', 120),
  ('contracts',         '/rh/contrats',              'hr',           'Contrats de travail', 130),
  ('client_contracts',  '/commercial/contrats',      'com',          'Contrats clients', 140),
  ('adjustments',       '/commercial/ajustements',   'com',          'Ajustements AN (brouillon)', 150);

insert into public.ref_activity_codes (
  code, label_fr, regime, official_code, leave_funding, leave_days_per_month,
  applies_cacobatph, applies_intemperies, conge_jour_formula
) values
  ('BTPH', 'Bâtiment, Travaux Publics et Hydraulique', 'BTPH', null,
   'CACOBATPH_FUNDED', null, true, true,
   '([SALAIRE_BASE_MOIS] * [CACOBATPH_CONGES]) / [NJM_DIVISEUR]'),
  ('MAINTENANCE', 'Maintenance', 'MAINTENANCE', '613133',
   'COMPANY_ACCRUAL', 2.500, false, false,
   '[SALAIRE_JOUR_NET] * [LEAVE_DAYS_PER_MONTH] / [NJM_DIVISEUR]');

insert into public.ref_global_vars (key, label_fr, value_type, unit) values
  ('CNAS_EMPLOYEE',              'CNAS part salariale',              'numeric', '%'),
  ('CNAS_EMPLOYER_BASE',         'CNAS part patronale hors FOS',     'numeric', '%'),
  ('CNAS_FOS',                   'Fonds des œuvres sociales',        'numeric', '%'),
  ('CACOBATPH_CONGES',           'CACOBATPH congés payés',           'numeric', '%'),
  ('CACOBATPH_INTEMPERIES',      'CACOBATPH intempéries total',      'numeric', '%'),
  ('CACOBATPH_INTEMPERIES_EMP',  'CACOBATPH intempéries employeur',  'numeric', '%'),
  ('CACOBATPH_INTEMPERIES_SAL',  'CACOBATPH intempéries salarié',    'numeric', '%'),
  ('NJM_DIVISEUR_MODE',          'Mode du diviseur journalier',      'enum',    null),
  ('NJM_DIVISEUR_FIXED',         'Diviseur fixe (si mode FIXED)',    'numeric', 'jours'),
  ('SNMG',                       'Salaire national minimum garanti', 'numeric', 'DA'),
  ('VF_RATE_BTPH',               'Versement forfaitaire BTPH',       'numeric', '%'),
  ('VF_RATE_OTHER',              'Versement forfaitaire hors BTPH',  'numeric', '%');

insert into public.ref_global_var_versions (var_id, value_numeric, value_text, effective_from)
select id, 0.090000, null, date '2022-01-01' from public.ref_global_vars where key = 'CNAS_EMPLOYEE';
insert into public.ref_global_var_versions (var_id, value_numeric, effective_from)
select id, 0.250000, date '2022-01-01' from public.ref_global_vars where key = 'CNAS_EMPLOYER_BASE';
insert into public.ref_global_var_versions (var_id, value_numeric, effective_from)
select id, 0.005000, date '2022-01-01' from public.ref_global_vars where key = 'CNAS_FOS';
insert into public.ref_global_var_versions (var_id, value_numeric, effective_from)
select id, 0.122100, date '2022-01-01' from public.ref_global_vars where key = 'CACOBATPH_CONGES';
insert into public.ref_global_var_versions (var_id, value_numeric, effective_from)
select id, 0.007500, date '2022-01-01' from public.ref_global_vars where key = 'CACOBATPH_INTEMPERIES';
insert into public.ref_global_var_versions (var_id, value_numeric, effective_from)
select id, 0.003750, date '2022-01-01' from public.ref_global_vars where key = 'CACOBATPH_INTEMPERIES_EMP';
insert into public.ref_global_var_versions (var_id, value_numeric, effective_from)
select id, 0.003750, date '2022-01-01' from public.ref_global_vars where key = 'CACOBATPH_INTEMPERIES_SAL';
insert into public.ref_global_var_versions (var_id, value_text, effective_from)
select id, 'FIXED', date '2022-01-01' from public.ref_global_vars where key = 'NJM_DIVISEUR_MODE';
insert into public.ref_global_var_versions (var_id, value_numeric, effective_from)
select id, 30, date '2022-01-01' from public.ref_global_vars where key = 'NJM_DIVISEUR_FIXED';
insert into public.ref_global_var_versions (var_id, value_numeric, effective_from)
select id, 20000, date '2024-01-01' from public.ref_global_vars where key = 'SNMG';
insert into public.ref_global_var_versions (var_id, value_numeric, effective_from)
select id, 0.010000, date '2022-01-01' from public.ref_global_vars where key = 'VF_RATE_BTPH';
insert into public.ref_global_var_versions (var_id, value_numeric, effective_from)
select id, 0.020000, date '2022-01-01' from public.ref_global_vars where key = 'VF_RATE_OTHER';

insert into public.ref_bareme_irg_versions (code, label_fr, source_ref, effective_from)
values ('IRG_LF_2022', 'Barème IRG LF 2022', 'CIDTA Art. 104 / LF 2022', date '2022-01-01');

insert into public.ref_bareme_irg (version_id, min_annual, max_annual, rate, sort_order)
select id, 0,        240000,  0.00, 1 from public.ref_bareme_irg_versions where code = 'IRG_LF_2022'
union all select id, 240001,  480000,  0.23, 2 from public.ref_bareme_irg_versions where code = 'IRG_LF_2022'
union all select id, 480001,  960000,  0.27, 3 from public.ref_bareme_irg_versions where code = 'IRG_LF_2022'
union all select id, 960001,  1920000, 0.30, 4 from public.ref_bareme_irg_versions where code = 'IRG_LF_2022'
union all select id, 1920001, 3840000, 0.33, 5 from public.ref_bareme_irg_versions where code = 'IRG_LF_2022'
union all select id, 3840001, null,    0.35, 6 from public.ref_bareme_irg_versions where code = 'IRG_LF_2022';

insert into public.ref_irg_rule_sets (code, taxpayer_category, label_fr, effective_from) values
  ('IRG_SALARIE_2022',  'STANDARD',             'Salarié régime général', '2022-01-01'),
  ('IRG_HAND_RET_2022', 'DISABLED_OR_RETIREE',  'Handicapé / retraité',   '2022-01-01');

insert into public.ref_irg_rules (rule_set_id, kind, applies_to, sequence, params, formula)
select id, 'BASE_PREPROCESS', 'GROSS', 10,
       '{"deduct_tokens":["CNAS_EMPLOYEE"]}'::jsonb, null
from public.ref_irg_rule_sets where code = 'IRG_SALARIE_2022';

insert into public.ref_irg_rules (rule_set_id, kind, applies_to, sequence, params)
select id, 'EXEMPTION_THRESHOLD', 'GROSS', 20,
       '{"monthly_max":30000}'::jsonb
from public.ref_irg_rule_sets where code = 'IRG_SALARIE_2022';

insert into public.ref_irg_rules (rule_set_id, kind, applies_to, sequence, params)
select id, 'ABATEMENT_ON_TAX', 'TAX', 30,
       '{"rate":0.40,"min_monthly":1000,"max_monthly":1500}'::jsonb
from public.ref_irg_rule_sets where code = 'IRG_SALARIE_2022';

insert into public.ref_irg_rules (rule_set_id, kind, applies_to, sequence, params, formula)
select id, 'LISSAGE', 'TAX', 40,
       '{"monthly_min":30001,"monthly_max":35000}'::jsonb,
       '[IRG_AFTER_ABATEMENT] * (137/51) - (27925/8)'
from public.ref_irg_rule_sets where code = 'IRG_SALARIE_2022';

insert into public.ref_irg_rules (rule_set_id, kind, applies_to, sequence, params)
select id, 'NON_MONTHLY_WITHHOLDING', 'GROSS', 50,
       '{"rate":0.10}'::jsonb
from public.ref_irg_rule_sets where code = 'IRG_SALARIE_2022';

insert into public.ref_irg_rules (rule_set_id, kind, applies_to, sequence, params, formula)
select id, 'LISSAGE', 'TAX', 40,
       '{"monthly_min":30001,"monthly_max":42500}'::jsonb,
       '[IRG_AFTER_ABATEMENT] * (93/61) - (81213/41)'
from public.ref_irg_rule_sets where code = 'IRG_HAND_RET_2022';

insert into public.ref_irg_rules (rule_set_id, kind, applies_to, sequence, params, formula)
select h.id, r.kind, r.applies_to, r.sequence, r.params, r.formula
from public.ref_irg_rule_sets h
join public.ref_irg_rule_sets s on s.code = 'IRG_SALARIE_2022'
join public.ref_irg_rules r on r.rule_set_id = s.id and r.kind <> 'LISSAGE'
where h.code = 'IRG_HAND_RET_2022';

insert into public.ref_formula_tokens (token, kind, label_fr) values
  ('PRIX_FACTURATION_CLIENT_JOUR', 'RESOLVED', 'Prix de facturation client / jour'),
  ('SALAIRE_JOUR_NET',             'RESOLVED', 'Salaire journalier de référence (net contrat)'),
  ('SALAIRE_BASE_MOIS',            'INPUT',    'Salaire de base mensuel'),
  ('CONGE_JOUR',                   'RESOLVED', 'Équivalent congé / jour'),
  ('NJM_DIVISEUR',                 'RESOLVED', 'Diviseur journalier du mois'),
  ('NJM_CALENDAR',                 'RESOLVED', 'Nombre de jours calendaires du mois'),
  ('NJT',                          'INPUT',    'Nombre de jours travaillés'),
  ('LEAVE_DAYS_PER_MONTH',         'LEGAL_VAR','Jours de congé acquis / mois'),
  ('CACOBATPH_CONGES',             'LEGAL_VAR','Taux CACOBATPH congés'),
  ('IRG_AFTER_ABATEMENT',          'RESOLVED', 'IRG après 1er abattement');

insert into public.ref_legendes (code, label_fr, coefficient, counts_as_presence, triggers_an_passthrough) values
  ('P',   'Présent',                 1.0, true,  false),
  ('MS',  'Mission',                 1.0, true,  false),
  ('CRP', 'Repos',                   1.0, true,  false),
  ('AN',  'Absence injustifiée',     0.0, false, true),
  ('CM',  'Congé maladie',           0.0, false, false),
  ('AOP', 'Absence / congé payé',    1.0, false, false);

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select r.id, s.id, true, true, true, true, true, true
from public.sys_roles r cross join public.sys_screens s
where r.code = 'SUPER_ADMIN';

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select r.id, s.id, false, true, false, false, true, true
from public.sys_roles r cross join public.sys_screens s
where r.code = 'READ_ONLY';

commit;
