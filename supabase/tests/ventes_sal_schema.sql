-- Smoke checks for ventes M1 schema (run against linked DB after migration).

do $$
begin
  if to_regclass('public.sal_invoices') is null then
    raise exception 'sal_invoices missing';
  end if;
  if to_regclass('public.sal_invoice_lines') is null then
    raise exception 'sal_invoice_lines missing';
  end if;
  if to_regclass('public.sal_invoice_payments') is null then
    raise exception 'sal_invoice_payments missing';
  end if;
  if to_regclass('public.v_sales_register') is null then
    raise exception 'v_sales_register missing';
  end if;
  if not exists (select 1 from public.sal_doc_kinds where code = 'P') then
    raise exception 'sal_doc_kinds seed missing P';
  end if;
  if not exists (select 1 from public.sys_screens where code = 'finance' and label_fr = 'Banque') then
    raise exception 'Banque screen was altered unexpectedly';
  end if;
  if not exists (select 1 from public.sys_screens where code = 'caisse' and label_fr = 'Caisse') then
    raise exception 'Caisse screen was altered unexpectedly';
  end if;
end $$;

select 'ventes_m1_ok' as status;
