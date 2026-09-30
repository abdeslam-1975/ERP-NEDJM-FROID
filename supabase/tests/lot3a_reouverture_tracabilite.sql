-- Lot 3a (rollback only): D7 reopening, slip versions, payroll audit, audit partitions, D6 closing chains.
-- Expects the fixtures of the local runner: SUPER_ADMIN a2…01, ADMIN_RH a2…02 (no site scope).
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
  perform set_config('hr.payroll_reopen', '', true);
  perform set_config('ref.rule_apply', '', true);
end $$;

create or replace function pg_temp.make_run(p_site uuid, p_emp uuid, y int, m int) returns uuid language plpgsql as $$
declare d uuid; fp text; r uuid;
begin
  d := hr_payroll_request_generation(p_site, y, m, 'MANUAL');
  select fingerprint into fp from sys_decisions where id = d;
  perform sys_decision_decide(d, 'GENERATE', 'Test lot 3a rollback', fp, false);
  r := hr_payroll_run_open(d);
  perform hr_payroll_replace_slips(
    r,
    jsonb_build_array(jsonb_build_object('employee_id', p_emp, 'days_paid', 30, 'gross_amount', 50000,
                                         'irg_amount', 1200, 'net_payable', 42000)),
    jsonb_build_array(jsonb_build_object('employee_id', p_emp, 'source_code', 'base', 'code', 'T3A',
                                         'label_ar', 'اختبار', 'label_fr', 'Test lot 3a', 'category', '1',
                                         'nature', 'GAIN', 'unit', 'DA', 'amount', 50000, 'sort_order', 1)),
    d);
  return r;
end $$;

create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return '-';
exception when others then
  return sqlerrm;
end $$;

do $$
declare
  boss uuid := 'a2000000-0000-4000-8000-000000000001';
  rh uuid := 'a2000000-0000-4000-8000-000000000002';
  site uuid; emp uuid; run1 uuid; run2 uuid; var uuid; orig uuid;
  d6 uuid; d6b uuid; d7 uuid; d7x uuid; d7other uuid; requester uuid;
  fp text; res jsonb; st text; m text; n int; n2 int;
  bad text := ''; notes text := '';
