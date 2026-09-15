-- =============================================================================
-- Facturation commerciale + achats A->Z.
-- Configurable situation types, legal stamp rules, RG on HT, split
-- fourniture/pose, and Proforma -> BC -> receptions -> supplier invoices.
-- =============================================================================

begin;

insert into public.sys_screens (code, module, label_fr, path, sort_order)
values
  ('purchases', 'achats', 'Achats & fournisseurs', '/achats', 410),
  ('purchase_settings', 'achats', 'Paramètres achats & facturation', '/achats/parametres', 420)
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
  and s.code in ('purchases', 'purchase_settings')
on conflict (role_id, screen_id) do update set
  can_create = true, can_read = true, can_update = true, can_delete = true,
  can_print = true, can_export = true;

insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select r.id, s.id, true, true, true, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code = 'GERANT' and s.code = 'purchases'
on conflict (role_id, screen_id) do update set
  can_create = true, can_read = true, can_update = true, can_delete = false,
  can_print = true, can_export = true;

insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select r.id, s.id, false, true, false, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code = 'READ_ONLY' and s.code = 'purchases'
on conflict (role_id, screen_id) do update set
  can_create = false, can_read = true, can_update = false, can_delete = false,
  can_print = true, can_export = true;

create table public.ref_situation_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(trim(code)) and char_length(code) between 1 and 40),
  label_fr text not null check (char_length(trim(label_fr)) between 1 and 160),
  label_ar text,
  includes_supply boolean not null default false,
  includes_installation boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (includes_supply or includes_installation)
);

insert into public.ref_situation_types
  (code, label_fr, label_ar, includes_supply, includes_installation, sort_order)
values
  ('P_POSE', 'P. POSE', 'تركيب', false, true, 10),
  ('F_FOURNITURE', 'F. FOURNITURE', 'توريد', true, false, 20),
  ('FP_FOURNITURE_POSE', 'F.P. FOURNITURE ET POSE', 'توريد وتركيب', true, true, 30)
on conflict (code) do nothing;

create table public.fin_stamp_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(trim(code)) and char_length(code) between 1 and 40),
  label_fr text not null check (char_length(trim(label_fr)) between 1 and 160),
  calculation_mode text not null check (calculation_mode in ('FIXED', 'PERCENT', 'BRACKETS')),
  calculation_base text not null default 'TTC' check (calculation_base in ('HT', 'TVA', 'TTC')),
  fixed_amount numeric(18,2) check (fixed_amount is null or fixed_amount >= 0),
  rate numeric(10,8) check (rate is null or (rate >= 0 and rate <= 1)),
  brackets jsonb not null default '[]'::jsonb check (jsonb_typeof(brackets) = 'array'),
  payment_method_id uuid references public.fin_payment_methods(id) on delete restrict,
  valid_from date,
  valid_to date,
  priority integer not null default 100,
  active boolean not null default true,
  legal_reference text,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from),
  check (
    (calculation_mode = 'FIXED' and fixed_amount is not null)
    or (calculation_mode = 'PERCENT' and rate is not null)
    or (calculation_mode = 'BRACKETS' and jsonb_array_length(brackets) > 0)
  )
);

create table public.pur_number_sequences (
  document_type text primary key check (document_type in ('PROFORMA', 'ORDER', 'RECEIPT', 'SUPPLIER_INVOICE')),
  prefix text not null check (char_length(trim(prefix)) between 1 and 20),
  padding smallint not null default 5 check (padding between 2 and 10),
  include_year boolean not null default true,
  next_value bigint not null default 1 check (next_value > 0),
  updated_at timestamptz not null default now()
);

insert into public.pur_number_sequences(document_type, prefix, padding, include_year)
values
  ('PROFORMA', 'PRO', 5, true),
  ('ORDER', 'BC', 5, true),
  ('RECEIPT', 'BR', 5, true),
  ('SUPPLIER_INVOICE', 'FF', 5, true)
on conflict (document_type) do nothing;

create table public.pur_document_profiles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(trim(code)) and char_length(code) between 1 and 40),
  label_fr text not null check (char_length(trim(label_fr)) between 1 and 160),
  legal_name text not null check (char_length(trim(legal_name)) between 1 and 200),
  address text,
  city text,
  phone text,
  email text,
  nif text,
  nis text,
  rc text,
  ai text,
  capital text,
  bank_details text,
  footer text,
  active boolean not null default true,
  is_default boolean not null default false check (not is_default or active),
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pur_suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(trim(code)) and char_length(code) between 1 and 40),
  legal_name text not null check (char_length(trim(legal_name)) between 1 and 200),
  trade_name text,
  nif text,
  nis text,
  rc text,
  ai text,
  address text,
  city text,
  phone text,
  email text,
  contact_name text,
  payment_terms_days integer not null default 0 check (payment_terms_days >= 0),
  bank_details text,
  active boolean not null default true,
  notes text,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pur_proformas (
  id uuid primary key default gen_random_uuid(),
  proforma_number text not null unique,
  supplier_id uuid not null references public.pur_suppliers(id) on delete restrict,
  site_id uuid references public.ref_sites(id) on delete restrict,
  supplier_reference text,
  proforma_date date not null default current_date,
  validity_date date,
  currency_code text not null default 'DZD' check (currency_code = upper(trim(currency_code)) and char_length(currency_code) = 3),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'APPROVED', 'CANCELLED')),
  total_ht numeric(18,2) not null default 0 check (total_ht >= 0),
  total_tva numeric(18,2) not null default 0 check (total_tva >= 0),
  total_ttc numeric(18,2) not null default 0 check (total_ttc >= 0),
  delivery_terms text,
  payment_terms text,
  attachment_url text,
  note text,
  approved_at timestamptz,
  approved_by uuid references public.sys_users(id),
  created_by uuid not null references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pur_proforma_lines (
  id uuid primary key default gen_random_uuid(),
  proforma_id uuid not null references public.pur_proformas(id) on delete cascade,
  item_code text not null,
  designation text not null,
  unit text not null,
  quantity numeric(18,4) not null check (quantity > 0),
  supply_unit_price_ht numeric(18,4) not null default 0 check (supply_unit_price_ht >= 0),
  installation_unit_price_ht numeric(18,4) not null default 0 check (installation_unit_price_ht >= 0),
  unit_price_ht numeric(18,4) not null check (unit_price_ht >= 0),
  total_ht numeric(18,2) not null check (total_ht >= 0),
  tax_rate_id uuid references public.fin_tax_rates(id) on delete restrict,
  tax_rate numeric(8,6) not null default 0 check (tax_rate between 0 and 1),
  tax_amount numeric(18,2) not null default 0 check (tax_amount >= 0),
  situation_type_id uuid references public.ref_situation_types(id) on delete restrict,
  sort_order integer not null default 0
);

