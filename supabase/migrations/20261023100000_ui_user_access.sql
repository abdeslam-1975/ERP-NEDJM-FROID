-- Accès par compte : le super admin choisit, pour un utilisateur, les modules ouverts puis les onglets
-- de chaque module. Une ligne présente = liste blanche (tout le reste du périmètre est masqué) ; sans
-- ligne, le compte suit les choix de ses rôles (sys_ui_role_hidden). Comme pour les rôles, ce n'est pas
-- une permission : les données restent protégées par sys_permissions et la RLS.

begin;

create table if not exists public.sys_ui_user_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.sys_users(id) on delete cascade,
  allowed text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.sys_users(id) default auth.uid()
);

alter table public.sys_ui_user_access enable row level security;
revoke all on public.sys_ui_user_access from public, anon;
grant select, insert, update, delete on public.sys_ui_user_access to authenticated;
grant all on public.sys_ui_user_access to service_role;

create policy sys_ui_user_access_read on public.sys_ui_user_access
  for select to authenticated using (user_id = auth.uid() or public.erp_is_super_admin());
create policy sys_ui_user_access_write on public.sys_ui_user_access
  for all to authenticated using (public.erp_is_super_admin()) with check (public.erp_is_super_admin());

create trigger trg_sys_ui_user_access_audit after insert or update or delete on public.sys_ui_user_access
  for each row execute function public.sys_audit_row_change();
create trigger trg_sys_ui_user_access_updated before update on public.sys_ui_user_access
  for each row execute function public.erp_set_updated_at();

notify pgrst, 'reload schema';

commit;
