-- Interface control: the super admin chooses, per role, which modules / tabs are shown, and sets the order,
-- the labels and the colours of the interface. The catalogue of items lives in the application
-- (src/lib/ui/registry.ts); these tables only store the choices. Hiding an item is not a permission:
-- data stays protected by sys_permissions and RLS.

create table public.sys_ui_role_hidden (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.sys_roles(id) on delete cascade,
  item_key text not null check (item_key ~ '^[a-z][a-z0-9_]*\.[a-z0-9_]+$'),
  created_at timestamptz not null default now(),
  created_by uuid references public.sys_users(id) default auth.uid(),
  unique (role_id, item_key),
  -- The home page, the settings hub and the interface screen always stay reachable.
  constraint sys_ui_role_hidden_locked check (item_key not in ('nav.home', 'nav.parametres', 'settings.interface'))
);

create table public.sys_ui_item_overrides (
  id uuid primary key default gen_random_uuid(),
  item_key text not null unique check (item_key ~ '^[a-z][a-z0-9_]*\.[a-z0-9_]+$'),
  sort_order integer check (sort_order between 0 and 100000),
  label_fr text check (label_fr is null or char_length(btrim(label_fr)) between 1 and 80),
  label_ar text check (label_ar is null or char_length(btrim(label_ar)) between 1 and 80),
  group_key text check (group_key is null or group_key ~ '^group\.[a-z0-9_]+$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.sys_users(id) default auth.uid()
);

create table public.sys_ui_theme (
  id smallint primary key default 1 check (id = 1),
  brand_color text check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$'),
  sidebar_color text check (sidebar_color is null or sidebar_color ~ '^#[0-9a-fA-F]{6}$'),
  app_name text check (app_name is null or char_length(btrim(app_name)) between 1 and 40),
  app_subtitle text check (app_subtitle is null or char_length(btrim(app_subtitle)) between 1 and 60),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.sys_users(id) default auth.uid()
);

insert into public.sys_ui_theme (id) values (1) on conflict (id) do nothing;

do $$
declare
  t text;
begin
  foreach t in array array['sys_ui_role_hidden', 'sys_ui_item_overrides', 'sys_ui_theme'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (exists (select 1 from public.sys_users u where u.id = auth.uid()))',
      t || '_read', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.erp_is_super_admin()) with check (public.erp_is_super_admin())',
      t || '_write', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.sys_audit_row_change()',
      'trg_' || t || '_audit', t);
  end loop;
end;
$$;

create trigger trg_sys_ui_item_overrides_updated before update on public.sys_ui_item_overrides
  for each row execute function public.erp_set_updated_at();
create trigger trg_sys_ui_theme_updated before update on public.sys_ui_theme
  for each row execute function public.erp_set_updated_at();

notify pgrst, 'reload schema';
