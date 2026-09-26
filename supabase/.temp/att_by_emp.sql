select e.matricule, a.legend_code, count(*) as n
from hr_attendance a
join hr_employees e on e.id = a.employee_id
where a.work_date between '2026-09-01' and '2026-09-30'
  and a.site_id = 'ca76c276-d461-4e1e-98b9-d3dd734064f9'
group by e.matricule, a.legend_code
order by e.matricule, n desc;
