do $$
declare
  emp uuid; site uuid; om1 uuid; om2 uuid; om3 uuid; lv1 uuid; lv2 uuid; n int; bad text := '';
  m date := date '2027-05-01';
begin
  if not exists (select 1 from ref_legendes where code = 'MS' and is_active)
     or not exists (select 1 from ref_legendes where code = 'CA' and is_active) then
    raise exception 'RESULT: SKIP (legends MS / CA inactive)';
  end if;
  select id into site from ref_sites order by created_at limit 1;
  if site is null then raise exception 'RESULT: SKIP (no site)'; end if;
  insert into hr_employees (matricule, last_name, first_name)
    values ('ZZ-CHAIN-TEST', 'CHAIN', 'TEST') returning id into emp;

  -- Open OM: filled up to the end of its month.
  insert into hr_correspondences (employee_id, site_id, type_code, number, status_code, start_date, end_date)
    values (emp, site, 'OM', 'ZZ-OM-1', 'ISSUED', m + 2, null) returning id into om1;
  select count(*) into n from hr_attendance where correspondence_id = om1 and legend_code = 'MS';
  if n <> 29 then bad := bad || format('open_om=%s ', n); end if;

  -- Later leave closes the open OM the day before, nothing after the leave.
  insert into hr_correspondences (employee_id, site_id, type_code, number, status_code, start_date, end_date, payload)
    values (emp, site, 'LEAVE', 'ZZ-LV-1', 'ISSUED', m + 19, m + 23, '{"legend":"CA"}') returning id into lv1;
  select count(*) into n from hr_attendance where correspondence_id = om1;
  if n <> 17 then bad := bad || format('om_cut_by_leave=%s ', n); end if;
  select count(*) into n from hr_attendance where correspondence_id = lv1 and legend_code = 'CA';
  if n <> 5 then bad := bad || format('leave_days=%s ', n); end if;
  select count(*) into n from hr_attendance where employee_id = emp and work_date between m + 24 and m + 30;
  if n <> 0 then bad := bad || format('after_leave=%s ', n); end if;

  -- Later open OM replaces the remaining leave days (leave kept before it).
  insert into hr_correspondences (employee_id, site_id, type_code, number, status_code, start_date, end_date)
    values (emp, site, 'OM', 'ZZ-OM-2', 'ISSUED', m + 21, null) returning id into om2;
  select count(*) into n from hr_attendance where correspondence_id = lv1;
  if n <> 2 then bad := bad || format('leave_cut_by_om=%s ', n); end if;
  select count(*) into n from hr_attendance where correspondence_id = om2;
  if n <> 10 then bad := bad || format('om2=%s ', n); end if;

  -- Cancelling the leave: OM1 now runs until OM2 starts.
  update hr_correspondences set status_code = 'CANCELLED' where id = lv1;
  select count(*) into n from hr_attendance where correspondence_id = om1;
  if n <> 19 then bad := bad || format('om1_after_cancel=%s ', n); end if;
  select count(*) into n from hr_attendance where correspondence_id = lv1;
  if n <> 0 then bad := bad || format('cancelled_leave_kept=%s ', n); end if;

  -- Short OM inside a leave: only its own days are replaced.
  insert into hr_correspondences (employee_id, site_id, type_code, number, status_code, start_date, end_date, payload)
    values (emp, site, 'LEAVE', 'ZZ-LV-2', 'ISSUED', date '2027-06-01', date '2027-06-10', '{"legend":"CA"}') returning id into lv2;
  insert into hr_correspondences (employee_id, site_id, type_code, number, status_code, start_date, end_date)
    values (emp, site, 'OM', 'ZZ-OM-3', 'ISSUED', date '2027-06-04', date '2027-06-05') returning id into om3;
  select count(*) into n from hr_attendance where correspondence_id = lv2;
  if n <> 8 then bad := bad || format('leave_around_short_om=%s ', n); end if;
  select count(*) into n from hr_attendance where correspondence_id = om3;
  if n <> 2 then bad := bad || format('short_om=%s ', n); end if;
  select count(*) into n from hr_attendance where correspondence_id = om2;
  if n <> 10 then bad := bad || format('om2_before_leave2=%s ', n); end if;

  -- Manual entries are never overwritten.
  update hr_attendance set source_code = 'MANUAL', correspondence_id = null
   where correspondence_id = lv2 and work_date = date '2027-06-10';
  perform hr_extend_open_missions();
  select count(*) into n from hr_attendance where employee_id = emp and work_date = date '2027-06-10' and source_code = 'MANUAL';
  if n <> 1 then bad := bad || 'manual_overwritten '; end if;

  if bad <> '' then raise exception 'RESULT: FAIL %', bad; end if;
  raise exception 'RESULT: PASS mission/leave chain (open OM to month end, mutual cut by latest start, cancel restores, manual kept)';
end $$;
