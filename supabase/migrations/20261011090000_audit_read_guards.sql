-- Audit (open point): SECURITY DEFINER readers returned contract, invoice, account and supplier-invoice
-- figures to any signed-in user who knew the id, whatever their rights.
--
-- Each reader moves unchanged to the schema "private" (not exposed by the API). A wrapper with the same
-- name and signature takes its place in "public": it runs with the caller's rights and only lets the call
-- through when the caller can see the row under the existing RLS read policies. Calls made from the
-- write functions (SECURITY DEFINER, current_user is their owner) skip the check, so they behave as before.
-- No function body changes.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.ref_contract_balance(uuid) set schema private;
alter function public.ref_contract_stats(uuid) set schema private;
alter function public.ref_contract_suggest_penalty(uuid, text, numeric, text) set schema private;
alter function public.ref_contract_invoice_open_ht(uuid) set schema private;
alter function public.ref_contract_invoice_open_ttc(uuid) set schema private;
alter function public.ref_contract_item_consumed_qty(uuid) set schema private;
alter function public.ref_contract_item_invoiced_qty(uuid) set schema private;
alter function public.fin_account_balance(uuid, date) set schema private;
alter function public.pur_supplier_invoice_open(uuid) set schema private;

create function public.ref_contract_balance(p_contract_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and not exists (select 1 from public.ref_contracts where id = p_contract_id) then
    raise exception 'Contrat introuvable ou accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  return private.ref_contract_balance(p_contract_id);
end;
$$;

create function public.ref_contract_stats(p_contract_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and not exists (select 1 from public.ref_contracts where id = p_contract_id) then
    raise exception 'Contrat introuvable ou accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  return private.ref_contract_stats(p_contract_id);
end;
$$;

create function public.ref_contract_suggest_penalty(
  p_contract_id uuid, p_rule_code text, p_basis_days numeric default 1, p_item_code text default null
)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and not exists (select 1 from public.ref_contracts where id = p_contract_id) then
    raise exception 'Contrat introuvable ou accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  return private.ref_contract_suggest_penalty(p_contract_id, p_rule_code, p_basis_days, p_item_code);
end;
$$;

create function public.ref_contract_invoice_open_ht(p_invoice_id uuid)
returns numeric language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and not exists (select 1 from public.contract_invoices where id = p_invoice_id) then
    raise exception 'Facture introuvable ou accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  return private.ref_contract_invoice_open_ht(p_invoice_id);
end;
$$;

create function public.ref_contract_invoice_open_ttc(p_invoice_id uuid)
returns numeric language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and not exists (select 1 from public.contract_invoices where id = p_invoice_id) then
    raise exception 'Facture introuvable ou accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  return private.ref_contract_invoice_open_ttc(p_invoice_id);
end;
$$;

create function public.ref_contract_item_consumed_qty(p_item_id uuid)
returns numeric language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and not exists (select 1 from public.contract_items where id = p_item_id) then
    raise exception 'Article introuvable ou accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  return private.ref_contract_item_consumed_qty(p_item_id);
end;
$$;

create function public.ref_contract_item_invoiced_qty(p_item_id uuid)
returns numeric language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and not exists (select 1 from public.contract_items where id = p_item_id) then
    raise exception 'Article introuvable ou accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  return private.ref_contract_item_invoiced_qty(p_item_id);
end;
$$;

create function public.fin_account_balance(p_account_id uuid, p_as_of date default null)
returns numeric language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and not exists (select 1 from public.fin_accounts where id = p_account_id) then
    raise exception 'Compte introuvable ou accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  return private.fin_account_balance(p_account_id, p_as_of);
end;
$$;

create function public.pur_supplier_invoice_open(p_invoice_id uuid)
returns numeric language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and not exists (select 1 from public.pur_supplier_invoices where id = p_invoice_id) then
    raise exception 'Facture fournisseur introuvable ou accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  return private.pur_supplier_invoice_open(p_invoice_id);
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'ref_contract_balance(uuid)',
    'ref_contract_stats(uuid)',
    'ref_contract_suggest_penalty(uuid,text,numeric,text)',
    'ref_contract_invoice_open_ht(uuid)',
    'ref_contract_invoice_open_ttc(uuid)',
    'ref_contract_item_consumed_qty(uuid)',
    'ref_contract_item_invoiced_qty(uuid)',
    'fin_account_balance(uuid,date)',
    'pur_supplier_invoice_open(uuid)'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
    execute format('revoke execute on function private.%s from public, anon', fn);
    execute format('grant execute on function private.%s to authenticated, service_role', fn);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
