-- Ventes M3: allow invoice line inserts with create (not only update).
-- Does not alter Banque/Caisse tables.

begin;

drop policy if exists sal_invoice_lines_write on public.sal_invoice_lines;

drop policy if exists sal_invoice_lines_insert on public.sal_invoice_lines;
create policy sal_invoice_lines_insert on public.sal_invoice_lines
  for insert to authenticated
  with check (public.sal_can('create') or public.sal_can('update'));

drop policy if exists sal_invoice_lines_update on public.sal_invoice_lines;
create policy sal_invoice_lines_update on public.sal_invoice_lines
  for update to authenticated
  using (public.sal_can('update'))
  with check (public.sal_can('update'));

drop policy if exists sal_invoice_lines_delete on public.sal_invoice_lines;
create policy sal_invoice_lines_delete on public.sal_invoice_lines
  for delete to authenticated
  using (public.sal_can('update') or public.sal_can('delete'));

commit;
