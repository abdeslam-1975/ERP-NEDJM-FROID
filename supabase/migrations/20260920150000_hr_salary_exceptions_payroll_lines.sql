-- Exceptional salary rubriques + bulletin lines.
-- Dictionary remains SUPER_ADMIN. Values (contract/site/employee/exception) for ADMIN_RH.

begin;

insert into public.sys_screens (code, module, label_fr, path, sort_order)
values
  ('hr_payroll_exceptions', 'hr', 'Rubriques exceptionnelles', '/rh/paie/exceptions', 135)
on conflict (code) do update set
  module = excluded.module,
  label_fr = excluded.label_fr,
  path = excluded.path,
  sort_order = excluded.sort_order;

insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select r.id, s.id,
  case when r.code in ('SUPER_ADMIN','ADMIN_RH','GERANT') then true else false end,
  true,
  case when r.code in ('SUPER_ADMIN','ADMIN_RH','GERANT') then true else false end,
  case when r.code in ('SUPER_ADMIN','ADMIN_RH') then true else false end,
  true,
  true
from public.sys_roles r
cross join public.sys_screens s
where r.code in ('SUPER_ADMIN','ADMIN_RH','GERANT','ADMIN_FINANCE','CHEF_CHANTIER','READ_ONLY')
  and s.code = 'hr_payroll_exceptions'
on conflict (role_id, screen_id) do update set
  can_create = excluded.can_create,
  can_read = excluded.can_read,
  can_update = excluded.can_update,
  can_delete = excluded.can_delete,
  can_print = excluded.can_print,
  can_export = excluded.can_export;

create or replace function public.erp_can_write_hr_salary_values(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.erp_is_super_admin(p_uid)
      or public.erp_has_perm('contracts', 'update'::public.rbac_action, null, p_uid)
      or public.erp_has_perm('hr_payroll', 'update'::public.rbac_action, null, p_uid)
      or public.erp_has_perm('hr_payroll_exceptions', 'update'::public.rbac_action, null, p_uid);
$$;

grant execute on function public.erp_can_write_hr_salary_values(uuid) to authenticated;

drop policy if exists hr_salary_asg_write on public.hr_salary_assignments;
create policy hr_salary_asg_write on public.hr_salary_assignments
  for all to authenticated
  using (public.erp_can_write_hr_salary_values())
  with check (public.erp_can_write_hr_salary_values());

create table if not exists public.hr_salary_exceptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  rubrique_id uuid not null references public.hr_salary_rubriques(id) on delete restrict,
  amount numeric(14,2) not null default 0,
  period_year integer not null check (period_year between 2020 and 2100),
  period_month integer not null check (period_month between 1 and 12),
  duration_mode text not null default 'once'
    check (duration_mode in ('once', 'until')),
  until_year integer check (until_year is null or until_year between 2020 and 2100),
  until_month integer check (until_month is null or until_month between 1 and 12),
  reason text not null,
  status_code text not null default 'DRAFT'
    check (status_code in ('DRAFT', 'APPROVED', 'CANCELLED')),
  granted_by uuid references public.sys_users(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_salary_exc_reason_chk check (char_length(btrim(reason)) >= 8),
  constraint hr_salary_exc_until_chk check (
    (duration_mode = 'once' and until_year is null and until_month is null)
    or (
      duration_mode = 'until'
      and until_year is not null
      and until_month is not null
      and (until_year * 12 + until_month) >= (period_year * 12 + period_month)
    )
  )
);

create index if not exists hr_salary_exc_emp_idx
  on public.hr_salary_exceptions (employee_id, period_year, period_month);
create index if not exists hr_salary_exc_status_idx
  on public.hr_salary_exceptions (status_code)
  where is_active;

drop trigger if exists trg_hr_salary_exceptions_u on public.hr_salary_exceptions;
create trigger trg_hr_salary_exceptions_u before update on public.hr_salary_exceptions
  for each row execute function public.erp_set_updated_at();

alter table public.hr_salary_exceptions enable row level security;

drop policy if exists hr_salary_exc_read on public.hr_salary_exceptions;
create policy hr_salary_exc_read on public.hr_salary_exceptions
  for select to authenticated
  using (
    public.erp_has_perm('hr_payroll_exceptions', 'read', null)
    or public.erp_has_perm('hr_payroll', 'read', null)
  );
drop policy if exists hr_salary_exc_write on public.hr_salary_exceptions;
create policy hr_salary_exc_write on public.hr_salary_exceptions
  for all to authenticated
  using (public.erp_can_write_hr_salary_values())
  with check (public.erp_can_write_hr_salary_values());

grant select, insert, update, delete on public.hr_salary_exceptions to authenticated;

create table if not exists public.hr_payroll_slip_lines (
  id uuid primary key default gen_random_uuid(),
  slip_id uuid not null references public.hr_payroll_slips(id) on delete cascade,
  rubrique_id uuid references public.hr_salary_rubriques(id) on delete set null,
  exception_id uuid references public.hr_salary_exceptions(id) on delete set null,
  source_code text not null
    check (source_code in ('base', 'site', 'contract', 'employee', 'exception')),
  code text not null,
  label_ar text not null,
  label_fr text not null,
  category text not null,
  nature text not null,
  unit text not null,
  cotisable boolean not null default false,
  taxable boolean not null default false,
  quantity numeric(12,4) not null default 1,
  unit_amount numeric(14,4) not null default 0,
  amount numeric(14,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists hr_payroll_slip_lines_slip_idx
  on public.hr_payroll_slip_lines (slip_id, sort_order);

alter table public.hr_payroll_slip_lines enable row level security;

drop policy if exists hr_slip_line_read on public.hr_payroll_slip_lines;
create policy hr_slip_line_read on public.hr_payroll_slip_lines
  for select to authenticated
  using (public.erp_has_perm('hr_payroll_slips', 'read', null));
drop policy if exists hr_slip_line_write on public.hr_payroll_slip_lines;
create policy hr_slip_line_write on public.hr_payroll_slip_lines
  for all to authenticated
  using (public.erp_has_perm('hr_payroll_slips', 'update', null))
  with check (public.erp_has_perm('hr_payroll_slips', 'update', null));

grant select, insert, update, delete on public.hr_payroll_slip_lines to authenticated;

comment on table public.hr_salary_exceptions is
  'Primes / indemnités exceptionnelles liées à une période, avec motif obligatoire.';
comment on table public.hr_payroll_slip_lines is
  'Lignes de bulletin : base, chantier, contrat, employé, exception.';

commit;
