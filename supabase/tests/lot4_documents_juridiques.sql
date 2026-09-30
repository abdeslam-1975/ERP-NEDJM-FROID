-- Lot 4 — legal documents register and proposal citations. Every change is rolled back by the final raise.
-- Needs one SUPER_ADMIN, one ADMIN_RH and one ADMIN_FINANCE user. Files are simulated by storage.objects rows.
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', p::text, true),
         set_config('ref.rule_review', '', true),
         set_config('ref.rule_apply', '', true);
$$;

-- A received file: <folder>/<uuid>.pdf with its size in the object metadata.
create or replace function pg_temp.upload(p_folder uuid, p_size bigint) returns text language plpgsql as $$
declare
  v_path text := p_folder::text || '/' || gen_random_uuid()::text || '.pdf';
begin
  insert into storage.objects (bucket_id, name, metadata) values ('legal-documents', v_path, jsonb_build_object('size', p_size));
  return v_path;
end;
$$;

create or replace function pg_temp.meta(p_title text, p_from date, p_to date) returns jsonb language sql as $$
  select jsonb_build_object('doc_type', 'LOI_FINANCES', 'title', p_title, 'reference', 'Loi test ' || p_title,
                            'jo_number', '85', 'jo_date', '2025-12-30', 'applies_from', p_from, 'applies_to', p_to,
                            'language', 'FR', 'origin', 'JORADP (test)', 'source_url', 'https://www.joradp.dz/test.pdf');
$$;

create or replace function pg_temp.cite(p_doc uuid, p_article text) returns jsonb language sql as $$
  select jsonb_build_object('document_id', p_doc, 'article', p_article, 'page', 3, 'excerpt', 'Le montant est fixé par le présent article.');
$$;

