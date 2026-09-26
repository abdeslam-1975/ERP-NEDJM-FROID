alter table public.hr_payroll_slip_lines drop constraint if exists hr_payroll_slip_lines_source_code_check;
alter table public.hr_payroll_slip_lines
  add constraint hr_payroll_slip_lines_source_code_check
  check (source_code in ('base', 'site', 'contract', 'employee', 'poste', 'exception', 'advance', 'overtime', 'exit'));
