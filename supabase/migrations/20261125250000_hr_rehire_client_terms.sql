-- Rehire: the employee keeps one matricule. Each new fiche gets the next reference.
-- A work contract can point at the client contract whose labor lines and clauses it applies.

begin;

alter table public.hr_employees
  add column if not exists fiche_reference text;

comment on column public.hr_employees.fiche_reference is
  'Current fiche reference (YYYY/NNN). The matricule stays the same across rehires.';

create unique index if not exists hr_employees_fiche_reference_uidx
  on public.hr_employees (fiche_reference)
  where fiche_reference is not null;

create table if not exists public.hr_fiche_issues (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  reference text not null unique,
  hired_at date,
  file_url text,
  storage_path text,
  file_name text,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists hr_fiche_issues_employee_idx
  on public.hr_fiche_issues (employee_id, is_current);

alter table public.hr_fiche_issues enable row level security;

drop policy if exists hr_fiche_issues_read on public.hr_fiche_issues;
create policy hr_fiche_issues_read on public.hr_fiche_issues
  for select to authenticated
  using (public.erp_has_perm('employees', 'read', null));

drop policy if exists hr_fiche_issues_write on public.hr_fiche_issues;
create policy hr_fiche_issues_write on public.hr_fiche_issues
  for all to authenticated
  using (public.erp_has_perm('employees', 'update', null))
  with check (public.erp_has_perm('employees', 'update', null));

grant select, insert, update, delete on public.hr_fiche_issues to authenticated;

-- Next YYYY/NNN. A reissue archives the current reference and assigns the next one.
create or replace function public.hr_fiche_assign_reference(
  p_employee uuid,
  p_hired date,
  p_reissue boolean
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_old text;
  v_old_hired date;
  v_year text;
  v_next integer;
  v_ref text;
begin
  select fiche_reference, hired_at
    into v_old, v_old_hired
  from public.hr_employees
  where id = p_employee
  for update;
  if not found then
    raise exception 'Employé introuvable.' using errcode = 'no_data_found';
  end if;
  if not p_reissue and v_old is not null and btrim(v_old) <> '' then
    return v_old;
  end if;

  if p_reissue and v_old is not null and btrim(v_old) <> '' then
    insert into public.hr_fiche_issues (
      employee_id, reference, hired_at, file_url, storage_path, file_name, is_current
    )
    select p_employee, v_old, v_old_hired, f.file_url, f.storage_path, f.file_name, false
    from public.hr_employee_files f
    where f.employee_id = p_employee
      and f.doc_type_code = 'FICHE_RENSEIGNEMENTS'
    on conflict (reference) do update
      set is_current = false,
          hired_at = excluded.hired_at,
          file_url = coalesce(excluded.file_url, public.hr_fiche_issues.file_url),
          storage_path = coalesce(excluded.storage_path, public.hr_fiche_issues.storage_path),
          file_name = coalesce(excluded.file_name, public.hr_fiche_issues.file_name);
    if not found then
      insert into public.hr_fiche_issues (employee_id, reference, hired_at, is_current)
      values (p_employee, v_old, v_old_hired, false)
      on conflict (reference) do update set is_current = false;
    end if;
  end if;

  v_year := extract(year from coalesce(p_hired, current_date))::int::text;
  perform pg_advisory_xact_lock(hashtext('hr_fiche_reference_' || v_year));
  select coalesce(max(n), 0) + 1 into v_next
  from (
    select split_part(reference, '/', 2)::int as n
    from public.hr_fiche_issues
    where split_part(reference, '/', 1) = v_year
      and split_part(reference, '/', 2) ~ '^\d{1,6}$'
    union all
    select split_part(fiche_reference, '/', 2)::int
    from public.hr_employees
    where split_part(fiche_reference, '/', 1) = v_year
      and split_part(fiche_reference, '/', 2) ~ '^\d{1,6}$'
  ) taken;
  v_ref := v_year || '/' || lpad(v_next::text, 3, '0');

  update public.hr_employees
  set fiche_reference = v_ref
  where id = p_employee;
  update public.hr_fiche_issues set is_current = false where employee_id = p_employee and is_current;
  insert into public.hr_fiche_issues (employee_id, reference, hired_at, is_current)
  values (p_employee, v_ref, p_hired, true);
  return v_ref;
end;
$$;

revoke all on function public.hr_fiche_assign_reference(uuid, date, boolean) from public;
grant execute on function public.hr_fiche_assign_reference(uuid, date, boolean) to authenticated;

alter table public.hr_contracts
  add column if not exists client_contract_id uuid references public.ref_contracts(id),
  add column if not exists client_terms jsonb;

comment on column public.hr_contracts.client_terms is
  'Poste, absence rule and confirmed clauses copied from the client contract.';

alter table public.hr_candidates
  add column if not exists client_contract_id uuid references public.ref_contracts(id),
  add column if not exists client_terms jsonb;

comment on column public.hr_candidates.client_terms is
  'Client-contract poste, absence rule and confirmed clauses printed on the candidate contract.';

-- HR can read the client contract of a site they already manage, so the work contract can apply it.
drop policy if exists ref_contracts_hr_read on public.ref_contracts;
create policy ref_contracts_hr_read on public.ref_contracts
  for select to authenticated
  using (
    public.erp_can_see_site(site_id)
    and (
      public.erp_has_perm('contracts', 'read', site_id)
      or public.erp_has_perm('employees', 'read', null)
      or public.erp_has_perm('hr_candidates', 'read', null)
    )
  );

drop policy if exists contract_items_hr_read on public.contract_items;
create policy contract_items_hr_read on public.contract_items
  for select to authenticated
  using (
    exists (
      select 1 from public.ref_contracts c
      where c.id = contract_id
        and public.erp_can_see_site(c.site_id)
        and (
          public.erp_has_perm('contracts', 'read', c.site_id)
          or public.erp_has_perm('employees', 'read', null)
          or public.erp_has_perm('hr_candidates', 'read', null)
        )
    )
  );

commit;
