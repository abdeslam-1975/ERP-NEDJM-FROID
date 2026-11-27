-- Replace the worker register in one transaction. The uploaded file becomes the database.

create or replace function public.hr_worker_register_replace(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted integer;
begin
  if not public.erp_has_perm('employees', 'update', null) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'empty register';
  end if;

  delete from public.hr_worker_register;

  insert into public.hr_worker_register (
    line_no, matricule, last_name, first_name, birth_date, birth_place,
    sex, poste, hired_at, ended_at, nss, status
  )
  select
    row_number() over (order by (item->>'hired_at')::date, item->>'matricule')::integer,
    item->>'matricule',
    item->>'last_name',
    nullif(item->>'first_name', ''),
    nullif(item->>'birth_date', '')::date,
    nullif(item->>'birth_place', ''),
    nullif(item->>'sex', ''),
    nullif(item->>'poste', ''),
    (item->>'hired_at')::date,
    nullif(item->>'ended_at', '')::date,
    nullif(item->>'nss', ''),
    item->>'status'
  from jsonb_array_elements(p_rows) as item;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.hr_worker_register_replace(jsonb) from public, anon;
grant execute on function public.hr_worker_register_replace(jsonb) to authenticated;
