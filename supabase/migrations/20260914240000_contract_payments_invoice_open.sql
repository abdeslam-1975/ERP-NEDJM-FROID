-- =============================================================================
-- Phase 3b — Per-invoice open balance + payment capped to invoice reste
-- Completes Solde / Paiements hub (contract + invoice-level receivable).
-- =============================================================================

begin;

-- Open amount on one EMISE invoice (total_ht − payments linked to it)
create or replace function public.ref_contract_invoice_open_ht(p_invoice_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select greatest(
    coalesce((
      select i.total_ht
      from public.contract_invoices i
      where i.id = p_invoice_id and i.status = 'EMISE'
    ), 0)
    - coalesce((
      select sum(p.amount_ht)
      from public.contract_payments p
      where p.invoice_id = p_invoice_id
    ), 0)
  , 0)::numeric(18,2);
$$;

grant execute on function public.ref_contract_invoice_open_ht(uuid) to authenticated;

-- Enriched balance: contract totals + open EMISE invoices
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
  ),
  open_inv as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'invoice_id', i.id,
        'invoice_number', i.invoice_number,
        'invoice_date', i.invoice_date,
        'total_ht', i.total_ht,
        'paid_ht', coalesce((
          select sum(p.amount_ht) from public.contract_payments p where p.invoice_id = i.id
        ), 0),
        'open_ht', public.ref_contract_invoice_open_ht(i.id)
      ) order by i.invoice_date, i.invoice_number
    ), '[]'::jsonb) as invoices
    from public.contract_invoices i
    where i.contract_id = p_contract_id
      and i.status = 'EMISE'
      and public.ref_contract_invoice_open_ht(i.id) > 0
  )
  select jsonb_build_object(
    'contract_id', p_contract_id,
    'invoiced_ht', inv.invoiced_ht,
    'paid_ht', pay.paid_ht,
    'remaining_ht', round(inv.invoiced_ht - pay.paid_ht, 2),
    'is_solded', (inv.invoiced_ht > 0 and round(inv.invoiced_ht - pay.paid_ht, 2) = 0),
    'open_invoices', open_inv.invoices
  )
  from inv, pay, open_inv;
$$;

-- Post payment: also cap to invoice open_ht when invoice linked
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
  v_inv_open numeric(18,2);
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
    v_inv_open := public.ref_contract_invoice_open_ht(p_invoice_id);
    if p_amount_ht > v_inv_open then
      raise exception 'Payment % exceeds invoice open amount %', p_amount_ht, v_inv_open;
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

comment on function public.ref_contract_invoice_open_ht(uuid) is
  'EMISE invoice remaining HT after linked payments.';

commit;
