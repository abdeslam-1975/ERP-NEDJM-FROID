-- Legend coefficient is a free weight (0,5, 1,5, …), not capped at 1.
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'ref_legendes'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%coefficient%';
  if cname is not null then
    execute format('alter table public.ref_legendes drop constraint %I', cname);
  end if;
end $$;

alter table public.ref_legendes
  drop constraint if exists ref_legendes_coefficient_range;

alter table public.ref_legendes
  add constraint ref_legendes_coefficient_range
  check (coefficient >= 0 and coefficient <= 999.999);
