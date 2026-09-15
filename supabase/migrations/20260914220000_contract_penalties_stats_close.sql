-- =============================================================================
-- Phase 4 — Applied penalties + optional personnel on consumption
-- Phase 5 — Contract stats snapshot RPC + guarded closeout
-- =============================================================================

begin;

-- Optional personnel link on consumption (HR employee, nullable)
alter table public.contract_consumption_movements
  add column if not exists hr_employee_id uuid references public.hr_employees(id) on delete set null;

create index if not exists contract_consumption_employee_idx
  on public.contract_consumption_movements (hr_employee_id)
  where hr_employee_id is not null;

-- Applied penalties ledger
create table if not exists public.contract_penalty_events (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.ref_contracts(id) on delete restrict,
  rule_code text not null,
  rule_label text not null,
  event_date date not null default current_date,
  amount_ht numeric(18,2) not null check (amount_ht >= 0),
  note text,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  check (char_length(coalesce(note, '')) <= 500)
);

create index if not exists contract_penalty_events_contract_idx
  on public.contract_penalty_events (contract_id, event_date desc);

create or replace function public.contract_penalty_events_prevent_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'contract_penalty_events is append-only';
end;
$$;

drop trigger if exists trg_contract_penalty_no_update on public.contract_penalty_events;
create trigger trg_contract_penalty_no_update
  before update on public.contract_penalty_events
  for each row execute function public.contract_penalty_events_prevent_mutation();

drop trigger if exists trg_contract_penalty_no_delete on public.contract_penalty_events;
create trigger trg_contract_penalty_no_delete
  before delete on public.contract_penalty_events
  for each row execute function public.contract_penalty_events_prevent_mutation();

drop trigger if exists trg_contract_penalty_audit on public.contract_penalty_events;
create trigger trg_contract_penalty_audit
  after insert or update or delete on public.contract_penalty_events
  for each row execute function public.sys_audit_row_change();

alter table public.contract_penalty_events enable row level security;
grant select, insert on public.contract_penalty_events to authenticated;

drop policy if exists contract_penalty_events_read on public.contract_penalty_events;
create policy contract_penalty_events_read on public.contract_penalty_events
  for select to authenticated
  using (
    exists (
      select 1 from public.ref_contracts c
      where c.id = contract_id
        and public.erp_can_see_site(c.site_id)
        and public.erp_has_perm('client_contracts', 'read'::public.rbac_action, c.site_id)
    )
  );

drop policy if exists contract_penalty_events_insert on public.contract_penalty_events;
create policy contract_penalty_events_insert on public.contract_penalty_events
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ref_contracts c
      where c.id = contract_id
        and public.erp_has_perm('client_contracts', 'update'::public.rbac_action, c.site_id)
    )
  );

create or replace function public.ref_contract_apply_penalty(
  p_contract_id uuid,
  p_rule_code text,
  p_rule_label text,
  p_amount_ht numeric,
  p_event_date date default current_date,
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
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount_ht is null or p_amount_ht < 0 then raise exception 'Amount invalid'; end if;
  if p_rule_code is null or length(trim(p_rule_code)) < 1 then raise exception 'Rule code required'; end if;

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
    contract_id, rule_code, rule_label, event_date, amount_ht, note, created_by
  ) values (
    p_contract_id, trim(p_rule_code), trim(p_rule_label),
    coalesce(p_event_date, current_date), round(p_amount_ht, 2),
    nullif(trim(p_note), ''), auth.uid()
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'amount_ht', round(p_amount_ht, 2));
end;
$$;

grant execute on function public.ref_contract_apply_penalty(uuid, text, text, numeric, date, text)
  to authenticated;

-- Phase 5 stats + closeout
create or replace function public.ref_contract_stats(p_contract_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_contractual numeric(18,4) := 0;
  v_consumed numeric(18,4) := 0;
  v_penalties numeric(18,2) := 0;
  v_bal jsonb;
  v_status public.ref_contract_status;
  v_total numeric(18,2);
begin
  select status, total_amount_ht into v_status, v_total
  from public.ref_contracts where id = p_contract_id;
  if v_status is null then raise exception 'Contract not found'; end if;

  select coalesce(sum(quantity),0) into v_contractual
  from public.contract_items where contract_id = p_contract_id;

  select coalesce(sum(
    case when direction='CONSUME' then quantity else -quantity end
  ),0) into v_consumed
  from public.contract_consumption_movements where contract_id = p_contract_id;

  select coalesce(sum(amount_ht),0) into v_penalties
  from public.contract_penalty_events where contract_id = p_contract_id;

  v_bal := public.ref_contract_balance(p_contract_id);

  return jsonb_build_object(
    'contract_id', p_contract_id,
    'status', v_status,
    'contract_total_ht', v_total,
    'contractual_qty', v_contractual,
    'consumed_qty', v_consumed,
    'pct_qty_consumed', case when v_contractual=0 then null
      else round((v_consumed/v_contractual)*100, 2) end,
    'invoiced_ht', (v_bal->>'invoiced_ht')::numeric,
    'paid_ht', (v_bal->>'paid_ht')::numeric,
    'remaining_ht', (v_bal->>'remaining_ht')::numeric,
    'is_solded', (v_bal->>'is_solded')::boolean,
    'penalties_ht', v_penalties
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
  v_stats jsonb;
  v_remaining numeric(18,2);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select site_id, status into v_site, v_status
  from public.ref_contracts where id = p_contract_id for update;
  if v_site is null then raise exception 'Contract not found'; end if;
  if not public.erp_has_perm('client_contracts', 'update'::public.rbac_action, v_site) then
    raise exception 'Permission denied';
  end if;
  if v_status = 'CLOTURE' then raise exception 'Already closed'; end if;
  if v_status = 'ANNULE' then raise exception 'Cancelled contract cannot be closed'; end if;

  v_stats := public.ref_contract_stats(p_contract_id);
  v_remaining := (v_stats->>'remaining_ht')::numeric;

  if not p_force and v_remaining > 0 then
    raise exception 'Cannot close: remaining receivable % > 0 (use force if authorized)', v_remaining;
  end if;

  update public.ref_contracts
  set status = 'CLOTURE', updated_at = now()
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

comment on table public.contract_penalty_events is
  'Append-only applied penalty events (config rules live in attributes.penalties).';

commit;
