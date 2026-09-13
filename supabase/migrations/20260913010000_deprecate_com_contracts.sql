-- NEDJM FROID ERP — Deprecate legacy commercial contract tables (Option A)
-- Keep tables + FKs; all new logic targets ref_contracts / contract_items.
-- Do NOT DROP com_client_contracts* (referenced by com_draft_adjustments,
-- com_contract_rate_lines, com_contract_penalties).

comment on table public.com_client_contracts is
  '@deprecated Legacy commercial contracts. Source of truth is public.ref_contracts. Kept for FK compatibility; do not write new app logic here.';

comment on table public.com_contract_rate_lines is
  '@deprecated Legacy rate lines for com_client_contracts. Prefer public.contract_items on ref_contracts.';

comment on table public.com_contract_penalties is
  '@deprecated Legacy penalties for com_client_contracts. Prefer attributes.penalties JSONB on ref_contracts.';

comment on table public.com_draft_adjustments is
  '@deprecated Draft adjustments still FK to legacy com_client_contracts until commercial migration.';
