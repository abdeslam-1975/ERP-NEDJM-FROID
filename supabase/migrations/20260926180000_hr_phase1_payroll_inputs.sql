-- Phase 1 payroll inputs:
--   1. Period-aware attendance roster (ended contracts stay visible for the months they covered)
--   2. Dated salary history per contract (avenants) used by payroll
--   3. Advances / loans with automatic monthly deduction
--   4. Overtime hours (HS50 / HS75 / HS100) entered on the attendance sheet

begin;

-- ---------------------------------------------------------------------------
-- 1. Roster: every contract with its dates; the client keeps those covering the month
-- ---------------------------------------------------------------------------
drop function if exists public.hr_attendance_roster();
create function public.hr_attendance_roster()
returns table (
  employee_id uuid,
  matricule text,
  last_name text,
  first_name text,
  poste text,
  site_id uuid,
  site_name text,
  start_date date,
  end_date date,
  status text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.employee_id,
    e.matricule,
    e.last_name,
    e.first_name,
    coalesce(nullif(btrim(c.poste_fr), ''), nullif(btrim(c.poste_ar), ''), '') as poste,
    c.site_id,
    s.name_fr as site_name,
    c.start_date,
    c.end_date,
    c.status::text as status
  from public.hr_contracts c
  join public.hr_employees e on e.id = c.employee_id
  join public.ref_sites s on s.id = c.site_id
  where public.erp_can_see_site(c.site_id)
    and public.erp_has_perm('hr_attendance', 'read'::public.rbac_action, c.site_id)
  order by c.employee_id, c.site_id, c.start_date desc;
$$;

revoke all on function public.hr_attendance_roster() from public;
grant execute on function public.hr_attendance_roster() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Salary history (avenants)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_contract_salary_history (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.hr_contracts(id) on delete cascade,
  effective_from date not null,
  salaire_base_monthly numeric(14,2) not null check (salaire_base_monthly >= 0),
  salaire_net_ref_monthly numeric(14,2) not null default 0 check (salaire_net_ref_monthly >= 0),
  reason text not null check (char_length(btrim(reason)) >= 3),
  created_by uuid references public.sys_users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, effective_from)
);

create index if not exists hr_contract_salary_history_idx
  on public.hr_contract_salary_history (contract_id, effective_from desc);

drop trigger if exists trg_hr_contract_salary_history_u on public.hr_contract_salary_history;
create trigger trg_hr_contract_salary_history_u before update on public.hr_contract_salary_history
  for each row execute function public.erp_set_updated_at();

drop trigger if exists trg_hr_contract_salary_history_audit on public.hr_contract_salary_history;
create trigger trg_hr_contract_salary_history_audit
  after insert or update or delete on public.hr_contract_salary_history
  for each row execute function public.sys_audit_row_change();

alter table public.hr_contract_salary_history enable row level security;

drop policy if exists hr_salary_hist_read on public.hr_contract_salary_history;
create policy hr_salary_hist_read on public.hr_contract_salary_history
  for select to authenticated using (public.erp_can_read_hr_salary());
drop policy if exists hr_salary_hist_write on public.hr_contract_salary_history;
create policy hr_salary_hist_write on public.hr_contract_salary_history
  for all to authenticated
  using (public.erp_can_write_hr_salary_values())
  with check (public.erp_can_write_hr_salary_values());

grant select, insert, update, delete on public.hr_contract_salary_history to authenticated;

insert into public.hr_contract_salary_history
  (contract_id, effective_from, salaire_base_monthly, salaire_net_ref_monthly, reason, created_by)
select c.id, c.start_date, coalesce(c.salaire_base_monthly, 0), coalesce(c.salaire_net_ref_monthly, 0),
       'Salaire initial', null
from public.hr_contracts c
where not exists (select 1 from public.hr_contract_salary_history h where h.contract_id = c.id);

