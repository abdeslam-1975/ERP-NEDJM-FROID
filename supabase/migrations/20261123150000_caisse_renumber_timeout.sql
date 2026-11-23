-- Keep chronological op_number renumber reliable under authenticated 8s timeout.
-- SECURITY DEFINER alone does not raise the caller statement_timeout.

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

comment on function public.caisse_renumber_active_operations() is
  'Réordonne les N° actifs par op_date (puis created_at). À appeler après ajout/modif/suppression — y compris opérations oubliées. Les noms d’archive Bon_N… suivent le nouveau N°.';

commit;
