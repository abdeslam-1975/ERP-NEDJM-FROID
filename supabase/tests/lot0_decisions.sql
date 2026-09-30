do $$
declare
  boss uuid; plain uuid; site uuid;
  d4 uuid; d4b uuid; d3 uuid; d3m uuid; run uuid; fp text; res jsonb; sig jsonb; n int;
  m1 text := '-'; m2 text := '-'; m3 text := '-'; m4 text := '-'; m5 text := '-'; m6 text := '-'; m7 text := '-'; m8 text := '-';
  bad text := '';
begin
  select usr.user_id into boss from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'SUPER_ADMIN' limit 1;
  select usr.user_id into plain from sys_user_site_roles usr
   where not erp_is_super_admin(usr.user_id) limit 1;
  select id into site from ref_sites where is_active limit 1;
  if boss is null or site is null then
    raise exception 'RESULT: SKIP (no super admin or active site)';
  end if;
  if exists (select 1 from hr_payroll_runs where period_year = 2031 and period_month = 2) then
    raise exception 'RESULT: SKIP (payroll 02/2031 already exists)';
  end if;

  if has_function_privilege('anon', 'public.sys_decision_decide(uuid,text,text,text,boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.sys_notify(text,text,text,text,uuid,text,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.sys_decision_close_internal(uuid,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_payroll_upsert_recalc_request(uuid,text,boolean)', 'execute') then
    bad := bad || 'internal_function_exposed ';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', boss, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', boss::text, true);

  -- D4: no payroll without a decision
  begin
    insert into hr_payroll_runs (period_year, period_month, site_id, status_code) values (2031, 2, site, 'DRAFT');
  exception when others then m1 := sqlerrm; end;
  if m1 = '-' then bad := bad || 'run_insert_without_decision '; end if;

  d4 := hr_payroll_request_generation(site, 2031, 2, 'MANUAL');
  d4b := hr_payroll_request_generation(site, 2031, 2, 'MANUAL');
  if d4 is null or d4 is distinct from d4b then bad := bad || 'd4_not_deduplicated '; end if;
  if not exists (select 1 from sys_notifications where decision_id = d4 and kind = 'DECISION_PENDING'
                   and recipient_screen = 'decision_payroll_generate') then
    bad := bad || 'd4_not_notified ';
  end if;

  begin perform sys_decision_decide(d4, 'GENERATE', 'court', 'x', false); exception when others then m2 := sqlerrm; end;
  if m2 = '-' then bad := bad || 'short_justification_accepted '; end if;
  res := sys_decision_decide(d4, 'GENERATE', 'Regression rollback lot 0', 'stale-fingerprint', false);
  if res->>'reason' is distinct from 'STALE' then bad := bad || 'stale_fingerprint_accepted '; end if;

  select fingerprint into fp from sys_decisions where id = d4;
  res := sys_decision_decide(d4, 'GENERATE', 'Regression rollback lot 0', fp, false);
  if (res->>'ok')::boolean is not true or (res->>'executes')::boolean is not true then bad := bad || 'd4_decide_failed '; end if;

  begin update sys_decisions set justification = 'réécrite' where id = d4; exception when others then m3 := sqlerrm; end;
  if m3 = '-' then bad := bad || 'decided_fields_mutable '; end if;
  begin delete from sys_decisions where id = d4; exception when others then m4 := sqlerrm; end;
  if m4 = '-' then bad := bad || 'decision_deletable '; end if;

  run := hr_payroll_run_open(d4);
  if run is null then bad := bad || 'run_open_failed '; end if;

  begin
    insert into hr_payroll_slips (run_id, employee_id) select run, e.id from hr_employees e limit 1;
  exception when others then m5 := sqlerrm; end;
  if m5 = '-' or m5 not like '%décision%' then bad := bad || 'slip_insert_without_decision '; end if;

  n := hr_payroll_replace_slips(run, '[]'::jsonb, '[]'::jsonb, d4);
  if (select status from sys_decisions where id = d4) <> 'EXECUTED' then bad := bad || 'd4_not_consumed '; end if;
  begin perform hr_payroll_replace_slips(run, '[]'::jsonb, '[]'::jsonb, d4); exception when others then m6 := sqlerrm; end;
  if m6 = '-' then bad := bad || 'decision_replayed '; end if;

  -- D3: a change flags the draft, never recalculates it, and blocks validation
  sig := hr_payroll_signal_input_change('ATTENDANCE', null, null, site, 2031, 2, 'Regression rollback');
  if (sig->>'flagged_runs')::int <> 1 then bad := bad || 'draft_not_flagged '; end if;
  select id into d3 from sys_decisions where run_id = run and type_code = 'D3' and status = 'PENDING';
  if d3 is null then bad := bad || 'd3_not_requested '; end if;

  begin update hr_payroll_runs set status_code = 'VALIDATED' where id = run; exception when others then m7 := sqlerrm; end;
  if m7 = '-' then bad := bad || 'validated_with_pending_changes '; end if;

  if plain is not null then
    d3m := hr_payroll_request_recalc(run);
    perform set_config('request.jwt.claims', json_build_object('sub', plain, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', plain::text, true);
    select fingerprint into fp from sys_decisions where id = d3m;
    begin perform sys_decision_decide(d3m, 'KEEP', 'Regression rollback lot 0', fp, false); exception when others then m8 := sqlerrm; end;
    if m8 = '-' and not sys_decision_can_decide('D3', plain) then bad := bad || 'decided_without_right '; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', boss, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', boss::text, true);
    d3 := d3m;
  end if;

  select fingerprint into fp from sys_decisions where id = d3;
  res := sys_decision_decide(d3, 'KEEP', 'Regression rollback lot 0', fp, false);
  if res->>'status' is distinct from 'EXECUTED' then bad := bad || 'd3_keep_failed '; end if;
  if exists (select 1 from hr_payroll_input_changes where run_id = run and resolved_at is null) then
    bad := bad || 'changes_not_resolved ';
  end if;
  if not exists (select 1 from hr_payroll_input_changes where run_id = run and resolution = 'KEPT' and decision_id = d3) then
    bad := bad || 'kept_not_traced ';
  end if;

  if bad <> '' then raise exception 'RESULT: FAIL %', bad; end if;
  raise exception 'RESULT: PASS lot 0 (D4/D3 required, dedupe, stale check, single use, immutable, validation blocked, notifications)';
end $$;