-- Direct edits of the contract salary correct the version in force today;
-- dated changes go through hr_contract_salary_avenant.
create or replace function public.hr_contract_salary_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_first date;
begin
  if coalesce(current_setting('hr.salary_avenant', true), '') = 'on' then
    return new;
  end if;
  select min(effective_from) into v_first from public.hr_contract_salary_history where contract_id = new.id;
  if v_first is null then
    insert into public.hr_contract_salary_history
      (contract_id, effective_from, salaire_base_monthly, salaire_net_ref_monthly, reason)
    values (new.id, new.start_date, coalesce(new.salaire_base_monthly, 0),
            coalesce(new.salaire_net_ref_monthly, 0), 'Salaire initial');
    return new;
  end if;
  if new.start_date < v_first then
    update public.hr_contract_salary_history set effective_from = new.start_date
    where contract_id = new.id and effective_from = v_first;
  end if;
  if tg_op = 'UPDATE'
     and (new.salaire_base_monthly, new.salaire_net_ref_monthly)
         is not distinct from (old.salaire_base_monthly, old.salaire_net_ref_monthly) then
    return new;
  end if;
  select id into v_id from public.hr_contract_salary_history
  where contract_id = new.id and effective_from <= greatest(current_date, new.start_date)
  order by effective_from desc limit 1;
  update public.hr_contract_salary_history
  set salaire_base_monthly = coalesce(new.salaire_base_monthly, 0),
      salaire_net_ref_monthly = coalesce(new.salaire_net_ref_monthly, 0)
  where id = v_id;
  return new;
end;
$$;

drop trigger if exists trg_hr_contract_salary_sync on public.hr_contracts;
create trigger trg_hr_contract_salary_sync
  after insert or update of salaire_base_monthly, salaire_net_ref_monthly, start_date on public.hr_contracts
  for each row execute function public.hr_contract_salary_sync();

