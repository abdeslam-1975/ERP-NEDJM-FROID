-- Deleting a caisse operation sets voided_at. The row then fails the
-- SELECT policy (voided rows stay hidden). Postgres reports that as
-- "new row violates row-level security policy" on the update, including
-- for a super admin. The void runs as the table owner instead.

begin;

create or replace function public.caisse_void_operation(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  f record;
  v_op integer;
begin
  if auth.uid() is null or not public.fin_can_access('read', null) then
    raise exception 'Accès caisse refusé.' using errcode = 'P0001';
  end if;
  select * into f from public.caisse_flags() limit 1;
  if not found or not (f.is_admin or f.can_edit) then
    raise exception 'Accès réservé : droit Modifier/Supprimer requis.' using errcode = 'P0001';
  end if;

  select o.op_number into v_op
  from public.caisse_operations o
  where o.id = p_id
    and o.voided_at is null;
  if v_op is null then
    raise exception 'Opération introuvable.' using errcode = 'P0001';
  end if;

  update public.caisse_operations
  set voided_at = now()
  where id = p_id
    and voided_at is null;
  return v_op;
end;
$$;

revoke all on function public.caisse_void_operation(uuid) from public;
grant execute on function public.caisse_void_operation(uuid) to authenticated;

commit;
