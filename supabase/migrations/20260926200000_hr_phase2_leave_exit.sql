-- Phase 2: leave management, end of employment (exit + final settlement), HR letters.

begin;

-- ---------------------------------------------------------------------------
-- Correspondence → attendance: legend may come from the payload; cancelled documents
-- remove the days they generated (mission orders included).
-- ---------------------------------------------------------------------------
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
begin
  if tg_op = 'UPDATE'
     and new.type_code is not distinct from old.type_code
     and new.start_date is not distinct from old.start_date
     and new.end_date is not distinct from old.end_date
     and new.site_id is not distinct from old.site_id
     and new.employee_id is not distinct from old.employee_id
     and new.status_code is not distinct from old.status_code
     and (new.payload->>'legend') is not distinct from (old.payload->>'legend') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    delete from public.hr_attendance
    where correspondence_id = new.id
      and source_code <> 'MANUAL';
  end if;

  if new.status_code = 'CANCELLED' then
    return new;
  end if;

  legend := nullif(new.payload->>'legend', '');
  if legend is null then
    select nullif(extra->>'generates_legend', '') into legend
    from public.hr_catalogs
    where kind = 'correspondence_type' and code = new.type_code and is_active
    limit 1;
  end if;

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
    d := d + 1;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_hr_corr_attendance on public.hr_correspondences;
create trigger trg_hr_corr_attendance
  after insert or update of type_code, start_date, end_date, site_id, employee_id, status_code, payload
  on public.hr_correspondences
  for each row execute function public.hr_apply_correspondence_attendance();

insert into public.hr_catalogs (kind, code, label_fr, label_ar, extra, sort_order, is_active)
values
  ('correspondence_type', 'CERTIF', 'Certificat de travail', 'شهادة عمل', '{}'::jsonb, 60, true),
  ('correspondence_type', 'STC', 'Reçu pour solde de tout compte', 'وصل تصفية كل حساب', '{}'::jsonb, 70, true),
  ('correspondence_type', 'MED1', 'Mise en demeure (1re)', 'إعذار أول', '{}'::jsonb, 80, true),
  ('correspondence_type', 'MED2', 'Mise en demeure (2e)', 'إعذار ثاني', '{}'::jsonb, 90, true)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Leave requests
