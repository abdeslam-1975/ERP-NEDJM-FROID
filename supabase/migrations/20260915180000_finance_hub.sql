-- =============================================================================
-- Finance hub — configurable Banque, Caisse, payments, advances and TVA.
-- Economic entries are append-only; corrections use reversal entries.
-- =============================================================================

begin;

insert into public.sys_screens (code, module, label_fr, path, sort_order)
values
  ('finance', 'finance', 'Banque & Caisse', '/finance', 510),
  ('finance_settings', 'finance', 'Paramètres financiers', '/finance/parametres', 520)
on conflict (code) do update set
  module = excluded.module,
  label_fr = excluded.label_fr,
  path = excluded.path,
  sort_order = excluded.sort_order;

insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select r.id, s.id, true, true, true, true, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code in ('SUPER_ADMIN', 'ADMIN_FINANCE')
  and s.code in ('finance', 'finance_settings')
on conflict (role_id, screen_id) do update set
  can_create = true, can_read = true, can_update = true, can_delete = true,
  can_print = true, can_export = true;

insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select r.id, s.id, true, true, true, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code = 'GERANT'
  and s.code = 'finance'
on conflict (role_id, screen_id) do update set
  can_create = true, can_read = true, can_update = true, can_delete = false,
  can_print = true, can_export = true;

insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select r.id, s.id, false, true, false, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code in ('READ_ONLY', 'CHEF_CHANTIER')
  and s.code = 'finance'
on conflict (role_id, screen_id) do update set
  can_create = false, can_read = true, can_update = false, can_delete = false,
  can_print = true, can_export = true;

create table public.fin_tax_rates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(trim(code)) and char_length(code) between 1 and 32),
  label_fr text not null check (char_length(trim(label_fr)) between 1 and 120),
  rate numeric(8,6) not null check (rate >= 0 and rate <= 1),
  active boolean not null default true,
  is_default boolean not null default false,
  valid_from date,
  valid_to date,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from),
  check (not is_default or active)
);

create table public.fin_payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(trim(code)) and char_length(code) between 1 and 32),
  label_fr text not null check (char_length(trim(label_fr)) between 1 and 120),
  account_scope text not null default 'BOTH' check (account_scope in ('BANK', 'CASH', 'BOTH')),
  legacy_contract_method text check (legacy_contract_method in ('VIREMENT', 'CHEQUE', 'ESPECES', 'AUTRE')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fin_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(trim(code)) and char_length(code) between 1 and 40),
  label_fr text not null check (char_length(trim(label_fr)) between 1 and 160),
  direction text not null default 'BOTH' check (direction in ('IN', 'OUT', 'BOTH')),
  account_scope text not null default 'BOTH' check (account_scope in ('BANK', 'CASH', 'BOTH')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fin_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(trim(code)) and char_length(code) between 1 and 40),
  name text not null check (char_length(trim(name)) between 1 and 160),
  account_type text not null check (account_type in ('BANK', 'CASH')),
  site_id uuid references public.ref_sites(id) on delete restrict,
  currency_code text not null default 'DZD' check (currency_code = upper(trim(currency_code)) and char_length(currency_code) = 3),
  bank_name text,
  account_number text,
  rib text,
  opening_balance numeric(18,2) not null default 0,
  opening_date date not null default current_date,
  allow_negative boolean not null default false,
  active boolean not null default true,
  notes text check (char_length(coalesce(notes, '')) <= 500),
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fin_period_locks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references public.ref_sites(id) on delete cascade,
  account_id uuid references public.fin_accounts(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  locked_by uuid not null references public.sys_users(id),
  locked_at timestamptz not null default now(),
  unlocked_by uuid references public.sys_users(id),
  unlocked_at timestamptz,
  check (end_date >= start_date),
  check (site_id is not null or account_id is not null)
);

create table public.fin_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.fin_accounts(id) on delete restrict,
  site_id uuid references public.ref_sites(id) on delete restrict,
  movement_date date not null default current_date,
  value_date date,
  direction text not null check (direction in ('IN', 'OUT')),
  amount numeric(18,2) not null check (amount > 0),
  category_id uuid references public.fin_categories(id) on delete restrict,
  payment_method_id uuid references public.fin_payment_methods(id) on delete restrict,
  reference text check (char_length(coalesce(reference, '')) <= 160),
  description text not null check (char_length(trim(description)) between 1 and 500),
  counterparty text check (char_length(coalesce(counterparty, '')) <= 200),
  source_type text not null default 'MANUAL' check (
    source_type in ('MANUAL', 'TRANSFER', 'CUSTOMER_PAYMENT', 'CASH_ADVANCE', 'CASH_RETURN', 'REVERSAL')
  ),
  source_id uuid,
  transfer_group_id uuid,
  reversal_of uuid unique references public.fin_transactions(id) on delete restrict,
  reconciled_at timestamptz,
  reconciled_by uuid references public.sys_users(id),
  reconciliation_reference text check (char_length(coalesce(reconciliation_reference, '')) <= 160),
  created_by uuid not null references public.sys_users(id),
  created_at timestamptz not null default now(),
  check (
    (reconciled_at is null and reconciled_by is null)
    or (reconciled_at is not null and reconciled_by is not null)
  )
);

