-- Read policy checks the row's own key (a lookup by id cannot see a row inserted by the same statement).
drop policy if exists ref_vars_compliance_read on public.ref_global_vars;
create policy ref_vars_compliance_read on public.ref_global_vars
  for select to authenticated
  using (public.erp_can_read_hr_compliance() and public.erp_is_compliance_key(key));
