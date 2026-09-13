-- P2: Atomic canva REPLACE for ref_contracts + legacy screen documentation.
-- Requires P1 (erp_has_perm_aliased). Single transaction: delete + insert + HT/caution.

begin;

comment on column public.sys_screens.code is
  'Screen permission key. Legacy aliases kept: users (→ param_users UI), client_contracts (→ ref_contracts UI).';

comment on table public.sys_screens is
  '@note Dual registry: prefer param_users + ref_contracts for new grants; users + client_contracts remain for RLS alias compatibility (see erp_has_perm_aliased).';

create or replace function public.ref_contract_import_canva(
  p_contract_id uuid,
  p_labor jsonb,
  p_spares jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site uuid;
  v_attrs jsonb;
  v_caution_rate numeric(8,6);
  v_caution_amount numeric(18,2);
  v_caution_sync text;
  v_labor_ht numeric(18,2) := 0;
  v_spare_ht numeric(18,2) := 0;
  v_total numeric(18,2);
  v_row jsonb;
  v_idx integer;
  v_qty numeric;
  v_pu numeric;
  v_tot numeric;
  v_labor_count integer := 0;
  v_spare_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select c.site_id, c.attributes, c.caution_rate, c.caution_amount
    into v_site, v_attrs, v_caution_rate, v_caution_amount
  from public.ref_contracts c
  where c.id = p_contract_id
  for update;

  if not found then
    raise exception 'Contract not found';
  end if;

  if not public.erp_has_perm_aliased(
    'ref_contracts', 'client_contracts', 'update', v_site
  ) then
    raise exception 'Permission denied on contract %', p_contract_id;
  end if;

  delete from public.contract_items
  where contract_id = p_contract_id
    and item_type in ('LABOR', 'SPARE_PART');

  v_idx := 0;
  for v_row in
    select value from jsonb_array_elements(coalesce(p_labor, '[]'::jsonb))
  loop
    v_idx := v_idx + 1;
    v_qty := coalesce((v_row->>'quantity')::numeric, 0);
    v_pu := coalesce((v_row->>'unit_price_ht')::numeric, 0);
    v_tot := coalesce(
      nullif(v_row->>'total_price_ht', '')::numeric,
      round(v_qty * v_pu, 2)
    );
    insert into public.contract_items (
      contract_id, item_type, item_code, designation, unit,
      quantity, unit_price_ht, total_price_ht, sort_order
    ) values (
      p_contract_id,
      'LABOR',
      upper(trim(v_row->>'item_code')),
      trim(v_row->>'designation'),
      coalesce(nullif(trim(v_row->>'unit'), ''), 'JOUR'),
      v_qty,
      v_pu,
      v_tot,
      v_idx
    );
    v_labor_ht := v_labor_ht + v_tot;
    v_labor_count := v_labor_count + 1;
  end loop;

  v_idx := 0;
  for v_row in
    select value from jsonb_array_elements(coalesce(p_spares, '[]'::jsonb))
  loop
    v_idx := v_idx + 1;
    v_qty := coalesce((v_row->>'quantity')::numeric, 0);
    v_pu := coalesce((v_row->>'unit_price_ht')::numeric, 0);
    v_tot := coalesce(
      nullif(v_row->>'total_price_ht', '')::numeric,
      round(v_qty * v_pu, 2)
    );
    insert into public.contract_items (
      contract_id, item_type, item_code, designation, unit,
      quantity, unit_price_ht, total_price_ht, sort_order
    ) values (
      p_contract_id,
      'SPARE_PART',
      upper(trim(v_row->>'item_code')),
      trim(v_row->>'designation'),
      coalesce(nullif(trim(v_row->>'unit'), ''), 'U'),
      v_qty,
      v_pu,
      v_tot,
      v_idx
    );
    v_spare_ht := v_spare_ht + v_tot;
    v_spare_count := v_spare_count + 1;
  end loop;

  v_attrs := coalesce(v_attrs, '{}'::jsonb);
  v_attrs := jsonb_set(
    v_attrs,
    '{financial}',
    coalesce(v_attrs->'financial', '{}'::jsonb),
    true
  );
  v_attrs := jsonb_set(v_attrs, '{financial,total_mode}', '"AUTO"'::jsonb, true);
  v_attrs := jsonb_set(
    v_attrs,
    '{spare_parts_seed_status}',
    '"IMPORTED_FROM_CANVA"'::jsonb,
    true
  );

  v_total := round(v_labor_ht + v_spare_ht, 2);
  v_caution_sync := coalesce(v_attrs #>> '{financial,caution_sync}', 'FROM_RATE');

  if v_caution_sync = 'FROM_RATE' then
    v_caution_amount := round(v_total * v_caution_rate, 2);
  elsif v_caution_sync = 'FROM_AMOUNT' and v_total > 0 then
    v_caution_rate := least(1, greatest(0, v_caution_amount / v_total));
  end if;

  update public.ref_contracts
  set
    attributes = v_attrs,
    total_amount_ht = v_total,
    caution_rate = v_caution_rate,
    caution_amount = v_caution_amount,
    updated_at = now()
  where id = p_contract_id;

  return jsonb_build_object(
    'labor', v_labor_count,
    'spares', v_spare_count,
    'total_amount_ht', v_total,
    'caution_amount', v_caution_amount
  );
end;
$$;

grant execute on function public.ref_contract_import_canva(uuid, jsonb, jsonb)
  to authenticated;

comment on function public.ref_contract_import_canva(uuid, jsonb, jsonb) is
  'Atomic REPLACE of LABOR + SPARE_PART lines for a contract; forces total_mode=AUTO and recalculates HT/caution.';

commit;
