-- Personal HR bar sections (rollback only). Expects the fixtures of the local runner: SUPER_ADMIN a2.01, ADMIN_RH a2.02.
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
end $$;

do $$
declare
  r_label text;
  r_group integer;
  r_sees_other integer;
  r_blank text := '-';
  r_long text := '-';
  r_deleted integer;
begin
  set local role authenticated;

  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000001');
  insert into public.sys_ui_user_order (item_key, sort_order, label_fr) values ('rh_sections.xadmin1', 10, 'Mes outils');

  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000002');
  insert into public.sys_ui_user_order (item_key, sort_order, label_fr) values ('rh_sections.xab12cd', 70, 'Rarement');
  insert into public.sys_ui_user_order (item_key, sort_order, group_key) values ('rh.couts', 10, 'group.rh_xab12cd');
  update public.sys_ui_user_order set label_fr = 'Rarement utilisés' where item_key = 'rh_sections.xab12cd';
  select label_fr into r_label from public.sys_ui_user_order where item_key = 'rh_sections.xab12cd';
  select count(*) into r_group from public.sys_ui_user_order where group_key = 'group.rh_xab12cd';
  select count(*) into r_sees_other from public.sys_ui_user_order where item_key = 'rh_sections.xadmin1';
  begin
    insert into public.sys_ui_user_order (item_key, sort_order, label_fr) values ('rh_sections.xblank1', 10, '   ');
  exception when others then r_blank := sqlstate;
  end;
  begin
    insert into public.sys_ui_user_order (item_key, sort_order, label_fr) values ('rh_sections.xlong01', 10, repeat('a', 81));
  exception when others then r_long := sqlstate;
  end;
  delete from public.sys_ui_user_order where item_key = 'rh_sections.xab12cd';
  get diagnostics r_deleted = row_count;
  reset role;

  if r_label <> 'Rarement utilisés' or r_group <> 1 or r_sees_other <> 0 or r_blank <> '23514' or r_long <> '23514'
     or r_deleted <> 1 then
    raise exception 'RESULT: FAIL label=% group=% sees_other=% blank=% long=% deleted=%',
      r_label, r_group, r_sees_other, r_blank, r_long, r_deleted;
  end if;
  raise notice 'RESULT: PASS ui user labels (own named sections, renamed and deleted, blank / too long names refused, other users'' sections not visible)';
end;
$$;
