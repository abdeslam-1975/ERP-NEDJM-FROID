-- Banque corbeille: list + restore soft-deleted fin_bank_lines (deleted_at).
-- Separate from Caisse (voided_at / caisse_restore_*). Do not mix modules.

begin;

create or replace function public.fin_bank_list_deleted_lines(
  p_account_id uuid default null,
  p_limit integer default 150
)
returns table (
  id uuid,
  account_id uuid,
  account_name text,
  display_no integer,
  op_date date,
  value_date date,
  affectation text,
  libelle text,
  debit numeric,
  credit numeric,
  frais numeric,
  line_kind text,
  transfer_group_id uuid,
  deleted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.fin_can_access('delete', null) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    l.id,
    l.account_id,
    a.name::text as account_name,
    l.display_no,
    l.op_date,
    l.value_date,
    l.affectation::text,
    l.libelle::text,
    l.debit,
    l.credit,
    l.frais,
    l.line_kind::text,
    l.transfer_group_id,
    l.deleted_at
  from public.fin_bank_lines l
  join public.fin_accounts a on a.id = l.account_id
  where l.deleted_at is not null
    and a.account_type = 'BANK'
    and (p_account_id is null or l.account_id = p_account_id)
  order by l.deleted_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 150), 500));
end;
$$;

create or replace function public.fin_bank_restore_one_line(p_line public.fin_bank_lines)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.fin_accounts%rowtype;
  v_outflow numeric;
  v_available numeric;
  v_posted record;
begin
  if p_line.deleted_at is null then
    raise exception 'Operation already active';
  end if;

  select * into v_account from public.fin_accounts where id = p_line.account_id for update;
  if not found or v_account.account_type <> 'BANK' then
    raise exception 'Bank account required';
  end if;
  if not public.fin_can_access('delete', v_account.site_id) then
    raise exception 'Permission denied';
  end if;
  if public.fin_period_is_locked(p_line.account_id, p_line.op_date) then
    raise exception 'Financial period is locked';
  end if;

  v_outflow := public.fin_bank_round(coalesce(p_line.credit, 0) + coalesce(p_line.frais, 0));
  v_available := public.fin_bank_sheet_balance(p_line.account_id);
  if v_outflow > v_available + 0.001 then
    raise exception 'Solde insuffisant pour restaurer. Disponible : % DA',
      to_char(v_available, 'FM999999999990.00');
  end if;

  update public.fin_bank_lines
  set
    deleted_at = null,
    debit_tx_id = null,
    credit_tx_id = null,
    frais_tx_id = null,
    updated_at = now()
  where id = p_line.id;

  select * into v_posted from public.fin_bank_post_linked_txs(
    p_line.id,
    v_account,
    p_line.op_date,
    trim(p_line.libelle),
    coalesce(trim(p_line.affectation), ''),
    coalesce(trim(p_line.mode_label), ''),
    coalesce(p_line.debit, 0),
    coalesce(p_line.credit, 0),
    coalesce(p_line.frais, 0)
  );

  update public.fin_bank_lines
  set
    debit_tx_id = v_posted.debit_tx_id,
    credit_tx_id = v_posted.credit_tx_id,
    frais_tx_id = v_posted.frais_tx_id,
    updated_at = now()
  where id = p_line.id;

  perform public.fin_bank_renumber(p_line.account_id);
  perform public.fin_bank_log(
    'RESTAURATION',
    v_account.name,
    'Op ' || coalesce(p_line.display_no::text, p_line.id::text) || ' | ' || p_line.libelle
  );
end;
$$;

create or replace function public.fin_bank_restore_line(p_line_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line public.fin_bank_lines%rowtype;
  v_sibling public.fin_bank_lines%rowtype;
  v_account public.fin_accounts%rowtype;
  v_ids uuid[] := array[]::uuid[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_line
  from public.fin_bank_lines
  where id = p_line_id
  for update;
  if not found then
    raise exception 'Operation not found';
  end if;
  if v_line.deleted_at is null then
    raise exception 'Cette opération n''est pas dans la corbeille.';
  end if;

  select * into v_account from public.fin_accounts where id = v_line.account_id;
  if not found or v_account.account_type <> 'BANK' then
    raise exception 'Bank account required';
  end if;
  if not public.fin_can_access('delete', v_account.site_id) then
    raise exception 'Permission denied';
  end if;

  -- Virement pair: if the sibling leg is also deleted, restore both (debit/IN first).
  if v_line.transfer_group_id is not null then
    select * into v_sibling
    from public.fin_bank_lines
    where transfer_group_id = v_line.transfer_group_id
      and id <> v_line.id
      and deleted_at is not null
    for update;

    if found then
      if coalesce(v_sibling.debit, 0) > 0 and coalesce(v_line.debit, 0) = 0 then
        perform public.fin_bank_restore_one_line(v_sibling);
        perform public.fin_bank_restore_one_line(v_line);
        v_ids := array[v_sibling.id, v_line.id];
      elsif coalesce(v_line.debit, 0) > 0 and coalesce(v_sibling.debit, 0) = 0 then
        perform public.fin_bank_restore_one_line(v_line);
        perform public.fin_bank_restore_one_line(v_sibling);
        v_ids := array[v_line.id, v_sibling.id];
      else
        perform public.fin_bank_restore_one_line(v_line);
        perform public.fin_bank_restore_one_line(v_sibling);
        v_ids := array[v_line.id, v_sibling.id];
      end if;
    else
      perform public.fin_bank_restore_one_line(v_line);
      v_ids := array[v_line.id];
    end if;
  else
    perform public.fin_bank_restore_one_line(v_line);
    v_ids := array[v_line.id];
  end if;

  return jsonb_build_object(
    'ids', to_jsonb(v_ids),
    'balance', public.fin_bank_sheet_balance(v_line.account_id)
  );
end;
$$;

revoke all on function public.fin_bank_restore_one_line(public.fin_bank_lines) from public, anon, authenticated;
grant execute on function public.fin_bank_list_deleted_lines(uuid, integer) to authenticated;
grant execute on function public.fin_bank_restore_line(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
