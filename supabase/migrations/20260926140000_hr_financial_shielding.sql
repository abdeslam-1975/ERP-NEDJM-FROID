-- Financial shielding for site chiefs, slip lifecycle hardening, legal snapshot per slip.
--  1. CHEF_CHANTIER loses every screen that exposes amounts (salaries, payroll, finance, client contracts).
--  2. Salary dictionary / values are no longer readable by every authenticated user.
--  3. Attendance roster comes from a salary-free function (names, poste, site only).
--  4. A slip status may only follow its run status (no single-slip lock inside a DRAFT run).
--  5. Each slip stores the legal rates used at generation time (reprint years later with same rates).

begin;

-- ---------------------------------------------------------------------------
-- 1. CHEF_CHANTIER: no access to amount-bearing screens
-- ---------------------------------------------------------------------------
update public.sys_permissions p set
  can_create = false,
  can_read = false,
  can_update = false,
  can_delete = false,
  can_print = false,
  can_export = false
from public.sys_roles r, public.sys_screens s
where p.role_id = r.id
  and p.screen_id = s.id
  and r.code = 'CHEF_CHANTIER'
  and s.code in (
    'contracts',
    'hr_payroll', 'hr_payroll_slips', 'hr_payroll_social', 'hr_payroll_tax',
    'hr_payroll_exceptions', 'hr_settings',
    'finance', 'finance_settings',
    'client_contracts', 'ref_contracts', 'adjustments',
    'purchases', 'purchase_settings'
  );

-- ---------------------------------------------------------------------------
-- 2. Salary dictionary + values: readers of salary screens only
-- ---------------------------------------------------------------------------
create or replace function public.erp_can_read_hr_salary(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.erp_is_super_admin(p_uid)
      or public.erp_has_perm('contracts', 'read'::public.rbac_action, null, p_uid)
      or public.erp_has_perm('hr_payroll', 'read'::public.rbac_action, null, p_uid)
      or public.erp_has_perm('hr_payroll_slips', 'read'::public.rbac_action, null, p_uid)
      or public.erp_has_perm('hr_payroll_exceptions', 'read'::public.rbac_action, null, p_uid)
      or public.erp_has_perm('hr_settings', 'read'::public.rbac_action, null, p_uid);
$$;

grant execute on function public.erp_can_read_hr_salary(uuid) to authenticated;

drop policy if exists hr_salary_rub_read on public.hr_salary_rubriques;
create policy hr_salary_rub_read on public.hr_salary_rubriques
  for select to authenticated using (public.erp_can_read_hr_salary());

drop policy if exists hr_salary_asg_read on public.hr_salary_assignments;
create policy hr_salary_asg_read on public.hr_salary_assignments
  for select to authenticated using (public.erp_can_read_hr_salary());

-- ---------------------------------------------------------------------------
-- 3. Salary-free attendance roster (site chiefs cannot read hr_contracts)
-- ---------------------------------------------------------------------------
create or replace function public.hr_attendance_roster()
returns table (
  employee_id uuid,
  matricule text,
  last_name text,
  first_name text,
  poste text,
  site_id uuid,
  site_name text,
  start_date date,
  status text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct on (c.employee_id, c.site_id)
    c.employee_id,
    e.matricule,
    e.last_name,
    e.first_name,
    coalesce(nullif(btrim(c.poste_fr), ''), nullif(btrim(c.poste_ar), ''), '') as poste,
    c.site_id,
    s.name_fr as site_name,
    c.start_date,
    c.status::text as status
  from public.hr_contracts c
  join public.hr_employees e on e.id = c.employee_id
  join public.ref_sites s on s.id = c.site_id
  where c.status::text <> 'ENDED'
    and public.erp_can_see_site(c.site_id)
    and public.erp_has_perm('hr_attendance', 'read'::public.rbac_action, c.site_id)
  order by c.employee_id, c.site_id, c.start_date desc;
$$;

revoke all on function public.hr_attendance_roster() from public;
grant execute on function public.hr_attendance_roster() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Slip status follows its run (DRAFT → VALIDATED → LOCKED via hr_payroll_run_transition)
-- ---------------------------------------------------------------------------
create or replace function public.hr_payroll_slip_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  run_status text;
begin
  if tg_op = 'INSERT' then
    select status_code into run_status from public.hr_payroll_runs where id = new.run_id;
    if run_status is distinct from 'DRAFT' then
      raise exception 'Paie % : ajout de bulletin impossible.', coalesce(run_status, '?')
        using errcode = 'check_violation';
    end if;
    if new.status_code is distinct from 'DRAFT' then
      raise exception 'Nouveau bulletin : statut DRAFT obligatoire.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status_code <> 'DRAFT' then
      raise exception 'Bulletin % : suppression impossible.', old.status_code
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if old.status_code = 'LOCKED' then
    raise exception 'Bulletin verrouillé : aucune modification possible.'
      using errcode = 'check_violation';
  end if;

  if new.status_code is distinct from old.status_code then
    select status_code into run_status from public.hr_payroll_runs where id = new.run_id;
    if new.status_code is distinct from run_status then
      raise exception 'Bulletin : le statut suit la paie du mois (% demandé, paie %).',
        new.status_code, coalesce(run_status, '?')
        using errcode = 'check_violation';
    end if;
  end if;

  if old.status_code = 'VALIDATED'
     and (to_jsonb(new) - 'status_code' - 'locked_at' - 'updated_at')
         is distinct from (to_jsonb(old) - 'status_code' - 'locked_at' - 'updated_at') then
    raise exception 'Bulletin validé : montants figés. Réouvrez la paie pour recalculer.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Legal snapshot stored on each slip at generation time
-- ---------------------------------------------------------------------------
alter table public.hr_payroll_slips
  add column if not exists legal_snapshot jsonb;

comment on column public.hr_payroll_slips.legal_snapshot is
  'Taux légaux (CNAS, FOS, CACOBATPH, intempéries, diviseur, SNMG, catégorie IRG) en vigueur pour la période, figés à la génération.';

commit;
