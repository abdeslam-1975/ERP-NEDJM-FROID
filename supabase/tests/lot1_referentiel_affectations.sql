do $$
declare
  boss uuid; site_a uuid; site_t uuid; emp uuid; act uuid;
  c1 uuid; c2 uuid; c3 uuid; a_init uuid; a_off uuid;
  d8 uuid; d8b uuid; d13a uuid; d13b uuid; d13c uuid; fp text; res jsonb; n int;
  m text;
  bad text := '';
begin
  select usr.user_id into boss from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'SUPER_ADMIN' limit 1;
  select id into site_a from ref_sites where is_active order by created_at limit 1;
  select id into emp from hr_employees order by created_at limit 1;
  select id into act from ref_activity_codes limit 1;
  if boss is null or site_a is null or emp is null or act is null then
    raise exception 'RESULT: SKIP (no super admin, active site, employee or activity code)';
  end if;

  if has_function_privilege('authenticated', 'public.ref_site_wilaya_at(uuid,date)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_contract_assignment_refresh_current(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_decision_apply_d8(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_decision_apply_d13(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.sys_decision_refresh_record(uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_contract_assignment_change(uuid,uuid,date,text,text)', 'execute')
     or has_function_privilege('anon', 'public.hr_contract_start_rule_activate()', 'execute') then
    bad := bad || 'internal_function_exposed ';
  end if;
  if (select count(*) from ref_wilayas) <> 69 then bad := bad || 'wilaya_count '; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', boss, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', boss::text, true);

  -- Dated site wilaya
  insert into ref_sites (code, name_fr, wilaya_code) values ('ZZ-LOT1', 'Chantier test lot 1', '31') returning id into site_t;
  if (select wilaya from ref_sites where id = site_t) is distinct from 'Oran' then bad := bad || 'wilaya_name_not_derived '; end if;
  if not exists (select 1 from ref_site_wilaya_history where site_id = site_t and effective_from = date '2000-01-01' and wilaya_code = '31') then
    bad := bad || 'initial_wilaya_missing ';
  end if;
  m := '-'; begin update ref_sites set wilaya_code = '16' where id = site_t; exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'direct_wilaya_update '; end if;
  m := '-'; begin perform ref_site_wilaya_confirm(site_t, '16', 'Deuxième confirmation'); exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'wilaya_confirmed_twice '; end if;
  m := '-'; begin perform ref_site_wilaya_change(site_t, '16', date '2031-01-15', 'Découpage', null); exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'wilaya_change_mid_month '; end if;
  m := '-'; begin perform ref_site_wilaya_change(site_t, '16', date '2026-08-01', 'Découpage', null); exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'wilaya_change_processed_month '; end if;
  perform ref_site_wilaya_change(site_t, '16', date '2031-01-01', 'Nouveau découpage territorial', 'JO test');
  if ref_site_wilaya_at(site_t, date '2030-12-01') <> '31' or ref_site_wilaya_at(site_t, date '2031-01-01') <> '16' then
    bad := bad || 'wilaya_not_dated ';
  end if;
  m := '-'; begin perform ref_site_wilaya_change(site_t, '16', date '2031-02-01', 'Même wilaya', null); exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'same_wilaya_change '; end if;

  -- Contracts start on the 1st, the site changes only through dated assignments
  m := '-';
  begin
    insert into hr_contracts (employee_id, site_id, activity_code_id, salaire_base_monthly, salaire_net_ref_monthly, start_date, status)
    values (emp, site_a, act, 50000, 40000, date '2031-01-15', 'ACTIVE');
  exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'mid_month_contract_created '; end if;

  insert into hr_contracts (employee_id, site_id, activity_code_id, salaire_base_monthly, salaire_net_ref_monthly, start_date, status)
  values (emp, site_a, act, 50000, 40000, date '2031-01-01', 'ACTIVE') returning id into c1;
  select id into a_init from hr_contract_assignments where contract_id = c1 and kind = 'INITIAL' and site_id = site_a
    and effective_from = date '2031-01-01';
  if a_init is null then bad := bad || 'initial_assignment_missing '; end if;

  m := '-'; begin update hr_contracts set site_id = site_t where id = c1; exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'direct_site_update '; end if;
  m := '-'; begin perform hr_contract_assignment_change(c1, site_t, date '2031-03-15', 'Mutation', null); exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'assignment_mid_month '; end if;
  m := '-'; begin perform hr_contract_assignment_change(c1, site_a, date '2031-03-01', 'Même chantier', null); exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'assignment_same_site '; end if;
  a_off := hr_contract_assignment_change(c1, site_t, date '2031-03-01', 'Mutation officielle', 'Note 12');
  if hr_contract_site_at(c1, date '2031-02-01') <> site_a or hr_contract_site_at(c1, date '2031-03-01') <> site_t then
    bad := bad || 'assignment_not_dated ';
  end if;
  if (select count(*) from hr_attendance_roster() r where r.employee_id = emp and r.start_date >= date '2031-01-01') <> 2 then
    bad := bad || 'roster_not_split_by_period ';
  end if;
  m := '-'; begin perform hr_contract_assignment_delete(a_init); exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'initial_assignment_deleted '; end if;
  m := '-'; begin update hr_contracts set start_date = date '2031-03-01' where id = c1; exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'start_moved_past_official_change '; end if;

  -- D8: correction of an input error, non-processed months only, applied with the decision
  d8 := hr_assignment_request_correction(a_init, site_t, 'Erreur de saisie du chantier initial');
  d8b := hr_assignment_request_correction(a_init, site_t, 'Erreur de saisie du chantier initial');
  if d8 is distinct from d8b then bad := bad || 'd8_not_deduplicated '; end if;
  if not exists (select 1 from sys_notifications where decision_id = d8 and recipient_screen = 'decision_assignment_correction') then
    bad := bad || 'd8_not_notified ';
  end if;
  select fingerprint into fp from sys_decisions where id = d8;
  m := '-'; begin perform sys_decision_decide(d8, 'APPLY_CORRECTION', 'Regression rollback lot 1', fp, false); exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'd8_without_risk_ack '; end if;
  res := sys_decision_decide(d8, 'APPLY_CORRECTION', 'Regression rollback lot 1', fp, true);
  if (res->>'applied')::boolean is not true or res->>'status' <> 'EXECUTED' then bad := bad || 'd8_not_applied '; end if;
  if not exists (select 1 from hr_contract_assignments where id = a_init and site_id = site_t and corrected_by_decision = d8) then
    bad := bad || 'd8_assignment_not_corrected ';
  end if;

  -- D8 refused on months already processed (D7, lot 3)
  insert into hr_contracts (employee_id, site_id, activity_code_id, salaire_base_monthly, salaire_net_ref_monthly, start_date, end_date, status)
  values (emp, site_a, act, 50000, 40000, date '2026-03-01', date '2026-06-30', 'ENDED') returning id into c2;
  m := '-';
  begin
    perform hr_assignment_request_correction(
      (select id from hr_contract_assignments where contract_id = c2 and kind = 'INITIAL'), site_t, 'Erreur de saisie ancienne');
  exception when others then m := sqlerrm; end;
  if m = '-' or m not like '%D7%' then bad := bad || 'd8_on_processed_month '; end if;

  -- D13: existing contracts not starting on the 1st (legacy data, inserted without the start-date guard)
  alter table hr_contracts disable trigger trg_hr_contract_dates_guard;
  insert into hr_contracts (employee_id, site_id, activity_code_id, salaire_base_monthly, salaire_net_ref_monthly, start_date, status)
  values (emp, site_a, act, 50000, 40000, date '2031-05-15', 'ACTIVE') returning id into c2;
  insert into hr_contracts (employee_id, site_id, activity_code_id, salaire_base_monthly, salaire_net_ref_monthly, start_date, end_date, status)
  values (emp, site_a, act, 50000, 40000, date '2026-03-10', date '2026-04-30', 'ENDED') returning id into c3;
  alter table hr_contracts enable trigger trg_hr_contract_dates_guard;

  if not exists (select 1 from hr_data_quality_contracts() q where q.contract_id = c2 and q.fix_allowed)
     or not exists (select 1 from hr_data_quality_contracts() q where q.contract_id = c3 and not q.fix_allowed) then
    bad := bad || 'quality_report ';
  end if;
  m := '-'; begin perform hr_contract_start_rule_activate(); exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'rule_activated_with_pending '; end if;

  n := hr_contract_start_request_all();
  select id into d13a from sys_decisions where dedupe_key = 'D13:' || c2 and status = 'PENDING';
  select id into d13b from sys_decisions where dedupe_key = 'D13:' || c3 and status = 'PENDING';
  if n < 2 or d13a is null or d13b is null then bad := bad || 'd13_not_requested '; end if;
  if hr_contract_start_request(c2) is distinct from d13a then bad := bad || 'd13_not_deduplicated '; end if;

  m := '-'; begin update hr_contracts set start_date_exception = true where id = c3; exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'exception_without_decision '; end if;

  select fingerprint into fp from sys_decisions where id = d13a;
  res := sys_decision_decide(d13a, 'FIX_START', 'Regression rollback lot 1', fp, false);
  if (res->>'applied')::boolean is not true then bad := bad || 'd13_fix_not_applied '; end if;
  if (select start_date from hr_contracts where id = c2) <> date '2031-05-01' then bad := bad || 'd13_start_not_fixed '; end if;

  select fingerprint into fp from sys_decisions where id = d13b;
  m := '-'; begin perform sys_decision_decide(d13b, 'FIX_START', 'Regression rollback lot 1', fp, false); exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'd13_fix_on_processed_month '; end if;
  if (select status from sys_decisions where id = d13b) <> 'PENDING' then bad := bad || 'd13_failed_fix_not_rolled_back '; end if;
  res := sys_decision_decide(d13b, 'HISTORICAL_EXCEPTION', 'Regression rollback lot 1', fp, false);
  if not exists (select 1 from hr_contracts where id = c3 and start_date = date '2026-03-10'
                 and start_date_exception and start_exception_decision = d13b) then
    bad := bad || 'd13_exception_not_documented ';
  end if;

  -- A request whose contract became compliant meanwhile is closed, nothing is applied
  alter table hr_contracts disable trigger trg_hr_contract_dates_guard;
  update hr_contracts set start_date = date '2031-07-20' where id = c2;
  alter table hr_contracts enable trigger trg_hr_contract_dates_guard;
  d13c := hr_contract_start_request(c2);
  select fingerprint into fp from sys_decisions where id = d13c;
  perform set_config('hr.contract_start', 'on', true);
  update hr_contracts set start_date_exception = true where id = c2;
  perform set_config('hr.contract_start', '', true);
  res := sys_decision_decide(d13c, 'FIX_START', 'Regression rollback lot 1', fp, false);
  if res->>'reason' is distinct from 'CLOSED' or (select start_date from hr_contracts where id = c2) <> date '2031-07-20' then
    bad := bad || 'd13_stale_not_closed ';
  end if;

  -- Constraint added once every decision is taken
  if (select count(*) from hr_contracts where extract(day from start_date) <> 1 and not start_date_exception) = 0 then
    res := hr_contract_start_rule_activate();
    if not exists (select 1 from pg_constraint where conname = 'hr_contracts_start_first_of_month') then
      bad := bad || 'rule_not_activated ';
    end if;
    m := '-';
    alter table hr_contracts disable trigger trg_hr_contract_dates_guard;
    begin
      insert into hr_contracts (employee_id, site_id, activity_code_id, salaire_base_monthly, salaire_net_ref_monthly, start_date, status)
      values (emp, site_a, act, 1, 1, date '2031-09-09', 'ACTIVE');
    exception when others then m := sqlerrm; end;
    alter table hr_contracts enable trigger trg_hr_contract_dates_guard;
    if m = '-' or m not like '%hr_contracts_start_first_of_month%' then bad := bad || 'constraint_not_enforced '; end if;
  end if;

  if bad <> '' then raise exception 'RESULT: FAIL %', bad; end if;
  raise exception 'RESULT: PASS lot 1 (wilayas, dated site wilaya, dated assignments, roster periods, D8, D13, start rule)';
end $$;
