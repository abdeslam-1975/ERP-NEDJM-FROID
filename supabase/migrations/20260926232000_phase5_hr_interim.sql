-- Phase 5: interim labour. Agency workers get an INTERIM contract (attendance roster, no payroll)
-- and are billed monthly from validated attendance through frozen statements.
begin;

create table if not exists public.hr_interim_agencies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{2,20}$'),
  name text not null,
  nif text,
  nis text,
  rc text,
  address text,
  phone text,
  email text,
  contact_name text,
  default_daily_rate numeric(12, 2) not null default 0 check (default_daily_rate >= 0),
  markup_pct numeric(6, 2) not null default 0 check (markup_pct between 0 and 100),
  vat_pct numeric(5, 2) not null default 19 check (vat_pct between 0 and 100),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hr_contracts
  add column if not exists agency_id uuid references public.hr_interim_agencies(id),
  add column if not exists interim_daily_rate numeric(12, 2) check (interim_daily_rate is null or interim_daily_rate >= 0);

alter table public.hr_contracts drop constraint if exists hr_contracts_interim_agency_chk;
alter table public.hr_contracts add constraint hr_contracts_interim_agency_chk
  check (coalesce(contract_type_code, '') <> 'INTERIM' or agency_id is not null);

insert into public.hr_catalogs (kind, code, label_fr, label_ar, extra, sort_order, is_active)
select 'contract_type', 'INTERIM', 'Intérim (mise à disposition)', 'عمل مؤقت (وكالة)', '{"interim": true}'::jsonb, 90, true
where not exists (select 1 from public.hr_catalogs where kind = 'contract_type' and code = 'INTERIM');

create table if not exists public.hr_interim_statements (
  id uuid primary key default gen_random_uuid(),
  statement_no text not null unique,
  agency_id uuid not null references public.hr_interim_agencies(id),
  period_year int not null check (period_year between 2000 and 2100),
  period_month int not null check (period_month between 1 and 12),
  site_id uuid references public.ref_sites(id),
  lines jsonb not null,
  days_total numeric(10, 2) not null,
  amount_ht numeric(14, 2) not null check (amount_ht >= 0),
  markup_pct numeric(6, 2) not null,
  vat_pct numeric(5, 2) not null,
  amount_vat numeric(14, 2) not null,
  amount_ttc numeric(14, 2) not null,
  status_code text not null default 'ISSUED' check (status_code in ('ISSUED', 'RECONCILED', 'CANCELLED')),
  agency_invoice_ref text,
  agency_invoice_amount numeric(14, 2),
  reconciled_at timestamptz,
  cancelled_reason text,
  created_by uuid references public.sys_users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists hr_interim_statements_live_uq
  on public.hr_interim_statements (agency_id, period_year, period_month, coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status_code <> 'CANCELLED';

create or replace function public.hr_interim_statement_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Relevé d''intérim : suppression impossible, annulez-le.' using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - 'status_code' - 'agency_invoice_ref' - 'agency_invoice_amount' - 'reconciled_at' - 'cancelled_reason' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'status_code' - 'agency_invoice_ref' - 'agency_invoice_amount' - 'reconciled_at' - 'cancelled_reason' - 'updated_at') then
    raise exception 'Relevé figé : annulez-le puis régénérez-le.' using errcode = 'check_violation';
  end if;
  if new.status_code is distinct from old.status_code then
    if not ((old.status_code = 'ISSUED' and new.status_code in ('RECONCILED', 'CANCELLED'))
            or (old.status_code = 'RECONCILED' and new.status_code = 'ISSUED')) then
      raise exception 'Transition % -> % interdite.', old.status_code, new.status_code using errcode = 'check_violation';
    end if;
    if new.status_code = 'RECONCILED' then
      if coalesce(trim(new.agency_invoice_ref), '') = '' then
        raise exception 'Référence de la facture de l''agence obligatoire.' using errcode = 'check_violation';
      end if;
      new.reconciled_at := now();
    elsif new.status_code = 'ISSUED' then
      new.reconciled_at := null;
    elsif coalesce(trim(new.cancelled_reason), '') = '' then
      raise exception 'Motif d''annulation obligatoire.' using errcode = 'check_violation';
    end if;
  elsif old.status_code = 'CANCELLED' then
    raise exception 'Relevé annulé : modification impossible.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_interim_statement_guard on public.hr_interim_statements;
create trigger trg_hr_interim_statement_guard before update or delete on public.hr_interim_statements
  for each row execute function public.hr_interim_statement_guard();

alter table public.hr_interim_agencies enable row level security;
alter table public.hr_interim_statements enable row level security;

drop policy if exists hr_interim_agencies_read on public.hr_interim_agencies;
create policy hr_interim_agencies_read on public.hr_interim_agencies
  for select to authenticated using (exists (select 1 from public.sys_users u where u.id = auth.uid()));
drop policy if exists hr_interim_agencies_write on public.hr_interim_agencies;
create policy hr_interim_agencies_write on public.hr_interim_agencies
  for all to authenticated
  using (public.erp_can_write_hr_salary_values(auth.uid()))
  with check (public.erp_can_write_hr_salary_values(auth.uid()));

drop policy if exists hr_interim_statements_read on public.hr_interim_statements;
create policy hr_interim_statements_read on public.hr_interim_statements
  for select to authenticated using (public.erp_can_read_hr_salary());
drop policy if exists hr_interim_statements_write on public.hr_interim_statements;
create policy hr_interim_statements_write on public.hr_interim_statements
  for all to authenticated
  using (public.erp_can_write_hr_salary_values(auth.uid()))
  with check (public.erp_can_write_hr_salary_values(auth.uid()));

drop trigger if exists trg_hr_interim_agencies_updated on public.hr_interim_agencies;
create trigger trg_hr_interim_agencies_updated before update on public.hr_interim_agencies
  for each row execute function public.erp_set_updated_at();
drop trigger if exists trg_hr_interim_statements_updated on public.hr_interim_statements;
create trigger trg_hr_interim_statements_updated before update on public.hr_interim_statements
  for each row execute function public.erp_set_updated_at();
drop trigger if exists trg_hr_interim_agencies_audit on public.hr_interim_agencies;
create trigger trg_hr_interim_agencies_audit after insert or update or delete on public.hr_interim_agencies
  for each row execute function public.sys_audit_row_change();
drop trigger if exists trg_hr_interim_statements_audit on public.hr_interim_statements;
create trigger trg_hr_interim_statements_audit after insert or update or delete on public.hr_interim_statements
  for each row execute function public.sys_audit_row_change();

commit;
