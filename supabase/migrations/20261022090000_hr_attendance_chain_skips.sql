-- Jours d'OM / congé supprimés à la main dans la grille de pointage : ils ne reviennent plus.
-- La validation de la grille note chaque jour OM/AUTO retiré ; la reconstruction de la chaîne
-- (création ou modification d'un OM / congé, cron des OM ouverts) ne le repose plus.

begin;

create table if not exists public.hr_attendance_chain_skips (
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  site_id uuid not null references public.ref_sites(id) on delete cascade,
  work_date date not null,
  correspondence_id uuid not null references public.hr_correspondences(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (employee_id, site_id, work_date, correspondence_id)
);

comment on table public.hr_attendance_chain_skips is
  'Jours d''un OM / congé retirés à la main de la grille : la reconstruction automatique ne les repose pas.';

alter table public.hr_attendance_chain_skips enable row level security;

drop policy if exists hr_att_skip_read on public.hr_attendance_chain_skips;
create policy hr_att_skip_read on public.hr_attendance_chain_skips
  for select to authenticated
  using (public.erp_can_see_site(site_id) and public.erp_has_perm('hr_attendance', 'read', site_id));

drop policy if exists hr_att_skip_write on public.hr_attendance_chain_skips;
create policy hr_att_skip_write on public.hr_attendance_chain_skips
  for all to authenticated
  using (public.erp_has_perm('hr_attendance', 'update', site_id) and public.hr_att_col_allowed('DAYS', true, site_id))
  with check (public.erp_has_perm('hr_attendance', 'update', site_id) and public.hr_att_col_allowed('DAYS', true, site_id));

grant select, insert, delete on public.hr_attendance_chain_skips to authenticated;
grant all on public.hr_attendance_chain_skips to service_role;

create or replace function public.hr_attendance_replace_month(
  p_site uuid, p_start date, p_end date, p_employee uuid, p_loaded_at timestamptz, p_rows jsonb
)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n integer := 0;
begin
  insert into public.hr_attendance_chain_skips (employee_id, site_id, work_date, correspondence_id)
  select a.employee_id, a.site_id, a.work_date, a.correspondence_id
  from public.hr_attendance a
  where a.site_id = p_site
    and a.work_date between p_start and p_end
    and (p_employee is null or a.employee_id = p_employee)
    and (p_loaded_at is null or a.status_code = 'VALIDATED' or a.updated_at <= p_loaded_at)
    and a.source_code in ('OM', 'AUTO')
    and a.correspondence_id is not null
    and not exists (
      select 1
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(employee_id uuid, site_id uuid, work_date date)
      where r.employee_id = a.employee_id and r.site_id = a.site_id and r.work_date = a.work_date
    )
  on conflict do nothing;

  delete from public.hr_attendance a
  where a.site_id = p_site
    and a.work_date between p_start and p_end
    and (p_employee is null or a.employee_id = p_employee)
    and (p_loaded_at is null or a.status_code = 'VALIDATED' or a.updated_at <= p_loaded_at)
    and not (
      a.source_code = 'IMPORT'
      and exists (
        select 1
        from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(employee_id uuid, site_id uuid, work_date date, legend_code text)
        where r.employee_id = a.employee_id and r.site_id = a.site_id and r.work_date = a.work_date
          and r.legend_code = a.legend_code
      )
    );

  insert into public.hr_attendance (
    employee_id, site_id, work_date, legend_code, source_code, correspondence_id,
    status_code, validated_at, validated_by
  )
  select r.employee_id, r.site_id, r.work_date, r.legend_code,
         case when r.source_code is null or r.source_code = 'IMPORT' then 'MANUAL' else r.source_code end,
         case when r.source_code = 'IMPORT' then null else r.correspondence_id end,
         'VALIDATED', now(), auth.uid()
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(
    employee_id uuid, site_id uuid, work_date date, legend_code text, source_code text, correspondence_id uuid
  )
  where r.site_id = p_site and r.work_date between p_start and p_end
    and not exists (
      select 1 from public.hr_attendance a
      where a.employee_id = r.employee_id and a.site_id = r.site_id and a.work_date = r.work_date
        and a.source_code = 'IMPORT' and a.legend_code = r.legend_code
    )
  on conflict (employee_id, site_id, work_date) do update set
    legend_code = excluded.legend_code,
    source_code = excluded.source_code,
    correspondence_id = excluded.correspondence_id,
    status_code = 'VALIDATED',
    validated_at = excluded.validated_at,
    validated_by = excluded.validated_by
  where not (
    public.hr_attendance.source_code = 'IMPORT'
    and p_loaded_at is not null
    and public.hr_attendance.updated_at > p_loaded_at
  );
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.hr_rebuild_chain_attendance(p_employee uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Africa/Algiers')::date;
begin
  if p_employee is null then
    return;
  end if;

  create temp table if not exists hr_chain_wanted (
    employee_id uuid,
    site_id uuid,
    work_date date,
    legend_code text,
    source_code text,
    correspondence_id uuid
  ) on commit drop;
  truncate hr_chain_wanted;

  insert into hr_chain_wanted
  with docs as (
    select
      c.id,
      c.type_code,
      c.start_date,
      c.end_date,
      c.created_at,
      coalesce(
        c.site_id,
        (select k.site_id from public.hr_contracts k
          where k.employee_id = c.employee_id
            and k.affectation_principale
            and k.status in ('ACTIVE', 'DRAFT', 'SUSPENDED')
          order by (k.status = 'ACTIVE') desc, k.start_date desc
          limit 1)
      ) as site_id,
      coalesce(
        nullif(c.payload->>'legend', ''),
        (select nullif(t.extra->>'generates_legend', '') from public.hr_catalogs t
          where t.kind = 'correspondence_type' and t.code = c.type_code and t.is_active
          limit 1)
      ) as legend,
      lead(c.start_date) over (order by c.start_date, c.created_at, c.id) as next_start
    from public.hr_correspondences c
    where c.employee_id = p_employee
      and c.type_code in ('OM', 'LEAVE')
      and c.status_code <> 'CANCELLED'
      and c.start_date is not null
  ),
  spans as (
    select
      d.*,
      case
        when d.type_code = 'OM' then least(
          coalesce(
            d.end_date,
            (date_trunc('month', greatest(v_today, d.start_date)) + interval '12 months - 1 day')::date
          ),
          coalesce(d.next_start - 1, 'infinity'::date)
        )
        else d.end_date
      end as stop_date
    from docs d
    where d.site_id is not null
      and d.legend is not null
      and exists (select 1 from public.ref_legendes l where l.code = d.legend and l.is_active)
  ),
  days as (
    select distinct on (g.day::date)
      s.site_id,
      g.day::date as work_date,
      s.legend,
      case when s.type_code = 'OM' then 'OM' else 'AUTO' end as source_code,
      s.id
    from spans s
    cross join lateral generate_series(s.start_date, s.stop_date, interval '1 day') as g(day)
    where s.stop_date >= s.start_date
    order by g.day::date, s.start_date desc, s.created_at desc, s.id desc
  )
  select p_employee, site_id, work_date, legend, source_code, id from days;

  delete from hr_chain_wanted w
  using public.hr_attendance_chain_skips k
  where k.employee_id = w.employee_id
    and k.site_id = w.site_id
    and k.work_date = w.work_date
    and k.correspondence_id = w.correspondence_id;

  delete from public.hr_attendance a
  where a.employee_id = p_employee
    and a.source_code in ('OM', 'AUTO')
    and exists (
      select 1 from public.hr_correspondences c
      where c.id = a.correspondence_id and c.type_code in ('OM', 'LEAVE')
    )
    and not exists (
      select 1 from hr_chain_wanted w
      where w.site_id = a.site_id
        and w.work_date = a.work_date
        and w.correspondence_id = a.correspondence_id
        and w.legend_code = a.legend_code
    )
    and coalesce(public.hr_payroll_period_status(a.site_id, a.work_date), '') <> 'LOCKED'
    and not (
      a.status_code = 'VALIDATED'
      and coalesce(public.hr_payroll_period_status(a.site_id, a.work_date), '') = 'VALIDATED'
    );

  insert into public.hr_attendance (
    employee_id, site_id, work_date, legend_code, source_code,
    correspondence_id, status_code, validated_at, validated_by
  )
  select w.employee_id, w.site_id, w.work_date, w.legend_code, w.source_code,
         w.correspondence_id, 'PROPOSED', null, null
  from hr_chain_wanted w
  where coalesce(public.hr_payroll_period_status(w.site_id, w.work_date), '') <> 'LOCKED'
  on conflict (employee_id, site_id, work_date) do update set
    legend_code = excluded.legend_code,
    source_code = excluded.source_code,
    correspondence_id = excluded.correspondence_id,
    status_code = 'PROPOSED',
    validated_at = null,
    validated_by = null,
    updated_at = now()
  where public.hr_attendance.source_code not in ('MANUAL', 'IMPORT')
    and (public.hr_attendance.legend_code, public.hr_attendance.correspondence_id)
        is distinct from (excluded.legend_code, excluded.correspondence_id)
    and not (
      public.hr_attendance.status_code = 'VALIDATED'
      and coalesce(public.hr_payroll_period_status(excluded.site_id, excluded.work_date), '') = 'VALIDATED'
    );
end;
$$;

revoke all on function public.hr_rebuild_chain_attendance(uuid) from public, anon, authenticated;
revoke execute on function public.hr_attendance_replace_month(uuid, date, date, uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.hr_attendance_replace_month(uuid, date, date, uuid, timestamptz, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
