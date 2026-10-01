-- Lot 7 — AI extraction of legal documents (2026 onwards) and decision D15. Every change is rolled back by the final raise.
-- Needs one SUPER_ADMIN, one ADMIN_RH and one ADMIN_FINANCE user. Files are simulated by storage.objects rows; Gemini is
-- not called: the test stores a prepared answer through ref_legal_ai_extraction_save, as the server action does.
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', p::text, true),
         set_config('ref.rule_review', '', true),
         set_config('ref.rule_apply', '', true),
         set_config('ref.ai_extraction', '', true),
         set_config('ref.ai_origin', '', true);
$$;

create or replace function pg_temp.upload(p_folder uuid) returns text language plpgsql as $$
declare
  v_path text := p_folder::text || '/' || gen_random_uuid()::text || '.pdf';
begin
  insert into storage.objects (bucket_id, name, metadata) values ('legal-documents', v_path, jsonb_build_object('size', 1000));
  return v_path;
end;
$$;

create or replace function pg_temp.doc(p_type text, p_title text, p_from date, p_to date) returns uuid language plpgsql as $$
declare
  f uuid := gen_random_uuid();
begin
  return ref_legal_doc_create(
    pg_temp.upload(f), 'texte.pdf', 'application/pdf', 1000, encode(sha256(convert_to(f::text, 'UTF8')), 'hex'),
    jsonb_build_object('doc_type', p_type, 'title', p_title, 'reference', 'Réf. ' || p_title, 'applies_from', p_from,
                       'applies_to', p_to, 'language', 'FR', 'origin', 'JORADP (test)'));
end;
$$;

create or replace function pg_temp.fp(p uuid) returns text language sql as $$
  select fingerprint from sys_decisions where id = p;
$$;

do $$
declare
  boss uuid; rh uuid; fin uuid; snmg uuid; std uuid; zone text;
  doc_ai uuid; doc_old uuid; doc_conv uuid; doc_d15 uuid; doc_d15m uuid; doc_d15v2 uuid;
  ex1 uuid; ex2 uuid; ex3 uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; s6 uuid; s_d15 uuid;
  p1 uuid; pm uuid; d15 uuid; d15b uuid; d15m uuid; dx uuid;
  n_props bigint; n_vers bigint;
  sugg jsonb; res jsonb; m text;
  excerpt_snmg text := 'Le SNMG est fixé à 24.000 DA à compter du 1er janvier 2026.';
  bad text := '';
