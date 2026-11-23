-- =============================================================================
-- Ventes M1 — relational sales schema (sal_*) + unified register view.
-- Does not alter Banque (fin_bank_*) or Caisse (caisse_*) tables/RPCs.
-- Contract invoicing tables are read-only inputs to the register view.
-- =============================================================================

begin;

-- ---- Status / source enums (text + check, consistent with finance hub) ----

do $$ begin
  create type public.sal_invoice_status as enum ('BROUILLON', 'EMISE', 'ANNULEE');
exception when duplicate_object then null;
end $$;

-- ---- Document kinds (UI-driven catalogue) ----

create table if not exists public.sal_doc_kinds (
  code text primary key
    check (code = upper(trim(code)) and char_length(code) between 1 and 16),
  label_fr text not null check (char_length(trim(label_fr)) between 1 and 160),
  label_ar text,
  has_pose boolean not null default false,
  is_rg_release boolean not null default false,
  is_free_amount boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.sal_doc_kinds
  (code, label_fr, label_ar, has_pose, is_rg_release, is_free_amount, sort_order)
values
  ('P', 'Prestation / MO', 'أشغال / يد عاملة', false, false, false, 10),
  ('F', 'Fourniture', 'توريد', false, false, false, 20),
  ('FP', 'Fourniture + Pose', 'توريد وتركيب', true, false, false, 30),
  ('RG', 'Retenue de garantie', 'استرجاع اقتطاع الضمان', false, true, false, 40),
  ('SIT', 'Situation libre', 'وضعية حرة', false, false, true, 50)
on conflict (code) do update set
  label_fr = excluded.label_fr,
  label_ar = excluded.label_ar,
  has_pose = excluded.has_pose,
  is_rg_release = excluded.is_rg_release,
  is_free_amount = excluded.is_free_amount,
  active = true,
  sort_order = excluded.sort_order,
  updated_at = now();

drop trigger if exists trg_sal_doc_kinds_updated on public.sal_doc_kinds;
create trigger trg_sal_doc_kinds_updated
  before update on public.sal_doc_kinds
  for each row execute function public.erp_set_updated_at();

-- ---- Import batches (filled in M7) ----

create table if not exists public.sal_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_name text not null check (char_length(trim(source_name)) between 1 and 200),
  fiscal_year integer check (fiscal_year is null or fiscal_year between 1990 and 2100),
  row_count integer not null default 0 check (row_count >= 0),
  note text check (char_length(coalesce(note, '')) <= 500),
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now()
);

-- ---- Invoices ----

create table if not exists public.sal_invoices (
  id uuid primary key default gen_random_uuid(),
  doc_kind text not null references public.sal_doc_kinds(code) on delete restrict,
  number text not null check (char_length(trim(number)) between 1 and 40),
  fiscal_year integer not null check (fiscal_year between 1990 and 2100),
  issue_date date not null default current_date,
  client_id uuid not null references public.ref_clients(id) on delete restrict,
  contract_id uuid references public.ref_contracts(id) on delete restrict,
  -- Snapshot at issue (and editable while draft)
  client_name text not null check (char_length(trim(client_name)) between 1 and 300),
  client_address text,
  client_nif text,
  client_article text,
  client_rc text,
  client_phone text,
  contract_ref text,
  period_label text,
  established_by text,
  expected_bank_label text,
  situation_type_id uuid references public.ref_situation_types(id) on delete restrict,
  tax_mode text not null default 'TAXABLE'
    check (tax_mode in ('TAXABLE', 'EXEMPT', 'MIXED')),
  tax_rate numeric(8,6) not null default 0
    check (tax_rate >= 0 and tax_rate <= 1),
  exo_attestation_no text,
  exo_attestation_date date,
  currency text not null default 'DZD' check (char_length(currency) between 3 and 3),
  status public.sal_invoice_status not null default 'BROUILLON',
  total_ht numeric(18,2) not null default 0 check (total_ht >= 0),
  total_tva numeric(18,2) not null default 0 check (total_tva >= 0),
  retention_rate numeric(8,6) not null default 0
    check (retention_rate >= 0 and retention_rate <= 1),
  retention_amount numeric(18,2) not null default 0 check (retention_amount >= 0),
  stamp_rule_id uuid references public.fin_stamp_rules(id) on delete restrict,
  stamp_amount numeric(18,2) not null default 0 check (stamp_amount >= 0),
  net_payable numeric(18,2) not null default 0 check (net_payable >= 0),
  note text check (char_length(coalesce(note, '')) <= 500),
  source text not null default 'MANUAL'
    check (source in ('MANUAL', 'CONTRACT', 'IMPORT_EXCEL')),
  import_batch_id uuid references public.sal_import_batches(id) on delete set null,
  issued_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fiscal_year, number)
);

