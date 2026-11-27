-- The pointage grid no longer shows coefficient, contract start, or overtime hour columns.
begin;

update public.hr_attendance_columns
set is_active = false
where code in ('COEF', 'DEBUT_CONTRAT', 'HS50', 'HS75', 'HS100');

commit;
