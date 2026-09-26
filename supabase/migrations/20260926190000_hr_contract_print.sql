-- Work contract printing: per-contract number + saved print values, and one editable template.

begin;

alter table public.hr_contracts
  add column if not exists contract_number text,
  add column if not exists print_data jsonb not null default '{}'::jsonb;

create unique index if not exists hr_contracts_number_uidx
  on public.hr_contracts (contract_number) where contract_number is not null;

-- Next free "YYYY/NNN" for the contract start year; keeps an existing number.
create or replace function public.hr_contract_assign_number(p_contract uuid)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_current text;
  v_year text;
  v_next integer;
begin
  select contract_number, extract(year from start_date)::int::text
    into v_current, v_year
  from public.hr_contracts where id = p_contract for update;
  if not found then
    raise exception 'Contrat introuvable.' using errcode = 'no_data_found';
  end if;
  if v_current is not null and btrim(v_current) <> '' then
    return v_current;
  end if;
  perform pg_advisory_xact_lock(hashtext('hr_contract_number_' || v_year));
  select coalesce(max(split_part(contract_number, '/', 2)::int), 0) + 1 into v_next
  from public.hr_contracts
  where split_part(contract_number, '/', 1) = v_year
    and split_part(contract_number, '/', 2) ~ '^\d{1,6}$';
  update public.hr_contracts
  set contract_number = v_year || '/' || lpad(v_next::text, 3, '0')
  where id = p_contract
  returning contract_number into v_current;
  if v_current is null then
    raise exception 'Numérotation refusée (droits).' using errcode = 'insufficient_privilege';
  end if;
  return v_current;
end;
$$;

revoke all on function public.hr_contract_assign_number(uuid) from public;
grant execute on function public.hr_contract_assign_number(uuid) to authenticated;

create table if not exists public.hr_contract_print_template (
  id text primary key default 'default' check (id = 'default'),
  content jsonb not null default '{}'::jsonb,
  updated_by uuid references public.sys_users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_hr_contract_print_template_u on public.hr_contract_print_template;
create trigger trg_hr_contract_print_template_u before update on public.hr_contract_print_template
  for each row execute function public.erp_set_updated_at();

drop trigger if exists trg_hr_contract_print_template_audit on public.hr_contract_print_template;
create trigger trg_hr_contract_print_template_audit
  after insert or update or delete on public.hr_contract_print_template
  for each row execute function public.sys_audit_row_change();

alter table public.hr_contract_print_template enable row level security;

drop policy if exists hr_contract_tpl_read on public.hr_contract_print_template;
create policy hr_contract_tpl_read on public.hr_contract_print_template
  for select to authenticated using (true);
drop policy if exists hr_contract_tpl_write on public.hr_contract_print_template;
create policy hr_contract_tpl_write on public.hr_contract_print_template
  for all to authenticated
  using (public.erp_can_write_hr_salary_values())
  with check (public.erp_can_write_hr_salary_values());

grant select, insert, update on public.hr_contract_print_template to authenticated;

commit;
