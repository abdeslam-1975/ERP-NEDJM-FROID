-- Days pointed per legend code (CA, CRP, CM, CSS, AN…) frozen on each slip, so the payslip
-- "Mouvements du Mois" block can show every code separately. Slips generated before this
-- column are counted from the validated pointage when they are loaded.

begin;

alter table public.hr_payroll_slips
  add column if not exists days_by_code jsonb not null default '{}'::jsonb;

comment on column public.hr_payroll_slips.days_by_code is
  'Jours pointés par code de légende (code en majuscules → nombre de jours).';

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
    days_weekend, days_abandon, days_rappel, days_by_code, net_target, gross_amount, employee_ss, employer_ss,
    cacobatph, intemperies_employee, intemperies_employer, extra_employee, extra_employer,
    extra_contributions, irg_base, irg_amount, net_payable, status_code, legal_snapshot
  )
  select p_run_id, r.employee_id, r.hr_contract_id,
         coalesce(r.days_worked, 0), coalesce(r.days_paid, 0), coalesce(r.days_leave, 0),
         coalesce(r.days_absence, 0), coalesce(r.days_weekend, 0), coalesce(r.days_abandon, 0),
         coalesce(r.days_rappel, 0), coalesce(r.days_by_code, '{}'::jsonb),
         coalesce(r.net_target, 0), coalesce(r.gross_amount, 0),
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
    days_by_code = excluded.days_by_code,
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

commit;
