-- =============================================================================
-- Phase 4b — Penalty amount suggestion + RH employee on consumption
-- =============================================================================

begin;

alter table public.contract_penalty_events
  add column if not exists basis_days numeric(12,4),
  add column if not exists rule_mode text,
  add column if not exists hr_employee_id uuid references public.hr_employees(id) on delete set null;

create index if not exists contract_penalty_events_employee_idx
  on public.contract_penalty_events (hr_employee_id)
  where hr_employee_id is not null;

-- Suggest amount from contract attributes.penalties (presets|custom)
create or replace function public.ref_contract_suggest_penalty(
  p_contract_id uuid,
  p_rule_code text,
  p_basis_days numeric default 1,
  p_item_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_attrs jsonb;
  v_rules jsonb;
  v_rule jsonb;
  v_mode text;
  v_rate numeric;
  v_fixed numeric;
  v_daily numeric;
  v_item_ht numeric;
  v_days numeric;
  v_amount numeric(18,2);
  v_bracket jsonb;
  v_from int;
  v_best_rate numeric := 0;
begin
  select attributes into v_attrs
  from public.ref_contracts
  where id = p_contract_id;

  if v_attrs is null then
    raise exception 'Contract not found';
  end if;

  v_rules := coalesce(v_attrs #> '{penalties,presets}', '[]'::jsonb)
          || coalesce(v_attrs #> '{penalties,custom}', '[]'::jsonb);

  select r into v_rule
  from jsonb_array_elements(v_rules) r
  where r->>'code' = trim(p_rule_code)
     or upper(r->>'code') = upper(trim(p_rule_code))
  limit 1;

  if v_rule is null then
    raise exception 'Penalty rule % not found on contract', p_rule_code;
  end if;

  if coalesce((v_rule->>'enabled')::boolean, true) is not true then
    raise exception 'Penalty rule % is disabled', p_rule_code;
  end if;

  v_mode := coalesce(v_rule->>'mode', 'FIXED');
  v_rate := coalesce((v_rule->>'rate')::numeric, 0);
  v_fixed := coalesce((v_rule->>'fixed_amount')::numeric, 0);
  v_days := greatest(coalesce(p_basis_days, 1), 0);
  v_daily := coalesce((v_attrs->>'daily_rate_ht')::numeric, 0);
  if v_daily = 0 then
    v_daily := coalesce((v_attrs #>> '{financial,daily_rate_ht}')::numeric, 0);
  end if;

  if v_mode = 'FIXED' then
    v_amount := round(v_fixed, 2);
  elsif v_mode = 'PCT_DAILY' then
    if v_daily <= 0 then
      select total_amount_ht into v_daily from public.ref_contracts where id = p_contract_id;
      -- fallback: use total as base * rate * days / 365 is too arbitrary; prefer daily_rate
      v_daily := coalesce(v_daily, 0);
    end if;
    v_amount := round(v_daily * v_rate * v_days, 2);
  elsif v_mode = 'PCT_ITEM' then
    select coalesce(sum(total_price_ht), 0) into v_item_ht
    from public.contract_items
    where contract_id = p_contract_id
      and (
        p_item_code is null
        or item_code = p_item_code
        or item_code = coalesce(v_rule->>'item_code_ref', p_item_code)
      );
    if coalesce(v_rule->>'item_code_ref', '') <> '' then
      select coalesce(sum(total_price_ht), 0) into v_item_ht
      from public.contract_items
      where contract_id = p_contract_id
        and item_code = v_rule->>'item_code_ref';
    end if;
    v_amount := round(v_item_ht * v_rate, 2);
  elsif v_mode = 'PROGRESSIVE' then
    for v_bracket in
      select * from jsonb_array_elements(coalesce(v_rule->'brackets', '[]'::jsonb))
    loop
      v_from := coalesce((v_bracket->>'from_day')::int, 0);
      if v_days >= v_from then
        v_best_rate := coalesce((v_bracket->>'rate')::numeric, 0);
      end if;
    end loop;
    if v_daily <= 0 then
      select coalesce(total_amount_ht, 0) into v_daily
      from public.ref_contracts where id = p_contract_id;
    end if;
    v_amount := round(v_daily * v_best_rate * v_days, 2);
  else
    v_amount := 0;
  end if;

  return jsonb_build_object(
    'rule_code', v_rule->>'code',
    'rule_label', v_rule->>'label',
    'mode', v_mode,
    'basis_days', v_days,
    'suggested_amount_ht', v_amount,
    'rate', v_rate,
    'fixed_amount', v_fixed,
    'daily_rate_ht', v_daily
  );
end;
$$;

grant execute on function public.ref_contract_suggest_penalty(uuid, text, numeric, text)
  to authenticated;

-- Apply penalty with optional basis + employee + mode snapshot
create or replace function public.ref_contract_apply_penalty(
  p_contract_id uuid,
  p_rule_code text,
  p_rule_label text,
  p_amount_ht numeric,
  p_event_date date default current_date,
  p_note text default null,
  p_basis_days numeric default null,
  p_rule_mode text default null,
  p_hr_employee_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site uuid;
  v_status public.ref_contract_status;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount_ht is null or p_amount_ht < 0 then raise exception 'Amount invalid'; end if;
  if p_rule_code is null or length(trim(p_rule_code)) < 1 then
    raise exception 'Rule code required';
  end if;

  if p_hr_employee_id is not null
     and not exists (select 1 from public.hr_employees e where e.id = p_hr_employee_id) then
    raise exception 'HR employee not found';
  end if;

  select site_id, status into v_site, v_status
  from public.ref_contracts where id = p_contract_id for update;
  if v_site is null then raise exception 'Contract not found'; end if;
  if not public.erp_has_perm('client_contracts', 'update'::public.rbac_action, v_site) then
    raise exception 'Permission denied';
  end if;
  if v_status not in ('VALIDE', 'EN_COURS') then
    raise exception 'Penalties only on VALIDE|EN_COURS';
  end if;

  insert into public.contract_penalty_events (
    contract_id, rule_code, rule_label, event_date, amount_ht, note, created_by,
    basis_days, rule_mode, hr_employee_id
  ) values (
    p_contract_id, trim(p_rule_code), trim(p_rule_label),
    coalesce(p_event_date, current_date), round(p_amount_ht, 2),
    nullif(trim(p_note), ''), auth.uid(),
    p_basis_days, nullif(trim(p_rule_mode), ''), p_hr_employee_id
  ) returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'amount_ht', round(p_amount_ht, 2),
    'basis_days', p_basis_days,
    'rule_mode', p_rule_mode
  );
end;
$$;

grant execute on function public.ref_contract_apply_penalty(
  uuid, text, text, numeric, date, text, numeric, text, uuid
) to authenticated;

-- Extend consumption post with optional HR employee (LABOR context)
create or replace function public.ref_contract_post_consumption(
  p_contract_id uuid,
  p_contract_item_id uuid,
  p_direction public.contract_consumption_direction,
  p_quantity numeric,
  p_movement_date date default current_date,
  p_note text default null,
  p_hr_employee_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site uuid;
  v_status public.ref_contract_status;
  v_item_contract uuid;
  v_item_type public.contract_item_type;
  v_contractual numeric(18,4);
  v_consumed numeric(18,4);
  v_remaining numeric(18,4);
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be > 0'; end if;

  if p_hr_employee_id is not null
     and not exists (select 1 from public.hr_employees e where e.id = p_hr_employee_id) then
    raise exception 'HR employee not found';
  end if;

  select c.site_id, c.status into v_site, v_status
  from public.ref_contracts c where c.id = p_contract_id for update;
  if v_site is null then raise exception 'Contract not found'; end if;

  if not public.erp_has_perm('client_contracts', 'update'::public.rbac_action, v_site) then
    raise exception 'Permission denied';
  end if;

  if v_status not in ('VALIDE', 'EN_COURS') then
    raise exception 'Consumption allowed only when status is VALIDE or EN_COURS (current: %)', v_status;
  end if;

  select ci.contract_id, ci.quantity, ci.item_type
  into v_item_contract, v_contractual, v_item_type
  from public.contract_items ci
  where ci.id = p_contract_item_id
  for update;

  if v_item_contract is null then raise exception 'Contract item not found'; end if;
  if v_item_contract <> p_contract_id then raise exception 'Item does not belong to contract'; end if;

  if p_hr_employee_id is not null and v_item_type <> 'LABOR' then
    raise exception 'HR employee only allowed on LABOR lines';
  end if;

  v_consumed := public.ref_contract_item_consumed_qty(p_contract_item_id);
  v_remaining := v_contractual - v_consumed;

  if p_direction = 'CONSUME' then
    if p_quantity > v_remaining then
      raise exception 'Over-consumption blocked: qty % > remaining % (contractual %, consumed %)',
        p_quantity, v_remaining, v_contractual, v_consumed;
    end if;
  elsif p_direction = 'REVERSE' then
    if p_quantity > v_consumed then
      raise exception 'Reverse blocked: qty % > consumed %', p_quantity, v_consumed;
    end if;
  end if;

  insert into public.contract_consumption_movements (
    contract_id, contract_item_id, direction, quantity, movement_date, note, created_by, hr_employee_id
  ) values (
    p_contract_id, p_contract_item_id, p_direction, round(p_quantity, 4),
    coalesce(p_movement_date, current_date), nullif(trim(p_note), ''), auth.uid(),
    p_hr_employee_id
  ) returning id into v_id;

  v_consumed := public.ref_contract_item_consumed_qty(p_contract_item_id);
  v_remaining := v_contractual - v_consumed;

  return jsonb_build_object(
    'id', v_id,
    'contract_id', p_contract_id,
    'contract_item_id', p_contract_item_id,
    'direction', p_direction,
    'quantity', round(p_quantity, 4),
    'contractual_qty', v_contractual,
    'consumed_qty', v_consumed,
    'remaining_qty', v_remaining,
    'pct_consumed', case when v_contractual = 0 then null
      else round((v_consumed / v_contractual) * 100, 2) end,
    'hr_employee_id', p_hr_employee_id
  );
end;
$$;

grant execute on function public.ref_contract_post_consumption(
  uuid, uuid, public.contract_consumption_direction, numeric, date, text, uuid
) to authenticated;

commit;
