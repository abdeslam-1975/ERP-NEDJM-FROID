do $$
declare
  u record; v_var uuid; v_contract uuid; ok boolean; n int; bad text := ''; seen text := '';
  can_edit boolean; can_read boolean;
begin
  select id into v_var from ref_global_vars where key = 'IRG_ZONE_SUD';
  select id into v_contract from hr_contracts limit 1;
  for u in
    select su.id, su.email, r.code as role_code from sys_users su
    join sys_user_site_roles l on l.user_id = su.id join sys_roles r on r.id = l.role_id
    where su.email in ('e2e-superadmin@nedjm-froid.com', 'e2e-rh@nedjm-froid.com', 'e2e-finance@nedjm-froid.com', 'e2e-lecture@nedjm-froid.com')
  loop
    can_edit := u.role_code in ('SUPER_ADMIN', 'ADMIN_RH', 'ADMIN_FINANCE');
    can_read := can_edit or u.role_code = 'GERANT';
    seen := seen || u.role_code || ' ';
    perform set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u.id::text, true);
    if erp_can_write_hr_compliance() is distinct from can_edit then bad := bad || u.role_code || ':write_helper '; end if;
    if erp_can_read_hr_compliance() is distinct from can_read then bad := bad || u.role_code || ':read_helper '; end if;
    perform set_config('role', 'authenticated', true);

    select count(*) into n from ref_global_var_versions where var_id = v_var;
    if can_read and n = 0 then bad := bad || u.role_code || ':cannot_read_rates '; end if;

    begin
      insert into ref_global_var_versions (var_id, value_numeric, effective_from) values (v_var, 0.1, date '2099-01-01');
      ok := true;
    exception when insufficient_privilege then ok := false; when others then ok := true;
    end;
    if ok is distinct from can_edit then bad := bad || u.role_code || ':rate_insert=' || ok || ' '; end if;

    begin
      insert into hr_catalogs (kind, code, label_fr, label_ar) values ('irg_zone_wilaya', 'ZZ_TEST_' || left(u.role_code, 3), 'Test', 'Test');
      ok := true;
    exception when insufficient_privilege then ok := false; when others then ok := true;
    end;
    if ok is distinct from can_edit then bad := bad || u.role_code || ':zone_catalog_insert=' || ok || ' '; end if;

    begin
      update ref_bareme_irg_versions set label_fr = label_fr where true;
      get diagnostics n = row_count;
      ok := n > 0;
    exception when insufficient_privilege then ok := false; when others then ok := true;
    end;
    if ok is distinct from can_edit then bad := bad || u.role_code || ':bareme_update=' || ok || ' '; end if;

    if v_contract is not null then
      begin
        insert into hr_contract_compliance (contract_id, domain, option_code, params, reason, effective_from)
        values (v_contract, 'IRG', 'BAREME', '{}'::jsonb, 'Regression rollback', date '2099-01-01');
        ok := true;
      exception when insufficient_privilege then ok := false; when others then ok := true;
      end;
      if ok is distinct from can_edit then bad := bad || u.role_code || ':override_insert=' || ok || ' '; end if;
    end if;

    if u.role_code = 'ADMIN_RH' then
      select count(*) into n from sys_audit_logs;
      if n = 0 then bad := bad || 'ADMIN_RH:audit_not_readable '; end if;
      begin
        update sys_permissions set can_delete = true where true;
        get diagnostics n = row_count;
      exception when others then n := 0;
      end;
      if n <> 0 then bad := bad || 'ADMIN_RH:edits_matrix '; end if;
    end if;

    perform set_config('role', 'postgres', true);
  end loop;

  if seen = '' then raise exception 'RESULT: SKIP (no e2e accounts)'; end if;
  if bad <> '' then raise exception 'RESULT: FAIL % (roles: %)', bad, seen; end if;
  raise exception 'RESULT: PASS unit 05 access (edit: SUPER_ADMIN/ADMIN_RH/ADMIN_FINANCE, none for READ_ONLY; ADMIN_RH audit read) roles: %', seen;
end $$;
