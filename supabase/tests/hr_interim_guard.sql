do $$
declare
  v_agency uuid;
  v_st uuid;
  v_st2 uuid;
  v_contract uuid;
  v_out text := '';
  v_n int;
  v_ts timestamptz;
begin
  insert into public.hr_interim_agencies (code, name, default_daily_rate, markup_pct, vat_pct)
  values ('ZZTEST', 'Agence test', 2500, 10, 19) returning id into v_agency;

  select id into v_contract from public.hr_contracts limit 1;
  if v_contract is not null then
    begin
      update public.hr_contracts set contract_type_code = 'INTERIM', agency_id = null where id = v_contract;
      v_out := v_out || 'interim_no_agency=ALLOWED(BAD) ';
    exception when check_violation then
      v_out := v_out || 'interim_no_agency=blocked ';
    end;
  end if;

  insert into public.hr_interim_statements (statement_no, agency_id, period_year, period_month, lines, days_total, amount_ht, markup_pct, vat_pct, amount_vat, amount_ttc)
  values ('ZZ-000001', v_agency, 2099, 1, '[]'::jsonb, 10, 27500, 10, 19, 5225, 32725) returning id into v_st;

  begin
    insert into public.hr_interim_statements (statement_no, agency_id, period_year, period_month, lines, days_total, amount_ht, markup_pct, vat_pct, amount_vat, amount_ttc)
    values ('ZZ-000002', v_agency, 2099, 1, '[]'::jsonb, 1, 1, 0, 0, 0, 1);
    v_out := v_out || 'duplicate_live=ALLOWED(BAD) ';
  exception when unique_violation then
    v_out := v_out || 'duplicate_live=blocked ';
  end;

  begin
    update public.hr_interim_statements set amount_ttc = 1 where id = v_st;
    v_out := v_out || 'edit_amount=ALLOWED(BAD) ';
  exception when check_violation then
    v_out := v_out || 'edit_amount=blocked ';
  end;

  begin
    update public.hr_interim_statements set status_code = 'RECONCILED' where id = v_st;
    v_out := v_out || 'reconcile_no_ref=ALLOWED(BAD) ';
  exception when check_violation then
    v_out := v_out || 'reconcile_no_ref=blocked ';
  end;

  update public.hr_interim_statements set status_code = 'RECONCILED', agency_invoice_ref = 'FA-1', agency_invoice_amount = 32725 where id = v_st;
  select reconciled_at into v_ts from public.hr_interim_statements where id = v_st;
  v_out := v_out || 'reconcile=' || case when v_ts is not null then 'ok' else 'NO_TS(BAD)' end || ' ';

  begin
    update public.hr_interim_statements set status_code = 'CANCELLED', cancelled_reason = 'x' where id = v_st;
    v_out := v_out || 'reconciled_to_cancel=ALLOWED(BAD) ';
  exception when check_violation then
    v_out := v_out || 'reconciled_to_cancel=blocked ';
  end;

  update public.hr_interim_statements set status_code = 'ISSUED' where id = v_st;
  select reconciled_at into v_ts from public.hr_interim_statements where id = v_st;
  v_out := v_out || 'unreconcile=' || case when v_ts is null then 'ok' else 'TS_KEPT(BAD)' end || ' ';

  begin
    update public.hr_interim_statements set status_code = 'CANCELLED' where id = v_st;
    v_out := v_out || 'cancel_no_reason=ALLOWED(BAD) ';
  exception when check_violation then
    v_out := v_out || 'cancel_no_reason=blocked ';
  end;

  update public.hr_interim_statements set status_code = 'CANCELLED', cancelled_reason = 'Erreur de pointage' where id = v_st;
  v_out := v_out || 'cancel=ok ';

  begin
    update public.hr_interim_statements set status_code = 'ISSUED' where id = v_st;
    v_out := v_out || 'reopen_cancelled=ALLOWED(BAD) ';
  exception when check_violation then
    v_out := v_out || 'reopen_cancelled=blocked ';
  end;

  begin
    update public.hr_interim_statements set agency_invoice_ref = 'late' where id = v_st;
    v_out := v_out || 'edit_cancelled=ALLOWED(BAD) ';
  exception when check_violation then
    v_out := v_out || 'edit_cancelled=blocked ';
  end;

  begin
    delete from public.hr_interim_statements where id = v_st;
    v_out := v_out || 'delete=ALLOWED(BAD) ';
  exception when check_violation then
    v_out := v_out || 'delete=blocked ';
  end;

  insert into public.hr_interim_statements (statement_no, agency_id, period_year, period_month, lines, days_total, amount_ht, markup_pct, vat_pct, amount_vat, amount_ttc)
  values ('ZZ-000003', v_agency, 2099, 1, '[]'::jsonb, 1, 1, 0, 0, 0, 1) returning id into v_st2;
  v_out := v_out || 'reissue_after_cancel=ok ';

  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from public.hr_interim_statements;
  v_out := v_out || 'stranger_reads=' || v_n || ' ';
  begin
    insert into public.hr_interim_agencies (code, name) values ('ZZHACK', 'x');
    v_out := v_out || 'stranger_insert=ALLOWED(BAD) ';
  exception when insufficient_privilege then
    v_out := v_out || 'stranger_insert=blocked ';
  end;
  perform set_config('role', 'postgres', true);

  raise exception 'RESULT: %', v_out;
end $$;
