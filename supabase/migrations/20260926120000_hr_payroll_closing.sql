-- Payroll month workflow: DRAFT → VALIDATED → LOCKED (clôture).
-- A validated month freezes validated attendance and slip amounts (reopen allowed);
-- a closed month is immutable (corrections go to a later month as rappel).

begin;

alter table public.hr_payroll_runs
  add column if not exists validated_at timestamptz,
  add column if not exists validated_by uuid references public.sys_users(id),
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by uuid references public.sys_users(id);

alter table public.hr_payroll_runs drop constraint if exists hr_payroll_runs_status_chk;
alter table public.hr_payroll_runs
  add constraint hr_payroll_runs_status_chk check (status_code in ('DRAFT', 'VALIDATED', 'LOCKED'));

alter table public.hr_payroll_slips drop constraint if exists hr_payroll_slips_status_chk;
alter table public.hr_payroll_slips
  add constraint hr_payroll_slips_status_chk check (status_code in ('DRAFT', 'VALIDATED', 'LOCKED'));

-- NULL site_id runs (company-wide) must stay unique per period too.
create unique index if not exists hr_payroll_runs_period_nosite_uidx
  on public.hr_payroll_runs (period_year, period_month)
  where site_id is null;

-- ---------------------------------------------------------------------------
-- Period status (most restrictive run covering the site/month, incl. company-wide runs)
-- security definer: attendance writers (chef de chantier) may not read payroll runs.
-- ---------------------------------------------------------------------------
create or replace function public.hr_payroll_period_status(p_site uuid, p_date date)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when bool_or(r.status_code = 'LOCKED') then 'LOCKED'
    when bool_or(r.status_code = 'VALIDATED') then 'VALIDATED'
    else null
  end
  from public.hr_payroll_runs r
  where r.period_year = extract(year from p_date)::int
    and r.period_month = extract(month from p_date)::int
    and (r.site_id = p_site or r.site_id is null);
$$;

