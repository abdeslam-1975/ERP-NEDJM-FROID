-- Phase 5: payroll accounting settings (SCF accounts per payroll component, journal code).
begin;

create table if not exists public.hr_accounting_settings (
  id smallint primary key default 1 check (id = 1),
  journal_code text not null default 'PAIE',
  accounts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.sys_users(id) default auth.uid()
);

insert into public.hr_accounting_settings (id) values (1) on conflict (id) do nothing;

alter table public.hr_accounting_settings enable row level security;

drop policy if exists hr_accounting_settings_read on public.hr_accounting_settings;
create policy hr_accounting_settings_read on public.hr_accounting_settings
  for select to authenticated using (public.erp_can_read_hr_salary());

drop policy if exists hr_accounting_settings_write on public.hr_accounting_settings;
create policy hr_accounting_settings_write on public.hr_accounting_settings
  for update to authenticated
  using (public.erp_is_super_admin() or exists (
    select 1 from public.sys_user_site_roles usr join public.sys_roles r on r.id = usr.role_id
    where usr.user_id = auth.uid() and r.code in ('ADMIN_FINANCE', 'GERANT') and r.is_active))
  with check (id = 1);

drop trigger if exists trg_hr_accounting_settings_updated on public.hr_accounting_settings;
create trigger trg_hr_accounting_settings_updated before update on public.hr_accounting_settings
  for each row execute function public.erp_set_updated_at();

drop trigger if exists trg_hr_accounting_settings_audit on public.hr_accounting_settings;
create trigger trg_hr_accounting_settings_audit after insert or update or delete on public.hr_accounting_settings
  for each row execute function public.sys_audit_row_change();

commit;
