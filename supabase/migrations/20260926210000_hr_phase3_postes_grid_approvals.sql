-- Phase 3: posts reference + salary grid, poste-level pay items (inheritance
-- employee > contract > poste > site), exception approval workflow with audit and
-- protection of validated / closed payroll months.

begin;

-- ---------------------------------------------------------------------------
-- Posts and salary grid
-- ---------------------------------------------------------------------------
create table if not exists public.hr_postes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{2,20}$'),
  label_fr text not null check (char_length(btrim(label_fr)) >= 2),
  label_ar text,
  category text not null default 'EXECUTION'
    check (category in ('EXECUTION', 'MAITRISE', 'CADRE', 'DIRECTION')),
  qualification_code text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_salary_grid (
  id uuid primary key default gen_random_uuid(),
  poste_id uuid not null references public.hr_postes(id) on delete cascade,
  grade text not null default 'A' check (grade ~ '^[A-Z0-9]{1,6}$'),
  base_monthly numeric(14,2) not null check (base_monthly > 0),
  net_ref_monthly numeric(14,2) check (net_ref_monthly is null or net_ref_monthly > 0),
  effective_from date not null default current_date,
  notes text,
  created_by uuid references public.sys_users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (poste_id, grade, effective_from)
);

create index if not exists hr_salary_grid_lookup_idx
  on public.hr_salary_grid (poste_id, grade, effective_from desc);

alter table public.hr_contracts
  add column if not exists poste_id uuid references public.hr_postes(id) on delete set null,
  add column if not exists grade text;

drop trigger if exists trg_hr_postes_u on public.hr_postes;
create trigger trg_hr_postes_u before update on public.hr_postes
  for each row execute function public.erp_set_updated_at();
drop trigger if exists trg_hr_postes_audit on public.hr_postes;
create trigger trg_hr_postes_audit after insert or update or delete on public.hr_postes
  for each row execute function public.sys_audit_row_change();
drop trigger if exists trg_hr_salary_grid_audit on public.hr_salary_grid;
create trigger trg_hr_salary_grid_audit after insert or update or delete on public.hr_salary_grid
  for each row execute function public.sys_audit_row_change();

alter table public.hr_postes enable row level security;
drop policy if exists hr_postes_read on public.hr_postes;
create policy hr_postes_read on public.hr_postes for select to authenticated using (true);
drop policy if exists hr_postes_write on public.hr_postes;
create policy hr_postes_write on public.hr_postes
  for all to authenticated
  using (public.erp_can_write_hr_salary_values())
  with check (public.erp_can_write_hr_salary_values());
grant select, insert, update, delete on public.hr_postes to authenticated;

alter table public.hr_salary_grid enable row level security;
drop policy if exists hr_salary_grid_read on public.hr_salary_grid;
create policy hr_salary_grid_read on public.hr_salary_grid
  for select to authenticated using (public.erp_can_read_hr_salary());
drop policy if exists hr_salary_grid_write on public.hr_salary_grid;
create policy hr_salary_grid_write on public.hr_salary_grid
  for all to authenticated
  using (public.erp_can_write_hr_salary_values())
  with check (public.erp_can_write_hr_salary_values());
grant select, insert, update, delete on public.hr_salary_grid to authenticated;

-- ---------------------------------------------------------------------------
-- Poste-level pay items
-- ---------------------------------------------------------------------------
alter table public.hr_salary_assignments
  add column if not exists poste_id uuid references public.hr_postes(id) on delete cascade;
alter table public.hr_salary_assignments drop constraint if exists hr_salary_asg_one_target;
alter table public.hr_salary_assignments
  add constraint hr_salary_asg_one_target check (
    (employee_id is not null)::int
    + (site_id is not null)::int
    + (contract_id is not null)::int
    + (poste_id is not null)::int
    = 1
  );
create unique index if not exists hr_salary_asg_poste_uidx
  on public.hr_salary_assignments (rubrique_id, poste_id)
  where poste_id is not null;

alter table public.hr_salary_rubriques drop constraint if exists hr_salary_rubriques_apply_scope_check;
alter table public.hr_salary_rubriques
  add constraint hr_salary_rubriques_apply_scope_check
  check (apply_scope in ('employee', 'site', 'contract', 'poste'));

drop trigger if exists trg_hr_salary_assignments_audit on public.hr_salary_assignments;
create trigger trg_hr_salary_assignments_audit after insert or update or delete on public.hr_salary_assignments
  for each row execute function public.sys_audit_row_change();

-- ---------------------------------------------------------------------------
-- Exceptions: creation (DRAFT) separated from approval (RPC), audit, frozen months
-- ---------------------------------------------------------------------------
alter table public.hr_salary_exceptions
  add column if not exists created_by uuid references public.sys_users(id) default auth.uid(),
  add column if not exists approved_by uuid references public.sys_users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists decided_note text;

update public.hr_salary_exceptions
set created_by = coalesce(created_by, granted_by),
    approved_by = case when status_code = 'APPROVED' then coalesce(approved_by, granted_by) else approved_by end,
    approved_at = case when status_code = 'APPROVED' then coalesce(approved_at, updated_at) else approved_at end;

-- Last month (y*12+m) in [p_from, p_to] already on a validated / closed slip of the employee.
create or replace function public.hr_employee_last_frozen_month(p_employee uuid, p_from int, p_to int)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select max(r.period_year * 12 + r.period_month)
  from public.hr_payroll_slips s
  join public.hr_payroll_runs r on r.id = s.run_id
  where s.employee_id = p_employee
    and s.status_code <> 'DRAFT'
    and (r.period_year * 12 + r.period_month) between p_from and p_to;
$$;

create or replace function public.hr_salary_exception_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  via_rpc boolean := coalesce(current_setting('hr.exception_decide', true), '') = 'on';
  frozen int;
