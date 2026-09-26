-- Module 05 — Tax & social compliance engine (IRG / CNAS / CACOBATPH per contract).
--  1. IRG zones (catalog) + zone abatement rates as versioned legal variables (seeded at 0 %).
--  2. Site → zone (explicit on the site, else wilaya mapping catalog, else NORMAL).
--  3. CNAS regimes reuse the employee "social_profile" catalog (optional rates in extra).
--  4. Contract types may allow a fixed IRG rate (taux libératoire).
--  5. Manual overrides per contract, dated, justified, audited.

begin;

-- ---------------------------------------------------------------------------
-- 1. IRG zones + rates
-- ---------------------------------------------------------------------------
insert into public.hr_catalog_kinds (code, label_ar, label_fr, extra_hint, sort_order) values
  ('irg_zone', 'المنطقة الضريبية IRG', 'Zone IRG',
   '{"rate_var_key":"clé variable légale du taux (vide = 0 %)","applies_to":"TAX | BASE"}', 180),
  ('irg_zone_wilaya', 'ربط الولاية بالمنطقة الضريبية', 'Wilaya → zone IRG',
   '{"zone":"code zone IRG (NORMAL, SUD, GRAND_SUD…)"}', 190)
on conflict (code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  extra_hint = excluded.extra_hint,
  sort_order = excluded.sort_order;

insert into public.hr_catalogs (kind, code, label_ar, label_fr, extra, sort_order) values
  ('irg_zone', 'NORMAL', 'السلم العام', 'Barème général', '{"applies_to":"TAX"}', 10),
  ('irg_zone', 'SUD', 'الجنوب', 'Sud', '{"rate_var_key":"IRG_ZONE_SUD","applies_to":"TAX"}', 20),
  ('irg_zone', 'GRAND_SUD', 'أقصى الجنوب', 'Extrême Sud', '{"rate_var_key":"IRG_ZONE_GRAND_SUD","applies_to":"TAX"}', 30)
on conflict (kind, code) do nothing;

insert into public.ref_global_vars (key, label_fr, label_ar, value_type, unit) values
  ('IRG_ZONE_SUD',       'Abattement IRG zone Sud',         'تخفيض IRG منطقة الجنوب',      'numeric', '%'),
  ('IRG_ZONE_GRAND_SUD', 'Abattement IRG zone Extrême Sud', 'تخفيض IRG منطقة أقصى الجنوب', 'numeric', '%')
on conflict (key) do nothing;

insert into public.ref_global_var_versions (var_id, value_numeric, effective_from)
select v.id, 0, date '2020-01-01'
from public.ref_global_vars v
where v.key in ('IRG_ZONE_SUD', 'IRG_ZONE_GRAND_SUD')
  and not exists (select 1 from public.ref_global_var_versions x where x.var_id = v.id);

-- ---------------------------------------------------------------------------
-- 2. Site zone (null = derived from wilaya mapping, else NORMAL)
-- ---------------------------------------------------------------------------
alter table public.ref_sites
  add column if not exists irg_zone_code text;

comment on column public.ref_sites.irg_zone_code is
  'Zone IRG du chantier (catalogue irg_zone). Vide = déduite de la wilaya (catalogue irg_zone_wilaya), sinon NORMAL.';

-- ---------------------------------------------------------------------------
-- 3. CNAS regimes = social_profile catalog
-- ---------------------------------------------------------------------------
update public.hr_catalog_kinds set
  label_ar = 'نظام الاشتراك CNAS',
  label_fr = 'Régime CNAS',
  extra_hint = '{"employee_pct":"% part salariale (vide = taux légal)","employer_pct":"% part patronale hors FOS (vide = taux légal)","fos_pct":"% FOS (vide = taux légal)"}'
where code = 'social_profile';

-- ---------------------------------------------------------------------------
-- 4. Contract types allowed to use the fixed IRG rate
-- ---------------------------------------------------------------------------
update public.hr_catalog_kinds set
  extra_hint = '{"allows_fixed_irg":"true = taux libératoire IRG autorisé pour ce type"}'
where code = 'contract_type';

-- ---------------------------------------------------------------------------
-- 5. Manual overrides per contract
-- ---------------------------------------------------------------------------
create table if not exists public.hr_contract_compliance (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.hr_contracts(id) on delete cascade,
  domain text not null check (domain in ('IRG', 'CNAS', 'CACOBATPH')),
  option_code text not null,
  params jsonb not null default '{}'::jsonb,
  reason text not null check (char_length(btrim(reason)) >= 5),
  effective_from date not null,
  effective_to date,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check (
    (domain = 'IRG' and option_code in ('BAREME', 'ZONE', 'HANDICAP', 'EXEMPT', 'FIXED_RATE'))
    or (domain = 'CNAS' and option_code = 'REGIME')
    or (domain = 'CACOBATPH' and option_code = 'CUSTOM')
  )
);

alter table public.hr_contract_compliance
  drop constraint if exists hr_contract_compliance_no_overlap;
alter table public.hr_contract_compliance
  add constraint hr_contract_compliance_no_overlap
  exclude using gist (
    contract_id with =,
    domain with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  );

create index if not exists hr_contract_compliance_contract_idx
  on public.hr_contract_compliance (contract_id, domain, effective_from desc);

comment on table public.hr_contract_compliance is
  'Dérogations manuelles IRG / CNAS / CACOBATPH par contrat. Aucune ligne couvrant la période = mode automatique.';

drop trigger if exists trg_hr_contract_compliance_u on public.hr_contract_compliance;
create trigger trg_hr_contract_compliance_u before update on public.hr_contract_compliance
  for each row execute function public.erp_set_updated_at();

drop trigger if exists trg_hr_contract_compliance_audit on public.hr_contract_compliance;
create trigger trg_hr_contract_compliance_audit
  after insert or update or delete on public.hr_contract_compliance
  for each row execute function public.sys_audit_row_change();

alter table public.hr_contract_compliance enable row level security;

drop policy if exists hr_compliance_read on public.hr_contract_compliance;
create policy hr_compliance_read on public.hr_contract_compliance
  for select to authenticated using (public.erp_can_read_hr_salary());

drop policy if exists hr_compliance_write on public.hr_contract_compliance;
create policy hr_compliance_write on public.hr_contract_compliance
  for all to authenticated
  using (public.erp_has_perm('contracts', 'update'::public.rbac_action, null))
  with check (public.erp_has_perm('contracts', 'update'::public.rbac_action, null));

grant select, insert, update, delete on public.hr_contract_compliance to authenticated;

commit;
