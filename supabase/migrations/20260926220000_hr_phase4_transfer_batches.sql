-- Phase 4: salary transfer batches (CCP / bank files) with a deposit log.
-- A slip can belong to only one live batch (no double payment); cancelling a batch frees its slips.
begin;

create table if not exists public.hr_payroll_transfer_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text not null unique,
  period_year int not null check (period_year between 2000 and 2100),
  period_month int not null check (period_month between 1 and 12),
  site_id uuid references public.ref_sites(id),
  mode text not null check (mode in ('CCP', 'BANK')),
  file_format text not null,
  file_name text not null,
  content text not null,
  sha256 text not null,
  line_count int not null check (line_count > 0),
  total_amount numeric(14, 2) not null check (total_amount > 0),
  debit_account text,
  value_date date,
  status_code text not null default 'GENERATED'
    check (status_code in ('GENERATED', 'DEPOSITED', 'EXECUTED', 'CANCELLED')),
  deposit_ref text,
  deposit_date date,
  deposited_by uuid references public.sys_users(id),
  executed_at timestamptz,
  cancelled_reason text,
  notes text,
  created_by uuid references public.sys_users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_payroll_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.hr_payroll_transfer_batches(id) on delete cascade,
  slip_id uuid not null references public.hr_payroll_slips(id),
  employee_id uuid not null references public.hr_employees(id),
  matricule text not null,
  employee_name text not null,
  account text not null,
  amount numeric(14, 2) not null check (amount > 0),
  is_live boolean not null default true
);

create index if not exists hr_payroll_transfer_lines_batch_idx on public.hr_payroll_transfer_lines(batch_id);
create unique index if not exists hr_payroll_transfer_lines_live_slip_uq
  on public.hr_payroll_transfer_lines(slip_id) where is_live;
create index if not exists hr_payroll_transfer_batches_period_idx
  on public.hr_payroll_transfer_batches(period_year, period_month);

alter table public.hr_payroll_transfer_batches enable row level security;
alter table public.hr_payroll_transfer_lines enable row level security;

drop policy if exists hr_transfer_batches_read on public.hr_payroll_transfer_batches;
create policy hr_transfer_batches_read on public.hr_payroll_transfer_batches
  for select to authenticated using (public.erp_can_read_hr_salary());
drop policy if exists hr_transfer_batches_write on public.hr_payroll_transfer_batches;
create policy hr_transfer_batches_write on public.hr_payroll_transfer_batches
  for all to authenticated
  using (public.erp_can_write_hr_salary_values(auth.uid()))
  with check (public.erp_can_write_hr_salary_values(auth.uid()));

drop policy if exists hr_transfer_lines_read on public.hr_payroll_transfer_lines;
create policy hr_transfer_lines_read on public.hr_payroll_transfer_lines
  for select to authenticated using (public.erp_can_read_hr_salary());
drop policy if exists hr_transfer_lines_write on public.hr_payroll_transfer_lines;
create policy hr_transfer_lines_write on public.hr_payroll_transfer_lines
  for insert to authenticated
  with check (public.erp_can_write_hr_salary_values(auth.uid()));

-- Only slips of a validated / closed payroll can be transferred.
create or replace function public.hr_transfer_line_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_batch text;
begin
  select status_code into v_status from public.hr_payroll_slips where id = new.slip_id;
  if v_status is null or v_status = 'DRAFT' then
    raise exception 'Bulletin non validé : virement impossible.' using errcode = 'check_violation';
  end if;
  select status_code into v_batch from public.hr_payroll_transfer_batches where id = new.batch_id;
  if v_batch <> 'GENERATED' then
    raise exception 'Lot % : lignes figées.', v_batch using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_transfer_line_guard on public.hr_payroll_transfer_lines;
create trigger trg_hr_transfer_line_guard before insert on public.hr_payroll_transfer_lines
  for each row execute function public.hr_transfer_line_guard();

