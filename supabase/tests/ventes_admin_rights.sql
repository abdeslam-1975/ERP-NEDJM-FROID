-- Smoke checks for ventes admin (sal_rights / sal_lists). No Banque/Caisse asserts beyond intact screens.

do $$
begin
  if to_regclass('public.sal_rights') is null then
    raise exception 'sal_rights missing';
  end if;
  if to_regclass('public.sal_lists') is null then
    raise exception 'sal_lists missing';
  end if;
  if to_regclass('public.sal_settings') is null then
    raise exception 'sal_settings missing';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sal_is_admin'
  ) then
    raise exception 'sal_is_admin missing';
  end if;
  if not exists (select 1 from public.sys_screens where code = 'finance' and label_fr = 'Banque') then
    raise exception 'Banque screen was altered unexpectedly';
  end if;
  if not exists (select 1 from public.sys_screens where code = 'caisse' and label_fr = 'Caisse') then
    raise exception 'Caisse screen was altered unexpectedly';
  end if;
end $$;

select 'ventes_admin_ok' as status;
