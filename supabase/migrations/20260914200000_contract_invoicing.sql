-- =============================================================================
-- Phase 2 — Contract invoicing from consumption (facture / fort)
-- Draft → ISSUED; lines snapshot qty × unit_price_ht from contract_items.
-- Does not touch payment/solde (Phase 3) or penalties (Phase 4).
-- =============================================================================

begin;

do $$ begin
  create type public.contract_invoice_status as enum (
    'BROUILLON', 'EMISE', 'ANNULEE'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.contract_invoices (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.ref_contracts(id) on delete restrict,
  invoice_number text not null,
  invoice_date date not null default current_date,
  status public.contract_invoice_status not null default 'BROUILLON',
  total_ht numeric(18,2) not null default 0 check (total_ht >= 0),
  note text,
  issued_at timestamptz,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, invoice_number),
  check (char_length(coalesce(note, '')) <= 500)
);

create table if not exists public.contract_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.contract_invoices(id) on delete cascade,
  contract_item_id uuid not null references public.contract_items(id) on delete restrict,
  item_code text not null,
  designation text not null,
  unit text not null,
  quantity numeric(18,4) not null check (quantity > 0),
  unit_price_ht numeric(18,4) not null check (unit_price_ht >= 0),
  total_price_ht numeric(18,2) not null check (total_price_ht >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists contract_invoices_contract_idx
  on public.contract_invoices (contract_id, invoice_date desc);
create index if not exists contract_invoice_lines_invoice_idx
  on public.contract_invoice_lines (invoice_id);

drop trigger if exists trg_contract_invoices_updated on public.contract_invoices;
create trigger trg_contract_invoices_updated
  before update on public.contract_invoices
  for each row execute function public.erp_set_updated_at();

drop trigger if exists trg_contract_invoices_audit on public.contract_invoices;
create trigger trg_contract_invoices_audit
  after insert or update or delete on public.contract_invoices
  for each row execute function public.sys_audit_row_change();

drop trigger if exists trg_contract_invoice_lines_audit on public.contract_invoice_lines;
create trigger trg_contract_invoice_lines_audit
  after insert or update or delete on public.contract_invoice_lines
  for each row execute function public.sys_audit_row_change();

alter table public.contract_invoices enable row level security;
alter table public.contract_invoice_lines enable row level security;

grant select, insert, update, delete on public.contract_invoices to authenticated;
grant select, insert, update, delete on public.contract_invoice_lines to authenticated;

drop policy if exists contract_invoices_read on public.contract_invoices;
create policy contract_invoices_read on public.contract_invoices
  for select to authenticated
  using (
    exists (
      select 1 from public.ref_contracts c
      where c.id = contract_id
        and public.erp_can_see_site(c.site_id)
        and public.erp_has_perm('client_contracts', 'read'::public.rbac_action, c.site_id)
    )
  );

drop policy if exists contract_invoices_write on public.contract_invoices;
create policy contract_invoices_write on public.contract_invoices
  for all to authenticated
  using (
    exists (
      select 1 from public.ref_contracts c
      where c.id = contract_id
        and public.erp_has_perm('client_contracts', 'update'::public.rbac_action, c.site_id)
    )
  )
  with check (
    exists (
      select 1 from public.ref_contracts c
      where c.id = contract_id
        and public.erp_has_perm('client_contracts', 'update'::public.rbac_action, c.site_id)
    )
  );

drop policy if exists contract_invoice_lines_read on public.contract_invoice_lines;
create policy contract_invoice_lines_read on public.contract_invoice_lines
  for select to authenticated
  using (
    exists (
      select 1
      from public.contract_invoices inv
      join public.ref_contracts c on c.id = inv.contract_id
      where inv.id = invoice_id
        and public.erp_can_see_site(c.site_id)
        and public.erp_has_perm('client_contracts', 'read'::public.rbac_action, c.site_id)
    )
  );

drop policy if exists contract_invoice_lines_write on public.contract_invoice_lines;
create policy contract_invoice_lines_write on public.contract_invoice_lines
  for all to authenticated
  using (
    exists (
      select 1
      from public.contract_invoices inv
      join public.ref_contracts c on c.id = inv.contract_id
      where inv.id = invoice_id
        and public.erp_has_perm('client_contracts', 'update'::public.rbac_action, c.site_id)
    )
  )
  with check (
    exists (
      select 1
      from public.contract_invoices inv
      join public.ref_contracts c on c.id = inv.contract_id
      where inv.id = invoice_id
        and public.erp_has_perm('client_contracts', 'update'::public.rbac_action, c.site_id)
    )
  );

-- Qty already invoiced (EMISE only) for an item
create or replace function public.ref_contract_item_invoiced_qty(p_item_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(l.quantity), 0)::numeric(18,4)
  from public.contract_invoice_lines l
  join public.contract_invoices inv on inv.id = l.invoice_id
  where l.contract_item_id = p_item_id
    and inv.status = 'EMISE';
$$;

grant execute on function public.ref_contract_item_invoiced_qty(uuid) to authenticated;

-- Create draft invoice from selected item quantities (must be ≤ consumed − already invoiced)
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
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_invoice_number is null or length(trim(p_invoice_number)) < 2 then
    raise exception 'Invoice number required';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one invoice line required';
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

  if v_status not in ('VALIDE', 'EN_COURS') then
    raise exception 'Invoicing allowed only when status is VALIDE or EN_COURS (current: %)', v_status;
  end if;

  insert into public.contract_invoices (
    contract_id, invoice_number, invoice_date, status, note, created_by
  ) values (
    p_contract_id,
    trim(p_invoice_number),
    coalesce(p_invoice_date, current_date),
    'BROUILLON',
    nullif(trim(p_note), ''),
    auth.uid()
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

  update public.contract_invoices
  set total_ht = v_total
  where id = v_inv_id;

  return jsonb_build_object(
    'id', v_inv_id,
    'invoice_number', trim(p_invoice_number),
    'status', 'BROUILLON',
    'total_ht', v_total,
    'lines', v_idx
  );
end;
$$;

grant execute on function public.ref_contract_create_invoice_draft(uuid, text, date, jsonb, text)
  to authenticated;

create or replace function public.ref_contract_issue_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.contract_invoices%rowtype;
  v_site uuid;
  v_line record;
  v_consumed numeric(18,4);
  v_invoiced numeric(18,4);
  v_billable numeric(18,4);
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

  if v_inv.status <> 'BROUILLON' then
    raise exception 'Only BROUILLON invoices can be issued (current: %)', v_inv.status;
  end if;

  -- Re-check billable at issue time (consumption may have been reversed)
  for v_line in
    select * from public.contract_invoice_lines where invoice_id = p_invoice_id
  loop
    v_consumed := public.ref_contract_item_consumed_qty(v_line.contract_item_id);
    -- exclude this draft's own lines from "already invoiced" — only EMISE count
    v_invoiced := public.ref_contract_item_invoiced_qty(v_line.contract_item_id);
    v_billable := v_consumed - v_invoiced;
    if v_line.quantity > v_billable then
      raise exception 'Cannot issue: line % qty % > billable %',
        v_line.item_code, v_line.quantity, v_billable;
    end if;
  end loop;

  update public.contract_invoices
  set status = 'EMISE', issued_at = now()
  where id = p_invoice_id;

  return jsonb_build_object(
    'id', p_invoice_id,
    'status', 'EMISE',
    'total_ht', v_inv.total_ht,
    'issued_at', now()
  );
end;
$$;

grant execute on function public.ref_contract_issue_invoice(uuid) to authenticated;

create or replace function public.ref_contract_cancel_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.contract_invoices%rowtype;
  v_site uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_inv from public.contract_invoices where id = p_invoice_id for update;
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

  update public.contract_invoices
  set status = 'ANNULEE'
  where id = p_invoice_id;

  return jsonb_build_object('id', p_invoice_id, 'status', 'ANNULEE');
end;
$$;

grant execute on function public.ref_contract_cancel_invoice(uuid) to authenticated;

comment on table public.contract_invoices is
  'Contract invoices/forts; EMISE qty counts toward billed balance (Phase 3 payments separate).';

commit;