create table public.pur_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  proforma_id uuid references public.pur_proformas(id) on delete restrict,
  document_profile_id uuid references public.pur_document_profiles(id) on delete restrict,
  issuer_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(issuer_snapshot) = 'object'),
  supplier_id uuid not null references public.pur_suppliers(id) on delete restrict,
  site_id uuid references public.ref_sites(id) on delete restrict,
  order_date date not null default current_date,
  expected_delivery_date date,
  delivery_address text,
  currency_code text not null default 'DZD',
  status text not null default 'DRAFT' check (
    status in ('DRAFT', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED')
  ),
  revision integer not null default 0 check (revision >= 0),
  total_ht numeric(18,2) not null default 0 check (total_ht >= 0),
  total_tva numeric(18,2) not null default 0 check (total_tva >= 0),
  total_ttc numeric(18,2) not null default 0 check (total_ttc >= 0),
  payment_terms text,
  note text,
  approved_at timestamptz,
  approved_by uuid references public.sys_users(id),
  sent_at timestamptz,
  created_by uuid not null references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pur_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pur_orders(id) on delete cascade,
  source_proforma_line_id uuid references public.pur_proforma_lines(id) on delete restrict,
  item_code text not null,
  designation text not null,
  unit text not null,
  quantity numeric(18,4) not null check (quantity > 0),
  supply_unit_price_ht numeric(18,4) not null default 0 check (supply_unit_price_ht >= 0),
  installation_unit_price_ht numeric(18,4) not null default 0 check (installation_unit_price_ht >= 0),
  unit_price_ht numeric(18,4) not null check (unit_price_ht >= 0),
  total_ht numeric(18,2) not null check (total_ht >= 0),
  tax_rate_id uuid references public.fin_tax_rates(id) on delete restrict,
  tax_rate numeric(8,6) not null default 0 check (tax_rate between 0 and 1),
  tax_amount numeric(18,2) not null default 0 check (tax_amount >= 0),
  situation_type_id uuid references public.ref_situation_types(id) on delete restrict,
  sort_order integer not null default 0
);

create table public.pur_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  order_id uuid not null references public.pur_orders(id) on delete restrict,
  receipt_date date not null default current_date,
  delivery_note_number text,
  status text not null default 'POSTED' check (status in ('POSTED', 'CANCELLED')),
  received_by_name text,
  note text,
  created_by uuid not null references public.sys_users(id),
  created_at timestamptz not null default now()
);

create table public.pur_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.pur_receipts(id) on delete restrict,
  order_line_id uuid not null references public.pur_order_lines(id) on delete restrict,
  quantity numeric(18,4) not null check (quantity > 0),
  accepted_quantity numeric(18,4) not null check (accepted_quantity >= 0 and accepted_quantity <= quantity),
  rejected_quantity numeric(18,4) generated always as (quantity - accepted_quantity) stored,
  note text,
  unique (receipt_id, order_line_id)
);

create table public.pur_supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  internal_number text not null unique,
  supplier_invoice_number text not null,
  supplier_id uuid not null references public.pur_suppliers(id) on delete restrict,
  order_id uuid not null references public.pur_orders(id) on delete restrict,
  invoice_date date not null default current_date,
  due_date date,
  status text not null default 'POSTED' check (status in ('POSTED', 'CANCELLED')),
  total_supply_ht numeric(18,2) not null default 0,
  total_installation_ht numeric(18,2) not null default 0,
  total_ht numeric(18,2) not null default 0,
  total_tva numeric(18,2) not null default 0,
  total_ttc numeric(18,2) not null default 0,
  retention_rate numeric(8,6) not null default 0 check (retention_rate between 0 and 1),
  retention_amount numeric(18,2) not null default 0 check (retention_amount >= 0),
  retention_status text not null default 'NONE' check (retention_status in ('NONE', 'HELD', 'RELEASED')),
  retention_due_date date,
  retention_released_at timestamptz,
  stamp_rule_id uuid references public.fin_stamp_rules(id) on delete restrict,
  stamp_amount numeric(18,2) not null default 0 check (stamp_amount >= 0),
  net_payable numeric(18,2) not null default 0 check (net_payable >= 0),
  tax_breakdown jsonb not null default '[]'::jsonb check (jsonb_typeof(tax_breakdown) = 'array'),
  attachment_url text,
  note text,
  created_by uuid not null references public.sys_users(id),
  created_at timestamptz not null default now(),
  unique (supplier_id, supplier_invoice_number)
);

create table public.pur_supplier_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  supplier_invoice_id uuid not null references public.pur_supplier_invoices(id) on delete restrict,
  order_line_id uuid not null references public.pur_order_lines(id) on delete restrict,
  item_code text not null,
  designation text not null,
  unit text not null,
  quantity numeric(18,4) not null check (quantity > 0),
  supply_unit_price_ht numeric(18,4) not null default 0,
  installation_unit_price_ht numeric(18,4) not null default 0,
  unit_price_ht numeric(18,4) not null check (unit_price_ht >= 0),
  total_ht numeric(18,2) not null check (total_ht >= 0),
  tax_rate_id uuid references public.fin_tax_rates(id) on delete restrict,
  tax_rate numeric(8,6) not null default 0 check (tax_rate between 0 and 1),
  tax_amount numeric(18,2) not null default 0 check (tax_amount >= 0),
  sort_order integer not null default 0
);

create table public.pur_supplier_invoice_receipts (
  supplier_invoice_id uuid not null references public.pur_supplier_invoices(id) on delete restrict,
  receipt_id uuid not null references public.pur_receipts(id) on delete restrict,
  primary key (supplier_invoice_id, receipt_id)
);

create table public.pur_supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_invoice_id uuid not null references public.pur_supplier_invoices(id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric(18,2) not null check (amount > 0),
  direction smallint not null default 1 check (direction in (-1, 1)),
  account_id uuid not null references public.fin_accounts(id) on delete restrict,
  payment_method_id uuid not null references public.fin_payment_methods(id) on delete restrict,
  reference text,
  note text,
  financial_transaction_id uuid not null unique references public.fin_transactions(id) on delete restrict,
  reversal_of uuid unique references public.pur_supplier_payments(id) on delete restrict,
  created_by uuid not null references public.sys_users(id),
  created_at timestamptz not null default now()
);

