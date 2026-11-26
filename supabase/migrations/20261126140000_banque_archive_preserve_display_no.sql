-- Preserve exact archive N° / same-day row order on import.
-- Root cause: fin_bank_save_line renumbered by (op_date, created_at, id) while
-- all archive inserts shared the same created_at, so same-day lines could swap
-- (e.g. SETIF N°6 FRAIS ↔ N°7 Transfert).

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
  v_skip_balance boolean := current_setting('app.fin_archive_import', true) = '1';
  v_skip_renumber boolean := current_setting('app.fin_archive_import', true) = '1';
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

create or replace function public.fin_bank_import_archive(
  p_account_id uuid,
  p_opening_balance numeric,
  p_opening_date date,
  p_rows jsonb,
  p_mode text default 'fill_empty',
  p_expected_final numeric default null,
  p_allow_negative boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.fin_accounts%rowtype;
  v_item jsonb;
  v_active int := 0;
  v_added int := 0;
  v_deleted int := 0;
  v_line_id uuid;
  v_mode text := lower(coalesce(nullif(trim(p_mode), ''), 'fill_empty'));
  v_bal numeric;
  v_old_line public.fin_bank_lines%rowtype;
  v_display_no int;
  v_created_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if v_mode not in ('fill_empty', 'replace') then
    raise exception 'Invalid archive mode';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Invalid archive payload';
  end if;
  if p_opening_date is null then raise exception 'Opening date required'; end if;

  select * into v_account from public.fin_accounts where id = p_account_id for update;
  if not found or v_account.account_type <> 'BANK' or not v_account.active then
    raise exception 'Active bank account required';
  end if;
  if not public.fin_can_access('update', v_account.site_id) then
    raise exception 'Permission denied';
  end if;
  if v_mode = 'replace' and not public.fin_can_access('delete', v_account.site_id) then
    raise exception 'Permission denied';
  end if;

  select count(*)::int into v_active
  from public.fin_bank_lines
  where account_id = p_account_id and deleted_at is null;

  if v_mode = 'fill_empty' and v_active > 0 then
    raise exception 'Compte non vide (% opérations). Utilisez le mode replace.', v_active;
  end if;

  perform set_config('app.fin_archive_import', '1', true);

  if v_mode = 'replace' and v_active > 0 then
    for v_old_line in
      select * from public.fin_bank_lines
      where account_id = p_account_id and deleted_at is null
      order by op_date desc, created_at desc, id desc
    loop
      perform public.fin_bank_delete_line(v_old_line.id);
      v_deleted := v_deleted + 1;
    end loop;
  end if;

  update public.fin_accounts
  set
    opening_balance = public.fin_bank_round(coalesce(p_opening_balance, 0)),
    opening_date = p_opening_date,
    allow_negative = coalesce(p_allow_negative, allow_negative, false),
    updated_at = now()
  where id = p_account_id;

  select * into v_account from public.fin_accounts where id = p_account_id;

  for v_item in select * from jsonb_array_elements(p_rows)
  loop
    if public.fin_bank_round(coalesce((v_item->>'debit')::numeric, 0)) = 0
       and public.fin_bank_round(coalesce((v_item->>'credit')::numeric, 0)) = 0
       and public.fin_bank_round(coalesce((v_item->>'frais')::numeric, 0)) = 0 then
      continue;
    end if;

    v_added := v_added + 1;
    begin
      v_display_no := nullif(trim(v_item->>'display_no'), '')::int;
    exception when others then
      v_display_no := null;
    end;
    if v_display_no is null or v_display_no < 1 then
      v_display_no := v_added;
    end if;

    -- Stable chronology for UI order + future renumber: archive sequence wins over UUID.
    v_created_at := (p_opening_date::timestamp + make_interval(secs => v_display_no))
      at time zone 'Africa/Algiers';

    select (public.fin_bank_save_line(
      p_account_id,
      null,
      (v_item->>'op_date')::date,
      coalesce(v_item->>'affectation', ''),
      coalesce(nullif(trim(v_item->>'libelle'), ''), 'IMPORT ARCHIVE'),
      coalesce((v_item->>'debit')::numeric, 0),
      coalesce((v_item->>'credit')::numeric, 0),
      coalesce((v_item->>'frais')::numeric, 0),
      coalesce(v_item->>'bc_label', ''),
      nullif(v_item->>'bc_url', ''),
      coalesce(v_item->>'mode_label', ''),
      nullif(v_item->>'mode_url', ''),
      coalesce(v_item->>'fac_label', ''),
      nullif(v_item->>'fac_url', ''),
      'MANUAL',
      coalesce(nullif(v_item->>'value_date', ''), v_item->>'op_date')::date
    )->>'id')::uuid into v_line_id;

    update public.fin_bank_lines
    set
      display_no = v_display_no,
      created_at = v_created_at,
      reconciled = coalesce((v_item->>'reconciled')::boolean, false),
      updated_at = now()
    where id = v_line_id;
  end loop;

  -- Do NOT call fin_bank_renumber: archive N° must stay exact.
  v_bal := public.fin_bank_sheet_balance(p_account_id);

  if p_expected_final is not null
     and abs(public.fin_bank_round(v_bal) - public.fin_bank_round(p_expected_final)) > 0.02 then
    raise exception 'Solde final archive incorrect: obtenu % / attendu %',
      to_char(public.fin_bank_round(v_bal), 'FM999999999990.00'),
      to_char(public.fin_bank_round(p_expected_final), 'FM999999999990.00');
  end if;

  perform public.fin_bank_log(
    'IMPORT ARCHIVE',
    v_account.name,
    format('mode=%s | ajoutés=%s | supprimés=%s | ouverture=%s | solde=%s | N° archivés',
      v_mode, v_added, v_deleted,
      to_char(public.fin_bank_round(coalesce(p_opening_balance, 0)), 'FM999999999990.00'),
      to_char(public.fin_bank_round(v_bal), 'FM999999999990.00'))
  );

  return jsonb_build_object(
    'account_id', p_account_id,
    'mode', v_mode,
    'added', v_added,
    'deleted', v_deleted,
    'opening_balance', public.fin_bank_round(coalesce(p_opening_balance, 0)),
    'final_balance', public.fin_bank_round(v_bal)
  );
end;
$$;

commit;
