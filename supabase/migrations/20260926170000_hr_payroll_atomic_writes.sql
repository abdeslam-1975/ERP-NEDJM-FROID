-- Atomic month writes: attendance replace and payroll slips/lines replace run in one
-- transaction each (a failed insert no longer leaves the month or slip lines erased).
-- security invoker: RLS and the period guards apply as for direct writes.

begin;

create or replace function public.hr_attendance_replace_month(
  p_site uuid,
  p_start date,
  p_end date,
  p_employee uuid,
  p_loaded_at timestamptz,
  p_rows jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  n integer := 0;
begin
  delete from public.hr_attendance a
  where a.site_id = p_site
    and a.work_date between p_start and p_end
    and (p_employee is null or a.employee_id = p_employee)
    and (p_loaded_at is null or a.status_code = 'VALIDATED' or a.updated_at <= p_loaded_at);

  insert into public.hr_attendance (
    employee_id, site_id, work_date, legend_code, source_code, correspondence_id,
    status_code, validated_at, validated_by
  )
  select r.employee_id, r.site_id, r.work_date, r.legend_code, r.source_code, r.correspondence_id,
         'VALIDATED', now(), auth.uid()
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(
    employee_id uuid, site_id uuid, work_date date, legend_code text, source_code text, correspondence_id uuid
  )
  where r.site_id = p_site and r.work_date between p_start and p_end
  on conflict (employee_id, site_id, work_date) do update set
    legend_code = excluded.legend_code,
    source_code = excluded.source_code,
    correspondence_id = excluded.correspondence_id,
    status_code = 'VALIDATED',
    validated_at = excluded.validated_at,
    validated_by = excluded.validated_by;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.hr_attendance_replace_month(uuid, date, date, uuid, timestamptz, jsonb) to authenticated;

-- p_slips: slip rows (one per employee); p_lines: lines carrying employee_id.
-- Draft slips of employees no longer eligible are removed.
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
    slip_id, rubrique_id, exception_id, source_code, code, label_ar, label_fr, category,
    nature, unit, cotisable, taxable, quantity, unit_amount, amount, sort_order
  )
  select s.id, r.rubrique_id, r.exception_id, r.source_code, r.code, r.label_ar, r.label_fr,
         r.category, r.nature, r.unit, coalesce(r.cotisable, false), coalesce(r.taxable, false),
         coalesce(r.quantity, 1), coalesce(r.unit_amount, 0), coalesce(r.amount, 0),
         coalesce(r.sort_order, 0)
  from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb)) as r(
    employee_id uuid, rubrique_id uuid, exception_id uuid, source_code text, code text,
    label_ar text, label_fr text, category text, nature text, unit text, cotisable boolean,
    taxable boolean, quantity numeric, unit_amount numeric, amount numeric, sort_order integer
  )
  join public.hr_payroll_slips s on s.run_id = p_run_id and s.employee_id = r.employee_id;

  return n;
end;
$$;

grant execute on function public.hr_payroll_replace_slips(uuid, jsonb, jsonb) to authenticated;

commit;