alter table public.contract_items
  add column supply_unit_price_ht numeric(18,4) not null default 0 check (supply_unit_price_ht >= 0),
  add column installation_unit_price_ht numeric(18,4) not null default 0 check (installation_unit_price_ht >= 0),
  add column situation_type_id uuid references public.ref_situation_types(id) on delete restrict;

update public.contract_items
set supply_unit_price_ht = unit_price_ht, installation_unit_price_ht = 0;

create or replace function public.contract_item_price_split_guard()
returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if coalesce(new.supply_unit_price_ht, 0) + coalesce(new.installation_unit_price_ht, 0) = 0
     and new.unit_price_ht > 0 then
    if new.item_type = 'LABOR' then
      new.installation_unit_price_ht := new.unit_price_ht;
    else
      new.supply_unit_price_ht := new.unit_price_ht;
    end if;
  else
    new.unit_price_ht := coalesce(new.supply_unit_price_ht, 0)
      + coalesce(new.installation_unit_price_ht, 0);
  end if;
  new.total_price_ht := round(new.quantity * new.unit_price_ht, 2);
  return new;
end;
$$;

create trigger trg_contract_item_price_split
before insert or update of quantity, unit_price_ht, supply_unit_price_ht, installation_unit_price_ht
on public.contract_items
for each row execute function public.contract_item_price_split_guard();

alter table public.contract_invoice_lines
  add column supply_unit_price_ht numeric(18,4) not null default 0,
  add column installation_unit_price_ht numeric(18,4) not null default 0,
  add column supply_total_ht numeric(18,2) not null default 0,
  add column installation_total_ht numeric(18,2) not null default 0,
  add column situation_type_id uuid references public.ref_situation_types(id) on delete restrict;

alter table public.contract_invoices
  add column situation_type_id uuid references public.ref_situation_types(id) on delete restrict,
  add column expected_payment_method_id uuid references public.fin_payment_methods(id) on delete restrict,
  add column total_supply_ht numeric(18,2) not null default 0,
  add column total_installation_ht numeric(18,2) not null default 0,
  add column retention_rate numeric(8,6) not null default 0 check (retention_rate between 0 and 1),
  add column retention_amount numeric(18,2) not null default 0 check (retention_amount >= 0),
  add column retention_status text not null default 'NONE' check (retention_status in ('NONE', 'HELD', 'RELEASED')),
  add column retention_due_date date,
  add column retention_released_at timestamptz,
  add column stamp_rule_id uuid references public.fin_stamp_rules(id) on delete restrict,
  add column stamp_amount numeric(18,2) not null default 0 check (stamp_amount >= 0),
  add column net_payable numeric(18,2) not null default 0 check (net_payable >= 0);

update public.contract_invoice_lines l
set supply_unit_price_ht = l.unit_price_ht,
    supply_total_ht = l.total_price_ht;

update public.contract_invoices
set total_supply_ht = total_ht, net_payable = total_ttc;

alter table public.fin_transactions drop constraint if exists fin_transactions_source_type_check;
alter table public.fin_transactions add constraint fin_transactions_source_type_check check (
  source_type in (
    'MANUAL', 'TRANSFER', 'CUSTOMER_PAYMENT', 'SUPPLIER_PAYMENT',
    'CASH_ADVANCE', 'CASH_RETURN', 'REVERSAL'
  )
);

insert into public.fin_categories(code, label_fr, direction, account_scope, sort_order)
values ('PAIEMENT_FOURNISSEUR', 'Paiement fournisseur', 'OUT', 'BOTH', 15)
on conflict (code) do nothing;

create index pur_proformas_supplier_idx on public.pur_proformas(supplier_id, proforma_date desc);
create index pur_orders_supplier_idx on public.pur_orders(supplier_id, order_date desc);
create index pur_order_lines_order_idx on public.pur_order_lines(order_id);
create index pur_receipts_order_idx on public.pur_receipts(order_id, receipt_date desc);
create index pur_supplier_invoices_order_idx on public.pur_supplier_invoices(order_id, invoice_date desc);
create index pur_supplier_payments_invoice_idx on public.pur_supplier_payments(supplier_invoice_id, payment_date desc);

create or replace function public.pur_can_access(p_action public.rbac_action, p_site_id uuid default null)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select auth.uid() is not null and public.erp_has_perm('purchases', p_action, p_site_id);
$$;

create or replace function public.pur_next_number(p_document_type text, p_date date default current_date)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_seq public.pur_number_sequences%rowtype;
  v_value bigint;
begin
  if not public.pur_can_access('create'::public.rbac_action, null) then
    raise exception 'Permission denied';
  end if;
  select * into v_seq from public.pur_number_sequences
  where document_type = p_document_type for update;
  if not found then raise exception 'Unknown document type %', p_document_type; end if;
  v_value := v_seq.next_value;
  update public.pur_number_sequences
  set next_value = next_value + 1, updated_at = now()
  where document_type = p_document_type;
  return v_seq.prefix
    || case when v_seq.include_year then '/' || extract(year from coalesce(p_date, current_date))::int::text else '' end
    || '/' || lpad(v_value::text, v_seq.padding, '0');
end;
$$;

create or replace function public.fin_calculate_stamp(
  p_rule_id uuid,
  p_document_date date,
  p_total_ht numeric,
  p_total_tva numeric,
  p_total_ttc numeric
)
returns numeric
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_rule public.fin_stamp_rules%rowtype;
  v_base numeric;
  v_amount numeric := 0;
  v_bracket jsonb;
begin
  if p_rule_id is null then return 0; end if;
  select * into v_rule from public.fin_stamp_rules
  where id = p_rule_id and active
    and (valid_from is null or valid_from <= coalesce(p_document_date, current_date))
    and (valid_to is null or valid_to >= coalesce(p_document_date, current_date));
  if not found then raise exception 'Stamp rule inactive or outside validity period'; end if;
  v_base := case v_rule.calculation_base
    when 'HT' then p_total_ht when 'TVA' then p_total_tva else p_total_ttc end;
  if v_rule.calculation_mode = 'FIXED' then
    v_amount := v_rule.fixed_amount;
  elsif v_rule.calculation_mode = 'PERCENT' then
    v_amount := v_base * v_rule.rate;
  else
    for v_bracket in select value from jsonb_array_elements(v_rule.brackets)
    loop
      if v_base >= coalesce((v_bracket->>'from')::numeric, 0)
         and (nullif(v_bracket->>'to', '') is null or v_base <= (v_bracket->>'to')::numeric) then
        v_amount := coalesce((v_bracket->>'amount')::numeric, 0);
        exit;
      end if;
    end loop;
  end if;
  return greatest(round(coalesce(v_amount, 0), 2), 0);
