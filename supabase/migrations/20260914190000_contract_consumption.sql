-- =============================================================================
-- Phase 1 — Contract consumption ledger (A→Z hub foundation)
-- Contractual qty stays on contract_items; consumed/remaining derived from movements.
-- Rules: VALIDE|EN_COURS only; no over-consume; reverse via REVERSE (append-only).
-- Does NOT touch total_amount_ht / canva RPC.
-- =============================================================================

begin;

do $$ begin
  create type public.contract_consumption_direction as enum ('CONSUME', 'REVERSE');
exception when duplicate_object then null;
end $$;

create table if not exists public.contract_consumption_movements (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.ref_contracts(id) on delete restrict,
  contract_item_id uuid not null references public.contract_items(id) on delete restrict,
  direction public.contract_consumption_direction not null,
  quantity numeric(18,4) not null check (quantity > 0),
  movement_date date not null default current_date,
  note text,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  check (char_length(coalesce(note, '')) <= 500)
);

create index if not exists contract_consumption_contract_idx
  on public.contract_consumption_movements (contract_id, created_at desc);
create index if not exists contract_consumption_item_idx
  on public.contract_consumption_movements (contract_item_id, created_at desc);

-- Append-only: block UPDATE/DELETE on movements
create or replace function public.contract_consumption_prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'contract_consumption_movements is append-only (use REVERSE)';
end;
$$;

drop trigger if exists trg_contract_consumption_no_update on public.contract_consumption_movements;
create trigger trg_contract_consumption_no_update
  before update on public.contract_consumption_movements
  for each row execute function public.contract_consumption_prevent_mutation();

drop trigger if exists trg_contract_consumption_no_delete on public.contract_consumption_movements;
create trigger trg_contract_consumption_no_delete
  before delete on public.contract_consumption_movements
  for each row execute function public.contract_consumption_prevent_mutation();

drop trigger if exists trg_contract_consumption_audit on public.contract_consumption_movements;
create trigger trg_contract_consumption_audit
  after insert or update or delete on public.contract_consumption_movements
  for each row execute function public.sys_audit_row_change();

alter table public.contract_consumption_movements enable row level security;

grant select, insert on public.contract_consumption_movements to authenticated;

drop policy if exists contract_consumption_read on public.contract_consumption_movements;
create policy contract_consumption_read on public.contract_consumption_movements
  for select to authenticated
  using (
    exists (
      select 1 from public.ref_contracts c
      where c.id = contract_id
        and public.erp_can_see_site(c.site_id)
        and public.erp_has_perm(
          'client_contracts', 'read'::public.rbac_action, c.site_id
        )
    )
  );

drop policy if exists contract_consumption_insert on public.contract_consumption_movements;
create policy contract_consumption_insert on public.contract_consumption_movements
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ref_contracts c
      where c.id = contract_id
        and public.erp_has_perm(
          'client_contracts', 'update'::public.rbac_action, c.site_id
        )
    )
  );

-- Net consumed qty for one item
create or replace function public.ref_contract_item_consumed_qty(p_item_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(
    case
      when direction = 'CONSUME' then quantity
      when direction = 'REVERSE' then -quantity
    end
  ), 0)::numeric(18,4)
  from public.contract_consumption_movements
  where contract_item_id = p_item_id;
$$;

grant execute on function public.ref_contract_item_consumed_qty(uuid) to authenticated;

-- Atomic post: CONSUME or REVERSE with business rules
create or replace function public.ref_contract_post_consumption(
  p_contract_id uuid,
  p_contract_item_id uuid,
  p_direction public.contract_consumption_direction,
  p_quantity numeric,
  p_movement_date date default current_date,
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
  v_item_contract uuid;
  v_contractual numeric(18,4);
  v_consumed numeric(18,4);
  v_remaining numeric(18,4);
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be > 0';
  end if;

  select c.site_id, c.status into v_site, v_status
  from public.ref_contracts c
  where c.id = p_contract_id
  for update;

  if v_site is null then
    raise exception 'Contract not found';
  end if;

  if not public.erp_has_perm(
    'client_contracts', 'update'::public.rbac_action, v_site
  ) then
    raise exception 'Permission denied';
  end if;

  if v_status not in ('VALIDE', 'EN_COURS') then
    raise exception 'Consumption allowed only when status is VALIDE or EN_COURS (current: %)', v_status;
  end if;

  select ci.contract_id, ci.quantity into v_item_contract, v_contractual
  from public.contract_items ci
  where ci.id = p_contract_item_id
  for update;

  if v_item_contract is null then
    raise exception 'Contract item not found';
  end if;

  if v_item_contract <> p_contract_id then
    raise exception 'Item does not belong to contract';
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
    contract_id, contract_item_id, direction, quantity, movement_date, note, created_by
  ) values (
    p_contract_id,
    p_contract_item_id,
    p_direction,
    round(p_quantity, 4),
    coalesce(p_movement_date, current_date),
    nullif(trim(p_note), ''),
    auth.uid()
  )
  returning id into v_id;

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
    'pct_consumed', case
      when v_contractual = 0 then null
      else round((v_consumed / v_contractual) * 100, 2)
    end
  );
end;
$$;

grant execute on function public.ref_contract_post_consumption(
  uuid, uuid, public.contract_consumption_direction, numeric, date, text
) to authenticated;

comment on table public.contract_consumption_movements is
  'Append-only consumption ledger per contract item; REVERSE cancels qty without DELETE.';
comment on function public.ref_contract_post_consumption(uuid, uuid, public.contract_consumption_direction, numeric, date, text) is
  'Atomic CONSUME/REVERSE with VALIDE|EN_COURS gate and hard remaining checks.';

commit;
