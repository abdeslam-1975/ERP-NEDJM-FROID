-- =============================================================================
-- Ventes — Bons de commande client (sal_orders / sal_order_lines).
-- Under Ventes only. Does not alter Achats (pur_*), Banque, or Caisse.
-- Does not alter sal_invoices / payment flows.
-- =============================================================================

begin;

do $$ begin
  create type public.sal_order_status as enum ('BROUILLON', 'EMIS', 'ANNULE');
exception when duplicate_object then null;
end $$;

create table if not exists public.sal_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null check (char_length(trim(order_number)) between 1 and 40),
  fiscal_year integer not null check (fiscal_year between 1990 and 2100),
  order_date date not null default current_date,
  client_id uuid not null references public.ref_clients(id) on delete restrict,
  contract_id uuid references public.ref_contracts(id) on delete restrict,
  client_name text not null check (char_length(trim(client_name)) between 1 and 300),
  client_address text,
  client_nif text,
  client_article text,
  client_rc text,
  client_phone text,
  contract_ref text,
  payment_terms text,
  delivery_delay text,
  buyer_name text,
  established_by text,
  has_pose boolean not null default false,
  tax_rate numeric(8,6) not null default 0.19
    check (tax_rate >= 0 and tax_rate <= 1),
  discount_amount numeric(18,2) not null default 0 check (discount_amount >= 0),
  retention_rate numeric(8,6) not null default 0
    check (retention_rate >= 0 and retention_rate <= 1),
  retention_amount numeric(18,2) not null default 0 check (retention_amount >= 0),
  stamp_amount numeric(18,2) not null default 0 check (stamp_amount >= 0),
  total_ht numeric(18,2) not null default 0 check (total_ht >= 0),
  total_ht_net numeric(18,2) not null default 0 check (total_ht_net >= 0),
  total_tva numeric(18,2) not null default 0 check (total_tva >= 0),
  total_ttc numeric(18,2) not null default 0 check (total_ttc >= 0),
  net_payable numeric(18,2) not null default 0 check (net_payable >= 0),
  amount_in_words text,
  note text check (char_length(coalesce(note, '')) <= 500),
  status public.sal_order_status not null default 'BROUILLON',
  issued_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fiscal_year, order_number)
);

create index if not exists sal_orders_date_idx
  on public.sal_orders (order_date desc, created_at desc);
create index if not exists sal_orders_client_idx
  on public.sal_orders (client_id, order_date desc);
create index if not exists sal_orders_status_idx
  on public.sal_orders (status, order_date desc);

create table if not exists public.sal_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sal_orders(id) on delete cascade,
  line_no integer not null check (line_no > 0),
  item_code text,
  designation text not null check (char_length(trim(designation)) between 1 and 500),
  unit text,
  qty numeric(18,4) not null default 0 check (qty >= 0),
  unit_price_ht numeric(18,4) not null default 0 check (unit_price_ht >= 0),
  pose_price_ht numeric(18,4) not null default 0 check (pose_price_ht >= 0),
  line_ht numeric(18,2) not null default 0 check (line_ht >= 0),
  line_tax_rate numeric(8,6) not null default 0
    check (line_tax_rate >= 0 and line_tax_rate <= 1),
  created_at timestamptz not null default now(),
  unique (order_id, line_no)
);

create index if not exists sal_order_lines_order_idx
  on public.sal_order_lines (order_id, line_no);

-- ---- Guards (issued / cancelled frozen) ----

