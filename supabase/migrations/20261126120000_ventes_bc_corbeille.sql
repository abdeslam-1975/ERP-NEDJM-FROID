-- =============================================================================
-- Ventes BC — soft delete (corbeille) + restore for sal_orders.
-- Does not alter Banque / Caisse / Achats.
-- =============================================================================

begin;

alter table public.sal_orders
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.sys_users(id);

create index if not exists sal_orders_deleted_idx
  on public.sal_orders (deleted_at desc nulls last)
  where deleted_at is not null;

-- Allow soft-delete / restore updates on issued rows (deleted_at only).
create or replace function public.sal_orders_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'EMIS' and old.deleted_at is null then
      raise exception 'Cannot hard-delete an issued sales order (use corbeille)';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status = 'EMIS' and old.deleted_at is null and new.deleted_at is not null then
    -- Soft delete of an issued BC: only deletion metadata may change.
    if new.order_number is distinct from old.order_number
       or new.fiscal_year is distinct from old.fiscal_year
       or new.client_id is distinct from old.client_id
       or new.total_ht is distinct from old.total_ht
       or new.total_ht_net is distinct from old.total_ht_net
       or new.total_tva is distinct from old.total_tva
       or new.total_ttc is distinct from old.total_ttc
       or new.retention_amount is distinct from old.retention_amount
       or new.stamp_amount is distinct from old.stamp_amount
       or new.net_payable is distinct from old.net_payable
       or new.discount_amount is distinct from old.discount_amount
       or new.tax_rate is distinct from old.tax_rate
       or new.status is distinct from old.status
    then
      raise exception 'Issued sales order amounts/identity are frozen (soft-delete only)';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null then
    -- Restore from corbeille: clear deletion metadata only.
    if new.order_number is distinct from old.order_number
       or new.fiscal_year is distinct from old.fiscal_year
       or new.client_id is distinct from old.client_id
       or new.total_ht is distinct from old.total_ht
       or new.net_payable is distinct from old.net_payable
       or new.status is distinct from old.status
    then
      raise exception 'Restore may only clear deleted_at';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'EMIS' then
    if new.status = 'EMIS' then
      if new.order_number is distinct from old.order_number
         or new.fiscal_year is distinct from old.fiscal_year
         or new.client_id is distinct from old.client_id
         or new.total_ht is distinct from old.total_ht
         or new.total_ht_net is distinct from old.total_ht_net
         or new.total_tva is distinct from old.total_tva
         or new.total_ttc is distinct from old.total_ttc
         or new.retention_amount is distinct from old.retention_amount
         or new.stamp_amount is distinct from old.stamp_amount
         or new.net_payable is distinct from old.net_payable
         or new.discount_amount is distinct from old.discount_amount
         or new.tax_rate is distinct from old.tax_rate
      then
        raise exception 'Issued sales order amounts/identity are frozen';
      end if;
    elsif new.status not in ('ANNULE') then
      raise exception 'Issued sales order can only move to ANNULE';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.status = 'ANNULE' and old.deleted_at is null then
    if new.deleted_at is null then
      raise exception 'Cancelled sales order is immutable';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.sal_order_soft_delete(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sal_orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not (public.sal_can('delete') or public.sal_can('update')) then
    raise exception 'Permission denied';
  end if;

  select * into v_order from public.sal_orders where id = p_order_id for update;
  if not found then
    raise exception 'Bon de commande introuvable';
  end if;
  if v_order.deleted_at is not null then
    raise exception 'Déjà dans la corbeille';
  end if;

  update public.sal_orders
  set deleted_at = now(), deleted_by = auth.uid(), updated_at = now()
  where id = p_order_id;

  insert into public.sal_audit (actor, action, entity, entity_id, detail, payload)
  values (
    auth.uid(),
    'SOFT_DELETE',
    'sal_orders',
    p_order_id,
    'Mise en corbeille BC ' || v_order.order_number,
    jsonb_build_object('order_number', v_order.order_number, 'status', v_order.status)
  );

  return p_order_id;
end;
$$;

create or replace function public.sal_order_list_deleted(p_limit integer default 150)
returns table (
  id uuid,
  order_number text,
  order_date date,
  client_name text,
  status text,
  total_ht numeric,
  total_tva numeric,
  net_payable numeric,
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
  if not (public.sal_can('delete') or public.sal_can('read')) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    o.id,
    o.order_number,
    o.order_date,
    o.client_name,
    o.status::text,
    o.total_ht,
    o.total_tva,
    o.net_payable,
    o.deleted_at
  from public.sal_orders o
  where o.deleted_at is not null
  order by o.deleted_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 150), 500));
end;
$$;

create or replace function public.sal_order_restore(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sal_orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not (public.sal_can('delete') or public.sal_can('update')) then
    raise exception 'Permission denied';
  end if;

  select * into v_order from public.sal_orders where id = p_order_id for update;
  if not found then
    raise exception 'Bon de commande introuvable';
  end if;
  if v_order.deleted_at is null then
    raise exception 'Ce bon de commande n''est pas dans la corbeille';
  end if;

  -- Avoid unique conflict if another live BC reused the same number (should not happen).
  if exists (
    select 1 from public.sal_orders x
    where x.fiscal_year = v_order.fiscal_year
      and x.order_number = v_order.order_number
      and x.id <> v_order.id
      and x.deleted_at is null
  ) then
    raise exception 'Impossible de restaurer : le N° % est déjà utilisé', v_order.order_number;
  end if;

  update public.sal_orders
  set deleted_at = null, deleted_by = null, updated_at = now()
  where id = p_order_id;

  insert into public.sal_audit (actor, action, entity, entity_id, detail, payload)
  values (
    auth.uid(),
    'RESTORE',
    'sal_orders',
    p_order_id,
    'Restauration BC ' || v_order.order_number,
    jsonb_build_object('order_number', v_order.order_number, 'status', v_order.status)
  );

  return p_order_id;
end;
$$;

revoke all on function public.sal_order_soft_delete(uuid) from public;
revoke all on function public.sal_order_list_deleted(integer) from public;
revoke all on function public.sal_order_restore(uuid) from public;
grant execute on function public.sal_order_soft_delete(uuid) to authenticated;
grant execute on function public.sal_order_list_deleted(integer) to authenticated;
grant execute on function public.sal_order_restore(uuid) to authenticated;

commit;
