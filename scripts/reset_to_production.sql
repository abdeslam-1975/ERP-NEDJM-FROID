-- =============================================================================
-- NEDJM FROID ERP — Pre-Go-Live Data Purge
-- File: scripts/reset_to_production.sql
-- Run in: Supabase SQL Editor as postgres / project owner
-- Idempotent. Does NOT drop schema objects.
-- =============================================================================
-- PRESERVES:
--   sys_roles, sys_screens, sys_permissions, sys_users, auth.users,
--   ref_activity_codes, ref_global_vars (+ versions), ref_bareme_irg*,
--   ref_irg_*, ref_formula_tokens, ref_legendes, ref_sites (core),
--   ref_contracts, contract_items (seeded commercial contracts)
-- PURGES:
--   sys_audit_logs (requires trigger disable — append-only by design),
--   com_draft_adjustments, sys_period_locks,
--   hr operational test rows (employees/contracts) if any,
--   com_client_contracts legacy test rows (Phase 1A stub) — NOT ref_contracts
-- =============================================================================

begin;

-- Guard: refuse if run accidentally without confirmation GUC
do $$
begin
  if current_setting('nedjm.allow_production_purge', true) is distinct from 'yes' then
    raise exception
      'PURGE ABORTED. Set: select set_config(''nedjm.allow_production_purge'', ''yes'', true); then re-run.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) Audit logs (append-only): disable mutation guards, truncate partitions
-- ---------------------------------------------------------------------------
alter table public.sys_audit_logs disable trigger trg_sys_audit_no_update;
alter table public.sys_audit_logs disable trigger trg_sys_audit_no_delete;

truncate table public.sys_audit_logs;

alter table public.sys_audit_logs enable trigger trg_sys_audit_no_update;
alter table public.sys_audit_logs enable trigger trg_sys_audit_no_delete;

-- ---------------------------------------------------------------------------
-- 2) Operational / test transactional data
-- ---------------------------------------------------------------------------
truncate table public.com_draft_adjustments restart identity cascade;
truncate table public.sys_period_locks restart identity cascade;

-- HR test data (keep schema; wipe rows)
truncate table public.hr_contracts restart identity cascade;
truncate table public.hr_employees restart identity cascade;

-- Legacy Phase 1A commercial stubs (keep ref_contracts / contract_items)
truncate table public.com_contract_penalties restart identity cascade;
truncate table public.com_contract_rate_lines restart identity cascade;
truncate table public.com_client_contracts restart identity cascade;

-- ---------------------------------------------------------------------------
-- 3) Assertions
-- ---------------------------------------------------------------------------
do $$
declare
  v_roles int;
  v_vars int;
  v_irg int;
  v_contract int;
  v_labor int;
  v_audit int;
  v_users int;
begin
  select count(*) into v_roles from public.sys_roles;
  select count(*) into v_vars from public.ref_global_vars;
  select count(*) into v_irg from public.ref_bareme_irg;
  select count(*) into v_contract
    from public.ref_contracts where contract_number = 'I/111/HMD-DEG/2024';
  select count(*) into v_labor
    from public.contract_items ci
    join public.ref_contracts c on c.id = ci.contract_id
    where c.contract_number = 'I/111/HMD-DEG/2024' and ci.item_type = 'LABOR';
  select count(*) into v_audit from public.sys_audit_logs;
  select count(*) into v_users from public.sys_users;

  if v_roles < 6 then
    raise exception 'ASSERT FAIL: sys_roles count % < 6', v_roles;
  end if;
  if v_vars < 10 then
    raise exception 'ASSERT FAIL: ref_global_vars count % < 10', v_vars;
  end if;
  if v_irg < 6 then
    raise exception 'ASSERT FAIL: ref_bareme_irg count % < 6', v_irg;
  end if;
  if v_contract <> 1 then
    raise exception 'ASSERT FAIL: SONATRACH contract missing';
  end if;
  if v_labor <> 5 then
    raise exception 'ASSERT FAIL: expected 5 LABOR lines, got %', v_labor;
  end if;
  if v_audit <> 0 then
    raise exception 'ASSERT FAIL: audit logs not empty (% rows)', v_audit;
  end if;
  if v_users < 1 then
    raise exception 'ASSERT FAIL: sys_users emptied unexpectedly';
  end if;

  raise notice 'PURGE OK — roles=%, vars=%, irg=%, sonatrach_labor=%, users=%, audit=0',
    v_roles, v_vars, v_irg, v_labor, v_users;
end $$;

commit;

-- Optional follow-up (manual):
-- select set_config('nedjm.allow_production_purge', 'no', true);
