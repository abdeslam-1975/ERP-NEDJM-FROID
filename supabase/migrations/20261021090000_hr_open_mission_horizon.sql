-- Ordre de mission sans date de retour (« Fin de mission ») : posé tout de suite sur 12 mois
-- (mois en cours + 11 mois suivants) au lieu du seul mois en cours. hr_extend_open_missions()
-- (cron quotidien) fait glisser cette fenêtre. Le reste de la chaîne OM / congé est inchangé :
-- l'OM s'arrête la veille du document suivant (OM ou congé) et ne reprend pas après.

begin;

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

select public.hr_extend_open_missions();

commit;
