-- Value mode on each assignment/exception: percent (نسبة), month (مبلغ), day (برام *J).

begin;

alter table public.hr_salary_assignments
  add column if not exists unit text
  check (unit is null or unit in ('day', 'month', 'percent', 'presence_day'));

alter table public.hr_salary_exceptions
  add column if not exists unit text
  check (unit is null or unit in ('day', 'month', 'percent', 'presence_day'));

comment on column public.hr_salary_assignments.unit is
  'Override du mode: percent=نسبة, month=مبلغ /F, day=برام *J. Null = unité du dictionnaire.';
comment on column public.hr_salary_exceptions.unit is
  'Override du mode: percent=نسبة, month=مبلغ /F, day=برام *J. Null = unité du dictionnaire.';

commit;