create index if not exists sal_invoices_date_idx
  on public.sal_invoices (issue_date desc, created_at desc);
create index if not exists sal_invoices_client_idx
  on public.sal_invoices (client_id, issue_date desc);
create index if not exists sal_invoices_contract_idx
  on public.sal_invoices (contract_id)
  where contract_id is not null;
create index if not exists sal_invoices_status_idx
  on public.sal_invoices (status, issue_date desc);
create index if not exists sal_invoices_kind_idx
  on public.sal_invoices (doc_kind, issue_date desc);

-- ---- Lines ----

create table if not exists public.sal_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.sal_invoices(id) on delete cascade,
  line_no integer not null check (line_no > 0),
  item_code text,
  designation text not null check (char_length(trim(designation)) between 1 and 500),
  unit text,
  qty numeric(18,4) not null default 0,
  unit_price_ht numeric(18,4) not null default 0 check (unit_price_ht >= 0),
  pose_price_ht numeric(18,4) not null default 0 check (pose_price_ht >= 0),
  line_ht numeric(18,2) not null default 0 check (line_ht >= 0),
  tax_rate_id uuid references public.fin_tax_rates(id) on delete restrict,
  -- RG release: reference to prior invoice (free text + optional FK)
  source_invoice_ref text,
  source_invoice_id uuid references public.sal_invoices(id) on delete set null,
  source_amount numeric(18,2) not null default 0 check (source_amount >= 0),
  created_at timestamptz not null default now(),
  unique (invoice_id, line_no)
);

create index if not exists sal_invoice_lines_invoice_idx
  on public.sal_invoice_lines (invoice_id, line_no);

-- ---- Payments (append-only; reverse via opposite direction) ----

create table if not exists public.sal_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.sal_invoices(id) on delete restrict,
  payment_date date not null default current_date,
  account_id uuid references public.fin_accounts(id) on delete restrict,
  payment_method_id uuid references public.fin_payment_methods(id) on delete restrict,
  amount_ht numeric(18,2) not null default 0 check (amount_ht >= 0),
  amount_tva numeric(18,2) not null default 0 check (amount_tva >= 0),
  amount_ttc numeric(18,2) not null check (amount_ttc > 0),
  direction smallint not null default 1 check (direction in (1, -1)),
  financial_transaction_id uuid references public.fin_transactions(id) on delete restrict,
  bank_line_id uuid, -- optional link later (M4); no FK to avoid coupling Banque schema now
  reference text check (char_length(coalesce(reference, '')) <= 160),
  note text check (char_length(coalesce(note, '')) <= 500),
  reversal_of uuid references public.sal_invoice_payments(id) on delete restrict,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now()
);

create index if not exists sal_invoice_payments_invoice_idx
  on public.sal_invoice_payments (invoice_id, payment_date desc);
create index if not exists sal_invoice_payments_tx_idx
  on public.sal_invoice_payments (financial_transaction_id)
  where financial_transaction_id is not null;

create or replace function public.sal_invoice_payments_prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'sal_invoice_payments is append-only (use reverse payment)';
end;
$$;

