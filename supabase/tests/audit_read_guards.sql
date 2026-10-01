-- Audit read guards (rollback only). Expects the fixtures of the local runner:
-- SUPER_ADMIN a2.01, ADMIN_RH a2.02 (no contract / finance / purchase rights), ADMIN_FINANCE a2.03.
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
end $$;

create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'ERR:' || sqlstate || ':' || sqlerrm;
end $$;

grant execute on function pg_temp.try(text) to authenticated;

do $$
declare
  v_contract uuid;
  v_item uuid;
  v_account uuid;
  v_type text;
  r_rh_contract text;
  r_rh_item text;
  r_rh_account text;
  r_fin_contract text;
  r_fin_item text;
  r_fin_account text;
  r_sa_stats text;
  r_service text;
  r_private text;
  r_exposed text;
  v_account2 uuid;
  r_definer_over text;
  r_definer_ok text;
begin
  select id into v_contract from public.ref_contracts limit 1;
  select id into v_item from public.contract_items where contract_id = v_contract limit 1;
  if v_contract is null or v_item is null then
    raise exception 'RESULT: SKIP (no contract with items)';
  end if;
  select coalesce(substring(pg_get_constraintdef(oid) from '''([A-Z_]+)'''), 'BANK') into v_type
  from pg_constraint where conrelid = 'public.fin_accounts'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%account_type%'
  limit 1;
  insert into public.fin_accounts (code, name, account_type) values ('AUD-RG', 'Audit read guard', coalesce(v_type, 'BANK'))
  returning id into v_account;

  set local role authenticated;

  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000002');
  r_rh_contract := pg_temp.try(format('select public.ref_contract_balance(%L)::text', v_contract));
  r_rh_item := pg_temp.try(format('select public.ref_contract_item_consumed_qty(%L)::text', v_item));
  r_rh_account := pg_temp.try(format('select public.fin_account_balance(%L)::text', v_account));
  r_private := pg_temp.try(format('select private.ref_contract_balance(%L)::text', v_contract));

  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000003');
  r_fin_contract := pg_temp.try(format('select (public.ref_contract_balance(%L) is not null)::text', v_contract));
  r_fin_item := pg_temp.try(format('select public.ref_contract_item_consumed_qty(%L)::text', v_item));
  r_fin_account := pg_temp.try(format('select public.fin_account_balance(%L)::text', v_account));

  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000001');
  r_sa_stats := pg_temp.try(format('select (public.ref_contract_stats(%L) is not null)::text', v_contract));

  reset role;
  set local role service_role;
  r_service := pg_temp.try(format('select public.fin_account_balance(%L)::text', v_account));
  reset role;

  select coalesce(string_agg(nspname, ','), 'none') into r_exposed
  from pg_namespace where nspname = 'private' and has_schema_privilege('anon', oid, 'USAGE');

  -- A definer write function reads balances through the guarded wrapper as its owner: no refusal.
  insert into public.fin_accounts (code, name, account_type, opening_balance) values ('AUD-RG2', 'Audit read guard 2', coalesce(v_type, 'BANK'), 100)
  returning id into v_account2;
  set local role authenticated;
  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000001');
  r_definer_over := pg_temp.try(format('select public.fin_post_transfer(%L, %L, 1000, current_date, %L)::text', v_account2, v_account, 'audit'));
  r_definer_ok := pg_temp.try(format('select (public.fin_post_transfer(%L, %L, 40, current_date, %L) ? %L)::text', v_account2, v_account, 'audit', 'transfer_group_id'));
  reset role;

  if r_rh_contract not like 'ERR:42501:%' or r_rh_item not like 'ERR:42501:%' or r_rh_account not like 'ERR:42501:%'
     or r_fin_contract <> 'true' or r_fin_item like 'ERR:%' or r_fin_account like 'ERR:%'
     or r_sa_stats <> 'true' or r_service like 'ERR:%' or r_exposed <> 'none'
     or r_definer_over not like '%Insufficient source balance%' or r_definer_ok <> 'true' then
    raise exception 'RESULT: FAIL rh=%/%/% fin=%/%/% sa=% service=% anon_private=% definer=%/%',
      r_rh_contract, r_rh_item, r_rh_account, r_fin_contract, r_fin_item, r_fin_account, r_sa_stats, r_service, r_exposed,
      r_definer_over, r_definer_ok;
  end if;
  raise notice 'RESULT: PASS read guards (rh refused contract/item/account, finance and SA allowed, service role allowed, private not granted to anon, definer transfer reads the balance through the wrapper; rh direct private call=%)', r_private;
end;
$$;
