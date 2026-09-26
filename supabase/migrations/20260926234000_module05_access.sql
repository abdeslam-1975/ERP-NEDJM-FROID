-- Module 05 (tax & social compliance) gets its own screen in the rights matrix:
--   SUPER_ADMIN, ADMIN_RH, ADMIN_FINANCE edit; GERANT reads; other roles have no access.
-- Scope: legal rates (CNAS, CACOBATPH, IRG zones, SNMG and payroll constants of the "Cotisations & impôts" screen),
-- IRG barème and rules, zone / wilaya / CNAS regime catalogs, per-contract overrides.
-- Also grants ADMIN_RH read-only access to the audit log.
begin;

insert into public.sys_screens (code, path, module, label_fr, label_ar, sort_order)
values ('hr_compliance', '/rh/legal', 'rh', 'Conformité fiscale & sociale (unité 05)', 'الامتثال الضريبي والاجتماعي (الوحدة 05)', 214)
on conflict (code) do nothing;

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select r.id, s.id,
       r.code in ('SUPER_ADMIN', 'ADMIN_RH', 'ADMIN_FINANCE'),
       true,
       r.code in ('SUPER_ADMIN', 'ADMIN_RH', 'ADMIN_FINANCE'),
       r.code = 'SUPER_ADMIN',
       true,
       true
from public.sys_roles r
cross join public.sys_screens s
where s.code = 'hr_compliance'
  and r.code in ('SUPER_ADMIN', 'ADMIN_RH', 'ADMIN_FINANCE', 'GERANT')
on conflict (role_id, screen_id) do update set
  can_create = excluded.can_create,
  can_read = excluded.can_read,
  can_update = excluded.can_update,
  can_delete = excluded.can_delete,
  can_print = excluded.can_print,
  can_export = excluded.can_export;

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select r.id, s.id, false, true, false, false, false, false
from public.sys_roles r
cross join public.sys_screens s
where s.code = 'audit' and r.code = 'ADMIN_RH'
on conflict (role_id, screen_id) do update set can_read = true;

create or replace function public.erp_can_write_hr_compliance(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.erp_is_super_admin(p_uid)
      or public.erp_has_perm('hr_compliance', 'update'::public.rbac_action, null, p_uid);
$$;

create or replace function public.erp_can_read_hr_compliance(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.erp_can_write_hr_compliance(p_uid)
      or public.erp_has_perm('hr_compliance', 'read'::public.rbac_action, null, p_uid);
$$;

-- Keep in sync with LEGAL_KEYS in src/lib/hr/compliance-keys.ts.
create or replace function public.erp_is_compliance_var(p_var_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.ref_global_vars v
    where v.id = p_var_id
      and v.key in (
        'CNAS_EMPLOYEE', 'CNAS_EMPLOYER_BASE', 'CNAS_FOS',
        'CACOBATPH_CONGES', 'CACOBATPH_INTEMPERIES', 'CACOBATPH_INTEMPERIES_EMP', 'CACOBATPH_INTEMPERIES_SAL',
        'NJM_DIVISEUR_FIXED', 'SNMG', 'IRG_ZONE_SUD', 'IRG_ZONE_GRAND_SUD',
        'HEURES_MENSUELLES', 'HS_TAUX_50', 'HS_TAUX_75', 'HS_TAUX_100', 'CONGE_JOURS_MOIS'
      )
  );
$$;

grant execute on function public.erp_can_write_hr_compliance(uuid) to authenticated;
grant execute on function public.erp_can_read_hr_compliance(uuid) to authenticated;
grant execute on function public.erp_is_compliance_var(uuid) to authenticated;

drop policy if exists ref_vars_compliance_read on public.ref_global_vars;
create policy ref_vars_compliance_read on public.ref_global_vars
  for select to authenticated using (public.erp_can_read_hr_compliance() and public.erp_is_compliance_var(id));

drop policy if exists ref_varver_compliance_read on public.ref_global_var_versions;
create policy ref_varver_compliance_read on public.ref_global_var_versions
  for select to authenticated using (public.erp_can_read_hr_compliance() and public.erp_is_compliance_var(var_id));
drop policy if exists ref_varver_compliance_insert on public.ref_global_var_versions;
create policy ref_varver_compliance_insert on public.ref_global_var_versions
  for insert to authenticated with check (public.erp_can_write_hr_compliance() and public.erp_is_compliance_var(var_id));
drop policy if exists ref_varver_compliance_update on public.ref_global_var_versions;
create policy ref_varver_compliance_update on public.ref_global_var_versions
  for update to authenticated
  using (public.erp_can_write_hr_compliance() and public.erp_is_compliance_var(var_id))
  with check (public.erp_can_write_hr_compliance() and public.erp_is_compliance_var(var_id));

do $$
declare t text;
begin
  foreach t in array array['ref_bareme_irg_versions', 'ref_bareme_irg', 'ref_irg_rule_sets', 'ref_irg_rules'] loop
    execute format('drop policy if exists %I on public.%I', t || '_compliance_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.erp_can_read_hr_compliance())', t || '_compliance_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_compliance_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.erp_can_write_hr_compliance()) with check (public.erp_can_write_hr_compliance())',
      t || '_compliance_write', t);
  end loop;
end $$;

drop policy if exists hr_cat_compliance_write on public.hr_catalogs;
create policy hr_cat_compliance_write on public.hr_catalogs
  for all to authenticated
  using (public.erp_can_write_hr_compliance() and kind in ('irg_zone', 'irg_zone_wilaya', 'social_profile'))
  with check (public.erp_can_write_hr_compliance() and kind in ('irg_zone', 'irg_zone_wilaya', 'social_profile'));

drop policy if exists hr_compliance_read on public.hr_contract_compliance;
create policy hr_compliance_read on public.hr_contract_compliance
  for select to authenticated using (public.erp_can_read_hr_salary() or public.erp_can_read_hr_compliance());
drop policy if exists hr_compliance_write on public.hr_contract_compliance;
create policy hr_compliance_write on public.hr_contract_compliance
  for all to authenticated
  using (public.erp_can_write_hr_compliance())
  with check (public.erp_can_write_hr_compliance());

commit;