drop trigger if exists trg_sal_invoice_payments_no_update on public.sal_invoice_payments;
create trigger trg_sal_invoice_payments_no_update
  before update on public.sal_invoice_payments
  for each row execute function public.sal_invoice_payments_prevent_mutation();

drop trigger if exists trg_sal_invoice_payments_no_delete on public.sal_invoice_payments;
create trigger trg_sal_invoice_payments_no_delete
  before delete on public.sal_invoice_payments
  for each row execute function public.sal_invoice_payments_prevent_mutation();

-- ---- Domain audit (append-only) ----

create table if not exists public.sal_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid references public.sys_users(id),
  action text not null check (char_length(trim(action)) between 1 and 80),
  entity text not null check (char_length(trim(entity)) between 1 and 80),
  entity_id uuid,
  detail text check (char_length(coalesce(detail, '')) <= 1000),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists sal_audit_at_idx on public.sal_audit (at desc);
create index if not exists sal_audit_entity_idx on public.sal_audit (entity, entity_id);

create or replace function public.sal_audit_prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'sal_audit is append-only';
end;
$$;

drop trigger if exists trg_sal_audit_no_update on public.sal_audit;
create trigger trg_sal_audit_no_update
  before update on public.sal_audit
  for each row execute function public.sal_audit_prevent_mutation();

drop trigger if exists trg_sal_audit_no_delete on public.sal_audit;
create trigger trg_sal_audit_no_delete
  before delete on public.sal_audit
  for each row execute function public.sal_audit_prevent_mutation();

-- ---- Guards on issued invoices ----

create or replace function public.sal_invoices_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'EMISE' then
      raise exception 'Cannot delete an issued sales invoice (cancel instead)';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status = 'EMISE' then
    if new.status = 'EMISE' then
      if new.number is distinct from old.number
         or new.fiscal_year is distinct from old.fiscal_year
         or new.doc_kind is distinct from old.doc_kind
         or new.client_id is distinct from old.client_id
         or new.total_ht is distinct from old.total_ht
         or new.total_tva is distinct from old.total_tva
         or new.retention_amount is distinct from old.retention_amount
         or new.stamp_amount is distinct from old.stamp_amount
         or new.net_payable is distinct from old.net_payable
         or new.tax_mode is distinct from old.tax_mode
         or new.tax_rate is distinct from old.tax_rate
      then
        raise exception 'Issued sales invoice amounts/identity are frozen';
      end if;
    elsif new.status not in ('ANNULEE') then
      raise exception 'Issued sales invoice can only move to ANNULEE';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.status = 'ANNULEE' then
    raise exception 'Cancelled sales invoice is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sal_invoices_guard on public.sal_invoices;
create trigger trg_sal_invoices_guard
  before update or delete on public.sal_invoices
  for each row execute function public.sal_invoices_guard();

create or replace function public.sal_invoice_lines_guard()
returns trigger
language plpgsql
as $$
declare
  v_status public.sal_invoice_status;
  v_invoice_id uuid;
begin
  v_invoice_id := coalesce(new.invoice_id, old.invoice_id);
  select status into v_status from public.sal_invoices where id = v_invoice_id;
  if v_status in ('EMISE', 'ANNULEE') then
    raise exception 'Cannot change lines of an issued/cancelled sales invoice';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sal_invoice_lines_guard on public.sal_invoice_lines;
create trigger trg_sal_invoice_lines_guard
  before insert or update or delete on public.sal_invoice_lines
  for each row execute function public.sal_invoice_lines_guard();

-- ---- updated_at + row audit (sys) ----

drop trigger if exists trg_sal_invoices_updated on public.sal_invoices;
create trigger trg_sal_invoices_updated
  before update on public.sal_invoices
  for each row execute function public.erp_set_updated_at();

