-- Saving hung / rolled back because renumber ran INSIDE the INSERT trigger
-- (locks the whole table while the statement is still open), then again via RPC.
-- Renumber only after the write, serialized with an advisory lock.

begin;

drop trigger if exists trg_caisse_operations_renumber on public.caisse_operations;
drop function if exists public.caisse_operations_after_write_renumber();

create or replace function public.caisse_renumber_active_operations()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  -- One renumber at a time: concurrent saves no longer deadlock on op_number updates.
  perform pg_advisory_xact_lock(872314001);
  perform set_config('caisse.skip_guard', 'on', true);

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

revoke all on function public.caisse_renumber_active_operations() from public;
grant execute on function public.caisse_renumber_active_operations() to authenticated;

commit;
