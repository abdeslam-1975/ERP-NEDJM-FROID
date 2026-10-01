-- Audit (open point): the attendance sheet was saved by reading each row's JSON, merging in the
-- application and writing the whole JSON back. Two people editing different columns of the same row
-- at the same time lost one of the two edits, and a failure midway left part of the rows saved.
--
-- The merge now happens in the database, key by key, in one transaction: values set by the caller are
-- written, values cleared are removed, every other key is kept as stored at that instant. The function
-- runs with the caller's rights: RLS (site) and the row guard trigger (column rights, locked payroll)
-- apply exactly as before.

create function public.hr_attendance_sheet_merge(
  p_site uuid,
  p_year integer,
  p_month integer,
  p_rows jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  r jsonb;
  v_employee uuid;
  v_set jsonb;
  v_unset text[];
  v_done integer;
  v_count integer := 0;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Lignes de pointage invalides.' using errcode = 'check_violation';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_employee := (r->>'employee_id')::uuid;
    v_set := coalesce(r->'set', '{}'::jsonb);
    v_unset := coalesce(array(select jsonb_array_elements_text(coalesce(r->'unset', '[]'::jsonb))), '{}');
    if v_employee is null or jsonb_typeof(v_set) <> 'object' then
      raise exception 'Ligne de pointage invalide.' using errcode = 'check_violation';
    end if;
    v_set := v_set - v_unset;

    if v_set = '{}'::jsonb then
      update public.hr_attendance_sheet_rows t
      set cell_values = t.cell_values - v_unset
      where t.site_id = p_site and t.employee_id = v_employee
        and t.period_year = p_year and t.period_month = p_month
        and t.cell_values ?| v_unset;
    else
      insert into public.hr_attendance_sheet_rows as t (site_id, employee_id, period_year, period_month, cell_values)
      values (p_site, v_employee, p_year, p_month, v_set)
      on conflict (site_id, employee_id, period_year, period_month) do update
        set cell_values = (t.cell_values || excluded.cell_values) - v_unset
        where ((t.cell_values || excluded.cell_values) - v_unset) is distinct from t.cell_values;
    end if;
    get diagnostics v_done = row_count;
    v_count := v_count + v_done;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.hr_attendance_sheet_merge(uuid, integer, integer, jsonb) from public, anon;
grant execute on function public.hr_attendance_sheet_merge(uuid, integer, integer, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