drop trigger if exists trg_sal_invoices_audit on public.sal_invoices;
create trigger trg_sal_invoices_audit
  after insert or update or delete on public.sal_invoices
  for each row execute function public.sys_audit_row_change();

drop trigger if exists trg_sal_invoice_lines_audit on public.sal_invoice_lines;
create trigger trg_sal_invoice_lines_audit
  after insert or update or delete on public.sal_invoice_lines
  for each row execute function public.sys_audit_row_change();

drop trigger if exists trg_sal_invoice_payments_audit on public.sal_invoice_payments;
create trigger trg_sal_invoice_payments_audit
  after insert or update or delete on public.sal_invoice_payments
  for each row execute function public.sys_audit_row_change();

-- ---- Access helper ----

create or replace function public.sal_can(p_action public.rbac_action)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and (
      public.erp_has_perm('ventes', p_action, null)
      or public.fin_can_access(p_action, null)
    );
$$;

revoke all on function public.sal_can(public.rbac_action) from public;
grant execute on function public.sal_can(public.rbac_action) to authenticated;

-- ---- RLS ----

alter table public.sal_doc_kinds enable row level security;
alter table public.sal_import_batches enable row level security;
alter table public.sal_invoices enable row level security;
alter table public.sal_invoice_lines enable row level security;
alter table public.sal_invoice_payments enable row level security;
alter table public.sal_audit enable row level security;

grant select on public.sal_doc_kinds to authenticated;
grant select, insert, update on public.sal_import_batches to authenticated;
grant select, insert, update, delete on public.sal_invoices to authenticated;
grant select, insert, update, delete on public.sal_invoice_lines to authenticated;
grant select, insert on public.sal_invoice_payments to authenticated;
grant select, insert on public.sal_audit to authenticated;

drop policy if exists sal_doc_kinds_read on public.sal_doc_kinds;
create policy sal_doc_kinds_read on public.sal_doc_kinds
  for select to authenticated
  using (public.sal_can('read'));

drop policy if exists sal_doc_kinds_write on public.sal_doc_kinds;
create policy sal_doc_kinds_write on public.sal_doc_kinds
  for all to authenticated
  using (public.sal_can('update'))
  with check (public.sal_can('update'));

drop policy if exists sal_import_batches_read on public.sal_import_batches;
create policy sal_import_batches_read on public.sal_import_batches
  for select to authenticated
  using (public.sal_can('read'));

drop policy if exists sal_import_batches_write on public.sal_import_batches;
create policy sal_import_batches_write on public.sal_import_batches
  for all to authenticated
  using (public.sal_can('create'))
  with check (public.sal_can('create'));

drop policy if exists sal_invoices_read on public.sal_invoices;
create policy sal_invoices_read on public.sal_invoices
  for select to authenticated
  using (public.sal_can('read'));

drop policy if exists sal_invoices_insert on public.sal_invoices;
create policy sal_invoices_insert on public.sal_invoices
  for insert to authenticated
  with check (public.sal_can('create'));

drop policy if exists sal_invoices_update on public.sal_invoices;
create policy sal_invoices_update on public.sal_invoices
  for update to authenticated
  using (public.sal_can('update'))
  with check (public.sal_can('update'));

drop policy if exists sal_invoices_delete on public.sal_invoices;
create policy sal_invoices_delete on public.sal_invoices
  for delete to authenticated
  using (public.sal_can('delete'));

drop policy if exists sal_invoice_lines_read on public.sal_invoice_lines;
create policy sal_invoice_lines_read on public.sal_invoice_lines
  for select to authenticated
  using (public.sal_can('read'));

drop policy if exists sal_invoice_lines_write on public.sal_invoice_lines;
create policy sal_invoice_lines_write on public.sal_invoice_lines
  for all to authenticated
  using (public.sal_can('update'))
  with check (public.sal_can('update'));

drop policy if exists sal_invoice_payments_read on public.sal_invoice_payments;
create policy sal_invoice_payments_read on public.sal_invoice_payments
  for select to authenticated
  using (public.sal_can('read'));

