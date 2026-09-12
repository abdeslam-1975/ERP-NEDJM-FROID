-- NEDJM FROID ERP — Phase 1B
-- User admin support + Customer contracts engine (Sonatrach seed: labor + penalties)
-- SPARE_PART lines (203): NOT seeded — schedule file missing from workspace (explicit gap)

begin;

-- ---------------------------------------------------------------------------
-- Soft-deactivate status for sys_users (preserve audit; no hard delete)
-- ---------------------------------------------------------------------------
alter type public.user_status add value if not exists 'INACTIVE';

-- ---------------------------------------------------------------------------
-- Contract enums (ASCII codes; UI shows accented FR labels)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.ref_contract_status as enum (
    'BROUILLON', 'VALIDE', 'EN_COURS', 'CLOTURE', 'ANNULE'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.contract_item_type as enum ('LABOR', 'SPARE_PART');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- ref_contracts + contract_items
-- ---------------------------------------------------------------------------
create table if not exists public.ref_contracts (
  id uuid primary key default gen_random_uuid(),
  contract_number text not null unique,
  client_name text not null,
  site_id uuid not null references public.ref_sites(id),
  start_date date not null,
  end_date date not null,
  ods_date date,
  total_amount_ht numeric(18,2) not null default 0 check (total_amount_ht >= 0),
  caution_rate numeric(8,6) not null default 0 check (caution_rate >= 0 and caution_rate <= 1),
  caution_amount numeric(18,2) not null default 0 check (caution_amount >= 0),
  status public.ref_contract_status not null default 'BROUILLON',
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.contract_items (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.ref_contracts(id) on delete cascade,
  item_type public.contract_item_type not null,
  item_code text not null,
  designation text not null,
  unit text not null default 'U',
  quantity numeric(18,4) not null check (quantity >= 0),
  unit_price_ht numeric(18,4) not null check (unit_price_ht >= 0),
  total_price_ht numeric(18,2) not null check (total_price_ht >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, item_type, item_code)
);

create index if not exists ref_contracts_site_idx on public.ref_contracts (site_id);
create index if not exists ref_contracts_status_idx on public.ref_contracts (status);
create index if not exists contract_items_contract_idx on public.contract_items (contract_id);
create index if not exists contract_items_type_idx on public.contract_items (contract_id, item_type);
create index if not exists contract_items_designation_idx
  on public.contract_items using gin (to_tsvector('simple', designation));

drop trigger if exists trg_ref_contracts_updated on public.ref_contracts;
create trigger trg_ref_contracts_updated
  before update on public.ref_contracts
  for each row execute function public.erp_set_updated_at();

drop trigger if exists trg_contract_items_updated on public.contract_items;
create trigger trg_contract_items_updated
  before update on public.contract_items
  for each row execute function public.erp_set_updated_at();

drop trigger if exists trg_ref_contracts_audit on public.ref_contracts;
create trigger trg_ref_contracts_audit
  after insert or update or delete on public.ref_contracts
  for each row execute function public.sys_audit_row_change();

drop trigger if exists trg_contract_items_audit on public.contract_items;
create trigger trg_contract_items_audit
  after insert or update or delete on public.contract_items
  for each row execute function public.sys_audit_row_change();

alter table public.ref_contracts enable row level security;
alter table public.contract_items enable row level security;

drop policy if exists ref_contracts_read on public.ref_contracts;
create policy ref_contracts_read on public.ref_contracts for select to authenticated
  using (public.erp_can_see_site(site_id) and public.erp_has_perm('client_contracts','read', site_id));

drop policy if exists ref_contracts_write on public.ref_contracts;
create policy ref_contracts_write on public.ref_contracts for all to authenticated
  using (public.erp_has_perm('client_contracts','update', site_id))
  with check (public.erp_has_perm('client_contracts','update', site_id));

drop policy if exists contract_items_read on public.contract_items;
create policy contract_items_read on public.contract_items for select to authenticated
  using (exists (
    select 1 from public.ref_contracts c
    where c.id = contract_id
      and public.erp_can_see_site(c.site_id)
      and public.erp_has_perm('client_contracts','read', c.site_id)
  ));

drop policy if exists contract_items_write on public.contract_items;
create policy contract_items_write on public.contract_items for all to authenticated
  using (exists (
    select 1 from public.ref_contracts c
    where c.id = contract_id
      and public.erp_has_perm('client_contracts','update', c.site_id)
  ))
  with check (exists (
    select 1 from public.ref_contracts c
    where c.id = contract_id
      and public.erp_has_perm('client_contracts','update', c.site_id)
  ));

grant select, insert, update, delete on public.ref_contracts, public.contract_items to authenticated;

-- Screens for navigation / future matrix
insert into public.sys_screens (code, path, module, label_fr, sort_order)
values
  ('param_users', '/parametres/utilisateurs', 'admin', 'Utilisateurs (Paramètres)', 25),
  ('ref_contracts', '/referentiels/contrats', 'com', 'Contrats clients', 145)
on conflict (code) do update
  set path = excluded.path,
      label_fr = excluded.label_fr,
      updated_at = now();

-- SUPER_ADMIN + READ_ONLY permissions for new screens
insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select r.id, s.id, true, true, true, true, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code = 'SUPER_ADMIN'
  and s.code in ('param_users', 'ref_contracts')
on conflict (role_id, screen_id) do nothing;

insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select r.id, s.id, false, true, false, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code = 'READ_ONLY'
  and s.code in ('param_users', 'ref_contracts')
on conflict (role_id, screen_id) do nothing;

-- ADMIN_RH: users screen full (except we gate SUPER_ADMIN assign in app)
insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select r.id, s.id, true, true, true, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code = 'ADMIN_RH'
  and s.code = 'param_users'
on conflict (role_id, screen_id) do nothing;

-- ADMIN_FINANCE: contracts
insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select r.id, s.id, true, true, true, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code in ('ADMIN_FINANCE', 'GERANT')
  and s.code = 'ref_contracts'
on conflict (role_id, screen_id) do nothing;

-- ---------------------------------------------------------------------------
-- Seed site Hassi Messaoud / Direction El Gassi (idempotent)
-- ---------------------------------------------------------------------------
insert into public.ref_activity_codes (
  code, label_fr, regime, official_code, leave_funding, leave_days_per_month,
  applies_cacobatph, applies_intemperies, conge_jour_formula
)
select
  'MAINTENANCE', 'Maintenance', 'MAINTENANCE', '613133',
  'COMPANY_ACCRUAL', 2.500, false, false,
  '[SALAIRE_JOUR_NET] * [LEAVE_DAYS_PER_MONTH] / [NJM_DIVISEUR]'
where not exists (select 1 from public.ref_activity_codes where code = 'MAINTENANCE');

insert into public.ref_sites (code, name_fr, name_ar, activity_code_id, wilaya, commune, is_active)
select
  'HMD-DEG',
  'Hassi Messaoud — Direction El Gassi',
  'حاسي مسعود — مديرية القاسي',
  a.id,
  'Ouargla',
  'Hassi Messaoud',
  true
from public.ref_activity_codes a
where a.code = 'MAINTENANCE'
  and not exists (select 1 from public.ref_sites where code = 'HMD-DEG');

-- ---------------------------------------------------------------------------
-- SONATRACH contract seed (labor + attributes; NO spare parts yet)
-- ---------------------------------------------------------------------------
insert into public.ref_contracts (
  contract_number, client_name, site_id,
  start_date, end_date, ods_date,
  total_amount_ht, caution_rate, caution_amount,
  status, attributes
)
select
  'I/111/HMD-DEG/2024',
  'SONATRACH - Direction El Gassi',
  s.id,
  date '2024-01-01',
  date '2024-01-01' + 1094, -- 1095 days inclusive span
  date '2024-01-01',
  281195650.00,
  0.02,
  5623913.00,
  'EN_COURS',
  jsonb_build_object(
    'tva_exempt', true,
    'tva_articles', jsonb_build_array('12', '16'),
    'duration_days', 1095,
    'prestation_permanente_ht', 254697000.00,
    'fourniture_demande_ht', 26498650.00,
    'daily_rate_ht', 232600.00,
    'contre_facturation', jsonb_build_object(
      'hebergement_restauration_da_per_day_agent', 5750.00,
      'carburant_da_per_liter', 36.76
    ),
    'penalties', jsonb_build_object(
      'chef_absence', jsonb_build_object(
        'rate', 0.10, 'grace_hours', 72, 'basis', 'daily_contract_rate'
      ),
      'technician_absence', jsonb_build_object(
        'rate', 0.05, 'grace_hours', 72, 'basis', 'per_agent_daily'
      ),
      'salary_delay', jsonb_build_object(
        'from_day_11_rate', 0.02,
        'from_day_20_rate', 0.10
      ),
      'equipment_vehicle_failure', jsonb_build_object(
        'rate', 0.075, 'grace_hours', 48
      ),
      'max_cap_rate', 0.10,
      'max_cap_basis', 'total_contract_ht'
    ),
    'spare_parts_seed_status', 'PENDING_SCHEDULE_FILE',
    'spare_parts_expected_count', 203
  )
from public.ref_sites s
where s.code = 'HMD-DEG'
  and not exists (
    select 1 from public.ref_contracts where contract_number = 'I/111/HMD-DEG/2024'
  );

-- Labor schedule (5 roles)
with c as (
  select id from public.ref_contracts where contract_number = 'I/111/HMD-DEG/2024'
),
labor(sort_order, item_code, designation, quantity, unit_price_ht, total_price_ht) as (
  values
    (1, 'LAB-CHEF-HVAC', 'Chef de maintenance HVAC', 1::numeric, 23000.00, 23000.00),
    (2, 'LAB-TECH-SUP-HVAC', 'Technicien Supérieur HVAC', 4::numeric, 18500.00, 74000.00),
    (3, 'LAB-TECH-HVAC', 'Technicien HVAC', 4::numeric, 17500.00, 70000.00),
    (4, 'LAB-FRIGO', 'Agent frigoriste', 2::numeric, 16400.00, 32800.00),
    (5, 'LAB-FACTOTUM', 'Factotum', 2::numeric, 16400.00, 32800.00)
)
insert into public.contract_items (
  contract_id, item_type, item_code, designation, unit,
  quantity, unit_price_ht, total_price_ht, sort_order
)
select
  c.id, 'LABOR', l.item_code, l.designation, 'JOUR',
  l.quantity, l.unit_price_ht, l.total_price_ht, l.sort_order
from c cross join labor l
on conflict (contract_id, item_type, item_code) do update
  set designation = excluded.designation,
      quantity = excluded.quantity,
      unit_price_ht = excluded.unit_price_ht,
      total_price_ht = excluded.total_price_ht,
      sort_order = excluded.sort_order,
      updated_at = now();

-- Integrity checks (labor daily rate)
do $$
declare
  v_labor_day numeric;
  v_contract uuid;
begin
  select id into v_contract from public.ref_contracts where contract_number = 'I/111/HMD-DEG/2024';
  if v_contract is null then
    raise exception '1B seed failed: SONATRACH contract missing';
  end if;

  select coalesce(sum(total_price_ht), 0) into v_labor_day
  from public.contract_items
  where contract_id = v_contract and item_type = 'LABOR';

  if v_labor_day <> 232600.00 then
    raise exception '1B seed failed: labor daily total % <> 232600', v_labor_day;
  end if;
end $$;

commit;
