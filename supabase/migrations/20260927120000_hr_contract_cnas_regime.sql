-- CNAS regime chosen on the contract (catalog social_profile code).
-- Null = profil social of the employee record, else STANDARD.
alter table public.hr_contracts
  add column if not exists cnas_regime_code text;
