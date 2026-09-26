select legend_code, count(*) as n
from public.hr_attendance
where work_date >= '2026-09-01' and work_date <= '2026-09-30'
  and site_id = 'ca76c276-d461-4e1e-98b9-d3dd734064f9'
group by legend_code
order by n desc;
