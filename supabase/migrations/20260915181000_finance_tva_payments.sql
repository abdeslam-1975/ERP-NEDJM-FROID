-- =============================================================================
-- Invoice-level TVA decisions and TTC customer collections linked to finance.
-- =============================================================================

begin;

drop function if exists public.ref_contract_create_invoice_draft(uuid, text, date, jsonb, text);

create or replace function public.ref_contract_create_invoice_draft(
  p_contract_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_lines jsonb,
  p_note text default null,
  p_invoice_tax_mode text default 'INHERIT',
  p_exemption_certificate_number text default null,
  p_exemption_certificate_date date default null,
  p_exemption_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site uuid;
  v_status public.ref_contract_status;
  v_attrs jsonb;
  v_inv_id uuid := gen_random_uuid();
  v_total numeric(18,2) := 0;
  v_tax_total numeric(18,2) := 0;
  v_line jsonb;
  v_item_id uuid;
  v_qty numeric(18,4);
  v_item record;
  v_consumed numeric(18,4);
  v_invoiced numeric(18,4);
  v_billable numeric(18,4);
  v_idx int := 0;
  v_line_total numeric(18,2);
  v_number text;
  v_contract_mode text;
  v_invoice_mode text;
  v_line_rule text;
  v_rate_id uuid;
  v_rate numeric(8,6);
  v_default_rate_id uuid;
  v_default_rate numeric(8,6);
  v_default_rate_code text;
  v_line_tax numeric(18,2);
  v_breakdown jsonb;
  v_header_rate numeric(8,6);
  v_distinct_positive_rates int;
  v_has_exempt boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one invoice line required';
  end if;
  if p_invoice_tax_mode not in ('INHERIT', 'TAXABLE', 'EXEMPT', 'MIXED') then
    raise exception 'Invalid invoice tax mode';
  end if;

  select c.site_id, c.status, c.attributes
  into v_site, v_status, v_attrs
  from public.ref_contracts c
  where c.id = p_contract_id
  for update;
  if v_site is null then raise exception 'Contract not found'; end if;
  if not public.erp_has_perm('client_contracts', 'update'::public.rbac_action, v_site) then
    raise exception 'Permission denied';
  end if;
  if v_status not in ('VALIDE', 'EN_COURS') then
    raise exception 'Invoicing allowed only when status is VALIDE or EN_COURS (current: %)', v_status;
  end if;

  v_number := coalesce(nullif(trim(coalesce(p_invoice_number, '')), ''), public.ref_contract_next_invoice_number(p_contract_id));
  v_contract_mode := coalesce(v_attrs #>> '{financial,tva_mode}',
    case when coalesce((v_attrs #>> '{financial,tva_exempt}')::boolean, false) then 'EXEMPT' else 'TAXABLE' end);
  if v_contract_mode not in ('TAXABLE', 'EXEMPT', 'MIXED') then v_contract_mode := 'TAXABLE'; end if;
  v_invoice_mode := case when p_invoice_tax_mode = 'INHERIT' then v_contract_mode else p_invoice_tax_mode end;

  v_default_rate_code := nullif(v_attrs #>> '{financial,default_tax_rate_code}', '');
  select id, rate into v_default_rate_id, v_default_rate
  from public.fin_tax_rates
  where active and (
    (v_default_rate_code is not null and code = v_default_rate_code)
    or (v_default_rate_code is null and rate = coalesce((v_attrs #>> '{financial,tva_standard_rate}')::numeric, 0.19))
  )
  order by case when code = v_default_rate_code then 0 else 1 end, valid_from desc nulls last
  limit 1;
  if v_default_rate is null then
    v_default_rate := coalesce((v_attrs #>> '{financial,tva_standard_rate}')::numeric, 0.19);
    v_default_rate_id := null;
  end if;

  insert into public.contract_invoices(
    id, contract_id, invoice_number, invoice_date, status, note, created_by,
    tax_mode, exemption_certificate_number, exemption_certificate_date,
    exemption_note, tva_rate, tva_amount, total_ttc
  ) values (
    v_inv_id, p_contract_id, v_number, coalesce(p_invoice_date, current_date),
    'BROUILLON', nullif(trim(p_note), ''), auth.uid(), v_invoice_mode,
    nullif(trim(p_exemption_certificate_number), ''), p_exemption_certificate_date,
    nullif(trim(p_exemption_note), ''), 0, 0, 0
  );

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_idx := v_idx + 1;
    v_item_id := (v_line->>'contract_item_id')::uuid;
    v_qty := (v_line->>'quantity')::numeric;
    if v_item_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'Invalid line at index %', v_idx;
    end if;

    select ci.* into v_item
    from public.contract_items ci
    where ci.id = v_item_id and ci.contract_id = p_contract_id
    for update;
    if not found then raise exception 'Item % not on contract', v_item_id; end if;

    v_consumed := public.ref_contract_item_consumed_qty(v_item_id);
    v_invoiced := public.ref_contract_item_invoiced_qty(v_item_id);
    v_billable := v_consumed - v_invoiced;
    if v_qty > v_billable then
      raise exception 'Invoice qty % > billable % for item % (consumed %, already invoiced %)',
        v_qty, v_billable, v_item.item_code, v_consumed, v_invoiced;
    end if;

    v_line_rule := coalesce(nullif(v_line->>'tax_rule', ''), v_item.tax_rule, 'INHERIT');
    if v_line_rule not in ('INHERIT', 'TAXABLE', 'EXEMPT') then
      raise exception 'Invalid tax rule at line %', v_idx;
    end if;
    if v_line_rule = 'INHERIT' then
      if v_invoice_mode = 'TAXABLE' then
        v_line_rule := 'TAXABLE';
      elsif coalesce(v_attrs #> '{financial,tva_articles}', '[]'::jsonb) ? v_item.item_code then
        v_line_rule := 'TAXABLE';
      else
        v_line_rule := 'EXEMPT';
      end if;
    end if;

    v_rate_id := coalesce(nullif(v_line->>'tax_rate_id', '')::uuid, v_item.tax_rate_id, v_default_rate_id);
    if v_line_rule = 'EXEMPT' then
      v_rate := 0;
      v_rate_id := null;
    else
      if v_rate_id is null then
        v_rate := v_default_rate;
      else
        select rate into v_rate from public.fin_tax_rates
        where id = v_rate_id and active
          and (valid_from is null or valid_from <= coalesce(p_invoice_date, current_date))
          and (valid_to is null or valid_to >= coalesce(p_invoice_date, current_date));
        if v_rate is null then raise exception 'Inactive or invalid tax rate at line %', v_idx; end if;
      end if;
    end if;

    v_line_total := round(v_qty * v_item.unit_price_ht, 2);
    v_line_tax := round(v_line_total * v_rate, 2);
    v_total := v_total + v_line_total;
    v_tax_total := v_tax_total + v_line_tax;

    insert into public.contract_invoice_lines(
      invoice_id, contract_item_id, item_code, designation, unit,
      quantity, unit_price_ht, total_price_ht, sort_order,
      tax_rule, tax_rate_id, tax_rate, tax_amount
    ) values (
      v_inv_id, v_item.id, v_item.item_code, v_item.designation, v_item.unit,
      round(v_qty, 4), v_item.unit_price_ht, v_line_total, v_idx,
      v_line_rule, v_rate_id, v_rate, v_line_tax
    );
  end loop;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'rate', x.tax_rate, 'base_ht', x.base_ht, 'tax_amount', x.tax_amount
    ) order by x.tax_rate), '[]'::jsonb),
    count(*) filter (where x.tax_rate > 0),
    bool_or(x.tax_rate = 0)
  into v_breakdown, v_distinct_positive_rates, v_has_exempt
  from (
    select tax_rate, round(sum(total_price_ht), 2) base_ht, round(sum(tax_amount), 2) tax_amount
    from public.contract_invoice_lines where invoice_id = v_inv_id group by tax_rate
  ) x;

  v_header_rate := case
    when v_distinct_positive_rates = 1 and not coalesce(v_has_exempt, false)
      then (select max(tax_rate) from public.contract_invoice_lines where invoice_id = v_inv_id)
    else 0
  end;

  update public.contract_invoices set
    total_ht = round(v_total, 2),
    tva_rate = coalesce(v_header_rate, 0),
    tva_amount = round(v_tax_total, 2),
    total_ttc = round(v_total + v_tax_total, 2),
    tax_breakdown = v_breakdown
  where id = v_inv_id;

  return jsonb_build_object(
    'id', v_inv_id, 'invoice_number', v_number, 'status', 'BROUILLON',
    'tax_mode', v_invoice_mode, 'total_ht', round(v_total, 2),
    'tva_amount', round(v_tax_total, 2), 'total_ttc', round(v_total + v_tax_total, 2),
    'tax_breakdown', v_breakdown, 'lines', v_idx
  );
end;
$$;

grant execute on function public.ref_contract_create_invoice_draft(
  uuid, text, date, jsonb, text, text, text, date, text
) to authenticated;

create or replace function public.ref_contract_invoice_open_ht(p_invoice_id uuid)
returns numeric
language sql stable security definer set search_path = public, pg_temp
as $$
  select greatest(
    coalesce((select total_ht from public.contract_invoices where id = p_invoice_id and status = 'EMISE'), 0)
    - coalesce((select sum(amount_ht * direction) from public.contract_payments where invoice_id = p_invoice_id), 0),
    0
  )::numeric(18,2);
$$;

create or replace function public.ref_contract_invoice_open_ttc(p_invoice_id uuid)
returns numeric
language sql stable security definer set search_path = public, pg_temp
as $$
  select greatest(
    coalesce((select total_ttc from public.contract_invoices where id = p_invoice_id and status = 'EMISE'), 0)
    - coalesce((select sum(amount_ttc * direction) from public.contract_payments where invoice_id = p_invoice_id), 0),
    0
  )::numeric(18,2);
$$;

create or replace function public.ref_contract_balance(p_contract_id uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  with inv as (
    select
      coalesce(sum(total_ht), 0)::numeric(18,2) invoiced_ht,
      coalesce(sum(tva_amount), 0)::numeric(18,2) invoiced_tva,
      coalesce(sum(total_ttc), 0)::numeric(18,2) invoiced_ttc
    from public.contract_invoices where contract_id = p_contract_id and status = 'EMISE'
  ), pay as (
    select
      coalesce(sum(p.amount_ht * p.direction), 0)::numeric(18,2) paid_ht,
      coalesce(sum(p.amount_tva * p.direction), 0)::numeric(18,2) paid_tva,
      coalesce(sum(p.amount_ttc * p.direction), 0)::numeric(18,2) paid_ttc
    from public.contract_payments p
    left join public.contract_invoices i on i.id = p.invoice_id
    where p.contract_id = p_contract_id
      and (p.invoice_id is null or i.status = 'EMISE')
  ), open_inv as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'invoice_id', i.id, 'invoice_number', i.invoice_number, 'invoice_date', i.invoice_date,
      'total_ht', i.total_ht, 'total_tva', i.tva_amount, 'total_ttc', i.total_ttc,
      'paid_ht', i.total_ht - public.ref_contract_invoice_open_ht(i.id),
      'paid_ttc', i.total_ttc - public.ref_contract_invoice_open_ttc(i.id),
      'open_ht', public.ref_contract_invoice_open_ht(i.id),
      'open_ttc', public.ref_contract_invoice_open_ttc(i.id)
    ) order by i.invoice_date, i.invoice_number), '[]'::jsonb) invoices
    from public.contract_invoices i
    where i.contract_id = p_contract_id and i.status = 'EMISE'
      and public.ref_contract_invoice_open_ttc(i.id) > 0
  )
  select jsonb_build_object(
    'contract_id', p_contract_id,
    'invoiced_ht', inv.invoiced_ht, 'invoiced_tva', inv.invoiced_tva, 'invoiced_ttc', inv.invoiced_ttc,
    'paid_ht', pay.paid_ht, 'paid_tva', pay.paid_tva, 'paid_ttc', pay.paid_ttc,
    'remaining_ht', round(inv.invoiced_ht - pay.paid_ht, 2),
    'remaining_tva', round(inv.invoiced_tva - pay.paid_tva, 2),
    'remaining_ttc', round(inv.invoiced_ttc - pay.paid_ttc, 2),
    'is_solded', inv.invoiced_ttc > 0 and round(inv.invoiced_ttc - pay.paid_ttc, 2) = 0,
    'open_invoices', open_inv.invoices
  ) from inv, pay, open_inv;
$$;

drop function if exists public.ref_contract_post_payment(
  uuid, numeric, date, public.contract_payment_method, uuid, text, text
);

create or replace function public.ref_contract_post_payment(
  p_contract_id uuid,
  p_account_id uuid,
  p_payment_method_id uuid,
  p_amount_ttc numeric,
  p_payment_date date default current_date,
  p_invoice_id uuid default null,
  p_reference text default null,
  p_note text default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_site uuid;
  v_status public.ref_contract_status;
  v_client text;
  v_account public.fin_accounts%rowtype;
  v_method public.fin_payment_methods%rowtype;
  v_inv public.contract_invoices%rowtype;
  v_bal jsonb;
  v_remaining_ttc numeric(18,2);
  v_remaining_ht numeric(18,2);
  v_amount_ht numeric(18,2);
  v_amount_tva numeric(18,2);
  v_payment_id uuid := gen_random_uuid();
  v_transaction_id uuid := gen_random_uuid();
  v_category uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount_ttc is null or p_amount_ttc <= 0 then raise exception 'Amount must be > 0'; end if;
  select site_id, status, client_name into v_site, v_status, v_client
  from public.ref_contracts where id = p_contract_id for update;
  if v_site is null then raise exception 'Contract not found'; end if;
  if v_status not in ('VALIDE', 'EN_COURS', 'CLOTURE') then
    raise exception 'Payment not allowed for status %', v_status;
  end if;
  select * into v_account from public.fin_accounts where id = p_account_id for update;
  if not found or not v_account.active then raise exception 'Active financial account required'; end if;
  if not public.fin_can_access('create', v_account.site_id) then raise exception 'Permission denied'; end if;
  select * into v_method from public.fin_payment_methods where id = p_payment_method_id and active;
  if not found then raise exception 'Active payment method required'; end if;
  if v_method.account_scope <> 'BOTH' and v_method.account_scope <> v_account.account_type then
    raise exception 'Payment method is incompatible with account type';
  end if;
  if public.fin_period_is_locked(v_account.id, coalesce(p_payment_date, current_date)) then
    raise exception 'Financial period is locked';
  end if;

  if p_invoice_id is not null then
    select * into v_inv from public.contract_invoices
    where id = p_invoice_id and contract_id = p_contract_id for update;
    if not found or v_inv.status <> 'EMISE' then raise exception 'Issued invoice not found on contract'; end if;
    v_remaining_ttc := public.ref_contract_invoice_open_ttc(v_inv.id);
    v_remaining_ht := public.ref_contract_invoice_open_ht(v_inv.id);
    if round(p_amount_ttc, 2) > v_remaining_ttc then
      raise exception 'Payment % exceeds invoice open TTC %', p_amount_ttc, v_remaining_ttc;
    end if;
    v_amount_ht := case
      when round(p_amount_ttc, 2) = v_remaining_ttc then v_remaining_ht
      when v_inv.total_ttc = 0 then 0
      else least(v_remaining_ht, round(p_amount_ttc * v_inv.total_ht / v_inv.total_ttc, 2))
    end;
  else
    v_bal := public.ref_contract_balance(p_contract_id);
    v_remaining_ttc := (v_bal->>'remaining_ttc')::numeric;
    v_remaining_ht := (v_bal->>'remaining_ht')::numeric;
    if round(p_amount_ttc, 2) > v_remaining_ttc then
      raise exception 'Payment % exceeds remaining receivable TTC %', p_amount_ttc, v_remaining_ttc;
    end if;
    v_amount_ht := case
      when round(p_amount_ttc, 2) = v_remaining_ttc then v_remaining_ht
      when (v_bal->>'invoiced_ttc')::numeric = 0 then 0
      else least(v_remaining_ht, round(p_amount_ttc * (v_bal->>'invoiced_ht')::numeric / (v_bal->>'invoiced_ttc')::numeric, 2))
    end;
  end if;
  v_amount_tva := round(p_amount_ttc - v_amount_ht, 2);
  select id into v_category from public.fin_categories where code = 'ENCAISSEMENT_CLIENT';

  insert into public.fin_transactions(
    id, account_id, site_id, movement_date, direction, amount, category_id,
    payment_method_id, reference, description, counterparty, source_type,
    source_id, created_by
  ) values (
    v_transaction_id, v_account.id, v_account.site_id, coalesce(p_payment_date, current_date),
    'IN', round(p_amount_ttc, 2), v_category, v_method.id, nullif(trim(p_reference), ''),
    coalesce(nullif(trim(p_note), ''), 'Encaissement contrat'), v_client,
    'CUSTOMER_PAYMENT', v_payment_id, auth.uid()
  );
  insert into public.contract_payments(
    id, contract_id, invoice_id, payment_date, amount_ht, amount_tva, amount_ttc,
    method, payment_method_id, account_id, financial_transaction_id,
    direction, reference, note, created_by
  ) values (
    v_payment_id, p_contract_id, p_invoice_id, coalesce(p_payment_date, current_date),
    v_amount_ht, v_amount_tva, round(p_amount_ttc, 2),
    coalesce(v_method.legacy_contract_method, 'AUTRE')::public.contract_payment_method,
    v_method.id, v_account.id, v_transaction_id, 1,
    nullif(trim(p_reference), ''), nullif(trim(p_note), ''), auth.uid()
  );
  v_bal := public.ref_contract_balance(p_contract_id);
  return jsonb_build_object('id', v_payment_id, 'transaction_id', v_transaction_id, 'balance', v_bal);
end;
$$;

create or replace function public.ref_contract_reverse_payment(
  p_payment_id uuid,
  p_reversal_date date,
  p_reason text
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_payment public.contract_payments%rowtype;
  v_tx public.fin_transactions%rowtype;
  v_reversal_payment_id uuid := gen_random_uuid();
  v_reversal_tx_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_payment from public.contract_payments where id = p_payment_id for update;
  if not found or v_payment.direction <> 1 or v_payment.financial_transaction_id is null then
    raise exception 'Reversible payment not found';
  end if;
  if exists (select 1 from public.contract_payments where reversal_of = p_payment_id) then
    raise exception 'Payment already reversed';
  end if;
  select * into v_tx from public.fin_transactions where id = v_payment.financial_transaction_id for update;
  if v_tx.reconciled_at is not null then raise exception 'Unreconcile payment before reversal'; end if;
  if not public.fin_can_access('update', v_tx.site_id) then raise exception 'Permission denied'; end if;
  if public.fin_period_is_locked(v_tx.account_id, coalesce(p_reversal_date, current_date)) then
    raise exception 'Financial period is locked';
  end if;

  insert into public.fin_transactions(
    id, account_id, site_id, movement_date, direction, amount, category_id,
    payment_method_id, reference, description, counterparty, source_type,
    source_id, reversal_of, created_by
  ) values (
    v_reversal_tx_id, v_tx.account_id, v_tx.site_id, coalesce(p_reversal_date, current_date),
    'OUT', v_tx.amount, v_tx.category_id, v_tx.payment_method_id, v_tx.reference,
    'Annulation paiement: ' || trim(p_reason), v_tx.counterparty, 'REVERSAL',
    v_reversal_payment_id, v_tx.id, auth.uid()
  );
  insert into public.contract_payments(
    id, contract_id, invoice_id, payment_date, amount_ht, amount_tva, amount_ttc,
    method, payment_method_id, account_id, financial_transaction_id, direction,
    reversal_of, reference, note, created_by
  ) values (
    v_reversal_payment_id, v_payment.contract_id, v_payment.invoice_id,
    coalesce(p_reversal_date, current_date), v_payment.amount_ht, v_payment.amount_tva,
    v_payment.amount_ttc, v_payment.method, v_payment.payment_method_id,
    v_payment.account_id, v_reversal_tx_id, -1, v_payment.id,
    v_payment.reference, trim(p_reason), auth.uid()
  );
  return jsonb_build_object(
    'id', v_reversal_payment_id, 'transaction_id', v_reversal_tx_id,
    'balance', public.ref_contract_balance(v_payment.contract_id)
  );
end;
$$;

grant execute on function public.ref_contract_invoice_open_ttc(uuid) to authenticated;
grant execute on function public.ref_contract_post_payment(uuid, uuid, uuid, numeric, date, uuid, text, text) to authenticated;
grant execute on function public.ref_contract_reverse_payment(uuid, date, text) to authenticated;

comment on function public.ref_contract_post_payment(uuid, uuid, uuid, numeric, date, uuid, text, text) is
  'Posts an actual TTC collection to Banque/Caisse and allocates its HT/TVA portions.';

commit;
