-- After a caisse operation is voided, renumber the remaining operations
-- 1..n by date so the journal stays contiguous (no holes like 3, 4).

begin;

create or replace function public.caisse_renumber_active_operations()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  -- Guard trigger needs a user session; disable only for this renumber pass.
  alter table public.caisse_operations disable trigger trg_caisse_operations_guard;

  -- Free 1..n: park voided rows on unique negative numbers.
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
  where o.id = numbered.id
    and o.op_number is distinct from -numbered.rn;

  -- Two-step renumber of active rows to avoid unique conflicts.
  with ordered as (
    select
      id,
      row_number() over (order by op_date, created_at, id) as rn
    from public.caisse_operations
    where voided_at is null
  )
  update public.caisse_operations o
  set op_number = 1000000000 + ordered.rn
  from ordered
  where o.id = ordered.id;

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

  alter table public.caisse_operations enable trigger trg_caisse_operations_guard;

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
    alter table public.caisse_operations enable trigger trg_caisse_operations_guard;
    raise;
end;
$$;

revoke all on function public.caisse_renumber_active_operations() from public;
grant execute on function public.caisse_renumber_active_operations() to authenticated;

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

  perform public.caisse_renumber_active_operations();
  return v_op;
end;
$$;

revoke all on function public.caisse_void_operation(uuid) from public;
grant execute on function public.caisse_void_operation(uuid) to authenticated;

-- Repair current gaps (e.g. active N° 3 and 4 with voids above/below).
select public.caisse_renumber_active_operations();

commit;
