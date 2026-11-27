-- The pointage net formula is stored here and edited from Paramètres → Feuille de présence.
-- PMS adds the presence daily rate, CRP the recovery daily rate, SANCTION subtracts the presence daily rate, NONE is classified and pays nothing.

begin;

create table if not exists public.hr_pointage_net_rules (
  code text primary key,
  effect text not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint hr_pointage_net_rules_code_chk check (code ~ '^[A-Z0-9][A-Z0-9/_-]{0,15}$'),
  constraint hr_pointage_net_rules_effect_chk check (effect in ('PMS', 'CRP', 'SANCTION', 'NONE'))
);

insert into public.hr_pointage_net_rules (code, effect, sort_order)
values
  ('P', 'PMS', 10),
  ('MS', 'PMS', 20),
  ('AOP', 'PMS', 30),
  ('BC', 'PMS', 40),
  ('W', 'PMS', 50),
  ('JF', 'PMS', 60),
  ('CRP', 'CRP', 70),
  ('AN', 'SANCTION', 80)
on conflict (code) do nothing;

alter table public.hr_pointage_net_rules enable row level security;

drop policy if exists hr_pointage_net_rules_read on public.hr_pointage_net_rules;
create policy hr_pointage_net_rules_read on public.hr_pointage_net_rules
  for select to authenticated using (true);

drop policy if exists hr_pointage_net_rules_write on public.hr_pointage_net_rules;
create policy hr_pointage_net_rules_write on public.hr_pointage_net_rules
  for all to authenticated
  using (public.erp_has_perm('hr_settings', 'update', null))
  with check (public.erp_has_perm('hr_settings', 'update', null));

grant select, insert, update, delete on public.hr_pointage_net_rules to authenticated;

create or replace function public.hr_pointage_net_rules_save(p_rules jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  if not public.erp_has_perm('hr_settings', 'update', null) then
    raise exception 'Réservé aux paramètres RH. · محصور في إعدادات الموارد البشرية.';
  end if;
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    raise exception 'Formule invalide.';
  end if;
  delete from public.hr_pointage_net_rules where code is not null;
  insert into public.hr_pointage_net_rules (code, effect, sort_order, updated_by)
  select
    upper(btrim(item->>'code')),
    item->>'effect',
    ordinality::integer * 10,
    auth.uid()
  from jsonb_array_elements(p_rules) with ordinality as t(item, ordinality)
  where coalesce(btrim(item->>'code'), '') <> '';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.hr_pointage_net_rules_save(jsonb) from public, anon;
grant execute on function public.hr_pointage_net_rules_save(jsonb) to authenticated;

create or replace function public.hr_pointage_formula_notify(p_code text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_title text;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    return;
  end if;
  if v_code = '' then
    return;
  end if;
  if exists (
    select 1 from public.hr_pointage_net_rules r where r.code = v_code
  ) then
    return;
  end if;
  if not exists (
    select 1 from public.ref_legendes l
    where upper(l.code) = v_code and l.is_active
  ) then
    return;
  end if;
  v_title := left(format('Net du pointage : code %s', v_code), 200);
  if exists (
    select 1 from public.sys_notifications n
    where n.kind = 'POINTAGE_FORMULA' and n.title = v_title
  ) then
    return;
  end if;
  perform public.sys_notify(
    'POINTAGE_FORMULA',
    v_title,
    left(format(
      'Le code %s n''est pas dans la formule du net. Classez-le dans Paramètres → Feuille de présence. · الرمز %s غير داخل في معادلة الصافي. صنّفه من الإعدادات ← ورقة الحضور.',
      v_code, v_code
    ), 1000),
    '/parametres/rh/presence',
    null,
    'hr_settings',
    null
  );
end;
$$;

revoke all on function public.hr_pointage_formula_notify(text) from public, anon, authenticated;

commit;