-- Contract fields mirror the version in force today.
create or replace function public.hr_contract_salary_refresh_current(p_contract uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  h public.hr_contract_salary_history%rowtype;
begin
  select * into h from public.hr_contract_salary_history
  where contract_id = p_contract and effective_from <= current_date
  order by effective_from desc limit 1;
  if not found then
    return;
  end if;
  perform set_config('hr.salary_avenant', 'on', true);
  update public.hr_contracts
  set salaire_base_monthly = h.salaire_base_monthly,
      salaire_net_ref_monthly = h.salaire_net_ref_monthly
  where id = p_contract
    and (salaire_base_monthly, salaire_net_ref_monthly)
        is distinct from (h.salaire_base_monthly, h.salaire_net_ref_monthly);
  perform set_config('hr.salary_avenant', '', true);
end;
$$;

create or replace function public.hr_contract_salary_avenant(
  p_contract uuid,
  p_from date,
  p_base numeric,
  p_net numeric,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  c public.hr_contracts%rowtype;
  v_id uuid;
begin
  select * into c from public.hr_contracts where id = p_contract;
  if not found then
    raise exception 'Contrat introuvable.' using errcode = 'no_data_found';
  end if;
  if p_from < c.start_date or (c.end_date is not null and p_from > c.end_date) then
    raise exception 'La date d''effet doit être comprise dans la période du contrat.' using errcode = 'check_violation';
  end if;
  insert into public.hr_contract_salary_history
    (contract_id, effective_from, salaire_base_monthly, salaire_net_ref_monthly, reason)
  values (p_contract, p_from, p_base, coalesce(p_net, 0), p_reason)
  on conflict (contract_id, effective_from) do update set
    salaire_base_monthly = excluded.salaire_base_monthly,
    salaire_net_ref_monthly = excluded.salaire_net_ref_monthly,
    reason = excluded.reason
  returning id into v_id;
  perform public.hr_contract_salary_refresh_current(p_contract);
  return v_id;
end;
$$;

create or replace function public.hr_contract_salary_delete(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  h public.hr_contract_salary_history%rowtype;
begin
  select * into h from public.hr_contract_salary_history where id = p_id;
  if not found then
    raise exception 'Version introuvable.' using errcode = 'no_data_found';
  end if;
  if h.effective_from = (select min(effective_from) from public.hr_contract_salary_history where contract_id = h.contract_id) then
    raise exception 'Le salaire initial ne peut pas être supprimé.' using errcode = 'check_violation';
  end if;
  delete from public.hr_contract_salary_history where id = p_id;
  perform public.hr_contract_salary_refresh_current(h.contract_id);
end;
$$;

grant execute on function public.hr_contract_salary_refresh_current(uuid) to authenticated;
grant execute on function public.hr_contract_salary_avenant(uuid, date, numeric, numeric, text) to authenticated;
grant execute on function public.hr_contract_salary_delete(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Advances and loans
-- ---------------------------------------------------------------------------
create table if not exists public.hr_employee_advances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete restrict,
  kind text not null check (kind in ('ADVANCE', 'LOAN')),
  principal_amount numeric(14,2) not null check (principal_amount > 0),
  installment_amount numeric(14,2) not null check (installment_amount > 0),
  start_year integer not null check (start_year between 2000 and 2100),
  start_month integer not null check (start_month between 1 and 12),
  granted_on date not null default current_date,
  reason text not null check (char_length(btrim(reason)) >= 3),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CANCELLED')),
  created_by uuid references public.sys_users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (installment_amount <= principal_amount)
);

create index if not exists hr_employee_advances_emp_idx on public.hr_employee_advances (employee_id, status);

drop trigger if exists trg_hr_employee_advances_u on public.hr_employee_advances;
create trigger trg_hr_employee_advances_u before update on public.hr_employee_advances
  for each row execute function public.erp_set_updated_at();

drop trigger if exists trg_hr_employee_advances_audit on public.hr_employee_advances;
create trigger trg_hr_employee_advances_audit
  after insert or update or delete on public.hr_employee_advances
  for each row execute function public.sys_audit_row_change();

alter table public.hr_employee_advances enable row level security;

drop policy if exists hr_advances_read on public.hr_employee_advances;
create policy hr_advances_read on public.hr_employee_advances
  for select to authenticated using (public.erp_can_read_hr_salary());
drop policy if exists hr_advances_write on public.hr_employee_advances;
create policy hr_advances_write on public.hr_employee_advances
  for all to authenticated
  using (public.erp_can_write_hr_salary_values())
  with check (public.erp_can_write_hr_salary_values());

grant select, insert, update, delete on public.hr_employee_advances to authenticated;

alter table public.hr_payroll_slip_lines
  add column if not exists advance_id uuid references public.hr_employee_advances(id) on delete restrict;

create index if not exists hr_payroll_slip_lines_advance_idx
  on public.hr_payroll_slip_lines (advance_id) where advance_id is not null;

alter table public.hr_payroll_slip_lines drop constraint if exists hr_payroll_slip_lines_source_code_check;
alter table public.hr_payroll_slip_lines
  add constraint hr_payroll_slip_lines_source_code_check
  check (source_code in ('base', 'site', 'contract', 'employee', 'exception', 'advance', 'overtime'));

create or replace function public.hr_payroll_replace_slips(
  p_run_id uuid,
  p_slips jsonb,
  p_lines jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  n integer := 0;
begin
  if not exists (select 1 from public.hr_payroll_runs where id = p_run_id and status_code = 'DRAFT') then
    raise exception 'Paie introuvable ou non modifiable.' using errcode = 'check_violation';
  end if;

  delete from public.hr_payroll_slips s
  where s.run_id = p_run_id
    and s.status_code = 'DRAFT'
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_slips, '[]'::jsonb)) e
      where (e->>'employee_id')::uuid = s.employee_id
    );

  insert into public.hr_payroll_slips (
    run_id, employee_id, hr_contract_id, days_worked, days_paid, days_leave, days_absence,
    days_weekend, days_abandon, days_rappel, net_target, gross_amount, employee_ss, employer_ss,
    cacobatph, intemperies_employee, intemperies_employer, irg_base, irg_amount, net_payable,
    status_code, legal_snapshot
  )
  select p_run_id, r.employee_id, r.hr_contract_id,
         coalesce(r.days_worked, 0), coalesce(r.days_paid, 0), coalesce(r.days_leave, 0),
         coalesce(r.days_absence, 0), coalesce(r.days_weekend, 0), coalesce(r.days_abandon, 0),
         coalesce(r.days_rappel, 0), coalesce(r.net_target, 0), coalesce(r.gross_amount, 0),
         coalesce(r.employee_ss, 0), coalesce(r.employer_ss, 0), coalesce(r.cacobatph, 0),
         coalesce(r.intemperies_employee, 0), coalesce(r.intemperies_employer, 0),
         coalesce(r.irg_base, 0), coalesce(r.irg_amount, 0), coalesce(r.net_payable, 0),
         'DRAFT', r.legal_snapshot
  from jsonb_populate_recordset(null::public.hr_payroll_slips, coalesce(p_slips, '[]'::jsonb)) r
  on conflict (run_id, employee_id) do update set
    hr_contract_id = excluded.hr_contract_id,
    days_worked = excluded.days_worked,
    days_paid = excluded.days_paid,
    days_leave = excluded.days_leave,
    days_absence = excluded.days_absence,
    days_weekend = excluded.days_weekend,
    days_abandon = excluded.days_abandon,
    days_rappel = excluded.days_rappel,
    net_target = excluded.net_target,
    gross_amount = excluded.gross_amount,
    employee_ss = excluded.employee_ss,
    employer_ss = excluded.employer_ss,
    cacobatph = excluded.cacobatph,
    intemperies_employee = excluded.intemperies_employee,
    intemperies_employer = excluded.intemperies_employer,
    irg_base = excluded.irg_base,
    irg_amount = excluded.irg_amount,
    net_payable = excluded.net_payable,
    status_code = 'DRAFT',
    legal_snapshot = excluded.legal_snapshot;
  get diagnostics n = row_count;

  delete from public.hr_payroll_slip_lines l
  using public.hr_payroll_slips s
  where l.slip_id = s.id and s.run_id = p_run_id and s.status_code = 'DRAFT';

  insert into public.hr_payroll_slip_lines (
    slip_id, rubrique_id, exception_id, advance_id, source_code, code, label_ar, label_fr, category,
    nature, unit, cotisable, taxable, quantity, unit_amount, amount, sort_order
  )
  select s.id, r.rubrique_id, r.exception_id, r.advance_id, r.source_code, r.code, r.label_ar, r.label_fr,
         r.category, r.nature, r.unit, coalesce(r.cotisable, false), coalesce(r.taxable, false),
         coalesce(r.quantity, 1), coalesce(r.unit_amount, 0), coalesce(r.amount, 0),
         coalesce(r.sort_order, 0)
  from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb)) as r(
    employee_id uuid, rubrique_id uuid, exception_id uuid, advance_id uuid, source_code text, code text,
    label_ar text, label_fr text, category text, nature text, unit text, cotisable boolean,
    taxable boolean, quantity numeric, unit_amount numeric, amount numeric, sort_order integer
  )
  join public.hr_payroll_slips s on s.run_id = p_run_id and s.employee_id = r.employee_id;

  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Overtime: hours per month on the attendance sheet + legal rates
