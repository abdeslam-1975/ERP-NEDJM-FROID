-- =============================================================================
-- Phase 2b — Invoice auto-numbering + TVA/TTC snapshot
-- Completes Phase 2 Facturation hub (UI-driven TVA from contract attributes).
-- =============================================================================

begin;

alter table public.contract_invoices
  add column if not exists tva_rate numeric(8,6) not null default 0
    check (tva_rate >= 0 and tva_rate <= 1),
  add column if not exists tva_amount numeric(18,2) not null default 0
    check (tva_amount >= 0),
  add column if not exists total_ttc numeric(18,2) not null default 0
    check (total_ttc >= 0);

comment on column public.contract_invoices.tva_rate is
  'Snapshot of financial.tva_standard_rate (0 if tva_exempt) at draft creation.';

-- Next FAC/{contract_number}/{YYYY}/{nnn} for a contract
create or replace function public.ref_contract_next_invoice_number(p_contract_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_num text;
  v_year text := to_char(current_date, 'YYYY');
  v_prefix text;
  v_max int := 0;
  v_seq text;
begin
  select contract_number into v_num
  from public.ref_contracts
  where id = p_contract_id;

  if v_num is null then
    raise exception 'Contract not found';
  end if;

  v_prefix := 'FAC/' || replace(v_num, ' ', '') || '/' || v_year || '/';

  select coalesce(max(
    nullif(regexp_replace(invoice_number, '^.*\/', ''), '')::int
  ), 0)
  into v_max
  from public.contract_invoices
  where contract_id = p_contract_id
    and invoice_number like v_prefix || '%';

  v_seq := lpad((v_max + 1)::text, 3, '0');
  return v_prefix || v_seq;
end;
$$;

grant execute on function public.ref_contract_next_invoice_number(uuid) to authenticated;

-- Recreate draft RPC: auto-number when blank; snapshot TVA from attributes
create or replace function public.ref_contract_create_invoice_draft(
  p_contract_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_lines jsonb,
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
  v_attrs jsonb;
  v_inv_id uuid;
  v_total numeric(18,2) := 0;
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
  v_tva_exempt boolean;
  v_tva_rate numeric(8,6);
  v_tva_amount numeric(18,2);
  v_total_ttc numeric(18,2);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one invoice line required';
  end if;

  select c.site_id, c.status, c.attributes
  into v_site, v_status, v_attrs
  from public.ref_contracts c
  where c.id = p_contract_id
  for update;

  if v_site is null then
    raise exception 'Contract not found';
  end if;

  if not public.erp_has_perm('client_contracts', 'update'::public.rbac_action, v_site) then
    raise exception 'Permission denied';
  end if;

  if v_status not in ('VALIDE', 'EN_COURS') then
    raise exception 'Invoicing allowed only when status is VALIDE or EN_COURS (current: %)', v_status;
  end if;

  v_number := nullif(trim(coalesce(p_invoice_number, '')), '');
  if v_number is null then
    v_number := public.ref_contract_next_invoice_number(p_contract_id);
  end if;

  v_tva_exempt := coalesce((v_attrs #>> '{financial,tva_exempt}')::boolean, false);
  if v_tva_exempt then
    v_tva_rate := 0;
  else
    v_tva_rate := coalesce((v_attrs #>> '{financial,tva_standard_rate}')::numeric, 0.19);
  end if;

  insert into public.contract_invoices (
    contract_id, invoice_number, invoice_date, status, note, created_by,
    tva_rate, tva_amount, total_ttc
  ) values (
    p_contract_id,
    v_number,
    coalesce(p_invoice_date, current_date),
    'BROUILLON',
    nullif(trim(p_note), ''),
    auth.uid(),
    v_tva_rate,
    0,
    0
  )
  returning id into v_inv_id;

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
    where ci.id = v_item_id
      and ci.contract_id = p_contract_id
    for update;

    if not found then
      raise exception 'Item % not on contract', v_item_id;
    end if;

    v_consumed := public.ref_contract_item_consumed_qty(v_item_id);
    v_invoiced := public.ref_contract_item_invoiced_qty(v_item_id);
    v_billable := v_consumed - v_invoiced;

    if v_qty > v_billable then
      raise exception 'Invoice qty % > billable % for item % (consumed %, already invoiced %)',
        v_qty, v_billable, v_item.item_code, v_consumed, v_invoiced;
    end if;

    v_line_total := round(v_qty * v_item.unit_price_ht, 2);
    v_total := v_total + v_line_total;

    insert into public.contract_invoice_lines (
      invoice_id, contract_item_id, item_code, designation, unit,
      quantity, unit_price_ht, total_price_ht, sort_order
    ) values (
      v_inv_id, v_item.id, v_item.item_code, v_item.designation, v_item.unit,
      round(v_qty, 4), v_item.unit_price_ht, v_line_total, v_idx
    );
  end loop;

  v_tva_amount := round(v_total * v_tva_rate, 2);
  v_total_ttc := round(v_total + v_tva_amount, 2);

  update public.contract_invoices
  set total_ht = v_total,
      tva_rate = v_tva_rate,
      tva_amount = v_tva_amount,
      total_ttc = v_total_ttc
  where id = v_inv_id;

  return jsonb_build_object(
    'id', v_inv_id,
    'invoice_number', v_number,
    'status', 'BROUILLON',
    'total_ht', v_total,
    'tva_rate', v_tva_rate,
    'tva_amount', v_tva_amount,
    'total_ttc', v_total_ttc,
    'lines', v_idx
  );
end;
$$;

grant execute on function public.ref_contract_create_invoice_draft(uuid, text, date, jsonb, text)
  to authenticated;

commit;
