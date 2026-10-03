-- PostgREST voyait hr_attendance_chain_skips comme table de jonction (PK composée de FK) :
-- l'embed hr_correspondences → hr_employees devenait ambigu. Clé technique + unicité.

begin;

alter table public.hr_attendance_chain_skips drop constraint if exists hr_attendance_chain_skips_pkey;
alter table public.hr_attendance_chain_skips add column if not exists id bigint generated always as identity;
alter table public.hr_attendance_chain_skips add primary key (id);

create unique index if not exists hr_attendance_chain_skips_uidx
  on public.hr_attendance_chain_skips (employee_id, site_id, work_date, correspondence_id);

notify pgrst, 'reload schema';

commit;
