-- Seed bank accounts with exact names from GESTION BANQUES (Google Workspace)
-- so archive migration later can match sheets by name without conflict.

begin;

insert into public.fin_accounts (
  code, name, account_type, currency_code,
  bank_name, opening_balance, opening_date, allow_negative, active, notes
)
values
  (
    'B01-AL-BARAKA',
    'AL BARAKA',
    'BANK',
    'DZD',
    'AL BARAKA',
    0,
    '2025-12-31',
    false,
    true,
    'Compte issu de GESTION BANQUES 2026 (Google Workspace).'
  ),
  (
    'B02-AL-SALAM',
    'AL SALAM',
    'BANK',
    'DZD',
    'AL SALAM',
    0,
    '2025-12-31',
    false,
    true,
    'Compte issu de GESTION BANQUES 2026 (Google Workspace).'
  ),
  (
    'B03-BEA-HMD-033',
    'BEA HMD 033',
    'BANK',
    'DZD',
    'BEA',
    0,
    '2025-12-31',
    false,
    true,
    'Compte issu de GESTION BANQUES 2026 (Google Workspace).'
  ),
  (
    'B04-BEA-HMD-035-01',
    'BEA HMD 035/01',
    'BANK',
    'DZD',
    'BEA',
    0,
    '2025-12-31',
    false,
    true,
    'Compte issu de GESTION BANQUES 2026 (Google Workspace).'
  ),
  (
    'B05-BEA-SETIF-053',
    'BEA SETIF 053',
    'BANK',
    'DZD',
    'BEA',
    0,
    '2025-12-31',
    true,
    true,
    'Compte issu de GESTION BANQUES 2026 (Google Workspace). Solde négatif possible.'
  ),
  (
    'B06-BEA-HMD-035-02',
    'BEA HMD 035/02',
    'BANK',
    'DZD',
    'BEA',
    0,
    '2025-12-31',
    false,
    true,
    'Compte issu de GESTION BANQUES 2026 (Google Workspace).'
  )
on conflict (code) do update set
  name = excluded.name,
  account_type = excluded.account_type,
  bank_name = excluded.bank_name,
  active = true,
  allow_negative = excluded.allow_negative,
  notes = excluded.notes,
  updated_at = now();

-- If an account already exists under the same display name with another code, keep it active.
update public.fin_accounts a
set active = true,
    updated_at = now()
where a.account_type = 'BANK'
  and a.name in (
    'AL BARAKA',
    'AL SALAM',
    'BEA HMD 033',
    'BEA HMD 035/01',
    'BEA SETIF 053',
    'BEA HMD 035/02'
  );

commit;
