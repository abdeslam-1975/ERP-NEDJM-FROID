-- =============================================================================
-- Phase 3c — Fix balance when invoice cancelled after payments
-- paid_ht only counts payments on EMISE invoices (or unallocated).
-- Cancel blocked if payments already linked to the invoice.
-- =============================================================================

begin;

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
    select coalesce(sum(p.amount_ht), 0)::numeric(18,2) as paid_ht
    from public.contract_payments p
    left join public.contract_invoices i on i.id = p.invoice_id
    where p.contract_id = p_contract_id
      and (p.invoice_id is null or i.status = 'EMISE')
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

-- Harden cancel: refuse if payments exist on this invoice
create or replace function public.ref_contract_cancel_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.contract_invoices%rowtype;
  v_site uuid;
  v_pay_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_inv
  from public.contract_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  select c.site_id into v_site from public.ref_contracts c where c.id = v_inv.contract_id;
  if not public.erp_has_perm('client_contracts', 'update'::public.rbac_action, v_site) then
    raise exception 'Permission denied';
  end if;

  if v_inv.status = 'ANNULEE' then
    raise exception 'Invoice already cancelled';
  end if;

  select count(*) into v_pay_count
  from public.contract_payments
  where invoice_id = p_invoice_id;

  if v_pay_count > 0 then
    raise exception 'Cannot cancel invoice with % linked payment(s)', v_pay_count;
  end if;

  update public.contract_invoices
  set status = 'ANNULEE'
  where id = p_invoice_id;

  return jsonb_build_object('id', p_invoice_id, 'status', 'ANNULEE');
end;
$$;

grant execute on function public.ref_contract_cancel_invoice(uuid) to authenticated;

commit;
