-- Contract salary lines in two sections: WORK (days actually worked) and CRP (congé de récupération).
-- CRP lines are paid only for the CRP days of the month; WORK lines never count them as worked days.

begin;

alter table public.hr_salary_assignments
  add column if not exists period_scope text not null default 'WORK'
  check (period_scope in ('WORK', 'CRP'));

comment on column public.hr_salary_assignments.period_scope is
  'WORK = rubrique des jours travaillés ; CRP = rubrique payée sur les jours de récupération (عطلة تعويضية).';

drop index if exists public.hr_salary_asg_emp_uidx;
create unique index hr_salary_asg_emp_uidx
  on public.hr_salary_assignments (rubrique_id, employee_id, period_scope)
  where employee_id is not null;

drop index if exists public.hr_salary_asg_ctr_uidx;
create unique index hr_salary_asg_ctr_uidx
  on public.hr_salary_assignments (rubrique_id, contract_id, period_scope)
  where contract_id is not null;

create or replace function public.hr_salary_assignments_replace(p_contract_id uuid, p_employee_id uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_contract_id is null or p_employee_id is null or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Rubriques de salaire invalides.' using errcode = 'check_violation';
  end if;
  delete from public.hr_salary_assignments where contract_id = p_contract_id;
  delete from public.hr_salary_assignments where employee_id = p_employee_id;
  insert into public.hr_salary_assignments (rubrique_id, employee_id, site_id, contract_id, amount, unit, is_active, period_scope)
  select rubrique_id, employee_id, site_id, contract_id, amount, unit, is_active, coalesce(period_scope, 'WORK')
  from jsonb_populate_recordset(null::public.hr_salary_assignments, p_rows);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.hr_salary_assignments_replace(uuid, uuid, jsonb) from public, anon;
grant execute on function public.hr_salary_assignments_replace(uuid, uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
