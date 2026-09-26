-- Unit 05: user-defined contributions (CNAS / CACOBATPH / taxes), safe dated edits of legal rates.

-- ---------------------------------------------------------------------------
-- 1. Contribution settings on legal variables (null contrib_part = plain parameter)
-- ---------------------------------------------------------------------------
alter table public.ref_global_vars
  add column if not exists contrib_part text,
  add column if not exists contrib_base text not null default 'COTISABLE',
  add column if not exists contrib_reduces_irg boolean not null default false,
  add column if not exists contrib_scope text not null default 'ALL',
  add column if not exists contrib_code text,
  add column if not exists sort_order integer not null default 0;

alter table public.ref_global_vars drop constraint if exists ref_global_vars_contrib_part_check;
alter table public.ref_global_vars
  add constraint ref_global_vars_contrib_part_check check (contrib_part in ('EMPLOYEE', 'EMPLOYER'));
alter table public.ref_global_vars drop constraint if exists ref_global_vars_contrib_base_check;
alter table public.ref_global_vars
  add constraint ref_global_vars_contrib_base_check check (contrib_base in ('COTISABLE', 'TAXABLE'));
alter table public.ref_global_vars drop constraint if exists ref_global_vars_contrib_scope_check;
alter table public.ref_global_vars
  add constraint ref_global_vars_contrib_scope_check
  check (contrib_scope in ('ALL', 'CACOBATPH_CONGES', 'CACOBATPH_INTEMPERIES'));
alter table public.ref_global_vars drop constraint if exists ref_global_vars_contrib_custom_check;
alter table public.ref_global_vars
  add constraint ref_global_vars_contrib_custom_check check (contrib_part is null or not is_system);
alter table public.ref_global_vars drop constraint if exists ref_global_vars_contrib_irg_check;
alter table public.ref_global_vars
  add constraint ref_global_vars_contrib_irg_check
  check (not contrib_reduces_irg or contrib_part = 'EMPLOYEE');

-- ---------------------------------------------------------------------------
-- 2. Unit 05 variables: fixed list + any CNAS_ / CACOBATPH_ / IRG_ key.
--    Keep in sync with isComplianceKey() in src/lib/hr/compliance-keys.ts.
-- ---------------------------------------------------------------------------
create or replace function public.erp_is_compliance_key(p_key text)
returns boolean
language sql
immutable
as $$
  select p_key ~ '^(CNAS|CACOBATPH|IRG)_[A-Z0-9_]+$'
      or p_key in (
        'NJM_DIVISEUR_FIXED', 'SNMG', 'HEURES_MENSUELLES',
        'HS_TAUX_50', 'HS_TAUX_75', 'HS_TAUX_100', 'CONGE_JOURS_MOIS'
      );
$$;

create or replace function public.erp_is_compliance_var(p_var_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.ref_global_vars v
    where v.id = p_var_id and public.erp_is_compliance_key(v.key)
  );
$$;

grant execute on function public.erp_is_compliance_key(text) to authenticated;
grant execute on function public.erp_is_compliance_var(uuid) to authenticated;

drop policy if exists ref_vars_compliance_insert on public.ref_global_vars;
create policy ref_vars_compliance_insert on public.ref_global_vars
  for insert to authenticated
  with check (
    public.erp_can_write_hr_compliance()
    and not is_system
    and key ~ '^(CNAS|CACOBATPH|IRG)_[A-Z0-9_]{2,40}$'
  );

drop policy if exists ref_vars_compliance_update on public.ref_global_vars;
create policy ref_vars_compliance_update on public.ref_global_vars
  for update to authenticated
  using (public.erp_can_write_hr_compliance() and not is_system and public.erp_is_compliance_key(key))
  with check (
    public.erp_can_write_hr_compliance()
    and not is_system
    and key ~ '^(CNAS|CACOBATPH|IRG)_[A-Z0-9_]{2,40}$'
  );

drop policy if exists ref_vars_compliance_delete on public.ref_global_vars;
create policy ref_vars_compliance_delete on public.ref_global_vars
  for delete to authenticated
  using (public.erp_can_write_hr_compliance() and not is_system and public.erp_is_compliance_key(key));

-- Planned (not yet effective) versions can be withdrawn; past versions stay as history.
drop policy if exists ref_varver_compliance_delete on public.ref_global_var_versions;
create policy ref_varver_compliance_delete on public.ref_global_var_versions
  for delete to authenticated
  using (
    public.erp_can_write_hr_compliance()
    and public.erp_is_compliance_var(var_id)
    and effective_from > current_date
  );

