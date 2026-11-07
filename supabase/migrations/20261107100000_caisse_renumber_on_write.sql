-- Renumber active caisse operations by real op_date after every insert
-- or date change, so a late entry for an older day takes its chronological N°.

begin;

create or replace function public.caisse_operations_after_write_renumber()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Statement-level: one renumber per INSERT / UPDATE OF op_date.
  -- Updates that only change op_number (the renumber itself) do not fire
  -- this trigger, so there is no recursion.
  perform public.caisse_renumber_active_operations();
  return null;
end;
$$;

drop trigger if exists trg_caisse_operations_renumber on public.caisse_operations;
create trigger trg_caisse_operations_renumber
  after insert or update of op_date
  on public.caisse_operations
  for each statement
  execute function public.caisse_operations_after_write_renumber();

revoke all on function public.caisse_operations_after_write_renumber() from public;

-- Fix current gaps / late back-dated entries (e.g. 01/11 still numbered 3).
select public.caisse_renumber_active_operations();

commit;
