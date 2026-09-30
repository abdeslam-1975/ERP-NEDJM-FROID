-- Lot 6 — month preparation (D1) and dated attendance coefficients (D14). Every change is rolled back by the final raise.
-- Needs one SUPER_ADMIN, one ADMIN_RH and one ADMIN_FINANCE user (global roles).
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', p::text, true),
         set_config('ref.legend_coefficient', '', true),
         set_config('hr.payroll_simulation', '', true);
$$;

create or replace function pg_temp.no_user() returns void language sql as $$
  select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
$$;

create or replace function pg_temp.fp(p uuid) returns text language sql as $$
  select fingerprint from sys_decisions where id = p;
$$;

do $$
declare
  boss uuid; rh uuid; fin uuid; act uuid; var_id uuid;
  site_a uuid; emp1 uuid; c1 uuid; lg uuid; lg2 uuid; run3 uuid; prop uuid;
  d14a uuid; d14b uuid; d14c uuid; d14d uuid; d14f uuid;
  d4a uuid; d1a uuid; d1b uuid; d1c uuid; d1d uuid; dx uuid;
  res jsonb; prep jsonb; m text; n bigint; v numeric;
  bad text := '';
begin
  select usr.user_id into boss from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'SUPER_ADMIN' limit 1;
  select usr.user_id into rh from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'ADMIN_RH' and usr.site_id is null limit 1;
  select usr.user_id into fin from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'ADMIN_FINANCE' and usr.site_id is null limit 1;
  select id into act from ref_activity_codes limit 1;
  select id into var_id from ref_global_vars order by sort_order limit 1;
  if boss is null or rh is null or fin is null or act is null or var_id is null
     or not exists (select 1 from ref_legendes where code = 'P' and is_active) then
    raise exception 'RESULT: SKIP (users SUPER_ADMIN / ADMIN_RH / ADMIN_FINANCE, activity code, legal variable or legend P missing)';
  end if;
  if jsonb_array_length(hr_month_rule_blockers(date '2027-06-01')) > 0
     or hr_first_open_payroll_month() > date '2027-03-01'
     or exists (select 1 from hr_payroll_runs where period_year = 2027 and period_month in (3, 4) and site_id is null) then
    raise exception 'RESULT: SKIP (pending rules, validated payroll or global payroll already present for 2027)';
  end if;

  -- Exposure, grants, rights, decision types, initial versions
  if has_function_privilege('authenticated', 'public.hr_payroll_d1_request_internal(uuid,integer,integer,text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_decision_apply_d14(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_payroll_d1_fingerprint(uuid,integer,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_payroll_d1_context(uuid,integer,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_legend_coefficient_fingerprint(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_legend_coefficient_context(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_month_rule_blockers(date)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_month_legacy_rules(date)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_payroll_run_rules_guard()', 'execute')
     or has_function_privilege('authenticated', 'public.hr_payroll_simulation_guard()', 'execute') then
    bad := bad || 'internal_function_exposed ';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_payroll_d1_request(uuid,integer,integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_payroll_simulation_save(uuid,jsonb,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_legend_coefficient_request(uuid,numeric,date,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_payroll_month_preparation(integer,integer,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_payroll_d1_request(uuid,integer,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_payroll_simulation_save(uuid,jsonb,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.hr_legend_coefficient_request(uuid,numeric,date,text)', 'execute')
     or has_function_privilege('anon', 'public.hr_payroll_month_preparation(integer,integer,uuid)', 'execute') then
    bad := bad || 'rpc_grants ';
  end if;
  if has_table_privilege('authenticated', 'public.hr_payroll_simulations', 'insert')
     or has_table_privilege('authenticated', 'public.hr_payroll_simulation_slips', 'insert')
     or has_table_privilege('authenticated', 'public.ref_legende_coefficients', 'insert')
     or has_table_privilege('authenticated', 'public.ref_legende_coefficients', 'update')
     or has_table_privilege('anon', 'public.hr_payroll_simulations', 'select')
     or has_table_privilege('anon', 'public.ref_legende_coefficients', 'select') then
    bad := bad || 'table_privileges ';
  end if;
  if (select count(*) from sys_screens
      where code in ('hr_payroll_preparation', 'decision_payroll_unapproved_rules', 'decision_attendance_coefficient')) <> 3
     or exists (select 1 from sys_permissions pm join sys_roles r on r.id = pm.role_id join sys_screens s on s.id = pm.screen_id
                where s.code in ('hr_payroll_preparation', 'decision_payroll_unapproved_rules', 'decision_attendance_coefficient')
                  and r.code is distinct from 'SUPER_ADMIN' and (pm.can_create or pm.can_update)) then
    bad := bad || 'rights_not_super_admin_only ';
  end if;
  if not exists (select 1 from sys_decision_types where code = 'D1' and risk_class = 'ORDINARY' and not policy_allowed
                 and options @> '[{"code":"WAIT","executes":false},{"code":"SIMULATE","executes":true}]')
     or not exists (select 1 from sys_decision_types where code = 'D14' and risk_class = 'ORDINARY' and not policy_allowed
                    and options @> '[{"code":"APPLY","executes":true},{"code":"REFUSE","executes":false}]') then
    bad := bad || 'decision_types ';
  end if;
  if exists (select 1 from ref_legendes l
             where not exists (select 1 from ref_legende_coefficients v where v.legend_id = l.id and v.status = 'ACTIVE')
                or ref_legende_coefficient_at(l.id, current_date) is distinct from l.coefficient) then
    bad := bad || 'initial_versions ';
  end if;

  -- Fixture: one site, one employee, a test legend, attendance of 03/2027 and a draft payroll of 03/2027
  perform pg_temp.as_user(boss);
  insert into ref_sites (code, name_fr, wilaya_code) values ('ZZ-L6A', 'Chantier lot 6 A', '31') returning id into site_a;
  insert into hr_employees (matricule, last_name, first_name) values ('L6-001', 'Benali', 'Karim') returning id into emp1;
  alter table hr_contracts disable trigger trg_hr_contract_dates_guard;
  insert into hr_contracts (employee_id, site_id, activity_code_id, salaire_base_monthly, salaire_net_ref_monthly, start_date, status)
  values (emp1, site_a, act, 50000, 40000, date '2027-01-01', 'ACTIVE') returning id into c1;
  alter table hr_contracts enable trigger trg_hr_contract_dates_guard;
  insert into ref_legendes (code, label_fr, coefficient, counts_as_presence, is_system)
  values ('ZL6', 'Code test lot 6', 1, true, false) returning id into lg;
  if not exists (select 1 from ref_legende_coefficients
                 where legend_id = lg and origin = 'INITIAL' and status = 'ACTIVE' and coefficient = 1
                   and effective_from = date '1900-01-01' and decision_id is null) then
    bad := bad || 'new_legend_initial_version ';
  end if;
  insert into hr_attendance (employee_id, site_id, work_date, legend_code, source_code, status_code, validated_at, validated_by) values
    (emp1, site_a, date '2027-03-02', 'ZL6', 'MANUAL', 'VALIDATED', now(), boss),
    (emp1, site_a, date '2027-03-03', 'P', 'MANUAL', 'VALIDATED', now(), boss);
  perform pg_temp.no_user();
  insert into hr_payroll_runs (period_year, period_month, site_id, status_code, created_by)
  values (2027, 3, site_a, 'DRAFT', boss) returning id into run3;
  perform pg_temp.as_user(boss);

  -- D14: direct writes are refused
  m := '-'; begin update ref_legendes set coefficient = 0.5 where id = lg; exception when others then m := sqlerrm; end;
  if position('demande datée' in m) = 0 then bad := bad || 'legend_coefficient_not_locked(' || m || ') '; end if;
  m := '-'; begin update ref_legendes set label_fr = 'Code test lot 6 bis' where id = lg; exception when others then m := sqlerrm; end;
  if m <> '-' then bad := bad || 'legend_label_update_refused(' || m || ') '; end if;
  m := '-';
  begin
    insert into ref_legende_coefficients (legend_id, coefficient, effective_from, origin) values (lg, 2, date '2027-03-01', 'INITIAL');
  exception when others then m := sqlerrm; end;
  if position('écriture réservée' in m) = 0 then bad := bad || 'version_insert_not_guarded(' || m || ') '; end if;

  -- D14: request rights and validations
  perform pg_temp.as_user(fin);
  m := '-'; begin perform hr_legend_coefficient_request(lg, 0.5, date '2027-03-01', 'Convention collective lot 6'); exception when others then m := sqlerrm; end;
  if position('non autorisée' in m) = 0 then bad := bad || 'd14_request_finance(' || m || ') '; end if;
  perform pg_temp.as_user(boss);
  m := '-'; begin perform hr_legend_coefficient_request(lg, 0.5, date '2027-03-15', 'Convention collective lot 6'); exception when others then m := sqlerrm; end;
  if position('1er du mois' in m) = 0 then bad := bad || 'd14_month_day(' || m || ') '; end if;
  m := '-'; begin perform hr_legend_coefficient_request(lg, 1, date '2027-03-01', 'Convention collective lot 6'); exception when others then m := sqlerrm; end;
  if position('vaut déjà' in m) = 0 then bad := bad || 'd14_same_value(' || m || ') '; end if;
  m := '-'; begin perform hr_legend_coefficient_request(lg, 0.5, date '2027-03-01', 'court'); exception when others then m := sqlerrm; end;
  if position('Motif obligatoire' in m) = 0 then bad := bad || 'd14_reason(' || m || ') '; end if;
  m := '-'; begin perform hr_legend_coefficient_request(lg, 1.2345, date '2027-03-01', 'Convention collective lot 6'); exception when others then m := sqlerrm; end;
  if position('Coefficient invalide' in m) = 0 then bad := bad || 'd14_decimals(' || m || ') '; end if;
  m := '-'; begin perform hr_legend_coefficient_request(lg, 0.5, (date_trunc('month', current_date) + interval '25 months')::date, 'Convention collective lot 6'); exception when others then m := sqlerrm; end;
  if position('trop lointain' in m) = 0 then bad := bad || 'd14_too_far(' || m || ') '; end if;

  -- D14: a validated month (here a global 03/2027 payroll) can no longer receive a new coefficient
  begin
    perform pg_temp.no_user();
    insert into hr_payroll_runs (period_year, period_month, site_id, status_code, created_by, validated_at, validated_by)
    values (2027, 3, null, 'VALIDATED', boss, now(), boss);
    perform pg_temp.as_user(boss);
    m := '-'; begin perform hr_legend_coefficient_request(lg, 0.5, date '2027-03-01', 'Convention collective lot 6'); exception when others then m := sqlerrm; end;
    if position('déjà validée' in m) = 0 then bad := bad || 'd14_closed_month(' || m || ') '; end if;
    raise exception 'ROLLBACK_SUB';
  exception when others then
    if sqlerrm <> 'ROLLBACK_SUB' then bad := bad || 'd14_closed_month_setup(' || sqlerrm || ') '; end if;
  end;
  perform pg_temp.as_user(boss);

  -- D14: request, supersede, apply from 03/2027
  d14a := hr_legend_coefficient_request(lg, 0.5, date '2027-03-01', 'Nouvelle convention collective lot 6');
  if not exists (select 1 from sys_decisions where id = d14a and type_code = 'D14' and status = 'PENDING'
                 and dedupe_key = 'D14:' || lg::text and requested_by = boss
                 and context->'draft_runs' @> jsonb_build_array(jsonb_build_object('run_id', run3))) then
    bad := bad || 'd14_request_row ';
  end if;
  if ref_legende_coefficient_at(lg, date '2027-03-01') <> 1 then bad := bad || 'd14_effect_before_decision '; end if;
  if not exists (select 1 from sys_notifications where decision_id = d14a) then bad := bad || 'd14_not_notified '; end if;
  d14b := hr_legend_coefficient_request(lg, 0.75, date '2027-03-01', 'Nouvelle convention collective lot 6 (corrigée)');
  if (select status from sys_decisions where id = d14a) is distinct from 'SUPERSEDED' then bad := bad || 'd14_not_superseded '; end if;

  perform pg_temp.as_user(fin);
  m := '-'; begin perform sys_decision_decide(d14b, 'APPLY', 'Application de la convention', pg_temp.fp(d14b)); exception when others then m := sqlerrm; end;
  if position('pas le droit' in m) = 0 then bad := bad || 'd14_decide_finance(' || m || ') '; end if;
  perform pg_temp.as_user(boss);
  res := sys_decision_decide(d14b, 'APPLY', 'Application de la convention collective', pg_temp.fp(d14b));
  if res->>'status' is distinct from 'EXECUTED' or (res->>'applied')::boolean is distinct from true then
    bad := bad || 'd14_apply_result(' || res::text || ') ';
  end if;
  if not exists (select 1 from ref_legende_coefficients where legend_id = lg and origin = 'D14' and status = 'ACTIVE'
                 and coefficient = 0.75 and effective_from = date '2027-03-01' and decision_id = d14b) then
    bad := bad || 'd14_version_missing ';
  end if;
  if ref_legende_coefficient_at(lg, date '2027-02-01') <> 1 or ref_legende_coefficient_at(lg, date '2027-03-01') <> 0.75
     or ref_legende_coefficient_at(lg, date '2027-08-01') <> 0.75 then
    bad := bad || 'd14_dated_values ';
  end if;
  if (select coefficient from ref_legendes where id = lg) <> 1 then bad := bad || 'd14_mirror_changed_before_month '; end if;
  if not exists (select 1 from ref_legende_coefficients_at(date '2027-03-01') x where x.code = 'ZL6' and x.coefficient = 0.75) then
    bad := bad || 'd14_coefficients_at ';
  end if;
  if not exists (select 1 from hr_payroll_input_changes where run_id = run3 and source = 'LEGEND_COEFFICIENT' and resolved_at is null)
     or not exists (select 1 from sys_decisions where type_code = 'D3' and run_id = run3 and status = 'PENDING')
     or (select (execution_result->>'flagged_runs')::int from sys_decisions where id = d14b) is distinct from 1 then
    bad := bad || 'd14_draft_not_flagged ';
  end if;

  -- D14: a second decision for the same month replaces the version; history kept
  d14c := hr_legend_coefficient_request(lg, 0.8, date '2027-03-01', 'Avenant à la convention collective');
  res := sys_decision_decide(d14c, 'APPLY', 'Application de l''avenant signé', pg_temp.fp(d14c));
  if (select count(*) from ref_legende_coefficients where legend_id = lg and effective_from = date '2027-03-01' and status = 'ACTIVE') <> 1
     or ref_legende_coefficient_at(lg, date '2027-03-01') <> 0.8
     or not exists (select 1 from ref_legende_coefficients where decision_id = d14b and status = 'REPLACED' and replaced_at is not null)
     or (select (execution_result->>'replaced_same_month')::int from sys_decisions where id = d14c) is distinct from 1 then
    bad := bad || 'd14_same_month_replace ';
  end if;

  -- D14: refusal changes nothing
  d14d := hr_legend_coefficient_request(lg, 0.6, date '2027-05-01', 'Proposition de baisse du coefficient');
  res := sys_decision_decide(d14d, 'REFUSE', 'Refus : pas de base conventionnelle', pg_temp.fp(d14d));
  if res->>'status' is distinct from 'EXECUTED'
     or (select execution_result->>'operation' from sys_decisions where id = d14d) is distinct from 'NONE'
     or exists (select 1 from ref_legende_coefficients where legend_id = lg and effective_from = date '2027-05-01')
     or ref_legende_coefficient_at(lg, date '2027-05-01') <> 0.8 then
    bad := bad || 'd14_refuse ';
  end if;

  -- D14: versions are frozen; deleting an unused code removes its versions and closes its request
  m := '-'; begin update ref_legende_coefficients set coefficient = 2 where legend_id = lg; exception when others then m := sqlerrm; end;
  if position('écriture réservée' in m) = 0 then bad := bad || 'version_update_not_guarded(' || m || ') '; end if;
  m := '-'; begin delete from ref_legende_coefficients where legend_id = lg; exception when others then m := sqlerrm; end;
  if position('suppression interdite' in m) = 0 then bad := bad || 'version_delete_not_guarded(' || m || ') '; end if;
  insert into ref_legendes (code, label_fr, coefficient, counts_as_presence, is_system)
  values ('ZL7', 'Code test lot 6 (2)', 1, false, false) returning id into lg2;
  d14f := hr_legend_coefficient_request(lg2, 0.5, date '2027-04-01', 'Code provisoire du lot 6');
  m := '-'; begin delete from ref_legendes where id = lg2; exception when others then m := sqlerrm; end;
  if m <> '-' or exists (select 1 from ref_legende_coefficients where legend_id = lg2) then
    bad := bad || 'legend_delete_cascade(' || m || ') ';
  end if;
  if sys_decision_refresh_record(d14f) is distinct from 'SUPERSEDED' then bad := bad || 'd14_refresh_deleted_legend '; end if;

  -- D1: a D4 request exists before any pending rule
  d4a := hr_payroll_request_generation(site_a, 2027, 4, 'MANUAL');
  if (select type_code from sys_decisions where id = d4a) is distinct from 'D4' then bad := bad || 'd4_without_rules '; end if;

  -- D1: a submitted rule of 03/2027 blocks 03/2027 and later months, not earlier ones
  set local session_replication_role = replica;
  insert into ref_rule_proposals (family, action, target_id, payload, title, source_ref, text_effective_date, requested_month,
                                  status, created_by, submitted_by, submitted_at)
  values ('LEGAL_VAR', 'SET', var_id, '{"value": 1}', 'Règle test lot 6', 'LF test lot 6', date '2027-03-01', date '2027-03-01',
          'SUBMITTED', boss, boss, now())
  returning id into prop;
  set local session_replication_role = origin;
  if jsonb_array_length(hr_month_rule_blockers(date '2027-02-01')) <> 0
     or jsonb_array_length(hr_month_rule_blockers(date '2027-03-01')) <> 1
     or jsonb_array_length(hr_month_rule_blockers(date '2027-04-01')) <> 1
     or hr_month_rule_blockers(date '2027-04-01')->0->>'proposal_id' is distinct from prop::text then
    bad := bad || 'd1_blockers ';
  end if;
  if jsonb_typeof(hr_month_legacy_rules(date '2027-04-01')) is distinct from 'object' then bad := bad || 'd1_legacy_shape '; end if;

  -- D1: real payroll creation and validation are blocked
  perform pg_temp.no_user();
  m := '-'; begin insert into hr_payroll_runs (period_year, period_month, site_id, status_code) values (2027, 4, site_a, 'DRAFT'); exception when others then m := sqlerrm; end;
  if position('génération de la paie bloquée' in m) = 0 then bad := bad || 'd1_run_insert_not_blocked(' || m || ') '; end if;
  alter table hr_payroll_runs disable trigger trg_hr_payroll_run_guard;
  alter table hr_payroll_runs disable trigger trg_hr_payroll_run_decision_guard;
  m := '-'; begin update hr_payroll_runs set status_code = 'VALIDATED', validated_at = now() where id = run3; exception when others then m := sqlerrm; end;
  alter table hr_payroll_runs enable trigger trg_hr_payroll_run_guard;
  alter table hr_payroll_runs enable trigger trg_hr_payroll_run_decision_guard;
  if position('validation de la paie bloquée' in m) = 0 then bad := bad || 'd1_validation_not_blocked(' || m || ') '; end if;
  perform pg_temp.as_user(boss);

  -- D1: generation requests turn into a D1 request (pending D4 superseded), deduplicated
  d1a := hr_payroll_request_generation(site_a, 2027, 4, 'MANUAL');
  if not exists (select 1 from sys_decisions where id = d1a and type_code = 'D1' and status = 'PENDING'
                 and dedupe_key = 'D1:2027-04:' || site_a::text and jsonb_array_length(context->'blockers') = 1) then
    bad := bad || 'd1_not_requested ';
  end if;
  if (select status from sys_decisions where id = d4a) is distinct from 'SUPERSEDED' then bad := bad || 'd4_not_superseded '; end if;
  if hr_payroll_request_generation(site_a, 2027, 4, 'MANUAL') is distinct from d1a
     or hr_payroll_d1_request(site_a, 2027, 4) is distinct from d1a
     or (select count(*) from sys_notifications where decision_id = d1a) <> 1 then
    bad := bad || 'd1_dedupe ';
  end if;
  m := '-'; begin perform hr_payroll_d1_request(site_a, 2027, 2); exception when others then m := sqlerrm; end;
  if position('Aucune règle en attente' in m) = 0 then bad := bad || 'd1_without_blockers(' || m || ') '; end if;
  perform pg_temp.as_user(fin);
  m := '-'; begin perform hr_payroll_d1_request(site_a, 2027, 4); exception when others then m := sqlerrm; end;
  if position('Demande D1 non autorisée' in m) = 0 then bad := bad || 'd1_request_finance(' || m || ') '; end if;
  m := '-'; begin perform sys_decision_decide(d1a, 'WAIT', 'Attendre les textes', pg_temp.fp(d1a)); exception when others then m := sqlerrm; end;
  if position('pas le droit' in m) = 0 then bad := bad || 'd1_decide_finance(' || m || ') '; end if;
  m := '-'; begin perform hr_payroll_month_preparation(2027, 4, site_a); exception when others then m := sqlerrm; end;
  if position('Préparation de la paie non autorisée' in m) = 0 then bad := bad || 'preparation_finance(' || m || ') '; end if;
  perform pg_temp.as_user(boss);

  -- D1 WAIT: nothing computed; the same request is reused while nothing changes
  res := sys_decision_decide(d1a, 'WAIT', 'Attendre la loi de finances', pg_temp.fp(d1a));
  if res->>'status' is distinct from 'EXECUTED'
     or exists (select 1 from hr_payroll_simulations where decision_id = d1a) then
    bad := bad || 'd1_wait ';
  end if;
  if hr_payroll_request_generation(site_a, 2027, 4, 'MANUAL') is distinct from d1a then bad := bad || 'd1_wait_not_reused '; end if;

  -- D1 SIMULATE: new attendance gives a new request; the simulation is stored apart, never as a payroll
  insert into hr_attendance (employee_id, site_id, work_date, legend_code, source_code, status_code, validated_at, validated_by)
  values (emp1, site_a, date '2027-04-01', 'P', 'MANUAL', 'VALIDATED', now(), boss);
  d1b := hr_payroll_request_generation(site_a, 2027, 4, 'MANUAL');
  if d1b is null or d1b = d1a or (select status from sys_decisions where id = d1b) is distinct from 'PENDING' then
    bad := bad || 'd1_new_request_after_change ';
  end if;
  res := sys_decision_decide(d1b, 'SIMULATE', 'Simulation pour budget', pg_temp.fp(d1b));
  if res->>'status' is distinct from 'DECIDED' or (res->>'executes')::boolean is distinct from true then
    bad := bad || 'd1_simulate_decide(' || res::text || ') ';
  end if;
  m := '-';
  begin
    insert into hr_payroll_simulations (decision_id, period_year, period_month, site_id, created_by)
    values (d1b, 2027, 4, site_a, boss);
  exception when others then m := sqlerrm; end;
  if position('enregistrement figé' in m) = 0 then bad := bad || 'simulation_insert_not_guarded(' || m || ') '; end if;
  perform pg_temp.as_user(fin);
  m := '-'; begin perform hr_payroll_simulation_save(d1b, '[]', '[]'); exception when others then m := sqlerrm; end;
  if position('auteur de la décision' in m) = 0 then bad := bad || 'simulation_save_finance(' || m || ') '; end if;
  perform pg_temp.as_user(boss);
  res := hr_payroll_simulation_save(d1b, jsonb_build_array(jsonb_build_object(
           'employee_id', emp1, 'contract_id', c1, 'site_id', site_a, 'days_paid', 1, 'gross_amount', 10000,
           'employee_ss', 900, 'employer_ss', 2600, 'irg_amount', 0, 'net_payable', 9100,
           'detail', jsonb_build_object('matricule', 'L6-001'))),
         '["Avertissement test"]');
  if (res->>'ok')::boolean is distinct from true or (res->>'slips')::int is distinct from 1 then
    bad := bad || 'simulation_save(' || coalesce(res::text, 'null') || ') ';
  end if;
  if not exists (select 1 from hr_payroll_simulations s
                 where s.decision_id = d1b and s.status = 'RULES_NOT_APPROVED' and s.slip_count = 1
                   and (s.totals->>'net')::numeric = 9100 and jsonb_array_length(s.blockers) = 1
                   and s.warnings = '["Avertissement test"]'::jsonb and s.created_by = boss)
     or not exists (select 1 from sys_decisions where id = d1b and status = 'EXECUTED'
                    and execution_result->>'operation' = 'SIMULATION') then
    bad := bad || 'simulation_row ';
  end if;
  if exists (select 1 from hr_payroll_runs where period_year = 2027 and period_month = 4)
     or exists (select 1 from hr_payroll_slips where employee_id = emp1) then
    bad := bad || 'simulation_created_payroll ';
  end if;
  m := '-'; begin update hr_payroll_simulations set slip_count = 0 where decision_id = d1b; exception when others then m := sqlerrm; end;
  if position('enregistrement figé' in m) = 0 then bad := bad || 'simulation_update_not_guarded(' || m || ') '; end if;
  m := '-'; begin delete from hr_payroll_simulation_slips where employee_id = emp1; exception when others then m := sqlerrm; end;
  if position('enregistrement figé' in m) = 0 then bad := bad || 'simulation_delete_not_guarded(' || m || ') '; end if;
  m := '-'; begin perform hr_payroll_simulation_save(d1b, '[]', '[]'); exception when others then m := sqlerrm; end;
  if position('décidée requise' in m) = 0 then bad := bad || 'simulation_saved_twice(' || m || ') '; end if;

  -- D1 drift: data changed between the decision and the simulation
  insert into hr_attendance (employee_id, site_id, work_date, legend_code, source_code, status_code, validated_at, validated_by)
  values (emp1, site_a, date '2027-04-04', 'P', 'MANUAL', 'VALIDATED', now(), boss);
  d1c := hr_payroll_request_generation(site_a, 2027, 4, 'MANUAL');
  res := sys_decision_decide(d1c, 'SIMULATE', 'Nouvelle simulation pour budget', pg_temp.fp(d1c));
  insert into hr_attendance (employee_id, site_id, work_date, legend_code, source_code, status_code, validated_at, validated_by)
  values (emp1, site_a, date '2027-04-05', 'P', 'MANUAL', 'VALIDATED', now(), boss);
  res := hr_payroll_simulation_save(d1c, '[]', '[]');
  d1d := nullif(res->>'new_decision_id', '')::uuid;
  if res->>'reason' is distinct from 'INVALIDATED' or d1d is null
     or (select status from sys_decisions where id = d1c) is distinct from 'INVALIDATED'
     or (select status from sys_decisions where id = d1d) is distinct from 'PENDING'
     or exists (select 1 from hr_payroll_simulations where decision_id = d1c) then
    bad := bad || 'simulation_drift(' || coalesce(res::text, 'null') || ') ';
  end if;

  -- Month preparation
  prep := hr_payroll_month_preparation(2027, 4, site_a);
  if jsonb_array_length(prep->'rules'->'blockers') <> 1
     or jsonb_array_length(prep->'simulations') <> 1
     or (prep->'attendance'->>'validated')::int <> 3
     or prep->'run' is distinct from 'null'::jsonb
     or (prep->'can'->>'request')::boolean is distinct from true
     or not (prep->'decisions' @> jsonb_build_array(jsonb_build_object('id', d1d))) then
    bad := bad || 'preparation_04(' || left(prep::text, 300) || ') ';
  end if;
  prep := hr_payroll_month_preparation(2027, 3, site_a);
  if prep->'run'->>'status' is distinct from 'DRAFT'
     or (prep->'run'->>'pending_changes')::int < 1
     or not (prep->'coefficients'->'changes' @> '[{"code":"ZL6","coefficient":0.8,"previous":1}]'::jsonb) then
    bad := bad || 'preparation_03(' || left(prep::text, 300) || ') ';
  end if;

  -- Unblocked: the pending D1 is closed and generation goes back to D4
  set local session_replication_role = replica;
  update ref_rule_proposals set status = 'WITHDRAWN' where id = prop;
  set local session_replication_role = origin;
  if jsonb_array_length(hr_month_rule_blockers(date '2027-04-01')) <> 0 then bad := bad || 'd1_blocker_not_released '; end if;
  if sys_decision_refresh_record(d1d) is distinct from 'SUPERSEDED' then bad := bad || 'd1_refresh_without_blockers '; end if;
  dx := hr_payroll_request_generation(site_a, 2027, 4, 'MANUAL');
  if (select type_code from sys_decisions where id = dx) is distinct from 'D4' then bad := bad || 'd4_after_unblock '; end if;

  if bad <> '' then
    raise exception 'RESULT: FAIL %', bad;
  end if;
  raise exception 'RESULT: PASS';
end;
$$;
