-- Lot 2 — versioning and approval of legal rules. Every change is rolled back by the final raise.
-- Needs one SUPER_ADMIN, one ADMIN_RH and one ADMIN_FINANCE user (the finance role receives the approval
-- delegation inside the test).
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', p::text, true),
         set_config('ref.rule_review', '', true),
         set_config('ref.rule_apply', '', true);
$$;

-- Lot 4: every submitted proposal cites a register document. The test document is inserted directly (run as postgres).
create or replace function pg_temp.cite() returns jsonb language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into ref_legal_documents (id, doc_type, title, reference, applies_from, language, origin, storage_path,
                                   file_name, mime_type, size_bytes, sha256, created_by)
  values (v_id, 'DECRET_EXECUTIF', 'Texte test lot 2', 'Décret test lot 2', date '2020-01-01', 'FR', 'Test local',
          v_id::text || '/' || gen_random_uuid()::text || '.pdf', 'test.pdf', 'application/pdf', 1,
          md5(v_id::text) || md5(v_id::text), coalesce(auth.uid(), (select id from sys_users limit 1)));
  return jsonb_build_array(jsonb_build_object('document_id', v_id, 'article', 'art. 1', 'page', 1,
                                              'excerpt', 'Extrait du texte de test.'));
end;
$$;

do $$
declare
  boss uuid; rh uuid; fin uuid; cites jsonb;
  snmg uuid; snmg_old uuid; hours_ver uuid; hs_ver uuid; std uuid; legacy_bareme uuid; draft uuid; v_ver uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid; p7 uuid;
  d1 uuid; d2 uuid; d3 uuid; d4 uuid; d5 uuid; d7 uuid;
  fp text; res jsonb; m text;
  bad text := '';
