-- =============================================================================
-- Journal banque (GESTION BANQUES) — lignes type feuille Excel, soldes courantes,
-- cautions, virements, rapprochement et import de relevé.
-- Les lignes restent mutables tant qu'elles ne sont pas rapprochées ; l'effet
-- économique est publié dans fin_transactions (source BANK_LEDGER).
-- =============================================================================

begin;

alter table public.fin_transactions drop constraint if exists fin_transactions_source_type_check;
alter table public.fin_transactions add constraint fin_transactions_source_type_check check (
  source_type in (
    'MANUAL', 'TRANSFER', 'CUSTOMER_PAYMENT', 'SUPPLIER_PAYMENT',
    'CASH_ADVANCE', 'CASH_RETURN', 'REVERSAL', 'BANK_LEDGER'
  )
);

create table public.fin_bank_lists (
  id uuid primary key default gen_random_uuid(),
  list_key text not null check (list_key in ('AFFECTATION', 'FOURNISSEUR', 'MODE')),
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (list_key, label),
  constraint fin_bank_lists_label_len check (char_length(trim(label)) between 1 and 160)
);

create table public.fin_bank_lines (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.fin_accounts(id) on delete restrict,
  display_no integer not null default 0,
  op_date date not null,
  value_date date not null,
  affectation text not null default '',
  bc_label text not null default '',
  bc_url text,
  mode_label text not null default '',
  mode_url text,
  fac_label text not null default '',
  fac_url text,
  libelle text not null,
  debit numeric(18,2) not null default 0 check (debit >= 0),
  credit numeric(18,2) not null default 0 check (credit >= 0),
  frais numeric(18,2) not null default 0 check (frais >= 0),
  reconciled boolean not null default false,
  line_kind text not null default 'MANUAL' check (
    line_kind in ('MANUAL', 'CAUTION', 'VIREMENT', 'IMPORT')
  ),
  transfer_group_id uuid,
  debit_tx_id uuid references public.fin_transactions(id) on delete set null,
  credit_tx_id uuid references public.fin_transactions(id) on delete set null,
  frais_tx_id uuid references public.fin_transactions(id) on delete set null,
  deleted_at timestamptz,
  created_by uuid not null references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fin_bank_lines_libelle_len check (char_length(trim(libelle)) between 1 and 500),
  constraint fin_bank_lines_amounts check (debit > 0 or credit > 0 or frais > 0),
  constraint fin_bank_lines_url_len check (
    char_length(coalesce(bc_url, '')) <= 1500000
    and char_length(coalesce(mode_url, '')) <= 1500000
    and char_length(coalesce(fac_url, '')) <= 1500000
  )
);

create index fin_bank_lines_account_date_idx
  on public.fin_bank_lines (account_id, op_date, created_at)
  where deleted_at is null;
create index fin_bank_lines_transfer_idx
  on public.fin_bank_lines (transfer_group_id)
  where transfer_group_id is not null and deleted_at is null;
create index fin_bank_lines_reconciled_idx
  on public.fin_bank_lines (account_id, reconciled)
  where deleted_at is null;

create table public.fin_bank_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_email text not null default '',
  action text not null,
  account_name text not null default '',
  detail text not null default ''
);

create index fin_bank_audit_at_idx on public.fin_bank_audit (at desc);

insert into public.fin_bank_lists (list_key, label, sort_order)
values
  ('AFFECTATION', 'FOURNISSEUR', 10),
  ('AFFECTATION', 'CLIENT', 20),
  ('AFFECTATION', 'VIREMENT INTERNE', 30),
  ('AFFECTATION', 'FRAIS BANCAIRES', 40),
  ('AFFECTATION', 'CAUTION', 50),
  ('AFFECTATION', 'IMPORT AUTO', 60),
  ('FOURNISSEUR', 'Divers', 10),
  ('MODE', 'VIREMENT', 10),
  ('MODE', 'CHEQUE', 20),
  ('MODE', 'ESPECES', 30),
  ('MODE', 'CARTE', 40)
on conflict (list_key, label) do nothing;

create or replace function public.fin_bank_round(p_val numeric)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select round(coalesce(p_val, 0), 2);
$$;

