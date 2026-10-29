-- =============================================================================
-- Caisse ledger — separate from Banque & Caisse (fin_* / /finance).
-- One Postgres book. No monthly sheets. No fin_* foreign keys.
--
-- Buyer balance through date D (cutoff = latest box opening_date <= D):
--   buyer opening on that cutoff
--   + ADVANCE after the cutoff through D
--   − PURCHASE after the cutoff through D
--   (voided movements are ignored)
--
-- Cash balance through D:
--   box opening on that cutoff (buyer_id is null)
--   + FUNDING after the cutoff through D
--   − ADVANCE after the cutoff through D
--   PURCHASE does not move cash: the money left the box when the advance was given.
--
-- At a cutoff, sum of buyer openings = the box opening.
-- The two running balances are not meant to stay equal after that
-- (an advance raises the buyer and lowers the cash).
--
-- The cutoff is end of day. A movement on the cutoff date is already inside
-- the opening and is rejected, so it cannot be counted twice.
-- A later cutoff replaces the base: movements on or before it drop out of
-- the formulas. Closures store a snapshot only; they are not added back in.
--
-- Correction of a movement is a void (voided_at / voided_by), never an amount edit.
-- Purchase lines, when present, must sum to the movement amount and are never
-- added on top of it.
--
-- TODO(caisse-rls): policies call erp_has_perm('caisse', ...). No sys_screens
-- row is seeded here, so only SUPER_ADMIN passes until a later migration
-- inserts screen code 'caisse' and sys_permissions. Do not point that screen
-- at fin_* or at the finance permission.
-- TODO(caisse-audit): module trail is caisse_audit_logs. sys_audit_row_change
-- is intentionally not attached, so the same event is not written twice.
-- =============================================================================

create table public.caisse_boxes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(btrim(code)) and char_length(code) between 1 and 40),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  currency_code text not null default 'DZD' check (currency_code = upper(btrim(currency_code)) and char_length(currency_code) = 3),
  active boolean not null default true,
  created_by uuid not null default auth.uid() references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.caisse_buyers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(btrim(code)) and char_length(code) between 1 and 40),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 200),
  active boolean not null default true,
  created_by uuid not null default auth.uid() references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.caisse_buyers is
  'Purchasing agent (مشتري). Not an hr_employees row and not a fin_* beneficiary.';