-- File content is immutable; status moves GENERATED -> DEPOSITED -> EXECUTED, or -> CANCELLED before execution.
create or replace function public.hr_transfer_batch_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un lot de virement ne se supprime pas : annulez-le.' using errcode = 'check_violation';
  end if;
  if new.content is distinct from old.content or new.sha256 is distinct from old.sha256
     or new.total_amount is distinct from old.total_amount or new.line_count is distinct from old.line_count
     or new.mode is distinct from old.mode or new.batch_no is distinct from old.batch_no
     or new.period_year is distinct from old.period_year or new.period_month is distinct from old.period_month then
    raise exception 'Fichier de virement figé : annulez le lot et régénérez-le.' using errcode = 'check_violation';
  end if;
  if new.status_code is distinct from old.status_code then
    if not (
      (old.status_code = 'GENERATED' and new.status_code in ('DEPOSITED', 'CANCELLED'))
      or (old.status_code = 'DEPOSITED' and new.status_code in ('EXECUTED', 'CANCELLED', 'GENERATED'))
    ) then
      raise exception 'Transition % -> % interdite.', old.status_code, new.status_code using errcode = 'check_violation';
    end if;
    if new.status_code = 'DEPOSITED' then
      if coalesce(trim(new.deposit_ref), '') = '' then
        raise exception 'Référence de dépôt obligatoire.' using errcode = 'check_violation';
      end if;
      new.deposit_date := coalesce(new.deposit_date, current_date);
      new.deposited_by := coalesce(auth.uid(), new.deposited_by);
    end if;
    if new.status_code = 'GENERATED' then
      new.deposit_ref := null;
      new.deposit_date := null;
      new.deposited_by := null;
    end if;
    if new.status_code = 'EXECUTED' then
      new.executed_at := now();
    end if;
    if new.status_code = 'CANCELLED' and coalesce(trim(new.cancelled_reason), '') = '' then
      raise exception 'Motif d''annulation obligatoire.' using errcode = 'check_violation';
    end if;
  elsif old.status_code in ('EXECUTED', 'CANCELLED') and (to_jsonb(new) - 'updated_at' - 'notes') is distinct from (to_jsonb(old) - 'updated_at' - 'notes') then
    raise exception 'Lot % : modification impossible.', old.status_code using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_transfer_batch_guard on public.hr_payroll_transfer_batches;
create trigger trg_hr_transfer_batch_guard before update or delete on public.hr_payroll_transfer_batches
  for each row execute function public.hr_transfer_batch_guard();

create or replace function public.hr_transfer_batch_release()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status_code = 'CANCELLED' and old.status_code <> 'CANCELLED' then
    update public.hr_payroll_transfer_lines set is_live = false where batch_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_transfer_batch_release on public.hr_payroll_transfer_batches;
create trigger trg_hr_transfer_batch_release after update on public.hr_payroll_transfer_batches
  for each row execute function public.hr_transfer_batch_release();

-- Reopening a payroll must not change net amounts already sent to the bank / CCP.
create or replace function public.hr_slip_transfer_lock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status_code = 'DRAFT' and old.status_code <> 'DRAFT'
     and exists (select 1 from public.hr_payroll_transfer_lines l where l.slip_id = old.id and l.is_live) then
    raise exception 'Bulletin inclus dans un lot de virement : annulez le lot avant de réouvrir la paie.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_slip_transfer_lock on public.hr_payroll_slips;
create trigger trg_hr_slip_transfer_lock before update of status_code on public.hr_payroll_slips
  for each row execute function public.hr_slip_transfer_lock();

drop trigger if exists trg_hr_transfer_batches_updated on public.hr_payroll_transfer_batches;
create trigger trg_hr_transfer_batches_updated before update on public.hr_payroll_transfer_batches
  for each row execute function public.erp_set_updated_at();

drop trigger if exists trg_hr_transfer_batches_audit on public.hr_payroll_transfer_batches;
create trigger trg_hr_transfer_batches_audit after insert or update or delete on public.hr_payroll_transfer_batches
  for each row execute function public.sys_audit_row_change();

commit;
