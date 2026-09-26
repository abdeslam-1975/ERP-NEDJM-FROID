do $$
declare
  v_rh uuid; v_ro uuid; v_var uuid; v_id1 uuid; v_id2 uuid; v_fut uuid; v_sys uuid;
  r record; n int; ok boolean; bad text := ''; trail text := '';
begin
  select su.id into v_rh from sys_users su where su.email = 'e2e-rh@nedjm-froid.com';
  select su.id into v_ro from sys_users su where su.email = 'e2e-lecture@nedjm-froid.com';
  if v_rh is null or v_ro is null then raise exception 'RESULT: SKIP (no e2e accounts)'; end if;
  select id into v_sys from ref_global_vars where key = 'CNAS_EMPLOYEE';

  perform set_config('request.jwt.claims', json_build_object('sub', v_rh, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_rh::text, true);
  perform set_config('role', 'authenticated', true);

  insert into ref_global_vars (key, label_fr, value_type, unit, is_system, contrib_part, contrib_base)
  values ('CNAS_ZZ_REGRESSION', 'Regression', 'numeric', '%', false, 'EMPLOYEE', 'COTISABLE')
  returning id into v_var;
  trail := trail || 'create_var=ok ';

  v_id1 := hr_set_legal_var_version(v_var, date '2026-01-01', 0.01);
  v_id2 := hr_set_legal_var_version(v_var, date '2026-01-01', 0.02);
  if v_id1 is distinct from v_id2 then bad := bad || 'same_day_not_replaced '; end if;
  select count(*) into n from ref_global_var_versions where var_id = v_var;
  if n <> 1 then bad := bad || 'same_day_count=' || n || ' '; end if;

  perform hr_set_legal_var_version(v_var, date '2026-06-01', 0.03);
  perform hr_set_legal_var_version(v_var, date '2026-03-01', 0.025);
  for r in select effective_from, effective_to, value_numeric from ref_global_var_versions where var_id = v_var order by effective_from loop
    trail := trail || r.effective_from || '>' || coalesce(r.effective_to::text, 'open') || '=' || r.value_numeric || ' ';
  end loop;
  select count(*) into n from ref_global_var_versions where var_id = v_var
    and ((effective_from = date '2026-01-01' and effective_to = date '2026-02-28' and value_numeric = 0.02)
      or (effective_from = date '2026-03-01' and effective_to = date '2026-05-31' and value_numeric = 0.025)
      or (effective_from = date '2026-06-01' and effective_to is null and value_numeric = 0.03));
  if n <> 3 then bad := bad || 'slotting '; end if;

  v_fut := hr_set_legal_var_version(v_var, date '2099-01-01', 0.04);
  select count(*) into n from ref_global_var_versions where var_id = v_var and effective_from = date '2026-06-01' and effective_to = date '2098-12-31';
  if n <> 1 then bad := bad || 'future_not_closing_current '; end if;
  perform hr_cancel_legal_var_version(v_fut);
  select count(*) into n from ref_global_var_versions where var_id = v_var and effective_from = date '2026-06-01' and effective_to is null;
  if n <> 1 then bad := bad || 'cancel_not_reopening '; end if;

  begin
    perform hr_cancel_legal_var_version(v_id1);
    ok := true;
  exception when check_violation then ok := false;
  end;
  if ok then bad := bad || 'past_version_cancelled '; end if;

  begin
    insert into ref_global_vars (key, label_fr, value_type, is_system) values ('VF_ZZ_REGRESSION', 'X', 'numeric', false);
    ok := true;
  exception when insufficient_privilege then ok := false;
  end;
  if ok then bad := bad || 'rh_inserts_non_unit05_var '; end if;

  begin
    insert into ref_global_vars (key, label_fr, value_type, is_system) values ('CNAS_ZZ_SYSTEM', 'X', 'numeric', true);
    ok := true;
  exception when insufficient_privilege then ok := false;
  end;
  if ok then bad := bad || 'rh_inserts_system_var '; end if;

  delete from ref_global_vars where id = v_sys;
  get diagnostics n = row_count;
  if n <> 0 then bad := bad || 'rh_deletes_system_var '; end if;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ro, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_ro::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    perform hr_set_legal_var_version(v_sys, date '2099-01-01', 0.5);
    ok := true;
  exception when insufficient_privilege then ok := false;
  end;
  if ok then bad := bad || 'read_only_sets_rate '; end if;

  delete from ref_global_vars where id = v_var;
  get diagnostics n = row_count;
  if n <> 0 then bad := bad || 'read_only_deletes_contribution '; end if;

  perform set_config('role', 'postgres', true);
  if bad <> '' then raise exception 'RESULT: FAIL % (%)', bad, trail; end if;
  raise exception 'RESULT: PASS legal var versions (same-day replace, slotting, planned cancel, custom contributions under RLS) %', trail;
end $$;
