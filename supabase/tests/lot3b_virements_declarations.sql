-- Lot 3b (rollback only): D9 transfer guard, D10 declaration guard, exports register, external operations register.
-- Expects the fixtures of the local runner: SUPER_ADMIN a2…01, ADMIN_RH a2…02, ADMIN_FINANCE a2…03 (no site scope).
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
  perform set_config('hr.payroll_reopen', '', true);
  perform set_config('hr.transfer_decision', '', true);
  perform set_config('ref.rule_apply', '', true);
end $$;

create or replace function pg_temp.make_run(p_site uuid, p_emp uuid, y int, m int) returns uuid language plpgsql as $$
declare d uuid; fp text; r uuid;
begin
  d := hr_payroll_request_generation(p_site, y, m, 'MANUAL');
  select fingerprint into fp from sys_decisions where id = d;
  perform sys_decision_decide(d, 'GENERATE', 'Test lot 3b rollback', fp, false);
  r := hr_payroll_run_open(d);
  perform hr_payroll_replace_slips(
    r,
    jsonb_build_array(jsonb_build_object('employee_id', p_emp, 'days_paid', 30, 'gross_amount', 50000,
                                         'irg_amount', 1200, 'net_payable', 42000)),
    jsonb_build_array(jsonb_build_object('employee_id', p_emp, 'source_code', 'base', 'code', 'T3B',
                                         'label_ar', 'اختبار', 'label_fr', 'Test lot 3b', 'category', '1',
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

-- Batch payload for one slip (file content, hash, totals consistent with the slip net).
create or replace function pg_temp.batch(p_no text, y int, m int, p_site uuid, p_mode text) returns jsonb language sql as $$
  select jsonb_build_object(
    'batch_no', p_no, 'period_year', y, 'period_month', m, 'site_id', p_site, 'mode', p_mode,
    'file_format', 'CCP_TXT_V1', 'file_name', p_no || '.txt', 'content', 'FILE ' || p_no,
    'sha256', encode(sha256(convert_to('FILE ' || p_no, 'UTF8')), 'hex'), 'line_count', 1, 'total_amount', 42000);
$$;

create or replace function pg_temp.line(p_slip uuid, p_emp uuid, p_amount numeric default 42000) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'slip_id', p_slip, 'employee_id', p_emp, 'matricule', 'T3B', 'employee_name', 'TEST LOT 3B',
    'account', '000123456789', 'amount', p_amount));
$$;

do $$
declare
  boss uuid := 'a2000000-0000-4000-8000-000000000001';
  rh uuid := 'a2000000-0000-4000-8000-000000000002';
  fin uuid := 'a2000000-0000-4000-8000-000000000003';
  site uuid; emp uuid; run_r uuid; run_o uuid; s_r uuid; s_o uuid;
  d6 uuid; d9 uuid; d9b uuid; d10 uuid; d10a uuid; d7 uuid;
  op1 uuid; op2 uuid; op2b uuid; doc1 uuid; doc2 uuid; root2 uuid; b1 uuid; b2 uuid;
  fp text; res jsonb; plan jsonb; st text; m text; n int; arr text[]; path1 text; path2 text;
  bad text := ''; notes text := '';
begin
  select id into site from ref_sites where is_active order by created_at limit 1;
  select id into emp from hr_employees order by created_at limit 1;
  if site is null or emp is null then raise exception 'RESULT: SKIP (no active site or employee)'; end if;
  if exists (select 1 from hr_payroll_runs where (period_year = 2031 and period_month = 7) or (period_year = 2026 and period_month = 3)) then
    raise exception 'RESULT: SKIP (payroll 03/2026 or 07/2031 already exists)';
  end if;

  -- 0. Exposure: helpers and registers stay closed to clients; the private bucket exists.
  if has_function_privilege('authenticated', 'public.hr_transfer_d9_reasons(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_external_ops_json(text,date,date,uuid,uuid[])', 'execute')
     or has_function_privilege('authenticated', 'public.hr_declaration_d10_context(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_transfer_d9_fingerprint(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_external_op_contributors(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.sys_decision_refresh_record(uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_transfer_batch_create(jsonb,jsonb,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_transfer_batch_create(jsonb,jsonb,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_declaration_export_record(jsonb,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_external_op_save(uuid,jsonb)', 'execute') then
    bad := bad || 'function_grants ';
  end if;
  if has_table_privilege('authenticated', 'public.hr_external_operations', 'insert')
     or has_table_privilege('authenticated', 'public.hr_external_operations', 'update')
     or has_table_privilege('authenticated', 'public.hr_external_operation_documents', 'insert')
     or has_table_privilege('authenticated', 'public.hr_declaration_exports', 'insert')
     or has_table_privilege('authenticated', 'public.hr_declaration_exports', 'delete') then
    bad := bad || 'table_grants ';
  end if;
  if not exists (select 1 from storage.buckets where id = 'hr-external-docs' and not public) then
    bad := bad || 'bucket_missing_or_public ';
  end if;

  -- 1. Fixtures: a reprise payroll (03/2026) and an operational payroll (07/2031), both validated.
  perform pg_temp.as_user(boss);
  run_r := pg_temp.make_run(site, emp, 2026, 3);
  st := hr_payroll_run_transition(run_r, 'validate');
  run_o := pg_temp.make_run(site, emp, 2031, 7);
  if hr_payroll_chain_required(2031, 7) then
    d6 := hr_payroll_request_chain_decision(run_o);
    res := sys_decision_decide(d6, 'SEPARATE', 'Test lot 3b : chaînes séparées', (select fingerprint from sys_decisions where id = d6), true);
    notes := notes || 'd6_separate ';
  end if;
  st := hr_payroll_run_transition(run_o, 'validate');
  select id into s_r from hr_payroll_slips where run_id = run_r;
  select id into s_o from hr_payroll_slips where run_id = run_o;
  if s_r is null or s_o is null then raise exception 'RESULT: FAIL fixtures (slips missing)'; end if;

  -- 2. Nature of payroll: the reprise slip is blocked, the operational one is not.
  select reasons into arr from hr_transfer_block_reasons(array[s_r]);
  if arr is distinct from array['EXTERNAL_PERIOD'] then bad := bad || 'reprise_reason(' || coalesce(array_to_string(arr, ','), 'null') || ') '; end if;
  select reasons into arr from hr_transfer_block_reasons(array[s_o]);
  if cardinality(arr) <> 0 then bad := bad || 'operational_blocked(' || array_to_string(arr, ',') || ') '; end if;

  -- 3. D9 guard in the database: no ordinary line for a reprise slip, whatever the path.
  m := pg_temp.try(format('select hr_transfer_batch_create(%L::jsonb, %L::jsonb, null)',
                          pg_temp.batch('T3B-R1', 2026, 3, site, 'CCP'), pg_temp.line(s_r, emp)));
  if m not like '%décision D9 requise%' then bad := bad || 'reprise_batch_allowed(' || m || ') '; end if;
  m := pg_temp.try(format($q$
    with b as (insert into hr_payroll_transfer_batches (batch_no, period_year, period_month, mode, file_format, file_name, content, sha256, line_count, total_amount)
               values ('T3B-R2', 2026, 3, 'CCP', 'CCP_TXT_V1', 'x.txt', 'x', 'abc', 1, 42000) returning id)
    insert into hr_payroll_transfer_lines (batch_id, slip_id, employee_id, matricule, employee_name, account, amount)
    select b.id, %L, %L, '1', 'T', '000123456789', 42000 from b $q$, s_r, emp));
  if m = '-' then bad := bad || 'reprise_direct_line_allowed '; end if;

  -- 4. Atomic batch creation checks the file hash and the slip net; an ordinary batch pays the operational slip.
  m := pg_temp.try(format('select hr_transfer_batch_create(%L::jsonb, %L::jsonb, null)',
                          pg_temp.batch('T3B-O0', 2031, 7, site, 'CCP') || jsonb_build_object('sha256', repeat('0', 64)),
                          pg_temp.line(s_o, emp)));
  if m not like '%Empreinte%' then bad := bad || 'bad_hash_allowed(' || m || ') '; end if;
  m := pg_temp.try(format('select hr_transfer_batch_create(%L::jsonb, %L::jsonb, null)',
                          pg_temp.batch('T3B-O0', 2031, 7, site, 'CCP') || jsonb_build_object('total_amount', 41000),
                          pg_temp.line(s_o, emp, 41000)));
  if m not like '%net à payer%' then bad := bad || 'wrong_amount_allowed(' || m || ') '; end if;
  res := hr_transfer_batch_create(pg_temp.batch('T3B-O1', 2031, 7, site, 'CCP'), pg_temp.line(s_o, emp), null);
  b1 := (res->>'id')::uuid;
  if b1 is null then bad := bad || 'ordinary_batch_refused '; end if;
  update hr_payroll_transfer_batches set status_code = 'DEPOSITED', deposit_ref = 'T3B-DEP' where id = b1;
  update hr_payroll_transfer_batches set status_code = 'EXECUTED' where id = b1;
  select reasons into arr from hr_transfer_block_reasons(array[s_o]);
  if arr is distinct from array['ALREADY_PAID'] then bad := bad || 'already_paid_reason(' || coalesce(array_to_string(arr, ','), 'null') || ') '; end if;
  m := pg_temp.try(format('select hr_transfer_batch_create(%L::jsonb, %L::jsonb, null)',
                          pg_temp.batch('T3B-O2', 2031, 7, site, 'CCP'), pg_temp.line(s_o, emp)));
  if m not like '%décision D9 requise%' then bad := bad || 'second_transfer_allowed(' || m || ') '; end if;

  -- 5. D9 real batch: requested by ADMIN_RH, decided by the SUPER_ADMIN, consumed once, exact scope only.
  perform pg_temp.as_user(rh);
  d9 := hr_transfer_request_d9(2031, 7, site, 'CCP', array[s_o], 'Test lot 3b : rappel de salaire après réouverture');
  if (select context->'slips'->0->'reasons' from sys_decisions where id = d9) <> '["ALREADY_PAID"]'::jsonb then
    bad := bad || 'd9_context_reasons ';
  end if;
  if jsonb_array_length((select context->'internal_transfers' from sys_decisions where id = d9)) <> 1 then
    bad := bad || 'd9_context_internal_transfers ';
  end if;
  m := pg_temp.try(format('select sys_decision_decide(%L, ''REAL_BATCH'', ''Test lot 3b auto-décision'', %L, true)',
                          d9, (select fingerprint from sys_decisions where id = d9)));
  if m = '-' then bad := bad || 'd9_self_decision_allowed '; end if;
  perform pg_temp.as_user(boss);
  res := sys_decision_decide(d9, 'REAL_BATCH', 'Test lot 3b : lot réel assumé', (select fingerprint from sys_decisions where id = d9), true);
  select status into st from sys_decisions where id = d9;
  if res->>'ok' <> 'true' or st <> 'DECIDED' then bad := bad || 'd9_not_decided(' || coalesce(st, 'null') || ') '; end if;
  m := pg_temp.try(format($q$
    insert into hr_payroll_transfer_batches (batch_no, period_year, period_month, mode, file_format, file_name, content, sha256, line_count, total_amount, decision_id)
    values ('T3B-FAKE', 2031, 7, 'CCP', 'CCP_TXT_V1', 'x.txt', 'x', 'abc', 1, 42000, %L) $q$, d9));
  if m = '-' then bad := bad || 'd9_batch_without_execution_allowed '; end if;
  perform pg_temp.as_user(fin);
  m := pg_temp.try(format('select hr_transfer_batch_create(%L::jsonb, %L::jsonb, %L)',
                          pg_temp.batch('T3B-O3', 2031, 7, site, 'CCP'), pg_temp.line(s_o, emp), d9));
  if m = '-' then bad := bad || 'd9_executed_by_third_party '; end if;
  perform pg_temp.as_user(rh);
  m := pg_temp.try(format('select hr_transfer_batch_create(%L::jsonb, %L::jsonb, %L)',
                          pg_temp.batch('T3B-O3', 2031, 7, site, 'BANK'), pg_temp.line(s_o, emp), d9));
  if m not like '%périmètre%' then bad := bad || 'd9_other_mode_allowed(' || m || ') '; end if;
  res := hr_transfer_batch_create(pg_temp.batch('T3B-O3', 2031, 7, site, 'CCP'), pg_temp.line(s_o, emp), d9);
  b2 := (res->>'id')::uuid;
  if b2 is null then bad := bad || 'd9_batch_refused(' || res::text || ') '; end if;
  if not coalesce((select double_payment_risk from hr_payroll_transfer_batches where id = b2), false) then
    bad := bad || 'd9_batch_not_marked ';
  end if;
  if (select status from sys_decisions where id = d9) <> 'EXECUTED' then bad := bad || 'd9_not_consumed '; end if;
  if (select count(*) from hr_payroll_transfer_lines where batch_id = b2 and decision_id = d9) <> 1 then bad := bad || 'd9_line_not_linked '; end if;
  m := pg_temp.try(format('select hr_transfer_batch_create(%L::jsonb, %L::jsonb, %L)',
                          pg_temp.batch('T3B-O4', 2031, 7, site, 'CCP'), pg_temp.line(s_o, emp), d9));
  if m = '-' then bad := bad || 'd9_reused '; end if;
  m := pg_temp.try(format('update hr_payroll_transfer_batches set double_payment_risk = false where id = %L', b2));
  if m = '-' then bad := bad || 'double_payment_mark_editable '; end if;
  update hr_payroll_transfer_batches set status_code = 'CANCELLED', cancelled_reason = 'Test lot 3b' where id = b2;

  -- 6. External payment register: counts for the block even when withdrawn; confirmation and examination are
  --    separate rights with separation of duties; content is immutable, deletion impossible.
  perform pg_temp.as_user(fin);
  m := pg_temp.try($q$select hr_external_op_save(null, '{"kind":"PAYMENT","subtype":"SALARY","period_from":"2031-07-01","source":"DECLARATIVE","description":"Test lot 3b non autorisé"}'::jsonb)$q$);
  if m = '-' then bad := bad || 'external_entry_without_right '; end if;
  perform pg_temp.as_user(boss);
  insert into sys_permissions (role_id, screen_id, can_create, can_read, can_update)
  select r.id, s.id, true, true, true from sys_roles r, sys_screens s
  where r.code = 'ADMIN_RH' and s.code in ('hr_external_operations', 'hr_external_operations_confirm', 'hr_external_operations_examine')
  on conflict (role_id, screen_id) do update set can_create = true, can_read = true, can_update = true;
  perform pg_temp.as_user(rh);
  op1 := hr_external_op_save(null, jsonb_build_object(
    'kind', 'PAYMENT', 'subtype', 'SALARY', 'period_from', '2031-07-01', 'period_to', '2031-07-01',
    'employee_ids', jsonb_build_array(emp), 'source', 'DECLARATIVE', 'total_amount', 42000,
    'description', 'Test lot 3b : acompte versé en espèces hors application'));
  select reasons into arr from hr_transfer_block_reasons(array[s_o]);
  if not ('EXTERNAL_PAYMENT' = any (arr)) then bad := bad || 'external_payment_not_blocking '; end if;
  m := pg_temp.try(format('select hr_external_op_confirm(%L)', op1));
  if m not like '%Séparation des tâches%' then bad := bad || 'self_confirm_allowed(' || m || ') '; end if;
  m := pg_temp.try(format('select hr_external_op_withdraw(%L, ''court'')', op1));
  if m = '-' then bad := bad || 'withdraw_without_reason '; end if;
  perform hr_external_op_withdraw(op1, 'Test lot 3b : saisie retirée par erreur');
  select reasons into arr from hr_transfer_block_reasons(array[s_o]);
  if not ('EXTERNAL_PAYMENT' = any (arr)) then bad := bad || 'withdrawal_lifted_block '; end if;
  perform pg_temp.as_user(boss);
  m := pg_temp.try(format('select hr_external_op_confirm(%L)', op1));
  if m = '-' then bad := bad || 'confirm_after_withdrawal '; end if;
  m := pg_temp.try(format('update hr_external_operations set description = ''Contenu modifié en base'' where id = %L', op1));
  if m = '-' then bad := bad || 'external_content_editable '; end if;
  m := pg_temp.try(format('delete from hr_external_operations where id = %L', op1));
  if m = '-' then bad := bad || 'external_delete_allowed '; end if;

  -- 7. Declaration entry with a document: correction = new version, examination voided by a replacement.
  perform pg_temp.as_user(rh);
  op2 := hr_external_op_save(null, jsonb_build_object(
    'kind', 'DECLARATION', 'subtype', 'G50', 'period_from', '2031-07-01', 'source', 'DOCUMENT',
    'reference', 'G50-TEST', 'description', 'Test lot 3b : G50 déposée hors application'));
  select root_id into root2 from hr_external_operations where id = op2;
  path1 := root2::text || '/' || gen_random_uuid()::text || '.pdf';
  path2 := root2::text || '/' || gen_random_uuid()::text || '.pdf';
  insert into storage.objects (bucket_id, name, metadata) values
    ('hr-external-docs', path1, '{"size": 1000}'::jsonb), ('hr-external-docs', path2, '{"size": 2000}'::jsonb);
  m := pg_temp.try(format('select hr_external_op_add_document(%L, %L, ''g50.pdf'', ''application/pdf'', 999, %L, null)',
                          op2, path1, repeat('a', 64)));
  if m = '-' then bad := bad || 'document_size_mismatch_allowed '; end if;
  doc1 := hr_external_op_add_document(op2, path1, 'g50.pdf', 'application/pdf', 1000, repeat('a', 64), null);
  m := pg_temp.try(format('select hr_external_op_examine(%L, ''Pièce conforme au dépôt'')', doc1));
  if m not like '%Séparation des tâches%' then bad := bad || 'self_examine_allowed(' || m || ') '; end if;
  perform pg_temp.as_user(boss);
  perform hr_external_op_confirm(op2);
  perform hr_external_op_examine(doc1, 'Bordereau G50 lisible, cachet visible');
  m := pg_temp.try(format('select hr_external_op_examine(%L, ''Deuxième examen de la pièce'')', doc1));
  if m = '-' then bad := bad || 'double_examination '; end if;
  m := pg_temp.try(format('update hr_external_operation_documents set examination_note = ''modifiée après coup'' where id = %L', doc1));
  if m = '-' then bad := bad || 'examination_editable '; end if;
  doc2 := hr_external_op_add_document(op2, path2, 'g50-v2.pdf', 'application/pdf', 2000, repeat('b', 64), doc1);
  if (select is_current from hr_external_operation_documents where id = doc1)
     or (select examined_at from hr_external_operation_documents where id = doc2) is not null then
    bad := bad || 'replacement_keeps_examination ';
  end if;
  op2b := hr_external_op_save(op2, jsonb_build_object(
    'kind', 'DECLARATION', 'subtype', 'G50', 'period_from', '2031-07-01', 'source', 'DOCUMENT',
    'reference', 'G50-TEST-2', 'description', 'Test lot 3b : G50 déposée hors application (référence corrigée)',
    'correction_reason', 'Référence du bordereau mal saisie'));
  if (select status from hr_external_operations where id = op2) <> 'SUPERSEDED'
     or (select version_no from hr_external_operations where id = op2b) <> 2
     or (select confirmed_at from hr_external_operations where id = op2b) is not null
     or (select count(*) from hr_external_operation_documents where operation_id = op2b and examined_at is null and copied_from = doc2) <> 1 then
    bad := bad || 'correction_version ';
  end if;
  m := pg_temp.try(format('select hr_external_op_confirm(%L)', op2));
  if m = '-' then bad := bad || 'confirm_superseded '; end if;

  -- 8. D10: a reprise month needs a decision; the exports register records the file and consumes it once.
  plan := hr_declaration_export_plan('monthly', 2026, 3, null, null);
  if not (plan->>'blocked')::boolean or plan->'required_months' <> '[3]'::jsonb then bad := bad || 'd10_plan_not_blocked '; end if;
  m := pg_temp.try($q$select hr_declaration_export_record('{"kind":"monthly","year":2026,"month":3,"nature":"OFFICIAL","months":[3],"file_name":"x.xlsx","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","byte_size":10,"slip_count":1,"payroll_status":"FINAL"}'::jsonb, null)$q$);
  if m not like '%D10%' then bad := bad || 'd10_record_without_decision(' || m || ') '; end if;
  perform pg_temp.as_user(rh);
  d10 := hr_declaration_request_d10('monthly', 2026, 3, null, 'Test lot 3b : contrôle de la reprise');
  if exists (select 1 from sys_decisions, jsonb_array_elements(options) o
             where id = d10 and o->>'code' = 'EXCLUDE' and (o->>'executes')::boolean) then
    bad := bad || 'd10_exclude_should_not_execute ';
  end if;
  perform pg_temp.as_user(boss);
  res := sys_decision_decide(d10, 'OFFICIAL', 'Test lot 3b : fichier officiel assumé', (select fingerprint from sys_decisions where id = d10), true);
  perform pg_temp.as_user(rh);
  m := pg_temp.try(format($q$select hr_declaration_export_record('{"kind":"monthly","year":2026,"month":3,"nature":"CONTROL","months":[3],"file_name":"x.xlsx","sha256":"%s","byte_size":10,"slip_count":1,"payroll_status":"FINAL"}'::jsonb, %L)$q$, repeat('c', 64), d10));
  if m not like '%Nature%' then bad := bad || 'd10_wrong_nature_allowed(' || m || ') '; end if;
  res := hr_declaration_export_record(jsonb_build_object(
    'kind', 'monthly', 'year', 2026, 'month', 3, 'nature', 'OFFICIAL', 'months', jsonb_build_array(3),
    'file_name', 'Declarations_paie_2026-03.xlsx', 'sha256', repeat('c', 64), 'byte_size', 10, 'slip_count', 1,
    'payroll_status', 'FINAL'), d10);
  if res->>'ok' <> 'true'
     or not coalesce((select double_declaration_risk from hr_declaration_exports where id = (res->>'id')::uuid), false)
     or (select status from sys_decisions where id = d10) <> 'EXECUTED' then
    bad := bad || 'd10_official_export(' || res::text || ') ';
  end if;
  m := pg_temp.try(format($q$select hr_declaration_export_record('{"kind":"monthly","year":2026,"month":3,"nature":"OFFICIAL","months":[3],"file_name":"x.xlsx","sha256":"%s","byte_size":10,"slip_count":1,"payroll_status":"FINAL"}'::jsonb, %L)$q$, repeat('d', 64), d10));
  if m = '-' then bad := bad || 'd10_reused '; end if;
  m := pg_temp.try(format('delete from hr_declaration_exports where id = %L', res->>'id'));
  if m = '-' then bad := bad || 'export_register_deletable '; end if;

  -- Annual DAS 2026: EXCLUDE keeps September–December only.
  d10a := hr_declaration_request_d10('das', 2026, null, null, 'Test lot 3b : DAS sans les mois de reprise');
  perform pg_temp.as_user(boss);
  res := sys_decision_decide(d10a, 'EXCLUDE', 'Test lot 3b : exclusion des mois de reprise', (select fingerprint from sys_decisions where id = d10a), true);
  perform pg_temp.as_user(rh);
  plan := hr_declaration_export_plan('das', 2026, null, null, d10a);
  if (plan->>'blocked')::boolean or plan->'months' <> '[9,10,11,12]'::jsonb or plan->'excluded_months' <> '[1,2,3,4,5,6,7,8]'::jsonb then
    bad := bad || 'd10_exclude_plan(' || plan->>'months' || ') ';
  end if;
  res := hr_declaration_export_record(jsonb_build_object(
    'kind', 'das', 'year', 2026, 'nature', 'OFFICIAL', 'months', jsonb_build_array(9, 10, 11, 12),
    'file_name', 'DAS_CNAS_2026.xlsx', 'sha256', repeat('e', 64), 'byte_size', 10, 'slip_count', 0,
    'payroll_status', 'PROVISIONAL'), d10a);
  if res->>'ok' <> 'true' or (select excluded_months from hr_declaration_exports where id = (res->>'id')::uuid) <> array[1,2,3,4,5,6,7,8] then
    bad := bad || 'd10_exclude_export ';
  end if;

  -- Operational month: the external G50 entry blocks the G50 / monthly exports, not the CNAS file.
  plan := hr_declaration_export_plan('monthly', 2031, 7, null, null);
  if not (plan->>'blocked')::boolean or plan->'month_reasons'->'7' <> '["EXTERNAL_DECLARATION"]'::jsonb then
    bad := bad || 'external_declaration_not_blocking ';
  end if;
  plan := hr_declaration_export_plan('cnas_file', 2031, 7, null, null);
  if (plan->>'blocked')::boolean then bad := bad || 'g50_entry_blocks_cnas '; end if;
  res := hr_declaration_export_record(jsonb_build_object(
    'kind', 'cnas_file', 'year', 2031, 'month', 7, 'nature', 'OFFICIAL', 'months', jsonb_build_array(7),
    'file_name', 'CNAS_COTISATIONS_2031_07.csv', 'sha256', repeat('f', 64), 'byte_size', 10, 'slip_count', 1,
    'payroll_status', 'FINAL'), null);
  if res->>'ok' <> 'true' or (select decision_id from hr_declaration_exports where id = (res->>'id')::uuid) is not null then
    bad := bad || 'ordinary_export ';
  end if;
  if jsonb_array_length(hr_declaration_export_plan('cnas_file', 2031, 7, null, null)->'prior_exports') <> 1 then
    bad := bad || 'prior_exports_not_listed ';
  end if;

  -- 9. Stale D9: an external entry added after the decision invalidates it at execution; reconciliation statement.
  d9b := hr_transfer_request_d9(2031, 7, site, 'CCP', array[s_o], 'Test lot 3b : nouveau lot après annulation');
  perform pg_temp.as_user(boss);
  res := sys_decision_decide(d9b, 'REAL_BATCH', 'Test lot 3b : lot réel', (select fingerprint from sys_decisions where id = d9b), true);
  perform pg_temp.as_user(rh);
  perform hr_external_op_save(null, jsonb_build_object(
    'kind', 'PAYMENT', 'subtype', 'OTHER', 'period_from', '2031-06-01', 'period_to', '2031-08-01',
    'site_ids', jsonb_build_array(site), 'source', 'DECLARATIVE', 'description', 'Test lot 3b : prime versée hors application'));
  res := hr_transfer_batch_create(pg_temp.batch('T3B-O5', 2031, 7, site, 'CCP'), pg_temp.line(s_o, emp), d9b);
  if res->>'ok' <> 'false' or (select status from sys_decisions where id = d9b) <> 'INVALIDATED' then
    bad := bad || 'stale_d9_executed(' || res::text || ') ';
  end if;
  d9b := hr_transfer_request_d9(2031, 7, site, 'CCP', array[s_o], 'Test lot 3b : état de rapprochement');
  perform pg_temp.as_user(boss);
  res := sys_decision_decide(d9b, 'RECONCILIATION', 'Test lot 3b : rapprochement', (select fingerprint from sys_decisions where id = d9b), true);
  perform pg_temp.as_user(rh);
  res := hr_transfer_d9_reconciliation(d9b);
  if res->>'ok' <> 'true' or (res->'rows'->0->>'transferred')::numeric <> 42000
     or (select status from sys_decisions where id = d9b) <> 'EXECUTED'
     or jsonb_array_length(res->'external_operations') < 2 then
    bad := bad || 'reconciliation(' || left(res::text, 200) || ') ';
  end if;

  -- 10. D7 shows the exports register and the external operations of the month.
  d7 := hr_payroll_request_reopen(run_r, 'Test lot 3b : réouverture pour contrôle');
  select count(*) into n from sys_decisions
  where id = d7 and (context->>'declarations_registry')::boolean
    and jsonb_array_length(context->'declaration_exports') = 1
    and jsonb_typeof(context->'external_operations') = 'array';
  if n <> 1 then bad := bad || 'd7_context_registers '; end if;

  if bad <> '' then raise exception 'RESULT: FAIL % (notes: %)', bad, notes; end if;
  raise exception 'RESULT: PASS lot 3b (D9 transfer guard incl. already-paid and external payments, atomic batch with hash/net checks, D9 single use and scope, D10 plan/record/exclusion/subtypes, exports register immutable, external register versions/confirmation/examination/SoD, stale D9, reconciliation, D7 registers) notes: %', notes;
end $$;
