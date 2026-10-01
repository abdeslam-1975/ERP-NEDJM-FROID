-- Attendance import guard rights (rollback only). Expects the fixtures of the local runner: SUPER_ADMIN a2.01.
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
end $$;

do $$
declare
  v_site uuid;
  v_emp uuid;
  v_legend text;
  v_id uuid;
  e_manual text := '-';
  e_import text := '-';
  v_edit text := '-';
begin
  select id into v_site from public.ref_sites limit 1;
  select id into v_emp from public.hr_employees limit 1;
  select code into v_legend from public.ref_legendes limit 1;
  if v_site is null or v_emp is null or v_legend is null then
    raise exception 'RESULT: SKIP (site, employee or legend missing)';
  end if;

  set local role authenticated;
  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000001');

  -- A user entry from the grid goes through the import guard and must be saved.
  begin
    insert into public.hr_attendance (employee_id, site_id, work_date, legend_code)
    values (v_emp, v_site, date '2031-03-03', v_legend)
    returning id into v_id;
    update public.hr_attendance set notes = 'audit' where id = v_id;
    select notes into v_edit from public.hr_attendance where id = v_id;
  exception when others then e_manual := sqlstate || ' ' || sqlerrm;
  end;

  -- Outside the import circuit an imported value is still refused.
  begin
    insert into public.hr_attendance (employee_id, site_id, work_date, legend_code, source_code, import_batch_id)
    values (v_emp, v_site, date '2031-03-04', v_legend, 'IMPORT', gen_random_uuid());
  exception when others then e_import := sqlstate || ' ' || sqlerrm;
  end;
  reset role;

  if e_manual <> '-' or v_edit is distinct from 'audit' or e_import not like '42501 Présence importée%' then
    raise exception 'RESULT: FAIL manual=% edit=% import=%', e_manual, v_edit, e_import;
  end if;
  raise notice 'RESULT: PASS attendance import guard (user entry saved and edited, imported value outside the circuit still refused)';
end;
$$;
