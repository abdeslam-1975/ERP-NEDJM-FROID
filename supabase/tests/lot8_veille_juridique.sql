-- Lot 8 — legal watch: allowed domains, watched pages, checks (manual / scheduled), detected texts. Every change is
-- rolled back by the final raise. Needs one SUPER_ADMIN and one ADMIN_RH user. No network access: the test records the
-- results the server would send after reading the pages.
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', coalesce(p::text, ''), true),
         set_config('request.jwt.claim.role', 'authenticated', true),
         set_config('ref.watch', '', true),
         set_config('ref.rule_review', '', true),
         set_config('ref.rule_apply', '', true);
$$;

-- The scheduler: service role key, no user.
create or replace function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"service_role"}', true),
         set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', 'service_role', true),
         set_config('ref.watch', '', true);
$$;

create or replace function pg_temp.upload(p_folder uuid) returns text language plpgsql as $$
declare
  v_path text := p_folder::text || '/' || gen_random_uuid()::text || '.pdf';
begin
  insert into storage.objects (bucket_id, name, metadata) values ('legal-documents', v_path, jsonb_build_object('size', 1000));
  return v_path;
end;
$$;

do $$
declare
  boss uuid; rh uuid;
  src_jo uuid; src_cnas uuid; dom_cnas uuid; kw uuid;
  run1 uuid; run2 uuid; run3 uuid; stale uuid;
  it_base uuid; it_snmg uuid; it_other uuid; it_cnas uuid; doc uuid;
  n_props bigint; n_vers bigint; n_notif bigint;
  folder uuid := gen_random_uuid();
  res jsonb; m text;
  h1 text := repeat('a', 64); h2 text := repeat('b', 64);
  bad text := '';
