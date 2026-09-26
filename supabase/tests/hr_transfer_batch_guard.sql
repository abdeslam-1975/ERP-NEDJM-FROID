do $$
declare
  boss uuid; v_run uuid; s record; d record; b uuid; st0 text; reopen_ok text;
  m1 text := '-'; m2 text := '-'; m3 text := '-'; m4 text := '-'; m5 text := '-'; m6 text := '-'; m7 text := '-'; m8 text := '-';
  live_after int; bad text := '';
begin
  select usr.user_id into boss from sys_user_site_roles usr join sys_roles ro on ro.id = usr.role_id where ro.code = 'SUPER_ADMIN' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', boss, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', boss::text, true);

  select r.id into v_run from hr_payroll_runs r where r.status_code = 'DRAFT' and exists (select 1 from hr_payroll_slips x where x.run_id = r.id) limit 1;
  if v_run is null then
    select r.id into v_run from hr_payroll_runs r where r.status_code = 'VALIDATED'
      and exists (select 1 from hr_payroll_slips x where x.run_id = r.id and not exists (select 1 from hr_payroll_transfer_lines l where l.slip_id = x.id and l.is_live))
      limit 1;
    if v_run is null then raise exception 'RESULT: SKIP (no payroll run with slips)'; end if;
    st0 := 'VALIDATED';
  else
    st0 := hr_payroll_run_transition(v_run, 'validate');
  end if;
  select x.id, x.employee_id, x.run_id, x.status_code into s from hr_payroll_slips x
   where x.run_id = v_run and not exists (select 1 from hr_payroll_transfer_lines l where l.slip_id = x.id and l.is_live) limit 1;
  if s.status_code <> 'VALIDATED' then bad := bad || 'slip_not_validated '; end if;
  select id, employee_id into d from hr_payroll_slips where status_code = 'DRAFT' limit 1;

  insert into hr_payroll_transfer_batches (batch_no, period_year, period_month, mode, file_format, file_name, content, sha256, line_count, total_amount)
  values ('ZZ-REGRESSION', 2026, 9, 'CCP', 'CCP_TXT_V1', 'x.txt', 'H...', 'abc', 1, 100) returning id into b;
  insert into hr_payroll_transfer_lines (batch_id, slip_id, employee_id, matricule, employee_name, account, amount)
  values (b, s.id, s.employee_id, '001', 'T', '000123456789', 100);

  begin insert into hr_payroll_transfer_lines (batch_id, slip_id, employee_id, matricule, employee_name, account, amount)
    values (b, s.id, s.employee_id, '001', 'T', '000123456789', 100); exception when others then m1 := sqlerrm; end;
  if m1 = '-' then bad := bad || 'duplicate_line_allowed '; end if;
  if d.id is not null then
    begin insert into hr_payroll_transfer_lines (batch_id, slip_id, employee_id, matricule, employee_name, account, amount)
      values (b, d.id, d.employee_id, '002', 'T', '000123456789', 100); exception when others then m2 := sqlerrm; end;
    if m2 = '-' then bad := bad || 'draft_slip_line_allowed '; end if;
  end if;
  begin update hr_payroll_transfer_batches set content = 'tampered' where id = b; exception when others then m3 := sqlerrm; end;
  if m3 = '-' then bad := bad || 'content_tamper_allowed '; end if;
  begin update hr_payroll_transfer_batches set status_code = 'DEPOSITED' where id = b; exception when others then m4 := sqlerrm; end;
  if m4 = '-' then bad := bad || 'deposit_without_ref_allowed '; end if;
  update hr_payroll_transfer_batches set status_code = 'DEPOSITED', deposit_ref = 'BRD-1' where id = b;
  begin perform hr_payroll_run_transition(s.run_id, 'reopen'); exception when others then m5 := sqlerrm; end;
  if m5 = '-' then bad := bad || 'reopen_with_live_batch_allowed '; end if;
  begin update hr_payroll_transfer_batches set status_code = 'CANCELLED' where id = b; exception when others then m6 := sqlerrm; end;
  if m6 = '-' then bad := bad || 'cancel_without_reason_allowed '; end if;
  update hr_payroll_transfer_batches set status_code = 'CANCELLED', cancelled_reason = 'test' where id = b;
  select count(*) into live_after from hr_payroll_transfer_lines where batch_id = b and is_live;
  if live_after <> 0 then bad := bad || 'lines_still_live_after_cancel '; end if;
  begin reopen_ok := hr_payroll_run_transition(s.run_id, 'reopen'); exception when others then reopen_ok := 'ERR ' || sqlerrm; end;
  if reopen_ok like 'ERR%' then bad := bad || 'reopen_after_cancel_blocked '; end if;
  begin update hr_payroll_transfer_batches set status_code = 'EXECUTED' where id = b; exception when others then m7 := sqlerrm; end;
  if m7 = '-' then bad := bad || 'cancelled_to_executed_allowed '; end if;
  begin delete from hr_payroll_transfer_batches where id = b; exception when others then m8 := sqlerrm; end;
  if m8 = '-' then bad := bad || 'batch_delete_allowed '; end if;

  if bad <> '' then raise exception 'RESULT: FAIL % (start=%)', bad, st0; end if;
  raise exception 'RESULT: PASS transfer batches (unique live slip, immutable file, deposit/cancel rules, payroll reopen lock)';
end $$;