end;
$$;

create or replace function public.ref_contract_configure_invoice(
  p_invoice_id uuid,
  p_situation_type_id uuid default null,
  p_expected_payment_method_id uuid default null,
  p_retention_rate numeric default 0,
  p_retention_due_date date default null,
  p_stamp_rule_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_contract_id uuid;
  v_site_id uuid;
  v_status public.contract_invoice_status;
  v_total_ht numeric;
  v_total_tva numeric;
  v_total_ttc numeric;
  v_invoice_date date;
  v_supply numeric;
  v_installation numeric;
  v_rg numeric;
  v_stamp numeric;
begin
  select i.contract_id, c.site_id, i.status, i.total_ht, i.tva_amount, i.total_ttc, i.invoice_date
  into v_contract_id, v_site_id, v_status, v_total_ht, v_total_tva, v_total_ttc, v_invoice_date
  from public.contract_invoices i join public.ref_contracts c on c.id = i.contract_id
  where i.id = p_invoice_id for update of i;
  if not found then raise exception 'Invoice not found'; end if;
  if v_status <> 'BROUILLON' then raise exception 'Only draft invoice can be configured'; end if;
  if not public.erp_has_perm('client_contracts', 'update'::public.rbac_action, v_site_id) then
    raise exception 'Permission denied';
  end if;
  if coalesce(p_retention_rate, 0) < 0 or coalesce(p_retention_rate, 0) > 1 then
    raise exception 'Retention rate must be between 0 and 1';
  end if;

  update public.contract_invoice_lines l
  set supply_unit_price_ht = ci.supply_unit_price_ht,
      installation_unit_price_ht = ci.installation_unit_price_ht,
      supply_total_ht = round(l.quantity * ci.supply_unit_price_ht, 2),
      installation_total_ht = round(l.quantity * ci.installation_unit_price_ht, 2),
      situation_type_id = coalesce(p_situation_type_id, ci.situation_type_id)
  from public.contract_items ci where ci.id = l.contract_item_id and l.invoice_id = p_invoice_id;

  select coalesce(sum(supply_total_ht), 0), coalesce(sum(installation_total_ht), 0)
  into v_supply, v_installation
  from public.contract_invoice_lines where invoice_id = p_invoice_id;
  v_rg := round(v_total_ht * coalesce(p_retention_rate, 0), 2);
  v_stamp := public.fin_calculate_stamp(p_stamp_rule_id, v_invoice_date, v_total_ht, v_total_tva, v_total_ttc);

  update public.contract_invoices set
    situation_type_id = p_situation_type_id,
    expected_payment_method_id = p_expected_payment_method_id,
    total_supply_ht = v_supply,
    total_installation_ht = v_installation,
    retention_rate = coalesce(p_retention_rate, 0),
    retention_amount = v_rg,
    retention_status = case when v_rg > 0 then 'HELD' else 'NONE' end,
    retention_due_date = p_retention_due_date,
    stamp_rule_id = p_stamp_rule_id,
    stamp_amount = v_stamp,
    net_payable = greatest(round(v_total_ttc + v_stamp - v_rg, 2), 0)
  where id = p_invoice_id;

  return jsonb_build_object(
    'id', p_invoice_id, 'total_supply_ht', v_supply, 'total_installation_ht', v_installation,
    'retention_amount', v_rg, 'stamp_amount', v_stamp,
    'net_payable', greatest(round(v_total_ttc + v_stamp - v_rg, 2), 0)
  );
end;
$$;

create or replace function public.pur_create_proforma(
  p_supplier_id uuid,
  p_site_id uuid,
  p_proforma_number text,
  p_supplier_reference text,
  p_proforma_date date,
  p_validity_date date,
  p_currency_code text,
  p_delivery_terms text,
  p_payment_terms text,
  p_attachment_url text,
  p_note text,
  p_lines jsonb
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
  v_number text;
  v_line jsonb;
  v_rate numeric;
  v_unit numeric;
  v_ht numeric;
  v_tax numeric;
  v_total_ht numeric := 0;
  v_total_tva numeric := 0;
  v_idx integer := 0;
begin
  if not public.pur_can_access('create'::public.rbac_action, p_site_id) then raise exception 'Permission denied'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'At least one line required'; end if;
  v_number := coalesce(nullif(trim(p_proforma_number), ''), public.pur_next_number('PROFORMA', p_proforma_date));
  insert into public.pur_proformas(
    id, proforma_number, supplier_id, site_id, supplier_reference, proforma_date, validity_date,
    currency_code, delivery_terms, payment_terms, attachment_url, note, created_by
  ) values (
    v_id, v_number, p_supplier_id, p_site_id, nullif(trim(p_supplier_reference), ''),
    coalesce(p_proforma_date, current_date), p_validity_date, upper(coalesce(p_currency_code, 'DZD')),
    nullif(trim(p_delivery_terms), ''), nullif(trim(p_payment_terms), ''),
    nullif(trim(p_attachment_url), ''), nullif(trim(p_note), ''), auth.uid()
  );
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_idx := v_idx + 1;
    v_unit := coalesce((v_line->>'supply_unit_price_ht')::numeric, 0)
      + coalesce((v_line->>'installation_unit_price_ht')::numeric, 0);
    if (v_line->>'tax_rate_id') is null or (v_line->>'tax_rate_id') = '' then v_rate := 0;
    else
      select rate into v_rate from public.fin_tax_rates
      where id = (v_line->>'tax_rate_id')::uuid and active;
      if not found then raise exception 'Invalid tax rate at line %', v_idx; end if;
    end if;
    v_ht := round((v_line->>'quantity')::numeric * v_unit, 2);
    v_tax := round(v_ht * v_rate, 2);
    insert into public.pur_proforma_lines(
      proforma_id, item_code, designation, unit, quantity,
      supply_unit_price_ht, installation_unit_price_ht, unit_price_ht, total_ht,
      tax_rate_id, tax_rate, tax_amount, situation_type_id, sort_order
    ) values (
      v_id, upper(trim(v_line->>'item_code')), trim(v_line->>'designation'),
      upper(trim(v_line->>'unit')), (v_line->>'quantity')::numeric,
      coalesce((v_line->>'supply_unit_price_ht')::numeric, 0),
      coalesce((v_line->>'installation_unit_price_ht')::numeric, 0),
      v_unit, v_ht, nullif(v_line->>'tax_rate_id', '')::uuid, v_rate, v_tax,
      nullif(v_line->>'situation_type_id', '')::uuid, v_idx
    );
    v_total_ht := v_total_ht + v_ht;
    v_total_tva := v_total_tva + v_tax;
  end loop;
  update public.pur_proformas
  set total_ht = v_total_ht, total_tva = v_total_tva, total_ttc = v_total_ht + v_total_tva
  where id = v_id;
  return jsonb_build_object('id', v_id, 'number', v_number, 'total_ht', v_total_ht, 'total_ttc', v_total_ht + v_total_tva);
end;
$$;

create or replace function public.pur_set_proforma_status(p_proforma_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_site uuid; v_current text;
begin
  select site_id, status into v_site, v_current from public.pur_proformas where id = p_proforma_id for update;
  if not found then raise exception 'Proforma not found'; end if;
  if not public.pur_can_access('update'::public.rbac_action, v_site) then raise exception 'Permission denied'; end if;
  if p_status not in ('APPROVED', 'CANCELLED') or v_current <> 'DRAFT' then raise exception 'Invalid status transition'; end if;
  update public.pur_proformas set status = p_status,
    approved_at = case when p_status = 'APPROVED' then now() else null end,
    approved_by = case when p_status = 'APPROVED' then auth.uid() else null end
  where id = p_proforma_id;
end;
$$;

create or replace function public.pur_create_order_from_proforma(
  p_proforma_id uuid,
  p_order_number text,
  p_order_date date,
  p_expected_delivery_date date,
  p_delivery_address text,
  p_document_profile_id uuid,
  p_note text
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_p public.pur_proformas%rowtype; v_id uuid := gen_random_uuid(); v_number text;
  v_profile public.pur_document_profiles%rowtype;
begin
  select * into v_p from public.pur_proformas where id = p_proforma_id for update;
  if not found then raise exception 'Proforma not found'; end if;
  if v_p.status <> 'APPROVED' then raise exception 'Proforma must be approved'; end if;
  if exists (select 1 from public.pur_orders where proforma_id = p_proforma_id and status <> 'CANCELLED') then
    raise exception 'An active order already exists for this proforma';
  end if;
  if not public.pur_can_access('create'::public.rbac_action, v_p.site_id) then raise exception 'Permission denied'; end if;
  if p_document_profile_id is not null then
    select * into v_profile from public.pur_document_profiles
    where id = p_document_profile_id and active;
    if not found then raise exception 'Active document profile not found'; end if;
  else
    select * into v_profile from public.pur_document_profiles
    where active and is_default order by created_at limit 1;
  end if;
  v_number := coalesce(nullif(trim(p_order_number), ''), public.pur_next_number('ORDER', p_order_date));
  insert into public.pur_orders(
    id, order_number, proforma_id, document_profile_id, issuer_snapshot,
    supplier_id, site_id, order_date, expected_delivery_date,
    delivery_address, currency_code, status, total_ht, total_tva, total_ttc,
    payment_terms, note, approved_at, approved_by, created_by
  ) values (
    v_id, v_number, v_p.id, v_profile.id,
    case when v_profile.id is null then '{}'::jsonb else
      jsonb_build_object(
        'legal_name', v_profile.legal_name, 'address', v_profile.address, 'city', v_profile.city,
        'phone', v_profile.phone, 'email', v_profile.email, 'nif', v_profile.nif,
        'nis', v_profile.nis, 'rc', v_profile.rc, 'ai', v_profile.ai,
        'capital', v_profile.capital, 'bank_details', v_profile.bank_details,
        'footer', v_profile.footer
      ) end,
    v_p.supplier_id, v_p.site_id, coalesce(p_order_date, current_date),
    p_expected_delivery_date, nullif(trim(p_delivery_address), ''), v_p.currency_code,
    'APPROVED', v_p.total_ht, v_p.total_tva, v_p.total_ttc, v_p.payment_terms,
    nullif(trim(p_note), ''), now(), auth.uid(), auth.uid()
  );
  insert into public.pur_order_lines(
    order_id, source_proforma_line_id, item_code, designation, unit, quantity,
    supply_unit_price_ht, installation_unit_price_ht, unit_price_ht, total_ht,
    tax_rate_id, tax_rate, tax_amount, situation_type_id, sort_order
  )
  select v_id, id, item_code, designation, unit, quantity,
    supply_unit_price_ht, installation_unit_price_ht, unit_price_ht, total_ht,
    tax_rate_id, tax_rate, tax_amount, situation_type_id, sort_order
  from public.pur_proforma_lines where proforma_id = v_p.id;
  return jsonb_build_object('id', v_id, 'number', v_number);
end;
$$;

create or replace function public.pur_post_receipt(
  p_order_id uuid,
  p_receipt_number text,
  p_receipt_date date,
  p_delivery_note_number text,
  p_received_by_name text,
  p_note text,
  p_lines jsonb
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order public.pur_orders%rowtype; v_id uuid := gen_random_uuid(); v_number text;
  v_line jsonb; v_order_line public.pur_order_lines%rowtype; v_received numeric; v_idx integer := 0;
begin
  select * into v_order from public.pur_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('APPROVED', 'SENT', 'PARTIALLY_RECEIVED') then raise exception 'Order is not receivable'; end if;
  if not public.pur_can_access('create'::public.rbac_action, v_order.site_id) then raise exception 'Permission denied'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'At least one line required'; end if;
  v_number := coalesce(nullif(trim(p_receipt_number), ''), public.pur_next_number('RECEIPT', p_receipt_date));
  insert into public.pur_receipts(id, receipt_number, order_id, receipt_date, delivery_note_number, received_by_name, note, created_by)
  values (v_id, v_number, p_order_id, coalesce(p_receipt_date, current_date), nullif(trim(p_delivery_note_number), ''),
    nullif(trim(p_received_by_name), ''), nullif(trim(p_note), ''), auth.uid());
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_idx := v_idx + 1;
    select * into v_order_line from public.pur_order_lines
    where id = (v_line->>'order_line_id')::uuid and order_id = p_order_id for update;
    if not found then raise exception 'Invalid order line at %', v_idx; end if;
    select coalesce(sum(rl.accepted_quantity), 0) into v_received
    from public.pur_receipt_lines rl join public.pur_receipts r on r.id = rl.receipt_id
    where rl.order_line_id = v_order_line.id and r.status = 'POSTED';
    if (v_line->>'quantity')::numeric <= 0
       or (v_line->>'accepted_quantity')::numeric < 0
       or (v_line->>'accepted_quantity')::numeric > (v_line->>'quantity')::numeric
       or v_received + (v_line->>'accepted_quantity')::numeric > v_order_line.quantity then
      raise exception 'Receipt quantity exceeds order at line %', v_idx;
    end if;
    insert into public.pur_receipt_lines(receipt_id, order_line_id, quantity, accepted_quantity, note)
    values (v_id, v_order_line.id, (v_line->>'quantity')::numeric,
      (v_line->>'accepted_quantity')::numeric, nullif(trim(v_line->>'note'), ''));
  end loop;
  update public.pur_orders o set status = case
    when not exists (
      select 1 from public.pur_order_lines ol
      where ol.order_id = o.id and (
        select coalesce(sum(rl.accepted_quantity), 0)
        from public.pur_receipt_lines rl join public.pur_receipts r on r.id = rl.receipt_id
        where rl.order_line_id = ol.id and r.status = 'POSTED'
      ) < ol.quantity
    ) then 'RECEIVED' else 'PARTIALLY_RECEIVED' end
  where o.id = p_order_id;
  return jsonb_build_object('id', v_id, 'number', v_number);
end;
$$;

create or replace function public.pur_post_supplier_invoice(
  p_order_id uuid,
  p_internal_number text,
  p_supplier_invoice_number text,
  p_invoice_date date,
  p_due_date date,
  p_retention_rate numeric,
  p_retention_due_date date,
  p_stamp_rule_id uuid,
  p_receipt_ids uuid[],
  p_attachment_url text,
  p_note text,
  p_lines jsonb
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order public.pur_orders%rowtype; v_id uuid := gen_random_uuid(); v_number text;
  v_line jsonb; v_ol public.pur_order_lines%rowtype; v_received numeric; v_invoiced numeric;
  v_qty numeric; v_ht numeric; v_tax numeric; v_total_ht numeric := 0; v_total_tva numeric := 0;
  v_supply numeric := 0; v_install numeric := 0; v_rg numeric; v_stamp numeric; v_idx integer := 0;
begin
  select * into v_order from public.pur_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('PARTIALLY_RECEIVED', 'RECEIVED') then raise exception 'A posted receipt is required'; end if;
  if not public.pur_can_access('create'::public.rbac_action, v_order.site_id) then raise exception 'Permission denied'; end if;
  if coalesce(p_retention_rate, 0) not between 0 and 1 then raise exception 'Invalid retention rate'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'At least one line required'; end if;
  v_number := coalesce(nullif(trim(p_internal_number), ''), public.pur_next_number('SUPPLIER_INVOICE', p_invoice_date));
  insert into public.pur_supplier_invoices(
    id, internal_number, supplier_invoice_number, supplier_id, order_id, invoice_date, due_date,
    retention_rate, retention_due_date, stamp_rule_id, attachment_url, note, created_by
  ) values (
    v_id, v_number, trim(p_supplier_invoice_number), v_order.supplier_id, p_order_id,
    coalesce(p_invoice_date, current_date), p_due_date, coalesce(p_retention_rate, 0),
    p_retention_due_date, p_stamp_rule_id, nullif(trim(p_attachment_url), ''), nullif(trim(p_note), ''), auth.uid()
  );
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_idx := v_idx + 1; v_qty := (v_line->>'quantity')::numeric;
    select * into v_ol from public.pur_order_lines
    where id = (v_line->>'order_line_id')::uuid and order_id = p_order_id for update;
    if not found then raise exception 'Invalid order line at %', v_idx; end if;
    select coalesce(sum(rl.accepted_quantity), 0) into v_received
    from public.pur_receipt_lines rl join public.pur_receipts r on r.id = rl.receipt_id
    where rl.order_line_id = v_ol.id and r.status = 'POSTED';
    select coalesce(sum(il.quantity), 0) into v_invoiced
    from public.pur_supplier_invoice_lines il join public.pur_supplier_invoices i on i.id = il.supplier_invoice_id
    where il.order_line_id = v_ol.id and i.status = 'POSTED';
    if v_qty <= 0 or v_invoiced + v_qty > v_received then
      raise exception 'Invoice quantity exceeds accepted receipt at line %', v_idx;
    end if;
    v_ht := round(v_qty * v_ol.unit_price_ht, 2); v_tax := round(v_ht * v_ol.tax_rate, 2);
    insert into public.pur_supplier_invoice_lines(
      supplier_invoice_id, order_line_id, item_code, designation, unit, quantity,
      supply_unit_price_ht, installation_unit_price_ht, unit_price_ht, total_ht,
      tax_rate_id, tax_rate, tax_amount, sort_order
    ) values (
      v_id, v_ol.id, v_ol.item_code, v_ol.designation, v_ol.unit, v_qty,
      v_ol.supply_unit_price_ht, v_ol.installation_unit_price_ht, v_ol.unit_price_ht,
      v_ht, v_ol.tax_rate_id, v_ol.tax_rate, v_tax, v_idx
    );
    v_total_ht := v_total_ht + v_ht; v_total_tva := v_total_tva + v_tax;
    v_supply := v_supply + round(v_qty * v_ol.supply_unit_price_ht, 2);
    v_install := v_install + round(v_qty * v_ol.installation_unit_price_ht, 2);
  end loop;
  if p_receipt_ids is not null then
    if exists (select 1 from unnest(p_receipt_ids) rid
      where not exists (select 1 from public.pur_receipts r where r.id = rid and r.order_id = p_order_id and r.status = 'POSTED'))
    then raise exception 'Invalid receipt link'; end if;
    insert into public.pur_supplier_invoice_receipts(supplier_invoice_id, receipt_id)
    select v_id, rid from unnest(p_receipt_ids) rid on conflict do nothing;
  end if;
  v_rg := round(v_total_ht * coalesce(p_retention_rate, 0), 2);
  v_stamp := public.fin_calculate_stamp(p_stamp_rule_id, p_invoice_date, v_total_ht, v_total_tva, v_total_ht + v_total_tva);
  perform set_config('app.pur_invoice_post', '1', true);
  update public.pur_supplier_invoices set
    total_supply_ht = v_supply, total_installation_ht = v_install,
    total_ht = v_total_ht, total_tva = v_total_tva, total_ttc = v_total_ht + v_total_tva,
    retention_amount = v_rg, retention_status = case when v_rg > 0 then 'HELD' else 'NONE' end,
    stamp_amount = v_stamp, net_payable = greatest(v_total_ht + v_total_tva + v_stamp - v_rg, 0),
    tax_breakdown = coalesce((
      select jsonb_agg(jsonb_build_object('rate', tax_rate, 'base_ht', base_ht, 'tax_amount', tax_amount) order by tax_rate)
      from (select tax_rate, sum(total_ht) base_ht, sum(tax_amount) tax_amount
        from public.pur_supplier_invoice_lines where supplier_invoice_id = v_id group by tax_rate) x
    ), '[]'::jsonb)
  where id = v_id;
  perform set_config('app.pur_invoice_post', '0', true);
  return jsonb_build_object('id', v_id, 'number', v_number, 'net_payable',
    greatest(v_total_ht + v_total_tva + v_stamp - v_rg, 0));
end;
$$;

create or replace function public.pur_supplier_invoice_open(p_invoice_id uuid)
returns numeric
language sql stable security definer set search_path = public, pg_temp
as $$
  select greatest(
    i.net_payable
      + case when i.retention_status = 'RELEASED' then i.retention_amount else 0 end
      - coalesce(sum(p.amount * p.direction), 0), 0
  )
  from public.pur_supplier_invoices i
  left join public.pur_supplier_payments p on p.supplier_invoice_id = i.id
  where i.id = p_invoice_id and i.status = 'POSTED'
  group by i.id;
$$;

create or replace function public.pur_post_supplier_payment(
  p_invoice_id uuid,
  p_account_id uuid,
  p_payment_method_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_reference text,
  p_note text
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_inv public.pur_supplier_invoices%rowtype; v_order public.pur_orders%rowtype;
  v_supplier text; v_open numeric; v_tx uuid := gen_random_uuid(); v_id uuid := gen_random_uuid();
  v_account public.fin_accounts%rowtype; v_method public.fin_payment_methods%rowtype;
  v_category uuid; v_balance numeric;
begin
  select * into v_inv from public.pur_supplier_invoices where id = p_invoice_id for update;
  if not found or v_inv.status <> 'POSTED' then raise exception 'Supplier invoice not payable'; end if;
  select * into v_order from public.pur_orders where id = v_inv.order_id;
  if not public.pur_can_access('create'::public.rbac_action, v_order.site_id) then raise exception 'Permission denied'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  v_open := public.pur_supplier_invoice_open(p_invoice_id);
  if p_amount > v_open then raise exception 'Payment exceeds invoice open amount'; end if;
  select legal_name into v_supplier from public.pur_suppliers where id = v_inv.supplier_id;
  select * into v_account from public.fin_accounts where id = p_account_id for update;
  if not found or not v_account.active then raise exception 'Active account not found'; end if;
  select * into v_method from public.fin_payment_methods where id = p_payment_method_id and active;
  if not found then raise exception 'Active payment method not found'; end if;
  if v_method.account_scope <> 'BOTH' and v_method.account_scope <> v_account.account_type then
    raise exception 'Payment method is incompatible with account type';
  end if;
  if v_order.site_id is not null and v_account.site_id is not null and v_order.site_id <> v_account.site_id then
    raise exception 'Account belongs to another site';
  end if;
  if not public.fin_can_access('create', v_account.site_id) then raise exception 'Finance permission denied'; end if;
  if public.fin_period_is_locked(p_account_id, coalesce(p_payment_date, current_date)) then
    raise exception 'Financial period is locked';
  end if;
  if not v_account.allow_negative then
    v_balance := public.fin_account_balance(p_account_id, null);
    if p_amount > v_balance then raise exception 'Insufficient account balance'; end if;
  end if;
  select id into v_category from public.fin_categories where code = 'PAIEMENT_FOURNISSEUR';
  insert into public.fin_transactions(
    id, account_id, site_id, movement_date, direction, amount, category_id,
    payment_method_id, reference, description, counterparty, source_type, source_id, created_by
  ) values (
    v_tx, p_account_id, coalesce(v_order.site_id, v_account.site_id),
    coalesce(p_payment_date, current_date), 'OUT', round(p_amount, 2), v_category,
    p_payment_method_id, nullif(trim(p_reference), ''),
    'Paiement facture fournisseur ' || v_inv.supplier_invoice_number,
    v_supplier, 'SUPPLIER_PAYMENT', v_id, auth.uid()
  );
  insert into public.pur_supplier_payments(
    id, supplier_invoice_id, payment_date, amount, account_id, payment_method_id,
    reference, note, financial_transaction_id, created_by
  ) values (
    v_id, p_invoice_id, coalesce(p_payment_date, current_date), p_amount, p_account_id,
    p_payment_method_id, nullif(trim(p_reference), ''), nullif(trim(p_note), ''), v_tx, auth.uid()
  );
  return jsonb_build_object('id', v_id, 'transaction_id', v_tx, 'open_amount', v_open - p_amount);
end;
$$;

create or replace function public.pur_release_supplier_retention(p_invoice_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_site uuid; v_status text; v_due date;
begin
  select o.site_id, i.retention_status, i.retention_due_date into v_site, v_status, v_due
  from public.pur_supplier_invoices i join public.pur_orders o on o.id = i.order_id
  where i.id = p_invoice_id for update of i;
  if not found then raise exception 'Invoice not found'; end if;
  if not public.pur_can_access('update'::public.rbac_action, v_site) then raise exception 'Permission denied'; end if;
  if v_status <> 'HELD' then raise exception 'No held retention'; end if;
  if v_due is not null and v_due > current_date then raise exception 'Retention is not due yet'; end if;
  perform set_config('app.pur_retention_release', '1', true);
  update public.pur_supplier_invoices set retention_status = 'RELEASED', retention_released_at = now()
  where id = p_invoice_id;
  perform set_config('app.pur_retention_release', '0', true);
end;
$$;

create or replace function public.pur_reverse_supplier_payment(
  p_payment_id uuid, p_reversal_date date, p_reason text
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_payment public.pur_supplier_payments%rowtype; v_tx uuid := gen_random_uuid();
  v_id uuid := gen_random_uuid(); v_site uuid; v_original public.fin_transactions%rowtype;
begin
  select * into v_payment from public.pur_supplier_payments where id = p_payment_id for update;
  if not found or v_payment.direction <> 1 then raise exception 'Payment not reversible'; end if;
  if exists (select 1 from public.pur_supplier_payments where reversal_of = p_payment_id) then raise exception 'Already reversed'; end if;
  select o.site_id into v_site from public.pur_supplier_invoices i join public.pur_orders o on o.id = i.order_id
  where i.id = v_payment.supplier_invoice_id;
  if not public.pur_can_access('update'::public.rbac_action, v_site) then raise exception 'Permission denied'; end if;
  select * into v_original from public.fin_transactions
  where id = v_payment.financial_transaction_id for update;
  if v_original.reconciled_at is not null then raise exception 'Unreconcile payment before reversal'; end if;
  if public.fin_period_is_locked(v_original.account_id, p_reversal_date) then raise exception 'Financial period is locked'; end if;
  insert into public.fin_transactions(
    id, account_id, site_id, movement_date, direction, amount, category_id,
    payment_method_id, reference, description, counterparty, source_type,
    source_id, reversal_of, created_by
  ) values (
    v_tx, v_original.account_id, v_original.site_id, p_reversal_date, 'IN',
    v_original.amount, v_original.category_id, v_original.payment_method_id,
    v_original.reference, 'Annulation paiement fournisseur: ' || trim(p_reason),
    v_original.counterparty, 'REVERSAL', v_id, v_original.id, auth.uid()
  );
  insert into public.pur_supplier_payments(
    id, supplier_invoice_id, payment_date, amount, direction, account_id, payment_method_id,
    reference, note, financial_transaction_id, reversal_of, created_by
  ) values (
    v_id, v_payment.supplier_invoice_id, p_reversal_date, v_payment.amount, -1,
    v_payment.account_id, v_payment.payment_method_id, v_payment.reference,
    p_reason, v_tx, p_payment_id, auth.uid()
  );
  return jsonb_build_object('id', v_id, 'transaction_id', v_tx);
end;
$$;

create or replace function public.pur_financial_guard()
returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin raise exception '% is append-only; use reversal/cancellation workflow', tg_table_name; end;
$$;

create or replace function public.pur_supplier_invoice_guard()
returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Supplier invoices are append-only';
  end if;
  if current_setting('app.pur_invoice_post', true) = '1' then
    return new;
  end if;
  if current_setting('app.pur_retention_release', true) <> '1' then
    raise exception 'Posted supplier invoice is immutable';
  end if;
  if (to_jsonb(new) - array['retention_status', 'retention_released_at']::text[])
     <> (to_jsonb(old) - array['retention_status', 'retention_released_at']::text[]) then
    raise exception 'Only retention release fields may change';
  end if;
  return new;
end;
$$;

create trigger trg_pur_receipts_guard before update or delete on public.pur_receipts
for each row execute function public.pur_financial_guard();
create trigger trg_pur_receipt_lines_guard before update or delete on public.pur_receipt_lines
for each row execute function public.pur_financial_guard();
create trigger trg_pur_supplier_invoices_guard before update or delete on public.pur_supplier_invoices
for each row execute function public.pur_supplier_invoice_guard();
create trigger trg_pur_supplier_invoice_lines_guard before update or delete on public.pur_supplier_invoice_lines
for each row execute function public.pur_financial_guard();
create trigger trg_pur_supplier_payments_guard before update or delete on public.pur_supplier_payments
for each row execute function public.pur_financial_guard();

create trigger trg_ref_situation_types_updated before update on public.ref_situation_types
for each row execute function public.erp_set_updated_at();
create trigger trg_fin_stamp_rules_updated before update on public.fin_stamp_rules
for each row execute function public.erp_set_updated_at();
create trigger trg_pur_document_profiles_updated before update on public.pur_document_profiles
for each row execute function public.erp_set_updated_at();
create trigger trg_pur_suppliers_updated before update on public.pur_suppliers
for each row execute function public.erp_set_updated_at();
create trigger trg_pur_proformas_updated before update on public.pur_proformas
for each row execute function public.erp_set_updated_at();
create trigger trg_pur_orders_updated before update on public.pur_orders
for each row execute function public.erp_set_updated_at();

create or replace function public.pur_document_profile_default_guard()
returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.is_default then
    update public.pur_document_profiles set is_default = false
    where is_default and id <> new.id;
  end if;
  return new;
end;
$$;

create trigger trg_pur_document_profile_default
before insert or update of is_default on public.pur_document_profiles
for each row execute function public.pur_document_profile_default_guard();

do $$
declare t text;
begin
  foreach t in array array[
    'ref_situation_types', 'fin_stamp_rules', 'pur_document_profiles', 'pur_suppliers',
    'pur_proformas', 'pur_proforma_lines', 'pur_orders', 'pur_order_lines',
    'pur_receipts', 'pur_receipt_lines', 'pur_supplier_invoices',
    'pur_supplier_invoice_lines', 'pur_supplier_payments'
  ] loop
    execute format('create trigger trg_%s_audit after insert or update or delete on public.%I
      for each row execute function public.sys_audit_row_change()', t, t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'ref_situation_types', 'fin_stamp_rules', 'pur_number_sequences', 'pur_document_profiles', 'pur_suppliers',
    'pur_proformas', 'pur_proforma_lines', 'pur_orders', 'pur_order_lines',
    'pur_receipts', 'pur_receipt_lines', 'pur_supplier_invoices',
    'pur_supplier_invoice_lines', 'pur_supplier_invoice_receipts', 'pur_supplier_payments'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.pur_can_access(''read''::public.rbac_action, null))',
      t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated
      with check (public.pur_can_access(''create''::public.rbac_action, null))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated
      using (public.pur_can_access(''update''::public.rbac_action, null))
      with check (public.pur_can_access(''update''::public.rbac_action, null))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated
      using (public.pur_can_access(''delete''::public.rbac_action, null))', t || '_delete', t);
  end loop;
end $$;

grant execute on function public.pur_can_access(public.rbac_action, uuid) to authenticated;
grant execute on function public.pur_next_number(text, date) to authenticated;
grant execute on function public.fin_calculate_stamp(uuid, date, numeric, numeric, numeric) to authenticated;
grant execute on function public.ref_contract_configure_invoice(uuid, uuid, uuid, numeric, date, uuid) to authenticated;
grant execute on function public.pur_create_proforma(uuid, uuid, text, text, date, date, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.pur_set_proforma_status(uuid, text) to authenticated;
grant execute on function public.pur_create_order_from_proforma(uuid, text, date, date, text, uuid, text) to authenticated;
grant execute on function public.pur_post_receipt(uuid, text, date, text, text, text, jsonb) to authenticated;
grant execute on function public.pur_post_supplier_invoice(uuid, text, text, date, date, numeric, date, uuid, uuid[], text, text, jsonb) to authenticated;
grant execute on function public.pur_supplier_invoice_open(uuid) to authenticated;
grant execute on function public.pur_post_supplier_payment(uuid, uuid, uuid, numeric, date, text, text) to authenticated;
grant execute on function public.pur_release_supplier_retention(uuid) to authenticated;
grant execute on function public.pur_reverse_supplier_payment(uuid, date, text) to authenticated;

commit;
