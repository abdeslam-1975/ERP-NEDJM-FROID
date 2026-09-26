do $$
declare
  rh uuid; emp uuid; d1 date := date '2027-03-01'; req uuid; corr uuid; ex uuid; n int; st text; bad text := '';
begin
  select usr.user_id into rh from sys_user_site_roles usr join sys_roles r on r.id = usr.role_id where r.code = 'ADMIN_RH' limit 1;
  if rh is null then
    select usr.user_id into rh from sys_user_site_roles usr join sys_roles r on r.id = usr.role_id where r.code = 'SUPER_ADMIN' limit 1;
  end if;
  select c.employee_id into emp from hr_contracts c
   where c.affectation_principale and c.status in ('ACTIVE', 'DRAFT') and c.start_date <= d1 and (c.end_date is null or c.end_date >= date '2027-04-30')
     and not exists (select 1 from hr_employee_exits x where x.employee_id = c.employee_id and x.status <> 'CANCELLED')
   order by c.start_date desc limit 1;
  if emp is null then raise exception 'RESULT: SKIP (no open main contract covering 2027-03)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', rh, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', rh::text, true);

  insert into hr_leave_requests (employee_id, kind, start_date, end_date, days, requested_by)
    values (emp, 'ANNUAL', d1, d1 + 4, 5, rh) returning id into req;
  corr := hr_leave_decide(req, 'APPROVED', 'ok');
  select count(*) into n from hr_attendance where correspondence_id = corr;
  if corr is null or n = 0 then bad := bad || 'approve_no_attendance '; end if;

  perform hr_leave_decide(req, 'CANCELLED', null);
  select count(*) into n from hr_attendance where correspondence_id = corr;
  if n <> 0 then bad := bad || 'cancel_kept_attendance '; end if;
  begin
    perform hr_leave_decide(req, 'APPROVED', null);
    bad := bad || 'cancelled_to_approved_allowed ';
  exception when others then null;
  end;

  insert into hr_employee_exits (employee_id, exit_date, reason_code, settlement_lines)
    values (emp, d1 + 15, 'RESIGNATION', jsonb_build_array(jsonb_build_object('code', 'ICP', 'label_fr', 'x', 'label_ar', 'y', 'category', '1', 'amount', 1000)))
    returning id into ex;
  begin
    insert into hr_employee_exits (employee_id, exit_date, reason_code) values (emp, d1 + 16, 'OTHER');
    bad := bad || 'second_open_exit_allowed ';
  exception when unique_violation then null;
  end;
  perform hr_exit_set_status(ex, 'VALIDATED');
  select count(*) into n from hr_contracts where employee_id = emp and status <> 'ENDED' and start_date <= d1 + 15;
  if n <> 0 then bad := bad || 'contracts_open_after_exit '; end if;
  perform hr_exit_set_status(ex, 'CANCELLED');
  select employment_status into st from hr_employees where id = emp;

  if bad <> '' then raise exception 'RESULT: FAIL %', bad; end if;
  raise exception 'RESULT: PASS leave & exit flow (attendance posting, cancel, single open exit, contracts closed; status after cancel=%)', st;
end $$;