create or replace function public.fin_bank_log(
  p_action text,
  p_account_name text,
  p_detail text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := '';
begin
  select coalesce(u.email, u.full_name, '') into v_email
  from public.sys_users u
  where u.id = auth.uid();
  insert into public.fin_bank_audit (user_email, action, account_name, detail)
  values (coalesce(v_email, ''), p_action, coalesce(p_account_name, ''), coalesce(p_detail, ''));
end;
$$;

create or replace function public.fin_bank_sheet_balance(p_account_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_opening numeric := 0;
  v_sum numeric := 0;
begin
  select coalesce(a.opening_balance, 0) into v_opening
  from public.fin_accounts a
  where a.id = p_account_id;
  if not found then return 0; end if;

  select coalesce(sum(public.fin_bank_round(l.debit - l.credit - l.frais)), 0)
  into v_sum
  from public.fin_bank_lines l
  where l.account_id = p_account_id
    and l.deleted_at is null;

  return public.fin_bank_round(v_opening + v_sum);
end;
$$;

create or replace function public.fin_bank_renumber(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  with ordered as (
    select id, row_number() over (order by op_date asc, created_at asc, id asc) as rn
    from public.fin_bank_lines
    where account_id = p_account_id
      and deleted_at is null
  )
  update public.fin_bank_lines l
  set display_no = ordered.rn,
      updated_at = now()
  from ordered
  where l.id = ordered.id
    and l.display_no is distinct from ordered.rn;
end;
$$;

create or replace function public.fin_bank_reverse_linked_txs(p_line public.fin_bank_lines)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx public.fin_transactions%rowtype;
  v_ids uuid[] := array_remove(array[p_line.debit_tx_id, p_line.credit_tx_id, p_line.frais_tx_id], null);
  v_id uuid;
begin
  foreach v_id in array v_ids loop
    select * into v_tx from public.fin_transactions where id = v_id for update;
    if not found then continue; end if;
    if exists (select 1 from public.fin_transactions r where r.reversal_of = v_tx.id) then
      continue;
    end if;
    if v_tx.reconciled_at is not null then
      update public.fin_transactions
      set reconciled_at = null, reconciled_by = null, reconciliation_reference = null
      where id = v_tx.id;
    end if;
    insert into public.fin_transactions(
      account_id, site_id, movement_date, direction, amount, category_id,
      payment_method_id, reference, description, counterparty, source_type,
      source_id, reversal_of, created_by
    ) values (
      v_tx.account_id, v_tx.site_id, current_date,
      case when v_tx.direction = 'IN' then 'OUT' else 'IN' end,
      v_tx.amount, v_tx.category_id, v_tx.payment_method_id, v_tx.reference,
      'Annulation journal banque: ' || left(p_line.libelle, 400),
      v_tx.counterparty, 'REVERSAL', p_line.id, v_tx.id, auth.uid()
    );
  end loop;
end;
$$;

create or replace function public.fin_bank_post_linked_txs(
  p_line_id uuid,
  p_account public.fin_accounts,
  p_op_date date,
  p_libelle text,
  p_affectation text,
  p_mode_label text,
  p_debit numeric,
  p_credit numeric,
  p_frais numeric
)
returns table (debit_tx_id uuid, credit_tx_id uuid, frais_tx_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_debit_tx uuid;
  v_credit_tx uuid;
  v_frais_tx uuid;
  v_cat uuid;
  v_method uuid;
begin
  select id into v_cat
  from public.fin_categories
  where active and label_fr = nullif(trim(p_affectation), '')
  order by sort_order, code
  limit 1;

  select id into v_method
  from public.fin_payment_methods
  where active
    and (
      label_fr = nullif(trim(split_part(p_mode_label, ' N°', 1)), '')
      or code = upper(nullif(trim(split_part(p_mode_label, ' N°', 1)), ''))
    )
  order by sort_order, code
  limit 1;

  if public.fin_bank_round(p_debit) > 0 then
    v_debit_tx := gen_random_uuid();
    insert into public.fin_transactions(
      id, account_id, site_id, movement_date, value_date, direction, amount,
      category_id, payment_method_id, description, counterparty, source_type, source_id, created_by
    ) values (
      v_debit_tx, p_account.id, p_account.site_id, p_op_date, p_op_date, 'IN',
      public.fin_bank_round(p_debit), v_cat, v_method, trim(p_libelle), null,
      'BANK_LEDGER', p_line_id, auth.uid()
    );
  end if;

  if public.fin_bank_round(p_credit) > 0 then
    v_credit_tx := gen_random_uuid();
    insert into public.fin_transactions(
      id, account_id, site_id, movement_date, value_date, direction, amount,
      category_id, payment_method_id, description, counterparty, source_type, source_id, created_by
    ) values (
      v_credit_tx, p_account.id, p_account.site_id, p_op_date, p_op_date, 'OUT',
      public.fin_bank_round(p_credit), v_cat, v_method, trim(p_libelle), null,
      'BANK_LEDGER', p_line_id, auth.uid()
    );
  end if;

  if public.fin_bank_round(p_frais) > 0 then
    select id into v_cat from public.fin_categories where code = 'FRAIS_BANCAIRES' limit 1;
    v_frais_tx := gen_random_uuid();
    insert into public.fin_transactions(
      id, account_id, site_id, movement_date, value_date, direction, amount,
      category_id, payment_method_id, description, counterparty, source_type, source_id, created_by
    ) values (
      v_frais_tx, p_account.id, p_account.site_id, p_op_date, p_op_date, 'OUT',
      public.fin_bank_round(p_frais), v_cat, v_method,
      'Frais bancaires — ' || left(trim(p_libelle), 450), null,
      'BANK_LEDGER', p_line_id, auth.uid()
    );
  end if;

  return query select v_debit_tx, v_credit_tx, v_frais_tx;
end;
$$;

create or replace function public.fin_bank_save_line(
  p_account_id uuid,
  p_line_id uuid,
  p_op_date date,
  p_affectation text,
  p_libelle text,
  p_debit numeric,
  p_credit numeric,
  p_frais numeric,
  p_bc_label text default '',
  p_bc_url text default null,
  p_mode_label text default '',
  p_mode_url text default null,
  p_fac_label text default '',
  p_fac_url text default null,
  p_line_kind text default 'MANUAL',
  p_value_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.fin_accounts%rowtype;
  v_line public.fin_bank_lines%rowtype;
  v_id uuid;
  v_outflow numeric;
  v_available numeric;
  v_posted record;
  v_is_edit boolean := p_line_id is not null;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_account from public.fin_accounts where id = p_account_id for update;
  if not found or not v_account.active or v_account.account_type <> 'BANK' then
    raise exception 'Active bank account required';
  end if;
  if v_is_edit then
    if not public.fin_can_access('update', v_account.site_id) then raise exception 'Permission denied'; end if;
  else
    if not public.fin_can_access('create', v_account.site_id) then raise exception 'Permission denied'; end if;
  end if;
  if p_op_date is null then raise exception 'Date required'; end if;
  if public.fin_period_is_locked(p_account_id, p_op_date) then
    raise exception 'Financial period is locked';
  end if;
  if coalesce(p_line_kind, 'MANUAL') not in ('MANUAL', 'CAUTION', 'VIREMENT', 'IMPORT') then
    raise exception 'Invalid line kind';
  end if;

  p_debit := public.fin_bank_round(p_debit);
  p_credit := public.fin_bank_round(p_credit);
  p_frais := public.fin_bank_round(p_frais);
  if p_debit < 0 or p_credit < 0 or p_frais < 0 then raise exception 'Amounts must be positive'; end if;
  if p_debit = 0 and p_credit = 0 and p_frais = 0 then raise exception 'Empty operation'; end if;
  if p_debit > 0 and p_credit > 0 then raise exception 'Debit and credit cannot both be set'; end if;
  if nullif(trim(p_libelle), '') is null then raise exception 'Libellé required'; end if;

  if v_is_edit then
    select * into v_line from public.fin_bank_lines
    where id = p_line_id and account_id = p_account_id and deleted_at is null
    for update;
    if not found then raise exception 'Operation not found'; end if;
    if v_line.reconciled then raise exception 'Impossible de modifier une opération déjà rapprochée.'; end if;
  end if;

  v_outflow := public.fin_bank_round(p_credit + p_frais);
  v_available := public.fin_bank_sheet_balance(p_account_id);
  if v_is_edit then
    v_available := public.fin_bank_round(
      v_available + public.fin_bank_round(v_line.credit + v_line.frais)
    );
  end if;
  if v_outflow > v_available + 0.001 then
    raise exception 'Solde insuffisant. Disponible : % DA',
      to_char(v_available, 'FM999999999990.00');
  end if;

  if v_is_edit then
    perform public.fin_bank_reverse_linked_txs(v_line);
    v_id := v_line.id;
    update public.fin_bank_lines set
      op_date = p_op_date,
      value_date = coalesce(p_value_date, p_op_date),
      affectation = coalesce(trim(p_affectation), ''),
      bc_label = coalesce(trim(p_bc_label), ''),
      bc_url = nullif(trim(p_bc_url), ''),
      mode_label = coalesce(trim(p_mode_label), ''),
      mode_url = nullif(trim(p_mode_url), ''),
      fac_label = coalesce(trim(p_fac_label), ''),
      fac_url = nullif(trim(p_fac_url), ''),
      libelle = trim(p_libelle),
      debit = p_debit,
      credit = p_credit,
      frais = p_frais,
      line_kind = coalesce(p_line_kind, v_line.line_kind),
      debit_tx_id = null,
      credit_tx_id = null,
      frais_tx_id = null,
      updated_at = now()
    where id = v_id;
    perform public.fin_bank_log('MODIFICATION', v_account.name, 'Op ' || v_id::text || ' | ' || trim(p_libelle));
  else
    v_id := gen_random_uuid();
    insert into public.fin_bank_lines (
      id, account_id, op_date, value_date, affectation, bc_label, bc_url,
      mode_label, mode_url, fac_label, fac_url, libelle, debit, credit, frais,
      line_kind, created_by
    ) values (
      v_id, p_account_id, p_op_date, coalesce(p_value_date, p_op_date),
      coalesce(trim(p_affectation), ''), coalesce(trim(p_bc_label), ''), nullif(trim(p_bc_url), ''),
      coalesce(trim(p_mode_label), ''), nullif(trim(p_mode_url), ''),
      coalesce(trim(p_fac_label), ''), nullif(trim(p_fac_url), ''),
      trim(p_libelle), p_debit, p_credit, p_frais, coalesce(p_line_kind, 'MANUAL'), auth.uid()
    );
    perform public.fin_bank_log('AJOUT', v_account.name, 'Libellé: ' || trim(p_libelle));
  end if;

  select * into v_posted from public.fin_bank_post_linked_txs(
    v_id, v_account, p_op_date, trim(p_libelle), coalesce(trim(p_affectation), ''),
    coalesce(trim(p_mode_label), ''), p_debit, p_credit, p_frais
  );

  update public.fin_bank_lines set
    debit_tx_id = v_posted.debit_tx_id,
    credit_tx_id = v_posted.credit_tx_id,
    frais_tx_id = v_posted.frais_tx_id,
    updated_at = now()
  where id = v_id;

  perform public.fin_bank_renumber(p_account_id);

  return jsonb_build_object(
    'id', v_id,
    'balance', public.fin_bank_sheet_balance(p_account_id)
  );
end;
$$;

create or replace function public.fin_bank_delete_line(
  p_line_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line public.fin_bank_lines%rowtype;
  v_account public.fin_accounts%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_line from public.fin_bank_lines where id = p_line_id and deleted_at is null for update;
  if not found then raise exception 'Operation not found'; end if;
  select * into v_account from public.fin_accounts where id = v_line.account_id;
  if not public.fin_can_access('delete', v_account.site_id) then raise exception 'Permission denied'; end if;
  if v_line.reconciled then raise exception 'Impossible de supprimer une opération déjà rapprochée.'; end if;

  perform public.fin_bank_reverse_linked_txs(v_line);
  update public.fin_bank_lines set
    deleted_at = now(),
    debit_tx_id = null,
    credit_tx_id = null,
    frais_tx_id = null,
    updated_at = now()
  where id = p_line_id;

  perform public.fin_bank_renumber(v_line.account_id);
  perform public.fin_bank_log(
    'SUPPRESSION', v_account.name,
    'Op ' || coalesce(v_line.display_no::text, p_line_id::text) || ' | ' || v_line.libelle
  );

  return jsonb_build_object(
    'id', p_line_id,
    'balance', public.fin_bank_sheet_balance(v_line.account_id)
  );
end;
$$;

create or replace function public.fin_bank_execute_virement(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_op_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from public.fin_accounts%rowtype;
  v_to public.fin_accounts%rowtype;
  v_amount numeric := public.fin_bank_round(p_amount);
  v_group uuid := gen_random_uuid();
  v_out jsonb;
  v_in jsonb;
  v_out_id uuid;
  v_in_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_from_account_id = p_to_account_id then raise exception 'Banques source et destination identiques'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Montant invalide'; end if;

  perform id from public.fin_accounts
  where id in (p_from_account_id, p_to_account_id)
  order by id
  for update;

  select * into v_from from public.fin_accounts where id = p_from_account_id;
  select * into v_to from public.fin_accounts where id = p_to_account_id;
  if v_from.id is null or v_to.id is null or not v_from.active or not v_to.active
     or v_from.account_type <> 'BANK' or v_to.account_type <> 'BANK' then
    raise exception 'Active bank accounts required';
  end if;
  if not public.fin_can_access('create', v_from.site_id)
     or not public.fin_can_access('create', v_to.site_id) then
    raise exception 'Permission denied';
  end if;
  if public.fin_period_is_locked(v_from.id, coalesce(p_op_date, current_date))
     or public.fin_period_is_locked(v_to.id, coalesce(p_op_date, current_date)) then
    raise exception 'Financial period is locked';
  end if;
  if v_amount > public.fin_bank_sheet_balance(v_from.id) + 0.001 then
    raise exception 'Solde insuffisant sur la banque source';
  end if;

  v_out := public.fin_bank_save_line(
    v_from.id, null, coalesce(p_op_date, current_date), 'VIREMENT INTERNE',
    'Transfert vers ' || v_to.name, 0, v_amount, 0,
    '', null, 'VIREMENT', null, '', null, 'VIREMENT', coalesce(p_op_date, current_date)
  );
  v_in := public.fin_bank_save_line(
    v_to.id, null, coalesce(p_op_date, current_date), 'VIREMENT INTERNE',
    'Réception de ' || v_from.name, v_amount, 0, 0,
    '', null, 'VIREMENT', null, '', null, 'VIREMENT', coalesce(p_op_date, current_date)
  );
  v_out_id := (v_out->>'id')::uuid;
  v_in_id := (v_in->>'id')::uuid;
  update public.fin_bank_lines set transfer_group_id = v_group where id in (v_out_id, v_in_id);
  perform public.fin_bank_log('VIREMENT', v_from.name || ' → ' || v_to.name, 'Montant: ' || v_amount::text || ' DA');

  return jsonb_build_object(
    'transfer_group_id', v_group,
    'out_id', v_out_id,
    'in_id', v_in_id,
    'amount', v_amount
  );
end;
$$;

create or replace function public.fin_bank_set_rapprochement(
  p_line_id uuid,
  p_reconciled boolean,
  p_value_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line public.fin_bank_lines%rowtype;
  v_account public.fin_accounts%rowtype;
  v_date date;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_line from public.fin_bank_lines where id = p_line_id and deleted_at is null for update;
  if not found then raise exception 'Operation not found'; end if;
  select * into v_account from public.fin_accounts where id = v_line.account_id;
  if not public.fin_can_access('update', v_account.site_id) then raise exception 'Permission denied'; end if;

  if p_reconciled then
    v_date := coalesce(p_value_date, v_line.value_date, v_line.op_date);
    update public.fin_bank_lines
    set reconciled = true, value_date = v_date, updated_at = now()
    where id = p_line_id;
    if v_line.debit_tx_id is not null then
      perform public.fin_set_reconciliation(v_line.debit_tx_id, true, 'RAPP');
    end if;
    if v_line.credit_tx_id is not null then
      perform public.fin_set_reconciliation(v_line.credit_tx_id, true, 'RAPP');
    end if;
    if v_line.frais_tx_id is not null then
      perform public.fin_set_reconciliation(v_line.frais_tx_id, true, 'RAPP');
    end if;
    perform public.fin_bank_log('RAPPROCHEMENT', v_account.name, 'Op ' || coalesce(v_line.display_no::text, p_line_id::text));
  else
    update public.fin_bank_lines
    set reconciled = false, value_date = op_date, updated_at = now()
    where id = p_line_id;
    if v_line.debit_tx_id is not null then
      perform public.fin_set_reconciliation(v_line.debit_tx_id, false, null);
    end if;
    if v_line.credit_tx_id is not null then
      perform public.fin_set_reconciliation(v_line.credit_tx_id, false, null);
    end if;
    if v_line.frais_tx_id is not null then
      perform public.fin_set_reconciliation(v_line.frais_tx_id, false, null);
    end if;
    perform public.fin_bank_log('ANNULATION_RAPP', v_account.name, 'Op ' || coalesce(v_line.display_no::text, p_line_id::text));
  end if;

  return jsonb_build_object('id', p_line_id, 'reconciled', p_reconciled);
end;
$$;

create or replace function public.fin_bank_import_releve(
  p_account_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.fin_accounts%rowtype;
  v_item jsonb;
  v_date date;
  v_libelle text;
  v_debit numeric;
  v_credit numeric;
  v_line public.fin_bank_lines%rowtype;
  v_matched int := 0;
  v_added int := 0;
  v_db_credit numeric;
  v_found boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_account from public.fin_accounts where id = p_account_id for update;
  if not found or v_account.account_type <> 'BANK' or not v_account.active then
    raise exception 'Active bank account required';
  end if;
  if not public.fin_can_access('update', v_account.site_id) then raise exception 'Permission denied'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Invalid statement payload'; end if;

  for v_item in select * from jsonb_array_elements(p_rows)
  loop
    begin
      v_date := nullif(trim(v_item->>'dateOp'), '')::date;
    exception when others then
      v_date := null;
    end;
    if v_date is null then
      begin
        v_date := nullif(trim(v_item->>'dateVal'), '')::date;
      exception when others then
        v_date := null;
      end;
    end if;
    v_libelle := coalesce(nullif(trim(v_item->>'libelle'), ''), 'IMPORT AUTO');
    v_debit := public.fin_bank_round((v_item->>'debit')::numeric);
    v_credit := public.fin_bank_round((v_item->>'credit')::numeric);
    if v_debit = 0 and v_credit = 0 then continue; end if;

    v_found := false;
    for v_line in
      select * from public.fin_bank_lines
      where account_id = p_account_id
        and deleted_at is null
        and not reconciled
      order by op_date, created_at, id
      for update
    loop
      v_db_credit := public.fin_bank_round(v_line.credit + v_line.frais);
      if (v_debit > 0 and public.fin_bank_round(v_line.debit) = v_debit)
         or (v_credit > 0 and v_db_credit = v_credit) then
        update public.fin_bank_lines
        set reconciled = true,
            value_date = coalesce(v_date, value_date),
            updated_at = now()
        where id = v_line.id;
        if v_line.debit_tx_id is not null then
          perform public.fin_set_reconciliation(v_line.debit_tx_id, true, 'IMPORT');
        end if;
        if v_line.credit_tx_id is not null then
          perform public.fin_set_reconciliation(v_line.credit_tx_id, true, 'IMPORT');
        end if;
        if v_line.frais_tx_id is not null then
          perform public.fin_set_reconciliation(v_line.frais_tx_id, true, 'IMPORT');
        end if;
        v_matched := v_matched + 1;
        v_found := true;
        exit;
      end if;
    end loop;

    if not v_found then
      perform public.fin_bank_save_line(
        p_account_id, null, coalesce(v_date, current_date), 'IMPORT AUTO',
        '🔴 ' || v_libelle, v_debit, v_credit, 0,
        '', null, '', null, '', null, 'IMPORT', coalesce(v_date, current_date)
      );
      -- Sheet locks imported rows immediately after insert.
      select * into v_line
      from public.fin_bank_lines
      where account_id = p_account_id
        and deleted_at is null
        and line_kind = 'IMPORT'
        and libelle = '🔴 ' || v_libelle
        and op_date = coalesce(v_date, current_date)
        and debit = v_debit
        and credit = v_credit
      order by created_at desc
      limit 1;
      if found then
        update public.fin_bank_lines
        set reconciled = true, updated_at = now()
        where id = v_line.id;
        if v_line.debit_tx_id is not null then
          perform public.fin_set_reconciliation(v_line.debit_tx_id, true, 'IMPORT');
        end if;
        if v_line.credit_tx_id is not null then
          perform public.fin_set_reconciliation(v_line.credit_tx_id, true, 'IMPORT');
        end if;
        if v_line.frais_tx_id is not null then
          perform public.fin_set_reconciliation(v_line.frais_tx_id, true, 'IMPORT');
        end if;
      end if;
      v_added := v_added + 1;
    end if;
  end loop;

  perform public.fin_bank_log(
    'IMPORT AUTO', v_account.name,
    'Rapprochés: ' || v_matched::text || ' | Ajoutés: ' || v_added::text
  );

  return jsonb_build_object('matched', v_matched, 'added', v_added);
end;
$$;

create or replace function public.fin_bank_add_list_item(
  p_list_key text,
  p_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_label text := trim(p_label);
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.fin_can_access('update', null) then raise exception 'Permission denied'; end if;
  if p_list_key not in ('AFFECTATION', 'FOURNISSEUR', 'MODE') then raise exception 'Invalid list'; end if;
  if v_label is null or v_label = '' then raise exception 'Label required'; end if;
  insert into public.fin_bank_lists (list_key, label, sort_order)
  values (
    p_list_key, v_label,
    coalesce((select max(sort_order) + 10 from public.fin_bank_lists where list_key = p_list_key), 10)
  )
  on conflict (list_key, label) do update set active = true
  returning id into v_id;
  perform public.fin_bank_log('PARAMÈTRE', p_list_key, v_label);
  return jsonb_build_object('id', v_id, 'label', v_label);
end;
$$;

-- RLS
alter table public.fin_bank_lists enable row level security;
alter table public.fin_bank_lines enable row level security;
alter table public.fin_bank_audit enable row level security;

create policy fin_bank_lists_read on public.fin_bank_lists for select to authenticated
  using (public.fin_can_access('read', null));
create policy fin_bank_lists_write on public.fin_bank_lists for all to authenticated
  using (public.fin_can_access('update', null))
  with check (public.fin_can_access('update', null));

create policy fin_bank_lines_read on public.fin_bank_lines for select to authenticated
  using (
    public.fin_can_access(
      'read',
      (select site_id from public.fin_accounts a where a.id = account_id)
    )
  );
create policy fin_bank_lines_insert on public.fin_bank_lines for insert to authenticated
  with check (
    public.fin_can_access(
      'create',
      (select site_id from public.fin_accounts a where a.id = account_id)
    )
  );
create policy fin_bank_lines_update on public.fin_bank_lines for update to authenticated
  using (
    public.fin_can_access(
      'update',
      (select site_id from public.fin_accounts a where a.id = account_id)
    )
  )
  with check (
    public.fin_can_access(
      'update',
      (select site_id from public.fin_accounts a where a.id = account_id)
    )
  );

create policy fin_bank_audit_read on public.fin_bank_audit for select to authenticated
  using (public.fin_can_access('read', null));
create policy fin_bank_audit_insert on public.fin_bank_audit for insert to authenticated
  with check (public.fin_can_access('create', null));

grant execute on function public.fin_bank_round(numeric) to authenticated;
grant execute on function public.fin_bank_log(text, text, text) to authenticated;
grant execute on function public.fin_bank_sheet_balance(uuid) to authenticated;
grant execute on function public.fin_bank_renumber(uuid) to authenticated;
grant execute on function public.fin_bank_save_line(uuid, uuid, date, text, text, numeric, numeric, numeric, text, text, text, text, text, text, text, date) to authenticated;
grant execute on function public.fin_bank_delete_line(uuid) to authenticated;
grant execute on function public.fin_bank_execute_virement(uuid, uuid, numeric, date) to authenticated;
grant execute on function public.fin_bank_set_rapprochement(uuid, boolean, date) to authenticated;
grant execute on function public.fin_bank_import_releve(uuid, jsonb) to authenticated;
grant execute on function public.fin_bank_add_list_item(text, text) to authenticated;

commit;
