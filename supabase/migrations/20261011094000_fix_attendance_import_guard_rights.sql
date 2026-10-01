-- The import guard on hr_attendance runs as the user who writes the row, and calls hr_attendance_import_flag(),
-- which users may not execute (lot 5). Every grid save was refused with
-- "permission denied for function hr_attendance_import_flag". The guard now runs as its owner: it only reads
-- the import flag of the current transaction and the row being written, so its decisions are unchanged.
alter function public.hr_attendance_import_row_guard() security definer;
alter function public.hr_attendance_import_row_guard() set search_path = public, pg_temp;
revoke all on function public.hr_attendance_import_row_guard() from public, anon, authenticated;