-- ---------------------------------------------------------------------------
create table if not exists public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete restrict,
  kind text not null check (kind in ('ANNUAL', 'RECOVERY', 'SICK', 'UNPAID', 'EXCEPTIONAL')),
  start_date date not null,
  end_date date not null,
  days numeric(6,1) not null check (days > 0),
  reason text,
  cnas_ref text,
  status text not null default 'SUBMITTED'
    check (status in ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED')),
  requested_by uuid references public.sys_users(id) default auth.uid(),
  decided_by uuid references public.sys_users(id),
  decided_at timestamptz,
  decision_note text,
  correspondence_id uuid references public.hr_correspondences(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists hr_leave_requests_emp_idx on public.hr_leave_requests (employee_id, start_date desc);

drop trigger if exists trg_hr_leave_requests_u on public.hr_leave_requests;
create trigger trg_hr_leave_requests_u before update on public.hr_leave_requests
  for each row execute function public.erp_set_updated_at();
drop trigger if exists trg_hr_leave_requests_audit on public.hr_leave_requests;
create trigger trg_hr_leave_requests_audit after insert or update or delete on public.hr_leave_requests
  for each row execute function public.sys_audit_row_change();

alter table public.hr_leave_requests enable row level security;

drop policy if exists hr_leave_read on public.hr_leave_requests;
create policy hr_leave_read on public.hr_leave_requests
  for select to authenticated
  using (public.erp_has_perm('hr_attendance', 'read'::public.rbac_action) or public.erp_can_read_hr_salary());
drop policy if exists hr_leave_insert on public.hr_leave_requests;
create policy hr_leave_insert on public.hr_leave_requests
  for insert to authenticated
  with check (
    status = 'SUBMITTED'
    and decided_by is null
    and correspondence_id is null
    and (public.erp_has_perm('hr_attendance', 'update'::public.rbac_action) or public.erp_can_write_hr_salary_values())
  );
-- Decisions go through hr_leave_decide (security definer); no direct update/delete.

grant select, insert on public.hr_leave_requests to authenticated;

create table if not exists public.hr_leave_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete restrict,
  days numeric(6,1) not null check (days <> 0),
  as_of date not null default current_date,
  reason text not null check (char_length(btrim(reason)) >= 3),
  created_by uuid references public.sys_users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

drop trigger if exists trg_hr_leave_adjustments_audit on public.hr_leave_adjustments;
create trigger trg_hr_leave_adjustments_audit after insert or update or delete on public.hr_leave_adjustments
  for each row execute function public.sys_audit_row_change();

alter table public.hr_leave_adjustments enable row level security;
drop policy if exists hr_leave_adj_read on public.hr_leave_adjustments;
create policy hr_leave_adj_read on public.hr_leave_adjustments
  for select to authenticated
  using (public.erp_has_perm('hr_attendance', 'read'::public.rbac_action) or public.erp_can_read_hr_salary());
drop policy if exists hr_leave_adj_write on public.hr_leave_adjustments;
create policy hr_leave_adj_write on public.hr_leave_adjustments
  for all to authenticated
  using (public.erp_can_write_hr_salary_values())
  with check (public.erp_can_write_hr_salary_values());
grant select, insert, delete on public.hr_leave_adjustments to authenticated;

create or replace function public.hr_leave_decide(p_id uuid, p_status text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.hr_leave_requests%rowtype;
  v_legend text;
  v_number text;
  v_corr uuid;
  v_uid uuid := auth.uid();
begin
  select * into r from public.hr_leave_requests where id = p_id for update;
  if not found then
    raise exception 'Demande introuvable.' using errcode = 'no_data_found';
  end if;

  if p_status = 'CANCELLED' and r.status = 'SUBMITTED' and r.requested_by = v_uid then
    null;
  elsif not public.erp_can_write_hr_salary_values(v_uid) then
    raise exception 'Décision réservée aux RH (SUPER_ADMIN, ADMIN_RH, GERANT).' using errcode = 'insufficient_privilege';
  end if;

  if not (
    (r.status = 'SUBMITTED' and p_status in ('APPROVED', 'REJECTED', 'CANCELLED'))
    or (r.status = 'APPROVED' and p_status = 'CANCELLED')
  ) then
    raise exception 'Transition % → % impossible.', r.status, p_status using errcode = 'check_violation';
  end if;

  if p_status = 'APPROVED' then
    v_legend := case r.kind
      when 'ANNUAL' then 'CA'
      when 'RECOVERY' then 'CRP'
      when 'SICK' then 'CM'
      when 'UNPAID' then 'CSS'
      else 'AOP'
    end;
    v_number := public.hr_next_doc_number('LEAVE');
    insert into public.hr_correspondences
      (employee_id, site_id, type_code, number, status_code, start_date, end_date, payload, created_by)
    values
      (r.employee_id, null, 'LEAVE', v_number, 'ISSUED', r.start_date, r.end_date,
       jsonb_build_object('legend', v_legend, 'leave_request_id', r.id, 'kind', r.kind, 'days', r.days),
       v_uid)
    returning id into v_corr;
    update public.hr_leave_requests
    set status = 'APPROVED', decided_by = v_uid, decided_at = now(), decision_note = p_note,
        correspondence_id = v_corr
    where id = p_id;
    return v_corr;
  end if;

  if r.status = 'APPROVED' and r.correspondence_id is not null then
    update public.hr_correspondences set status_code = 'CANCELLED' where id = r.correspondence_id;
  end if;
  update public.hr_leave_requests
  set status = p_status, decided_by = v_uid, decided_at = now(), decision_note = p_note
  where id = p_id;
  return r.correspondence_id;
end;
$$;

revoke all on function public.hr_leave_decide(uuid, text, text) from public;
grant execute on function public.hr_leave_decide(uuid, text, text) to authenticated;

insert into public.ref_global_vars (key, label_fr, label_ar, value_type, unit) values
  ('CONGE_JOURS_MOIS', 'Congé annuel acquis par mois de travail', 'أيام العطلة السنوية المكتسبة عن كل شهر', 'numeric', 'j')
on conflict (key) do nothing;
insert into public.ref_global_var_versions (var_id, value_numeric, effective_from)
select v.id, 2.5, date '2020-01-01' from public.ref_global_vars v
where v.key = 'CONGE_JOURS_MOIS'
  and not exists (select 1 from public.ref_global_var_versions x where x.var_id = v.id);

-- ---------------------------------------------------------------------------
-- End of employment
-- ---------------------------------------------------------------------------
alter table public.hr_employees
  add column if not exists employment_status text not null default 'ACTIVE',
  add column if not exists exit_date date;
alter table public.hr_employees drop constraint if exists hr_employees_employment_status_chk;
alter table public.hr_employees
  add constraint hr_employees_employment_status_chk check (employment_status in ('ACTIVE', 'EXITED'));

create table if not exists public.hr_employee_exits (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete restrict,
  contract_id uuid references public.hr_contracts(id) on delete set null,
  exit_date date not null,
  reason_code text not null check (reason_code in
    ('END_CDD', 'RESIGNATION', 'DISMISSAL', 'ABANDON', 'MUTUAL', 'TRIAL_END', 'RETIREMENT', 'DEATH', 'OTHER')),
  notes text,
  leave_balance_days numeric(6,1),
  settlement_lines jsonb not null default '[]'::jsonb,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'VALIDATED', 'CANCELLED')),
  created_by uuid references public.sys_users(id) default auth.uid(),
  validated_by uuid references public.sys_users(id),
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists hr_employee_exits_one_open
  on public.hr_employee_exits (employee_id) where status in ('DRAFT', 'VALIDATED');

drop trigger if exists trg_hr_employee_exits_u on public.hr_employee_exits;
create trigger trg_hr_employee_exits_u before update on public.hr_employee_exits
  for each row execute function public.erp_set_updated_at();
drop trigger if exists trg_hr_employee_exits_audit on public.hr_employee_exits;
create trigger trg_hr_employee_exits_audit after insert or update or delete on public.hr_employee_exits
  for each row execute function public.sys_audit_row_change();

alter table public.hr_employee_exits enable row level security;
drop policy if exists hr_exits_read on public.hr_employee_exits;
create policy hr_exits_read on public.hr_employee_exits
  for select to authenticated using (public.erp_can_read_hr_salary());
drop policy if exists hr_exits_write on public.hr_employee_exits;
create policy hr_exits_write on public.hr_employee_exits
  for all to authenticated
  using (public.erp_can_write_hr_salary_values() and status = 'DRAFT')
  with check (public.erp_can_write_hr_salary_values() and status = 'DRAFT');
grant select, insert, update, delete on public.hr_employee_exits to authenticated;

-- Validates (closes contracts, marks the employee EXITED) or cancels an exit.
create or replace function public.hr_exit_set_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  x public.hr_employee_exits%rowtype;
begin
  if not public.erp_can_write_hr_salary_values(auth.uid()) then
    raise exception 'Réservé aux RH (SUPER_ADMIN, ADMIN_RH, GERANT).' using errcode = 'insufficient_privilege';
  end if;
  select * into x from public.hr_employee_exits where id = p_id for update;
  if not found then
    raise exception 'Sortie introuvable.' using errcode = 'no_data_found';
  end if;

  if p_status = 'VALIDATED' and x.status = 'DRAFT' then
    update public.hr_contracts
    set end_date = x.exit_date,
        status = 'ENDED'
    where employee_id = x.employee_id
      and status <> 'ENDED'
      and start_date <= x.exit_date
      and (end_date is null or end_date > x.exit_date);
    update public.hr_contracts
    set status = 'ENDED'
    where employee_id = x.employee_id
      and status <> 'ENDED'
      and end_date is not null and end_date <= x.exit_date;
    update public.hr_employees
    set employment_status = 'EXITED', exit_date = x.exit_date
    where id = x.employee_id;
    update public.hr_employee_exits
    set status = 'VALIDATED', validated_by = auth.uid(), validated_at = now()
    where id = p_id;
  elsif p_status = 'CANCELLED' and x.status in ('DRAFT', 'VALIDATED') then
    if x.status = 'VALIDATED' then
      update public.hr_employees
      set employment_status = 'ACTIVE', exit_date = null
      where id = x.employee_id;
    end if;
    update public.hr_employee_exits set status = 'CANCELLED' where id = p_id;
  else
    raise exception 'Transition % → % impossible.', x.status, p_status using errcode = 'check_violation';
  end if;
end;
$$;

revoke all on function public.hr_exit_set_status(uuid, text) from public;
grant execute on function public.hr_exit_set_status(uuid, text) to authenticated;

alter table public.hr_payroll_slip_lines drop constraint if exists hr_payroll_slip_lines_source_code_check;
alter table public.hr_payroll_slip_lines
  add constraint hr_payroll_slip_lines_source_code_check
  check (source_code in ('base', 'site', 'contract', 'employee', 'exception', 'advance', 'overtime', 'exit'));

commit;
