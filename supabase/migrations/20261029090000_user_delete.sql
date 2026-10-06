-- Deletes an account (profile + login) in one transaction. Every table that records who did what references
-- sys_users without cascade, so an account that has already been used cannot be deleted (23503): deactivate it.
-- Roles, preferences and notification reads cascade; the last SUPER_ADMIN stays protected by its triggers.

create or replace function public.erp_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.sys_users where id = p_user_id;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.erp_delete_user(uuid) from public, anon, authenticated;
grant execute on function public.erp_delete_user(uuid) to service_role;
