-- Corbeille caisse : lister / restaurer les opérations voidées.
-- SUPER_ADMIN / ADMIN_FINANCE toujours ; autres via caisse_rights.manage_restore.

begin;

alter table public.caisse_rights
  add column if not exists manage_restore boolean not null default false;

create or replace function public.caisse_can_restore_operations()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.erp_is_super_admin(auth.uid())
    or exists (
      select 1
      from public.sys_user_site_roles ur
      join public.sys_roles ro on ro.id = ur.role_id
      where ur.user_id = auth.uid()
        and ro.code = 'ADMIN_FINANCE'
    )
    or exists (
      select 1
      from public.caisse_rights r
      where r.user_id = auth.uid()
        and r.manage_restore
    );
$$;

revoke all on function public.caisse_can_restore_operations() from public;
grant execute on function public.caisse_can_restore_operations() to authenticated;

create or replace function public.caisse_list_voided_operations(p_limit integer default 100)
returns table (
  id uuid,
  op_number integer,
  kind text,
  op_date date,
  affectation text,
  buyer_name text,
  reference text,
  designation text,
  amount numeric,
  voided_at timestamptz,
  has_photo boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.caisse_can_restore_operations() then
    raise exception 'Accès réservé : restauration admin (ou droit délégué).' using errcode = 'P0001';
  end if;

  return query
  select
    o.id,
    o.op_number,
    o.kind,
    o.op_date,
    o.affectation,
    o.buyer_name,
    o.reference,
    coalesce(
      (
        select l.designation
        from public.caisse_lines l
        where l.operation_id = o.id
        order by l.line_no
        limit 1
      ),
      ''
    ) as designation,
    coalesce(
      (
        select sum(l.qty * l.unit_price)
        from public.caisse_lines l
        where l.operation_id = o.id
      ),
      0
    )::numeric as amount,
    o.voided_at,
    (o.photo_data is not null) as has_photo
  from public.caisse_operations o
  where o.voided_at is not null
  order by o.voided_at desc nulls last, o.op_date desc, o.id
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.caisse_list_voided_operations(integer) from public;
grant execute on function public.caisse_list_voided_operations(integer) to authenticated;

create or replace function public.caisse_restore_operation(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_op integer;
  v_ref text;
  v_aff text;
  v_pair text;
  r record;
begin
  if auth.uid() is null or not public.caisse_can_restore_operations() then
    raise exception 'Accès réservé : restauration admin (ou droit délégué).' using errcode = 'P0001';
  end if;

  select o.op_number, o.reference, o.affectation
    into v_op, v_ref, v_aff
  from public.caisse_operations o
  where o.id = p_id
    and o.voided_at is not null;
  if v_op is null then
    raise exception 'Opération supprimée introuvable.' using errcode = 'P0001';
  end if;

  update public.caisse_operations
  set voided_at = null
  where id = p_id
    and voided_at is not null;

  -- Restaurer la paire transfert acheteur si présente.
  if coalesce(v_aff, '') = 'TRANSFERT ACHETEUR' then
    v_pair := substring(coalesce(v_ref, '') from 'pair:([0-9a-f-]{36})');
    if v_pair is not null then
      for r in
        select o.id
        from public.caisse_operations o
        where o.voided_at is not null
          and o.affectation = 'TRANSFERT ACHETEUR'
          and o.reference like '%pair:' || v_pair || '%'
          and o.id <> p_id
      loop
        update public.caisse_operations
        set voided_at = null
        where id = r.id;
      end loop;
    end if;
  end if;

  perform public.caisse_renumber_active_operations();

  select o.op_number into v_op
  from public.caisse_operations o
  where o.id = p_id;

  return coalesce(v_op, 0);
end;
$$;

revoke all on function public.caisse_restore_operation(uuid) from public;
grant execute on function public.caisse_restore_operation(uuid) to authenticated;

commit;
