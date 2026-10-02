-- Personal interface arrangement (rollback only). Expects the fixtures of the local runner: SUPER_ADMIN a2.01, ADMIN_RH a2.02.
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
end $$;

do $$
declare
  r_rh_own integer;
  r_rh_sees_sa integer;
  r_rh_steal text := '-';
  r_bad_key text := '-';
  r_bad_group text := '-';
  r_bad_sort text := '-';
  r_sa_update_rh integer;
  r_rh_global integer;
  r_upsert integer;
  r_anon boolean;
begin
  set local role authenticated;

  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000001');
  insert into public.sys_ui_user_order (item_key, sort_order, group_key) values ('nav.finance', 10, 'group.pilotage');

  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000002');
  insert into public.sys_ui_user_order (item_key, sort_order) values ('rh.paie', 10), ('rh.employes', 20);
  insert into public.sys_ui_user_order (item_key, sort_order) values ('rh.paie', 30)
    on conflict (user_id, item_key) do update set sort_order = excluded.sort_order;
  select sort_order into r_upsert from public.sys_ui_user_order where item_key = 'rh.paie';
  select count(*) into r_rh_own from public.sys_ui_user_order;
  select count(*) into r_rh_sees_sa from public.sys_ui_user_order where user_id = 'a2000000-0000-4000-8000-000000000001';
  begin
    insert into public.sys_ui_user_order (user_id, item_key, sort_order) values ('a2000000-0000-4000-8000-000000000003', 'nav.rh', 10);
  exception when others then r_rh_steal := sqlstate;
  end;
  begin
    insert into public.sys_ui_user_order (item_key, sort_order) values ('Nav;drop', 10);
  exception when others then r_bad_key := sqlstate;
  end;
  begin
    insert into public.sys_ui_user_order (item_key, sort_order, group_key) values ('nav.rh', 10, 'pilotage');
  exception when others then r_bad_group := sqlstate;
  end;
  begin
    insert into public.sys_ui_user_order (item_key, sort_order) values ('nav.clients', -5);
  exception when others then r_bad_sort := sqlstate;
  end;
  begin
    insert into public.sys_ui_item_overrides (item_key, sort_order) values ('nav.rh', 5);
    r_rh_global := 1;
  exception when others then r_rh_global := 0;
  end;

  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000001');
  update public.sys_ui_user_order set sort_order = 99 where user_id = 'a2000000-0000-4000-8000-000000000002';
  get diagnostics r_sa_update_rh = row_count;
  reset role;

  r_anon := has_table_privilege('anon', 'public.sys_ui_user_order', 'select');

  if r_upsert <> 30 or r_rh_own <> 2 or r_rh_sees_sa <> 0 or r_rh_steal <> '42501' or r_bad_key <> '23514'
     or r_bad_group <> '23514' or r_bad_sort <> '23514' or r_rh_global <> 0 or r_sa_update_rh <> 0 or r_anon then
    raise exception 'RESULT: FAIL upsert=% own=% sees_sa=% steal=% bad_key=% bad_group=% bad_sort=% rh_global=% sa_upd_rh=% anon=%',
      r_upsert, r_rh_own, r_rh_sees_sa, r_rh_steal, r_bad_key, r_bad_group, r_bad_sort, r_rh_global, r_sa_update_rh, r_anon;
  end if;
  raise notice 'RESULT: PASS ui user order (own rows only, invalid keys / groups / positions refused, global order untouched by a user, anon has no access)';
end;
$$;
