-- Lot 5 — attendance archive import. Every change is rolled back by the final raise.
-- Needs one SUPER_ADMIN, one ADMIN_RH and one ADMIN_FINANCE user (global roles). Files are simulated by storage.objects rows.
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', p::text, true),
         set_config('hr.attendance_import', '', true);
$$;

create or replace function pg_temp.upload(p_folder uuid, p_ext text, p_size bigint, p_owner uuid) returns text language plpgsql as $$
declare
  v_path text := p_folder::text || '/source.' || p_ext;
begin
  insert into storage.objects (bucket_id, name, metadata, owner_id)
  values ('attendance-imports', v_path, jsonb_build_object('size', p_size), p_owner::text);
  return v_path;
end;
$$;

create or replace function pg_temp.line(p_no int, p_mat text, p_date date, p_code text, p_site text,
                                        p_last text default null, p_hours jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('line_no', p_no, 'source_ref', 'L' || p_no, 'kind', 'DAY', 'matricule', p_mat,
                            'last_name', p_last, 'raw_date', to_char(p_date, 'DD/MM/YYYY'), 'work_date', p_date,
                            'site_code', p_site, 'source_code', p_code, 'hours', p_hours, 'parse_errors', '[]'::jsonb);
$$;

create or replace function pg_temp.grant_perm(p_role text, p_screen text, p_read boolean, p_create boolean, p_update boolean)
returns void language sql as $$
  insert into sys_permissions (role_id, screen_id, can_read, can_create, can_update, can_delete, can_print, can_export)
  select r.id, s.id, p_read, p_create, p_update, false, false, false
  from sys_roles r, sys_screens s where r.code = p_role and s.code = p_screen
  on conflict (role_id, screen_id) do update set
    can_read = excluded.can_read, can_create = excluded.can_create, can_update = excluded.can_update;
$$;

do $$
declare
  boss uuid; rh uuid; fin uuid; act uuid;
  site_a uuid; site_b uuid; emp1 uuid; emp2 uuid; emp3 uuid;
  f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid(); f3 uuid := gen_random_uuid();
  path1 text; path2 text;
  sha text := repeat('5a', 32);
  b1 uuid; b2 uuid; d5 uuid; d11 uuid; d12 uuid; map_id uuid; l4 uuid; l5 uuid; l15 uuid;
  meta jsonb; res jsonb; fp text; m text;
  n_runs bigint; v_leave boolean := true; v_expected int;
  bad text := '';
begin
  select usr.user_id into boss from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'SUPER_ADMIN' limit 1;
  select usr.user_id into rh from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'ADMIN_RH' and usr.site_id is null limit 1;
  select usr.user_id into fin from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'ADMIN_FINANCE' and usr.site_id is null limit 1;
  select id into act from ref_activity_codes limit 1;
  if boss is null or rh is null or fin is null or act is null
     or not exists (select 1 from ref_legendes where code = 'P' and is_active)
     or not exists (select 1 from ref_legendes where code = 'AJ' and is_active) then
    raise exception 'RESULT: SKIP (users SUPER_ADMIN / ADMIN_RH / ADMIN_FINANCE, activity code or legends P / AJ missing)';
  end if;
  if exists (select 1 from hr_payroll_runs where period_year = 2026 and period_month = 3 and site_id is null) then
    raise exception 'RESULT: SKIP (a global payroll exists for 03/2026)';
  end if;

  -- Exposure, grants, defaults
  if has_function_privilege('authenticated', 'public.hr_attendance_import_analyze_internal(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_attendance_import_apply_d5(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_attendance_import_apply_d11(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_attendance_import_apply_d12(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_attendance_import_signal(jsonb,text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_attendance_import_request_d5(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_attendance_import_flag()', 'execute') then
    bad := bad || 'internal_function_exposed ';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_attendance_import_create(text,text,text,bigint,text,jsonb,jsonb,integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_attendance_import_validate(uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_attendance_import_create(text,text,text,bigint,text,jsonb,jsonb,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_attendance_import_commit(uuid,boolean)', 'execute')
     or has_function_privilege('anon', 'public.hr_att_import_object_readable(text,text)', 'execute') then
    bad := bad || 'rpc_grants ';
  end if;
  if has_table_privilege('anon', 'public.hr_attendance_import_batches', 'select')
     or has_table_privilege('anon', 'public.hr_attendance_import_lines', 'select') then
    bad := bad || 'anon_table_access ';
  end if;
  if not exists (select 1 from storage.buckets where id = 'attendance-imports' and not public and file_size_limit = 20971520) then
    bad := bad || 'bucket_not_private ';
  end if;
  if exists (select 1 from sys_permissions pm join sys_roles r on r.id = pm.role_id join sys_screens s on s.id = pm.screen_id
             where s.code in ('hr_attendance_import', 'hr_attendance_import_validate') and r.code is distinct from 'SUPER_ADMIN'
               and (pm.can_create or pm.can_update)) then
    bad := bad || 'rights_not_super_admin_only ';
  end if;

  -- Fixture: two sites, three employees with contracts from 01/2026, existing attendance and a leave
  perform pg_temp.as_user(boss);
  insert into ref_sites (code, name_fr, wilaya_code) values ('ZZ-L5A', 'Chantier lot 5 A', '31') returning id into site_a;
  insert into ref_sites (code, name_fr, wilaya_code) values ('ZZ-L5B', 'Chantier lot 5 B', '31') returning id into site_b;
  insert into hr_employees (matricule, last_name, first_name) values ('L5-001', 'Benali', 'Karim') returning id into emp1;
  insert into hr_employees (matricule, last_name, first_name) values ('L5-002', 'Saidi', 'Nora') returning id into emp2;
  insert into hr_employees (matricule, last_name, first_name) values ('L5-003', 'Amrani', 'Ali') returning id into emp3;
  insert into hr_employees (matricule, last_name, first_name) values ('0880551', 'Double', 'Un'), ('880551', 'Double', 'Deux');
  alter table hr_contracts disable trigger trg_hr_contract_dates_guard;
  insert into hr_contracts (employee_id, site_id, activity_code_id, salaire_base_monthly, salaire_net_ref_monthly, start_date, status)
  values (emp1, site_a, act, 50000, 40000, date '2026-01-01', 'ACTIVE'),
         (emp2, site_a, act, 50000, 40000, date '2026-01-01', 'ACTIVE'),
         (emp3, site_b, act, 50000, 40000, date '2026-01-01', 'ACTIVE');
  alter table hr_contracts enable trigger trg_hr_contract_dates_guard;
  insert into hr_attendance (employee_id, site_id, work_date, legend_code, source_code, status_code, validated_at, validated_by) values
    (emp1, site_a, date '2026-03-04', 'P', 'MANUAL', 'VALIDATED', now(), boss),
    (emp2, site_a, date '2026-03-03', 'AJ', 'MANUAL', 'VALIDATED', now(), boss),
    (emp2, site_b, date '2026-03-06', 'P', 'MANUAL', 'PROPOSED', null, null);
  begin
    insert into hr_leave_requests (employee_id, kind, start_date, end_date, days, status)
    values (emp1, 'ANNUAL', date '2026-03-16', date '2026-03-16', 1, 'APPROVED');
  exception when others then v_leave := false;
  end;
  select count(*) into n_runs from hr_payroll_runs;

  -- Rights: nobody but the SUPER_ADMIN can import until rights are given; D5 / D12 cannot be delegated
  meta := jsonb_build_object('format', 'ROWS', 'period_from', '2026-03-01', 'period_to', '2026-03-01', 'reference_year', 2026,
                             'site_ids', jsonb_build_array(site_a), 'provenance_kind', 'PAPER_REGISTER',
                             'provenance_detail', 'Registre papier du chantier A (test)', 'control_lines', 99);
  path1 := pg_temp.upload(f1, 'csv', 1200, rh);
  perform pg_temp.as_user(rh);
  if hr_att_import_upload_allowed(f1::text) then bad := bad || 'upload_without_right '; end if;
  m := '-'; begin perform hr_attendance_import_create(path1, 'mars.csv', 'text/csv', 1200, sha, meta, '{}', 15); exception when others then m := sqlerrm; end;
  if m not like '%Import des archives de présence non autorisé%' then bad := bad || 'create_without_right '; end if;

  perform pg_temp.as_user(boss);
  m := '-'; begin perform pg_temp.grant_perm('ADMIN_RH', 'decision_attendance_import_conflict', true, false, true); exception when others then m := sqlerrm; end;
  if m not like '%(D5)%ne se délèguent pas%' then bad := bad || 'd5_delegated '; end if;
  m := '-'; begin perform pg_temp.grant_perm('ADMIN_RH', 'decision_attendance_import_policy', true, false, true); exception when others then m := sqlerrm; end;
  if m not like '%(D12)%ne se délègue pas%' then bad := bad || 'd12_delegated '; end if;
  perform pg_temp.grant_perm('ADMIN_RH', 'hr_attendance_import', true, true, true);
  perform pg_temp.grant_perm('ADMIN_FINANCE', 'hr_attendance_import_validate', true, false, true);
  perform pg_temp.grant_perm('ADMIN_FINANCE', 'decision_attendance_code_mapping', true, false, true);
  if sys_decision_can_decide('D5', fin) or sys_decision_can_decide('D12', fin) or not sys_decision_can_decide('D11', fin)
     or not sys_decision_can_decide('D5', boss) then
    bad := bad || 'can_decide ';
  end if;

  -- Storage visibility: unregistered file for its uploader only
  perform pg_temp.as_user(rh);
  if not hr_att_import_upload_allowed(f1::text) or hr_att_import_upload_allowed('pas-un-uuid')
     or not hr_att_import_object_readable(f1::text, rh::text) then
    bad := bad || 'upload_policy ';
  end if;
  perform pg_temp.as_user(fin);
  if hr_att_import_object_readable(f1::text, rh::text) or hr_att_import_upload_allowed(f3::text) then
    bad := bad || 'orphan_file_visible ';
  end if;

  -- Creation checks, then the batch
  perform pg_temp.as_user(rh);
  m := '-'; begin perform hr_attendance_import_create(path1, 'mars.csv', 'text/csv', 1199, sha, meta, '{}', 15); exception when others then m := sqlerrm; end;
  if m not like '%Fichier non reçu%' then bad := bad || 'size_not_checked '; end if;
  m := '-'; begin perform hr_attendance_import_create(path1, 'mars.csv', 'application/pdf', 1200, sha, meta, '{}', 15); exception when others then m := sqlerrm; end;
  if m not like '%ne correspond pas à son extension%' then bad := bad || 'mime_not_checked '; end if;
  m := '-'; begin perform hr_attendance_import_create(path1, 'mars.csv', 'text/csv', 1200, sha, meta || '{"reference_year":2025}', '{}', 15); exception when others then m := sqlerrm; end;
  if m not like '%année de référence%' then bad := bad || 'reference_year_not_checked '; end if;
  m := '-'; begin perform hr_attendance_import_create(path1, 'mars.csv', 'text/csv', 1200, sha, meta || '{"provenance_detail":" "}', '{}', 15); exception when others then m := sqlerrm; end;
  if m not like '%Précisez la provenance%' then bad := bad || 'provenance_not_required '; end if;
  m := '-'; begin perform hr_attendance_import_create(path1, 'mars.csv', 'text/csv', 1200, sha, meta || jsonb_build_object('period_to', to_char(date_trunc('month', current_date) + interval '1 month', 'YYYY-MM-DD')), '{}', 15); exception when others then m := sqlerrm; end;
  if m not like '%Période future%' then bad := bad || 'future_period '; end if;
  m := '-'; begin perform hr_attendance_import_create(path1, 'mars.csv', 'text/csv', 1200, sha, meta || '{"format":"GRID","period_to":"2026-04-01"}', '{}', 15); exception when others then m := sqlerrm; end;
  if m not like '%Grille mensuelle%' then bad := bad || 'grid_scope '; end if;

  b1 := hr_attendance_import_create(path1, 'mars.csv', 'text/csv', 1200, sha, meta, '{"rows":14}', 14);
  if b1 is distinct from f1 or not exists (select 1 from hr_attendance_import_batches where id = b1 and status = 'DRAFT' and nature = 'REPRISE'
                               and reference_year = 2026 and provenance_kind = 'PAPER_REGISTER' and sealed_at is null
                               and batch_no like 'IMP-%' and created_by = rh) then
    bad := bad || 'batch_not_created ';
  end if;
  m := '-'; begin perform hr_attendance_import_analyze(b1); exception when others then m := sqlerrm; end;
  if m not like '%toutes les lignes du fichier%' then bad := bad || 'unsealed_analyzed '; end if;
  perform pg_temp.as_user(fin);
  m := '-'; begin perform hr_attendance_import_add_lines(b1, jsonb_build_array(pg_temp.line(2, 'L5-001', date '2026-03-02', 'P', 'ZZ-L5A'))); exception when others then m := sqlerrm; end;
  if m not like '%Seul l''auteur%' then bad := bad || 'lines_by_other_user '; end if;
  perform pg_temp.as_user(rh);
  perform hr_attendance_import_add_lines(b1, jsonb_build_array(
    pg_temp.line(2, 'L5-001', date '2026-03-02', 'P', 'ZZ-L5A'),
    pg_temp.line(3, 'L5-001', date '2026-03-04', 'P', 'ZZ-L5A'),
    pg_temp.line(4, 'L5-002', date '2026-03-03', 'P', 'ZZ-L5A'),
    pg_temp.line(5, 'L5-002', date '2026-03-06', 'P', 'ZZ-L5A'),
    pg_temp.line(6, 'L5-NOPE', date '2026-03-02', 'P', 'ZZ-L5A'),
    pg_temp.line(7, 'L5-001', date '2026-03-02', 'P', 'zz-l5a'),
    pg_temp.line(8, 'L5-001', date '2026-03-07', 'ZZQ', 'ZZ-L5A')));
  perform hr_attendance_import_add_lines(b1, jsonb_build_array(
    pg_temp.line(9, 'L5-001', date '2026-04-01', 'P', 'ZZ-L5A'),
    pg_temp.line(10, 'L5-003', date '2026-03-02', 'P', 'ZZ-L5A'),
    pg_temp.line(11, 'L5-001', date '2026-03-09', 'P', 'ZZ-L5A', 'Autre nom'),
    pg_temp.line(12, '880551', date '2026-03-02', 'P', 'ZZ-L5A'),
    pg_temp.line(13, 'L5-001', date '2026-03-11', 'P', 'ZZ-L5A', null, '{"HS50":30}'),
    pg_temp.line(14, 'L5-001', date '2026-03-12', 'P', 'NOPE-L5'),
    pg_temp.line(15, 'L5-001', date '2026-03-16', 'P', 'ZZ-L5A')));
  if (select sealed_at from hr_attendance_import_batches where id = b1) is null then bad := bad || 'not_sealed '; end if;
  m := '-'; begin update hr_attendance_import_lines set source_code = 'AJ' where batch_id = b1 and source_ref = 'L2'; exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'file_content_edited '; end if;
  m := '-'; begin insert into hr_attendance (employee_id, site_id, work_date, legend_code, source_code, import_batch_id, status_code)
    values (emp1, site_a, date '2026-03-20', 'P', 'IMPORT', b1, 'PROPOSED'); exception when others then m := sqlerrm; end;
  if m not like '%réservée au circuit d''import%' then bad := bad || 'direct_import_row '; end if;

  -- Dry-run analysis: every anomaly kept; conflicts put the batch on hold for D5, nothing written
  res := hr_attendance_import_analyze(b1);
  v_expected := case when v_leave then 3 else 2 end;
  if res->>'status' is distinct from 'PENDING_DECISION'
     or (res->'counts'->>'read')::int is distinct from 14
     or (res->'counts'->>'error')::int is distinct from 7
     or (res->'counts'->>'duplicate')::int is distinct from 1
     or (res->'counts'->>'same')::int is distinct from 1
     or (res->'counts'->>'conflict')::int is distinct from v_expected
     or (res->'counts'->>'warning')::int is distinct from 1 then
    bad := bad || 'analysis_counts(' || coalesce(res->'counts'::text, 'null') || ') ';
  end if;
  if (select array_agg(source_ref || ':' || array_to_string(errors, '+') order by line_no) from hr_attendance_import_lines
      where batch_id = b1 and status = 'ERROR')
     is distinct from array['L6:UNKNOWN_MATRICULE', 'L8:UNKNOWN_CODE', 'L9:DATE_OUT_OF_PERIOD', 'L10:NO_CONTRACT', 'L12:AMBIGUOUS_MATRICULE',
              'L13:HOURS_OUT_OF_BOUNDS', 'L14:UNKNOWN_SITE'] then
    bad := bad || 'analysis_errors ';
  end if;
  select id into l4 from hr_attendance_import_lines where batch_id = b1 and source_ref = 'L4';
  select id into l5 from hr_attendance_import_lines where batch_id = b1 and source_ref = 'L5';
  select id into l15 from hr_attendance_import_lines where batch_id = b1 and source_ref = 'L15';
  if (select conflict_kinds from hr_attendance_import_lines where id = l4) is distinct from array['EXISTING_DIFFERENT']
     or (select conflict_kinds from hr_attendance_import_lines where id = l5) is distinct from array['OTHER_SITE']
     or (v_leave and (select conflict_kinds @> array['LEAVE'] from hr_attendance_import_lines where id = l15) is not true)
     or (select status from hr_attendance_import_lines where batch_id = b1 and source_ref = 'L3') is distinct from 'SAME'
     or (select status from hr_attendance_import_lines where batch_id = b1 and source_ref = 'L7') is distinct from 'DUPLICATE'
     or (select warnings from hr_attendance_import_lines where batch_id = b1 and source_ref = 'L11') is distinct from array['NAME_MISMATCH']
     or jsonb_array_length((select existing from hr_attendance_import_lines where id = l4)) is distinct from 1 then
    bad := bad || 'analysis_lines ';
  end if;
  if not exists (select 1 from jsonb_array_elements(res->'warnings') w where w->>'code' = 'CONTROL_LINES' and (w->>'expected')::int = 99) then
    bad := bad || 'control_total_warning ';
  end if;
  if exists (select 1 from hr_attendance where source_code = 'IMPORT' and employee_id in (emp1, emp2, emp3))
     or (select legend_code from hr_attendance where employee_id = emp2 and work_date = date '2026-03-03') is distinct from 'AJ' then
    bad := bad || 'analysis_wrote_attendance ';
  end if;
  select id, fingerprint into d5, fp from sys_decisions where dedupe_key = 'D5:' || b1::text and status = 'PENDING';
  if d5 is null or not exists (select 1 from sys_notifications where decision_id = d5 and kind = 'DECISION_PENDING'
                                   and recipient_screen = 'decision_attendance_import_conflict')
     or (select (context->>'conflict_total')::int from sys_decisions where id = d5) is distinct from v_expected then
    bad := bad || 'd5_not_requested ';
  end if;
  m := '-'; begin perform hr_attendance_import_commit(b1, true); exception when others then m := sqlerrm; end;
  if m not like '%import possible seulement après analyse et décision%' then bad := bad || 'commit_while_pending '; end if;

  -- D11: unknown code → correspondence, kept as a policy after a second confirmation
  m := '-'; begin perform hr_attendance_import_request_mapping(b1, '{"AJ":"P"}', 'Code de l''ancien registre'); exception when others then m := sqlerrm; end;
  if m not like '%existe déjà dans le référentiel%' then bad := bad || 'mapping_of_known_code '; end if;
  m := '-'; begin perform hr_attendance_import_request_mapping(b1, '{"XYZ":"P"}', 'Code de l''ancien registre'); exception when others then m := sqlerrm; end;
  if m not like '%n''apparaît pas parmi les codes inconnus%' then bad := bad || 'mapping_of_absent_code '; end if;
  d11 := hr_attendance_import_request_mapping(b1, '{"zzq":"P"}', 'ZZQ = présent dans l''ancien registre');
  perform pg_temp.as_user(fin);
  select fingerprint into fp from sys_decisions where id = d11;
  res := sys_decision_decide(d11, 'POLICY', 'Correspondance vérifiée sur le registre papier', fp, false);
  if (res->>'ok')::boolean is not true or (select status from sys_decisions where id = d11) is distinct from 'EXECUTED'
     or (select code_map->>'ZZQ' from hr_attendance_import_batches where id = b1) is distinct from 'P'
     or (select status || ':' || code_origin from hr_attendance_import_lines where batch_id = b1 and source_ref = 'L8') is distinct from 'OK:BATCH_MAP' then
    bad := bad || 'd11_batch_map ';
  end if;
  select id into map_id from hr_attendance_code_mappings where source_code = 'ZZQ' and status = 'PENDING_CONFIRMATION' and decision_id = d11;
  perform pg_temp.as_user(rh);
  m := '-'; begin perform hr_attendance_code_mapping_confirm(map_id); exception when others then m := sqlerrm; end;
  if map_id is null or m not like '%droit de décision D11 requis%' then bad := bad || 'mapping_confirm_right '; end if;
  perform pg_temp.as_user(fin);
  perform hr_attendance_code_mapping_confirm(map_id);
  if (select status from hr_attendance_code_mappings where id = map_id) is distinct from 'ACTIVE' then bad := bad || 'mapping_not_confirmed '; end if;
  m := '-'; begin update hr_attendance_code_mappings set legend_code = 'AJ' where id = map_id; exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'mapping_edited '; end if;

  -- D5: SUPER_ADMIN only, line by line; nothing is replaced before the import
  select fingerprint into fp from sys_decisions where id = d5;
  m := '-'; begin perform sys_decision_decide(d5, 'LINE_BY_LINE', 'Tranché ligne par ligne', fp, true); exception when others then m := sqlerrm; end;
  if m not like '%pas le droit%' then bad := bad || 'd5_decided_by_delegate '; end if;
  perform pg_temp.as_user(boss);
  select fingerprint into fp from sys_decisions where id = d5;
  res := sys_decision_decide(d5, 'LINE_BY_LINE', 'Vérifié avec le chef de chantier', fp, true);
  if (res->>'ok')::boolean is not true or res->>'status' is distinct from 'DECIDED'
     or (select status from hr_attendance_import_batches where id = b1) is distinct from 'PENDING_DECISION' then
    bad := bad || 'd5_line_by_line ';
  end if;
  perform pg_temp.as_user(rh);
  m := '-'; begin perform hr_attendance_import_resolve_lines(d5, jsonb_build_array(jsonb_build_object('id', l4, 'resolution', 'IMPORT'))); exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'resolved_by_delegate '; end if;
  perform pg_temp.as_user(boss);
  res := hr_attendance_import_resolve_lines(d5, jsonb_build_array(
    jsonb_build_object('id', l4, 'resolution', 'IMPORT'), jsonb_build_object('id', l5, 'resolution', 'KEEP')));
  if v_leave then
    if (res->>'remaining')::int is distinct from 1 then bad := bad || 'resolve_remaining '; end if;
    res := hr_attendance_import_resolve_lines(d5, jsonb_build_array(jsonb_build_object('id', l15, 'resolution', 'KEEP')));
  end if;
  if (res->>'remaining')::int is distinct from 0 or (select status from hr_attendance_import_batches where id = b1) is distinct from 'ANALYZED'
     or (select status from sys_decisions where id = d5) is distinct from 'EXECUTED'
     or (select resolved_by from hr_attendance_import_lines where id = l4) is distinct from boss then
    bad := bad || 'd5_resolution ';
  end if;
  if (select legend_code from hr_attendance where employee_id = emp2 and work_date = date '2026-03-03') is distinct from 'AJ' then
    bad := bad || 'replaced_before_import ';
  end if;

  -- Import: acknowledgement of rejected lines, PROPOSED rows linked to the batch, replaced value kept in the batch
  perform pg_temp.as_user(rh);
  m := '-'; begin perform hr_attendance_import_commit(b1, false); exception when others then m := sqlerrm; end;
  if m not like '%ligne(s) rejetée(s)%' then bad := bad || 'commit_without_ack '; end if;
  res := hr_attendance_import_commit(b1, true);
  v_expected := case when v_leave then 4 else 5 end;
  if (res->>'ok')::boolean is not true or (res->>'imported')::int is distinct from v_expected or (res->>'replaced')::int is distinct from 1 then
    bad := bad || 'commit(' || res::text || ') ';
  end if;
  if (select count(*) from hr_attendance where import_batch_id = b1 and source_code = 'IMPORT' and status_code = 'PROPOSED') is distinct from v_expected
     or (select legend_code from hr_attendance where employee_id = emp2 and work_date = date '2026-03-03') is distinct from 'P'
     or (select source_code from hr_attendance where employee_id = emp2 and site_id = site_b and work_date = date '2026-03-06') is distinct from 'MANUAL'
     or (select source_code from hr_attendance where employee_id = emp1 and work_date = date '2026-03-04') is distinct from 'MANUAL'
     or (select status from hr_attendance_import_batches where id = b1) is distinct from 'IMPORTED' then
    bad := bad || 'imported_rows ';
  end if;
  if not exists (select 1 from sys_notifications where kind = 'ATTENDANCE_IMPORT' and recipient_screen = 'hr_attendance_import_validate'
                   and link = '/rh/presence/imports?lot=' || b1::text) then
    bad := bad || 'validation_not_notified ';
  end if;
  if (select count(*) from hr_payroll_runs) is distinct from n_runs then bad := bad || 'payroll_created '; end if;

  -- The pointage grid neither validates nor overwrites an untouched imported value; a real edit becomes manual
  perform hr_attendance_replace_month(site_a, date '2026-03-01', date '2026-03-31', emp1, null, jsonb_build_array(
    jsonb_build_object('employee_id', emp1, 'site_id', site_a, 'work_date', '2026-03-02', 'legend_code', 'P', 'source_code', 'IMPORT'),
    jsonb_build_object('employee_id', emp1, 'site_id', site_a, 'work_date', '2026-03-04', 'legend_code', 'P', 'source_code', 'MANUAL'),
    jsonb_build_object('employee_id', emp1, 'site_id', site_a, 'work_date', '2026-03-07', 'legend_code', 'P', 'source_code', 'IMPORT'),
    jsonb_build_object('employee_id', emp1, 'site_id', site_a, 'work_date', '2026-03-09', 'legend_code', 'AJ', 'source_code', 'IMPORT')));
  if (select source_code || ':' || status_code from hr_attendance where employee_id = emp1 and work_date = date '2026-03-02') is distinct from 'IMPORT:PROPOSED'
     or (select source_code || ':' || status_code || ':' || coalesce(import_batch_id::text, '-') from hr_attendance
         where employee_id = emp1 and work_date = date '2026-03-09') is distinct from 'MANUAL:VALIDATED:-' then
    bad := bad || 'grid_vs_import ';
  end if;
  m := '-'; begin update hr_attendance set status_code = 'VALIDATED' where import_batch_id = b1 and employee_id = emp1 and work_date = date '2026-03-02'; exception when others then m := sqlerrm; end;
  if m not like '%réservée au circuit d''import%' then bad := bad || 'direct_validation '; end if;
  if (select prosrc from pg_proc where proname = 'hr_apply_correspondence_attendance') not like '%''IMPORT''%' then
    bad := bad || 'correspondence_overwrites_import ';
  end if;

  -- Validation: separate right, never by the author unless the D12 policy allows it
  m := '-'; begin perform hr_attendance_import_validate(b1); exception when others then m := sqlerrm; end;
  if m not like '%Validation des présences importées non autorisée%' then bad := bad || 'validate_without_right '; end if;
  perform pg_temp.as_user(boss);
  perform pg_temp.grant_perm('ADMIN_RH', 'hr_attendance_import_validate', true, false, true);
  perform pg_temp.as_user(rh);
  m := '-'; begin perform hr_attendance_import_validate(b1); exception when others then m := sqlerrm; end;
  if m not like '%Séparation des tâches%' then bad := bad || 'author_validated '; end if;
  perform pg_temp.as_user(fin);
  if not hr_att_import_object_readable(b1::text, rh::text) then bad := bad || 'batch_file_not_readable '; end if;
  res := hr_attendance_import_validate(b1);
  if (res->>'validated')::int is distinct from v_expected - 1 or (res->>'modified_since_import')::int is distinct from 1
     or (select status || ':' || lines_validated from hr_attendance_import_batches where id = b1) is distinct from 'VALIDATED:' || (v_expected - 1)
     or exists (select 1 from hr_attendance where import_batch_id = b1 and status_code is distinct from 'VALIDATED')
     or jsonb_array_length(res->'signals') is distinct from 1
     or not exists (select 1 from sys_decisions where type_code = 'D4' and site_id = site_a and period_year = 2026 and period_month = 3
                      and status = 'PENDING') then
    bad := bad || 'validation(' || res::text || ') ';
  end if;
  if (select count(*) from hr_payroll_runs) is distinct from n_runs then bad := bad || 'payroll_created_on_validation '; end if;

  -- D12: requested by a validator, decided by the SUPER_ADMIN only; the author may then validate
  d12 := hr_attendance_import_policy_request('Petite équipe : une seule personne importe et valide');
  select fingerprint into fp from sys_decisions where id = d12;
  m := '-'; begin perform sys_decision_decide(d12, 'ALLOW', 'Autorisation demandée', fp, true); exception when others then m := sqlerrm; end;
  if m not like '%pas le droit%' then bad := bad || 'd12_decided_by_delegate '; end if;
  perform pg_temp.as_user(boss);
  res := sys_decision_decide(d12, 'ALLOW', 'Autorisé temporairement pour la reprise', fp, true);
  if (res->>'ok')::boolean is not true
     or not exists (select 1 from hr_attendance_import_policy where importer_may_validate and decision_id = d12 and decided_by = boss) then
    bad := bad || 'd12_policy ';
  end if;

  -- Grid batch with the same file while the first one is still open: duplicate warning, no conflict
  perform pg_temp.as_user(rh);
  path2 := pg_temp.upload(f2, 'xlsx', 900, rh);
  b2 := hr_attendance_import_create(path2, 'grille.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 900, sha,
                                    meta || jsonb_build_object('format', 'GRID', 'site_ids', jsonb_build_array(site_b), 'control_lines', null), '{}', 1);
  if (select duplicate_of from hr_attendance_import_batches where id = b2) is distinct from b1 then bad := bad || 'duplicate_not_linked '; end if;
  perform hr_attendance_import_add_lines(b2, jsonb_build_array(pg_temp.line(3, 'L5-003', date '2026-03-02', 'P', null)
                                                              || '{"source_ref":"L3-J2"}'));
  res := hr_attendance_import_analyze(b2);
  if res->>'status' is distinct from 'ANALYZED' or (res->'counts'->>'ok')::int is distinct from 1
     or not exists (select 1 from jsonb_array_elements(res->'warnings') w where w->>'code' = 'DUPLICATE_FILE') then
    bad := bad || 'grid_analysis(' || res::text || ') ';
  end if;

  -- Cancellation of a validated batch: imported rows removed, the replaced value restored
  perform pg_temp.as_user(rh);
  m := '-'; begin perform hr_attendance_import_cancel(b1, 'court'); exception when others then m := sqlerrm; end;
  if m not like '%Motif obligatoire%' then bad := bad || 'cancel_reason '; end if;
  res := hr_attendance_import_cancel(b1, 'Registre mal daté, lot à refaire');
  if res->>'status' is distinct from 'CANCELLED' or (res->>'removed')::int is distinct from v_expected - 1 or (res->>'restored')::int is distinct from 1
     or (select legend_code || ':' || source_code || ':' || status_code from hr_attendance
         where employee_id = emp2 and work_date = date '2026-03-03') is distinct from 'AJ:MANUAL:VALIDATED'
     or exists (select 1 from hr_attendance where import_batch_id = b1)
     or (select legend_code from hr_attendance where employee_id = emp1 and work_date = date '2026-03-09') is distinct from 'AJ' then
    bad := bad || 'cancel(' || res::text || ') ';
  end if;
  m := '-'; begin update hr_attendance_import_batches set status = 'IMPORTED' where id = b1; exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'cancelled_reopened '; end if;
  m := '-'; begin delete from hr_attendance_import_batches where id = b1; exception when others then m := sqlerrm; end;
  if m = '-' then bad := bad || 'batch_deleted '; end if;

  -- The grid batch is rejected before import: nothing written, its folder closed to new uploads
  res := hr_attendance_import_cancel(b2, 'Doublon du registre, rejeté');
  if res->>'status' is distinct from 'REJECTED' or hr_att_import_upload_allowed(f2::text) then bad := bad || 'reject '; end if;
  if exists (select 1 from hr_attendance where employee_id = emp3) then bad := bad || 'rejected_batch_wrote '; end if;

  if not exists (select 1 from sys_audit_logs where table_name = 'hr_attendance_import_lines' and target_id = l4::text and user_id = boss)
     or not exists (select 1 from sys_audit_logs where table_name = 'hr_attendance_import_batches' and target_id = b1::text) then
    bad := bad || 'not_audited ';
  end if;

  if bad is distinct from '' then raise exception 'RESULT: FAIL %', bad; end if;
  raise exception 'RESULT: PASS lot 5 (rights SA-only by default and delegated per screen, D5/D12 non-delegable, sealed staging, dry-run analysis with every anomaly, conflicts held for D5 line by line, D11 batch map and confirmed policy, import as PROPOSED linked to batch, grid and correspondences protect imported values, separate validation with D12, cancel restores replaced values, no payroll created; leave conflict tested: %)', v_leave;
end $$;
