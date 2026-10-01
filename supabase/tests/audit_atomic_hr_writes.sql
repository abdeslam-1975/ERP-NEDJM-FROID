-- Audit atomic HR writes (rollback only). Expects the fixtures of the local runner: SUPER_ADMIN a2.01.
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
end $$;

do $$
declare
  v_site uuid;
  v_emp uuid;
  v_activity uuid;
  v_rub uuid;
  v_first text;
  base jsonb;
  c1 uuid;
  c2 uuid;
  v_n integer;
  e_contract text := '-';
  e_lines text := '-';
  e_import text := '-';
  e_employee text := '-';
  s_c1 text;
  s_c2 text;
  v_lines integer;
  v_label text;
  v_last text;
  v_first_after text;
  v_sex text;
  v_phone text;
  v_qual_count integer;
begin
  select id into v_site from public.ref_sites limit 1;
  select id, first_name into v_emp, v_first from public.hr_employees
  where not exists (select 1 from public.hr_contracts c where c.employee_id = hr_employees.id) limit 1;
  select id into v_activity from public.ref_activity_codes limit 1;
  select id into v_rub from public.hr_salary_rubriques where is_active and apply_scope = 'contract' limit 1;
  if v_site is null or v_emp is null or v_activity is null or v_rub is null then
    raise exception 'RESULT: SKIP (site, employee without contract, activity code or contract rubrique missing)';
  end if;

  set local role authenticated;
  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000001');

  -- 3. Contract: create, then a successor that ends the first one in the same call.
  base := jsonb_build_object('employee_id', v_emp, 'site_id', v_site, 'activity_code_id', v_activity,
    'salaire_base_monthly', 40000, 'salaire_net_ref_monthly', 35000, 'affectation_principale', true,
    'status', 'ACTIVE', 'currency', 'DZD');
  c1 := public.hr_contract_save(null, null, base || jsonb_build_object('start_date', '2031-01-01'));
  c2 := public.hr_contract_save(jsonb_build_array(jsonb_build_object('id', c1, 'end_date', '2031-05-31')), null,
    base || jsonb_build_object('start_date', '2031-06-01'));
  -- A failing save must not end c2.
  begin
    perform public.hr_contract_save(jsonb_build_array(jsonb_build_object('id', c2, 'end_date', '2031-08-31')), null,
      base || jsonb_build_object('start_date', '2031-09-01', 'salaire_base_monthly', -1));
  exception when others then e_contract := sqlstate;
  end;
  select status || ':' || coalesce(end_date::text, 'open') into s_c1 from public.hr_contracts where id = c1;
  select status || ':' || coalesce(end_date::text, 'open') into s_c2 from public.hr_contracts where id = c2;

  -- 1. Salary lines: replaced together, or not at all.
  v_n := public.hr_salary_assignments_replace(c2, v_emp, jsonb_build_array(jsonb_build_object(
    'rubrique_id', v_rub, 'employee_id', null, 'site_id', null, 'contract_id', c2, 'amount', 1500, 'unit', 'month', 'is_active', true)));
  begin
    perform public.hr_salary_assignments_replace(c2, v_emp, jsonb_build_array(jsonb_build_object(
      'rubrique_id', gen_random_uuid(), 'employee_id', null, 'site_id', null, 'contract_id', c2, 'amount', 99, 'unit', 'month', 'is_active', true)));
  exception when others then e_lines := sqlstate;
  end;
  select count(*) into v_lines from public.hr_salary_assignments where contract_id = c2 and amount = 1500;

  -- 2. Rubrique import: one bad row cancels the whole import.
  perform public.hr_salary_rubriques_import(null, jsonb_build_array(jsonb_build_object(
    'code', 'AUDX', 'label_fr', 'Audit X', 'label_ar', 'تدقيق', 'nature', 'prime', 'unit', 'month', 'category', '1',
    'apply_scope', 'contract', 'default_amount', 0, 'sort_order', 900, 'is_active', true)));
  begin
    perform public.hr_salary_rubriques_import(null, jsonb_build_array(
      jsonb_build_object('code', 'AUDX', 'label_fr', 'Audit X modifié', 'label_ar', 'تدقيق', 'nature', 'prime', 'unit', 'month',
        'category', '1', 'apply_scope', 'contract', 'default_amount', 0, 'sort_order', 900, 'is_active', true),
      jsonb_build_object('code', 'AUDY', 'label_fr', 'Audit Y', 'label_ar', 'تدقيق', 'nature', 'prime', 'unit', 'month',
        'category', '9', 'apply_scope', 'contract', 'default_amount', 0, 'sort_order', 901, 'is_active', true)));
  exception when others then e_import := sqlstate;
  end;
  select label_fr into v_label from public.hr_salary_rubriques where code = 'AUDX';

  -- 4. Employee: main record and satellites together; absent keys keep their value.
  perform public.hr_employee_save(v_emp, jsonb_build_object('last_name', 'AUDIT'),
    jsonb_build_object('sex_code', 'M'), jsonb_build_object('phone', '0550000000'), null, null,
    jsonb_build_object('level_code', 'L1', 'languages', 'FR'));
  begin
    perform public.hr_employee_save(v_emp, jsonb_build_object('last_name', 'NE-DOIT-PAS-RESTER'),
      jsonb_build_object('sex_code', 'F'), null, null, jsonb_build_object('declaration_date', 'pas-une-date'), null);
  exception when others then e_employee := sqlstate;
  end;
  select last_name, first_name into v_last, v_first_after from public.hr_employees where id = v_emp;
  select sex_code into v_sex from public.hr_employee_civil where employee_id = v_emp;
  select phone into v_phone from public.hr_employee_contacts where employee_id = v_emp;
  select count(*) into v_qual_count from public.hr_employee_qualifications where employee_id = v_emp;
  reset role;

  if s_c1 <> 'ENDED:2031-05-31' or s_c2 <> 'ACTIVE:open' or e_contract = '-'
     or v_n <> 1 or e_lines = '-' or v_lines <> 1
     or e_import = '-' or v_label <> 'Audit X'
     or e_employee = '-' or v_last <> 'AUDIT' or v_first_after is distinct from v_first
     or v_sex <> 'M' or v_phone <> '0550000000' or v_qual_count <> 1 then
    raise exception 'RESULT: FAIL contracts=%/% err=% lines=%/% err=% import=% err=% employee=%/%/%/%/% qual=% err=%',
      s_c1, s_c2, e_contract, v_n, v_lines, e_lines, v_label, e_import, v_last, v_first_after, v_first, v_sex, v_phone, v_qual_count, e_employee;
  end if;
  raise notice 'RESULT: PASS atomic HR writes (contract close+save together, failed save keeps the successor open [%], salary lines all-or-nothing [%], rubrique import all-or-nothing [%], employee + satellites all-or-nothing [%], absent keys untouched)',
    e_contract, e_lines, e_import, e_employee;
end;
$$;