-- ---------------------------------------------------------------------------
insert into public.hr_attendance_columns
  (code, label_fr, label_ar, kind, source, value_type, catalog_kind, sort_order, is_system)
values
  ('HS50',  'HS 50 % (h)',  'ساعات إضافية 50%',  'INPUT', null, 'number', null, 330, true),
  ('HS75',  'HS 75 % (h)',  'ساعات إضافية 75%',  'INPUT', null, 'number', null, 331, true),
  ('HS100', 'HS 100 % (h)', 'ساعات إضافية 100%', 'INPUT', null, 'number', null, 332, true)
on conflict (code) do nothing;

insert into public.hr_attendance_column_roles (column_id, role_id, can_view, can_edit)
select c.id, r.id,
       r.code in ('ADMIN_RH', 'GERANT', 'CHEF_CHANTIER', 'ADMIN_FINANCE', 'READ_ONLY'),
       r.code in ('ADMIN_RH', 'GERANT', 'CHEF_CHANTIER')
from public.hr_attendance_columns c
cross join public.sys_roles r
where c.code in ('HS50', 'HS75', 'HS100') and r.code <> 'SUPER_ADMIN'
on conflict (column_id, role_id) do nothing;

insert into public.ref_global_vars (key, label_fr, label_ar, value_type, unit) values
  ('HEURES_MENSUELLES', 'Heures légales par mois (taux horaire = base / heures)', 'الساعات القانونية الشهرية', 'numeric', 'h'),
  ('HS_TAUX_50',  'Majoration HS 50 (0,50 = 50 %)',   'زيادة الساعات الإضافية 50',  'numeric', 'taux'),
  ('HS_TAUX_75',  'Majoration HS 75 (0,75 = 75 %)',   'زيادة الساعات الإضافية 75',  'numeric', 'taux'),
  ('HS_TAUX_100', 'Majoration HS 100 (1,00 = 100 %)', 'زيادة الساعات الإضافية 100', 'numeric', 'taux')
on conflict (key) do nothing;

insert into public.ref_global_var_versions (var_id, value_numeric, effective_from)
select v.id,
       case v.key
         when 'HEURES_MENSUELLES' then 173.33
         when 'HS_TAUX_50' then 0.5
         when 'HS_TAUX_75' then 0.75
         else 1
       end,
       date '2020-01-01'
from public.ref_global_vars v
where v.key in ('HEURES_MENSUELLES', 'HS_TAUX_50', 'HS_TAUX_75', 'HS_TAUX_100')
  and not exists (select 1 from public.ref_global_var_versions x where x.var_id = v.id);

commit;