drop policy if exists sal_invoice_payments_insert on public.sal_invoice_payments;
create policy sal_invoice_payments_insert on public.sal_invoice_payments
  for insert to authenticated
  with check (public.sal_can('create'));

drop policy if exists sal_audit_read on public.sal_audit;
create policy sal_audit_read on public.sal_audit
  for select to authenticated
  using (public.sal_can('read'));

drop policy if exists sal_audit_insert on public.sal_audit;
create policy sal_audit_insert on public.sal_audit
  for insert to authenticated
  with check (public.sal_can('create'));

-- ---- Unified register (sales + issued contract invoices) ----

create or replace view public.v_sales_register
with (security_invoker = true)
as
with sal_paid as (
  select
    p.invoice_id,
    coalesce(sum(p.amount_ttc * p.direction), 0)::numeric(18,2) as paid_ttc,
    max(p.payment_date) filter (where p.direction = 1) as last_payment_date
  from public.sal_invoice_payments p
  group by p.invoice_id
),
contract_paid as (
  select
    p.invoice_id,
    coalesce(sum(coalesce(p.amount_ttc, p.amount_ht) * coalesce(p.direction, 1)), 0)::numeric(18,2) as paid_ttc,
    max(p.payment_date) filter (where coalesce(p.direction, 1) = 1) as last_payment_date
  from public.contract_payments p
  where p.invoice_id is not null
  group by p.invoice_id
)
select
  'SAL'::text as source,
  i.id,
  i.number as invoice_number,
  i.issue_date,
  i.doc_kind,
  i.status::text as status,
  i.client_id,
  i.client_name,
  i.contract_id,
  i.contract_ref,
  i.period_label,
  i.expected_bank_label,
  i.total_ht,
  i.total_tva,
  i.retention_amount,
  i.stamp_amount,
  i.net_payable,
  coalesce(sp.paid_ttc, 0)::numeric(18,2) as paid_ttc,
  greatest(i.net_payable - coalesce(sp.paid_ttc, 0), 0)::numeric(18,2) as due_ttc,
  sp.last_payment_date,
  i.exo_attestation_no,
  i.fiscal_year,
  i.created_at
from public.sal_invoices i
left join sal_paid sp on sp.invoice_id = i.id

union all

select
  'CONTRACT'::text as source,
  ci.id,
  ci.invoice_number,
  ci.invoice_date as issue_date,
  coalesce(
    case
      when st.code = 'P_POSE' then 'P'
      when st.code = 'F_FOURNITURE' then 'F'
      when st.code = 'FP_FOURNITURE_POSE' then 'FP'
      else null
    end,
    'P'
  ) as doc_kind,
  ci.status::text as status,
  c.client_id,
  coalesce(nullif(trim(cl.nom_fr), ''), nullif(trim(c.client_name), ''), '—') as client_name,
  ci.contract_id,
  c.contract_number as contract_ref,
  null::text as period_label,
  null::text as expected_bank_label,
  ci.total_ht,
  ci.tva_amount as total_tva,
  ci.retention_amount,
  ci.stamp_amount,
  ci.net_payable,
  coalesce(cp.paid_ttc, 0)::numeric(18,2) as paid_ttc,
  greatest(ci.net_payable - coalesce(cp.paid_ttc, 0), 0)::numeric(18,2) as due_ttc,
  cp.last_payment_date,
  ci.exemption_certificate_number as exo_attestation_no,
  extract(year from ci.invoice_date)::integer as fiscal_year,
  ci.created_at
from public.contract_invoices ci
join public.ref_contracts c on c.id = ci.contract_id
left join public.ref_clients cl on cl.id = c.client_id
left join public.ref_situation_types st on st.id = ci.situation_type_id
left join contract_paid cp on cp.invoice_id = ci.id
where ci.status = 'EMISE';

grant select on public.v_sales_register to authenticated;

commit;
