select e.matricule,
       s.days_worked, s.days_paid, s.days_leave, s.days_absence, s.days_weekend, s.days_abandon,
       (select count(*) from hr_attendance a where a.employee_id = s.employee_id and a.work_date between '2026-09-01' and '2026-09-30' and a.site_id = r.site_id) as att_cells
from hr_payroll_slips s
join hr_payroll_runs r on r.id = s.run_id
join hr_employees e on e.id = s.employee_id
where r.period_year = 2026 and r.period_month = 9
order by e.matricule;
