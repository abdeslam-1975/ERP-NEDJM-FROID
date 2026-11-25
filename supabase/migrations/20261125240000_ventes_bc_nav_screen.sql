-- Register Bon de commande as its own side-nav screen under Ventes.
-- Does not alter Banque / Caisse / Achats screens.

begin;

insert into public.sys_screens (code, module, label_fr, label_ar, path, sort_order, is_active)
values (
  'ventes_bc',
  'ventes',
  'Bon de commande',
  'أمر الطلب',
  '/ventes/bons-de-commande',
  516,
  true
)
on conflict (code) do update set
  module = excluded.module,
  label_fr = excluded.label_fr,
  label_ar = excluded.label_ar,
  path = excluded.path,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- Clone permissions from ventes (preferred) for roles that already have ventes.
insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select
  p.role_id,
  bc.id,
  p.can_create,
  p.can_read,
  p.can_update,
  p.can_delete,
  p.can_print,
  p.can_export
from public.sys_permissions p
join public.sys_screens src on src.id = p.screen_id and src.code = 'ventes'
join public.sys_screens bc on bc.code = 'ventes_bc'
where not exists (
  select 1 from public.sys_permissions x
  where x.role_id = p.role_id and x.screen_id = bc.id
);

insert into public.sys_ui_catalog_seen (item_key)
values ('nav.bon_commande')
on conflict (item_key) do nothing;

-- Keep hidden for roles that already hid Ventes.
insert into public.sys_ui_role_hidden (role_id, item_key)
select h.role_id, 'nav.bon_commande'
from public.sys_ui_role_hidden h
where h.item_key = 'nav.ventes'
on conflict (role_id, item_key) do nothing;

-- Open BC when Ventes was already allowed on a user access row.
update public.sys_ui_user_access
set allowed = allowed || array['nav.bon_commande']::text[]
where 'nav.ventes' = any(allowed)
  and not ('nav.bon_commande' = any(allowed));

commit;
