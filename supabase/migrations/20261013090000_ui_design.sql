-- Interface design: the super admin chooses the look of the application (preset, corners, buttons, tables,
-- density, cards, fonts, animations, default light / dark mode) and every user may keep a personal display
-- mode and density. While every look column is null the application keeps its original appearance (src/lib/ui/design.ts).

alter table public.sys_ui_theme
  add column if not exists preset text
    check (preset is null or preset in ('classique', 'moderne', 'minimal', 'sombre')),
  add column if not exists radius text
    check (radius is null or radius in ('none', 'sm', 'md', 'lg', 'xl')),
  add column if not exists button_shape text
    check (button_shape is null or button_shape in ('square', 'rounded', 'pill')),
  add column if not exists button_style text
    check (button_style is null or button_style in ('solid', 'soft', 'outline', 'gradient')),
  add column if not exists table_style text
    check (table_style is null or table_style in ('lines', 'striped', 'bordered', 'minimal')),
  add column if not exists density text
    check (density is null or density in ('compact', 'normal', 'comfortable')),
  add column if not exists card_style text
    check (card_style is null or card_style in ('shadow', 'border', 'flat', 'glass')),
  add column if not exists font_latin text
    check (font_latin is null or font_latin in ('source_sans', 'inter', 'ibm_plex', 'system')),
  add column if not exists font_arabic text
    check (font_arabic is null or font_arabic in ('cairo', 'tajawal', 'ibm_plex_arabic', 'noto_kufi')),
  add column if not exists animations boolean,
  add column if not exists default_mode text
    check (default_mode is null or default_mode in ('light', 'dark', 'system'));

create table public.sys_ui_user_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.sys_users(id) on delete cascade default auth.uid(),
  mode text check (mode is null or mode in ('light', 'dark', 'system')),
  density text check (density is null or density in ('compact', 'normal', 'comfortable')),
  updated_at timestamptz not null default now()
);

alter table public.sys_ui_user_prefs enable row level security;
revoke all on public.sys_ui_user_prefs from public, anon;
grant select, insert, update, delete on public.sys_ui_user_prefs to authenticated;
grant all on public.sys_ui_user_prefs to service_role;

create policy sys_ui_user_prefs_own on public.sys_ui_user_prefs for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.sys_users u where u.id = auth.uid()));

create trigger trg_sys_ui_user_prefs_updated before update on public.sys_ui_user_prefs
  for each row execute function public.erp_set_updated_at();

notify pgrst, 'reload schema';
