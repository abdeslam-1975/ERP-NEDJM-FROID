-- بطاقة العامل تظهر في الجدول فقط بعد تسجيلها من الشاشة.
-- العمال التجريبيون NF-0001..NF-0008 يبقون بلا تاريخ إلى أن تُحفظ بطاقتهم.

begin;

alter table public.hr_employees
  add column if not exists fiche_done_at timestamptz;

comment on column public.hr_employees.fiche_done_at is
  'Premier enregistrement de la fiche depuis l''écran Employés. Null = pas de carte réalisée.';

update public.hr_employees e
set fiche_done_at = case
  when e.matricule in (
    'NF-0001', 'NF-0002', 'NF-0003', 'NF-0004',
    'NF-0005', 'NF-0006', 'NF-0007', 'NF-0008'
  ) then e.updated_at
  else e.created_at
end
where e.fiche_done_at is null
  and (
    e.matricule not in (
      'NF-0001', 'NF-0002', 'NF-0003', 'NF-0004',
      'NF-0005', 'NF-0006', 'NF-0007', 'NF-0008'
    )
    or exists (
      select 1 from public.hr_employee_civil c where c.employee_id = e.id
    )
    or exists (
      select 1 from public.hr_employee_files f where f.employee_id = e.id
    )
  );

commit;