begin
  select usr.user_id into boss from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'SUPER_ADMIN' limit 1;
  select usr.user_id into rh from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'ADMIN_RH' and usr.site_id is null limit 1;
  select usr.user_id into fin from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'ADMIN_FINANCE' and usr.site_id is null limit 1;
  select id into snmg from ref_global_vars where key = 'SNMG';
  select id into snmg_old from ref_global_var_versions where var_id = snmg and effective_to is null
   order by effective_from desc limit 1;
  select x.id into hours_ver from ref_global_var_versions x join ref_global_vars v on v.id = x.var_id
   where v.key = 'HEURES_MENSUELLES' and x.proposal_id is null and x.effective_to is null limit 1;
  select x.id into hs_ver from ref_global_var_versions x join ref_global_vars v on v.id = x.var_id
   where v.key = 'HS_TAUX_50' and x.proposal_id is null and x.effective_to is null limit 1;
  select id into std from hr_catalogs where kind = 'social_profile' and code = 'STANDARD';
  select id into legacy_bareme from ref_bareme_irg_versions where status = 'LEGACY' and effective_from < date '2031-01-01'
   order by effective_from desc limit 1;
  if boss is null or rh is null or fin is null or snmg_old is null or hours_ver is null or hs_ver is null
     or std is null or legacy_bareme is null then
    raise exception 'RESULT: SKIP (users SUPER_ADMIN / ADMIN_RH / ADMIN_FINANCE, SNMG, HEURES_MENSUELLES, HS_TAUX_50, STANDARD regime or legacy IRG scale missing)';
  end if;
  if public.hr_first_open_payroll_month() > date '2031-01-01' then
    raise exception 'RESULT: SKIP (payroll already processed beyond 01/2031)';
  end if;
  cites := pg_temp.cite();

  -- Exposure: internal appliers are not callable, the proposal RPC is (authenticated only)
  if has_function_privilege('authenticated', 'public.ref_rule_apply_d2(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.ref_rule_request_application_internal(uuid,date,date)', 'execute')
     or has_function_privilege('authenticated', 'public.ref_rule_check_payload(text,text,uuid,text,jsonb,text)', 'execute')
     or has_function_privilege('authenticated', 'public.ref_rule_apply_zone_scope(uuid,date,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_set_legal_var_version(uuid,date,numeric,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_stop_legal_var(uuid,date)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_set_social_profile_rates(uuid,date,numeric,numeric,numeric)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_cancel_legal_var_version(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_cancel_social_profile_rates(uuid)', 'execute') then
    bad := bad || 'internal_function_exposed ';
  end if;
  if not has_function_privilege('authenticated', 'public.ref_rule_proposal_save(uuid,text,text,uuid,text,jsonb,text,text,date,date,boolean,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.ref_rule_proposal_save(uuid,text,text,uuid,text,jsonb,text,text,date,date,boolean,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.ref_rule_proposal_approve(uuid,text)', 'execute') then
    bad := bad || 'rpc_grants ';
  end if;
  if has_table_privilege('authenticated', 'public.ref_rule_proposals', 'insert')
     or has_table_privilege('authenticated', 'public.ref_rule_proposals', 'update')
     or has_table_privilege('authenticated', 'public.ref_irg_zone_scopes', 'insert') then
    bad := bad || 'table_write_granted ';
  end if;

  -- Rules in force refuse any direct write
  perform pg_temp.as_user(rh);
  m := '-'; begin insert into ref_global_var_versions (var_id, value_numeric, effective_from) values (snmg, 1, date '2031-01-01'); exception when others then m := sqlerrm; end;
  if m not like '%aucune modification directe%' then bad := bad || 'direct_var_insert '; end if;
  m := '-'; begin update ref_global_var_versions set value_numeric = value_numeric + 1 where id = snmg_old; exception when others then m := sqlerrm; end;
  if m not like '%aucune modification directe%' then bad := bad || 'direct_var_update '; end if;
  m := '-'; begin perform hr_set_legal_var_version(snmg, date '2031-01-01', 1, null); exception when others then m := sqlerrm; end;
  if m not like '%aucune modification directe%' then bad := bad || 'setter_without_d2 '; end if;
  m := '-'; begin insert into hr_social_profile_rates (profile_id, employee_pct, employer_pct, fos_pct, effective_from) values (std, 1, 1, 1, date '2031-01-01'); exception when others then m := sqlerrm; end;
  if m not like '%aucune modification directe%' then bad := bad || 'direct_cnas_insert '; end if;
  m := '-'; begin update ref_bareme_irg_versions set label_fr = label_fr || ' x' where id = legacy_bareme; exception when others then m := sqlerrm; end;
  if m not like '%aucune modification directe%' then bad := bad || 'direct_bareme_update '; end if;
  m := '-'; begin insert into ref_bareme_irg (version_id, min_annual, max_annual, rate, sort_order) values (legacy_bareme, 0, 1, 0, 99); exception when others then m := sqlerrm; end;
  if m not like '%aucune modification directe%' then bad := bad || 'direct_bracket_insert '; end if;
  m := '-'; begin insert into ref_irg_zone_scopes (zone_code, effective_from, wilaya_codes, scope_mode, proposal_id) values ('SUD', date '2031-01-01', '{30}', 'WILAYAS', gen_random_uuid()); exception when others then m := sqlerrm; end;
  if m not like '%aucune modification directe%' then bad := bad || 'direct_scope_insert '; end if;

  -- Proposal: validated content, source and dates required, submitted by its author
  m := '-'; begin perform ref_rule_proposal_save(null, 'LEGAL_VAR', 'SET', snmg, null, '{"value":"abc"}', 'SNMG x', 'Décret test', date '2030-12-15', date '2031-01-01', false); exception when others then m := sqlerrm; end;
  if m not like '%numérique%' then bad := bad || 'payload_not_checked '; end if;
  m := '-'; begin perform ref_rule_proposal_save(null, 'LEGAL_VAR', 'SET', snmg, null, '{"value":1}', 'SNMG x', 'ab', date '2030-12-15', date '2031-01-01', false); exception when others then m := sqlerrm; end;
  if m not like '%Source légale%' then bad := bad || 'source_not_required '; end if;
  m := '-'; begin perform ref_rule_proposal_save(null, 'LEGAL_VAR', 'SET', snmg, null, '{"value":1}', 'SNMG x', 'Décret test', null, date '2031-01-01', false); exception when others then m := sqlerrm; end;
  if m not like '%Date d''effet%' then bad := bad || 'text_date_not_required '; end if;
  m := '-'; begin perform ref_rule_proposal_save(null, 'LEGAL_VAR', 'SET', snmg, null, '{"value":1}', 'SNMG x', 'Décret test', date '2030-12-15', date '2031-01-15', false); exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'month_not_first '; end if;

  p1 := ref_rule_proposal_save(null, 'LEGAL_VAR', 'SET', snmg, null, '{"value":25000}', 'SNMG 2031',
                               'Décret test art. 1, JO 2030', date '2030-12-15', date '2031-01-01', true, cites);
  if (select status from ref_rule_proposals where id = p1) <> 'SUBMITTED' then bad := bad || 'not_submitted '; end if;
  if (select count(*) from ref_rule_contributors where subject_kind = 'PROPOSAL' and subject_id = p1 and user_id = rh and role in ('CREATE', 'SUBMIT')) <> 2 then
    bad := bad || 'contributors_not_tracked ';
  end if;
  if not exists (select 1 from sys_notifications where recipient_screen = 'rule_approval' and link like '%' || p1::text) then
    bad := bad || 'approvers_not_notified ';
  end if;

  -- Submitted content, status, registry and contributors cannot be bypassed
  perform pg_temp.as_user(rh);
  m := '-'; begin update ref_rule_proposals set payload = '{"value":1}' where id = p1; exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'submitted_payload_edited '; end if;
  m := '-'; begin update ref_rule_proposals set status = 'APPROVED', reviewed_by = boss, reviewed_at = now() where id = p1; exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'status_bypass '; end if;
  m := '-'; begin delete from ref_rule_proposals where id = p1; exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'proposal_deleted '; end if;
  m := '-'; begin delete from ref_rule_contributors where subject_id = p1; exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'contributors_deleted '; end if;
  m := '-'; begin perform ref_rule_proposal_approve(p1, null); exception when others then m := sqlerrm; end;
  if m not like '%Approbation réservée%' then bad := bad || 'approved_without_right '; end if;

  -- Delegation to ADMIN_FINANCE; a delegate never approves a proposal they contributed to
  perform pg_temp.as_user(boss);
  update sys_permissions set can_update = true
   where role_id = (select id from sys_roles where code = 'ADMIN_FINANCE')
     and screen_id = (select id from sys_screens where code = 'rule_approval');
  if not found then bad := bad || 'approval_delegation_row_missing '; end if;

  perform pg_temp.as_user(fin);
  p2 := ref_rule_proposal_save(null, 'CNAS_RATES', 'SET', std, null, '{"employee_pct":9,"employer_pct":25,"fos_pct":0.5}',
                               'Taux CNAS 2031', 'Décret test CNAS art. 2', date '2031-01-01', date '2031-02-01', true, cites);
  m := '-'; begin perform ref_rule_proposal_approve(p2, null); exception when others then m := sqlerrm; end;
  if m not like '%Séparation des tâches%' then bad := bad || 'delegate_self_approval '; end if;
  m := '-';
  begin
    perform set_config('ref.rule_review', 'on', true);
    update ref_rule_proposals set status = 'APPROVED', reviewed_by = fin, reviewed_at = now() where id = p2;
  exception when others then m := sqlerrm; end;
  if m not like '%Séparation des tâches%' then bad := bad || 'guard_self_approval '; end if;
  perform pg_temp.as_user(fin);

  res := ref_rule_proposal_approve(p1, 'Conforme au décret');
  if (res->>'ok')::boolean is not true or (res->>'self_approved')::boolean or res->>'decision_id' is null then
    bad := bad || 'delegate_approval ';
  end if;
  d1 := (res->>'decision_id')::uuid;
  if not exists (select 1 from sys_decisions where id = d1 and type_code = 'D2' and status = 'PENDING'
                   and requested_by = fin and (scope->>'month')::date = date '2031-01-01'
                   and context->>'proposal_id' = p1::text) then
    bad := bad || 'd2_not_requested ';
  end if;
  if exists (select 1 from ref_global_var_versions where var_id = snmg and effective_from = date '2031-01-01') then
    bad := bad || 'effect_before_d2 ';
  end if;

  perform pg_temp.as_user(boss);
  res := ref_rule_proposal_approve(p2, null);
  if (res->>'self_approved')::boolean then bad := bad || 'sa_flagged_without_contribution '; end if;
  d2 := (res->>'decision_id')::uuid;

  -- D16 scope proposed and approved by the SUPER_ADMIN: allowed, flagged as self-approval
  p3 := ref_rule_proposal_save(null, 'IRG_ZONE_SCOPE', 'SET', null, 'SUD', '{"mode":"WILAYAS","wilayas":["30","11","30"]}',
                               'Zone Sud 2031', 'LF test art. 5', date '2031-01-01', date '2031-01-01', true, cites);
  if (select payload->'wilayas' from ref_rule_proposals where id = p3) <> '["11","30"]'::jsonb then
    bad := bad || 'scope_not_normalised ';
  end if;
  res := ref_rule_proposal_approve(p3, null);
  if (res->>'self_approved')::boolean is not true or not (select self_approved from ref_rule_proposals where id = p3) then
    bad := bad || 'sa_self_approval_not_flagged ';
  end if;
  d3 := (res->>'decision_id')::uuid;

  -- D2: SUPER_ADMIN by default; a delegated decider who contributed, or who requested, is refused
  perform pg_temp.as_user(rh);
  select fingerprint into fp from sys_decisions where id = d1;
  m := '-'; begin perform sys_decision_decide(d1, 'APPLY', 'Application test lot 2', fp, true); exception when others then m := sqlerrm; end;
  if m not like '%pas le droit%' then bad := bad || 'd2_without_right '; end if;

  perform pg_temp.as_user(boss);
  insert into sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
  select r.id, s.id, false, true, true, false, false, false
  from sys_roles r cross join sys_screens s
  where r.code = 'ADMIN_FINANCE' and s.code = 'decision_rule_application'
  on conflict (role_id, screen_id) do update set can_update = true;

  perform pg_temp.as_user(fin);
  select fingerprint into fp from sys_decisions where id = d2;
  m := '-'; begin perform sys_decision_decide(d2, 'APPLY', 'Application test lot 2', fp, true); exception when others then m := sqlerrm; end;
  if m not like '%contribué à cette règle%' then bad := bad || 'd2_contributor_decided '; end if;
  select fingerprint into fp from sys_decisions where id = d1;
  m := '-'; begin perform sys_decision_decide(d1, 'APPLY', 'Application test lot 2', fp, true); exception when others then m := sqlerrm; end;
  if m not like '%origine de cette demande%' then bad := bad || 'd2_requester_decided '; end if;

  perform pg_temp.as_user(boss);
  m := '-'; begin perform sys_decision_decide(d1, 'APPLY', 'Application test lot 2', fp, false); exception when others then m := sqlerrm; end;
  if m not like '%à risque%' then bad := bad || 'd2_without_risk_ack '; end if;
  res := sys_decision_decide(d1, 'APPLY', 'Application test lot 2', fp, true);
  if (res->>'applied')::boolean is not true or (select status from sys_decisions where id = d1) <> 'EXECUTED' then
    bad := bad || 'd2_not_applied ';
  end if;
  select id into v_ver from ref_global_var_versions
   where var_id = snmg and effective_from = date '2031-01-01' and value_numeric = 25000 and proposal_id = p1 and decision_id = d1;
  if v_ver is null then bad := bad || 'var_version_not_traced '; end if;
  if (select effective_to from ref_global_var_versions where id = snmg_old) is distinct from date '2030-12-31' then
    bad := bad || 'previous_version_not_closed ';
  end if;
  if not exists (select 1 from ref_rule_proposals where id = p1 and status = 'APPLIED' and applied_month = date '2031-01-01'
                   and application_decision_id = d1) then
    bad := bad || 'proposal_not_applied ';
  end if;

  select fingerprint into fp from sys_decisions where id = d2;
  res := sys_decision_decide(d2, 'APPLY', 'Application test lot 2', fp, true);
  if not exists (select 1 from hr_social_profile_rates where profile_id = std and effective_from = date '2031-02-01'
                   and employee_pct = 9 and proposal_id = p2 and decision_id = d2) then
    bad := bad || 'cnas_rates_not_applied ';
  end if;

  select fingerprint into fp from sys_decisions where id = d3;
  res := sys_decision_decide(d3, 'APPLY', 'Application test lot 2', fp, true);
  if not exists (select 1 from ref_irg_zone_scopes where zone_code = 'SUD' and effective_from = date '2031-01-01'
                   and wilaya_codes = '{11,30}' and scope_mode = 'WILAYAS' and proposal_id = p3 and decision_id = d3) then
    bad := bad || 'zone_scope_not_applied ';
  end if;

  -- A wilaya belongs to one zone per month; the date attaches to its month or the next, never splits one
  p4 := ref_rule_proposal_save(null, 'IRG_ZONE_SCOPE', 'SET', null, 'GRAND_SUD',
                               '{"mode":"GROUP","group_from":"SUD@2031-01-01","wilayas":["30"]}',
                               'Grand Sud 2031', 'LF test art. 6', date '2031-02-01', date '2031-02-01', true, cites);
  res := ref_rule_proposal_approve(p4, null);
  d4 := (res->>'decision_id')::uuid;
  select fingerprint into fp from sys_decisions where id = d4;
  m := '-'; begin perform sys_decision_decide(d4, 'APPLY', 'Application test lot 2', fp, true); exception when others then m := sqlerrm; end;
  if m not like '%déjà rattachée%' then bad := bad || 'zone_conflict_accepted '; end if;
  m := '-'; begin perform ref_rule_proposal_request_application(p4, date '2031-04-01', date '2031-02-15'); exception when others then m := sqlerrm; end;
  if m not like '%se rattache%' then bad := bad || 'date_splits_month '; end if;
  d5 := ref_rule_proposal_request_application(p4, date '2031-03-01', date '2031-02-15');
  if d5 = d4 or (select status from sys_decisions where id = d4) <> 'SUPERSEDED' then bad := bad || 'd2_not_superseded '; end if;
  select fingerprint into fp from sys_decisions where id = d5;
  res := sys_decision_decide(d5, 'NOT_NOW', 'Pas pour le moment, test lot 2', fp, true);
  if (select status from ref_rule_proposals where id = p4) <> 'APPROVED'
     or exists (select 1 from ref_irg_zone_scopes where zone_code = 'GRAND_SUD') then
    bad := bad || 'not_now_had_effect ';
  end if;
  perform ref_rule_proposal_withdraw(p4, 'Retrait test lot 2');
  m := '-'; begin update ref_rule_proposals set title = 'Autre titre' where id = p4; exception when others then m := sqlerrm; end;
  if m not like '%close%' then bad := bad || 'closed_proposal_edited '; end if;

  -- VERIFY: an existing value is approved as reference, unchanged; a value changed meanwhile is not
  perform pg_temp.as_user(rh);
  p5 := ref_rule_proposal_save(null, 'LEGAL_VAR', 'VERIFY', hours_ver, null, '{}', 'Vérification heures mensuelles',
                               'Code du travail, art. test', null, null, true, cites);
  m := '-'; begin perform ref_rule_proposal_save(null, 'LEGAL_VAR', 'VERIFY', hours_ver, null, '{}', 'Vérification bis', 'Code du travail', null, null, false); exception when others then m := sqlerrm; end;
  if m not like '%déjà ouverte%' then bad := bad || 'verify_duplicate '; end if;
  perform pg_temp.as_user(fin);
  res := ref_rule_proposal_approve(p5, null);
  if res->>'status' <> 'APPLIED' or (select proposal_id from ref_global_var_versions where id = hours_ver) is distinct from p5 then
    bad := bad || 'verify_not_applied ';
  end if;
  perform pg_temp.as_user(rh);
  p6 := ref_rule_proposal_save(null, 'LEGAL_VAR', 'VERIFY', hs_ver, null, '{}', 'Vérification HS 50',
                               'Code du travail, art. test', null, null, true, cites);
  perform set_config('ref.rule_apply', 'on', true);
  update ref_global_var_versions set value_numeric = value_numeric + 0.01 where id = hs_ver;
  perform pg_temp.as_user(fin);
  res := ref_rule_proposal_approve(p6, null);
  if res->>'reason' is distinct from 'CHANGED' or (select status from ref_rule_proposals where id = p6) <> 'SUPERSEDED'
     or (select proposal_id from ref_global_var_versions where id = hs_ver) is not null then
    bad := bad || 'verify_changed_value_accepted ';
  end if;

  -- IRG draft: editors are contributors; a proposed draft is frozen; applied by D2 at the chosen month
  perform pg_temp.as_user(rh);
  insert into ref_bareme_irg_versions (code, label_fr, source_ref, effective_from, status)
  values ('ZZ-L2-BAREME', 'Barème test lot 2', 'LF test', date '2031-01-01', 'DRAFT') returning id into draft;
  insert into ref_bareme_irg (version_id, min_annual, max_annual, rate, sort_order)
  values (draft, 0, 240000, 0, 1), (draft, 240001, null, 0.23, 2);
  if not exists (select 1 from ref_rule_contributors where subject_kind = 'IRG_BAREME' and subject_id = draft and user_id = rh and role = 'CREATE') then
    bad := bad || 'draft_creator_not_tracked ';
  end if;
  perform pg_temp.as_user(fin);
  update ref_bareme_irg set rate = 0.24 where version_id = draft and sort_order = 2;
  if not exists (select 1 from ref_rule_contributors where subject_kind = 'IRG_BAREME' and subject_id = draft and user_id = fin and role = 'EDIT') then
    bad := bad || 'draft_editor_not_tracked ';
  end if;
  perform pg_temp.as_user(rh);
  p7 := ref_rule_proposal_save(null, 'IRG_BAREME', 'SET', draft, null, '{}', 'Barème IRG 2031', 'LF 2031 art. 104',
                               date '2031-01-01', date '2031-01-01', true, cites);
  if (select status from ref_bareme_irg_versions where id = draft) <> 'PROPOSED' then bad := bad || 'draft_not_proposed '; end if;
  m := '-'; begin insert into ref_bareme_irg (version_id, min_annual, max_annual, rate, sort_order) values (draft, 1, 2, 0, 3); exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'proposed_draft_edited '; end if;
  perform pg_temp.as_user(fin);
  m := '-'; begin perform ref_rule_proposal_approve(p7, null); exception when others then m := sqlerrm; end;
  if m not like '%Séparation des tâches%' then bad := bad || 'draft_editor_approved '; end if;
  perform pg_temp.as_user(boss);
  res := ref_rule_proposal_approve(p7, null);
  if (res->>'self_approved')::boolean then bad := bad || 'draft_sa_flagged_without_contribution '; end if;
  d7 := (res->>'decision_id')::uuid;
  select fingerprint into fp from sys_decisions where id = d7;
  res := sys_decision_decide(d7, 'APPLY', 'Application test lot 2', fp, true);
  if not exists (select 1 from ref_bareme_irg_versions where id = draft and status = 'APPLIED'
                   and effective_from = date '2031-01-01' and proposal_id = p7 and decision_id = d7) then
    bad := bad || 'bareme_not_applied ';
  end if;
  if not exists (select 1 from ref_bareme_irg_versions where id = legacy_bareme and status = 'LEGACY'
                   and effective_to = date '2030-12-31') then
    bad := bad || 'legacy_bareme_not_closed ';
  end if;

  if jsonb_array_length(ref_rule_proposals_overview(false)) < 7 then bad := bad || 'overview_incomplete '; end if;

  if bad <> '' then raise exception 'RESULT: FAIL %', bad; end if;
  raise exception 'RESULT: PASS lot 2 (direct writes refused, proposals, separation of duties, SA self-approval flag, D2 apply/not now/supersede, D16 scopes, VERIFY, IRG drafts)';
end $$;
