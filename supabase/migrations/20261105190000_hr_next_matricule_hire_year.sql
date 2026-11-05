-- Next number of a hire year: max + 1, holes stay empty, existing width is kept.
-- 10/07 is the tenth hiring of 2007. The year comes from the hire date when one is given.
-- The old function with no argument remains, so a call without a date still uses today.

create or replace function public.hr_next_matricule(p_hired_at date)
returns text
language plpgsql
stable
as $$
declare
  yy text := to_char(p_hired_at, 'YY');
  max_n integer := 0;
  width integer := 2;
  m text;
  serial text;
begin
  for m in
    select btrim(matricule)
    from public.hr_employees
    where btrim(matricule) ~ '^[0-9]+/[0-9]{2}$'
      and right(btrim(matricule), 2) = yy
  loop
    serial := split_part(m, '/', 1);
    max_n := greatest(max_n, serial::integer);
    width := greatest(width, char_length(serial));
  end loop;
  return lpad((max_n + 1)::text, greatest(width, 2), '0') || '/' || yy;
end;
$$;

create or replace function public.hr_next_matricule()
returns text
language plpgsql
stable
as $$
begin
  return public.hr_next_matricule((now() at time zone 'Africa/Algiers')::date);
end;
$$;

grant execute on function public.hr_next_matricule(date) to authenticated;
grant execute on function public.hr_next_matricule() to authenticated;
