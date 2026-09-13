-- P1: Align RLS screen codes with Phase 1B navigation screens.
-- Dual acceptance: legacy codes (users, client_contracts) OR new codes
-- (param_users, ref_contracts). Mirror role grants so ADMIN_RH / FINANCE / GERANT work.

begin;

-- ---------------------------------------------------------------------------
-- Note: do NOT rewrite sys_screens.path for legacy codes — path is UNIQUE and
-- Phase 1B already registered param_users / ref_contracts on the new routes.
-- ---------------------------------------------------------------------------

-- Mirror grants: ADMIN_RH on legacy "users" (RLS still used this code)
insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select r.id, s.id, true, true, true, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code = 'ADMIN_RH'
  and s.code = 'users'
on conflict (role_id, screen_id) do update
set
  can_create = excluded.can_create,
  can_read = excluded.can_read,
  can_update = excluded.can_update,
  can_delete = excluded.can_delete,
  can_print = excluded.can_print,
  can_export = excluded.can_export;

-- Mirror grants: ADMIN_FINANCE + GERANT on legacy "client_contracts"
insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select r.id, s.id, true, true, true, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code in ('ADMIN_FINANCE', 'GERANT')
  and s.code = 'client_contracts'
on conflict (role_id, screen_id) do update
set
  can_create = excluded.can_create,
  can_read = excluded.can_read,
  can_update = excluded.can_update,
  can_delete = excluded.can_delete,
  can_print = excluded.can_print,
  can_export = excluded.can_export;

-- ---------------------------------------------------------------------------
-- Helper: permission on either new or legacy screen code
-- ---------------------------------------------------------------------------
create or replace function public.erp_has_perm_aliased(
  p_primary text,
  p_legacy text,
  p_action public.rbac_action,
  p_site uuid default null,
  p_uid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.erp_has_perm(p_primary, p_action, p_site, p_uid)
      or public.erp_has_perm(p_legacy, p_action, p_site, p_uid);
$$;

grant execute on function public.erp_has_perm_aliased(text, text, public.rbac_action, uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- sys_users / sys_user_site_roles: users OR param_users
-- ---------------------------------------------------------------------------
drop policy if exists sys_users_read on public.sys_users;
create policy sys_users_read on public.sys_users for select to authenticated
  using (
    id = auth.uid()
    or public.erp_has_perm_aliased('param_users', 'users', 'read', null)
  );

drop policy if exists sys_users_write on public.sys_users;
create policy sys_users_write on public.sys_users for all to authenticated
  using (public.erp_has_perm_aliased('param_users', 'users', 'update', null))
  with check (public.erp_has_perm_aliased('param_users', 'users', 'update', null));

-- Narrow self-service RPCs (no broad self-UPDATE policy on sys_users)
create or replace function public.sys_touch_login()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.sys_users
  set last_login_at = now()
  where id = auth.uid();
end;
$$;

create or replace function public.sys_clear_must_reset_password()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.sys_users
  set must_reset_password = false
  where id = auth.uid();
end;
$$;

grant execute on function public.sys_touch_login() to authenticated;
grant execute on function public.sys_clear_must_reset_password() to authenticated;

drop policy if exists sys_user_site_roles_read on public.sys_user_site_roles;
create policy sys_user_site_roles_read on public.sys_user_site_roles for select to authenticated
  using (
    user_id = auth.uid()
    or public.erp_has_perm_aliased('param_users', 'users', 'read', site_id)
  );

drop policy if exists sys_user_site_roles_write on public.sys_user_site_roles;
create policy sys_user_site_roles_write on public.sys_user_site_roles for all to authenticated
  using (public.erp_has_perm_aliased('param_users', 'users', 'update', site_id))
  with check (public.erp_has_perm_aliased('param_users', 'users', 'update', site_id));

-- ---------------------------------------------------------------------------
-- ref_contracts / contract_items: ref_contracts OR client_contracts
-- ---------------------------------------------------------------------------
drop policy if exists ref_contracts_read on public.ref_contracts;
create policy ref_contracts_read on public.ref_contracts for select to authenticated
  using (
    public.erp_can_see_site(site_id)
    and public.erp_has_perm_aliased('ref_contracts', 'client_contracts', 'read', site_id)
  );

drop policy if exists ref_contracts_write on public.ref_contracts;
create policy ref_contracts_write on public.ref_contracts for all to authenticated
  using (
    public.erp_has_perm_aliased('ref_contracts', 'client_contracts', 'update', site_id)
  )
  with check (
    public.erp_has_perm_aliased('ref_contracts', 'client_contracts', 'update', site_id)
  );

drop policy if exists contract_items_read on public.contract_items;
create policy contract_items_read on public.contract_items for select to authenticated
  using (
    exists (
      select 1 from public.ref_contracts c
      where c.id = contract_id
        and public.erp_can_see_site(c.site_id)
        and public.erp_has_perm_aliased('ref_contracts', 'client_contracts', 'read', c.site_id)
    )
  );

drop policy if exists contract_items_write on public.contract_items;
create policy contract_items_write on public.contract_items for all to authenticated
  using (
    exists (
      select 1 from public.ref_contracts c
      where c.id = contract_id
        and public.erp_has_perm_aliased('ref_contracts', 'client_contracts', 'update', c.site_id)
    )
  )
  with check (
    exists (
      select 1 from public.ref_contracts c
      where c.id = contract_id
        and public.erp_has_perm_aliased('ref_contracts', 'client_contracts', 'update', c.site_id)
    )
  );

commit;
