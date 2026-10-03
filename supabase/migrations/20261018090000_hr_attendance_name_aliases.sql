-- Attendance archive import: names matched by hand.
-- A name read in a file (last + first name) that matches no employee can be tied once to an employee;
-- every later analysis, in any batch, uses that choice for lines left without an employee by their matricule.
begin;

create table if not exists public.hr_attendance_name_aliases (
  id uuid primary key default gen_random_uuid(),
  name_key text not null unique check (char_length(name_key) between 1 and 240),
  source_name text not null check (char_length(source_name) between 1 and 240),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  created_by uuid not null references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.sys_users(id),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_hr_attendance_name_aliases_audit on public.hr_attendance_name_aliases;
create trigger trg_hr_attendance_name_aliases_audit
  after insert or update or delete on public.hr_attendance_name_aliases
  for each row execute function public.sys_audit_row_change();

alter table public.hr_attendance_name_aliases enable row level security;
drop policy if exists hr_attendance_name_aliases_read on public.hr_attendance_name_aliases;
create policy hr_attendance_name_aliases_read on public.hr_attendance_name_aliases
  for select to authenticated
  using (
    public.hr_att_import_has('hr_attendance_import', 'read')
    or public.hr_att_import_has('hr_attendance_import', 'create')
    or public.hr_att_import_has('hr_attendance_import_validate', 'read')
  );
grant select on public.hr_attendance_name_aliases to authenticated;
create or replace function public.hr_attendance_import_analyze_internal(p_batch uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.hr_attendance_import_batches%rowtype;
  v_end date;
  v_counts jsonb;
  v_warn jsonb := '[]'::jsonb;
  v_day_lines integer;
  v_emps integer;
  d public.sys_decisions%rowtype;
begin
  select * into b from public.hr_attendance_import_batches where id = p_batch for update;
  if not found then
    raise exception 'Lot d''import introuvable.' using errcode = 'no_data_found';
  end if;
  if b.status not in ('DRAFT', 'ANALYZED', 'PENDING_DECISION') then
    raise exception 'Lot % : analyse impossible (statut %).', b.batch_no, b.status using errcode = 'check_violation';
  end if;
  if b.sealed_at is null then
    raise exception 'Lot % : toutes les lignes du fichier n''ont pas été reçues. Rejetez ce lot et déposez à nouveau le fichier.', b.batch_no
      using errcode = 'check_violation';
  end if;
  v_end := (b.period_to + interval '1 month')::date;

  -- 0. Reset (the previous existing-value snapshot and resolution are compared in step 8)
  update public.hr_attendance_import_lines set
    employee_id = null, site_id = null, legend_code = null, code_origin = null,
    status = 'PENDING', errors = parse_errors, warnings = '{}'
  where batch_id = p_batch;

  -- 1. Employee (unambiguous matricule) and name consistency
  update public.hr_attendance_import_lines l set employee_id = m.id
  from (
    select k.key, min(e.id::text)::uuid as id, count(*) as n
    from (
      select distinct public.hr_att_import_mat_key(matricule) as key
      from public.hr_attendance_import_lines
      where batch_id = p_batch and btrim(matricule) <> ''
    ) k
    join public.hr_employees e on public.hr_att_import_mat_key(e.matricule) = k.key
    group by k.key
  ) m
  where l.batch_id = p_batch and btrim(l.matricule) <> '' and m.n = 1
    and m.key = public.hr_att_import_mat_key(l.matricule);

  update public.hr_attendance_import_lines l set warnings = array_append(l.warnings, 'NAME_MISMATCH')
  from public.hr_employees e
  where l.batch_id = p_batch and e.id = l.employee_id
    and (
      (public.hr_att_import_name_key(l.last_name) <> ''
       and public.hr_att_import_name_key(l.last_name) <> public.hr_att_import_name_key(e.last_name))
      or (public.hr_att_import_name_key(l.first_name) <> ''
          and public.hr_att_import_name_key(l.first_name) <> public.hr_att_import_name_key(e.first_name))
    );

  -- Names tied to an employee by hand, for lines their matricule left without one
  update public.hr_attendance_import_lines l set employee_id = a.employee_id
  from public.hr_attendance_name_aliases a
  where l.batch_id = p_batch and l.employee_id is null
    and a.name_key = public.hr_att_import_name_key(coalesce(l.last_name, '') || coalesce(l.first_name, ''));

  update public.hr_attendance_import_lines l set errors = array_append(l.errors,
    case
      when btrim(l.matricule) = '' then 'MATRICULE_MISSING'
      when (select count(*) from public.hr_employees e
            where public.hr_att_import_mat_key(e.matricule) = public.hr_att_import_mat_key(l.matricule)) > 1
        then 'AMBIGUOUS_MATRICULE'
      else 'UNKNOWN_MATRICULE'
    end)
  where l.batch_id = p_batch and l.employee_id is null;

  -- 2. Site
  if b.format = 'GRID' then
    update public.hr_attendance_import_lines set site_id = b.site_ids[1] where batch_id = p_batch;
  else
    update public.hr_attendance_import_lines l set site_id = s.id
    from public.ref_sites s
    where l.batch_id = p_batch and btrim(coalesce(l.site_code, '')) <> ''
      and upper(btrim(s.code)) = upper(btrim(l.site_code));
    update public.hr_attendance_import_lines l set errors = array_append(l.errors,
      case when btrim(coalesce(l.site_code, '')) = '' then 'SITE_MISSING' else 'UNKNOWN_SITE' end)
    where l.batch_id = p_batch and l.site_id is null;
  end if;
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'SITE_OUTSIDE_BATCH')
  where l.batch_id = p_batch and l.site_id is not null and not (l.site_id = any (b.site_ids));

  -- 3. Code: reference code, else correspondence validated for this batch (D11), else confirmed policy
  update public.hr_attendance_import_lines l set legend_code = g.code, code_origin = 'DIRECT'
  from public.ref_legendes g
  where l.batch_id = p_batch and l.kind = 'DAY' and g.is_active and upper(g.code) = upper(btrim(l.source_code));
  update public.hr_attendance_import_lines l set legend_code = g.code, code_origin = 'BATCH_MAP'
  from public.ref_legendes g
  where l.batch_id = p_batch and l.kind = 'DAY' and l.legend_code is null and g.is_active
    and g.code = b.code_map->>upper(btrim(l.source_code));
  update public.hr_attendance_import_lines l set legend_code = g.code, code_origin = 'POLICY'
  from public.hr_attendance_code_mappings m
  join public.ref_legendes g on g.code = m.legend_code and g.is_active
  where l.batch_id = p_batch and l.kind = 'DAY' and l.legend_code is null
    and m.status = 'ACTIVE' and m.source_code = upper(btrim(l.source_code));
  update public.hr_attendance_import_lines l set errors = array_append(l.errors,
    case when btrim(coalesce(l.source_code, '')) = '' then 'CODE_MISSING' else 'UNKNOWN_CODE' end)
  where l.batch_id = p_batch and l.kind = 'DAY' and l.legend_code is null;

  -- 4. Dates and payroll period
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'DATE_MISSING')
  where l.batch_id = p_batch and l.work_date is null
    and not (l.parse_errors && array['DATE_INVALID', 'DAY_OUT_OF_MONTH']);
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'DATE_OUT_OF_PERIOD')
  where l.batch_id = p_batch and l.work_date is not null and (l.work_date < b.period_from or l.work_date >= v_end);
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'FUTURE_DATE')
  where l.batch_id = p_batch and l.work_date > current_date;
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'MONTH_CLOSED')
  where l.batch_id = p_batch and l.work_date is not null and l.site_id is not null
    and public.hr_payroll_period_status(l.site_id, l.work_date) is not null;

  -- 5. Contract covering the date on that site; exit
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'NO_CONTRACT')
  where l.batch_id = p_batch and l.employee_id is not null and l.site_id is not null and l.work_date is not null
    and not exists (
      select 1 from public.hr_contracts c
      where c.employee_id = l.employee_id
        and c.start_date <= case when l.kind = 'HOURS' then (l.work_date + interval '1 month - 1 day')::date else l.work_date end
        and (c.end_date is null or c.end_date >= l.work_date)
        and (
          public.hr_contract_site_at(c.id, greatest(c.start_date, l.work_date)) = l.site_id
          or (l.kind = 'HOURS' and exists (
            select 1 from public.hr_contract_assignments a
            where a.contract_id = c.id and a.site_id = l.site_id
              and a.effective_from between l.work_date and (l.work_date + interval '1 month - 1 day')::date
          ))
        )
    );
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'AFTER_EXIT')
  where l.batch_id = p_batch and l.kind = 'DAY' and l.employee_id is not null and l.work_date is not null
    and exists (
      select 1 from public.hr_employee_exits x
      where x.employee_id = l.employee_id and x.status = 'VALIDATED' and x.exit_date < l.work_date
    );

  -- 6. Overtime hours: per day (0–24, total ≤ 24), per month column (0–300), monthly total per code ≤ 300
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'HOURS_OUT_OF_BOUNDS')
  where l.batch_id = p_batch and l.hours <> '{}'::jsonb
    and (
      exists (
        select 1 from jsonb_each(l.hours) as h(k, v)
        where h.k not in ('HS50', 'HS75', 'HS100')
           or jsonb_typeof(h.v) <> 'number'
           or case when jsonb_typeof(h.v) = 'number'
                   then (h.v)::numeric < 0 or (h.v)::numeric > case when l.kind = 'HOURS' then 300 else 24 end
                   else true end
      )
      or (l.kind = 'DAY' and (
        select coalesce(sum(case when jsonb_typeof(h.v) = 'number' then (h.v)::numeric else 0 end), 0)
        from jsonb_each(l.hours) as h(k, v)
      ) > 24)
    );
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'HOURS_MONTH_EXCEEDED')
  from (
    select distinct t.employee_id, t.site_id, t.m
    from (
      select l2.employee_id, l2.site_id, date_trunc('month', l2.work_date)::date as m, h.k,
             sum(case when jsonb_typeof(h.v) = 'number' then (h.v)::numeric else 0 end) as total
      from public.hr_attendance_import_lines l2
      cross join jsonb_each(l2.hours) as h(k, v)
      where l2.batch_id = p_batch and l2.employee_id is not null and l2.work_date is not null
      group by 1, 2, 3, 4
    ) t
    where t.total > 300
  ) g
  where l.batch_id = p_batch and l.hours <> '{}'::jsonb and l.employee_id = g.employee_id
    and l.site_id is not distinct from g.site_id and date_trunc('month', l.work_date)::date = g.m;

  -- 7. Duplicates in the file: same employee and day (two sites, or two different codes, are errors;
  --    identical repeats are ignored after the first)
  update public.hr_attendance_import_lines l set
    errors = case
      when g.sites > 1 then array_append(l.errors, 'DUPLICATE_OTHER_SITE')
      when g.codes > 1 then array_append(l.errors, 'DUPLICATE_DIFFERENT')
      else l.errors end,
    warnings = case
      when g.sites <= 1 and g.codes <= 1 and l.id <> g.first_id then array_append(l.warnings, 'DUPLICATE_IGNORED')
      else l.warnings end,
    status = case when g.sites <= 1 and g.codes <= 1 and l.id <> g.first_id then 'DUPLICATE' else l.status end
  from (
    select employee_id, work_date,
           count(distinct site_id) as sites,
           count(distinct coalesce(legend_code, upper(btrim(coalesce(source_code, ''))))) as codes,
           (array_agg(id order by line_no, source_ref))[1] as first_id
    from public.hr_attendance_import_lines
    where batch_id = p_batch and kind = 'DAY' and employee_id is not null and work_date is not null
    group by employee_id, work_date
    having count(*) > 1
  ) g
  where l.batch_id = p_batch and l.kind = 'DAY' and l.employee_id = g.employee_id and l.work_date = g.work_date;

  -- 8. Existing attendance, leaves: never overwritten silently. A resolution already taken is kept only while
  --    the existing values are exactly those it was taken on.
  update public.hr_attendance_import_lines set
    conflict_kinds = '{}', existing = '[]'::jsonb,
    resolution = null, resolved_by = null, resolved_at = null, resolution_decision = null
  where batch_id = p_batch and (kind = 'HOURS' or errors <> '{}' or status = 'DUPLICATE');

  update public.hr_attendance_import_lines l set
    existing = k.ex,
    conflict_kinds = case when k.other_closed then '{}'::text[] else k.kinds end,
    errors = case when k.other_closed then array_append(l.errors, 'OTHER_SITE_CLOSED') else l.errors end,
    status = case when not k.other_closed and k.same then 'SAME' else l.status end,
    resolution = case when not k.other_closed and cardinality(k.kinds) > 0 and l.existing = k.ex then l.resolution end,
    resolved_by = case when not k.other_closed and cardinality(k.kinds) > 0 and l.existing = k.ex then l.resolved_by end,
    resolved_at = case when not k.other_closed and cardinality(k.kinds) > 0 and l.existing = k.ex then l.resolved_at end,
    resolution_decision = case
      when not k.other_closed and cardinality(k.kinds) > 0 and l.existing = k.ex then l.resolution_decision end
  from (
    select c.id, c.ex,
      array_remove(array[
        case when exists (
          select 1 from jsonb_array_elements(c.ex) as e(v)
          where (e.v->>'site_id')::uuid = c.site_id and e.v->>'legend_code' <> c.legend_code
        ) then 'EXISTING_DIFFERENT' end,
        case when exists (
          select 1 from jsonb_array_elements(c.ex) as e(v) where (e.v->>'site_id')::uuid <> c.site_id
        ) then 'OTHER_SITE' end,
        case when c.on_leave and jsonb_array_length(c.ex) = 0 then 'LEAVE' end
      ], null) as kinds,
      exists (
        select 1 from jsonb_array_elements(c.ex) as e(v)
        where (e.v->>'site_id')::uuid <> c.site_id
          and public.hr_payroll_period_status((e.v->>'site_id')::uuid, c.work_date) is not null
      ) as other_closed,
      (jsonb_array_length(c.ex) = 1
       and (c.ex->0->>'site_id')::uuid = c.site_id
       and c.ex->0->>'legend_code' = c.legend_code) as same
    from (
      select l2.id, l2.site_id, l2.work_date, l2.legend_code,
        coalesce((
          select jsonb_agg(to_jsonb(a) order by a.site_id, a.id)
          from public.hr_attendance a
          where a.employee_id = l2.employee_id and a.work_date = l2.work_date
        ), '[]'::jsonb) as ex,
        exists (
          select 1 from public.hr_leave_requests r
          where r.employee_id = l2.employee_id and r.status = 'APPROVED'
            and l2.work_date between r.start_date and r.end_date
        ) as on_leave
      from public.hr_attendance_import_lines l2
      where l2.batch_id = p_batch and l2.kind = 'DAY' and l2.errors = '{}' and l2.status <> 'DUPLICATE'
    ) c
  ) k
  where l.id = k.id;

  -- 9. Line status
  update public.hr_attendance_import_lines set status = case
      when errors <> '{}' then 'ERROR'
      when status = 'DUPLICATE' then 'DUPLICATE'
      when status = 'SAME' then 'SAME'
      when conflict_kinds <> '{}' then 'CONFLICT'
      when warnings <> '{}' then 'WARNING'
      else 'OK' end
  where batch_id = p_batch;
  update public.hr_attendance_import_lines set
    conflict_kinds = '{}', resolution = null, resolved_by = null, resolved_at = null, resolution_decision = null
  where batch_id = p_batch and status <> 'CONFLICT' and (conflict_kinds <> '{}' or resolution is not null);

  -- 10. Batch report: counts, anomalies by code, control totals, same file already imported
  v_counts := public.hr_attendance_import_recount(p_batch);
  select count(*) filter (where kind = 'DAY'),
         count(distinct public.hr_att_import_mat_key(matricule)) filter (where btrim(matricule) <> '')
    into v_day_lines, v_emps
  from public.hr_attendance_import_lines where batch_id = p_batch;
  if b.duplicate_of is not null then
    v_warn := v_warn || jsonb_build_array((
      select jsonb_build_object('code', 'DUPLICATE_FILE', 'batch_no', o.batch_no, 'status', o.status)
      from public.hr_attendance_import_batches o where o.id = b.duplicate_of));
  end if;
  if b.control_lines is not null and b.control_lines <> v_day_lines then
    v_warn := v_warn || jsonb_build_array(jsonb_build_object('code', 'CONTROL_LINES', 'expected', b.control_lines, 'actual', v_day_lines));
  end if;
  if b.control_employees is not null and b.control_employees <> v_emps then
    v_warn := v_warn || jsonb_build_array(jsonb_build_object('code', 'CONTROL_EMPLOYEES', 'expected', b.control_employees, 'actual', v_emps));
  end if;

  update public.hr_attendance_import_batches set
    analysis = jsonb_build_object(
      'counts', v_counts,
      'warnings', v_warn,
      'day_lines', v_day_lines,
      'employees', v_emps,
      'errors_by_code', coalesce((
        select jsonb_object_agg(x.code, x.n) from (
          select e.code, count(*) as n
          from public.hr_attendance_import_lines l, unnest(l.errors) as e(code)
          where l.batch_id = p_batch group by e.code
        ) x), '{}'::jsonb),
      'warnings_by_code', coalesce((
        select jsonb_object_agg(x.code, x.n) from (
          select w.code, count(*) as n
          from public.hr_attendance_import_lines l, unnest(l.warnings) as w(code)
          where l.batch_id = p_batch group by w.code
        ) x), '{}'::jsonb),
      'conflicts_by_kind', coalesce((
        select jsonb_object_agg(x.code, x.n) from (
          select c.code, count(*) as n
          from public.hr_attendance_import_lines l, unnest(l.conflict_kinds) as c(code)
          where l.batch_id = p_batch group by c.code
        ) x), '{}'::jsonb)
    ),
    analyzed_at = now(),
    analyzed_by = auth.uid(),
    status = case when (v_counts->>'unresolved')::integer > 0 then 'PENDING_DECISION' else 'ANALYZED' end
  where id = p_batch;

  if (v_counts->>'unresolved')::integer > 0 then
    perform public.hr_attendance_import_request_d5(p_batch);
  else
    for d in
      select * from public.sys_decisions
      where dedupe_key = 'D5:' || p_batch::text and status in ('PENDING', 'DECIDED')
    loop
      if d.status = 'PENDING' then
        perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'Plus aucun conflit à trancher dans ce lot (nouvelle analyse).');
      else
        update public.sys_decisions set
          status = 'EXECUTED', executed_by = auth.uid(), executed_at = now(),
          execution_result = jsonb_build_object(
            'operation', 'LINE_BY_LINE',
            'take_import', (v_counts->>'take_import')::integer,
            'keep_existing', (v_counts->>'keep_existing')::integer)
        where id = d.id;
      end if;
    end loop;
  end if;

  select * into b from public.hr_attendance_import_batches where id = p_batch;
  return b.analysis || jsonb_build_object('status', b.status);