begin
  select id into site from ref_sites where is_active order by created_at limit 1;
  select id into emp from hr_employees order by created_at limit 1;
  if site is null or emp is null then raise exception 'RESULT: SKIP (no active site or employee)'; end if;
  if exists (select 1 from hr_payroll_runs where period_year = 2031 and period_month in (4, 5)) then
    raise exception 'RESULT: SKIP (payroll 04-05/2031 already exists)';
  end if;

  -- 0. Exposure: internal functions and tables stay closed to clients.
  if has_function_privilege('authenticated', 'public.hr_decision_apply_d7(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_decision_apply_d6(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.ref_rule_chain_split(text,text,date)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_payroll_reopen_allows(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_payroll_reopen_context(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.sys_audit_ensure_partitions(date)', 'execute')
     or has_function_privilege('anon', 'public.hr_payroll_request_reopen(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_payroll_request_reopen(uuid,text)', 'execute') then
    bad := bad || 'function_grants ';
  end if;
  if has_table_privilege('authenticated', 'public.hr_payroll_slip_versions', 'insert')
     or has_table_privilege('authenticated', 'public.hr_payroll_chain_policy', 'insert') then
    bad := bad || 'table_grants ';
  end if;

  -- 0b. Audit partitions: monthly partitions through December 2027, reachable only through sys_audit_logs.
  if to_regclass('public.sys_audit_logs_2027_12') is null or to_regclass('public.sys_audit_logs_2027_06') is null then
    bad := bad || 'partitions_missing ';
  end if;
  if has_table_privilege('authenticated', 'public.sys_audit_logs_2026_09', 'select')
     or (to_regclass('public.sys_audit_logs_2027_12') is not null
         and has_table_privilege('authenticated', 'public.sys_audit_logs_2027_12', 'select')) then
    bad := bad || 'partition_readable_directly ';
  end if;
  select count(*) into n from pg_inherits i join pg_class c on c.oid = i.inhrelid
  where i.inhparent = 'public.sys_audit_logs'::regclass and not c.relrowsecurity;
  if n > 0 then bad := bad || 'partition_without_rls(' || n || ') '; end if;

  -- 1. D7 is not delegable: no right on its screen for another role, never decidable by ADMIN_RH.
  m := pg_temp.try($q$
    insert into sys_permissions (role_id, screen_id, can_read, can_update)
    select r.id, s.id, true, true from sys_roles r, sys_screens s
    where r.code = 'ADMIN_RH' and s.code = 'decision_payroll_reopen'
    on conflict (role_id, screen_id) do update set can_update = true $q$);
  if m = '-' then bad := bad || 'd7_delegable '; end if;
  if sys_decision_can_decide('D7', rh) then bad := bad || 'd7_decidable_by_rh '; end if;
  if not sys_decision_can_decide('D7', boss) then bad := bad || 'd7_not_decidable_by_sa '; end if;

  -- 2. A payroll validated then closed (D6 first when reprise months are still open).
  perform pg_temp.as_user(boss);
  run1 := pg_temp.make_run(site, emp, 2031, 4);
  if hr_payroll_chain_required(2031, 4) then
    m := pg_temp.try(format('select hr_payroll_run_transition(%L, %L)', run1, 'validate'));
    if m = '-' or m not like '%D6%' then bad := bad || 'validated_without_d6 '; end if;
    d6 := hr_payroll_request_chain_decision(run1);
    select fingerprint into fp from sys_decisions where id = d6;
    res := sys_decision_decide(d6, 'WAIT', 'Test lot 3a : attendre', fp, true);
    if hr_payroll_chain_mode() <> 'UNDECIDED' then bad := bad || 'd6_wait_changed_policy '; end if;
    m := pg_temp.try(format('select hr_payroll_run_transition(%L, %L)', run1, 'validate'));
    if m = '-' then bad := bad || 'validated_after_wait '; end if;
    d6b := hr_payroll_request_chain_decision(run1);
    if d6b = d6 then bad := bad || 'd6_wait_not_consumed '; end if;
    select fingerprint into fp from sys_decisions where id = d6b;
    m := pg_temp.try(format('select sys_decision_decide(%L, %L, %L, %L, false)', d6b, 'SEPARATE', 'Test lot 3a : chaînes séparées', fp));
    if m = '-' then bad := bad || 'd6_without_risk_ack '; end if;
    res := sys_decision_decide(d6b, 'SEPARATE', 'Test lot 3a : chaînes séparées', fp, true);
    if res->>'applied' <> 'true' or hr_payroll_chain_mode() <> 'SEPARATE' then bad := bad || 'd6_separate_not_applied '; end if;
    if (select status from sys_decisions where id = d6b) <> 'EXECUTED' then bad := bad || 'd6_not_executed '; end if;
    m := pg_temp.try($q$update hr_payroll_chain_policy set mode = 'FROZEN'$q$);
    if m = '-' then bad := bad || 'policy_mutable '; end if;

    -- Separated chains: first open month per chain, rules of a reprise month bounded to 31/08/2026.
    if hr_first_open_month_for(date '2026-03-01') <> hr_payroll_chain_first_open('EXTERNAL')
       or hr_payroll_chain_bound(date '2026-03-01') <> date '2026-08-31'
       or hr_payroll_chain_bound(date '2026-10-01') is not null then
      bad := bad || 'chain_functions ';
    end if;
    select v.var_id, v.id into var, orig from ref_global_var_versions v
    where v.effective_from < date '2026-09-01' and (v.effective_to is null or v.effective_to >= date '2026-09-01')
    limit 1;
    if var is not null then
      m := pg_temp.try(format('select ref_rule_chain_split(%L, %L, %L)', 'LEGAL_VAR', var, '2026-03-01'));
      if m = '-' then bad := bad || 'split_without_d2 '; end if;
      perform set_config('ref.rule_apply', 'on', true);
      n := ref_rule_chain_split('LEGAL_VAR', var::text, date '2026-03-01');
      perform set_config('ref.rule_apply', '', true);
      if n < 1
         or (select effective_from from ref_global_var_versions where id = orig) <> date '2026-09-01'
         or not exists (select 1 from ref_global_var_versions x, ref_global_var_versions o
                        where o.id = orig and x.var_id = var and x.id <> orig
                          and x.effective_to = date '2026-08-31'
                          and x.value_numeric is not distinct from o.value_numeric
                          and x.value_text is not distinct from o.value_text) then
        bad := bad || 'split_wrong ';
      end if;
    else
      notes := notes || 'no_var_spanning_sept ';
    end if;
  else
    notes := notes || 'd6_not_required_locally ';
    m := pg_temp.try(format('select hr_payroll_request_chain_decision(%L)', run1));
    if m = '-' then bad := bad || 'd6_requested_without_need '; end if;
  end if;

  st := hr_payroll_run_transition(run1, 'validate');
  st := hr_payroll_run_transition(run1, 'close');
  if st <> 'LOCKED' then bad := bad || 'close_failed '; end if;

  -- Proof 1: a closed payroll stays unmodifiable without a decision, even for the SUPER_ADMIN.
  m := pg_temp.try(format($q$update hr_payroll_runs set status_code = 'DRAFT' where id = %L$q$, run1));
  if m = '-' then bad := bad || 'locked_reopened_directly '; end if;
  m := pg_temp.try(format('update hr_payroll_runs set period_month = period_month where id = %L', run1));
  if m = '-' then bad := bad || 'locked_run_updated '; end if;
  m := pg_temp.try(format('update hr_payroll_slips set net_payable = net_payable + 1 where run_id = %L', run1));
  if m = '-' then bad := bad || 'locked_slip_updated '; end if;
  m := pg_temp.try(format($q$update hr_payroll_slips set status_code = 'DRAFT' where run_id = %L$q$, run1));
  if m = '-' then bad := bad || 'locked_slip_reopened '; end if;
  m := pg_temp.try(format('select hr_payroll_run_transition(%L, %L)', run1, 'reopen'));
  if m = '-' then bad := bad || 'direct_reopen_transition '; end if;
  perform set_config('hr.payroll_reopen', gen_random_uuid()::text, true);
  m := pg_temp.try(format($q$update hr_payroll_runs set status_code = 'DRAFT' where id = %L$q$, run1));
  perform set_config('hr.payroll_reopen', '', true);
  if m = '-' then bad := bad || 'reopened_with_unknown_decision '; end if;

  -- Proof 3a: refused with a decision about another payroll.
  run2 := pg_temp.make_run(site, emp, 2031, 5);
  st := hr_payroll_run_transition(run2, 'validate');
  d7other := hr_payroll_request_reopen(run2, 'Test lot 3a : autre paie');
  update sys_decisions set status = 'DECIDED', chosen_option = 'REOPEN', justification = 'Test lot 3a autre paie',
         risk_acknowledged = true, decided_by = boss, decided_at = now()
  where id = d7other;
  perform set_config('hr.payroll_reopen', d7other::text, true);
  m := pg_temp.try(format($q$update hr_payroll_runs set status_code = 'DRAFT' where id = %L$q$, run1));
  perform set_config('hr.payroll_reopen', '', true);
  if m = '-' then bad := bad || 'reopened_with_other_run_decision '; end if;

  -- Proof 3b: refused with an expired decision (superseded or invalidated before execution).
  d7x := hr_payroll_request_reopen(run1, 'Test lot 3a : demande remplacée');
  perform sys_decision_close_internal(d7x, 'SUPERSEDED', 'Test lot 3a');
  perform set_config('hr.payroll_reopen', d7x::text, true);
  m := pg_temp.try(format($q$update hr_payroll_runs set status_code = 'DRAFT' where id = %L$q$, run1));
  perform set_config('hr.payroll_reopen', '', true);
  if m = '-' then bad := bad || 'reopened_with_superseded_decision '; end if;
  d7x := hr_payroll_request_reopen(run1, 'Test lot 3a : demande invalidée');
  perform sys_decision_close_internal(d7x, 'INVALIDATED', 'Test lot 3a');
  perform set_config('hr.payroll_reopen', d7x::text, true);
  m := pg_temp.try(format($q$update hr_payroll_runs set status_code = 'DRAFT' where id = %L$q$, run1));
  perform set_config('hr.payroll_reopen', '', true);
  if m = '-' then bad := bad || 'reopened_with_invalidated_decision '; end if;

  -- A D7 "decided" by someone other than the SUPER_ADMIN never opens anything.
  d7x := hr_payroll_request_reopen(run1, 'Test lot 3a : décideur non autorisé');
  update sys_decisions set status = 'DECIDED', chosen_option = 'REOPEN', justification = 'Test lot 3a non SA',
         risk_acknowledged = true, decided_by = rh, decided_at = now()
  where id = d7x;
  perform set_config('hr.payroll_reopen', d7x::text, true);
  m := pg_temp.try(format($q$update hr_payroll_runs set status_code = 'DRAFT' where id = %L$q$, run1));
  perform set_config('hr.payroll_reopen', '', true);
  if m = '-' then bad := bad || 'reopened_with_non_sa_decider '; end if;
  perform sys_decision_close_internal(d7x, 'SUPERSEDED', 'Test lot 3a');

  -- Proof 2: reopening works with a valid decision (requested by ADMIN_RH when allowed, decided by the SUPER_ADMIN).
  perform pg_temp.as_user(rh);
  begin
    d7 := hr_payroll_request_reopen(run1, 'Erreur de pointage constatée après clôture');
    requester := rh;
  exception when others then
    perform pg_temp.as_user(boss);
    d7 := hr_payroll_request_reopen(run1, 'Erreur de pointage constatée après clôture');
    requester := boss;
    notes := notes || 'rh_cannot_request ';
  end;
  if not exists (select 1 from sys_notifications where decision_id = d7 and recipient_screen = 'decision_payroll_reopen') then
    bad := bad || 'd7_not_notified ';
  end if;
  if (select context->>'status' from sys_decisions where id = d7) <> 'LOCKED'
     or (select context ? 'transfers' and context ? 'certificates' and context ? 'later_runs' from sys_decisions where id = d7) is not true then
    bad := bad || 'd7_context_incomplete ';
  end if;
  select fingerprint into fp from sys_decisions where id = d7;
  perform pg_temp.as_user(rh);
  m := pg_temp.try(format('select sys_decision_decide(%L, %L, %L, %L, true)', d7, 'REOPEN', 'ADMIN_RH tente de décider', fp));
  if m = '-' then bad := bad || 'd7_decided_by_rh '; end if;
  perform pg_temp.as_user(boss);
  m := pg_temp.try(format('select sys_decision_decide(%L, %L, %L, %L, false)', d7, 'REOPEN', 'Sans accusé de risque', fp));
  if m = '-' then bad := bad || 'd7_without_risk_ack '; end if;
  select count(*) into n from hr_payroll_slips where run_id = run1;
  res := sys_decision_decide(d7, 'REOPEN', 'Réouverture justifiée : erreur de pointage', fp, true);
  if res->>'ok' <> 'true' or res->>'applied' <> 'true' then bad := bad || 'd7_decide_failed '; end if;
  if (select status_code from hr_payroll_runs where id = run1) <> 'DRAFT'
     or (select locked_at from hr_payroll_runs where id = run1) is not null
     or exists (select 1 from hr_payroll_slips where run_id = run1 and status_code <> 'DRAFT') then
    bad := bad || 'not_reopened ';
  end if;
  select count(*) into n2 from hr_payroll_slip_versions
  where run_id = run1 and decision_id = d7 and run_status = 'LOCKED' and jsonb_array_length(lines) >= 1;
  if n2 <> n or n = 0 then bad := bad || 'versions_missing(' || n2 || '/' || n || ') '; end if;
  if (select status from sys_decisions where id = d7) <> 'EXECUTED'
     or (select execution_result->>'operation' from sys_decisions where id = d7) <> 'PAYROLL_REOPENED' then
    bad := bad || 'd7_not_consumed ';
  end if;
  if coalesce(current_setting('hr.payroll_reopen', true), '') <> '' then bad := bad || 'flag_left_set '; end if;
  if not exists (select 1 from sys_audit_logs where table_name = 'hr_payroll_runs' and target_id = run1::text and request_id = d7)
     or not exists (select 1 from sys_audit_logs a join hr_payroll_slips s on s.id::text = a.target_id
                    where a.table_name = 'hr_payroll_slips' and s.run_id = run1 and a.request_id = d7) then
    bad := bad || 'audit_not_linked ';
  end if;
  m := pg_temp.try(format('update hr_payroll_slip_versions set run_status = %L where run_id = %L', 'VALIDATED', run1));
  if m = '-' then bad := bad || 'versions_mutable '; end if;
  m := pg_temp.try(format('delete from hr_payroll_slip_versions where run_id = %L', run1));
  if m = '-' then bad := bad || 'versions_deletable '; end if;
  m := pg_temp.try(format('select hr_payroll_request_reopen(%L, %L)', run1, 'Déjà en brouillon'));
  if m = '-' then bad := bad || 'reopen_requested_for_draft '; end if;

  -- Proof 3c: refused with a consumed decision.
  st := hr_payroll_run_transition(run1, 'validate');
  perform set_config('hr.payroll_reopen', d7::text, true);
  m := pg_temp.try(format($q$update hr_payroll_runs set status_code = 'DRAFT' where id = %L$q$, run1));
  perform set_config('hr.payroll_reopen', '', true);
  if m = '-' then bad := bad || 'reopened_with_consumed_decision '; end if;
  m := pg_temp.try(format('select hr_decision_apply_d7(%L)', d7));
  if m = '-' then bad := bad || 'd7_replayed '; end if;

  if bad <> '' then raise exception 'RESULT: FAIL % (notes: %)', bad, notes; end if;
  raise exception 'RESULT: PASS lot 3a (D7 SA-only non delegable, locked immutable, reopen with valid D7 only, refused consumed/expired/other-run/non-SA, versions + audit linked, partitions to 2027-12, D6 %) notes: %',
    case when d6b is null then 'not required locally' else 'wait/separate + bounded split' end, notes;
end $$;
