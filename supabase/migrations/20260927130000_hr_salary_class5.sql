-- Class 5 = retenues (signed amounts). Replace the inline 1..4 check on hr_salary_rubriques.category.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.hr_salary_rubriques'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%category%'
  loop
    execute format('alter table public.hr_salary_rubriques drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.hr_salary_rubriques
  add constraint hr_salary_rubriques_category_check
  check (category in ('1', '2', '3', '4', '5'));

-- Signed amounts only for class 5 (retenues); other classes stay >= 0.
alter table public.hr_salary_rubriques
  drop constraint if exists hr_salary_rubriques_default_amount_sign;
alter table public.hr_salary_rubriques
  add constraint hr_salary_rubriques_default_amount_sign
  check (default_amount >= 0 or category = '5');
