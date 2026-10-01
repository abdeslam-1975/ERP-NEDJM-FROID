-- Audit (open point): transfer batches and interim statements took their number from hr_next_doc_number,
-- which only counts correspondences. Each register now has its own yearly counter. A number is reserved
-- by a committed increment, so two simultaneous creations never receive the same one (a failed creation
-- leaves a gap). Same "NNNNNN/YY" format; the counter starts after the highest number already used in
-- the register. hr_next_doc_number (correspondences) is unchanged.

create table public.hr_register_counters (
  register text not null check (register in ('VIR', 'ITM')),
  yy text not null check (yy ~ '^[0-9]{2}$'),
  last_no integer not null check (last_no > 0),
  updated_at timestamptz not null default now(),
  primary key (register, yy)
);

alter table public.hr_register_counters enable row level security;
revoke all on table public.hr_register_counters from public, anon, authenticated;
grant select on table public.hr_register_counters to service_role;

create function public.hr_next_register_number(p_register text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_yy text := to_char((now() at time zone 'Africa/Algiers'), 'YY');
  v_used integer;
  v_no integer;
begin
  if v_uid is not null and not public.erp_can_write_hr_salary_values(v_uid) then
    raise exception 'Numérotation réservée aux gestionnaires de la paie.' using errcode = 'insufficient_privilege';
  end if;

  if p_register = 'VIR' then
    select max(split_part(batch_no, '/', 1)::integer) into v_used
    from public.hr_payroll_transfer_batches where batch_no ~ ('^[0-9]+/' || v_yy || '$');
  elsif p_register = 'ITM' then
    select max(split_part(statement_no, '/', 1)::integer) into v_used
    from public.hr_interim_statements where statement_no ~ ('^[0-9]+/' || v_yy || '$');
  else
    raise exception 'Registre inconnu : %', p_register using errcode = 'check_violation';
  end if;

  insert into public.hr_register_counters as c (register, yy, last_no)
  values (p_register, v_yy, coalesce(v_used, 0) + 1)
  on conflict (register, yy) do update
    set last_no = greatest(c.last_no, coalesce(v_used, 0)) + 1, updated_at = now()
  returning last_no into v_no;

  return lpad(v_no::text, 6, '0') || '/' || v_yy;
end;
$$;

revoke execute on function public.hr_next_register_number(text) from public, anon;
grant execute on function public.hr_next_register_number(text) to authenticated, service_role;

notify pgrst, 'reload schema';
