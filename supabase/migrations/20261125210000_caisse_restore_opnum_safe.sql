-- Restauration sûre pour op_number + cohérence Bon_N{op}.
-- 1) Park TOUTES les lignes avant tout changement
-- 2) Un-void
-- 3) Réordonne actifs 1..n par date (comme après suppression)
--    → le libellé archive Bon_N{op}_MOIS suit le nouveau N° (photo reste sur la ligne).

begin;

create or replace function public.caisse_renumber_active_operations()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '60s'
set lock_timeout = '15s'
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(872314001);
  perform set_config('caisse.skip_guard', 'on', true);

  -- Étape A : tous les N° sur des slots uniques (hors 1..n et -1..-n).
  with all_ops as (
    select id, row_number() over (order by id) as rn
    from public.caisse_operations
  )
  update public.caisse_operations o
  set op_number = -1500000000 - all_ops.rn
  from all_ops
  where o.id = all_ops.id;

  -- Étape B : voidées → -1 .. -n
  with numbered as (
    select
      id,
      row_number() over (order by voided_at nulls last, created_at, id) as rn
    from public.caisse_operations
    where voided_at is not null
  )
  update public.caisse_operations o
  set op_number = -numbered.rn
  from numbered
  where o.id = numbered.id;

  -- Étape C : actives → 1 .. n (ordre chronologique = même règle que le journal / Bon_N)
  with ordered as (
    select
      id,
      row_number() over (order by op_date, created_at, id) as rn
    from public.caisse_operations
    where voided_at is null
  )
  update public.caisse_operations o
  set op_number = ordered.rn
  from ordered
  where o.id = ordered.id;

  perform set_config('caisse.skip_guard', 'off', true);

  select count(*)::integer into v_count
  from public.caisse_operations
  where voided_at is null;

  if v_count = 0 then
    perform setval('public.caisse_op_seq', 1, false);
  else
    perform setval('public.caisse_op_seq', v_count, true);
  end if;

  return v_count;
exception
  when others then
    perform set_config('caisse.skip_guard', 'off', true);
    raise;
end;
$$;

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

  -- Même verrou que le renumber : pas de collision concurrente.
  perform pg_advisory_xact_lock(872314001);
  perform set_config('caisse.skip_guard', 'on', true);

  -- Park TOUT le monde d'abord (évite caisse_operations_op_number_key).
  with all_ops as (
    select id, row_number() over (order by id) as rn
    from public.caisse_operations
  )
  update public.caisse_operations o
  set op_number = -1500000000 - all_ops.rn
  from all_ops
  where o.id = all_ops.id;

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

  -- Réordonne : voidées -1..-n, actives 1..n par date → Bon_N{op} aligné.
  with numbered as (
    select
      id,
      row_number() over (order by voided_at nulls last, created_at, id) as rn
    from public.caisse_operations
    where voided_at is not null
  )
  update public.caisse_operations o
  set op_number = -numbered.rn
  from numbered
  where o.id = numbered.id;

  with ordered as (
    select
      id,
      row_number() over (order by op_date, created_at, id) as rn
    from public.caisse_operations
    where voided_at is null
  )
  update public.caisse_operations o
  set op_number = ordered.rn
  from ordered
  where o.id = ordered.id;

  select count(*)::integer into v_count
  from public.caisse_operations
  where voided_at is null;

  if v_count = 0 then
    perform setval('public.caisse_op_seq', 1, false);
  else
    perform setval('public.caisse_op_seq', v_count, true);
  end if;

  perform set_config('caisse.skip_guard', 'off', true);

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

revoke all on function public.caisse_renumber_active_operations() from public;
grant execute on function public.caisse_renumber_active_operations() to authenticated;
revoke all on function public.caisse_restore_operation(uuid) from public;
grant execute on function public.caisse_restore_operation(uuid) to authenticated;

-- Répare l’état actuel des N° (journal + noms Bon_N…).
select public.caisse_renumber_active_operations();

commit;

notify pgrst, 'reload schema';
