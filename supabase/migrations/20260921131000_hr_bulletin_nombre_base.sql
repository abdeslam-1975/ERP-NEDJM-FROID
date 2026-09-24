update public.hr_bulletin_settings
set layout = jsonb_set(coalesce(layout, '{}'::jsonb), '{col_nombre}', '"Nombre / Base"'::jsonb)
where id = '00000000-0000-0000-0000-000000000002';
