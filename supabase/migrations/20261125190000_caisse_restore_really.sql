-- Fix restore: voided rows were not updatable under RLS (USING voided_at is null),
-- so caisse_restore_operation could return success while leaving voided_at set.
-- Also skip the business guard during the un-void pass (same flag as renumber).

begin;

-- Allow authenticated restorers to UPDATE voided rows (permissive policies are OR'd).
drop policy if exists caisse_operations_restore on public.caisse_operations;
create policy caisse_operations_restore on public.caisse_operations
  for update to authenticated
  using (
    voided_at is not null
    and public.caisse_can_restore_operations()
  )
  with check (
    voided_at is null
    and public.caisse_can_restore_operations()
  );

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
  v_count integer;
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
  if not found then
    raise exception 'Opération supprimée introuvable.' using errcode = 'P0001';
  end if;

  -- Bypass business guard while clearing voided_at (mirror renumber).
  perform set_config('caisse.skip_guard', 'on', true);

  update public.caisse_operations
  set
    voided_at = null,
    voided_by = null
  where id = p_id
    and voided_at is not null;

  get diagnostics v_count = row_count;
  if v_count < 1 then
    perform set_config('caisse.skip_guard', 'off', true);
    raise exception 'Restauration impossible (aucune ligne mise à jour).' using errcode = 'P0001';
  end if;

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
        set
          voided_at = null,
          voided_by = null
        where id = r.id
          and voided_at is not null;
      end loop;
    end if;
  end if;

  perform set_config('caisse.skip_guard', 'off', true);
  perform public.caisse_renumber_active_operations();

  select o.op_number into v_op
  from public.caisse_operations o
  where o.id = p_id
    and o.voided_at is null;
  if not found then
    raise exception 'Restauration échouée : l’opération est toujours en corbeille.' using errcode = 'P0001';
  end if;

  return coalesce(v_op, 0);
exception
  when others then
    perform set_config('caisse.skip_guard', 'off', true);
    raise;
end;
$$;

revoke all on function public.caisse_restore_operation(uuid) from public;
grant execute on function public.caisse_restore_operation(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