create or replace function public.sal_orders_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'EMIS' then
      raise exception 'Cannot delete an issued sales order (cancel instead)';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status = 'EMIS' then
    if new.status = 'EMIS' then
      if new.order_number is distinct from old.order_number
         or new.fiscal_year is distinct from old.fiscal_year
         or new.client_id is distinct from old.client_id
         or new.total_ht is distinct from old.total_ht
         or new.total_ht_net is distinct from old.total_ht_net
         or new.total_tva is distinct from old.total_tva
         or new.total_ttc is distinct from old.total_ttc
         or new.retention_amount is distinct from old.retention_amount
         or new.stamp_amount is distinct from old.stamp_amount
         or new.net_payable is distinct from old.net_payable
         or new.discount_amount is distinct from old.discount_amount
         or new.tax_rate is distinct from old.tax_rate
      then
        raise exception 'Issued sales order amounts/identity are frozen';
      end if;
    elsif new.status not in ('ANNULE') then
      raise exception 'Issued sales order can only move to ANNULE';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.status = 'ANNULE' then
    raise exception 'Cancelled sales order is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sal_orders_guard on public.sal_orders;
create trigger trg_sal_orders_guard
  before update or delete on public.sal_orders
  for each row execute function public.sal_orders_guard();

create or replace function public.sal_order_lines_guard()
returns trigger
language plpgsql
as $$
declare
  v_status public.sal_order_status;
  v_order_id uuid;
begin
  v_order_id := coalesce(new.order_id, old.order_id);
  select status into v_status from public.sal_orders where id = v_order_id;
  if v_status in ('EMIS', 'ANNULE') then
    raise exception 'Cannot change lines of an issued/cancelled sales order';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sal_order_lines_guard on public.sal_order_lines;
create trigger trg_sal_order_lines_guard
  before insert or update or delete on public.sal_order_lines
  for each row execute function public.sal_order_lines_guard();

drop trigger if exists trg_sal_orders_updated on public.sal_orders;
create trigger trg_sal_orders_updated
  before update on public.sal_orders
  for each row execute function public.erp_set_updated_at();

drop trigger if exists trg_sal_orders_audit on public.sal_orders;
create trigger trg_sal_orders_audit
  after insert or update or delete on public.sal_orders
  for each row execute function public.sys_audit_row_change();

drop trigger if exists trg_sal_order_lines_audit on public.sal_order_lines;
create trigger trg_sal_order_lines_audit
  after insert or update or delete on public.sal_order_lines
  for each row execute function public.sys_audit_row_change();

-- ---- RLS (same sal_can as invoices) ----

alter table public.sal_orders enable row level security;
alter table public.sal_order_lines enable row level security;

grant select, insert, update, delete on public.sal_orders to authenticated;
grant select, insert, update, delete on public.sal_order_lines to authenticated;

drop policy if exists sal_orders_read on public.sal_orders;
create policy sal_orders_read on public.sal_orders
  for select to authenticated
  using (public.sal_can('read'));

drop policy if exists sal_orders_insert on public.sal_orders;
create policy sal_orders_insert on public.sal_orders
  for insert to authenticated
  with check (public.sal_can('create'));

drop policy if exists sal_orders_update on public.sal_orders;
create policy sal_orders_update on public.sal_orders
  for update to authenticated
  using (public.sal_can('update'))
  with check (public.sal_can('update'));

drop policy if exists sal_orders_delete on public.sal_orders;
create policy sal_orders_delete on public.sal_orders
  for delete to authenticated
  using (public.sal_can('delete'));

drop policy if exists sal_order_lines_read on public.sal_order_lines;
create policy sal_order_lines_read on public.sal_order_lines
  for select to authenticated
  using (public.sal_can('read'));

drop policy if exists sal_order_lines_insert on public.sal_order_lines;
create policy sal_order_lines_insert on public.sal_order_lines
  for insert to authenticated
  with check (public.sal_can('create') or public.sal_can('update'));

drop policy if exists sal_order_lines_update on public.sal_order_lines;
create policy sal_order_lines_update on public.sal_order_lines
  for update to authenticated
  using (public.sal_can('update'))
  with check (public.sal_can('update'));

drop policy if exists sal_order_lines_delete on public.sal_order_lines;
create policy sal_order_lines_delete on public.sal_order_lines
  for delete to authenticated
  using (public.sal_can('update') or public.sal_can('delete'));

commit;
