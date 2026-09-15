-- =============================================================================
-- Phase 7 — RH employés : RBAC + seed minimal pour pickers contrats
-- =============================================================================

begin;

-- Permissions écran employees
with roles as (
  select code, id from public.sys_roles
  where code in ('SUPER_ADMIN', 'ADMIN_RH', 'GERANT', 'ADMIN_FINANCE', 'READ_ONLY')
),
screen as (
  select id from public.sys_screens where code = 'employees' limit 1
)
insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select
  r.id,
  s.id,
  case when r.code in ('SUPER_ADMIN', 'ADMIN_RH', 'GERANT') then true else false end,
  true,
  case when r.code in ('SUPER_ADMIN', 'ADMIN_RH', 'GERANT') then true else false end,
  case when r.code in ('SUPER_ADMIN', 'ADMIN_RH') then true else false end,
  case when r.code in ('SUPER_ADMIN', 'ADMIN_RH', 'GERANT', 'ADMIN_FINANCE') then true else false end,
  case when r.code in ('SUPER_ADMIN', 'ADMIN_RH', 'GERANT', 'ADMIN_FINANCE') then true else false end
from roles r
cross join screen s
on conflict (role_id, screen_id) do update set
  can_create = excluded.can_create,
  can_read = excluded.can_read,
  can_update = excluded.can_update,
  can_delete = excluded.can_delete,
  can_print = excluded.can_print,
  can_export = excluded.can_export;

-- Seed employés démo (identifiants légaux vides — saisie UI ultérieure)
insert into public.hr_employees (
  matricule, last_name, first_name, irg_category, status, hired_at
) values
  ('NF-0001', 'BENALI', 'Karim', 'STANDARD', 'ACTIVE', '2022-01-10'),
  ('NF-0002', 'MESSAOUDI', 'Samir', 'STANDARD', 'ACTIVE', '2022-03-15'),
  ('NF-0003', 'CHERIF', 'Amine', 'STANDARD', 'ACTIVE', '2023-02-01'),
  ('NF-0004', 'HADJ', 'Nour', 'STANDARD', 'ACTIVE', '2023-06-20'),
  ('NF-0005', 'BOUAZIZ', 'Yacine', 'STANDARD', 'ACTIVE', '2024-01-08'),
  ('NF-0006', 'SLIMANI', 'Farid', 'STANDARD', 'ACTIVE', '2024-04-12'),
  ('NF-0007', 'KHELIFI', 'Hassan', 'STANDARD', 'ACTIVE', '2021-09-01'),
  ('NF-0008', 'AMRANI', 'Sofiane', 'STANDARD', 'ACTIVE', '2020-11-15')
on conflict (matricule) do update set
  last_name = excluded.last_name,
  first_name = excluded.first_name,
  status = excluded.status,
  updated_at = now();

comment on table public.hr_employees is
  'Fiches employés RH — pickers contrats (consommation MO / pénalités).';

commit;
