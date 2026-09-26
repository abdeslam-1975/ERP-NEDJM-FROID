do $$
declare
  v_rh uuid; v_ro uuid; v_var uuid; v_var2 uuid; v_sys uuid; v_sys_ver uuid; v_prof uuid;
  v_id1 uuid; v_id2 uuid; v_mid uuid; v_r1 uuid; v_r2 uuid;
  r record; n int; ok boolean; bad text := ''; trail text := '';
begin
  select su.id into v_rh from sys_users su where su.email = 'e2e-rh@nedjm-froid.com';
  select su.id into v_ro from sys_users su where su.email = 'e2e-lecture@nedjm-froid.com';
  if v_rh is null or v_ro is null then raise exception 'RESULT: SKIP (no e2e accounts)'; end if;

  insert into hr_payroll_runs (period_year, period_month, site_id, status_code) values (2099, 5, null, 'VALIDATED');
  if hr_first_open_payroll_month() <> date '2099-06-01' then bad := bad || 'open_month=' || hr_first_open_payroll_month() || ' '; end if;
  select id into v_sys from ref_global_vars where key = 'CNAS_EMPLOYEE';
  select id into v_sys_ver from ref_global_var_versions where var_id = v_sys order by effective_from limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_rh, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_rh::text, true);
  perform set_config('role', 'authenticated', true);

  insert into ref_global_vars (key, label_fr, value_type, unit, is_system, contrib_part, contrib_base)
  values ('CNAS_ZZ_REGRESSION', 'Regression', 'numeric', '%', false, 'EMPLOYEE', 'COTISABLE')
  returning id into v_var;

  begin
    perform hr_set_legal_var_version(v_var, date '2099-05-01', 0.01);
    ok := true;
  exception when check_violation then ok := false;
  end;
  if ok then bad := bad || 'closed_month_accepted '; end if;
  begin
    perform hr_set_legal_var_version(v_var, date '2099-06-15', 0.01);
    ok := true;
  exception when check_violation then ok := false;
  end;
  if ok then bad := bad || 'mid_month_accepted '; end if;

  v_id1 := hr_set_legal_var_version(v_var, date '2099-06-01', 0.01, jsonb_build_object('part', 'EMPLOYEE', 'base', 'COTISABLE'));
  v_id2 := hr_set_legal_var_version(v_var, date '2099-06-01', 0.02);
  if v_id1 is distinct from v_id2 then bad := bad || 'same_month_not_replaced '; end if;

  perform hr_set_legal_var_version(v_var, date '2099-09-01', 0.03, jsonb_build_object('part', 'EMPLOYER', 'base', 'TAXABLE', 'reduces_irg', true));
  select count(*) into n from ref_global_var_versions
  where var_id = v_var and effective_from = date '2099-09-01' and contrib_part = 'EMPLOYER' and contrib_base = 'TAXABLE' and contrib_reduces_irg = false;
  if n <> 1 then bad := bad || 'dated_settings '; end if;
  select count(*) into n from ref_global_vars where id = v_var and contrib_part = 'EMPLOYER';
  if n <> 1 then bad := bad || 'var_settings_not_synced '; end if;

  v_mid := hr_set_legal_var_version(v_var, date '2099-07-01', 0.025);
  select count(*) into n from ref_global_var_versions where id = v_mid and contrib_part = 'EMPLOYEE' and contrib_base = 'COTISABLE';
  if n <> 1 then bad := bad || 'settings_not_inherited '; end if;
  select count(*) into n from ref_global_var_versions where var_id = v_var
    and ((effective_from = date '2099-06-01' and effective_to = date '2099-06-30' and value_numeric = 0.02)
      or (effective_from = date '2099-07-01' and effective_to = date '2099-08-31' and value_numeric = 0.025)
      or (effective_from = date '2099-09-01' and effective_to is null and value_numeric = 0.03));
  if n <> 3 then bad := bad || 'slotting '; end if;

  perform hr_stop_legal_var(v_var, date '2099-08-01');
  select count(*) into n from ref_global_var_versions where var_id = v_var;
  if n <> 2 then bad := bad || 'stop_count=' || n || ' '; end if;
  select count(*) into n from ref_global_var_versions where id = v_mid and effective_to = date '2099-07-31';
  if n <> 1 then bad := bad || 'stop_not_closing '; end if;

  perform hr_cancel_legal_var_version(v_mid);
  for r in select effective_from, effective_to, value_numeric from ref_global_var_versions where var_id = v_var order by effective_from loop
    trail := trail || r.effective_from || '>' || coalesce(r.effective_to::text, 'open') || '=' || r.value_numeric || ' ';
  end loop;
  select count(*) into n from ref_global_var_versions where id = v_id1 and effective_to = date '2099-07-31';
  if n <> 1 then bad := bad || 'cancel_reopened_stopped '; end if;

  begin
    update ref_global_var_versions set value_numeric = 0.5 where id = v_sys_ver;
    ok := true;
  exception when check_violation then ok := false;
  end;
  if ok then bad := bad || 'closed_version_edited '; end if;
  begin
    perform hr_cancel_legal_var_version(v_sys_ver);
    ok := true;
  exception when check_violation then ok := false;
  end;
  if ok then bad := bad || 'closed_version_cancelled '; end if;
  perform hr_set_legal_var_version(v_sys, date '2099-06-01', 0.095);
  select count(*) into n from ref_global_var_versions where var_id = v_sys and effective_to = date '2099-05-31';
  if n <> 1 then bad := bad || 'legal_rate_not_closed_at_open_month '; end if;

  insert into ref_global_vars (key, label_fr, value_type, unit, is_system, contrib_part)
  values ('CNAS_ZZ_REGRESSION_OLD', 'Old', 'numeric', '%', false, 'EMPLOYER')
  returning id into v_var2;
  perform set_config('role', 'postgres', true);
  perform set_config('erp.allow_closed_period_edit', 'on', true);
  insert into ref_global_var_versions (var_id, value_numeric, effective_from, effective_to, contrib_part, contrib_base, contrib_reduces_irg, contrib_scope)
  values (v_var2, 0.01, date '2099-01-01', date '2099-05-31', 'EMPLOYER', 'COTISABLE', false, 'ALL');
  perform set_config('erp.allow_closed_period_edit', 'off', true);
  perform set_config('role', 'authenticated', true);
  begin
    delete from ref_global_vars where id = v_var2;
    ok := true;
  exception when check_violation then ok := false;
  end;
  if ok then bad := bad || 'closed_contribution_deleted '; end if;
  delete from ref_global_vars where id = v_var;
  get diagnostics n = row_count;
  if n <> 1 then bad := bad || 'unused_contribution_not_deleted '; end if;

  insert into hr_catalogs (kind, code, label_fr, label_ar) values ('social_profile', 'ZZ_REGRESSION', 'Regression', 'Regression')
  returning id into v_prof;
  v_r1 := hr_set_social_profile_rates(v_prof, date '2099-06-01', 9, 3, 0.5);
  begin
    perform hr_set_social_profile_rates(v_prof, date '2099-05-01', 1, 1, 1);
    ok := true;
  exception when check_violation then ok := false;
  end;
  if ok then bad := bad || 'regime_closed_month_accepted '; end if;
  v_r2 := hr_set_social_profile_rates(v_prof, date '2099-08-01', null, 2, null);
  select count(*) into n from hr_social_profile_rates where id = v_r1 and effective_to = date '2099-07-31';
  if n <> 1 then bad := bad || 'regime_slotting '; end if;
  perform hr_cancel_social_profile_rates(v_r2);
  select count(*) into n from hr_social_profile_rates where id = v_r1 and effective_to is null;
  if n <> 1 then bad := bad || 'regime_cancel '; end if;
  begin
    update hr_social_profile_rates set employee_pct = 1
    where profile_id = (select id from hr_catalogs where kind = 'social_profile' and code = 'ABATTEMENT');
    get diagnostics n = row_count;
    ok := n > 0;
  exception when check_violation then ok := false;
  end;
  if ok then bad := bad || 'closed_regime_rate_edited '; end if;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ro, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_ro::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    perform hr_set_legal_var_version(v_sys, date '2099-07-01', 0.5);
    ok := true;
  exception when insufficient_privilege then ok := false;
  end;
  if ok then bad := bad || 'read_only_sets_rate '; end if;
  begin
    perform hr_set_social_profile_rates(v_prof, date '2099-07-01', 1, 1, 1);
    ok := true;
  exception when insufficient_privilege then ok := false;
  end;
  if ok then bad := bad || 'read_only_sets_regime '; end if;
  begin
    perform hr_stop_legal_var(v_var2, date '2099-07-01');
    ok := true;
  exception when insufficient_privilege then ok := false;
  end;
  if ok then bad := bad || 'read_only_stops '; end if;

  perform set_config('role', 'postgres', true);
  if bad <> '' then raise exception 'RESULT: FAIL % (%)', bad, trail; end if;
  raise exception 'RESULT: PASS rubriques non retroactive (closed months frozen, dated settings, stop, cancel, regimes, RLS) %', trail;
end $$;
