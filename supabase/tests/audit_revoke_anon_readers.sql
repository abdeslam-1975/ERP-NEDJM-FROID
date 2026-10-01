-- Audit phase 8: unguarded SECURITY DEFINER readers are no longer executable by anon, still by authenticated.
do $$
declare
  leaked text;
  missing text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into leaked
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.prosrc !~* '(auth\.uid|auth\.role|erp_has|_can_access|erp_can_|has_perm|current_user_id|is_super|erp_is_)';
  if leaked is not null then
    raise exception 'RESULT: FAIL anon can still execute unguarded definer functions: %', leaked;
  end if;

  select string_agg(f, ', ') into missing
  from unnest(array['public.ref_contract_balance(uuid)', 'public.fin_account_balance(uuid,date)',
                    'public.hr_payroll_period_status(uuid,date)', 'public.hr_first_open_payroll_month()']) f
  where not has_function_privilege('authenticated', f::regprocedure, 'EXECUTE');
  if missing is not null then
    raise exception 'RESULT: FAIL authenticated lost EXECUTE on: %', missing;
  end if;

  raise notice 'RESULT: PASS';
end;
$$;
