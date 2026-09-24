alter table public.hr_payroll_slips
  add column if not exists irg_base numeric(14,2) not null default 0,
  add column if not exists intemperies_employee numeric(14,2) not null default 0,
  add column if not exists intemperies_employer numeric(14,2) not null default 0;