grant execute on function public.hr_payroll_period_status(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Runs: allowed transitions, no delete once validated
-- ---------------------------------------------------------------------------
create or replace function public.hr_payroll_run_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.status_code <> 'DRAFT' then
      raise exception 'Paie % : suppression impossible (validée ou clôturée).', old.status_code
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if old.status_code = 'LOCKED' then
    raise exception 'Paie clôturée : aucune modification possible.'
      using errcode = 'check_violation';
  end if;

  if new.status_code is distinct from old.status_code
     and not (
       (old.status_code = 'DRAFT' and new.status_code = 'VALIDATED')
       or (old.status_code = 'VALIDATED' and new.status_code in ('DRAFT', 'LOCKED'))
     ) then
    raise exception 'Transition de paie refusée : % → %.', old.status_code, new.status_code
      using errcode = 'check_violation';
  end if;

  if old.status_code = 'VALIDATED'
     and new.status_code = 'VALIDATED'
     and (new.period_year, new.period_month, new.site_id)
         is distinct from (old.period_year, old.period_month, old.site_id) then
    raise exception 'Paie validée : période et chantier figés.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_hr_payroll_run_guard on public.hr_payroll_runs;
create trigger trg_hr_payroll_run_guard
  before update or delete on public.hr_payroll_runs
  for each row execute function public.hr_payroll_run_guard();

-- ---------------------------------------------------------------------------
-- Slips: amounts frozen once validated; locked slips immutable;
-- no new slip in a validated/closed run.
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

  if old.status_code = 'VALIDATED'
     and (to_jsonb(new) - 'status_code' - 'locked_at' - 'updated_at')
         is distinct from (to_jsonb(old) - 'status_code' - 'locked_at' - 'updated_at') then
    raise exception 'Bulletin validé : montants figés. Réouvrez la paie pour recalculer.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_hr_payroll_slip_guard on public.hr_payroll_slips;
create trigger trg_hr_payroll_slip_guard
  before insert or update or delete on public.hr_payroll_slips
  for each row execute function public.hr_payroll_slip_guard();

-- Lines follow their slip. During a cascade delete the parent row is already gone (allowed).
create or replace function public.hr_payroll_slip_line_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  slip_status text;
begin
  select status_code into slip_status
  from public.hr_payroll_slips
  where id = coalesce(new.slip_id, old.slip_id);
  if slip_status is not null and slip_status <> 'DRAFT' then
    raise exception 'Bulletin % : lignes figées.', slip_status
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_hr_payroll_slip_line_guard on public.hr_payroll_slip_lines;
create trigger trg_hr_payroll_slip_line_guard
  before insert or update or delete on public.hr_payroll_slip_lines
  for each row execute function public.hr_payroll_slip_line_guard();

-- ---------------------------------------------------------------------------
-- Attendance: closed month fully frozen; validated month freezes VALIDATED cells
-- (PROPOSED cells from new ordres de mission stay allowed).
-- ---------------------------------------------------------------------------
create or replace function public.hr_attendance_period_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  st text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    st := public.hr_payroll_period_status(old.site_id, old.work_date);
    if st = 'LOCKED' or (st = 'VALIDATED' and old.status_code = 'VALIDATED') then
      raise exception 'Pointage figé du % : paie %.', old.work_date, st
        using errcode = 'check_violation';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    st := public.hr_payroll_period_status(new.site_id, new.work_date);
    if st = 'LOCKED' or (st = 'VALIDATED' and new.status_code = 'VALIDATED') then
      raise exception 'Pointage figé du % : paie %.', new.work_date, st
        using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_hr_attendance_period_guard on public.hr_attendance;
create trigger trg_hr_attendance_period_guard
  before insert or update or delete on public.hr_attendance
  for each row execute function public.hr_attendance_period_guard();

-- ---------------------------------------------------------------------------
-- Atomic run transition (run + slips in one transaction). security invoker: RLS applies.
-- ---------------------------------------------------------------------------
create or replace function public.hr_payroll_run_transition(p_run_id uuid, p_action text)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  r public.hr_payroll_runs%rowtype;
  target text;
  n integer;
  expected integer;
  period_start date;
  period_end date;
begin
  select * into r from public.hr_payroll_runs where id = p_run_id for update;
  if not found then
    raise exception 'Paie introuvable.' using errcode = 'no_data_found';
  end if;

  target := case
    when p_action = 'validate' and r.status_code = 'DRAFT' then 'VALIDATED'
    when p_action = 'reopen' and r.status_code = 'VALIDATED' then 'DRAFT'
    when p_action = 'close' and r.status_code = 'VALIDATED' then 'LOCKED'
  end;
  if target is null then
    raise exception 'Transition de paie refusée : % depuis %.', p_action, r.status_code
      using errcode = 'check_violation';
  end if;

  if p_action = 'validate' then
    select count(*) into n from public.hr_payroll_slips where run_id = r.id;
    if n = 0 then
      raise exception 'Aucun bulletin à valider : générez la paie d''abord.'
        using errcode = 'check_violation';
    end if;
    period_start := make_date(r.period_year, r.period_month, 1);
    period_end := (period_start + interval '1 month' - interval '1 day')::date;
    select count(*) into n
    from public.hr_attendance a
    where a.status_code = 'PROPOSED'
      and a.work_date between period_start and period_end
      and (r.site_id is null or a.site_id = r.site_id);
    if n > 0 then
      raise exception '% jour(s) proposé(s) (ordres de mission) non validé(s) dans le pointage.', n
        using errcode = 'check_violation';
    end if;
  end if;

  update public.hr_payroll_runs set
    status_code = target,
    validated_at = case target when 'VALIDATED' then now() when 'DRAFT' then null else validated_at end,
    validated_by = case target when 'VALIDATED' then auth.uid() when 'DRAFT' then null else validated_by end,
    locked_at = case when target = 'LOCKED' then now() else locked_at end,
    locked_by = case when target = 'LOCKED' then auth.uid() else locked_by end
  where id = r.id;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Accès refusé à cette paie.' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into expected
  from public.hr_payroll_slips
  where run_id = r.id
    and status_code = case target when 'VALIDATED' then 'DRAFT' else 'VALIDATED' end;

  if target = 'VALIDATED' then
    update public.hr_payroll_slips set status_code = 'VALIDATED'
    where run_id = r.id and status_code = 'DRAFT';
  elsif target = 'DRAFT' then
    update public.hr_payroll_slips set status_code = 'DRAFT'
    where run_id = r.id and status_code = 'VALIDATED';
  else
    update public.hr_payroll_slips set status_code = 'LOCKED', locked_at = now()
    where run_id = r.id and status_code = 'VALIDATED';
  end if;
  get diagnostics n = row_count;
  if n <> expected then
    raise exception 'Accès refusé aux bulletins de cette paie.' using errcode = 'insufficient_privilege';
  end if;

  return target;
end;
$$;

grant execute on function public.hr_payroll_run_transition(uuid, text) to authenticated;

-- Correspondence → pointage: skip frozen days instead of failing the document save.
create or replace function public.hr_apply_correspondence_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  legend text;
  d date;
  site uuid;
  src text;
  st text;
begin
  -- UPDATE OF fires whenever the column is in the SET list, even with an unchanged value.
  if tg_op = 'UPDATE'
     and new.type_code is not distinct from old.type_code
     and new.start_date is not distinct from old.start_date
     and new.end_date is not distinct from old.end_date
     and new.site_id is not distinct from old.site_id
     and new.employee_id is not distinct from old.employee_id then
    return new;
  end if;

  -- Days previously generated by this document (not overridden by the user) are rebuilt,
  -- except those already frozen by a validated / closed payroll.
  if tg_op = 'UPDATE' then
    delete from public.hr_attendance a
    where a.correspondence_id = new.id
      and a.source_code <> 'MANUAL'
      and coalesce(public.hr_payroll_period_status(a.site_id, a.work_date), '') <> 'LOCKED'
      and not (
        a.status_code = 'VALIDATED'
        and public.hr_payroll_period_status(a.site_id, a.work_date) = 'VALIDATED'
      );
  end if;

  select nullif(extra->>'generates_legend', '') into legend
  from public.hr_catalogs
  where kind = 'correspondence_type' and code = new.type_code and is_active
  limit 1;

  if legend is null or new.start_date is null or new.end_date is null then
    return new;
  end if;
  if not exists (select 1 from public.ref_legendes l where l.code = legend and l.is_active) then
    return new;
  end if;

  site := new.site_id;
  if site is null then
    select c.site_id into site
    from public.hr_contracts c
    where c.employee_id = new.employee_id
      and c.affectation_principale
      and c.status in ('ACTIVE', 'DRAFT', 'SUSPENDED')
    order by (c.status = 'ACTIVE') desc, c.start_date desc
    limit 1;
  end if;
  if site is null then
    return new;
  end if;

  src := case when new.type_code = 'OM' then 'OM' else 'AUTO' end;

  d := new.start_date;
  while d <= new.end_date loop
    st := public.hr_payroll_period_status(site, d);
    if st = 'LOCKED' then
      null;
    elsif st = 'VALIDATED' then
      -- Only fill empty days; validated cells stay as they are.
      insert into public.hr_attendance (
        employee_id, site_id, work_date, legend_code, source_code,
        correspondence_id, status_code, validated_at, validated_by
      ) values (
        new.employee_id, site, d, legend, src,
        new.id, 'PROPOSED', null, null
      )
      on conflict (employee_id, site_id, work_date) do nothing;
    else
      insert into public.hr_attendance (
        employee_id, site_id, work_date, legend_code, source_code,
        correspondence_id, status_code, validated_at, validated_by
      ) values (
        new.employee_id, site, d, legend, src,
        new.id, 'PROPOSED', null, null
      )
      on conflict (employee_id, site_id, work_date) do update set
        legend_code = excluded.legend_code,
        source_code = excluded.source_code,
        correspondence_id = excluded.correspondence_id,
        status_code = 'PROPOSED',
        validated_at = null,
        validated_by = null,
        updated_at = now()
      where public.hr_attendance.source_code <> 'MANUAL';
    end if;
    d := d + 1;
  end loop;
  return new;
end;
$$;

commit;
