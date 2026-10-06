-- Removing a role grant: same rules as granting it (erp_guard_role_assignment),
-- plus the last active SUPER_ADMIN grant can never be removed.

create or replace function public.erp_guard_role_unassignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_level int;
  v_code text;
  v_actor uuid := auth.uid();
begin
  select hierarchy_level, code into v_level, v_code
  from public.sys_roles where id = old.role_id;

  if v_code = 'SUPER_ADMIN' and not exists (
    select 1
    from public.sys_user_site_roles usr
    join public.sys_roles r on r.id = usr.role_id
    join public.sys_users u on u.id = usr.user_id
    where r.code = 'SUPER_ADMIN'
      and usr.site_id is null
      and u.status = 'ACTIVE'
      and usr.id <> old.id
  ) then
    raise exception 'Cannot remove the last SUPER_ADMIN';
  end if;

  -- Service role / cascades run without auth.uid(): only user sessions are restricted.
  if v_actor is not null
     and v_level >= 80
     and not public.erp_is_super_admin(v_actor) then
    raise exception 'Only SUPER_ADMIN can remove roles of level >= 80';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_sys_user_site_roles_unassign_guard on public.sys_user_site_roles;
create trigger trg_sys_user_site_roles_unassign_guard
  before delete on public.sys_user_site_roles
  for each row execute function public.erp_guard_role_unassignment();
