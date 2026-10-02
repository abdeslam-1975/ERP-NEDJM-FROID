-- Personal arrangement of the interface: each user may reorder the side menu (and move its modules between
-- groups), the tabs and the page action buttons for themselves. It applies on top of the order chosen by the
-- super admin (sys_ui_item_overrides) and only changes positions: visibility still follows the roles.

create table public.sys_ui_user_order (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.sys_users(id) on delete cascade default auth.uid(),
  item_key text not null check (char_length(item_key) <= 80 and item_key ~ '^[a-z][a-z0-9_]*\.[a-z0-9_]+$'),
  sort_order integer not null check (sort_order between 0 and 100000),
  group_key text check (group_key is null or group_key ~ '^group\.[a-z0-9_]+$'),
  updated_at timestamptz not null default now(),
  unique (user_id, item_key)
);

alter table public.sys_ui_user_order enable row level security;
revoke all on public.sys_ui_user_order from public, anon;
grant select, insert, update, delete on public.sys_ui_user_order to authenticated;
grant all on public.sys_ui_user_order to service_role;

create policy sys_ui_user_order_own on public.sys_ui_user_order for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.sys_users u where u.id = auth.uid()));

-- The catalogue has a few hundred items: a ceiling keeps one account from filling the table.
create or replace function public.sys_ui_user_order_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.sys_ui_user_order where user_id = new.user_id) >= 1000 then
    raise exception 'Trop d''éléments réorganisés pour un même utilisateur.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_sys_ui_user_order_limit before insert on public.sys_ui_user_order
  for each row execute function public.sys_ui_user_order_limit();

create trigger trg_sys_ui_user_order_updated before update on public.sys_ui_user_order
  for each row execute function public.erp_set_updated_at();

notify pgrst, 'reload schema';
