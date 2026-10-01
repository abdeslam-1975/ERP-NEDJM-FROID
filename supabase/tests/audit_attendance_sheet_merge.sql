-- Audit attendance sheet merge (rollback only). Expects the fixtures of the local runner:
-- SUPER_ADMIN a2.01, ADMIN_RH a2.02.
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
end $$;

do $$
declare
  v_site uuid;
  v_emp uuid;
  v_vals jsonb;
  n_a integer;
  n_b integer;
  n_same integer;
  n_unset integer;
  v_rh_allowed boolean;
  v_rh text := '-';
  v_bad text := '-';
begin
  select id into v_site from public.ref_sites limit 1;
  select id into v_emp from public.hr_employees limit 1;
  if v_site is null or v_emp is null then
    raise exception 'RESULT: SKIP (no site or employee)';
  end if;
  delete from public.hr_attendance_sheet_rows where site_id = v_site and employee_id = v_emp and period_year = 2031 and period_month = 5;

  set local role authenticated;
  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000001');

  perform public.hr_attendance_sheet_merge(v_site, 2031, 5,
    jsonb_build_array(jsonb_build_object('employee_id', v_emp, 'set', jsonb_build_object('HS50', '2'))));
  -- Two people opened the row when it held HS50 = 2; each saves a different column.
  n_a := public.hr_attendance_sheet_merge(v_site, 2031, 5,
    jsonb_build_array(jsonb_build_object('employee_id', v_emp, 'set', jsonb_build_object('HS75', '3'))));
  n_b := public.hr_attendance_sheet_merge(v_site, 2031, 5,
    jsonb_build_array(jsonb_build_object('employee_id', v_emp, 'set', jsonb_build_object('COMMENTAIRE', 'chantier B'))));
  n_same := public.hr_attendance_sheet_merge(v_site, 2031, 5,
    jsonb_build_array(jsonb_build_object('employee_id', v_emp, 'set', jsonb_build_object('HS75', '3'))));
  n_unset := public.hr_attendance_sheet_merge(v_site, 2031, 5,
    jsonb_build_array(jsonb_build_object('employee_id', v_emp, 'set', '{}'::jsonb, 'unset', jsonb_build_array('HS50'))));

  select cell_values into v_vals from public.hr_attendance_sheet_rows
  where site_id = v_site and employee_id = v_emp and period_year = 2031 and period_month = 5;

  begin
    perform public.hr_attendance_sheet_merge(v_site, 2031, 5, '{"not":"an array"}'::jsonb);
  exception when others then v_bad := sqlstate;
  end;

  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000002');
  v_rh_allowed := public.hr_att_col_allowed('VALIDATION', true, v_site);
  begin
    perform public.hr_attendance_sheet_merge(v_site, 2031, 5,
      jsonb_build_array(jsonb_build_object('employee_id', v_emp, 'set', jsonb_build_object('VALIDATION', 'OK'))));
  exception when others then v_rh := sqlstate;
  end;
  reset role;

  if v_vals is distinct from '{"HS75": "3", "COMMENTAIRE": "chantier B"}'::jsonb
     or n_a <> 1 or n_b <> 1 or n_same <> 0 or n_unset <> 1 or v_bad <> '23514'
     or (not v_rh_allowed and v_rh <> '42501') then
    raise exception 'RESULT: FAIL values=% a=% b=% same=% unset=% bad=% rh_allowed=% rh=%',
      v_vals, n_a, n_b, n_same, n_unset, v_bad, v_rh_allowed, v_rh;
  end if;
  raise notice 'RESULT: PASS attendance merge (concurrent edits on different columns both kept, unchanged save = 0 row, clear removes the key, invalid payload refused, column rights still enforced: rh_allowed=% rh=%)', v_rh_allowed, v_rh;
end;
$$;
