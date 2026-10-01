-- Interface control (rollback only). Expects the fixtures of the local runner: SUPER_ADMIN a2.01, ADMIN_RH a2.02.
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
end $$;

do $$
declare
  v_rh_role uuid;
  r_rh_read integer;
  r_rh_insert text := '-';
  r_rh_theme integer;
  r_sa_hide integer;
  r_sa_override text;
  r_sa_theme text;
  r_locked text := '-';
  r_color text := '-';
  r_anon boolean;
  r_audit integer;
begin
  select id into v_rh_role from public.sys_roles where code = 'ADMIN_RH';
  if v_rh_role is null then
    raise exception 'RESULT: SKIP (no ADMIN_RH role)';
  end if;

  set local role authenticated;

  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000001');
  insert into public.sys_ui_role_hidden (role_id, item_key) values (v_rh_role, 'nav.finance');
  select count(*) into r_sa_hide from public.sys_ui_role_hidden where role_id = v_rh_role and item_key = 'nav.finance';
  insert into public.sys_ui_item_overrides (item_key, sort_order, label_fr) values ('rh.contrats', 5, 'Contrats de travail')
  on conflict (item_key) do update set sort_order = excluded.sort_order, label_fr = excluded.label_fr;
  select label_fr into r_sa_override from public.sys_ui_item_overrides where item_key = 'rh.contrats';
  update public.sys_ui_theme set brand_color = '#0f766e', app_name = 'NEDJM' where id = 1;
  select brand_color into r_sa_theme from public.sys_ui_theme where id = 1;
  begin
    insert into public.sys_ui_role_hidden (role_id, item_key) values (v_rh_role, 'nav.parametres');
  exception when others then r_locked := sqlstate;
  end;
  begin
    update public.sys_ui_theme set sidebar_color = 'red;}body{display:none' where id = 1;
  exception when others then r_color := sqlstate;
  end;

  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000002');
  select count(*) into r_rh_read from public.sys_ui_role_hidden where role_id = v_rh_role;
  begin
    insert into public.sys_ui_role_hidden (role_id, item_key) values (v_rh_role, 'nav.achats');
  exception when others then r_rh_insert := sqlstate;
  end;
  update public.sys_ui_theme set brand_color = '#000000' where id = 1;
  get diagnostics r_rh_theme = row_count;
  reset role;

  r_anon := has_table_privilege('anon', 'public.sys_ui_role_hidden', 'select')
         or has_table_privilege('anon', 'public.sys_ui_theme', 'select');
  select count(*) into r_audit from public.sys_audit_logs
  where table_name in ('sys_ui_role_hidden', 'sys_ui_item_overrides', 'sys_ui_theme') and occurred_at >= now() - interval '1 minute';

  if r_sa_hide <> 1 or r_sa_override <> 'Contrats de travail' or r_sa_theme <> '#0f766e'
     or r_locked <> '23514' or r_color <> '23514'
     or r_rh_read <> 1 or r_rh_insert <> '42501' or r_rh_theme <> 0
     or r_anon or r_audit < 3 then
    raise exception 'RESULT: FAIL sa=%/%/% locked=% color=% rh=%/%/% anon=% audit=%',
      r_sa_hide, r_sa_override, r_sa_theme, r_locked, r_color, r_rh_read, r_rh_insert, r_rh_theme, r_anon, r_audit;
  end if;
  raise notice 'RESULT: PASS ui control (SA hides / renames / recolours, home and settings cannot be hidden, colours validated, RH reads but cannot write, anon has no access, changes audited)';
end;
$$;
