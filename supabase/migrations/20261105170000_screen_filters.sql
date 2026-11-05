-- Screen filters are a view for one account. A SUPER_ADMIN may also publish
-- the same view for every account. Removing the shared view restores each
-- account's own filter.

create table public.sys_screen_filters (
  user_id uuid not null references public.sys_users(id) on delete cascade,
  screen_key text not null,
  chips jsonb not null default '[]'::jsonb,
  chips_at timestamptz not null default now(),
  dismissed_shared_at timestamptz,
  primary key (user_id, screen_key),
  constraint sys_screen_filters_key check (
    char_length(screen_key) between 3 and 80
    and screen_key ~ '^[a-z][a-z0-9_.]+$'
  ),
  constraint sys_screen_filters_chips check (
    jsonb_typeof(chips) = 'array' and jsonb_array_length(chips) <= 12
  )
);

create table public.sys_screen_filter_shared (
  screen_key text primary key,
  chips jsonb not null,
  chips_at timestamptz not null default now(),
  updated_by uuid references public.sys_users(id) on delete set null,
  constraint sys_screen_filter_shared_key check (
    char_length(screen_key) between 3 and 80
    and screen_key ~ '^[a-z][a-z0-9_.]+$'
  ),
  constraint sys_screen_filter_shared_chips check (
    jsonb_typeof(chips) = 'array' and jsonb_array_length(chips) <= 12
  )
);

alter table public.sys_screen_filters enable row level security;
alter table public.sys_screen_filter_shared enable row level security;
revoke all on public.sys_screen_filters from public, anon;
revoke all on public.sys_screen_filter_shared from public, anon;
grant select, insert, update, delete on public.sys_screen_filters to authenticated;
grant select, insert, update, delete on public.sys_screen_filter_shared to authenticated;
grant all on public.sys_screen_filters to service_role;
grant all on public.sys_screen_filter_shared to service_role;

create policy sys_screen_filters_own on public.sys_screen_filters
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy sys_screen_filter_shared_read on public.sys_screen_filter_shared
  for select to authenticated
  using (true);

create policy sys_screen_filter_shared_write on public.sys_screen_filter_shared
  for all to authenticated
  using (public.erp_is_super_admin())
  with check (public.erp_is_super_admin());

notify pgrst, 'reload schema';
