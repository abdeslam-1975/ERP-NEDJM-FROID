-- Décret exécutif 15-236: employer CNAS is 25 %, FOS 0.5 % is separate.
-- The 2026 general rate was stored as 25.5 %, which printed 25.5 % plus FOS 0.5 %.
-- Only versions that start in an open payroll month are rewritten. Reduced regimes stay as published.

update public.ref_global_var_versions v
set value_numeric = 0.250000
from public.ref_global_vars g
where g.id = v.var_id
  and g.key = 'CNAS_EMPLOYER_BASE'
  and round(v.value_numeric, 4) = 0.2550
  and v.effective_from >= public.hr_first_open_payroll_month();