end;
$$;

-- Names of a batch left without an employee, and names of the batch tied to one by hand.
create or replace function public.hr_attendance_import_name_review(p_batch uuid)
returns table (source_name text, name_key text, lines integer, employee_id uuid, matricule text, employee_name text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  b public.hr_attendance_import_batches%rowtype;
begin
  if auth.uid() is null or not public.sys_user_is_active(auth.uid()) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.hr_attendance_import_batches where id = p_batch;
  if not found then
    raise exception 'Lot d''import introuvable.' using errcode = 'no_data_found';
  end if;
  if not public.hr_att_import_can_read(b.site_ids) then
    raise exception 'Lot d''import non visible.' using errcode = 'insufficient_privilege';
  end if;
  return query
  select min(btrim(concat_ws(' ', l.last_name, l.first_name))), k.key, count(*)::integer,
         a.employee_id, e.matricule, btrim(concat_ws(' ', e.last_name, e.first_name))
  from public.hr_attendance_import_lines l
  cross join lateral (
    select public.hr_att_import_name_key(coalesce(l.last_name, '') || coalesce(l.first_name, '')) as key
  ) k
  left join public.hr_attendance_name_aliases a on a.name_key = k.key
  left join public.hr_employees e on e.id = a.employee_id
  where l.batch_id = p_batch and k.key <> ''
    and (
      (a.employee_id is not null and l.employee_id = a.employee_id)
      or (l.employee_id is null and l.errors && array['UNKNOWN_MATRICULE', 'MATRICULE_MISSING', 'AMBIGUOUS_MATRICULE'])
    )
  group by k.key, a.employee_id, e.matricule, e.last_name, e.first_name
  order by (a.employee_id is not null), 1;
end;
$$;

-- Ties a name of the batch to an employee (or unties it with a null employee), then analyses the batch again.
create or replace function public.hr_attendance_import_set_alias(p_batch uuid, p_name text, p_employee uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.hr_attendance_import_batches%rowtype;
  v_key text := public.hr_att_import_name_key(p_name);
  v_name text := left(btrim(coalesce(p_name, '')), 240);
begin
  if auth.uid() is null or not public.sys_user_is_active(auth.uid()) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.hr_attendance_import_batches where id = p_batch;
  if not found then
    raise exception 'Lot d''import introuvable.' using errcode = 'no_data_found';
  end if;
  if not public.hr_att_import_sites_allowed(b.site_ids, 'hr_attendance_import', 'create') then
    raise exception 'Rapprochement des noms non autorisé sur au moins un des chantiers du lot.' using errcode = 'insufficient_privilege';
  end if;
  if b.status not in ('DRAFT', 'ANALYZED', 'PENDING_DECISION') then
    raise exception 'Lot % : déjà importé ou clos, les noms ne se rapprochent plus.', b.batch_no using errcode = 'check_violation';
  end if;
  if v_key = '' or not exists (
    select 1 from public.hr_attendance_import_lines l
    where l.batch_id = p_batch
      and public.hr_att_import_name_key(coalesce(l.last_name, '') || coalesce(l.first_name, '')) = v_key
  ) then
    raise exception 'Nom absent de ce lot.' using errcode = 'check_violation';
  end if;
  if p_employee is null then
    delete from public.hr_attendance_name_aliases where name_key = v_key;
  else
    if not exists (select 1 from public.hr_employees where id = p_employee) then
      raise exception 'Employé introuvable.' using errcode = 'no_data_found';
    end if;
    insert into public.hr_attendance_name_aliases (name_key, source_name, employee_id, created_by)
    values (v_key, v_name, p_employee, auth.uid())
    on conflict (name_key) do update
      set employee_id = excluded.employee_id, source_name = excluded.source_name,
          updated_by = auth.uid(), updated_at = now();
  end if;
  return public.hr_attendance_import_analyze_internal(p_batch);
end;
$$;

revoke all on function public.hr_attendance_import_analyze_internal(uuid) from public, anon, authenticated;
revoke all on function public.hr_attendance_import_name_review(uuid) from public, anon;
revoke all on function public.hr_attendance_import_set_alias(uuid, text, uuid) from public, anon;
grant execute on function public.hr_attendance_import_name_review(uuid) to authenticated;
grant execute on function public.hr_attendance_import_set_alias(uuid, text, uuid) to authenticated;

commit;

