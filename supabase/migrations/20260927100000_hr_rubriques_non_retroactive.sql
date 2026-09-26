-- Unit 05: CNAS / CACOBATPH / tax rubriques and CNAS regimes change only from an open payroll month.
-- A month is closed as soon as one of its payroll runs is VALIDATED or LOCKED.

-- ---------------------------------------------------------------------------
-- 1. First month whose payroll can still change
-- ---------------------------------------------------------------------------
create or replace function public.hr_first_open_payroll_month()
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select (make_date(r.period_year, r.period_month, 1) + interval '1 month')::date
      from public.hr_payroll_runs r
      where r.status_code in ('VALIDATED', 'LOCKED')
      order by r.period_year desc, r.period_month desc
      limit 1
    ),
    date '1900-01-01'
  );
$$;

grant execute on function public.hr_first_open_payroll_month() to authenticated;

create or replace function public.hr_closed_period_error(p_open date)
returns text
language sql
stable
as $$
  select 'Paie déjà validée ou clôturée jusqu''au ' || to_char(p_open - 1, 'DD/MM/YYYY')
      || ' : choisissez ' || to_char(p_open, 'MM/YYYY') || ' ou un mois suivant.';
$$;

-- ---------------------------------------------------------------------------
-- 2. Contribution settings follow the dated versions (null = plain variable)
-- ---------------------------------------------------------------------------
alter table public.ref_global_var_versions
  add column if not exists contrib_part text,
  add column if not exists contrib_base text,
  add column if not exists contrib_reduces_irg boolean,
  add column if not exists contrib_scope text;

alter table public.ref_global_var_versions drop constraint if exists ref_varver_contrib_check;
alter table public.ref_global_var_versions
  add constraint ref_varver_contrib_check check (
    (contrib_part is null or contrib_part in ('EMPLOYEE', 'EMPLOYER'))
    and (contrib_base is null or contrib_base in ('COTISABLE', 'TAXABLE'))
    and (contrib_scope is null or contrib_scope in ('ALL', 'CACOBATPH_CONGES', 'CACOBATPH_INTEMPERIES'))
    and (not coalesce(contrib_reduces_irg, false) or contrib_part = 'EMPLOYEE')
  );

update public.ref_global_var_versions x
set contrib_part = v.contrib_part,
    contrib_base = v.contrib_base,
    contrib_reduces_irg = v.contrib_reduces_irg,
    contrib_scope = v.contrib_scope
from public.ref_global_vars v
where v.id = x.var_id and v.contrib_part is not null and x.contrib_part is null;

