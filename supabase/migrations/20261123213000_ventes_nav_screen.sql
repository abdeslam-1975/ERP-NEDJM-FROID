-- Register the Ventes desk in RBAC / UI catalogue so it appears in the side menu.
-- Banque (finance) and Caisse screens/permissions are never updated — only read as a
-- source when cloning access onto the new ventes screen.

begin;

insert into public.sys_screens (code, module, label_fr, label_ar, path, sort_order, is_active)
values ('ventes', 'ventes', 'Ventes', 'المبيعات', '/ventes', 515, true)
on conflict (code) do update set
  module = excluded.module,
  label_fr = excluded.label_fr,
  label_ar = excluded.label_ar,
  path = excluded.path,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- Clone read/write flags from finance (preferred) or caisse for roles that already
-- had one of them — insert ventes rows only; never touch source permission rows.
insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select
  p.role_id,
  v.id,
  p.can_create,
  p.can_read,
  p.can_update,
  p.can_delete,
  p.can_print,
  p.can_export
from public.sys_permissions p
join public.sys_screens src on src.id = p.screen_id and src.code in ('finance', 'caisse')
join public.sys_screens v on v.code = 'ventes'
where not exists (
  select 1 from public.sys_permissions x
  where x.role_id = p.role_id and x.screen_id = v.id
)
-- If a role has both finance and caisse, keep a single ventes row (prefer finance).
and (
  src.code = 'finance'
  or not exists (
    select 1
    from public.sys_permissions p2
    join public.sys_screens s2 on s2.id = p2.screen_id and s2.code = 'finance'
    where p2.role_id = p.role_id
  )
);

-- New catalogue key is visible (not treated as unseen / closed).
insert into public.sys_ui_catalog_seen (item_key)
values ('nav.ventes')
on conflict (item_key) do nothing;

-- Roles that already hid Banque keep Ventes hidden the same way (insert only).
insert into public.sys_ui_role_hidden (role_id, item_key)
select h.role_id, 'nav.ventes'
from public.sys_ui_role_hidden h
where h.item_key = 'nav.finance'
on conflict (role_id, item_key) do nothing;

-- Per-account access: open Ventes when Banque and/or Caisse was already allowed.
update public.sys_ui_user_access
set allowed = allowed || array['nav.ventes']::text[]
where ('nav.finance' = any(allowed) or 'nav.caisse' = any(allowed))
  and not ('nav.ventes' = any(allowed));

commit;
