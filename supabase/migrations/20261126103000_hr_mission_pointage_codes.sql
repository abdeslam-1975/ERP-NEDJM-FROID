-- Exceptional ordre de mission: the code MS / CH / HP / CH-HP drives the
-- attendance lines. Paying days stay MS (or CRP when a leave covers them)
-- on the home site. The visible codes of both rows live in hr_attendance_lines.

begin;

insert into public.ref_legendes (code, label_fr, label_ar, coefficient, counts_as_presence, triggers_an_passthrough, is_system, color_bg, color_fg, source_mode)
values
  ('CH', 'Changement de chantier', 'تغيير التعيين', 0, false, false, true, '#e5e7eb', '#111827', 'BOTH'),
  ('HP', 'Changement de poste', 'تغيير المنصب', 0, false, false, true, '#e5e7eb', '#111827', 'BOTH'),
  ('CH-HP', 'Changement de chantier et de poste', 'تغيير التعيين والمنصب', 0, false, false, true, '#e5e7eb', '#111827', 'BOTH')
on conflict (code) do update set
  label_fr = excluded.label_fr,
  label_ar = excluded.label_ar,
  coefficient = excluded.coefficient,
  counts_as_presence = excluded.counts_as_presence,
  is_system = true;

create table if not exists public.hr_attendance_lines (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  site_id uuid not null references public.ref_sites(id),
  work_date date not null,
  line_poste text not null default '',
  legend_code text not null references public.ref_legendes(code),
  source_code text not null default 'OM',
  correspondence_id uuid references public.hr_correspondences(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, site_id, work_date, line_poste)
);

alter table public.hr_attendance_lines enable row level security;
drop policy if exists hr_att_lines_read on public.hr_attendance_lines;
create policy hr_att_lines_read on public.hr_attendance_lines for select to authenticated
  using (public.erp_can_see_site(site_id) and public.erp_has_perm('hr_attendance', 'read', site_id));
drop policy if exists hr_att_lines_write on public.hr_attendance_lines;
create policy hr_att_lines_write on public.hr_attendance_lines for all to authenticated
  using (public.erp_has_perm('hr_attendance', 'update', site_id))
  with check (public.erp_has_perm('hr_attendance', 'update', site_id));