-- ---------------------------------------------------------------------------
-- 3. Closed months are frozen, whatever the client (RPC, table editor, API)
-- ---------------------------------------------------------------------------
create or replace function public.hr_guard_var_versions_period()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_open date;
begin
  if coalesce(current_setting('erp.allow_closed_period_edit', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  v_open := public.hr_first_open_payroll_month();

  if tg_op = 'INSERT' then
    if public.erp_is_compliance_var(new.var_id) and new.effective_from < v_open then
      raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if public.erp_is_compliance_var(old.var_id) and old.effective_from < v_open then
      raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if not public.erp_is_compliance_var(new.var_id) then
    return new;
  end if;
  if old.effective_from >= v_open then
    if new.effective_from < v_open then
      raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.var_id <> old.var_id
     or new.effective_from <> old.effective_from
     or new.value_numeric is distinct from old.value_numeric
     or new.value_text is distinct from old.value_text
     or new.contrib_part is distinct from old.contrib_part
     or new.contrib_base is distinct from old.contrib_base
     or new.contrib_reduces_irg is distinct from old.contrib_reduces_irg
     or new.contrib_scope is distinct from old.contrib_scope
     or (
       new.effective_to is distinct from old.effective_to
       and (
         (old.effective_to is not null and old.effective_to < v_open - 1)
         or (new.effective_to is not null and new.effective_to < v_open - 1)
       )
     ) then
    raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ref_varver_period_guard on public.ref_global_var_versions;
create trigger trg_ref_varver_period_guard
  before insert or update or delete on public.ref_global_var_versions
  for each row execute function public.hr_guard_var_versions_period();

drop policy if exists ref_varver_compliance_delete on public.ref_global_var_versions;
create policy ref_varver_compliance_delete on public.ref_global_var_versions
  for delete to authenticated
  using (
    public.erp_can_write_hr_compliance()
    and public.erp_is_compliance_var(var_id)
    and effective_from >= public.hr_first_open_payroll_month()
  );

-- ---------------------------------------------------------------------------
-- 4. Dated value (+ contribution settings) from the 1st of an open month
-- ---------------------------------------------------------------------------
drop function if exists public.hr_set_legal_var_version(uuid, date, numeric);

create or replace function public.hr_sync_contribution_columns(p_var_id uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.ref_global_vars v
  set contrib_part = x.contrib_part,
      contrib_base = coalesce(x.contrib_base, v.contrib_base),
      contrib_reduces_irg = coalesce(x.contrib_reduces_irg, false),
      contrib_scope = coalesce(x.contrib_scope, v.contrib_scope)
  from (
    select contrib_part, contrib_base, contrib_reduces_irg, contrib_scope
    from public.ref_global_var_versions
    where var_id = p_var_id and contrib_part is not null
    order by effective_from desc
    limit 1
  ) x
  where v.id = p_var_id and v.contrib_part is not null;
$$;

create or replace function public.hr_set_legal_var_version(
  p_var_id uuid,
  p_from date,
  p_value numeric,
  p_params jsonb default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_var public.ref_global_vars%rowtype;
  v_open date := public.hr_first_open_payroll_month();
  v_same public.ref_global_var_versions%rowtype;
  v_prev public.ref_global_var_versions%rowtype;
  v_src public.ref_global_var_versions%rowtype;
  v_next_from date;
  v_part text;
  v_base text;
  v_reduces boolean;
  v_scope text;
  v_id uuid;
begin
  if not (public.erp_can_write_hr_compliance() and public.erp_is_compliance_var(p_var_id)) then
    raise exception 'Modification réservée à l''unité 05.' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_value is null then
    raise exception 'Mois et valeur requis.' using errcode = 'check_violation';
  end if;
  if extract(day from p_from) <> 1 then
    raise exception 'La date d''effet doit être le 1er d''un mois (la paie lit la valeur du 1er).'
      using errcode = 'check_violation';
  end if;
  if p_from < v_open then
    raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
  end if;

  select * into v_var from public.ref_global_vars where id = p_var_id;

  select * into v_same
  from public.ref_global_var_versions
  where var_id = p_var_id and effective_from = p_from
  for update;

  select * into v_prev
  from public.ref_global_var_versions
  where var_id = p_var_id and effective_from < p_from
  order by effective_from desc
  limit 1
  for update;

  if v_var.contrib_part is not null then
    if v_same.id is not null then
      v_src := v_same;
    else
      v_src := v_prev;
    end if;
    v_part := coalesce(nullif(p_params->>'part', ''), v_src.contrib_part, v_var.contrib_part);
    v_base := coalesce(nullif(p_params->>'base', ''), v_src.contrib_base, v_var.contrib_base, 'COTISABLE');
    v_reduces := coalesce((p_params->>'reduces_irg')::boolean, v_src.contrib_reduces_irg, v_var.contrib_reduces_irg, false);
    v_scope := coalesce(nullif(p_params->>'scope', ''), v_src.contrib_scope, v_var.contrib_scope, 'ALL');
    if v_part = 'EMPLOYER' then
      v_reduces := false;
    end if;
  end if;

  if v_same.id is not null then
    update public.ref_global_var_versions
    set value_numeric = p_value,
        contrib_part = v_part,
        contrib_base = case when v_part is null then null else v_base end,
        contrib_reduces_irg = case when v_part is null then null else v_reduces end,
        contrib_scope = case when v_part is null then null else v_scope end,
        created_by = auth.uid()
    where id = v_same.id;
    v_id := v_same.id;
  else
    select min(effective_from) into v_next_from
    from public.ref_global_var_versions
    where var_id = p_var_id and effective_from > p_from;

    if v_prev.id is not null and (v_prev.effective_to is null or v_prev.effective_to >= p_from) then
      update public.ref_global_var_versions
      set effective_to = p_from - 1
      where id = v_prev.id;
    end if;

    insert into public.ref_global_var_versions (
      var_id, value_numeric, effective_from, effective_to, created_by,
      contrib_part, contrib_base, contrib_reduces_irg, contrib_scope
    )
    values (
      p_var_id, p_value, p_from,
      case when v_next_from is null then null else v_next_from - 1 end,
      auth.uid(),
      v_part,
      case when v_part is null then null else v_base end,
      case when v_part is null then null else v_reduces end,
      case when v_part is null then null else v_scope end
    )
    returning id into v_id;
  end if;

  perform public.hr_sync_contribution_columns(p_var_id);
  return v_id;
end;
$$;

create or replace function public.hr_cancel_legal_var_version(p_version_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.ref_global_var_versions%rowtype;
  v_open date := public.hr_first_open_payroll_month();
  v_prev public.ref_global_var_versions%rowtype;
begin
  select * into v_row from public.ref_global_var_versions where id = p_version_id for update;
  if v_row.id is null then
    raise exception 'Version introuvable.' using errcode = 'no_data_found';
  end if;
  if not (public.erp_can_write_hr_compliance() and public.erp_is_compliance_var(v_row.var_id)) then
    raise exception 'Modification réservée à l''unité 05.' using errcode = 'insufficient_privilege';
  end if;
  if v_row.effective_from < v_open then
    raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
  end if;

  delete from public.ref_global_var_versions where id = p_version_id;

  select * into v_prev
  from public.ref_global_var_versions
  where var_id = v_row.var_id and effective_from < v_row.effective_from
  order by effective_from desc
  limit 1;

  if v_prev.id is not null and v_prev.effective_to = v_row.effective_from - 1 then
    update public.ref_global_var_versions
    set effective_to = v_row.effective_to
    where id = v_prev.id;
  end if;

  perform public.hr_sync_contribution_columns(v_row.var_id);
end;
$$;

-- Stop a user-defined contribution from the 1st of an open month; earlier months keep it.
create or replace function public.hr_stop_legal_var(p_var_id uuid, p_from date)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_var public.ref_global_vars%rowtype;
  v_open date := public.hr_first_open_payroll_month();
begin
  select * into v_var from public.ref_global_vars where id = p_var_id;
  if v_var.id is null or not (public.erp_can_write_hr_compliance() and public.erp_is_compliance_key(v_var.key)) then
    raise exception 'Modification réservée à l''unité 05.' using errcode = 'insufficient_privilege';
  end if;
  if v_var.is_system or v_var.contrib_part is null then
    raise exception 'Seules les cotisations ajoutées peuvent être arrêtées.' using errcode = 'check_violation';
  end if;
  if p_from is null or extract(day from p_from) <> 1 then
    raise exception 'La date d''arrêt doit être le 1er d''un mois.' using errcode = 'check_violation';
  end if;
  if p_from < v_open then
    raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
  end if;

  delete from public.ref_global_var_versions where var_id = p_var_id and effective_from >= p_from;
  update public.ref_global_var_versions
  set effective_to = p_from - 1
  where var_id = p_var_id
    and effective_from < p_from
    and (effective_to is null or effective_to >= p_from);
end;
$$;

grant execute on function public.hr_set_legal_var_version(uuid, date, numeric, jsonb) to authenticated;
grant execute on function public.hr_cancel_legal_var_version(uuid) to authenticated;
grant execute on function public.hr_stop_legal_var(uuid, date) to authenticated;
grant execute on function public.hr_sync_contribution_columns(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. A contribution already on payslips cannot be erased (stop it instead)
-- ---------------------------------------------------------------------------
create or replace function public.hr_used_contribution_keys()
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct e->>'key'
  from public.hr_payroll_slips s
  cross join lateral jsonb_array_elements(s.extra_contributions) e
  where public.erp_can_read_hr_compliance() and jsonb_typeof(s.extra_contributions) = 'array';
$$;

grant execute on function public.hr_used_contribution_keys() to authenticated;

create or replace function public.hr_guard_used_contribution()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.contrib_part is not null and (
    exists (
      select 1 from public.hr_payroll_slips s
      where s.extra_contributions @> jsonb_build_array(jsonb_build_object('key', old.key))
    )
    or exists (
      select 1 from public.ref_global_var_versions x
      where x.var_id = old.id and x.effective_from < public.hr_first_open_payroll_month()
    )
  ) then
    raise exception 'Cotisation déjà appliquée sur des bulletins : utilisez « Arrêter » pour la stopper sans toucher au passé.'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_ref_vars_used_contribution on public.ref_global_vars;
create trigger trg_ref_vars_used_contribution
  before delete on public.ref_global_vars
  for each row execute function public.hr_guard_used_contribution();

-- ---------------------------------------------------------------------------
-- 6. CNAS regimes: dated rates (null = legal rate of the month)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_social_profile_rates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.hr_catalogs(id) on delete cascade,
  employee_pct numeric(9,4) check (employee_pct between 0 and 100),
  employer_pct numeric(9,4) check (employer_pct between 0 and 100),
  fos_pct numeric(9,4) check (fos_pct between 0 and 100),
  effective_from date not null,
  effective_to date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hr_social_profile_rates_dates check (effective_to is null or effective_to >= effective_from),
  constraint hr_social_profile_rates_no_overlap exclude using gist (
    profile_id with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
);

create index if not exists hr_social_profile_rates_profile_idx
  on public.hr_social_profile_rates (profile_id, effective_from desc);

alter table public.hr_social_profile_rates enable row level security;

drop policy if exists hr_spr_read on public.hr_social_profile_rates;
create policy hr_spr_read on public.hr_social_profile_rates
  for select to authenticated using (true);
drop policy if exists hr_spr_insert on public.hr_social_profile_rates;
create policy hr_spr_insert on public.hr_social_profile_rates
  for insert to authenticated with check (public.erp_can_write_hr_compliance());
drop policy if exists hr_spr_update on public.hr_social_profile_rates;
create policy hr_spr_update on public.hr_social_profile_rates
  for update to authenticated
  using (public.erp_can_write_hr_compliance())
  with check (public.erp_can_write_hr_compliance());
drop policy if exists hr_spr_delete on public.hr_social_profile_rates;
create policy hr_spr_delete on public.hr_social_profile_rates
  for delete to authenticated
  using (public.erp_can_write_hr_compliance() and effective_from >= public.hr_first_open_payroll_month());

grant select, insert, update, delete on public.hr_social_profile_rates to authenticated;

insert into public.hr_social_profile_rates (profile_id, employee_pct, employer_pct, fos_pct, effective_from)
select c.id,
       case when c.extra->>'employee_pct' ~ '^[0-9]+([.,][0-9]+)?$' then replace(c.extra->>'employee_pct', ',', '.')::numeric end,
       case when c.extra->>'employer_pct' ~ '^[0-9]+([.,][0-9]+)?$' then replace(c.extra->>'employer_pct', ',', '.')::numeric end,
       case when c.extra->>'fos_pct' ~ '^[0-9]+([.,][0-9]+)?$' then replace(c.extra->>'fos_pct', ',', '.')::numeric end,
       date '2000-01-01'
from public.hr_catalogs c
where c.kind = 'social_profile'
  and (c.extra ? 'employee_pct' or c.extra ? 'employer_pct' or c.extra ? 'fos_pct')
  and not exists (select 1 from public.hr_social_profile_rates r where r.profile_id = c.id);

update public.hr_catalogs
set extra = extra - 'employee_pct' - 'employer_pct' - 'fos_pct'
where kind = 'social_profile'
  and (extra ? 'employee_pct' or extra ? 'employer_pct' or extra ? 'fos_pct');

create or replace function public.hr_guard_social_rates_period()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_open date;
begin
  if coalesce(current_setting('erp.allow_closed_period_edit', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  v_open := public.hr_first_open_payroll_month();

  if tg_op = 'INSERT' then
    if new.effective_from < v_open then
      raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.effective_from < v_open
       and exists (select 1 from public.hr_catalogs c where c.id = old.profile_id) then
      raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if old.effective_from >= v_open then
    if new.effective_from < v_open then
      raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.profile_id <> old.profile_id
     or new.effective_from <> old.effective_from
     or new.employee_pct is distinct from old.employee_pct
     or new.employer_pct is distinct from old.employer_pct
     or new.fos_pct is distinct from old.fos_pct
     or (
       new.effective_to is distinct from old.effective_to
       and (
         (old.effective_to is not null and old.effective_to < v_open - 1)
         or (new.effective_to is not null and new.effective_to < v_open - 1)
       )
     ) then
    raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_spr_period_guard on public.hr_social_profile_rates;
create trigger trg_hr_spr_period_guard
  before insert or update or delete on public.hr_social_profile_rates
  for each row execute function public.hr_guard_social_rates_period();

create or replace function public.hr_set_social_profile_rates(
  p_profile_id uuid,
  p_from date,
  p_employee numeric,
  p_employer numeric,
  p_fos numeric
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_open date := public.hr_first_open_payroll_month();
  v_same uuid;
  v_prev public.hr_social_profile_rates%rowtype;
  v_next_from date;
  v_id uuid;
begin
  if not public.erp_can_write_hr_compliance() then
    raise exception 'Modification réservée à l''unité 05.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.hr_catalogs where id = p_profile_id and kind = 'social_profile') then
    raise exception 'Régime introuvable.' using errcode = 'no_data_found';
  end if;
  if p_from is null or extract(day from p_from) <> 1 then
    raise exception 'La date d''effet doit être le 1er d''un mois.' using errcode = 'check_violation';
  end if;
  if p_from < v_open then
    raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
  end if;

  select id into v_same
  from public.hr_social_profile_rates
  where profile_id = p_profile_id and effective_from = p_from
  for update;
  if v_same is not null then
    update public.hr_social_profile_rates
    set employee_pct = p_employee, employer_pct = p_employer, fos_pct = p_fos, created_by = auth.uid()
    where id = v_same;
    return v_same;
  end if;

  select * into v_prev
  from public.hr_social_profile_rates
  where profile_id = p_profile_id and effective_from < p_from
  order by effective_from desc
  limit 1
  for update;
  select min(effective_from) into v_next_from
  from public.hr_social_profile_rates
  where profile_id = p_profile_id and effective_from > p_from;

  if v_prev.id is not null and (v_prev.effective_to is null or v_prev.effective_to >= p_from) then
    update public.hr_social_profile_rates set effective_to = p_from - 1 where id = v_prev.id;
  end if;

  insert into public.hr_social_profile_rates (profile_id, employee_pct, employer_pct, fos_pct, effective_from, effective_to)
  values (p_profile_id, p_employee, p_employer, p_fos, p_from, case when v_next_from is null then null else v_next_from - 1 end)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.hr_cancel_social_profile_rates(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.hr_social_profile_rates%rowtype;
  v_open date := public.hr_first_open_payroll_month();
  v_prev public.hr_social_profile_rates%rowtype;
begin
  if not public.erp_can_write_hr_compliance() then
    raise exception 'Modification réservée à l''unité 05.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_row from public.hr_social_profile_rates where id = p_id for update;
  if v_row.id is null then
    raise exception 'Version introuvable.' using errcode = 'no_data_found';
  end if;
  if v_row.effective_from < v_open then
    raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
  end if;

  delete from public.hr_social_profile_rates where id = p_id;

  select * into v_prev
  from public.hr_social_profile_rates
  where profile_id = v_row.profile_id and effective_from < v_row.effective_from
  order by effective_from desc
  limit 1;

  if v_prev.id is not null and v_prev.effective_to = v_row.effective_from - 1 then
    update public.hr_social_profile_rates
    set effective_to = v_row.effective_to
    where id = v_prev.id;
  end if;
end;
$$;

grant execute on function public.hr_set_social_profile_rates(uuid, date, numeric, numeric, numeric) to authenticated;
grant execute on function public.hr_cancel_social_profile_rates(uuid) to authenticated;
