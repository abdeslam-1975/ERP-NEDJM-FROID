-- Delegated right to manage Affectation / Matricule / Unité dropdowns.
-- SUPER_ADMIN and ADMIN_FINANCE always can; others need manage_lists.

begin;

alter table public.caisse_rights
  add column if not exists manage_lists boolean not null default false;

create or replace function public.caisse_can_manage_lists()
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
        and r.manage_lists
    );
$$;

revoke all on function public.caisse_can_manage_lists() from public;
grant execute on function public.caisse_can_manage_lists() to authenticated;

drop policy if exists caisse_lists_write on public.caisse_lists;
create policy caisse_lists_write on public.caisse_lists
  for all to authenticated
  using (public.caisse_can_manage_lists())
  with check (public.caisse_can_manage_lists());

grant select, insert, update, delete on public.caisse_lists to authenticated;

commit;
