do $$
declare
  rh uuid; m1 text := '-'; m2 text := '-'; m3 text := '-'; n_upd int := -1; n_audit int := -1; n_lock int := -1;
  perm_audit boolean; bad text := '';
begin
  begin update sys_roles set code = 'SUPER_X' where code = 'SUPER_ADMIN'; exception when others then m1 := sqlerrm; end;
  if m1 = '-' then bad := bad || 'system_role_rename_allowed '; end if;
  begin update sys_roles set is_active = false where code = 'ADMIN_RH'; exception when others then m2 := sqlerrm; end;
  if m2 = '-' then bad := bad || 'system_role_deactivate_allowed '; end if;
  begin delete from sys_roles where code = 'READ_ONLY'; exception when others then m3 := sqlerrm; end;
  if m3 = '-' then bad := bad || 'role_delete_allowed '; end if;

  select usr.user_id into rh from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'ADMIN_RH' and not erp_is_super_admin(usr.user_id) limit 1;
  if rh is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', rh, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', rh::text, true);
    perm_audit := erp_has_perm('audit', 'read', null);
    perform set_config('role', 'authenticated', true);
    update sys_permissions set can_delete = true where true;
    get diagnostics n_upd = row_count;
    select count(*) into n_audit from sys_audit_logs;
    begin insert into sys_period_locks (year, month, locked_by) values (2031, 1, rh); n_lock := 1; exception when others then n_lock := 0; end;
    perform set_config('role', 'postgres', true);
    if n_upd <> 0 then bad := bad || 'rh_edits_permissions '; end if;
    if n_audit > 0 and not perm_audit then bad := bad || 'rh_reads_audit_without_perm '; end if;
    if n_lock <> 0 then bad := bad || 'rh_inserts_period_lock '; end if;
  end if;

  if bad <> '' then raise exception 'RESULT: FAIL %', bad; end if;
  raise exception 'RESULT: PASS admin (system roles protected; RH user: permissions/audit/locks under RLS, checked=%)', rh is not null;
end $$;