begin
  if tg_op = 'DELETE' then
    if old.status_code <> 'DRAFT' then
      raise exception 'Seule une exception en brouillon peut être supprimée ; annulez-la.' using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if not via_rpc then
      new.status_code := 'DRAFT';
      new.approved_by := null;
      new.approved_at := null;
      new.created_by := coalesce(auth.uid(), new.created_by);
    end if;
  else
    if not via_rpc then
      if new.status_code is distinct from old.status_code
         or new.approved_by is distinct from old.approved_by
         or new.approved_at is distinct from old.approved_at then
        raise exception 'Approbation / annulation : passer par le circuit de validation.' using errcode = 'check_violation';
      end if;
      if old.status_code <> 'DRAFT'
         and (to_jsonb(new) - 'updated_at' - 'is_active') is distinct from (to_jsonb(old) - 'updated_at' - 'is_active') then
        raise exception 'Exception % : modification impossible, annulez-la puis recréez-la.', old.status_code
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if new.status_code in ('DRAFT', 'APPROVED') and (tg_op = 'INSERT' or new.status_code = 'DRAFT' or old.status_code = 'DRAFT') then
    frozen := public.hr_employee_last_frozen_month(
      new.employee_id,
      new.period_year * 12 + new.period_month,
      case when new.duration_mode = 'until' then new.until_year * 12 + new.until_month
           else new.period_year * 12 + new.period_month end
    );
    if frozen is not null then
      raise exception 'Mois %/% déjà validé ou clôturé pour cet employé : choisissez un mois ouvert (rappel).',
        lpad(((frozen - 1) % 12 + 1)::text, 2, '0'), (frozen - 1) / 12
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_salary_exception_guard on public.hr_salary_exceptions;
create trigger trg_hr_salary_exception_guard
  before insert or update or delete on public.hr_salary_exceptions
  for each row execute function public.hr_salary_exception_guard();

drop trigger if exists trg_hr_salary_exceptions_audit on public.hr_salary_exceptions;
create trigger trg_hr_salary_exceptions_audit after insert or update or delete on public.hr_salary_exceptions
  for each row execute function public.sys_audit_row_change();

-- Approve / reject (back to cancelled) / cancel. The creator cannot approve their own
-- exception unless SUPER_ADMIN or GERANT. Cancelling an exception already paid on a
-- frozen month shortens it instead (history kept).
create or replace function public.hr_salary_exception_decide(p_id uuid, p_status text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  x public.hr_salary_exceptions%rowtype;
  v_uid uuid := auth.uid();
  first_m int;
  last_m int;
  frozen int;
  is_boss boolean;
begin
  if not public.erp_can_write_hr_salary_values(v_uid) then
    raise exception 'Réservé aux responsables de la paie.' using errcode = 'insufficient_privilege';
  end if;
  select * into x from public.hr_salary_exceptions where id = p_id for update;
  if not found then
    raise exception 'Exception introuvable.' using errcode = 'no_data_found';
  end if;
  perform set_config('hr.exception_decide', 'on', true);

  if p_status = 'APPROVED' then
    if x.status_code <> 'DRAFT' then
      raise exception 'Seul un brouillon peut être approuvé (statut %).', x.status_code using errcode = 'check_violation';
    end if;
    is_boss := public.erp_is_super_admin(v_uid) or exists (
      select 1 from public.sys_user_site_roles usr join public.sys_roles r on r.id = usr.role_id
      where usr.user_id = v_uid and r.code = 'GERANT' and r.is_active
    );
    if x.created_by = v_uid and not is_boss then
      raise exception 'Double validation : l''exception doit être approuvée par une autre personne (Gérant ou autre responsable).'
        using errcode = 'insufficient_privilege';
    end if;
    update public.hr_salary_exceptions
    set status_code = 'APPROVED', approved_by = v_uid, approved_at = now(), granted_by = v_uid, decided_note = p_note
    where id = p_id;
    perform set_config('hr.exception_decide', '', true);
    return 'APPROVED';
  end if;

  if p_status = 'CANCELLED' then
    if x.status_code = 'CANCELLED' then
      raise exception 'Déjà annulée.' using errcode = 'check_violation';
    end if;
    first_m := x.period_year * 12 + x.period_month;
    last_m := case when x.duration_mode = 'until' then x.until_year * 12 + x.until_month else first_m end;
    frozen := case when x.status_code = 'APPROVED'
      then public.hr_employee_last_frozen_month(x.employee_id, first_m, last_m) end;
    if frozen is not null then
      if frozen >= last_m then
        raise exception 'Exception déjà payée sur une paie validée / clôturée : corrigez par une retenue ou un rappel.'
          using errcode = 'check_violation';
      end if;
      update public.hr_salary_exceptions
      set duration_mode = 'until',
          until_year = (frozen - 1) / 12,
          until_month = (frozen - 1) % 12 + 1,
          decided_note = coalesce(p_note, 'Arrêtée après le dernier mois figé')
      where id = p_id;
      perform set_config('hr.exception_decide', '', true);
      return 'SHORTENED';
    end if;
    update public.hr_salary_exceptions
    set status_code = 'CANCELLED', decided_note = p_note
    where id = p_id;
    perform set_config('hr.exception_decide', '', true);
    return 'CANCELLED';
  end if;

  raise exception 'Statut % invalide.', p_status using errcode = 'check_violation';
end;
$$;

revoke all on function public.hr_salary_exception_decide(uuid, text, text) from public;
grant execute on function public.hr_salary_exception_decide(uuid, text, text) to authenticated;
revoke all on function public.hr_employee_last_frozen_month(uuid, int, int) from public;
grant execute on function public.hr_employee_last_frozen_month(uuid, int, int) to authenticated;

commit;
