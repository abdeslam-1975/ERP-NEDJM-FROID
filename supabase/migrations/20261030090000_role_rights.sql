-- « Droits par rôle » (Paramètres) :
--  1. sys_roles.sites_only : un rôle « limité à ses chantiers » ne peut être donné que sur des chantiers précis
--     (sys_user_site_roles.site_id non nul) ; erp_can_see_site limite alors les données à ces chantiers.
--  2. sys_ui_catalog_seen : éléments de l'interface déjà examinés par le SUPER_ADMIN. Un élément ajouté plus tard
--     au catalogue (src/lib/ui/registry.ts) reste fermé pour les rôles tant qu'il n'a pas été examiné.

alter table public.sys_roles add column if not exists sites_only boolean not null default false;

alter table public.sys_roles drop constraint if exists sys_roles_sites_only_check;
alter table public.sys_roles add constraint sys_roles_sites_only_check
  check (not sites_only or (site_scoped_allowed and code <> 'SUPER_ADMIN'));

create or replace function public.erp_guard_role_sites_only()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  if new.site_id is not null then
    return new;
  end if;
  select code into v_code from public.sys_roles where id = new.role_id and sites_only;
  if found then
    raise exception 'Le rôle % est limité à ses chantiers : choisissez un chantier.', v_code
      using errcode = 'P0001', hint = 'sites_only';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sys_user_site_roles_sites_only on public.sys_user_site_roles;
create trigger trg_sys_user_site_roles_sites_only
  before insert or update of role_id, site_id on public.sys_user_site_roles
  for each row execute function public.erp_guard_role_sites_only();

create or replace function public.erp_guard_role_sites_only_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  if new.sites_only and not old.sites_only then
    select count(*) into v_count
    from public.sys_user_site_roles
    where role_id = new.id and site_id is null;
    if v_count > 0 then
      raise exception '% compte(s) ont ce rôle sur tous les chantiers : attribuez-leur des chantiers précis d''abord.', v_count
        using errcode = 'P0001', hint = 'sites_only_global';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sys_roles_sites_only_change on public.sys_roles;
create trigger trg_sys_roles_sites_only_change
  before update of sites_only on public.sys_roles
  for each row execute function public.erp_guard_role_sites_only_change();

create table if not exists public.sys_ui_catalog_seen (
  item_key text primary key check (item_key ~ '^[a-z][a-z0-9_]*\.[a-z0-9_]+$'),
  seen_at timestamptz not null default now(),
  seen_by uuid references public.sys_users(id) on delete set null default auth.uid()
);

alter table public.sys_ui_catalog_seen enable row level security;
revoke all on public.sys_ui_catalog_seen from public, anon;
grant select, insert, update, delete on public.sys_ui_catalog_seen to authenticated;
grant all on public.sys_ui_catalog_seen to service_role;

drop policy if exists sys_ui_catalog_seen_read on public.sys_ui_catalog_seen;
create policy sys_ui_catalog_seen_read on public.sys_ui_catalog_seen
  for select to authenticated using (exists (select 1 from public.sys_users u where u.id = auth.uid()));
drop policy if exists sys_ui_catalog_seen_write on public.sys_ui_catalog_seen;
create policy sys_ui_catalog_seen_write on public.sys_ui_catalog_seen
  for all to authenticated using (public.erp_is_super_admin()) with check (public.erp_is_super_admin());

notify pgrst, 'reload schema';
