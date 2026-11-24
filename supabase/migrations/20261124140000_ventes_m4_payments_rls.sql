-- Ventes M4: encaissement interne (sal_invoice_payments only).
-- Allow insert for create OR update (can_encaisser via sal_can update).
-- Extend sal_can so can_encaisser also grants create for payment writes.
-- Does NOT alter Banque/Caisse tables or write fin_transactions.

begin;

create or replace function public.sal_can(p_action public.rbac_action)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and (
      public.erp_has_perm('ventes', p_action, null)
      or public.fin_can_access(p_action, null)
      or exists (
        select 1
        from public.sal_rights r
        where r.user_id = auth.uid()
          and r.ventes_active
          and (
            (p_action = 'read')
            or (p_action = 'create' and (r.can_saisie or r.can_encaisser))
            or (
              p_action = 'update'
              and (r.can_saisie or r.can_emit or r.can_encaisser or r.can_admin)
            )
            or (p_action = 'delete' and (r.can_cancel or r.can_admin))
          )
      )
    );
$$;

drop policy if exists sal_invoice_payments_insert on public.sal_invoice_payments;
create policy sal_invoice_payments_insert on public.sal_invoice_payments
  for insert to authenticated
  with check (public.sal_can('create') or public.sal_can('update'));

commit;