grant select, insert, update, delete on public.hr_attendance_lines to authenticated, service_role;

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
      and coalesce(c.payload->>'pointageCode', 'MS') not in ('CH', 'HP', 'CH-HP')
  ),
  spans as (
    select
      d.*,
      case
        when d.type_code = 'OM' and d.end_date is not null then least(
          d.end_date,
          coalesce(d.next_start - 1, d.end_date)
        )
        when d.type_code = 'OM' then least(
          (date_trunc('month', greatest(v_today, d.start_date)) + interval '12 months - 1 day')::date,
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
      and exists (
        select 1 from public.hr_contracts k
        where k.employee_id = p_employee
          and k.status in ('ACTIVE', 'DRAFT', 'SUSPENDED', 'ENDED')
          and k.start_date <= g.day::date
          and (k.end_date is null or k.end_date >= g.day::date)
      )
    order by g.day::date, s.start_date desc, s.created_at desc, s.id desc
  )
  select p_employee, site_id, work_date, legend, source_code, id from days;

  -- Exceptional orders: one paying code per day on the home site (MS, or the leave already wanted).
  insert into hr_chain_wanted (employee_id, site_id, work_date, legend_code, source_code, correspondence_id)
  select p_employee, x.site_id, x.work_date, 'MS', 'OM', x.id
  from (
    select
      c.id,
      c.site_id,
      g.day::date as work_date
    from public.hr_correspondences c
    cross join lateral generate_series(
      date_trunc('month', c.start_date)::date,
      case
        when c.end_date is null then least(
          (date_trunc('month', greatest(v_today, c.start_date)) + interval '12 months - 1 day')::date,
          coalesce(
            (select min(n.start_date) - 1
             from public.hr_correspondences n
             where n.employee_id = c.employee_id
               and n.status_code <> 'CANCELLED'
               and n.type_code in ('OM', 'LEAVE')
               and n.start_date > c.start_date),
            'infinity'::date
          )
        )
        else c.end_date
      end,
      interval '1 day'
    ) as g(day)
    where c.employee_id = p_employee
      and c.type_code = 'OM'
      and c.status_code <> 'CANCELLED'
      and c.start_date is not null
      and c.site_id is not null
      and coalesce(c.payload->>'pointageCode', 'MS') in ('CH', 'HP', 'CH-HP')
      and (c.end_date is null or g.day::date <= c.end_date)
  ) x
  where not exists (
    select 1 from hr_chain_wanted w
    where w.site_id = x.site_id and w.work_date = x.work_date
  )
    and exists (
      select 1 from public.hr_contracts k
      where k.employee_id = p_employee
        and k.status in ('ACTIVE', 'DRAFT', 'SUSPENDED', 'ENDED')
        and k.start_date <= x.work_date
        and (k.end_date is null or k.end_date >= x.work_date)
    );

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

  delete from public.hr_attendance_lines l
  where l.employee_id = p_employee
    and l.source_code = 'OM'
    and coalesce(public.hr_payroll_period_status(l.site_id, l.work_date), '') <> 'LOCKED';

  insert into public.hr_attendance_lines (
    employee_id, site_id, work_date, line_poste, legend_code, source_code, correspondence_id
  )
  select p_employee, v.site_id, v.work_date, v.line_poste, v.legend_code, 'OM', v.id
  from (
    select
      c.id,
      c.site_id as home_id,
      case
        when c.payload->>'pointageCode' = 'HP' then c.site_id
        when coalesce(c.payload->>'missionSiteId', '') ~ '^[0-9a-fA-F-]{36}$'
          then (c.payload->>'missionSiteId')::uuid
        else null
      end as mission_id,
      coalesce(nullif(c.payload->>'pointageCode', ''), 'MS') as code,
      case
        when c.payload->>'pointageCode' = 'HP' then coalesce(c.payload->>'missionPoste', '')
        when c.payload->>'pointageCode' = 'CH' then coalesce(c.payload->>'missionAffectation', '')
        else trim(both ' ' from coalesce(c.payload->>'missionAffectation', '') || ' · ' || coalesce(c.payload->>'missionPoste', ''))
      end as mission_line,
      c.start_date,
      c.end_date,
      g.day::date as work_date
    from public.hr_correspondences c
    cross join lateral generate_series(
      date_trunc('month', c.start_date)::date,
      case
        when c.end_date is null then least(
          (date_trunc('month', greatest(v_today, c.start_date)) + interval '12 months - 1 day')::date,
          coalesce(
            (select min(n.start_date) - 1
             from public.hr_correspondences n
             where n.employee_id = c.employee_id
               and n.status_code <> 'CANCELLED'
               and n.type_code in ('OM', 'LEAVE')
               and n.start_date > c.start_date),
            'infinity'::date
          )
        )
        else c.end_date
      end,
      interval '1 day'
    ) as g(day)
    where c.employee_id = p_employee
      and c.type_code = 'OM'
      and c.status_code <> 'CANCELLED'
      and c.start_date is not null
      and c.site_id is not null
      and coalesce(c.payload->>'pointageCode', 'MS') in ('CH', 'HP', 'CH-HP')
      and (c.end_date is null or g.day::date <= c.end_date)
  ) s
  cross join lateral (
    select s.home_id as site_id, s.work_date, ''::text as line_poste,
      case
        when s.work_date < s.start_date then 'MS'
        when s.end_date is null or s.work_date <= s.end_date then s.code
        when exists (
          select 1 from hr_chain_wanted w
          where w.site_id = s.home_id and w.work_date = s.work_date and w.legend_code = 'CRP'
        ) then 'CRP'
        else 'MS'
      end as legend_code,
      s.id
    union all
    select s.mission_id, s.work_date, s.mission_line,
      case
        when s.work_date < s.start_date then s.code
        when s.end_date is null or s.work_date <= s.end_date then 'MS'
        else s.code
      end,
      s.id
    where s.mission_id is not null and s.mission_line <> ''
  ) v
  where coalesce(public.hr_payroll_period_status(v.site_id, v.work_date), '') <> 'LOCKED'
    and exists (
      select 1 from public.hr_contracts k
      where k.employee_id = p_employee
        and k.status in ('ACTIVE', 'DRAFT', 'SUSPENDED', 'ENDED')
        and k.start_date <= v.work_date
        and (k.end_date is null or k.end_date >= v.work_date)
    )
  on conflict (employee_id, site_id, work_date, line_poste) do update set
    legend_code = excluded.legend_code,
    correspondence_id = excluded.correspondence_id,
    updated_at = now();
end;
$$;

revoke all on function public.hr_rebuild_chain_attendance(uuid) from public, anon, authenticated;

-- Print the code and the mission fields. Empty optional rows stay hidden.
update public.doc_templates
set html = regexp_replace(
  html,
  '(data-field="poste"></div><div class="om-ar">الوظيفة :</div></div>)',
  E'\\1\n        <div class="om-row"><div class="om-fr">Code :</div><div class="om-val" data-field="pointage_code"></div><div class="om-ar">الرمز :</div></div>\n        <div class="om-row om-opt"><div class="om-fr">Affectation de mission :</div><div class="om-val" data-field="mission_affectation"></div><div class="om-ar">تعيين المهمة :</div></div>\n        <div class="om-row om-opt"><div class="om-fr">Poste de mission :</div><div class="om-val" data-field="mission_poste"></div><div class="om-ar">منصب المهمة :</div></div>'
)
where doc_type = 'ordre_mission'
  and status = 'approved'
  and html not like '%data-field="pointage_code"%';

update public.doc_templates
set html = replace(
  html,
  '.om-row { display: grid;',
  '.om-opt:has(.om-val:empty) { display: none; }' || E'\n    .om-row { display: grid;'
)
where doc_type = 'ordre_mission'
  and status = 'approved'
  and html not like '%om-opt:has%';

do $$
declare r record;
begin
  for r in
    select distinct employee_id
    from public.hr_correspondences
    where type_code = 'OM'
      and status_code <> 'CANCELLED'
      and start_date is not null
  loop
    perform public.hr_rebuild_chain_attendance(r.employee_id);
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
