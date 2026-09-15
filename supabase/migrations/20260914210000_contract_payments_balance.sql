-- =============================================================================
-- Phase 3 — Contract payments & balance (solde)
-- EMISE invoices create receivable; payments reduce open amount; SOLDE when zero.
-- =============================================================================

begin;

do $$ begin
  create type public.contract_payment_method as enum (
    'VIREMENT', 'CHEQUE', 'ESPECES', 'AUTRE'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.contract_payments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.ref_contracts(id) on delete restrict,
  invoice_id uuid references public.contract_invoices(id) on delete restrict,
  payment_date date not null default current_date,
  amount_ht numeric(18,2) not null check (amount_ht > 0),
  method public.contract_payment_method not null default 'VIREMENT',
  reference text,
  note text,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  check (char_length(coalesce(note, '')) <= 500),
  check (char_length(coalesce(reference, '')) <= 120)
);

create index if not exists contract_payments_contract_idx
  on public.contract_payments (contract_id, payment_date desc);
create index if not exists contract_payments_invoice_idx
  on public.contract_payments (invoice_id);

-- Append-only payments
create or replace function public.contract_payments_prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'contract_payments is append-only';
end;
$$;

drop trigger if exists trg_contract_payments_no_update on public.contract_payments;
create trigger trg_contract_payments_no_update
  before update on public.contract_payments
  for each row execute function public.contract_payments_prevent_mutation();

drop trigger if exists trg_contract_payments_no_delete on public.contract_payments;
create trigger trg_contract_payments_no_delete
  before delete on public.contract_payments
  for each row execute function public.contract_payments_prevent_mutation();

drop trigger if exists trg_contract_payments_audit on public.contract_payments;
create trigger trg_contract_payments_audit
  after insert or update or delete on public.contract_payments
  for each row execute function public.sys_audit_row_change();

alter table public.contract_payments enable row level security;
grant select, insert on public.contract_payments to authenticated;

drop policy if exists contract_payments_read on public.contract_payments;
create policy contract_payments_read on public.contract_payments
  for select to authenticated
  using (
    exists (
      select 1 from public.ref_contracts c
      where c.id = contract_id
        and public.erp_can_see_site(c.site_id)
        and public.erp_has_perm('client_contracts', 'read'::public.rbac_action, c.site_id)
    )
  );

drop policy if exists contract_payments_insert on public.contract_payments;
create policy contract_payments_insert on public.contract_payments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ref_contracts c
      where c.id = contract_id
        and public.erp_has_perm('client_contracts', 'update'::public.rbac_action, c.site_id)
    )
  );

create or replace function public.ref_contract_balance(p_contract_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with inv as (
    select coalesce(sum(total_ht), 0)::numeric(18,2) as invoiced_ht
    from public.contract_invoices
    where contract_id = p_contract_id and status = 'EMISE'
  ),
  pay as (
    select coalesce(sum(amount_ht), 0)::numeric(18,2) as paid_ht
    from public.contract_payments
    where contract_id = p_contract_id
  )
  select jsonb_build_object(
    'contract_id', p_contract_id,
    'invoiced_ht', inv.invoiced_ht,
    'paid_ht', pay.paid_ht,
    'remaining_ht', round(inv.invoiced_ht - pay.paid_ht, 2),
    'is_solded', (inv.invoiced_ht > 0 and round(inv.invoiced_ht - pay.paid_ht, 2) = 0)
  )
  from inv, pay;
$$;

grant execute on function public.ref_contract_balance(uuid) to authenticated;

create or replace function public.ref_contract_post_payment(
  p_contract_id uuid,
  p_amount_ht numeric,
  p_payment_date date default current_date,
  p_method public.contract_payment_method default 'VIREMENT',
  p_invoice_id uuid default null,
  p_reference text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site uuid;
  v_status public.ref_contract_status;
  v_bal jsonb;
  v_remaining numeric(18,2);
  v_inv_status public.contract_invoice_status;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount_ht is null or p_amount_ht <= 0 then
    raise exception 'Amount must be > 0';
  end if;

  select c.site_id, c.status into v_site, v_status
  from public.ref_contracts c
  where c.id = p_contract_id
  for update;

  if v_site is null then
    raise exception 'Contract not found';
  end if;

  if not public.erp_has_perm('client_contracts', 'update'::public.rbac_action, v_site) then
    raise exception 'Permission denied';
  end if;

  if v_status not in ('VALIDE', 'EN_COURS', 'CLOTURE') then
    raise exception 'Payment not allowed for status %', v_status;
  end if;

  if p_invoice_id is not null then
    select status into v_inv_status
    from public.contract_invoices
    where id = p_invoice_id and contract_id = p_contract_id;
    if v_inv_status is null then
      raise exception 'Invoice not found on contract';
    end if;
    if v_inv_status <> 'EMISE' then
      raise exception 'Payments only against EMISE invoices';
    end if;
  end if;

  v_bal := public.ref_contract_balance(p_contract_id);
  v_remaining := (v_bal->>'remaining_ht')::numeric;

  if p_amount_ht > v_remaining then
    raise exception 'Payment % exceeds remaining receivable %', p_amount_ht, v_remaining;
  end if;

  insert into public.contract_payments (
    contract_id, invoice_id, payment_date, amount_ht, method, reference, note, created_by
  ) values (
    p_contract_id,
    p_invoice_id,
    coalesce(p_payment_date, current_date),
    round(p_amount_ht, 2),
    coalesce(p_method, 'VIREMENT'),
    nullif(trim(p_reference), ''),
    nullif(trim(p_note), ''),
    auth.uid()
  )
  returning id into v_id;

  v_bal := public.ref_contract_balance(p_contract_id);

  return jsonb_build_object(
    'id', v_id,
    'balance', v_bal
  );
end;
$$;

grant execute on function public.ref_contract_post_payment(
  uuid, numeric, date, public.contract_payment_method, uuid, text, text
) to authenticated;

comment on table public.contract_payments is
  'Append-only payments against EMISE invoice receivable; balance = invoiced − paid.';

commit;