begin
  select usr.user_id into boss from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'SUPER_ADMIN' limit 1;
  select usr.user_id into rh from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'ADMIN_RH' and usr.site_id is null limit 1;
  if boss is null or rh is null then
    raise exception 'RESULT: SKIP (users SUPER_ADMIN / ADMIN_RH missing)';
  end if;
  select count(*) into n_props from ref_rule_proposals;
  select count(*) into n_vers from ref_global_var_versions;

  -- Exposure, grants, rights matrix, seed
  if has_function_privilege('authenticated', 'public.ref_watch_guard()', 'execute')
     or has_function_privilege('authenticated', 'public.ref_watch_actor()', 'execute')
     or has_function_privilege('authenticated', 'public.ref_watch_require(text)', 'execute')
     or has_function_privilege('authenticated', 'public.ref_watch_source_due(public.ref_watch_sources)', 'execute') then
    bad := bad || 'internal_function_exposed ';
  end if;
  if not has_function_privilege('authenticated', 'public.ref_watch_source_save(uuid,text,text,text,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.ref_watch_item_import(uuid,text,text,text,bigint,text,jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.ref_watch_run_start(text)', 'execute')
     or not has_function_privilege('service_role', 'public.ref_watch_record_check(uuid,uuid,text,integer,text,text,jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.ref_watch_run_finish(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.ref_watch_run_start(text)', 'execute')
     or has_function_privilege('anon', 'public.ref_watch_record_check(uuid,uuid,text,integer,text,text,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.ref_watch_source_save(uuid,text,text,text,boolean)', 'execute')
     or has_function_privilege('anon', 'public.ref_watch_item_import(uuid,text,text,text,bigint,text,jsonb)', 'execute') then
    bad := bad || 'rpc_grants ';
  end if;
  if has_table_privilege('authenticated', 'public.ref_watch_sources', 'insert')
     or has_table_privilege('authenticated', 'public.ref_watch_items', 'update')
     or has_table_privilege('authenticated', 'public.ref_watch_runs', 'insert')
     or has_table_privilege('authenticated', 'public.ref_watch_domains', 'delete')
     or has_table_privilege('anon', 'public.ref_watch_items', 'select')
     or not has_table_privilege('authenticated', 'public.ref_watch_items', 'select') then
    bad := bad || 'table_privileges ';
  end if;
  if not exists (select 1 from sys_screens where code = 'legal_watch' and path = '/rh/legal/veille')
     or exists (select 1 from sys_permissions pm join sys_roles r on r.id = pm.role_id join sys_screens s on s.id = pm.screen_id
                where s.code = 'legal_watch' and r.code <> 'SUPER_ADMIN') then
    bad := bad || 'rights_not_super_admin_only ';
  end if;
  if (select count(*) from ref_watch_domains where is_active
        and domain in ('joradp.dz', 'mfdgi.gov.dz', 'cnas.dz', 'cacobatph.dz', 'mtess.gov.dz')) <> 5
     or (select count(*) from ref_watch_keywords where is_active) < 20 then
    bad := bad || 'seed ';
  end if;

  -- Address checks (SSRF): https, domain name only, allowed domain or subdomain
  if ref_watch_host('https://WWW.Joradp.dz/HFR/Index.htm') <> 'www.joradp.dz'
     or ref_watch_host('https://joradp.dz:443/') <> 'joradp.dz'
     or ref_watch_host('http://joradp.dz/') is not null
     or ref_watch_host('https://127.0.0.1/') is not null
     or ref_watch_host('https://joradp.dz:8443/') is not null
     or ref_watch_host('https://user@joradp.dz/') is not null
     or ref_watch_host('https://[::1]/') is not null
     or ref_watch_host('https://localhost/') is not null
     or not ref_watch_url_allowed('https://www.joradp.dz/FTP/a.pdf')
     or ref_watch_url_allowed('https://evil-joradp.dz/a.pdf')
     or ref_watch_url_allowed('https://joradp.dz.evil.com/a.pdf')
     or ref_watch_url_allowed('https://169.254.169.254/latest') then
    bad := bad || 'address_checks ';
  end if;
  if not (ref_watch_keywords_match('Décret fixant le SALAIRE national minimum garanti') @> array['salaire', 'salaire national minimum'])
     or not ('قانون المالية' = any (ref_watch_keywords_match('قانون المالية لسنة 2026')))
     or cardinality(ref_watch_keywords_match('Avis de concours de recrutement')) <> 0 then
    bad := bad || 'keywords_match ';
  end if;

  -- Rights: only legal_watch holders manage and run
  perform pg_temp.as_user(rh);
  m := '-'; begin perform ref_watch_domain_save(null, 'exemple.dz', 'Exemple', true); exception when others then m := sqlerrm; end;
  if m not like '%Gestion des sources de veille non autorisée%' then bad := bad || 'manage_without_right '; end if;
  m := '-'; begin perform ref_watch_run_start('MANUAL'); exception when others then m := sqlerrm; end;
  if m not like '%Vérification de la veille juridique non autorisée%' then bad := bad || 'run_without_right '; end if;
  perform pg_temp.as_user(null);
  m := '-'; begin perform ref_watch_run_start('CRON'); exception when others then m := sqlerrm; end;
  if m not like '%Session requise%' then bad := bad || 'run_without_session '; end if;

  -- Configuration by the SUPER_ADMIN
  perform pg_temp.as_user(boss);
  m := '-'; begin perform ref_watch_domain_save(null, 'https://exemple.dz', 'Exemple', true); exception when others then m := sqlerrm; end;
  if m not like '%Domaine invalide%' then bad := bad || 'domain_format '; end if;
  m := '-'; begin perform ref_watch_domain_save(null, 'JORADP.dz', 'Doublon', true); exception when others then m := sqlerrm; end;
  if m not like '%déjà dans la liste%' then bad := bad || 'domain_duplicate '; end if;
  select id into dom_cnas from ref_watch_domains where domain = 'cnas.dz';
  m := '-'; begin perform ref_watch_domain_save(dom_cnas, 'cnas-dz.com', 'CNAS', true); exception when others then m := sqlerrm; end;
  if m not like '%ne se renomme pas%' then bad := bad || 'domain_renamed '; end if;
  kw := ref_watch_keyword_save(null, '  allocation   familiale ', true);
  m := '-'; begin perform ref_watch_keyword_save(null, 'Allocation Familiale', true); exception when others then m := sqlerrm; end;
  if m not like '%déjà dans la liste%' or (select keyword from ref_watch_keywords where id = kw) <> 'allocation familiale' then
    bad := bad || 'keyword_duplicate ';
  end if;
  m := '-'; begin perform ref_watch_source_save(null, 'Page externe', 'https://example.com/news', 'DAILY', true); exception when others then m := sqlerrm; end;
  if m not like '%Domaine non autorisé%' then bad := bad || 'source_outside_list '; end if;
  m := '-'; begin perform ref_watch_source_save(null, 'Page interne', 'https://10.0.0.1/admin', 'DAILY', true); exception when others then m := sqlerrm; end;
  if m not like '%Adresse invalide%' then bad := bad || 'source_ip '; end if;
  m := '-'; begin perform ref_watch_source_save(null, 'Page http', 'http://www.joradp.dz/', 'DAILY', true); exception when others then m := sqlerrm; end;
  if m not like '%Adresse invalide%' then bad := bad || 'source_http '; end if;
  src_jo := ref_watch_source_save(null, 'Journal officiel (test)', 'https://www.joradp.dz/HFR/Index.htm', 'daily', true);
  src_cnas := ref_watch_source_save(null, 'CNAS actualités (test)', 'https://www.cnas.dz/actualites', 'WEEKLY', true);
  m := '-'; begin perform ref_watch_source_save(null, 'Doublon', 'https://www.joradp.dz/HFR/Index.htm', 'DAILY', true); exception when others then m := sqlerrm; end;
  if m not like '%déjà surveillée%' or (select frequency from ref_watch_sources where id = src_jo) <> 'DAILY' then
    bad := bad || 'source_save ';
  end if;

  -- Written only by the functions, never deleted
  m := '-'; begin insert into ref_watch_sources (label, url) values ('Direct', 'https://www.joradp.dz/x'); exception when others then m := sqlerrm; end;
  if m not like '%écrit uniquement%' then bad := bad || 'direct_insert '; end if;
  m := '-'; begin delete from ref_watch_domains where id = dom_cnas; exception when others then m := sqlerrm; end;
  if m not like '%suppression interdite%' then bad := bad || 'direct_delete '; end if;

  -- Manual check: first reading of a page is the baseline (kept, not notified)
  select count(*) into n_notif from sys_notifications where kind = 'LEGAL_WATCH';
  res := ref_watch_run_start('MANUAL');
  run1 := (res->>'run_id')::uuid;
  if jsonb_array_length(res->'sources') < 2
     or not (res->'domains') @> '["joradp.dz", "cnas.dz"]'::jsonb
     or not exists (select 1 from ref_watch_runs where id = run1 and trigger = 'MANUAL' and started_by = boss and status = 'RUNNING') then
    bad := bad || 'manual_start ';
  end if;
  m := '-'; begin perform ref_watch_run_start('MANUAL'); exception when others then m := sqlerrm; end;
  if m not like '%déjà en cours%' then bad := bad || 'concurrent_runs '; end if;
  res := ref_watch_record_check(run1, src_jo, 'OK', 200, null, h1, jsonb_build_array(
    jsonb_build_object('url', 'https://www.joradp.dz/FTP/jo-francais/2026/F2026001.pdf', 'title', 'JO n° 1 — Loi de finances pour 2026'),
    jsonb_build_object('url', 'https://example.com/copie.pdf', 'title', 'Copie externe'),
    jsonb_build_object('url', 'http://www.joradp.dz/FTP/y.pdf', 'title', 'Non sécurisé')
  ));
  select id into it_base from ref_watch_items where url = 'https://www.joradp.dz/FTP/jo-francais/2026/F2026001.pdf';
  if (res->>'links')::integer <> 1 or (res->>'new')::integer <> 1 or (res->>'relevant')::integer <> 0 or not (res->>'baseline')::boolean
     or not exists (select 1 from ref_watch_items where id = it_base and baseline and relevant and status = 'NEW'
                      and keywords @> array['loi de finances'] and source_id = src_jo and run_id = run1)
     or exists (select 1 from ref_watch_items where url like '%example.com%' or url like 'http:%')
     or not exists (select 1 from ref_watch_sources where id = src_jo and baseline_done and last_status = 'OK' and last_content_hash = h1) then
    bad := bad || 'baseline_check ';
  end if;
  m := '-'; begin perform ref_watch_record_check(run1, src_jo, 'OK', 200, null, h1, '[]'); exception when others then m := sqlerrm; end;
  if m not like '%déjà vérifiée%' then bad := bad || 'source_checked_twice '; end if;
  perform ref_watch_record_check(run1, src_cnas, 'ERROR', 503, 'Réponse du site : HTTP 503.', null, null);
  perform pg_temp.as_service();
  m := '-'; begin perform ref_watch_record_check(run1, src_cnas, 'OK', 200, null, h1, '[]'); exception when others then m := sqlerrm; end;
  if m not like '%autre personne%' then bad := bad || 'service_writes_manual_run '; end if;
  m := '-'; begin perform ref_watch_run_start('MANUAL'); exception when others then m := sqlerrm; end;
  if m not like '%Déclenchement de la vérification invalide%' then bad := bad || 'service_manual_trigger '; end if;
  perform pg_temp.as_user(boss);
  m := '-'; begin perform ref_watch_run_start('CRON'); exception when others then m := sqlerrm; end;
  if m not like '%Déclenchement de la vérification invalide%' then bad := bad || 'user_cron_trigger '; end if;
  res := ref_watch_run_finish(run1, null);
  if res->>'status' <> 'DONE' or (res->>'checked')::integer <> 2 or (res->>'failed')::integer <> 1 or (res->>'new')::integer <> 1
     or (res->>'relevant')::integer <> 0
     or (select consecutive_failures from ref_watch_sources where id = src_cnas) <> 1
     or (select count(*) from sys_notifications where kind = 'LEGAL_WATCH') <> n_notif then
    bad := bad || 'manual_finish ';
  end if;
  perform set_config('ref.watch', 'on', true);
  m := '-'; begin update ref_watch_checks set error = 'x' where run_id = run1; exception when others then m := sqlerrm; end;
  if m not like '%ne se modifie pas%' then bad := bad || 'check_modified '; end if;
  m := '-'; begin update ref_watch_runs set items_new = 99 where id = run1; exception when others then m := sqlerrm; end;
  if m not like '%enregistrement définitif%' then bad := bad || 'closed_run_modified '; end if;
  perform set_config('ref.watch', '', true);

  -- Scheduled check: only due sources; new relevant links are notified
  perform pg_temp.as_service();
  res := ref_watch_run_start('CRON');
  if jsonb_array_length(res->'sources') <> 0 then bad := bad || 'not_due_planned '; end if;
  perform ref_watch_run_finish((res->>'run_id')::uuid, null);
  perform set_config('ref.watch', 'on', true);
  update ref_watch_sources set last_checked_at = now() - interval '2 days' where id = src_jo;
  perform set_config('ref.watch', '', true);
  res := ref_watch_run_start('CRON');
  run2 := (res->>'run_id')::uuid;
  if jsonb_array_length(res->'sources') <> 1 or res->'sources'->0->>'id' <> src_jo::text
     or res->'sources'->0->>'last_content_hash' <> h1
     or not exists (select 1 from ref_watch_runs where id = run2 and trigger = 'CRON' and started_by is null) then
    bad := bad || 'cron_due ';
  end if;
  res := ref_watch_record_check(run2, src_jo, 'OK', 200, null, h2, jsonb_build_array(
    jsonb_build_object('url', 'https://www.joradp.dz/FTP/jo-francais/2026/F2026001.pdf', 'title', 'JO n° 1'),
    jsonb_build_object('url', 'https://www.joradp.dz/FTP/jo-francais/2026/F2026060.pdf', 'title', 'Décret exécutif fixant le SNMG'),
    jsonb_build_object('url', 'https://www.joradp.dz/FTP/jo-francais/2026/F2026061.pdf', 'title', 'Avis de concours de recrutement des agents'),
    jsonb_build_object('url', 'https://www.cnas.dz/actualites/taux-2026', 'title', 'Nouveaux taux de cotisation 2026')
  ));
  select id into it_snmg from ref_watch_items where url like '%F2026060.pdf';
  select id into it_other from ref_watch_items where url like '%F2026061.pdf';
  select id into it_cnas from ref_watch_items where url = 'https://www.cnas.dz/actualites/taux-2026';
  if (res->>'new')::integer <> 3 or (res->>'relevant')::integer <> 2 or (res->>'baseline')::boolean
     or not exists (select 1 from ref_watch_items where id = it_snmg and relevant and not baseline and keywords @> array['SNMG'])
     or not exists (select 1 from ref_watch_items where id = it_other and not relevant and keywords = '{}')
     or (select title from ref_watch_items where id = it_base) <> 'JO n° 1 — Loi de finances pour 2026' then
    bad := bad || 'cron_items ';
  end if;
  res := ref_watch_run_finish(run2, null);
  if (res->>'relevant')::integer <> 2
     or not exists (select 1 from sys_notifications where kind = 'LEGAL_WATCH' and recipient_screen = 'legal_watch'
                      and created_by is null and decision_id is null and title like '%2 nouveau(x) texte(s)%') then
    bad := bad || 'relevant_not_notified ';
  end if;

  -- Three failures in a row: one notification; a stale run is closed as interrupted
  perform pg_temp.as_user(boss);
  for i in 1..2 loop
    run3 := (ref_watch_run_start('MANUAL')->>'run_id')::uuid;
    perform ref_watch_record_check(run3, src_cnas, 'ERROR', null, 'Site injoignable : ETIMEDOUT', null, null);
    perform ref_watch_run_finish(run3, null);
  end loop;
  if (select consecutive_failures from ref_watch_sources where id = src_cnas) <> 3
     or (select count(*) from sys_notifications where kind = 'LEGAL_WATCH' and title like 'Source de veille en erreur : CNAS%') <> 1 then
    bad := bad || 'failure_notification ';
  end if;
  perform set_config('ref.watch', 'on', true);
  insert into ref_watch_runs (trigger, started_by, started_at) values ('MANUAL', boss, now() - interval '20 minutes') returning id into stale;
  perform set_config('ref.watch', '', true);
  run3 := (ref_watch_run_start('MANUAL')->>'run_id')::uuid;
  if (select status from ref_watch_runs where id = stale) <> 'FAILED' then bad := bad || 'stale_run '; end if;

  -- A domain removed from the list: its sources fail, its links cannot be imported
  perform ref_watch_domain_save(dom_cnas, 'cnas.dz', 'CNAS', false);
  res := ref_watch_record_check(run3, src_cnas, 'OK', 200, null, h1, '[]');
  if res->>'status' <> 'ERROR' or (select last_error from ref_watch_sources where id = src_cnas) not like '%retiré de la liste%' then
    bad := bad || 'disabled_domain_read ';
  end if;
  perform ref_watch_run_finish(run3, null);
  m := '-'; begin perform ref_watch_item_prepare_import(it_cnas); exception when others then m := sqlerrm; end;
  if m not like '%import impossible%' then bad := bad || 'disabled_domain_import '; end if;

  -- Detected texts: ignore with a reason, or import into the register
  m := '-'; begin perform ref_watch_item_ignore(it_other, 'non'); exception when others then m := sqlerrm; end;
  if m not like '%Motif requis%' then bad := bad || 'ignore_reason '; end if;
  perform ref_watch_item_ignore(it_other, 'Sans rapport avec la paie');
  m := '-'; begin perform ref_watch_item_ignore(it_other, 'Encore une fois'); exception when others then m := sqlerrm; end;
  if m not like '%déjà traité%'
     or not exists (select 1 from ref_watch_items where id = it_other and status = 'IGNORED' and decided_by = boss) then
    bad := bad || 'ignore ';
  end if;
  perform set_config('ref.watch', 'on', true);
  m := '-'; begin update ref_watch_items set title = 'Modifié' where id = it_snmg; exception when others then m := sqlerrm; end;
  if m not like '%seul un texte nouveau%' then bad := bad || 'item_content_modified '; end if;
  perform set_config('ref.watch', '', true);

  perform pg_temp.as_user(rh);
  m := '-'; begin perform ref_watch_item_prepare_import(it_snmg); exception when others then m := sqlerrm; end;
  if m not like '%non autorisé%' then bad := bad || 'import_without_right '; end if;
  perform pg_temp.as_user(boss);
  res := ref_watch_item_prepare_import(it_snmg);
  if res->>'url' <> 'https://www.joradp.dz/FTP/jo-francais/2026/F2026060.pdf' or res->>'source_label' <> 'Journal officiel (test)'
     or (res->'domains') @> '["cnas.dz"]'::jsonb then
    bad := bad || 'prepare_import ';
  end if;
  doc := ref_watch_item_import(it_snmg, pg_temp.upload(folder), 'F2026060.pdf', 'application/pdf', 1000,
    encode(sha256(convert_to(folder::text, 'UTF8')), 'hex'),
    jsonb_build_object('doc_type', 'DECRET_EXECUTIF', 'title', 'Décret exécutif fixant le SNMG (test)',
                       'reference', 'Décret exécutif n° 26-60 (test)', 'applies_from', date '2026-01-01',
                       'language', 'FR', 'origin', 'Journal officiel (veille)'));
  if not exists (select 1 from ref_watch_items where id = it_snmg and status = 'IMPORTED' and document_id = doc and decided_by = boss)
     or not exists (select 1 from ref_legal_documents where id = doc and status = 'ACTIVE' and created_by = boss
                      and source_url = 'https://www.joradp.dz/FTP/jo-francais/2026/F2026060.pdf') then
    bad := bad || 'import ';
  end if;
  m := '-'; begin perform ref_watch_item_import(it_snmg, pg_temp.upload(gen_random_uuid()), 'x.pdf', 'application/pdf', 1000, repeat('c', 64), '{}'); exception when others then m := sqlerrm; end;
  if m not like '%déjà traité%' then bad := bad || 'imported_twice '; end if;

  -- Changing the address of a page makes a new baseline
  perform ref_watch_source_save(src_jo, 'Journal officiel (test)', 'https://www.joradp.dz/HAR/Index.htm', 'DAILY', true);
  if exists (select 1 from ref_watch_sources where id = src_jo and (baseline_done or last_content_hash is not null)) then
    bad := bad || 'new_address_baseline ';
  end if;

  -- The watch never touches rules nor payroll
  if (select count(*) from ref_rule_proposals) <> n_props or (select count(*) from ref_global_var_versions) <> n_vers then
    bad := bad || 'watch_had_effect ';
  end if;

  if bad <> '' then raise exception 'RESULT: FAIL %', bad; end if;
  raise exception 'RESULT: PASS lot 8 (grants, rights SA-only, SSRF address checks, keywords, config guards, manual/scheduled runs, baseline, due sources, notifications, stale run, disabled domain, ignore, import into the register, no effect on rules)';
end $$;