do $$
declare
  boss uuid; rh uuid; fin uuid; snmg uuid; std uuid;
  f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid(); f3 uuid := gen_random_uuid(); f4 uuid := gen_random_uuid();
  path1 text; path2 text; path3 text; path4 text;
  sha1 text := repeat('ab', 32); sha2 text := repeat('cd', 32); sha3 text := repeat('ef', 32);
  doc1 uuid; doc2 uuid; doc3 uuid; doc4 uuid; doc5 uuid;
  pa uuid; pb uuid; pc uuid; pd uuid;
  n_rules bigint; n_props bigint;
  res jsonb; m text;
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
  if boss is null or rh is null or fin is null or snmg is null or std is null then
    raise exception 'RESULT: SKIP (users SUPER_ADMIN / ADMIN_RH / ADMIN_FINANCE, SNMG or STANDARD regime missing)';
  end if;
  if public.hr_first_open_payroll_month() > date '2031-01-01' then
    raise exception 'RESULT: SKIP (payroll already processed beyond 01/2031)';
  end if;

  -- Exposure and rights matrix
  if has_function_privilege('authenticated', 'public.ref_legal_doc_fields(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.ref_legal_doc_session(text)', 'execute')
     or has_function_privilege('authenticated', 'public.ref_rule_citations_json(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.ref_rule_citation_warnings(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.ref_rule_application_context(uuid,date,date)', 'execute') then
    bad := bad || 'internal_function_exposed ';
  end if;
  if not has_function_privilege('authenticated', 'public.ref_legal_doc_create(text,text,text,bigint,text,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.ref_legal_documents_list(integer)', 'execute')
     or has_function_privilege('anon', 'public.ref_legal_doc_create(text,text,text,bigint,text,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.ref_legal_doc_withdraw(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.ref_legal_documents_list(integer)', 'execute')
     or exists (select 1 from pg_proc where proname = 'ref_rule_proposal_save' and pronargs = 11) then
    bad := bad || 'rpc_grants ';
  end if;
  if has_table_privilege('authenticated', 'public.ref_legal_documents', 'insert')
     or has_table_privilege('authenticated', 'public.ref_legal_documents', 'update')
     or has_table_privilege('authenticated', 'public.ref_legal_documents', 'delete')
     or has_table_privilege('authenticated', 'public.ref_rule_citations', 'insert')
     or has_table_privilege('authenticated', 'public.ref_rule_citations', 'delete') then
    bad := bad || 'table_write_granted ';
  end if;
  if not exists (select 1 from storage.buckets where id = 'legal-documents' and not public and file_size_limit = 26214400) then
    bad := bad || 'bucket_not_private ';
  end if;
  if not exists (select 1 from sys_permissions pm join sys_roles r on r.id = pm.role_id join sys_screens s on s.id = pm.screen_id
                 where s.code = 'legal_documents' and r.code = 'ADMIN_RH' and pm.can_read and pm.can_create and not pm.can_update)
     or not exists (select 1 from sys_permissions pm join sys_roles r on r.id = pm.role_id join sys_screens s on s.id = pm.screen_id
                    where s.code = 'legal_documents' and r.code = 'SUPER_ADMIN' and pm.can_update) then
    bad := bad || 'rights_matrix ';
  end if;

  -- Entry path by application period
  if ref_legal_doc_entry_path(date '2024-01-01', date '2025-12-31') <> 'MANUAL'
     or ref_legal_doc_entry_path(date '2026-01-01', null) <> 'AI_ALLOWED'
     or ref_legal_doc_entry_path(date '2025-06-01', date '2026-06-30') <> 'D15'
     or ref_legal_doc_entry_path(date '2020-01-01', null) <> 'D15' then
    bad := bad || 'entry_path ';
  end if;

  -- Import: the folder is a fresh id; the stored file must exist with the declared size
  select count(*) into n_rules from ref_global_var_versions;
  select count(*) into n_props from ref_rule_proposals;
  perform pg_temp.as_user(rh);
  if not ref_legal_doc_upload_allowed(f1::text) or ref_legal_doc_upload_allowed('pas-un-uuid') then
    bad := bad || 'upload_policy ';
  end if;
  m := '-'; begin perform ref_legal_doc_create(f1::text || '/' || gen_random_uuid()::text || '.pdf', 'lf.pdf', 'application/pdf', 1000, sha1, pg_temp.meta('LF 2026', date '2026-01-01', null)); exception when others then m := sqlerrm; end;
  if m not like '%Fichier non reçu%' then bad := bad || 'missing_file_accepted '; end if;
  path1 := pg_temp.upload(f1, 1000);
  m := '-'; begin perform ref_legal_doc_create(path1, 'lf.pdf', 'application/pdf', 999, sha1, pg_temp.meta('LF 2026', date '2026-01-01', null)); exception when others then m := sqlerrm; end;
  if m not like '%Taille différente%' then bad := bad || 'size_not_checked '; end if;
  m := '-'; begin perform ref_legal_doc_create(path1, 'lf.pdf', 'application/pdf', 1000, sha1, pg_temp.meta('LF 2026', date '2026-01-01', date '2025-12-31')); exception when others then m := sqlerrm; end;
  if m not like '%antérieure à son début%' then bad := bad || 'period_not_checked '; end if;
  m := '-'; begin perform ref_legal_doc_create(path1, 'lf.pdf', 'application/pdf', 1000, sha1, pg_temp.meta('LF 2026', date '2026-01-01', null) || '{"source_url":"http://x.dz"}'); exception when others then m := sqlerrm; end;
  if m not like '%https://%' then bad := bad || 'url_not_checked '; end if;
  m := '-'; begin perform ref_legal_doc_create(path1, 'lf.pdf', 'application/pdf', 1000, sha1, pg_temp.meta('LF 2026', null, null)); exception when others then m := sqlerrm; end;
  if m not like '%Début de la période%' then bad := bad || 'start_not_required '; end if;

  doc1 := ref_legal_doc_create(path1, 'lf.pdf', 'application/pdf', 1000, upper(sha1), pg_temp.meta('LF 2026', date '2026-01-01', null));
  if doc1 <> f1 or not exists (select 1 from ref_legal_documents where id = doc1 and root_id = doc1 and version_no = 1
                                  and status = 'ACTIVE' and created_by = rh and sha256 = sha1 and storage_path = path1) then
    bad := bad || 'doc_not_created ';
  end if;
  if (select count(*) from ref_global_var_versions) <> n_rules or (select count(*) from ref_rule_proposals) <> n_props then
    bad := bad || 'import_had_effect ';
  end if;
  if ref_legal_doc_upload_allowed(f1::text) then bad := bad || 'upload_into_existing_entry '; end if;
  m := '-'; begin perform ref_legal_doc_create(path1, 'lf.pdf', 'application/pdf', 1000, sha2, pg_temp.meta('LF bis', date '2026-01-01', null)); exception when others then m := sqlerrm; end;
  if m not like '%déjà enregistré%' then bad := bad || 'folder_reused '; end if;
  path2 := pg_temp.upload(f2, 2000);
  m := '-'; begin perform ref_legal_doc_create(path2, 'copie.pdf', 'application/pdf', 2000, sha1, pg_temp.meta('Copie', date '2026-01-01', null)); exception when others then m := sqlerrm; end;
  if m not like '%déjà au registre%' then bad := bad || 'duplicate_sha_accepted '; end if;

  -- Without the create right
  perform pg_temp.as_user(boss);
  update sys_permissions set can_create = false
   where role_id = (select id from sys_roles where code = 'ADMIN_FINANCE')
     and screen_id = (select id from sys_screens where code = 'legal_documents');
  perform pg_temp.as_user(fin);
  m := '-'; begin perform ref_legal_doc_create(path2, 'b.pdf', 'application/pdf', 2000, sha2, pg_temp.meta('LF b', date '2026-01-01', null)); exception when others then m := sqlerrm; end;
  if m not like '%Import des documents juridiques non autorisé%' then bad := bad || 'create_without_right '; end if;

  -- The register is never rewritten: no delete, no in-place change
  perform pg_temp.as_user(rh);
  m := '-'; begin delete from ref_legal_documents where id = doc1; exception when others then m := sqlerrm; end;
  if m not like '%suppression interdite%' then bad := bad || 'doc_deleted '; end if;
  m := '-'; begin update ref_legal_documents set title = 'Autre titre' where id = doc1; exception when others then m := sqlerrm; end;
  if m not like '%informations non modifiables%' then bad := bad || 'doc_edited_in_place '; end if;

  -- Correction: new version, same file, previous one kept as superseded
  m := '-'; begin perform ref_legal_doc_correct(doc1, pg_temp.meta('LF 2026', date '2026-01-01', null), 'Aucune différence réelle'); exception when others then m := sqlerrm; end;
  if m not like '%Aucune information modifiée%' then bad := bad || 'empty_correction '; end if;
  m := '-'; begin perform ref_legal_doc_correct(doc1, pg_temp.meta('LF 2026 corrigée', date '2026-01-01', null), 'court'); exception when others then m := sqlerrm; end;
  if m not like '%Motif de la correction%' then bad := bad || 'correction_reason '; end if;
  doc2 := ref_legal_doc_correct(doc1, pg_temp.meta('LF 2026 corrigée', date '2026-01-01', null), 'Numéro du JO corrigé');
  if not exists (select 1 from ref_legal_documents where id = doc2 and root_id = doc1 and version_no = 2 and supersedes_id = doc1
                   and status = 'ACTIVE' and storage_path = path1 and sha256 = sha1 and correction_reason is not null)
     or (select status from ref_legal_documents where id = doc1) <> 'SUPERSEDED' then
    bad := bad || 'correction_not_versioned ';
  end if;
  m := '-'; begin perform ref_legal_doc_correct(doc1, pg_temp.meta('LF 2026 v3', date '2026-01-01', null), 'Correction de la v1'); exception when others then m := sqlerrm; end;
  if m not like '%version en vigueur%' then bad := bad || 'superseded_corrected '; end if;
  m := '-'; begin update ref_legal_documents set status = 'WITHDRAWN', withdrawn_by = boss, withdrawn_at = now(), withdrawn_reason = 'Retrait direct test' where id = doc1; exception when others then m := sqlerrm; end;
  if m not like '%définitif%' then bad := bad || 'superseded_reopened '; end if;
  m := '-'; begin insert into ref_legal_documents (supersedes_id, doc_type, title, reference, applies_from, language, origin, storage_path, file_name, mime_type, size_bytes, sha256, correction_reason, created_by)
    values (doc2, 'LOI', 'Autre fichier', 'Réf test', date '2026-01-01', 'FR', 'Test local', path2, 'x.pdf', 'application/pdf', 2000, sha2, 'Changement de fichier', rh);
  exception when others then m := sqlerrm; end;
  if m not like '%fichier d''un document ne change pas%' then bad := bad || 'file_replaced '; end if;

  -- Other entries: an old text (2020 only, manual path) and one to be withdrawn
  path3 := pg_temp.upload(f3, 3000);
  doc3 := ref_legal_doc_create(path3, 'lf2020.pdf', 'application/pdf', 3000, sha3, pg_temp.meta('LF 2020', date '2020-01-01', date '2020-12-31'));
  path4 := pg_temp.upload(f4, 4000);
  doc4 := ref_legal_doc_create(path4, 'circ.pdf', 'application/pdf', 4000, sha2, pg_temp.meta('Circulaire', date '2026-01-01', null));

  -- Withdrawal: SUPER_ADMIN only, with a reason
  m := '-'; begin perform ref_legal_doc_withdraw(doc4, 'Texte abrogé par la suite'); exception when others then m := sqlerrm; end;
  if m not like '%Retrait des documents juridiques non autorisé%' then bad := bad || 'withdraw_without_right '; end if;
  perform pg_temp.as_user(boss);
  m := '-'; begin perform ref_legal_doc_withdraw(doc4, 'court'); exception when others then m := sqlerrm; end;
  if m not like '%Motif du retrait%' then bad := bad || 'withdraw_reason '; end if;
  perform ref_legal_doc_withdraw(doc4, 'Circulaire importée par erreur');
  if not exists (select 1 from ref_legal_documents where id = doc4 and status = 'WITHDRAWN' and withdrawn_by = boss) then
    bad := bad || 'not_withdrawn ';
  end if;

  -- Citations: required at submission, valid documents only, replaced as a whole while in draft
  perform pg_temp.as_user(rh);
  m := '-'; begin perform ref_rule_proposal_save(null, 'LEGAL_VAR', 'SET', snmg, null, '{"value":26000}', 'SNMG test lot 4', 'LF 2026 art. 1', date '2026-01-01', date '2031-01-01', true); exception when others then m := sqlerrm; end;
  if m not like '%Justificatif requis%' then bad := bad || 'submitted_without_citation '; end if;
  m := '-'; begin perform ref_rule_proposal_save(null, 'LEGAL_VAR', 'SET', snmg, null, '{"value":26000}', 'SNMG test lot 4', 'LF 2026 art. 1', date '2026-01-01', date '2031-01-01', false, jsonb_build_array(pg_temp.cite(doc4, 'art. 1'))); exception when others then m := sqlerrm; end;
  if m not like '%retiré ou remplacé%' then bad := bad || 'withdrawn_doc_cited '; end if;
  m := '-'; begin perform ref_rule_proposal_save(null, 'LEGAL_VAR', 'SET', snmg, null, '{"value":26000}', 'SNMG test lot 4', 'LF 2026 art. 1', date '2026-01-01', date '2031-01-01', false, jsonb_build_array(pg_temp.cite(doc1, 'art. 1'))); exception when others then m := sqlerrm; end;
  if m not like '%retiré ou remplacé%' then bad := bad || 'superseded_doc_cited '; end if;
  m := '-'; begin perform ref_rule_proposal_save(null, 'LEGAL_VAR', 'SET', snmg, null, '{"value":26000}', 'SNMG test lot 4', 'LF 2026 art. 1', date '2026-01-01', date '2031-01-01', false, jsonb_build_array(pg_temp.cite(gen_random_uuid(), 'art. 1'))); exception when others then m := sqlerrm; end;
  if m not like '%introuvable au registre%' then bad := bad || 'unknown_doc_cited '; end if;
  m := '-'; begin perform ref_rule_proposal_save(null, 'LEGAL_VAR', 'SET', snmg, null, '{"value":26000}', 'SNMG test lot 4', 'LF 2026 art. 1', date '2026-01-01', date '2031-01-01', false, jsonb_build_array(pg_temp.cite(doc2, 'art. 1') || '{"excerpt":"court"}')); exception when others then m := sqlerrm; end;
  if m not like '%extrait du texte requis%' then bad := bad || 'excerpt_not_checked '; end if;

  pa := ref_rule_proposal_save(null, 'LEGAL_VAR', 'SET', snmg, null, '{"value":26000}', 'SNMG test lot 4', 'LF 2026 art. 1',
                               date '2026-01-01', date '2031-01-01', false, jsonb_build_array(pg_temp.cite(doc2, 'art. 1')));
  perform ref_rule_proposal_save(pa, 'LEGAL_VAR', 'SET', snmg, null, '{"value":26500}', 'SNMG test lot 4', 'LF 2026 art. 1',
                                 date '2026-01-01', date '2031-01-01', false);
  if (select count(*) from ref_rule_citations where proposal_id = pa) <> 1 then bad := bad || 'null_citations_not_kept '; end if;
  perform ref_rule_proposal_save(pa, 'LEGAL_VAR', 'SET', snmg, null, '{"value":26500}', 'SNMG test lot 4', 'LF 2026 art. 1',
                                 date '2026-01-01', date '2031-01-01', false,
                                 jsonb_build_array(pg_temp.cite(doc2, 'art. 2'), pg_temp.cite(doc2, 'art. 3')));
  if (select count(*) from ref_rule_citations where proposal_id = pa) <> 2
     or exists (select 1 from ref_rule_citations where proposal_id = pa and article = 'art. 1') then
    bad := bad || 'citations_not_replaced ';
  end if;
  perform pg_temp.as_user(rh);
  m := '-'; begin insert into ref_rule_citations (proposal_id, document_id, article, page, excerpt) values (pa, doc2, 'art. 9', 1, 'Insertion directe de test.'); exception when others then m := sqlerrm; end;
  if m not like '%se modifient avec la proposition%' then bad := bad || 'direct_citation_insert '; end if;

  perform ref_rule_proposal_submit(pa);
  perform set_config('ref.rule_review', 'on', true);
  m := '-'; begin delete from ref_rule_citations where proposal_id = pa; exception when others then m := sqlerrm; end;
  if m not like '%figés%' then bad := bad || 'submitted_citation_deleted '; end if;
  m := '-'; begin update ref_rule_citations set article = 'art. 4' where proposal_id = pa; exception when others then m := sqlerrm; end;
  if m not like '%non modifiable%' then bad := bad || 'citation_updated '; end if;
  perform pg_temp.as_user(rh);
  if jsonb_array_length(ref_rule_citation_warnings(pa)) <> 0 then bad := bad || 'unexpected_warning '; end if;
  res := (select x from jsonb_array_elements(ref_rule_proposals_overview(false)) x where x->>'id' = pa::text);
  if jsonb_array_length(res->'citations') <> 2 or res->'citations'->0->>'document_id' <> doc2::text
     or (res->'citations'->0->>'version_no')::int <> 2 then
    bad := bad || 'overview_citations ';
  end if;

  -- Coverage warnings (never blocking): requested month and text date outside the cited documents' period
  perform pg_temp.as_user(fin);
  pb := ref_rule_proposal_save(null, 'CNAS_RATES', 'SET', std, null, '{"employee_pct":9,"employer_pct":25,"fos_pct":0.5}',
                               'CNAS test lot 4', 'LF 2020 art. 7', date '2030-12-15', date '2031-01-01', true,
                               jsonb_build_array(pg_temp.cite(doc3, 'art. 7')));
  res := ref_rule_citation_warnings(pb);
  if (select status from ref_rule_proposals where id = pb) <> 'SUBMITTED'
     or not exists (select 1 from jsonb_array_elements_text(res) w where w like 'Le mois demandé (01/2031)%')
     or not exists (select 1 from jsonb_array_elements_text(res) w where w like 'La date d''effet du texte (15/12/2030)%') then
    bad := bad || 'coverage_warning ';
  end if;

  -- Approval: refused once every cited document is withdrawn; allowed with a live document
  perform pg_temp.as_user(boss);
  perform ref_legal_doc_withdraw(doc3, 'Texte retiré pour le test');
  if not exists (select 1 from jsonb_array_elements_text(ref_rule_citation_warnings(pb)) w where w like '%retirés du registre%') then
    bad := bad || 'all_withdrawn_warning ';
  end if;
  m := '-'; begin perform ref_rule_proposal_approve(pb, null); exception when others then m := sqlerrm; end;
  if m not like '%Tous les documents cités ont été retirés%' then bad := bad || 'approved_with_withdrawn_docs '; end if;

  res := ref_rule_proposal_approve(pa, 'Conforme au texte cité');
  if (res->>'ok')::boolean is not true or res->>'decision_id' is null then bad := bad || 'approval_with_citation '; end if;
  res := ref_rule_application_context(pa, date '2031-01-01', null);
  if jsonb_array_length(res->'citations') <> 2 or jsonb_typeof(res->'citation_warnings') <> 'array' then
    bad := bad || 'd2_context_citations ';
  end if;

  -- A later correction of the cited document is shown, the citation itself is unchanged
  perform pg_temp.as_user(rh);
  doc5 := ref_legal_doc_correct(doc2, pg_temp.meta('LF 2026 v3', date '2026-01-01', null), 'Intitulé officiel complet');
  if not exists (select 1 from jsonb_array_elements_text(ref_rule_citation_warnings(pa)) w where w like '%(v2) a été corrigée depuis (v3%')
     or exists (select 1 from ref_rule_citations where proposal_id = pa and document_id <> doc2) then
    bad := bad || 'superseded_citation_warning ';
  end if;

  -- VERIFY proposals cite documents too, without date coverage
  perform pg_temp.as_user(rh);
  select x.id into pc from ref_global_var_versions x join ref_global_vars v on v.id = x.var_id
   where v.key = 'HEURES_MENSUELLES' and x.effective_to is null order by x.effective_from desc limit 1;
  if pc is not null and not exists (select 1 from ref_rule_proposals where target_id = pc and action = 'VERIFY'
                                      and status in ('DRAFT', 'SUBMITTED', 'APPROVED')) then
    m := '-'; begin perform ref_rule_proposal_save(null, 'LEGAL_VAR', 'VERIFY', pc, null, '{}', 'Vérif lot 4', 'Code du travail', null, null, true); exception when others then m := sqlerrm; end;
    if m not like '%Justificatif requis%' then bad := bad || 'verify_without_citation '; end if;
    pd := ref_rule_proposal_save(null, 'LEGAL_VAR', 'VERIFY', pc, null, '{}', 'Vérif lot 4', 'Code du travail', null, null, true,
                                 jsonb_build_array(pg_temp.cite(doc5, 'art. 10')));
    if (select status from ref_rule_proposals where id = pd) <> 'SUBMITTED' or jsonb_array_length(ref_rule_citation_warnings(pd)) <> 0 then
      bad := bad || 'verify_with_citation ';
    end if;
  end if;

  -- Register listing by year of application, with versions, names and citing proposals
  res := ref_legal_documents_list(2031);
  if not exists (select 1 from jsonb_array_elements(res) x where x->>'id' = doc5::text and x->>'entry_path' = 'AI_ALLOWED'
                   and x->>'created_by' = 'RH Lot2')
     or not exists (select 1 from jsonb_array_elements(res) x where x->>'id' = doc1::text and x->>'status' = 'SUPERSEDED')
     or not exists (select 1 from jsonb_array_elements(res) x where x->>'id' = doc2::text and jsonb_array_length(x->'citations') = 2)
     or exists (select 1 from jsonb_array_elements(res) x where x->>'id' = doc3::text) then
    bad := bad || 'list_by_year ';
  end if;
  if not exists (select 1 from jsonb_array_elements(ref_legal_documents_list(null)) x where x->>'id' = doc3::text
                   and x->>'entry_path' = 'MANUAL' and x->>'status' = 'WITHDRAWN') then
    bad := bad || 'list_all ';
  end if;
  perform pg_temp.as_user(gen_random_uuid());
  m := '-'; begin perform ref_legal_documents_list(null); exception when others then m := sqlerrm; end;
  if m not like '%non autorisée%' then bad := bad || 'list_without_right '; end if;

  if bad <> '' then raise exception 'RESULT: FAIL %', bad; end if;
  raise exception 'RESULT: PASS lot 4 (register import/correct/withdraw, immutable file, rights, citations required at submit and approval, frozen after submit, coverage and validity warnings, listing, D2 context)';
end $$;
