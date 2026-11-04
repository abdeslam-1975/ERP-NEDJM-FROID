-- Banque and Caisse are two modules. The finance screen keeps the bank,
-- the caisse screen keeps the cash journal. Roles that could open the old
-- combined entry keep both, with the same actions they already had on finance.

begin;

update public.sys_screens
set label_fr = 'Banque',
    label_ar = 'البنك'
where code = 'finance';

update public.sys_screens
set label_fr = 'Paramètres banque',
    label_ar = 'إعدادات البنك'
where code = 'finance_settings';

insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select p.role_id, c.id, p.can_create, p.can_read, p.can_update, p.can_delete, p.can_print, p.can_export
from public.sys_permissions p
join public.sys_screens f on f.id = p.screen_id and f.code = 'finance'
join public.sys_screens c on c.code = 'caisse'
where not exists (
  select 1 from public.sys_permissions x
  where x.role_id = p.role_id and x.screen_id = c.id
);

insert into public.sys_ui_catalog_seen (item_key)
values ('nav.caisse')
on conflict (item_key) do nothing;

insert into public.sys_ui_role_hidden (role_id, item_key)
select h.role_id, 'nav.caisse'
from public.sys_ui_role_hidden h
where h.item_key = 'nav.finance'
on conflict (role_id, item_key) do nothing;

update public.sys_ui_user_access
set allowed = allowed || array['nav.caisse']::text[]
where 'nav.finance' = any(allowed)
  and not ('nav.caisse' = any(allowed));

commit;
