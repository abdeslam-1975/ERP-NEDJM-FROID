-- =============================================================================
-- Phase 5b — Enriched contract stats + closeout checklist snapshot
-- =============================================================================

begin;

create or replace function public.ref_contract_stats(p_contract_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.ref_contract_status;
  v_total numeric(18,2);
  v_contractual numeric(18,4) := 0;
  v_consumed numeric(18,4) := 0;
  v_consumed_ht numeric(18,2) := 0;
  v_labor_consumed numeric(18,4) := 0;
  v_spare_consumed numeric(18,4) := 0;
  v_penalties numeric(18,2) := 0;
  v_penalties_n int := 0;
  v_open_inv int := 0;
  v_draft_inv int := 0;
  v_bal jsonb;
  v_invoiced numeric(18,2);
  v_paid numeric(18,2);
  v_remaining numeric(18,2);
  v_solded boolean;
  v_blockers jsonb := '[]'::jsonb;
  v_can_close boolean;
begin
  select status, total_amount_ht into v_status, v_total
  from public.ref_contracts where id = p_contract_id;
  if v_status is null then raise exception 'Contract not found'; end if;

  select coalesce(sum(quantity), 0) into v_contractual
  from public.contract_items where contract_id = p_contract_id;

  select
    coalesce(sum(case when m.direction = 'CONSUME' then m.quantity else -m.quantity end), 0),
    coalesce(sum(
      case when m.direction = 'CONSUME' then m.quantity * ci.unit_price_ht
           else -m.quantity * ci.unit_price_ht end
    ), 0),
    coalesce(sum(
      case when ci.item_type = 'LABOR' and m.direction = 'CONSUME' then m.quantity
           when ci.item_type = 'LABOR' then -m.quantity else 0 end
    ), 0),
    coalesce(sum(
      case when ci.item_type = 'SPARE_PART' and m.direction = 'CONSUME' then m.quantity
           when ci.item_type = 'SPARE_PART' then -m.quantity else 0 end
    ), 0)
  into v_consumed, v_consumed_ht, v_labor_consumed, v_spare_consumed
  from public.contract_consumption_movements m
  join public.contract_items ci on ci.id = m.contract_item_id
  where m.contract_id = p_contract_id;

  select coalesce(sum(amount_ht), 0), count(*)
  into v_penalties, v_penalties_n
  from public.contract_penalty_events
  where contract_id = p_contract_id;

  select count(*) into v_open_inv
  from public.contract_invoices i
  where i.contract_id = p_contract_id
    and i.status = 'EMISE'
    and public.ref_contract_invoice_open_ht(i.id) > 0;

  select count(*) into v_draft_inv
  from public.contract_invoices
  where contract_id = p_contract_id and status = 'BROUILLON';

  v_bal := public.ref_contract_balance(p_contract_id);
  v_invoiced := coalesce((v_bal->>'invoiced_ht')::numeric, 0);
  v_paid := coalesce((v_bal->>'paid_ht')::numeric, 0);
  v_remaining := coalesce((v_bal->>'remaining_ht')::numeric, 0);
  v_solded := coalesce((v_bal->>'is_solded')::boolean, false);

  if v_status in ('CLOTURE', 'ANNULE') then
    v_blockers := v_blockers || jsonb_build_array('Statut déjà ' || v_status::text);
  end if;
  if v_remaining > 0 then
    v_blockers := v_blockers || jsonb_build_array(
      format('Reste à encaisser %s DA', v_remaining)
    );
  end if;
  if v_draft_inv > 0 then
    v_blockers := v_blockers || jsonb_build_array(
      format('%s facture(s) en brouillon', v_draft_inv)
    );
  end if;
  if v_open_inv > 0 then
    v_blockers := v_blockers || jsonb_build_array(
      format('%s facture(s) ÉMISE non soldée(s)', v_open_inv)
    );
  end if;

  -- Align with non-force close: remaining cleared + no draft invoices.
  v_can_close := (
    v_status not in ('CLOTURE', 'ANNULE')
    and v_remaining <= 0
    and v_draft_inv = 0
  );

  return jsonb_build_object(
    'contract_id', p_contract_id,
    'status', v_status,
    'contract_total_ht', v_total,
    'contractual_qty', v_contractual,
    'consumed_qty', v_consumed,
    'consumed_ht', round(v_consumed_ht, 2),
    'labor_consumed_qty', v_labor_consumed,
    'spare_consumed_qty', v_spare_consumed,
    'pct_qty_consumed', case when v_contractual = 0 then null
      else round((v_consumed / v_contractual) * 100, 2) end,
    'pct_ht_consumed', case when coalesce(v_total, 0) = 0 then null
      else round((v_consumed_ht / v_total) * 100, 2) end,
    'invoiced_ht', v_invoiced,
    'paid_ht', v_paid,
    'remaining_ht', v_remaining,
    'is_solded', v_solded,
    'pct_invoiced', case when coalesce(v_total, 0) = 0 then null
      else round((v_invoiced / v_total) * 100, 2) end,
    'pct_collected', case when v_invoiced = 0 then null
      else round((v_paid / v_invoiced) * 100, 2) end,
    'penalties_ht', v_penalties,
    'penalties_count', v_penalties_n,
    'open_invoices_count', v_open_inv,
    'draft_invoices_count', v_draft_inv,
    'close_blockers', v_blockers,
    'can_close', v_can_close
  );
end;
$$;

grant execute on function public.ref_contract_stats(uuid) to authenticated;

create or replace function public.ref_contract_close(
  p_contract_id uuid,
  p_force boolean default false
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
  v_stats jsonb;
  v_remaining numeric(18,2);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select site_id, status, attributes
  into v_site, v_status, v_attrs
  from public.ref_contracts
  where id = p_contract_id
  for update;

  if v_site is null then raise exception 'Contract not found'; end if;
  if not public.erp_has_perm('client_contracts', 'update'::public.rbac_action, v_site) then
    raise exception 'Permission denied';
  end if;
  if v_status = 'CLOTURE' then raise exception 'Already closed'; end if;
  if v_status = 'ANNULE' then raise exception 'Cancelled contract cannot be closed'; end if;

  v_stats := public.ref_contract_stats(p_contract_id);
  v_remaining := coalesce((v_stats->>'remaining_ht')::numeric, 0);

  if not coalesce(p_force, false) and v_remaining > 0 then
    raise exception 'Cannot close: remaining receivable % > 0 (use force if authorized)', v_remaining;
  end if;

  if not coalesce(p_force, false)
     and coalesce((v_stats->>'draft_invoices_count')::int, 0) > 0 then
    raise exception 'Cannot close: draft invoices remain (use force if authorized)';
  end if;

  v_attrs := coalesce(v_attrs, '{}'::jsonb) || jsonb_build_object(
    'closeout', jsonb_build_object(
      'closed_at', now(),
      'closed_by', auth.uid(),
      'forced', coalesce(p_force, false),
      'snapshot', v_stats
    )
  );

  update public.ref_contracts
  set status = 'CLOTURE',
      attributes = v_attrs,
      updated_at = now()
  where id = p_contract_id;

  return jsonb_build_object(
    'id', p_contract_id,
    'status', 'CLOTURE',
    'forced', coalesce(p_force, false),
    'stats', v_stats
  );
end;
$$;

grant execute on function public.ref_contract_close(uuid, boolean) to authenticated;

comment on function public.ref_contract_stats(uuid) is
  'Pilotage KPIs + close blockers for a client contract.';
comment on function public.ref_contract_close(uuid, boolean) is
  'Close contract when remaining=0 (or force); stores attributes.closeout snapshot.';

commit;