-- ---------------------------------------------------------------------------
-- 3. Dated value: replace same-day version, split the version in force, stop before the next one.
-- ---------------------------------------------------------------------------
create or replace function public.hr_set_legal_var_version(
  p_var_id uuid,
  p_from date,
  p_value numeric
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_same uuid;
  v_prev public.ref_global_var_versions%rowtype;
  v_next_from date;
  v_id uuid;
begin
  if not (public.erp_can_write_hr_compliance() and public.erp_is_compliance_var(p_var_id)) then
    raise exception 'Modification réservée à l''unité 05.' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_value is null then
    raise exception 'Date et valeur requises.' using errcode = 'check_violation';
  end if;

  select id into v_same
  from public.ref_global_var_versions
  where var_id = p_var_id and effective_from = p_from
  for update;
  if v_same is not null then
    update public.ref_global_var_versions
    set value_numeric = p_value, created_by = auth.uid()
    where id = v_same;
    return v_same;
  end if;

  select * into v_prev
  from public.ref_global_var_versions
  where var_id = p_var_id and effective_from < p_from
  order by effective_from desc
  limit 1
  for update;

  select min(effective_from) into v_next_from
  from public.ref_global_var_versions
  where var_id = p_var_id and effective_from > p_from;

  if v_prev.id is not null and (v_prev.effective_to is null or v_prev.effective_to >= p_from) then
    update public.ref_global_var_versions
    set effective_to = p_from - 1
    where id = v_prev.id;
  end if;

  insert into public.ref_global_var_versions (var_id, value_numeric, effective_from, effective_to, created_by)
  values (p_var_id, p_value, p_from, case when v_next_from is null then null else v_next_from - 1 end, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.hr_cancel_legal_var_version(p_version_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.ref_global_var_versions%rowtype;
  v_prev uuid;
  v_next_from date;
begin
  select * into v_row from public.ref_global_var_versions where id = p_version_id for update;
  if v_row.id is null then
    raise exception 'Version introuvable.' using errcode = 'no_data_found';
  end if;
  if not (public.erp_can_write_hr_compliance() and public.erp_is_compliance_var(v_row.var_id)) then
    raise exception 'Modification réservée à l''unité 05.' using errcode = 'insufficient_privilege';
  end if;
  if v_row.effective_from <= current_date then
    raise exception 'Seule une valeur programmée (date future) peut être annulée.' using errcode = 'check_violation';
  end if;

  delete from public.ref_global_var_versions where id = p_version_id;

  select id into v_prev
  from public.ref_global_var_versions
  where var_id = v_row.var_id and effective_from < v_row.effective_from
  order by effective_from desc
  limit 1;
  select min(effective_from) into v_next_from
  from public.ref_global_var_versions
  where var_id = v_row.var_id and effective_from > v_row.effective_from;

  if v_prev is not null then
    update public.ref_global_var_versions
    set effective_to = case when v_next_from is null then null else v_next_from - 1 end
    where id = v_prev;
  end if;
end;
$$;

grant execute on function public.hr_set_legal_var_version(uuid, date, numeric) to authenticated;
grant execute on function public.hr_cancel_legal_var_version(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Payslips: amounts of the user-defined contributions
-- ---------------------------------------------------------------------------
alter table public.hr_payroll_slips
  add column if not exists extra_employee numeric(14,2) not null default 0,
  add column if not exists extra_employer numeric(14,2) not null default 0,
  add column if not exists extra_contributions jsonb not null default '[]'::jsonb;

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
    cacobatph, intemperies_employee, intemperies_employer, extra_employee, extra_employer,
    extra_contributions, irg_base, irg_amount, net_payable, status_code, legal_snapshot
  )
  select p_run_id, r.employee_id, r.hr_contract_id,
         coalesce(r.days_worked, 0), coalesce(r.days_paid, 0), coalesce(r.days_leave, 0),
         coalesce(r.days_absence, 0), coalesce(r.days_weekend, 0), coalesce(r.days_abandon, 0),
         coalesce(r.days_rappel, 0), coalesce(r.net_target, 0), coalesce(r.gross_amount, 0),
         coalesce(r.employee_ss, 0), coalesce(r.employer_ss, 0), coalesce(r.cacobatph, 0),
         coalesce(r.intemperies_employee, 0), coalesce(r.intemperies_employer, 0),
         coalesce(r.extra_employee, 0), coalesce(r.extra_employer, 0),
         coalesce(r.extra_contributions, '[]'::jsonb),
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
    extra_employee = excluded.extra_employee,
    extra_employer = excluded.extra_employer,
    extra_contributions = excluded.extra_contributions,
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

grant execute on function public.hr_payroll_replace_slips(uuid, jsonb, jsonb) to authenticated;
