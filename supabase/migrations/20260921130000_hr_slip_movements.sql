alter table public.hr_payroll_slips
  add column if not exists days_leave numeric(8,3) not null default 0,
  add column if not exists days_absence numeric(8,3) not null default 0,
  add column if not exists days_weekend numeric(8,3) not null default 0,
  add column if not exists days_abandon numeric(8,3) not null default 0,
  add column if not exists days_rappel numeric(8,3) not null default 0;
