-- Audit (open point): four HR saves were a chain of separate requests. A failure midway left a partial
-- state: a contract without salary lines, a previous principal contract ended without its successor,
-- rubriques half imported, an employee without civil / contact / bank / social / qualification data.
--
-- Each save becomes one function, so it is all or nothing. They run with the caller's rights: RLS and
-- triggers apply exactly as for the former requests. As with the API, only the keys present in a
-- payload are written; a key that is absent leaves the stored value (update) or the column default
-- (insert) untouched.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Columns of p_table named by the keys of p_row (real, non-generated columns only, minus p_exclude).
create function private.payload_columns(p_table regclass, p_row jsonb, p_exclude text[] default '{}')
returns text[]
language sql
stable
set search_path = pg_catalog
as $$
  select coalesce(array_agg(a.attname::text order by a.attnum), '{}')
  from pg_attribute a
  where a.attrelid = p_table and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    and p_row ? a.attname and not (a.attname = any (p_exclude));
$$;

-- Inserts or updates one row of p_table from a JSON object, writing only the columns it names.
-- p_conflict: conflict column for an upsert (insert path only); p_id: row id for an update.
create function private.write_payload(p_table regclass, p_row jsonb, p_id uuid default null, p_conflict text default null)
returns uuid
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_cols text[] := private.payload_columns(p_table, p_row, array['id', 'created_at', 'updated_at']);
  v_list text;
  v_excluded text;
  v_id uuid;
begin
  if cardinality(v_cols) = 0 then
    raise exception 'Aucune colonne à enregistrer.' using errcode = 'check_violation';
  end if;
  v_list := array_to_string(array(select quote_ident(c) from unnest(v_cols) c), ', ');
  v_excluded := array_to_string(array(select 'excluded.' || quote_ident(c) from unnest(v_cols) c), ', ');
  if p_id is not null then
    execute format('update %s t set (%s) = (select %s from jsonb_populate_record(null::%s, $1)) where t.id = $2 returning t.id',
                   p_table, v_list, v_list, p_table)
      using p_row, p_id into v_id;
  elsif p_conflict is not null then
    execute format('insert into %s as t (%s) select %s from jsonb_populate_record(null::%s, $1) on conflict (%I) do update set (%s) = row(%s)',
                   p_table, v_list, v_list, p_table, p_conflict, v_list, v_excluded)
      using p_row;
  else
    execute format('insert into %s (%s) select %s from jsonb_populate_record(null::%s, $1) returning id',
                   p_table, v_list, v_list, p_table)
      using p_row into v_id;
  end if;
  return v_id;
end;
$$;

revoke execute on function private.payload_columns(regclass, jsonb, text[]) from public, anon;
revoke execute on function private.write_payload(regclass, jsonb, uuid, text) from public, anon;
grant execute on function private.payload_columns(regclass, jsonb, text[]) to authenticated, service_role;
grant execute on function private.write_payload(regclass, jsonb, uuid, text) to authenticated, service_role;

-- 1. Salary lines of a contract (contract-scoped lines) and of its employee (employee-scoped lines).
create function public.hr_salary_assignments_replace(p_contract_id uuid, p_employee_id uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_contract_id is null or p_employee_id is null or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Rubriques de salaire invalides.' using errcode = 'check_violation';
  end if;
  delete from public.hr_salary_assignments where contract_id = p_contract_id;
  delete from public.hr_salary_assignments where employee_id = p_employee_id;
  insert into public.hr_salary_assignments (rubrique_id, employee_id, site_id, contract_id, amount, unit, is_active)
  select rubrique_id, employee_id, site_id, contract_id, amount, unit, is_active
  from jsonb_populate_recordset(null::public.hr_salary_assignments, p_rows);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 2. Rubrique import: assignments of rubriques whose scope changes are cleared, then rubriques upserted by code.
create function public.hr_salary_rubriques_import(p_clear_rubrique_ids uuid[], p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  r jsonb;
  v_cleared integer := 0;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Aucune rubrique à importer.' using errcode = 'check_violation';
  end if;
  if cardinality(coalesce(p_clear_rubrique_ids, '{}')) > 0 then
    delete from public.hr_salary_assignments where rubrique_id = any (p_clear_rubrique_ids);
    get diagnostics v_cleared = row_count;
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    perform private.write_payload('public.hr_salary_rubriques'::regclass, r, null, 'code');
  end loop;
  return v_cleared;
end;
$$;

-- 3. HR contract: earlier principal contracts are ended and the contract saved together.
create function public.hr_contract_save(p_close jsonb, p_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  c jsonb;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Contrat invalide.' using errcode = 'check_violation';
  end if;
  for c in select value from jsonb_array_elements(coalesce(p_close, '[]'::jsonb)) loop
    update public.hr_contracts
    set end_date = (c->>'end_date')::date, status = 'ENDED', updated_at = now()
    where id = (c->>'id')::uuid;
  end loop;
  return private.write_payload('public.hr_contracts'::regclass, p_payload, p_id);
end;
$$;

-- 4. Employee: main record and satellites together. A null satellite is left as stored.
create function public.hr_employee_save(
  p_id uuid,
  p_core jsonb,
  p_civil jsonb default null,
  p_contacts jsonb default null,
  p_bank jsonb default null,
  p_social jsonb default null,
  p_qualification jsonb default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_qual uuid;
  v_key jsonb;
begin
  if jsonb_typeof(p_core) is distinct from 'object' then
    raise exception 'Fiche employé invalide.' using errcode = 'check_violation';
  end if;
  v_id := private.write_payload('public.hr_employees'::regclass, p_core, p_id);
  if v_id is null then
    return null;
  end if;
  v_key := jsonb_build_object('employee_id', v_id);

  if p_civil is not null then
    perform private.write_payload('public.hr_employee_civil'::regclass, p_civil || v_key, null, 'employee_id');
  end if;
  if p_contacts is not null then
    perform private.write_payload('public.hr_employee_contacts'::regclass, p_contacts || v_key, null, 'employee_id');
  end if;
  if p_bank is not null then
    perform private.write_payload('public.hr_employee_bank'::regclass, p_bank || v_key, null, 'employee_id');
  end if;
  if p_social is not null then
    perform private.write_payload('public.hr_employee_social'::regclass, p_social || v_key, null, 'employee_id');
  end if;
  if p_qualification is not null then
    select id into v_qual from public.hr_employee_qualifications where employee_id = v_id order by created_at limit 1;
    perform private.write_payload('public.hr_employee_qualifications'::regclass, p_qualification || v_key, v_qual);
  end if;
  return v_id;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'hr_salary_assignments_replace(uuid,uuid,jsonb)',
    'hr_salary_rubriques_import(uuid[],jsonb)',
    'hr_contract_save(jsonb,uuid,jsonb)',
    'hr_employee_save(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
