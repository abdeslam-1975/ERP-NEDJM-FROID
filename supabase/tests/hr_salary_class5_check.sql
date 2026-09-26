do $$
declare
  ok5 boolean := false;
  neg5 boolean := false;
  neg1_blocked boolean := false;
  cat6_blocked boolean := false;
begin
  insert into public.hr_salary_rubriques (code, label_ar, label_fr, nature, unit, category, cotisable, taxable, apply_scope, default_amount)
  values ('T501', 'اختبار', 'Test 501', 'retenue', 'month', '5', false, false, 'employee', 0);
  ok5 := true;

  insert into public.hr_salary_rubriques (code, label_ar, label_fr, nature, unit, category, cotisable, taxable, apply_scope, default_amount)
  values ('T502', 'اختبار', 'Test 502', 'retenue', 'month', '5', false, false, 'employee', -250);
  neg5 := true;

  begin
    insert into public.hr_salary_rubriques (code, label_ar, label_fr, nature, unit, category, cotisable, taxable, apply_scope, default_amount)
    values ('T101', 'اختبار', 'Test 101', 'indemnite', 'month', '1', true, true, 'employee', -1);
  exception when check_violation then
    neg1_blocked := true;
  end;

  begin
    insert into public.hr_salary_rubriques (code, label_ar, label_fr, nature, unit, category, cotisable, taxable, apply_scope, default_amount)
    values ('T601', 'اختبار', 'Test 601', 'indemnite', 'month', '6', false, false, 'employee', 0);
  exception when check_violation then
    cat6_blocked := true;
  end;

  raise exception 'RESULT: class5=% class5_negative=% class1_negative_blocked=% class6_blocked=%',
    ok5, neg5, neg1_blocked, cat6_blocked;
end $$;
