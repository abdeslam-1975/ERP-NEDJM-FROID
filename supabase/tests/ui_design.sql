-- Interface design (rollback only). Expects the fixtures of the local runner: SUPER_ADMIN a2.01, ADMIN_RH a2.02.
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
end $$;

do $$
declare
  r_sa_theme text;
  r_bad_style text := '-';
  r_rh_theme integer;
  r_rh_own integer;
  r_rh_sees_sa integer;
  r_rh_steal text := '-';
  r_sa_update_rh integer;
  r_bad_mode text := '-';
  r_anon boolean;
begin
  set local role authenticated;

  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000001');
  update public.sys_ui_theme
     set preset = 'moderne', radius = 'xl', button_shape = 'pill', button_style = 'gradient', table_style = 'striped',
         density = 'comfortable', card_style = 'glass', font_latin = 'inter', font_arabic = 'tajawal',
         animations = true, default_mode = 'dark'
   where id = 1;
  select button_style into r_sa_theme from public.sys_ui_theme where id = 1;
  begin
    update public.sys_ui_theme set button_style = 'neon' where id = 1;
  exception when others then r_bad_style := sqlstate;
  end;
  insert into public.sys_ui_user_prefs (mode, density) values ('light', 'compact');

  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000002');
  update public.sys_ui_theme set radius = 'none' where id = 1;
  get diagnostics r_rh_theme = row_count;
  insert into public.sys_ui_user_prefs (mode) values ('dark');
  select count(*) into r_rh_own from public.sys_ui_user_prefs;
  select count(*) into r_rh_sees_sa from public.sys_ui_user_prefs where user_id = 'a2000000-0000-4000-8000-000000000001';
  begin
    insert into public.sys_ui_user_prefs (user_id, mode) values ('a2000000-0000-4000-8000-000000000003', 'dark');
  exception when others then r_rh_steal := sqlstate;
  end;
  begin
    update public.sys_ui_user_prefs set mode = 'neon';
  exception when others then r_bad_mode := sqlstate;
  end;

  perform pg_temp.as_user('a2000000-0000-4000-8000-000000000001');
  update public.sys_ui_user_prefs set density = 'normal' where user_id = 'a2000000-0000-4000-8000-000000000002';
  get diagnostics r_sa_update_rh = row_count;
  reset role;

  r_anon := has_table_privilege('anon', 'public.sys_ui_user_prefs', 'select');

  if r_sa_theme <> 'gradient' or r_bad_style <> '23514' or r_rh_theme <> 0
     or r_rh_own <> 1 or r_rh_sees_sa <> 0 or r_rh_steal <> '42501' or r_bad_mode <> '23514'
     or r_sa_update_rh <> 0 or r_anon then
    raise exception 'RESULT: FAIL sa=% bad_style=% rh_theme=% own=% sees_sa=% steal=% bad_mode=% sa_upd_rh=% anon=%',
      r_sa_theme, r_bad_style, r_rh_theme, r_rh_own, r_rh_sees_sa, r_rh_steal, r_bad_mode, r_sa_update_rh, r_anon;
  end if;
  raise notice 'RESULT: PASS ui design (SA sets the look, invalid values refused, RH cannot change the look, each user reads / writes only own display prefs, anon has no access)';
end;
$$;