create table public.caisse_openings (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.caisse_boxes(id) on delete restrict,
  buyer_id uuid references public.caisse_buyers(id) on delete restrict,
  opening_date date not null,
  amount numeric(18,2) not null check (amount >= 0),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid not null default auth.uid() references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.caisse_openings is
  'Cutoff snapshot. buyer_id null = box opening. buyer_id set = that buyer. Sum of buyer rows must equal the box row on the same box and date.';

create unique index caisse_openings_box_date_uq
  on public.caisse_openings (box_id, opening_date)
  where buyer_id is null;

create unique index caisse_openings_buyer_date_uq
  on public.caisse_openings (box_id, buyer_id, opening_date)
  where buyer_id is not null;

create index caisse_openings_box_date_idx
  on public.caisse_openings (box_id, opening_date);

create table public.caisse_movements (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.caisse_boxes(id) on delete restrict,
  buyer_id uuid references public.caisse_buyers(id) on delete restrict,
  movement_date date not null,
  kind text not null check (kind in ('ADVANCE', 'PURCHASE', 'FUNDING')),
  amount numeric(18,2) not null check (amount > 0),
  label text not null check (char_length(btrim(label)) between 1 and 500),
  reference text check (reference is null or char_length(reference) <= 160),
  affectation text check (affectation is null or char_length(btrim(affectation)) between 1 and 160),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid not null default auth.uid() references public.sys_users(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.sys_users(id),
  check (
    (kind = 'FUNDING' and buyer_id is null)
    or (kind in ('ADVANCE', 'PURCHASE') and buyer_id is not null)
  ),
  check (
    (voided_at is null and voided_by is null)
    or (voided_at is not null and voided_by is not null)
  )
);

comment on table public.caisse_movements is
  'ADVANCE: buyer +, cash −. PURCHASE: buyer −, cash unchanged. FUNDING: cash +, no buyer. Amount is immutable; void the row to correct it.';

comment on column public.caisse_movements.kind is
  'ADVANCE = سلف / AVANCE / RECEPTION. PURCHASE = شراء / ACHAT. FUNDING = تغذية / ALIMENTATION / CAISSE CENTRALE.';

create index caisse_movements_box_date_idx
  on public.caisse_movements (box_id, movement_date);

create index caisse_movements_buyer_date_idx
  on public.caisse_movements (buyer_id, movement_date)
  where buyer_id is not null;

create index caisse_movements_kind_idx
  on public.caisse_movements (kind);

create table public.caisse_movement_lines (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.caisse_movements(id) on delete restrict,
  designation text not null check (char_length(btrim(designation)) between 1 and 500),
  quantity numeric(18,4) not null check (quantity > 0),
  unit_price numeric(18,4) not null check (unit_price >= 0),
  photo_url text check (photo_url is null or char_length(photo_url) <= 1000),
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid() references public.sys_users(id),
  created_at timestamptz not null default now()
);

comment on table public.caisse_movement_lines is
  'Optional PURCHASE detail (qty, price, designation, photo). Not a second ledger: if lines exist, round(sum(qty * price), 2) must equal the movement amount, and balances read the movement amount only.';

comment on column public.caisse_movement_lines.photo_url is
  'TODO(caisse-photo): URL only. No storage bucket in this migration.';

create index caisse_movement_lines_movement_idx
  on public.caisse_movement_lines (movement_id, sort_order);

create table public.caisse_closures (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.caisse_boxes(id) on delete restrict,
  closure_date date not null,
  cash_balance numeric(18,2) not null,
  note text check (note is null or char_length(note) <= 500),
  closed_by uuid not null default auth.uid() references public.sys_users(id),
  closed_at timestamptz not null default now(),
  unique (box_id, closure_date)
);

comment on table public.caisse_closures is
  'Daily snapshot of caisse_cash_balance. Not an input to the next day and not a SOLDE column.';

create index caisse_closures_box_date_idx
  on public.caisse_closures (box_id, closure_date desc);

create table public.caisse_closure_buyers (
  id uuid primary key default gen_random_uuid(),
  closure_id uuid not null references public.caisse_closures(id) on delete restrict,
  buyer_id uuid not null references public.caisse_buyers(id) on delete restrict,
  buyer_balance numeric(18,2) not null,
  unique (closure_id, buyer_id)
);

comment on table public.caisse_closure_buyers is
  'Daily snapshot of caisse_buyer_balance for each buyer whose balance is not zero.';

create table public.caisse_audit_logs (
  id uuid primary key default gen_random_uuid(),
  box_id uuid references public.caisse_boxes(id) on delete restrict,
  actor_id uuid references public.sys_users(id),
  action text not null check (action in ('INSERT', 'VOID', 'UPDATE', 'DELETE', 'CLOSE')),
  entity text not null check (entity in ('box', 'buyer', 'opening', 'movement', 'movement_line', 'closure', 'closure_buyer')),
  entity_id uuid not null,
  at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

comment on table public.caisse_audit_logs is
  'Append-only module trail. Written by trigger. box_id is null for buyer master-data events.';

create index caisse_audit_logs_box_at_idx
  on public.caisse_audit_logs (box_id, at desc);

create index caisse_audit_logs_entity_idx
  on public.caisse_audit_logs (entity, entity_id);

-- ---------------------------------------------------------------------------
-- Balances. Period reports group caisse_movements by movement_date themselves.
-- ---------------------------------------------------------------------------
create or replace function public.caisse_cash_balance(p_box uuid, p_until date)
returns numeric(18,2)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cutoff as (
    select max(o.opening_date) as opening_date
    from public.caisse_openings o
    where o.box_id = p_box
      and o.buyer_id is null
      and o.opening_date <= p_until
  )
  select (
    coalesce((
      select o.amount
      from public.caisse_openings o
      cross join cutoff c
      where o.box_id = p_box
        and o.buyer_id is null
        and o.opening_date = c.opening_date
    ), 0)
    + coalesce((
      select
        coalesce(sum(m.amount) filter (where m.kind = 'FUNDING'), 0)
        - coalesce(sum(m.amount) filter (where m.kind = 'ADVANCE'), 0)
      from public.caisse_movements m
      cross join cutoff c
      where m.box_id = p_box
        and m.voided_at is null
        and c.opening_date is not null
        and m.movement_date > c.opening_date
        and m.movement_date <= p_until
    ), 0)
  )::numeric(18,2);
$$;

create or replace function public.caisse_buyer_balance(p_box uuid, p_buyer uuid, p_until date)
returns numeric(18,2)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cutoff as (
    select max(o.opening_date) as opening_date
    from public.caisse_openings o
    where o.box_id = p_box
      and o.buyer_id is null
      and o.opening_date <= p_until
  )
  select (
    coalesce((
      select o.amount
      from public.caisse_openings o
      cross join cutoff c
      where o.box_id = p_box
        and o.buyer_id = p_buyer
        and o.opening_date = c.opening_date
    ), 0)
    + coalesce((
      select
        coalesce(sum(m.amount) filter (where m.kind = 'ADVANCE'), 0)
        - coalesce(sum(m.amount) filter (where m.kind = 'PURCHASE'), 0)
      from public.caisse_movements m
      cross join cutoff c
      where m.box_id = p_box
        and m.buyer_id = p_buyer
        and m.voided_at is null
        and c.opening_date is not null
        and m.movement_date > c.opening_date
        and m.movement_date <= p_until
    ), 0)
  )::numeric(18,2);
$$;

comment on function public.caisse_cash_balance(uuid, date) is
  'Box cash through p_until. PURCHASE is excluded on purpose.';

comment on function public.caisse_buyer_balance(uuid, uuid, date) is
  'Buyer balance through p_until: opening + ADVANCE − PURCHASE.';

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
create or replace function public.caisse_assert_opening_balanced(p_box uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_box_rows integer;
  v_box_amount numeric(18,2);
  v_buyers numeric(18,2);
begin
  select count(*), coalesce(sum(amount), 0)
    into v_box_rows, v_box_amount
  from public.caisse_openings
  where box_id = p_box
    and opening_date = p_date
    and buyer_id is null;

  select coalesce(sum(amount), 0)
    into v_buyers
  from public.caisse_openings
  where box_id = p_box
    and opening_date = p_date
    and buyer_id is not null;

  if v_box_rows = 0 and v_buyers = 0 then
    return;
  end if;
  if v_box_rows <> 1 then
    raise exception 'Caisse cutoff % for box % needs exactly one box opening', p_date, p_box;
  end if;
  if v_buyers is distinct from v_box_amount then
    raise exception 'Buyer openings (%) must equal the box opening (%) on % for box %',
      v_buyers, v_box_amount, p_date, p_box;
  end if;
end;
$$;

create or replace function public.caisse_guard_opening_balance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.caisse_assert_opening_balanced(old.box_id, old.opening_date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.caisse_assert_opening_balanced(new.box_id, new.opening_date);
  end if;
  return null;
end;
$$;

create or replace function public.caisse_guard_opening_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('UPDATE', 'DELETE')
     and exists (
       select 1
       from public.caisse_closures c
       where c.box_id = old.box_id
         and c.closure_date >= old.opening_date
     ) then
    raise exception 'Caisse cutoff % is already covered by a daily close for box %', old.opening_date, old.box_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and exists (
       select 1
       from public.caisse_closures c
       where c.box_id = new.box_id
         and c.closure_date >= new.opening_date
     ) then
    raise exception 'Caisse cutoff % is already covered by a daily close for box %', new.opening_date, new.box_id;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.caisse_guard_movement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_box uuid;
  v_date date;
begin
  if tg_op = 'DELETE' then
    raise exception 'Caisse movement cannot be deleted; void it';
  end if;

  if tg_op = 'UPDATE' then
    if old.voided_at is not null then
      raise exception 'Voided caisse movement cannot be changed';
    end if;
    if new.box_id is distinct from old.box_id
      or new.buyer_id is distinct from old.buyer_id
      or new.kind is distinct from old.kind
      or new.amount is distinct from old.amount
      or new.movement_date is distinct from old.movement_date
      or new.label is distinct from old.label
      or new.reference is distinct from old.reference
      or new.affectation is distinct from old.affectation
      or new.notes is distinct from old.notes
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
      or new.id is distinct from old.id
    then
      raise exception 'Caisse movement is immutable; void it instead of editing the amount';
    end if;
    if new.voided_at is null then
      raise exception 'Caisse movement is immutable; void it instead of editing the amount';
    end if;
  end if;

  v_box := new.box_id;
  v_date := new.movement_date;

  if not exists (
    select 1
    from public.caisse_openings o
    where o.box_id = v_box
      and o.buyer_id is null
      and o.opening_date < v_date
  ) then
    raise exception 'Caisse movement % must be after a box opening cutoff', v_date;
  end if;

  if exists (
    select 1
    from public.caisse_closures c
    where c.box_id = v_box
      and c.closure_date >= v_date
  ) then
    raise exception 'Caisse day % is closed for box %', v_date, v_box;
  end if;

  return new;
end;
$$;

create or replace function public.caisse_guard_line_shape()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_void timestamptz;
begin
  if tg_op = 'DELETE' then
    raise exception 'Caisse purchase lines cannot be deleted; void the movement';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Caisse purchase lines are immutable; void the movement';
  end if;
  select kind, voided_at into v_kind, v_void
  from public.caisse_movements
  where id = new.movement_id;
  if v_kind is distinct from 'PURCHASE' then
    raise exception 'Caisse lines belong to a PURCHASE movement only';
  end if;
  if v_void is not null then
    raise exception 'Cannot add lines to a voided purchase';
  end if;
  return new;
end;
$$;

create or replace function public.caisse_guard_line_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_movement uuid;
  v_amount numeric(18,2);
  v_lines numeric(18,2);
  v_count integer;
begin
  v_movement := coalesce(new.movement_id, old.movement_id);
  select amount into v_amount
  from public.caisse_movements
  where id = v_movement;
  select count(*), coalesce(round(sum(quantity * unit_price), 2), 0)
    into v_count, v_lines
  from public.caisse_movement_lines
  where movement_id = v_movement;
  if v_count > 0 and v_lines is distinct from v_amount then
    raise exception 'Purchase lines (%) must equal the movement amount (%), not add to it', v_lines, v_amount;
  end if;
  return null;
end;
$$;

create or replace function public.caisse_assert_closure(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_box uuid;
  v_date date;
  v_cash numeric(18,2);
  v_buyer record;
  v_expected numeric(18,2);
  v_snap numeric(18,2);
begin
  select box_id, closure_date, cash_balance
    into v_box, v_date, v_cash
  from public.caisse_closures
  where id = p_id;
  if not found then
    return;
  end if;

  if v_cash is distinct from public.caisse_cash_balance(v_box, v_date) then
    raise exception 'Daily close cash snapshot (%) must equal caisse_cash_balance (%)',
      v_cash, public.caisse_cash_balance(v_box, v_date);
  end if;

  for v_buyer in
    select b.id as buyer_id
    from public.caisse_buyers b
    where public.caisse_buyer_balance(v_box, b.id, v_date) <> 0
       or exists (
         select 1
         from public.caisse_closure_buyers cb
         where cb.closure_id = p_id
           and cb.buyer_id = b.id
       )
  loop
    v_expected := public.caisse_buyer_balance(v_box, v_buyer.buyer_id, v_date);
    select cb.buyer_balance into v_snap
    from public.caisse_closure_buyers cb
    where cb.closure_id = p_id
      and cb.buyer_id = v_buyer.buyer_id;
    if v_snap is null or v_snap is distinct from v_expected then
      raise exception 'Daily close is missing the buyer snapshot % (expected %)', v_buyer.buyer_id, v_expected;
    end if;
  end loop;
end;
$$;

create or replace function public.caisse_guard_closure_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if tg_table_name = 'caisse_closures' then
    v_id := coalesce(new.id, old.id);
  else
    v_id := coalesce(new.closure_id, old.closure_id);
  end if;
  perform public.caisse_assert_closure(v_id);
  return null;
end;
$$;

create or replace function public.caisse_write_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
  v_entity text;
  v_box uuid;
  v_id uuid;
  v_payload jsonb;
begin
  v_entity := case tg_table_name
    when 'caisse_boxes' then 'box'
    when 'caisse_buyers' then 'buyer'
    when 'caisse_openings' then 'opening'
    when 'caisse_movements' then 'movement'
    when 'caisse_movement_lines' then 'movement_line'
    when 'caisse_closures' then 'closure'
    when 'caisse_closure_buyers' then 'closure_buyer'
  end;

  if tg_op = 'INSERT' then
    v_action := case when tg_table_name = 'caisse_closures' then 'CLOSE' else 'INSERT' end;
    v_id := new.id;
    v_payload := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_action := case
      when tg_table_name = 'caisse_movements' and new.voided_at is not null then 'VOID'
      else 'UPDATE'
    end;
    v_id := new.id;
    v_payload := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  else
    v_action := 'DELETE';
    v_id := old.id;
    v_payload := to_jsonb(old);
  end if;

  v_box := case tg_table_name
    when 'caisse_boxes' then coalesce(new.id, old.id)
    when 'caisse_openings' then coalesce(new.box_id, old.box_id)
    when 'caisse_movements' then coalesce(new.box_id, old.box_id)
    when 'caisse_closures' then coalesce(new.box_id, old.box_id)
    when 'caisse_movement_lines' then (
      select m.box_id from public.caisse_movements m
      where m.id = coalesce(new.movement_id, old.movement_id)
    )
    when 'caisse_closure_buyers' then (
      select c.box_id from public.caisse_closures c
      where c.id = coalesce(new.closure_id, old.closure_id)
    )
    else null
  end;

  insert into public.caisse_audit_logs (box_id, actor_id, action, entity, entity_id, payload)
  values (v_box, auth.uid(), v_action, v_entity, v_id, v_payload);
  return null;
end;
$$;

create or replace function public.caisse_guard_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'caisse_audit_logs is append-only';
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger caisse_boxes_set_updated_at
  before update on public.caisse_boxes
  for each row execute function public.erp_set_updated_at();

create trigger caisse_buyers_set_updated_at
  before update on public.caisse_buyers
  for each row execute function public.erp_set_updated_at();

create trigger caisse_openings_set_updated_at
  before update on public.caisse_openings
  for each row execute function public.erp_set_updated_at();

create trigger caisse_openings_history
  before insert or update or delete on public.caisse_openings
  for each row execute function public.caisse_guard_opening_history();

create constraint trigger caisse_openings_balanced
  after insert or update or delete on public.caisse_openings
  deferrable initially deferred
  for each row execute function public.caisse_guard_opening_balance();

create trigger caisse_movements_guard
  before insert or update or delete on public.caisse_movements
  for each row execute function public.caisse_guard_movement();

create trigger caisse_lines_shape
  before insert or update or delete on public.caisse_movement_lines
  for each row execute function public.caisse_guard_line_shape();

create constraint trigger caisse_lines_total
  after insert or update or delete on public.caisse_movement_lines
  deferrable initially deferred
  for each row execute function public.caisse_guard_line_total();

create constraint trigger caisse_closures_snapshot
  after insert or update or delete on public.caisse_closures
  deferrable initially deferred
  for each row execute function public.caisse_guard_closure_snapshot();

create constraint trigger caisse_closure_buyers_snapshot
  after insert or update or delete on public.caisse_closure_buyers
  deferrable initially deferred
  for each row execute function public.caisse_guard_closure_snapshot();

create trigger caisse_boxes_audit
  after insert or update or delete on public.caisse_boxes
  for each row execute function public.caisse_write_audit();
create trigger caisse_buyers_audit
  after insert or update or delete on public.caisse_buyers
  for each row execute function public.caisse_write_audit();
create trigger caisse_openings_audit
  after insert or update or delete on public.caisse_openings
  for each row execute function public.caisse_write_audit();
create trigger caisse_movements_audit
  after insert or update or delete on public.caisse_movements
  for each row execute function public.caisse_write_audit();
create trigger caisse_lines_audit
  after insert or update or delete on public.caisse_movement_lines
  for each row execute function public.caisse_write_audit();
create trigger caisse_closures_audit
  after insert or update or delete on public.caisse_closures
  for each row execute function public.caisse_write_audit();
create trigger caisse_closure_buyers_audit
  after insert or update or delete on public.caisse_closure_buyers
  for each row execute function public.caisse_write_audit();

create trigger caisse_audit_logs_append_only
  before update or delete on public.caisse_audit_logs
  for each row execute function public.caisse_guard_audit();

-- ---------------------------------------------------------------------------
-- RLS. Screen 'caisse' is not seeded (see TODO at top). SUPER_ADMIN still passes
-- erp_has_perm. No policy uses the finance screen.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'caisse_boxes',
    'caisse_buyers',
    'caisse_openings',
    'caisse_movements',
    'caisse_movement_lines',
    'caisse_closures',
    'caisse_closure_buyers',
    'caisse_audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

grant select, insert, update, delete on public.caisse_boxes to authenticated;
grant select, insert, update, delete on public.caisse_buyers to authenticated;
grant select, insert, update, delete on public.caisse_openings to authenticated;
grant select, insert, update on public.caisse_movements to authenticated;
grant select, insert on public.caisse_movement_lines to authenticated;
grant select, insert, update, delete on public.caisse_closures to authenticated;
grant select, insert, update, delete on public.caisse_closure_buyers to authenticated;
grant select on public.caisse_audit_logs to authenticated;

create policy caisse_boxes_read on public.caisse_boxes
  for select to authenticated
  using (public.erp_has_perm('caisse', 'read', null));
create policy caisse_boxes_write on public.caisse_boxes
  for all to authenticated
  using (public.erp_has_perm('caisse', 'update', null))
  with check (public.erp_has_perm('caisse', 'update', null));

create policy caisse_buyers_read on public.caisse_buyers
  for select to authenticated
  using (public.erp_has_perm('caisse', 'read', null));
create policy caisse_buyers_write on public.caisse_buyers
  for all to authenticated
  using (public.erp_has_perm('caisse', 'update', null))
  with check (public.erp_has_perm('caisse', 'update', null));

create policy caisse_openings_read on public.caisse_openings
  for select to authenticated
  using (public.erp_has_perm('caisse', 'read', null));
create policy caisse_openings_write on public.caisse_openings
  for all to authenticated
  using (public.erp_has_perm('caisse', 'update', null))
  with check (public.erp_has_perm('caisse', 'update', null));

create policy caisse_movements_read on public.caisse_movements
  for select to authenticated
  using (public.erp_has_perm('caisse', 'read', null));
create policy caisse_movements_insert on public.caisse_movements
  for insert to authenticated
  with check (public.erp_has_perm('caisse', 'create', null));
create policy caisse_movements_void on public.caisse_movements
  for update to authenticated
  using (public.erp_has_perm('caisse', 'update', null))
  with check (public.erp_has_perm('caisse', 'update', null));

create policy caisse_lines_read on public.caisse_movement_lines
  for select to authenticated
  using (public.erp_has_perm('caisse', 'read', null));
create policy caisse_lines_insert on public.caisse_movement_lines
  for insert to authenticated
  with check (public.erp_has_perm('caisse', 'create', null));

create policy caisse_closures_read on public.caisse_closures
  for select to authenticated
  using (public.erp_has_perm('caisse', 'read', null));
create policy caisse_closures_write on public.caisse_closures
  for all to authenticated
  using (public.erp_has_perm('caisse', 'update', null))
  with check (public.erp_has_perm('caisse', 'update', null));

create policy caisse_closure_buyers_read on public.caisse_closure_buyers
  for select to authenticated
  using (public.erp_has_perm('caisse', 'read', null));
create policy caisse_closure_buyers_write on public.caisse_closure_buyers
  for all to authenticated
  using (public.erp_has_perm('caisse', 'update', null))
  with check (public.erp_has_perm('caisse', 'update', null));

create policy caisse_audit_read on public.caisse_audit_logs
  for select to authenticated
  using (public.erp_has_perm('caisse', 'read', null));

revoke all on function public.caisse_cash_balance(uuid, date) from public, anon;
revoke all on function public.caisse_buyer_balance(uuid, uuid, date) from public, anon;
revoke all on function public.caisse_assert_opening_balanced(uuid, date) from public, anon;
revoke all on function public.caisse_assert_closure(uuid) from public, anon;
grant execute on function public.caisse_cash_balance(uuid, date) to authenticated;
grant execute on function public.caisse_buyer_balance(uuid, uuid, date) to authenticated;

notify pgrst, 'reload schema';
