-- Fix: new banque ops stayed at display_no = 0 and sank to the bottom of the
-- reversed sheet. Root cause: when app.fin_archive_import is unset,
-- current_setting(..., true) = '1' yields NULL, so
--   v_skip_renumber boolean := NULL
-- and "IF NOT v_skip_renumber THEN renumber END IF" is skipped (IF NULL).
-- Same NULL bug disabled the solde-insuffisant guard (v_skip_balance).

begin;

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
  v_skip_balance boolean := coalesce(current_setting('app.fin_archive_import', true), '') = '1';
  v_skip_renumber boolean := coalesce(current_setting('app.fin_archive_import', true), '') = '1';
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
  if not v_skip_balance
     and not coalesce(v_account.allow_negative, false)
     and v_outflow > v_available + 0.001 then
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

  if not v_skip_renumber then
    perform public.fin_bank_renumber(p_account_id);
  end if;

  return jsonb_build_object(
    'id', v_id,
    'balance', public.fin_bank_sheet_balance(p_account_id)
  );
end;
$$;

-- Repair any leftover zeros (idempotent).
do $$
declare
  r record;
begin
  for r in
    select distinct account_id
    from public.fin_bank_lines
    where deleted_at is null
  loop
    perform public.fin_bank_renumber(r.account_id);
  end loop;
end;
$$;

commit;