create index fin_transactions_account_date_idx
  on public.fin_transactions(account_id, movement_date desc, created_at desc);
create index fin_transactions_site_date_idx
  on public.fin_transactions(site_id, movement_date desc);
create index fin_transactions_source_idx
  on public.fin_transactions(source_type, source_id);

create table public.fin_cash_advances (
  id uuid primary key default gen_random_uuid(),
  advance_number text not null unique,
  cash_account_id uuid not null references public.fin_accounts(id) on delete restrict,
  site_id uuid references public.ref_sites(id) on delete restrict,
  beneficiary_employee_id uuid references public.hr_employees(id) on delete restrict,
  beneficiary_name text not null check (char_length(trim(beneficiary_name)) between 1 and 200),
  issue_date date not null default current_date,
  amount numeric(18,2) not null check (amount > 0),
  purpose text not null check (char_length(trim(purpose)) between 1 and 500),
  status text not null default 'OPEN' check (status in ('OPEN', 'SETTLED', 'CANCELLED')),
  issue_transaction_id uuid not null unique references public.fin_transactions(id) on delete restrict,
  return_transaction_id uuid unique references public.fin_transactions(id) on delete restrict,
  settled_at timestamptz,
  settled_by uuid references public.sys_users(id),
  settlement_note text check (char_length(coalesce(settlement_note, '')) <= 500),
  created_by uuid not null references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fin_cash_advance_expenses (
  id uuid primary key default gen_random_uuid(),
  advance_id uuid not null references public.fin_cash_advances(id) on delete cascade,
  expense_date date not null default current_date,
  category_id uuid not null references public.fin_categories(id) on delete restrict,
  amount numeric(18,2) not null check (amount > 0),
  description text not null check (char_length(trim(description)) between 1 and 500),
  receipt_reference text check (char_length(coalesce(receipt_reference, '')) <= 160),
  attachment_url text check (char_length(coalesce(attachment_url, '')) <= 1000),
  created_by uuid not null references public.sys_users(id),
  created_at timestamptz not null default now()
);

alter table public.contract_items
  add column tax_rule text not null default 'INHERIT'
    check (tax_rule in ('INHERIT', 'TAXABLE', 'EXEMPT')),
  add column tax_rate_id uuid references public.fin_tax_rates(id) on delete restrict;

alter table public.contract_invoice_lines
  add column tax_rule text not null default 'INHERIT'
    check (tax_rule in ('INHERIT', 'TAXABLE', 'EXEMPT')),
  add column tax_rate_id uuid references public.fin_tax_rates(id) on delete restrict,
  add column tax_rate numeric(8,6) not null default 0 check (tax_rate >= 0 and tax_rate <= 1),
  add column tax_amount numeric(18,2) not null default 0 check (tax_amount >= 0);

alter table public.contract_invoices
  add column tax_mode text not null default 'TAXABLE'
    check (tax_mode in ('TAXABLE', 'EXEMPT', 'MIXED')),
  add column tax_breakdown jsonb not null default '[]'::jsonb
    check (jsonb_typeof(tax_breakdown) = 'array'),
  add column exemption_certificate_number text,
  add column exemption_certificate_date date,
  add column exemption_note text;

alter table public.contract_payments
  add column amount_ttc numeric(18,2),
  add column amount_tva numeric(18,2),
  add column direction smallint not null default 1 check (direction in (-1, 1)),
  add column account_id uuid references public.fin_accounts(id) on delete restrict,
  add column payment_method_id uuid references public.fin_payment_methods(id) on delete restrict,
  add column financial_transaction_id uuid unique references public.fin_transactions(id) on delete restrict,
  add column reversal_of uuid unique references public.contract_payments(id) on delete restrict;

update public.contract_payments
set amount_ttc = amount_ht, amount_tva = 0
where amount_ttc is null;

alter table public.contract_payments
  alter column amount_ttc set not null,
  alter column amount_tva set not null,
  alter column amount_tva set default 0;

insert into public.fin_tax_rates(code, label_fr, rate, is_default)
values
  ('TVA19', 'TVA 19 %', 0.19, true),
  ('TVA09', 'TVA 9 %', 0.09, false),
  ('EXO', 'Exonéré', 0, false)
on conflict (code) do nothing;

insert into public.fin_payment_methods(code, label_fr, account_scope, legacy_contract_method, sort_order)
values
  ('VIREMENT', 'Virement', 'BANK', 'VIREMENT', 10),
  ('CHEQUE', 'Chèque', 'BANK', 'CHEQUE', 20),
  ('ESPECES', 'Espèces', 'CASH', 'ESPECES', 30),
  ('AUTRE', 'Autre', 'BOTH', 'AUTRE', 90)
on conflict (code) do nothing;

insert into public.fin_categories(code, label_fr, direction, account_scope, sort_order)
values
  ('ENCAISSEMENT_CLIENT', 'Encaissement client', 'IN', 'BOTH', 10),
  ('TRANSFERT_INTERNE', 'Transfert interne', 'BOTH', 'BOTH', 20),
  ('AVANCE_CAISSE', 'Avance de caisse', 'OUT', 'CASH', 30),
  ('RETOUR_AVANCE', 'Retour avance', 'IN', 'CASH', 40),
  ('FRAIS_BANCAIRES', 'Frais bancaires', 'OUT', 'BANK', 50),
  ('ACHAT', 'Achat', 'OUT', 'BOTH', 60),
  ('AUTRE_ENTREE', 'Autre entrée', 'IN', 'BOTH', 90),
  ('AUTRE_SORTIE', 'Autre sortie', 'OUT', 'BOTH', 91)
on conflict (code) do nothing;

create or replace function public.fin_can_access(
  p_action public.rbac_action,
  p_site_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.erp_has_perm('finance', p_action, p_site_id);
$$;

create or replace function public.fin_period_is_locked(
  p_account_id uuid,
  p_date date
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.fin_period_locks l
    join public.fin_accounts a on a.id = p_account_id
    where l.unlocked_at is null
      and p_date between l.start_date and l.end_date
      and (l.account_id = p_account_id or (l.account_id is null and l.site_id = a.site_id))
  );
$$;

create or replace function public.fin_account_balance(
  p_account_id uuid,
  p_as_of date default null
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select round(
    a.opening_balance
    + coalesce(sum(
      case when t.direction = 'IN' then t.amount else -t.amount end
    ) filter (where p_as_of is null or t.movement_date <= p_as_of), 0),
    2
  )
  from public.fin_accounts a
  left join public.fin_transactions t on t.account_id = a.id
  where a.id = p_account_id
  group by a.id, a.opening_balance;
$$;

create or replace function public.fin_post_transaction(
  p_account_id uuid,
  p_direction text,
  p_amount numeric,
  p_movement_date date,
  p_description text,
  p_category_id uuid default null,
  p_payment_method_id uuid default null,
  p_reference text default null,
  p_counterparty text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.fin_accounts%rowtype;
  v_id uuid := gen_random_uuid();
  v_balance numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_account from public.fin_accounts where id = p_account_id for update;
  if not found or not v_account.active then raise exception 'Active account not found'; end if;
  if not public.fin_can_access('create', v_account.site_id) then raise exception 'Permission denied'; end if;
  if p_direction not in ('IN', 'OUT') or p_amount is null or p_amount <= 0 then
    raise exception 'Invalid movement direction or amount';
  end if;
  if public.fin_period_is_locked(p_account_id, coalesce(p_movement_date, current_date)) then
    raise exception 'Financial period is locked';
  end if;
  if p_direction = 'OUT' and not v_account.allow_negative then
    v_balance := public.fin_account_balance(p_account_id, null);
    if p_amount > v_balance then raise exception 'Insufficient account balance'; end if;
  end if;

  insert into public.fin_transactions(
    id, account_id, site_id, movement_date, direction, amount, category_id,
    payment_method_id, reference, description, counterparty, created_by
  ) values (
    v_id, p_account_id, v_account.site_id, coalesce(p_movement_date, current_date),
    p_direction, round(p_amount, 2), p_category_id, p_payment_method_id,
    nullif(trim(p_reference), ''), trim(p_description), nullif(trim(p_counterparty), ''), auth.uid()
  );
  return jsonb_build_object('id', v_id, 'balance', public.fin_account_balance(p_account_id, null));
end;
$$;

create or replace function public.fin_post_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_movement_date date,
  p_description text,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from public.fin_accounts%rowtype;
  v_to public.fin_accounts%rowtype;
  v_group uuid := gen_random_uuid();
  v_out uuid := gen_random_uuid();
  v_in uuid := gen_random_uuid();
  v_category uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_from_account_id = p_to_account_id then raise exception 'Transfer accounts must differ'; end if;
  perform id from public.fin_accounts where id in (p_from_account_id, p_to_account_id) order by id for update;
  select * into v_from from public.fin_accounts where id = p_from_account_id;
  select * into v_to from public.fin_accounts where id = p_to_account_id;
  if v_from.id is null or v_to.id is null or not v_from.active or not v_to.active then
    raise exception 'Active accounts required';
  end if;
  if not public.fin_can_access('create', v_from.site_id) or not public.fin_can_access('create', v_to.site_id) then
    raise exception 'Permission denied';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if public.fin_period_is_locked(v_from.id, coalesce(p_movement_date, current_date))
     or public.fin_period_is_locked(v_to.id, coalesce(p_movement_date, current_date)) then
    raise exception 'Financial period is locked';
  end if;
  if not v_from.allow_negative and p_amount > public.fin_account_balance(v_from.id, null) then
    raise exception 'Insufficient source balance';
  end if;
  select id into v_category from public.fin_categories where code = 'TRANSFERT_INTERNE';

  insert into public.fin_transactions(
    id, account_id, site_id, movement_date, direction, amount, category_id,
    reference, description, counterparty, source_type, transfer_group_id, created_by
  ) values
    (v_out, v_from.id, v_from.site_id, coalesce(p_movement_date, current_date), 'OUT',
      round(p_amount, 2), v_category, nullif(trim(p_reference), ''), trim(p_description),
      v_to.name, 'TRANSFER', v_group, auth.uid()),
    (v_in, v_to.id, v_to.site_id, coalesce(p_movement_date, current_date), 'IN',
      round(p_amount, 2), v_category, nullif(trim(p_reference), ''), trim(p_description),
      v_from.name, 'TRANSFER', v_group, auth.uid());
  return jsonb_build_object('transfer_group_id', v_group, 'out_id', v_out, 'in_id', v_in);
end;
$$;

create or replace function public.fin_reverse_transaction(
  p_transaction_id uuid,
  p_reversal_date date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_original public.fin_transactions%rowtype;
  v_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_original from public.fin_transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if not public.fin_can_access('update', v_original.site_id) then raise exception 'Permission denied'; end if;
  if v_original.source_type <> 'MANUAL' then
    raise exception 'Use the source-specific reversal operation';
  end if;
  if v_original.reversal_of is not null or exists (
    select 1 from public.fin_transactions where reversal_of = v_original.id
  ) then raise exception 'Transaction already reversed or is a reversal'; end if;
  if v_original.reconciled_at is not null then raise exception 'Unreconcile transaction before reversal'; end if;
  if public.fin_period_is_locked(v_original.account_id, coalesce(p_reversal_date, current_date)) then
    raise exception 'Financial period is locked';
  end if;

  insert into public.fin_transactions(
    id, account_id, site_id, movement_date, direction, amount, category_id,
    payment_method_id, reference, description, counterparty, source_type,
    source_id, reversal_of, created_by
  ) values (
    v_id, v_original.account_id, v_original.site_id, coalesce(p_reversal_date, current_date),
    case when v_original.direction = 'IN' then 'OUT' else 'IN' end,
    v_original.amount, v_original.category_id, v_original.payment_method_id,
    v_original.reference, 'Annulation: ' || trim(p_reason), v_original.counterparty,
    'REVERSAL', v_original.id, v_original.id, auth.uid()
  );
  return jsonb_build_object('id', v_id, 'reversal_of', v_original.id);
end;
$$;

create or replace function public.fin_set_reconciliation(
  p_transaction_id uuid,
  p_reconciled boolean,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_tx public.fin_transactions%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_tx from public.fin_transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if not public.fin_can_access('update', v_tx.site_id) then raise exception 'Permission denied'; end if;
  update public.fin_transactions set
    reconciled_at = case when p_reconciled then now() else null end,
    reconciled_by = case when p_reconciled then auth.uid() else null end,
    reconciliation_reference = case when p_reconciled then nullif(trim(p_reference), '') else null end
  where id = p_transaction_id;
  return jsonb_build_object('id', p_transaction_id, 'reconciled', p_reconciled);
end;
$$;

create or replace function public.fin_reverse_transfer(
  p_transaction_id uuid,
  p_reversal_date date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seed public.fin_transactions%rowtype;
  v_row public.fin_transactions%rowtype;
  v_new_group uuid := gen_random_uuid();
  v_count int := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_seed from public.fin_transactions where id = p_transaction_id for update;
  if not found or v_seed.source_type <> 'TRANSFER' or v_seed.transfer_group_id is null then
    raise exception 'Transfer transaction not found';
  end if;
  perform id from public.fin_transactions
    where transfer_group_id = v_seed.transfer_group_id order by id for update;
  for v_row in
    select * from public.fin_transactions
    where transfer_group_id = v_seed.transfer_group_id and source_type = 'TRANSFER'
  loop
    if not public.fin_can_access('update', v_row.site_id) then raise exception 'Permission denied'; end if;
    if v_row.reconciled_at is not null then raise exception 'Unreconcile transfer before reversal'; end if;
    if public.fin_period_is_locked(v_row.account_id, coalesce(p_reversal_date, current_date)) then
      raise exception 'Financial period is locked';
    end if;
    if exists (select 1 from public.fin_transactions where reversal_of = v_row.id) then
      raise exception 'Transfer already reversed';
    end if;
    if v_row.direction = 'IN'
       and not (select allow_negative from public.fin_accounts where id = v_row.account_id)
       and v_row.amount > public.fin_account_balance(v_row.account_id, null) then
      raise exception 'Insufficient destination balance to reverse transfer';
    end if;
    insert into public.fin_transactions(
      account_id, site_id, movement_date, direction, amount, category_id,
      reference, description, counterparty, source_type, source_id,
      transfer_group_id, reversal_of, created_by
    ) values (
      v_row.account_id, v_row.site_id, coalesce(p_reversal_date, current_date),
      case when v_row.direction = 'IN' then 'OUT' else 'IN' end,
      v_row.amount, v_row.category_id, v_row.reference,
      'Annulation transfert: ' || trim(p_reason), v_row.counterparty,
      'REVERSAL', v_seed.transfer_group_id, v_new_group, v_row.id, auth.uid()
    );
    v_count := v_count + 1;
  end loop;
  if v_count <> 2 then raise exception 'Invalid transfer pair'; end if;
  return jsonb_build_object('transfer_group_id', v_new_group, 'reversed_group_id', v_seed.transfer_group_id);
end;
$$;

create sequence if not exists public.fin_cash_advance_seq;

create or replace function public.fin_issue_cash_advance(
  p_cash_account_id uuid,
  p_beneficiary_name text,
  p_amount numeric,
  p_issue_date date,
  p_purpose text,
  p_beneficiary_employee_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.fin_accounts%rowtype;
  v_advance_id uuid := gen_random_uuid();
  v_tx_id uuid := gen_random_uuid();
  v_number text;
  v_category uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_account from public.fin_accounts where id = p_cash_account_id for update;
  if not found or not v_account.active or v_account.account_type <> 'CASH' then
    raise exception 'Active cash account required';
  end if;
  if not public.fin_can_access('create', v_account.site_id) then raise exception 'Permission denied'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if not v_account.allow_negative and p_amount > public.fin_account_balance(v_account.id, null) then
    raise exception 'Insufficient cash balance';
  end if;
  if public.fin_period_is_locked(v_account.id, coalesce(p_issue_date, current_date)) then
    raise exception 'Financial period is locked';
  end if;
  v_number := 'AVC/' || extract(year from coalesce(p_issue_date, current_date))::int || '/' ||
    lpad(nextval('public.fin_cash_advance_seq')::text, 5, '0');
  select id into v_category from public.fin_categories where code = 'AVANCE_CAISSE';

  insert into public.fin_transactions(
    id, account_id, site_id, movement_date, direction, amount, category_id,
    description, counterparty, source_type, source_id, created_by
  ) values (
    v_tx_id, v_account.id, v_account.site_id, coalesce(p_issue_date, current_date),
    'OUT', round(p_amount, 2), v_category, trim(p_purpose), trim(p_beneficiary_name),
    'CASH_ADVANCE', v_advance_id, auth.uid()
  );
  insert into public.fin_cash_advances(
    id, advance_number, cash_account_id, site_id, beneficiary_employee_id,
    beneficiary_name, issue_date, amount, purpose, issue_transaction_id, created_by
  ) values (
    v_advance_id, v_number, v_account.id, v_account.site_id, p_beneficiary_employee_id,
    trim(p_beneficiary_name), coalesce(p_issue_date, current_date), round(p_amount, 2),
    trim(p_purpose), v_tx_id, auth.uid()
  );
  return jsonb_build_object('id', v_advance_id, 'advance_number', v_number, 'transaction_id', v_tx_id);
end;
$$;

create or replace function public.fin_cancel_cash_advance(
  p_advance_id uuid,
  p_cancellation_date date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_advance public.fin_cash_advances%rowtype;
  v_issue public.fin_transactions%rowtype;
  v_reversal_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_advance from public.fin_cash_advances where id = p_advance_id for update;
  if not found or v_advance.status <> 'OPEN' then raise exception 'Open advance not found'; end if;
  if not public.fin_can_access('update', v_advance.site_id) then raise exception 'Permission denied'; end if;
  if exists (select 1 from public.fin_cash_advance_expenses where advance_id = p_advance_id) then
    raise exception 'Advance with expenses must be settled, not cancelled';
  end if;
  select * into v_issue from public.fin_transactions where id = v_advance.issue_transaction_id for update;
  if v_issue.reconciled_at is not null then raise exception 'Unreconcile advance before cancellation'; end if;
  if public.fin_period_is_locked(v_advance.cash_account_id, coalesce(p_cancellation_date, current_date)) then
    raise exception 'Financial period is locked';
  end if;
  insert into public.fin_transactions(
    id, account_id, site_id, movement_date, direction, amount, category_id,
    reference, description, counterparty, source_type, source_id, reversal_of, created_by
  ) values (
    v_reversal_id, v_issue.account_id, v_issue.site_id, coalesce(p_cancellation_date, current_date),
    'IN', v_issue.amount, v_issue.category_id, v_issue.reference,
    'Annulation avance: ' || trim(p_reason), v_issue.counterparty, 'REVERSAL',
    v_advance.id, v_issue.id, auth.uid()
  );
  update public.fin_cash_advances set
    status = 'CANCELLED', settled_at = now(), settled_by = auth.uid(),
    settlement_note = trim(p_reason), return_transaction_id = v_reversal_id
  where id = p_advance_id;
  return jsonb_build_object('id', p_advance_id, 'status', 'CANCELLED', 'transaction_id', v_reversal_id);
end;
$$;

create or replace function public.fin_settle_cash_advance(
  p_advance_id uuid,
  p_return_amount numeric,
  p_settlement_date date,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_advance public.fin_cash_advances%rowtype;
  v_expenses numeric;
  v_return numeric := round(coalesce(p_return_amount, 0), 2);
  v_tx_id uuid;
  v_category uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_advance from public.fin_cash_advances where id = p_advance_id for update;
  if not found or v_advance.status <> 'OPEN' then raise exception 'Open advance not found'; end if;
  if not public.fin_can_access('update', v_advance.site_id) then raise exception 'Permission denied'; end if;
  select coalesce(sum(amount), 0) into v_expenses
  from public.fin_cash_advance_expenses where advance_id = p_advance_id;
  if v_return < 0 or round(v_expenses + v_return, 2) <> v_advance.amount then
    raise exception 'Expenses (%) + return (%) must equal advance (%)', v_expenses, v_return, v_advance.amount;
  end if;
  if public.fin_period_is_locked(v_advance.cash_account_id, coalesce(p_settlement_date, current_date)) then
    raise exception 'Financial period is locked';
  end if;
  if v_return > 0 then
    v_tx_id := gen_random_uuid();
    select id into v_category from public.fin_categories where code = 'RETOUR_AVANCE';
    insert into public.fin_transactions(
      id, account_id, site_id, movement_date, direction, amount, category_id,
      description, counterparty, source_type, source_id, created_by
    ) values (
      v_tx_id, v_advance.cash_account_id, v_advance.site_id,
      coalesce(p_settlement_date, current_date), 'IN', v_return, v_category,
      'Retour ' || v_advance.advance_number, v_advance.beneficiary_name,
      'CASH_RETURN', v_advance.id, auth.uid()
    );
  end if;
  update public.fin_cash_advances set
    status = 'SETTLED', return_transaction_id = v_tx_id,
    settled_at = now(), settled_by = auth.uid(), settlement_note = nullif(trim(p_note), '')
  where id = p_advance_id;
  return jsonb_build_object('id', p_advance_id, 'status', 'SETTLED', 'expenses', v_expenses, 'returned', v_return);
end;
$$;

create or replace function public.fin_transaction_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Financial transactions are append-only; use reversal';
  end if;
  if row(
    new.account_id, new.site_id, new.movement_date, new.value_date, new.direction,
    new.amount, new.category_id, new.payment_method_id, new.reference,
    new.description, new.counterparty, new.source_type, new.source_id,
    new.transfer_group_id, new.reversal_of, new.created_by, new.created_at
  ) is distinct from row(
    old.account_id, old.site_id, old.movement_date, old.value_date, old.direction,
    old.amount, old.category_id, old.payment_method_id, old.reference,
    old.description, old.counterparty, old.source_type, old.source_id,
    old.transfer_group_id, old.reversal_of, old.created_by, old.created_at
  ) then
    raise exception 'Economic transaction fields are immutable';
  end if;
  return new;
end;
$$;

create or replace function public.fin_tax_rate_default_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.is_default then
    update public.fin_tax_rates set is_default = false
    where is_default and id <> new.id;
  end if;
  return new;
end;
$$;

create trigger trg_fin_tax_rate_default
before insert or update of is_default on public.fin_tax_rates
for each row execute function public.fin_tax_rate_default_guard();

create trigger trg_fin_transactions_guard
before update or delete on public.fin_transactions
for each row execute function public.fin_transaction_guard();

create or replace function public.fin_cash_expense_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_status text;
begin
  if tg_op = 'DELETE' then
    select status into v_status from public.fin_cash_advances where id = old.advance_id;
  else
    select status into v_status from public.fin_cash_advances where id = new.advance_id;
  end if;
  if v_status <> 'OPEN' then raise exception 'Only open advance expenses can be changed'; end if;
  if tg_op <> 'DELETE' and (
    select coalesce(sum(amount), 0)
      - case when tg_op = 'UPDATE' then old.amount else 0 end
      + new.amount
    from public.fin_cash_advance_expenses
    where advance_id = new.advance_id
  ) > (select amount from public.fin_cash_advances where id = new.advance_id) then
    raise exception 'Expense total cannot exceed advance amount';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_fin_cash_expense_guard
before insert or update or delete on public.fin_cash_advance_expenses
for each row execute function public.fin_cash_expense_guard();

create or replace function public.fin_account_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.fin_transactions where account_id = old.id)
     and row(new.opening_balance, new.opening_date, new.currency_code, new.account_type)
       is distinct from
       row(old.opening_balance, old.opening_date, old.currency_code, old.account_type) then
    raise exception 'Opening balance, date, currency and type are immutable after first movement';
  end if;
  return new;
end;
$$;

create trigger trg_fin_accounts_guard before update on public.fin_accounts
for each row execute function public.fin_account_guard();

create trigger trg_fin_tax_rates_updated before update on public.fin_tax_rates
for each row execute function public.erp_set_updated_at();
create trigger trg_fin_payment_methods_updated before update on public.fin_payment_methods
for each row execute function public.erp_set_updated_at();
create trigger trg_fin_categories_updated before update on public.fin_categories
for each row execute function public.erp_set_updated_at();
create trigger trg_fin_accounts_updated before update on public.fin_accounts
for each row execute function public.erp_set_updated_at();
create trigger trg_fin_cash_advances_updated before update on public.fin_cash_advances
for each row execute function public.erp_set_updated_at();

create trigger trg_fin_tax_rates_audit after insert or update or delete on public.fin_tax_rates
for each row execute function public.sys_audit_row_change();
create trigger trg_fin_payment_methods_audit after insert or update or delete on public.fin_payment_methods
for each row execute function public.sys_audit_row_change();
create trigger trg_fin_categories_audit after insert or update or delete on public.fin_categories
for each row execute function public.sys_audit_row_change();
create trigger trg_fin_accounts_audit after insert or update or delete on public.fin_accounts
for each row execute function public.sys_audit_row_change();
create trigger trg_fin_transactions_audit after insert or update or delete on public.fin_transactions
for each row execute function public.sys_audit_row_change();
create trigger trg_fin_period_locks_audit after insert or update or delete on public.fin_period_locks
for each row execute function public.sys_audit_row_change();
create trigger trg_fin_cash_advances_audit after insert or update or delete on public.fin_cash_advances
for each row execute function public.sys_audit_row_change();
create trigger trg_fin_cash_advance_expenses_audit after insert or update or delete on public.fin_cash_advance_expenses
for each row execute function public.sys_audit_row_change();

alter table public.fin_tax_rates enable row level security;
alter table public.fin_payment_methods enable row level security;
alter table public.fin_categories enable row level security;
alter table public.fin_accounts enable row level security;
alter table public.fin_period_locks enable row level security;
alter table public.fin_transactions enable row level security;
alter table public.fin_cash_advances enable row level security;
alter table public.fin_cash_advance_expenses enable row level security;

create policy fin_tax_rates_read on public.fin_tax_rates for select to authenticated
using (auth.uid() is not null);
create policy fin_tax_rates_write on public.fin_tax_rates for all to authenticated
using (public.erp_has_perm('finance_settings', 'update', null))
with check (public.erp_has_perm('finance_settings', 'update', null));
create policy fin_payment_methods_read on public.fin_payment_methods for select to authenticated
using (auth.uid() is not null);
create policy fin_payment_methods_write on public.fin_payment_methods for all to authenticated
using (public.erp_has_perm('finance_settings', 'update', null))
with check (public.erp_has_perm('finance_settings', 'update', null));
create policy fin_categories_read on public.fin_categories for select to authenticated
using (public.fin_can_access('read'));
create policy fin_categories_write on public.fin_categories for all to authenticated
using (public.erp_has_perm('finance_settings', 'update', null))
with check (public.erp_has_perm('finance_settings', 'update', null));

create policy fin_accounts_read on public.fin_accounts for select to authenticated
using (public.fin_can_access('read', site_id));
create policy fin_accounts_write on public.fin_accounts for all to authenticated
using (public.erp_has_perm('finance_settings', 'update', site_id))
with check (public.erp_has_perm('finance_settings', 'update', site_id));
create policy fin_period_locks_read on public.fin_period_locks for select to authenticated
using (public.fin_can_access('read', site_id));
create policy fin_period_locks_write on public.fin_period_locks for all to authenticated
using (public.erp_has_perm('finance_settings', 'update', site_id))
with check (public.erp_has_perm('finance_settings', 'update', site_id));
create policy fin_transactions_read on public.fin_transactions for select to authenticated
using (public.fin_can_access('read', site_id));
create policy fin_transactions_insert on public.fin_transactions for insert to authenticated
with check (public.fin_can_access('create', site_id));
create policy fin_transactions_update on public.fin_transactions for update to authenticated
using (public.fin_can_access('update', site_id))
with check (public.fin_can_access('update', site_id));
create policy fin_cash_advances_read on public.fin_cash_advances for select to authenticated
using (public.fin_can_access('read', site_id));
create policy fin_cash_advances_write on public.fin_cash_advances for all to authenticated
using (public.fin_can_access('update', site_id))
with check (public.fin_can_access('create', site_id));
create policy fin_cash_expenses_read on public.fin_cash_advance_expenses for select to authenticated
using (exists (
  select 1 from public.fin_cash_advances a
  where a.id = advance_id and public.fin_can_access('read', a.site_id)
));
create policy fin_cash_expenses_write on public.fin_cash_advance_expenses for all to authenticated
using (exists (
  select 1 from public.fin_cash_advances a
  where a.id = advance_id and public.fin_can_access('update', a.site_id)
))
with check (exists (
  select 1 from public.fin_cash_advances a
  where a.id = advance_id and public.fin_can_access('create', a.site_id)
));

grant select, insert, update, delete on public.fin_tax_rates to authenticated;
grant select, insert, update, delete on public.fin_payment_methods to authenticated;
grant select, insert, update, delete on public.fin_categories to authenticated;
grant select, insert, update, delete on public.fin_accounts to authenticated;
grant select, insert, update, delete on public.fin_period_locks to authenticated;
grant select, insert, update on public.fin_transactions to authenticated;
grant select, insert, update on public.fin_cash_advances to authenticated;
grant select, insert, update, delete on public.fin_cash_advance_expenses to authenticated;
grant usage, select on sequence public.fin_cash_advance_seq to authenticated;

grant execute on function public.fin_can_access(public.rbac_action, uuid) to authenticated;
grant execute on function public.fin_period_is_locked(uuid, date) to authenticated;
grant execute on function public.fin_account_balance(uuid, date) to authenticated;
grant execute on function public.fin_post_transaction(uuid, text, numeric, date, text, uuid, uuid, text, text) to authenticated;
grant execute on function public.fin_post_transfer(uuid, uuid, numeric, date, text, text) to authenticated;
grant execute on function public.fin_reverse_transaction(uuid, date, text) to authenticated;
grant execute on function public.fin_reverse_transfer(uuid, date, text) to authenticated;
grant execute on function public.fin_set_reconciliation(uuid, boolean, text) to authenticated;
grant execute on function public.fin_issue_cash_advance(uuid, text, numeric, date, text, uuid) to authenticated;
grant execute on function public.fin_cancel_cash_advance(uuid, date, text) to authenticated;
grant execute on function public.fin_settle_cash_advance(uuid, numeric, date, text) to authenticated;

commit;
