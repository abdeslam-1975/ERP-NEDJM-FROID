-- Caisse opening balances: SUPER_ADMIN and ADMIN_FINANCE manage them
-- like other caisse admin actions. Delegated manage_openings stays for others.

begin;

create or replace function public.caisse_can_manage_openings()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.erp_is_super_admin(auth.uid())
    or exists (
      select 1
      from public.sys_user_site_roles ur
      join public.sys_roles ro on ro.id = ur.role_id
      where ur.user_id = auth.uid()
        and ro.code = 'ADMIN_FINANCE'
    )
    or exists (
      select 1
      from public.caisse_rights r
      where r.user_id = auth.uid()
        and r.manage_openings
    );
$$;

revoke all on function public.caisse_can_manage_openings() from public;
grant execute on function public.caisse_can_manage_openings() to authenticated;

commit;
