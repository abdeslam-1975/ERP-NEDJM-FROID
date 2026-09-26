do $$
declare
  rh uuid; boss uuid; emp uuid; rub uuid; xid uuid; st text; r text; ab uuid;
  m1 text := '-'; m2 text := '-'; m3 text := '-'; m4 text := '-'; m5 text := '-';
  bad text := '';
begin
  select usr.user_id into rh from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id
   where ro.code = 'ADMIN_RH' and not erp_is_super_admin(usr.user_id)
     and not exists (select 1 from sys_user_site_roles u2 join sys_roles r2 on r2.id = u2.role_id where u2.user_id = usr.user_id and r2.code = 'GERANT')
   limit 1;
  select usr.user_id into boss from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id where ro.code = 'SUPER_ADMIN' limit 1;
  if rh is null then rh := boss; end if;
  select id into emp from hr_employees limit 1;
  select id into rub from hr_salary_rubriques where is_active limit 1;
  if boss is null or emp is null or rub is null then
    raise exception 'RESULT: SKIP (no super admin, employee or active rubrique)';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', rh, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', rh::text, true);
  insert into hr_salary_exceptions (employee_id, rubrique_id, amount, period_year, period_month, duration_mode, reason, status_code, is_active)
  values (emp, rub, 1000, 2031, 1, 'once', 'Regression rollback', 'APPROVED', true) returning id, status_code into xid, st;
  if st <> 'DRAFT' then bad := bad || 'insert_not_draft '; end if;

  begin update hr_salary_exceptions set status_code = 'APPROVED' where id = xid; exception when others then m1 := sqlerrm; end;
  if m1 = '-' then bad := bad || 'direct_status_update_allowed '; end if;
  begin perform hr_salary_exception_decide(xid, 'APPROVED', null); exception when others then m2 := sqlerrm; end;
  if m2 = '-' and rh <> boss then bad := bad || 'self_approval_allowed '; end if;
  update hr_salary_exceptions set amount = 1500 where id = xid;

  perform set_config('request.jwt.claims', json_build_object('sub', boss, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', boss::text, true);
  if rh <> boss then
    r := hr_salary_exception_decide(xid, 'APPROVED', 'ok');
    select approved_by into ab from hr_salary_exceptions where id = xid;
    if r <> 'APPROVED' or ab is distinct from boss then bad := bad || 'approve_failed '; end if;
  end if;
  begin update hr_salary_exceptions set amount = 2000 where id = xid; exception when others then m3 := sqlerrm; end;
  if m3 = '-' then bad := bad || 'edit_approved_allowed '; end if;
  begin delete from hr_salary_exceptions where id = xid; exception when others then m4 := sqlerrm; end;
  if m4 = '-' then bad := bad || 'delete_approved_allowed '; end if;
  r := hr_salary_exception_decide(xid, 'CANCELLED', 'test');
  if r <> 'CANCELLED' then bad := bad || 'cancel_failed '; end if;
  begin perform hr_salary_exception_decide(xid, 'APPROVED', null); exception when others then m5 := sqlerrm; end;
  if m5 = '-' then bad := bad || 'reapprove_cancelled_allowed '; end if;

  if bad <> '' then raise exception 'RESULT: FAIL %', bad; end if;
  raise exception 'RESULT: PASS salary exceptions (four-eyes, frozen after approval, cancel final)';
end $$;
