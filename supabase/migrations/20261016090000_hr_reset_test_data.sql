-- Test-phase reset: wipes every employee and all HR operational data linked to
-- them (contracts, documents, attendance, leave, payroll, transfers,
-- declarations, employee-related decisions and their notifications) while
-- keeping settings (sites, catalogs, rubriques, fiche fields, templates,
-- postes, legal variables, users, policies).
--
-- Guard triggers (closed payroll, decisions, imports...) are bypassed with
-- session_replication_role = replica for this transaction only; FK integrity
-- is then re-verified explicitly and any orphan aborts the whole reset.
-- p_dry_run = true performs the full deletion and then raises, so nothing is
-- committed (used to validate the reset against real data).

create or replace function public.hr_reset_test_data(p_confirm text, p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_tables text[] := array[
    'hr_payroll_simulation_slips', 'hr_payroll_simulations',
    'hr_payroll_transfer_lines', 'hr_payroll_transfer_batches',
    'hr_declaration_exports',
    'hr_payroll_slip_versions', 'hr_payroll_slip_lines', 'hr_payroll_slips',
    'hr_payroll_input_changes', 'hr_payroll_runs',
    'hr_attendance_import_lines', 'hr_attendance_import_documents',
    'hr_attendance', 'hr_attendance_sheet_rows', 'hr_attendance_import_batches',
    'hr_external_operation_documents', 'hr_external_operations',
    'hr_interim_statements',
    'hr_leave_requests', 'hr_leave_adjustments', 'hr_correspondences',
    'hr_employee_advances', 'hr_employee_exits', 'hr_salary_exceptions',
    'hr_contract_assignments', 'hr_contract_compliance', 'hr_contract_salary_history',
    'hr_contracts',
    'hr_employee_files', 'hr_employee_civil', 'hr_employee_contacts',
    'hr_employee_bank', 'hr_employee_social', 'hr_employee_qualifications',
    'hr_employees'
  ];
  v_decision_types text[] := array['D1','D3','D4','D5','D6','D7','D8','D9','D10','D13'];
  v_parents regclass[];
  v_counts jsonb := '{}'::jsonb;
  v_files jsonb;
  v_employee_ids jsonb;
  v_decisions uuid[];
  v_notifications uuid[];
  v_table text;
  v_n bigint;
  v_bad boolean;
  r record;
begin
  if v_uid is null or not public.erp_is_super_admin(v_uid) then
    raise exception 'Réservé au super administrateur.' using errcode = '42501';
  end if;
  if coalesce(p_confirm, '') <> 'SUPPRIMER' then
    raise exception 'Confirmation invalide : tapez SUPPRIMER.' using errcode = '22023';
  end if;

  if exists (select 1 from fin_cash_advances where beneficiary_employee_id is not null) then
    raise exception 'Des avances de caisse (Finance) sont liées à des employés : supprimez-les d''abord.';
  end if;
  if exists (select 1 from com_draft_adjustments where employee_id is not null or hr_contract_id is not null) then
    raise exception 'Des ajustements commerciaux sont liés à des employés : supprimez-les d''abord.';
  end if;

  select coalesce(jsonb_agg(id::text), '[]'::jsonb) into v_employee_ids from hr_employees;
  v_files := jsonb_build_object(
    'hr-docs', coalesce((select jsonb_agg(storage_path) from hr_employee_files where storage_path is not null), '[]'::jsonb),
    'attendance-imports', coalesce((
      select jsonb_agg(p) from (
        select storage_path as p from hr_attendance_import_batches
        union select storage_path from hr_attendance_import_documents
      ) s), '[]'::jsonb),
    'hr-external-docs', coalesce((select jsonb_agg(storage_path) from hr_external_operation_documents), '[]'::jsonb)
  );

  select coalesce(array_agg(d.id), '{}') into v_decisions
  from sys_decisions d
  where d.type_code = any(v_decision_types)
    and not exists (select 1 from ref_global_var_versions x where x.decision_id = d.id)
    and not exists (select 1 from ref_bareme_irg_versions x where x.decision_id = d.id)
    and not exists (select 1 from ref_irg_rule_sets x where x.decision_id = d.id)
    and not exists (select 1 from ref_irg_zone_scopes x where x.decision_id = d.id)
    and not exists (select 1 from ref_rule_proposals x where x.application_decision_id = d.id)
    and not exists (select 1 from ref_legende_coefficients x where x.decision_id = d.id)
    and not exists (select 1 from ref_legal_ai_extractions x where x.d15_decision_id = d.id)
    and not exists (select 1 from hr_social_profile_rates x where x.decision_id = d.id)
    and not exists (select 1 from hr_payroll_chain_policy x where x.decision_id = d.id)
    and not exists (select 1 from hr_attendance_code_mappings x where x.decision_id = d.id)
    and not exists (select 1 from hr_attendance_import_policy x where x.decision_id = d.id);
  select coalesce(array_agg(id), '{}') into v_notifications
  from sys_notifications where decision_id = any(v_decisions);

  set local session_replication_role = replica;

  foreach v_table in array v_tables loop
    if v_table = 'hr_contract_assignments' then
      -- poste-level salary assignments are settings; only employee/contract rows go
      delete from hr_salary_assignments where employee_id is not null or contract_id is not null;
      get diagnostics v_n = row_count;
      v_counts := v_counts || jsonb_build_object('hr_salary_assignments', v_n);
    end if;
    execute format('delete from public.%I', v_table);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object(v_table, v_n);
  end loop;

  update contract_consumption_movements set hr_employee_id = null where hr_employee_id is not null;
  update contract_penalty_events set hr_employee_id = null where hr_employee_id is not null;
  update hr_attendance_code_mappings set batch_id = null where batch_id is not null;
  update sys_decisions set run_id = null where run_id is not null and not (id = any(v_decisions));

  delete from sys_notification_reads where notification_id = any(v_notifications);
  delete from sys_notifications where id = any(v_notifications);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('sys_notifications', v_n);
  delete from sys_decisions where id = any(v_decisions);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('sys_decisions', v_n);

  set local session_replication_role = origin;

  select array_agg(to_regclass('public.' || t)) into v_parents
  from unnest(v_tables || array['hr_salary_assignments', 'sys_decisions', 'sys_notifications']) t;

  for r in
    select c.conrelid::regclass as child, ca.attname as ccol, c.confrelid::regclass as parent, pa.attname as pcol
    from pg_constraint c
    join pg_attribute ca on ca.attrelid = c.conrelid and ca.attnum = c.conkey[1]
    join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
    where c.contype = 'f' and array_length(c.conkey, 1) = 1 and c.confrelid = any(v_parents)
  loop
    execute format(
      'select exists (select 1 from %s x where x.%I is not null and not exists (select 1 from %s y where y.%I = x.%I))',
      r.child, r.ccol, r.parent, r.pcol, r.ccol
    ) into v_bad;
    if v_bad then
      raise exception 'Réinitialisation annulée : référence orpheline %.% → %.', r.child, r.ccol, r.parent;
    end if;
  end loop;

  if p_dry_run then
    raise exception 'DRY_RUN %', v_counts::text using errcode = 'P0001';
  end if;

  insert into sys_audit_logs (user_id, action, table_name, new_values)
  values (v_uid, 'DELETE', 'hr_reset_test_data', v_counts);

  return jsonb_build_object('counts', v_counts, 'files', v_files, 'employee_ids', v_employee_ids);
end;
$$;

revoke all on function public.hr_reset_test_data(text, boolean) from public, anon;
grant execute on function public.hr_reset_test_data(text, boolean) to authenticated;
