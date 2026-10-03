do $$
declare
  emp uuid; site uuid; usr uuid; bid uuid := gen_random_uuid(); n int; bad text := '';
begin
  select id into site from ref_sites order by created_at limit 1;
  select id into usr from sys_users order by created_at limit 1;
  if site is null or usr is null then raise exception 'RESULT: SKIP (no site or user)'; end if;
  insert into hr_employees (matricule, last_name, first_name)
    values ('ZZ-ALIAS-TEST', 'FREDJ', 'SAID ZZ') returning id into emp;
  insert into hr_attendance_import_batches (
    id, batch_no, format, period_from, period_to, reference_year, site_ids, nature, provenance_kind, provenance_detail,
    storage_path, file_name, mime, size_bytes, sha256, lines_expected, sealed_at, created_by
  ) values (
    bid, 'ZZ-ALIAS', 'GRID', date '2026-01-01', date '2026-01-01', 2026, array[site], 'REPRISE', 'OTHER', 'test alias',
    bid::text || '/source.xlsx', 'zz.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1,
    repeat('a', 64), 2, now(), usr
  );
  insert into hr_attendance_import_lines (batch_id, line_no, source_ref, matricule, last_name, first_name, work_date, source_code)
  values (bid, 1, 'L1-D1', '?FRADJ SAID ZZ', 'FRADJ', 'SAID ZZ', date '2026-01-01', 'MS'),
         (bid, 2, 'L1-D2', '?FRADJ SAID ZZ', 'Fradj', 'Saïd-ZZ', date '2026-01-02', 'MS');

  -- Unknown name: rejected.
  perform hr_attendance_import_analyze_internal(bid);
  select count(*) into n from hr_attendance_import_lines
   where batch_id = bid and employee_id is null and 'UNKNOWN_MATRICULE' = any (errors);
  if n <> 2 then bad := bad || format('before=%s ', n); end if;

  -- Tied by hand: both spellings of the name reach the employee, without a name warning.
  insert into hr_attendance_name_aliases (name_key, source_name, employee_id, created_by)
    values (hr_att_import_name_key('FRADJ SAID ZZ'), 'FRADJ SAID ZZ', emp, usr);
  perform hr_attendance_import_analyze_internal(bid);
  select count(*) into n from hr_attendance_import_lines
   where batch_id = bid and employee_id = emp
     and not ('UNKNOWN_MATRICULE' = any (errors)) and not ('NAME_MISMATCH' = any (warnings));
  if n <> 2 then bad := bad || format('after=%s ', n); end if;

  -- Untied: rejected again.
  delete from hr_attendance_name_aliases where employee_id = emp;
  perform hr_attendance_import_analyze_internal(bid);
  select count(*) into n from hr_attendance_import_lines where batch_id = bid and employee_id is null;
  if n <> 2 then bad := bad || format('untied=%s ', n); end if;

  if bad = '' then raise exception 'RESULT: PASS'; end if;
  raise exception 'RESULT: FAIL %', bad;
end $$;
