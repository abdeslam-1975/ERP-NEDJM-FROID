-- Audit (phase 8): SECURITY DEFINER read helpers that do not check the caller were executable by anon
-- (through the default PUBLIC grant). The application only calls them from a signed-in session, so
-- anon and PUBLIC lose EXECUTE; authenticated and service_role keep it. No function body changes.

do $$
declare
  fn regprocedure;
begin
  foreach fn in array array[
    'public.ref_contract_item_consumed_qty(uuid)',
    'public.ref_contract_item_invoiced_qty(uuid)',
    'public.ref_contract_balance(uuid)',
    'public.ref_contract_stats(uuid)',
    'public.ref_contract_next_invoice_number(uuid)',
    'public.ref_contract_invoice_open_ht(uuid)',
    'public.ref_contract_invoice_open_ttc(uuid)',
    'public.ref_contract_suggest_penalty(uuid,text,numeric,text)',
    'public.fin_period_is_locked(uuid,date)',
    'public.fin_account_balance(uuid,date)',
    'public.fin_calculate_stamp(uuid,date,numeric,numeric,numeric)',
    'public.pur_supplier_invoice_open(uuid)',
    'public.hr_payroll_period_status(uuid,date)',
    'public.erp_has_any_role(text[],uuid)',
    'public.hr_employee_last_frozen_month(uuid,integer,integer)',
    'public.hr_first_open_payroll_month()'
  ]::regprocedure[]
  loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end;
$$;
