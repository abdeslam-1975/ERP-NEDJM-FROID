-- Value mode « Mensuel ÷ jours du mois » (month_days): the monthly amount is spread over the days of
-- the payslip month and paid for the days worked (31 days worked out of 31 = the full amount).

begin;

alter table public.hr_salary_rubriques drop constraint if exists hr_salary_rubriques_unit_check;
alter table public.hr_salary_rubriques
  add constraint hr_salary_rubriques_unit_check
  check (unit in ('day', 'month', 'percent', 'presence_day', 'month_days'));

alter table public.hr_salary_assignments drop constraint if exists hr_salary_assignments_unit_check;
alter table public.hr_salary_assignments
  add constraint hr_salary_assignments_unit_check
  check (unit is null or unit in ('day', 'month', 'percent', 'presence_day', 'month_days'));

alter table public.hr_salary_exceptions drop constraint if exists hr_salary_exceptions_unit_check;
alter table public.hr_salary_exceptions
  add constraint hr_salary_exceptions_unit_check
  check (unit is null or unit in ('day', 'month', 'percent', 'presence_day', 'month_days'));

comment on column public.hr_salary_assignments.unit is
  'Override du mode: percent=نسبة, month=مبلغ /F, day=برام *J, presence_day=برام حضور, month_days=شهري ÷ أيام الشهر. Null = unité du dictionnaire.';
comment on column public.hr_salary_exceptions.unit is
  'Override du mode: percent=نسبة, month=مبلغ /F, day=برام *J, presence_day=برام حضور, month_days=شهري ÷ أيام الشهر. Null = unité du dictionnaire.';

commit;
