-- Audit register counters (rollback only). Expects the fixtures of the local runner:
-- SUPER_ADMIN a2.01, ADMIN_RH a2.02, ADMIN_FINANCE a2.03.
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
end $$;

do $$
declare
  yy text := to_char((now() at time zone 'Africa/Algiers'), 'YY');
  n1 text;
  n2 text;
  n3 text;
  i1 text;
  v_denied text := '-';
  v_unknown text := '-';
  v_shared text;
begin
  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000001');
  v_shared := public.hr_next_doc_number('VIR');

  set local session_replication_role = replica;
  -- The register already holds 000041/YY: numbering continues after it, not after the correspondences.
  insert into public.hr_payroll_transfer_batches (batch_no, period_year, period_month, mode, file_format, file_name, content, sha256, line_count, total_amount)
  values ('000041/' || yy, 2026, 1, 'CCP', 'TXT', 'audit.txt', 'x', repeat('0', 64), 1, 1);

  set local session_replication_role = origin;
  n1 := public.hr_next_register_number('VIR');
  n2 := public.hr_next_register_number('VIR');
  i1 := public.hr_next_register_number('ITM');

  -- A number taken outside the counter is still skipped.
  set local session_replication_role = replica;
  insert into public.hr_payroll_transfer_batches (batch_no, period_year, period_month, mode, file_format, file_name, content, sha256, line_count, total_amount)
  values ('000060/' || yy, 2026, 2, 'CCP', 'TXT', 'audit2.txt', 'y', repeat('1', 64), 1, 1);
  set local session_replication_role = origin;
  n3 := public.hr_next_register_number('VIR');

  begin
    perform public.hr_next_register_number('XXX');
  exception when others then v_unknown := sqlstate;
  end;

  -- ADMIN_RH without payroll rights in this fixture set: refused only if it lacks them.
  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000002');
  if not public.erp_can_write_hr_salary_values('a2000000-0000-4000-8000-000000000002') then
    begin
      perform public.hr_next_register_number('VIR');
    exception when others then v_denied := sqlstate;
    end;
  else
    v_denied := 'n/a';
  end if;

  if n1 <> '000042/' || yy or n2 <> '000043/' || yy or n3 <> '000061/' || yy
     or i1 !~ ('^[0-9]{6}/' || yy || '$') or v_unknown <> '23514' or v_denied not in ('42501', 'n/a') then
    raise exception 'RESULT: FAIL n1=% n2=% n3=% itm=% unknown=% denied=% shared=%', n1, n2, n3, i1, v_unknown, v_denied, v_shared;
  end if;
  raise notice 'RESULT: PASS register counters (continues after register max, never repeats, skips numbers taken elsewhere, unknown register refused, rights=%; shared counter would have said %)', v_denied, v_shared;
end;
$$;