begin
  select usr.user_id into boss from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'SUPER_ADMIN' limit 1;
  select usr.user_id into rh from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'ADMIN_RH' and usr.site_id is null limit 1;
  select usr.user_id into fin from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'ADMIN_FINANCE' and usr.site_id is null limit 1;
  select id into snmg from ref_global_vars where key = 'SNMG';
  select id into std from hr_catalogs where kind = 'social_profile' and code = 'STANDARD';
  select code into zone from hr_catalogs where kind = 'irg_zone' and is_active order by sort_order limit 1;
  if boss is null or rh is null or fin is null or snmg is null or std is null or zone is null
     or (select count(*) from ref_wilayas where code in ('01', '33')) <> 2 then
    raise exception 'RESULT: SKIP (users, SNMG, STANDARD regime, IRG zone or wilayas 01/33 missing)';
  end if;
  if hr_first_open_payroll_month() > date '2031-01-01' then
    raise exception 'RESULT: SKIP (payroll already processed beyond 01/2031)';
  end if;

  -- Exposure, grants, rights matrix, decision type
  if has_function_privilege('authenticated', 'public.ref_legal_doc_ai_path(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.ref_ai_payload_in_excerpt(text,jsonb,text)', 'execute')
     or has_function_privilege('authenticated', 'public.ref_legal_doc_d15_choice(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.ref_legal_doc_d15_decision(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.ref_legal_doc_d15_fingerprint(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.ref_legal_doc_d15_context(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.ref_legal_ai_guard()', 'execute')
     or has_function_privilege('authenticated', 'public.ref_rule_proposals_guard()', 'execute')
     or has_function_privilege('authenticated', 'public.sys_decision_refresh_record(uuid)', 'execute') then
    bad := bad || 'internal_function_exposed ';
  end if;
  if not has_function_privilege('authenticated', 'public.ref_legal_ai_extract_check(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.ref_legal_ai_extraction_save(uuid,text,boolean,jsonb,jsonb,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.ref_legal_ai_suggestion_convert(uuid,uuid,text,jsonb,text,text,date,date,text,integer,text,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.ref_legal_ai_suggestion_dismiss(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.ref_legal_doc_request_d15(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.ref_legal_ai_paths()', 'execute')
     or has_function_privilege('anon', 'public.ref_legal_ai_extract_check(uuid)', 'execute')
     or has_function_privilege('anon', 'public.ref_legal_ai_extraction_save(uuid,text,boolean,jsonb,jsonb,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.ref_legal_ai_suggestion_convert(uuid,uuid,text,jsonb,text,text,date,date,text,integer,text,boolean)', 'execute')
     or has_function_privilege('anon', 'public.ref_legal_doc_request_d15(uuid)', 'execute')
     or has_function_privilege('anon', 'public.ref_legal_ai_paths()', 'execute') then
    bad := bad || 'rpc_grants ';
  end if;
  if has_table_privilege('authenticated', 'public.ref_legal_ai_extractions', 'insert')
     or has_table_privilege('authenticated', 'public.ref_legal_ai_extractions', 'update')
     or has_table_privilege('authenticated', 'public.ref_legal_ai_suggestions', 'insert')
     or has_table_privilege('authenticated', 'public.ref_legal_ai_suggestions', 'update')
     or has_table_privilege('authenticated', 'public.ref_legal_ai_suggestions', 'delete')
     or has_table_privilege('anon', 'public.ref_legal_ai_suggestions', 'select')
     or not has_table_privilege('authenticated', 'public.ref_legal_ai_suggestions', 'select') then
    bad := bad || 'table_privileges ';
  end if;
  if (select count(*) from sys_screens where code in ('legal_ai_extraction', 'decision_legal_entry_path')) <> 2
     or exists (select 1 from sys_permissions pm join sys_roles r on r.id = pm.role_id join sys_screens s on s.id = pm.screen_id
                where s.code in ('legal_ai_extraction', 'decision_legal_entry_path') and r.code <> 'SUPER_ADMIN') then
    bad := bad || 'rights_not_super_admin_only ';
  end if;
  if not exists (select 1 from sys_decision_types where code = 'D15' and risk_class = 'ORDINARY' and not policy_allowed
                   and screen_code = 'decision_legal_entry_path'
                   and options @> '[{"code":"MANUAL","executes":false},{"code":"AI","executes":false}]') then
    bad := bad || 'decision_type ';
  end if;

  -- Excerpt numbers: Arabic digits, grouped thousands, ambiguous separators, fraction written as a percentage
  if ref_ai_excerpt_numbers('24.000 DA') <> array[24000, 24]::numeric[]
     or ref_ai_excerpt_numbers('24 000') <> array[24000]::numeric[]
     or ref_ai_excerpt_numbers('24,000') <> array[24, 24000]::numeric[]
     or ref_ai_excerpt_numbers('1.2345') <> array[1.2345]::numeric[]
     or ref_ai_excerpt_numbers('article 12 2024') <> array[12, 2024]::numeric[]
     or ref_ai_excerpt_numbers('١٢٫٢١ %') <> array[12.21]::numeric[]
     or not ref_ai_number_in_excerpt(0.09, 'taux de 9 % à la charge du salarié')
     or not ref_ai_number_in_excerpt(0.1221, 'fixé à 12,21 %')
     or not ref_ai_number_in_excerpt(24000, 'يحدد بـ ٢٤٠٠٠ دج')
     or ref_ai_number_in_excerpt(0.09, 'taux de 9,5 %')
     or ref_ai_fold('  GHARDAÏA, M''Sila ') <> 'ghardaia, m sila' then
    bad := bad || 'excerpt_numbers ';
  end if;
  if not ref_ai_payload_in_excerpt('IRG_ZONE_SCOPE', '{"wilayas":["01","33"]}', 'Les wilayas d''Adrar et d''Illizi.')
     or ref_ai_payload_in_excerpt('IRG_ZONE_SCOPE', '{"wilayas":["33"]}', 'wilaya 33')
     or not ref_ai_payload_in_excerpt('CNAS_RATES', '{"employee_pct":9,"employer_pct":26,"fos_pct":null}', 'Taux : 9 % et 26 %.')
     or ref_ai_payload_in_excerpt('CNAS_RATES', '{"employee_pct":null,"employer_pct":null,"fos_pct":null}', 'Taux : 9 %.') then
    bad := bad || 'payload_check ';
  end if;

  -- Documents and their path
  perform pg_temp.as_user(rh);
  doc_ai := pg_temp.doc('LOI_FINANCES', 'LF 2031 test lot 7', date '2026-01-01', null);
  doc_old := pg_temp.doc('LOI_FINANCES', 'LF 2025 test lot 7', date '2025-01-01', date '2025-12-31');
  doc_conv := pg_temp.doc('CONVENTION', 'Convention test lot 7', date '2025-07-01', null);
  doc_d15 := pg_temp.doc('LOI', 'Loi à cheval test lot 7', date '2025-07-01', null);
  doc_d15m := pg_temp.doc('DECRET_EXECUTIF', 'Décret à cheval test lot 7', date '2025-03-01', date '2026-03-31');
  if ref_legal_doc_ai_path(doc_ai) <> 'AI_ALLOWED' or ref_legal_doc_ai_path(doc_old) <> 'MANUAL'
     or ref_legal_doc_ai_path(doc_conv) <> 'TYPE_EXCLUDED' or ref_legal_doc_ai_path(doc_d15) <> 'D15_UNDECIDED'
     or ref_legal_ai_paths()->>doc_ai::text <> 'AI_ALLOWED' then
    bad := bad || 'paths ';
  end if;

  -- Analysis right and paths checked before anything leaves the application
  m := '-'; begin perform ref_legal_ai_extract_check(doc_ai); exception when others then m := sqlerrm; end;
  if m not like '%Analyse IA des documents juridiques non autorisée%' then bad := bad || 'check_without_right '; end if;
  perform pg_temp.as_user(boss);
  insert into sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
  select (select id from sys_roles where code = 'ADMIN_FINANCE'), id, true, true, false, false, false, false
  from sys_screens where code = 'legal_ai_extraction';
  perform pg_temp.as_user(fin);
  m := '-'; begin perform ref_legal_ai_extract_check(doc_old); exception when others then m := sqlerrm; end;
  if m not like '%entièrement antérieure à 2026%' then bad := bad || 'manual_path_analysed '; end if;
  m := '-'; begin perform ref_legal_ai_extract_check(doc_conv); exception when others then m := sqlerrm; end;
  if m not like '%textes officiels publiés%' then bad := bad || 'convention_analysed '; end if;
  m := '-'; begin perform ref_legal_ai_extract_check(doc_d15); exception when others then m := sqlerrm; end;
  if m not like '%demandez d''abord la décision D15%' then bad := bad || 'd15_undecided_analysed '; end if;
  res := ref_legal_ai_extract_check(doc_ai);
  if res->>'path' <> 'AI_ALLOWED' or res->>'storage_path' is null or res->>'mime_type' <> 'application/pdf' then
    bad := bad || 'check_result ';
  end if;

  -- Stored answer: suggestions only, targets resolved, excerpt check computed
  select count(*) into n_props from ref_rule_proposals;
  select count(*) into n_vers from ref_global_var_versions;
  sugg := jsonb_build_array(
    jsonb_build_object('kind', 'LEGAL_VAR', 'target_code', 'snmg', 'payload', jsonb_build_object('value', 24000),
                       'excerpt', excerpt_snmg, 'article', 'art. 5', 'page', 2, 'confidence', 'HIGH', 'effective_date', '2026-01-01'),
    jsonb_build_object('kind', 'LEGAL_VAR', 'target_code', 'SNMG', 'payload', jsonb_build_object('value', 25000),
                       'excerpt', excerpt_snmg, 'confidence', 'MEDIUM'),
    jsonb_build_object('kind', 'CNAS_RATES', 'target_code', 'STANDARD',
                       'payload', jsonb_build_object('employee_pct', 9, 'employer_pct', 26, 'fos_pct', null),
                       'excerpt', 'Taux : 9 % salarié et 26 % employeur.', 'confidence', 'HIGH'),
    jsonb_build_object('kind', 'IRG_ZONE_SCOPE', 'target_code', zone, 'payload', jsonb_build_object('wilayas', jsonb_build_array('01', '33', '99')),
                       'excerpt', 'Sont concernées les wilayas d''Adrar et d''Illizi.', 'confidence', 'LOW'),
    jsonb_build_object('kind', 'IRG_BAREME', 'payload', jsonb_build_object('brackets', jsonb_build_array(
                         jsonb_build_object('from', 0, 'to', 30000, 'rate', 0), jsonb_build_object('from', 30001, 'to', null, 'rate', 23))),
                       'excerpt', 'de 0 à 30 000 DA : 0 % ; de 30 001 DA et plus : 23 %', 'confidence', 'HIGH'),
    jsonb_build_object('kind', 'LEGAL_VAR', 'target_code', 'NOPE_KEY', 'payload', jsonb_build_object('value', 1),
                       'excerpt', 'Une valeur de 1 sans objet.', 'confidence', 'BIZARRE', 'page', 99999)
  );
  m := '-'; begin perform ref_legal_ai_extraction_save(doc_ai, 'gemini-test', false, '{}', '[]', sugg); exception when others then m := sqlerrm; end;
  if m not like '%aucune donnée personnelle%' then bad := bad || 'saved_without_confirmation '; end if;
  ex1 := ref_legal_ai_extraction_save(doc_ai, 'gemini-test', true, '{"readable":true}', '[{"kind":"OCR","text":"Page 2 floue"}]', sugg);
  select id into s1 from ref_legal_ai_suggestions where extraction_id = ex1 and seq = 1;
  select id into s2 from ref_legal_ai_suggestions where extraction_id = ex1 and seq = 2;
  select id into s3 from ref_legal_ai_suggestions where extraction_id = ex1 and seq = 3;
  select id into s4 from ref_legal_ai_suggestions where extraction_id = ex1 and seq = 4;
  select id into s5 from ref_legal_ai_suggestions where extraction_id = ex1 and seq = 5;
  select id into s6 from ref_legal_ai_suggestions where extraction_id = ex1 and seq = 6;
  if not exists (select 1 from ref_legal_ai_extractions where id = ex1 and status = 'OPEN' and suggestion_count = 6
                   and entry_path = 'AI_ALLOWED' and d15_decision_id is null and created_by = fin and personal_data_confirmed)
     or not exists (select 1 from ref_legal_ai_suggestions where id = s1 and target_id = snmg and excerpt_match and status = 'OPEN')
     or not exists (select 1 from ref_legal_ai_suggestions where id = s2 and target_id = snmg and not excerpt_match)
     or not exists (select 1 from ref_legal_ai_suggestions where id = s3 and target_id = std and excerpt_match)
     or not exists (select 1 from ref_legal_ai_suggestions where id = s4 and target_key = zone and excerpt_match
                      and payload->'wilayas' = '["01","33"]'::jsonb)
     or not exists (select 1 from ref_legal_ai_suggestions where id = s5 and kind = 'IRG_BAREME' and excerpt_match)
     or not exists (select 1 from ref_legal_ai_suggestions where id = s6 and target_id is null and confidence = 'LOW'
                      and page is null and warnings::text like '%Cible non reconnue%') then
    bad := bad || 'saved_suggestions ';
  end if;
  if (select count(*) from ref_rule_proposals) <> n_props or (select count(*) from ref_global_var_versions) <> n_vers then
    bad := bad || 'analysis_had_effect ';
  end if;

  -- Analyses are written only by the functions above, never deleted
  m := '-'; begin update ref_legal_ai_suggestions set payload = '{"value":1}' where id = s2; exception when others then m := sqlerrm; end;
  if m not like '%écrit uniquement%' then bad := bad || 'direct_update '; end if;
  m := '-'; begin delete from ref_legal_ai_suggestions where id = s2; exception when others then m := sqlerrm; end;
  if m not like '%suppression interdite%' then bad := bad || 'direct_delete '; end if;
  perform set_config('ref.ai_extraction', 'on', true);
  m := '-'; begin update ref_legal_ai_suggestions set excerpt_match = true where id = s2; exception when others then m := sqlerrm; end;
  if m not like '%contenu figé%' then bad := bad || 'content_not_frozen '; end if;
  perform set_config('ref.ai_extraction', '', true);

  -- Conversion by a human: blocking excerpt check, scale never converted, origin AI and AI_EXTRACT contributor
  perform pg_temp.as_user(rh);
  m := '-'; begin perform ref_legal_ai_suggestion_convert(s2, snmg, null, '{"value":25000}', 'SNMG 25000', 'LF test art. 5', date '2026-01-01', date '2031-01-01', 'art. 5', 2, excerpt_snmg, true); exception when others then m := sqlerrm; end;
  if m not like '%Contrôle bloquant%' then bad := bad || 'conversion_not_blocked '; end if;
  m := '-'; begin perform ref_legal_ai_suggestion_convert(s5, null, null, '{}', 'Barème', 'LF test', date '2026-01-01', date '2031-01-01', 'art. 9', 3, 'de 0 à 30 000 DA : 0 %', true); exception when others then m := sqlerrm; end;
  if m not like '%barème IRG se saisissent à la main%' then bad := bad || 'scale_converted '; end if;
  p1 := ref_legal_ai_suggestion_convert(s1, snmg, null, '{"value":24000}', 'SNMG 24 000 DA', 'LF test art. 5', date '2026-01-01',
                                        date '2031-01-01', 'art. 5', 2, excerpt_snmg, true);
  if not exists (select 1 from ref_rule_proposals where id = p1 and origin = 'AI' and status = 'SUBMITTED' and created_by = rh)
     or not exists (select 1 from ref_rule_contributors where subject_kind = 'PROPOSAL' and subject_id = p1 and user_id = fin and role = 'AI_EXTRACT')
     or not exists (select 1 from ref_rule_contributors where subject_kind = 'PROPOSAL' and subject_id = p1 and user_id = rh and role = 'CREATE')
     or (select count(*) from ref_rule_citations where proposal_id = p1 and document_id = doc_ai and article = 'art. 5') <> 1
     or not exists (select 1 from ref_legal_ai_suggestions where id = s1 and status = 'CONVERTED' and proposal_id = p1 and decided_by = rh
                      and (final->>'payload_edited')::boolean = false and (final->>'excerpt_edited')::boolean = false) then
    bad := bad || 'conversion ';
  end if;
  if (select count(*) from ref_global_var_versions) <> n_vers then bad := bad || 'conversion_had_effect '; end if;
  m := '-'; begin perform ref_legal_ai_suggestion_convert(s1, snmg, null, '{"value":24000}', 'SNMG', 'LF test', date '2026-01-01', date '2031-01-01', 'art. 5', 2, excerpt_snmg, true); exception when others then m := sqlerrm; end;
  if m not like '%déjà transformée ou écartée%' then bad := bad || 'converted_twice '; end if;

  -- Separation of duties: whoever launched the analysis cannot approve, the SUPER_ADMIN can
  perform pg_temp.as_user(boss);
  update sys_permissions set can_update = true
   where role_id = (select id from sys_roles where code = 'ADMIN_FINANCE')
     and screen_id = (select id from sys_screens where code = 'rule_approval');
  perform pg_temp.as_user(fin);
  m := '-'; begin perform ref_rule_proposal_approve(p1, null); exception when others then m := sqlerrm; end;
  if m not like '%Séparation des tâches%' then bad := bad || 'ai_extractor_approved '; end if;
  perform pg_temp.as_user(boss);
  res := ref_rule_proposal_approve(p1, 'Valeur conforme au texte');
  if (res->>'ok')::boolean is not true or (select status from ref_rule_proposals where id = p1) <> 'APPROVED'
     or (select self_approved from ref_rule_proposals where id = p1) then
    bad := bad || 'approval_after_ai ';
  end if;

  -- Origin changes only MANUAL → AI, on a draft, inside the conversion
  perform pg_temp.as_user(rh);
  pm := ref_rule_proposal_save(null, 'LEGAL_VAR', 'SET', snmg, null, '{"value":26000}', 'SNMG manuel lot 7', 'LF test art. 6',
                               date '2026-01-01', date '2031-01-01', false,
                               jsonb_build_array(jsonb_build_object('document_id', doc_ai, 'article', 'art. 6', 'page', 2, 'excerpt', 'Texte saisi à la main.')));
  m := '-'; begin update ref_rule_proposals set origin = 'AI' where id = pm; exception when others then m := sqlerrm; end;
  if m not like '%ne se modifient pas%' then bad := bad || 'origin_changed_directly '; end if;
  perform set_config('ref.ai_origin', 'on', true);
  perform set_config('ref.rule_review', 'on', true);
  m := '-'; begin update ref_rule_proposals set origin = 'MANUAL' where id = p1; exception when others then m := sqlerrm; end;
  if m not like '%ne se modifient pas%' then bad := bad || 'origin_reverted '; end if;
  perform pg_temp.as_user(rh);

  -- Dismissal with a reason
  m := '-'; begin perform ref_legal_ai_suggestion_dismiss(s6, 'non'); exception when others then m := sqlerrm; end;
  if m not like '%Motif requis%' then bad := bad || 'dismiss_reason '; end if;
  perform ref_legal_ai_suggestion_dismiss(s6, 'Valeur hors sujet paie');
  if not exists (select 1 from ref_legal_ai_suggestions where id = s6 and status = 'DISMISSED' and decided_by = rh
                   and dismiss_reason = 'Valeur hors sujet paie') then
    bad := bad || 'not_dismissed ';
  end if;

  -- A new analysis closes the previous one; converted suggestions stay
  perform pg_temp.as_user(fin);
  ex2 := ref_legal_ai_extraction_save(doc_ai, 'gemini-test', true, '{}', '[]', jsonb_build_array(sugg->2));
  if (select status from ref_legal_ai_extractions where id = ex1) <> 'CLOSED'
     or (select count(*) from ref_legal_ai_extractions where root_id = doc_ai and status = 'OPEN') <> 1
     or exists (select 1 from ref_legal_ai_suggestions where extraction_id = ex1 and status = 'OPEN')
     or (select status from ref_legal_ai_suggestions where id = s3) <> 'DISMISSED'
     or (select dismiss_reason from ref_legal_ai_suggestions where id = s3) not like 'Remplacée%'
     or (select status from ref_legal_ai_suggestions where id = s1) <> 'CONVERTED' then
    bad := bad || 'previous_analysis_not_closed ';
  end if;

  -- D15: only for official texts across 2025 and 2026
  perform pg_temp.as_user(rh);
  m := '-'; begin perform ref_legal_doc_request_d15(doc_ai); exception when others then m := sqlerrm; end;
  if m not like '%pas à cheval%' then bad := bad || 'd15_for_2026_text '; end if;
  m := '-'; begin perform ref_legal_doc_request_d15(doc_conv); exception when others then m := sqlerrm; end;
  if m not like '%Type de document exclu%' then bad := bad || 'd15_for_convention '; end if;
  d15 := ref_legal_doc_request_d15(doc_d15);
  if not exists (select 1 from sys_decisions where id = d15 and type_code = 'D15' and status = 'PENDING' and requested_by = rh
                   and request_source = 'LEGAL_DOCUMENT' and period_year is null and dedupe_key = 'D15:' || doc_d15
                   and scope->>'document_id' = doc_d15::text and context->>'title' = 'Loi à cheval test lot 7')
     or ref_legal_doc_request_d15(doc_d15) <> d15
     or ref_legal_doc_ai_path(doc_d15) <> 'D15_PENDING'
     or sys_decision_current_fingerprint(d15) is distinct from pg_temp.fp(d15)
     or not exists (select 1 from sys_notifications where decision_id = d15 and recipient_screen = 'decision_legal_entry_path') then
    bad := bad || 'd15_request ';
  end if;
  perform pg_temp.as_user(fin);
  m := '-'; begin perform ref_legal_ai_extract_check(doc_d15); exception when others then m := sqlerrm; end;
  if m not like '%en attente%' then bad := bad || 'analysed_while_d15_pending '; end if;

  -- D15 « AI »: recorded only (no operation), then the analysis is allowed and linked to the decision
  perform pg_temp.as_user(boss);
  res := sys_decision_decide(d15, 'AI', 'Texte officiel publié, valeurs 2026 à extraire', pg_temp.fp(d15));
  if (res->>'ok')::boolean is not true
     or not exists (select 1 from sys_decisions where id = d15 and status = 'EXECUTED' and chosen_option = 'AI'
                      and execution_result->>'operation' = 'NONE')
     or ref_legal_doc_ai_path(doc_d15) <> 'D15_AI' then
    bad := bad || 'd15_ai_decision ';
  end if;
  perform pg_temp.as_user(fin);
  ex3 := ref_legal_ai_extraction_save(doc_d15, 'gemini-test', true, '{}', '[]', jsonb_build_array(sugg->0));
  select id into s_d15 from ref_legal_ai_suggestions where extraction_id = ex3;
  if not exists (select 1 from ref_legal_ai_extractions where id = ex3 and entry_path = 'D15_AI' and d15_decision_id = d15) then
    bad := bad || 'd15_ai_extraction ';
  end if;

  -- A new request, then a correction that removes the need for D15: the pending request is superseded and the
  -- suggestions of the corrected version can no longer be converted
  perform pg_temp.as_user(rh);
  d15b := ref_legal_doc_request_d15(doc_d15);
  if d15b = d15 or (select status from sys_decisions where id = d15b) <> 'PENDING' then bad := bad || 'd15_second_request '; end if;
  doc_d15v2 := ref_legal_doc_correct(doc_d15, jsonb_build_object('doc_type', 'LOI', 'title', 'Loi à cheval test lot 7',
    'reference', 'Réf. Loi à cheval test lot 7', 'applies_from', date '2026-01-01', 'applies_to', null, 'language', 'FR',
    'origin', 'JORADP (test)'), 'Date d''application corrigée');
  if sys_decision_current_fingerprint(d15b) is not distinct from pg_temp.fp(d15b)
     or sys_decision_refresh_record(d15b) is distinct from 'SUPERSEDED'
     or ref_legal_doc_ai_path(doc_d15) <> 'NOT_ACTIVE' or ref_legal_doc_ai_path(doc_d15v2) <> 'AI_ALLOWED' then
    bad := bad || 'd15_refresh ';
  end if;
  m := '-'; begin perform ref_legal_ai_suggestion_convert(s_d15, snmg, null, '{"value":24000}', 'SNMG', 'Loi test', date '2026-01-01', date '2031-01-01', 'art. 5', 2, excerpt_snmg, true); exception when others then m := sqlerrm; end;
  if m not like '%plus utilisable par la voie IA%' then bad := bad || 'converted_from_old_version '; end if;

  -- D15 « MANUAL »: no analysis for this document
  d15m := ref_legal_doc_request_d15(doc_d15m);
  perform pg_temp.as_user(boss);
  res := sys_decision_decide(d15m, 'MANUAL', 'Valeurs déjà saisies à la main pour 2025', pg_temp.fp(d15m));
  if ref_legal_doc_ai_path(doc_d15m) <> 'D15_MANUAL' then bad := bad || 'd15_manual_decision '; end if;
  perform pg_temp.as_user(fin);
  m := '-'; begin perform ref_legal_ai_extract_check(doc_d15m); exception when others then m := sqlerrm; end;
  if m not like '%saisie manuelle pour ce document%' then bad := bad || 'analysed_after_d15_manual '; end if;

  -- Readers
  if not ref_legal_ai_can_read() then bad := bad || 'reader_refused '; end if;
  perform pg_temp.as_user(gen_random_uuid());
  if ref_legal_ai_can_read() then bad := bad || 'stranger_reads '; end if;
  m := '-'; begin dx := ref_legal_doc_request_d15(doc_d15m); exception when others then m := sqlerrm; end;
  if m not like '%Session requise%' and m not like '%non autorisée%' then bad := bad || 'stranger_requests_d15 '; end if;

  if bad <> '' then raise exception 'RESULT: FAIL %', bad; end if;
  raise exception 'RESULT: PASS lot 7 (grants, rights, paths MANUAL/type/D15, excerpt numbers, confirmation, suggestions only, guards, blocking conversion check, origin AI and AI_EXTRACT separation, dismissal, re-analysis, D15 request/decide/refresh)';
end $$;
