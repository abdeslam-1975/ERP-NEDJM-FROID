-- Pointage net is computed on the grid. A legend outside the formula raises one notice.

begin;

update public.hr_attendance_column_roles r
set can_edit = false
from public.hr_attendance_columns c
where c.id = r.column_id
  and c.code = 'NET_A_PAYER';

alter table public.sys_notifications drop constraint if exists sys_notifications_kind_check;
alter table public.sys_notifications add constraint sys_notifications_kind_check
  check (kind in (
    'DECISION_PENDING', 'DECISION_TAKEN', 'DECISION_INVALIDATED',
    'ATTENDANCE_IMPORT', 'LEGAL_WATCH', 'POINTAGE_FORMULA'
  ));

-- Keep this list aligned with POINTAGE_NET_CODES in src/lib/hr/pointage-net.ts.
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
  if v_code = '' or v_code in ('P', 'MS', 'AOP', 'BC', 'W', 'JF', 'CRP', 'AN') then
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
      'Le code %s n''est pas dans la formule du net à payer du pointage. Réécrire la formule et la généraliser. · الرمز %s غير داخل في معادلة الراتب الصافي. أعد كتابة المعادلة وعمّمها.',
      v_code, v_code
    ), 1000),
    '/rh/presence',
    null,
    'hr_settings',
    null
  );
end;
$$;

revoke all on function public.hr_pointage_formula_notify(text) from public, anon, authenticated;

create or replace function public.hr_attendance_formula_alert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(btrim(coalesce(new.legend_code, '')));
begin
  if tg_op = 'UPDATE' and upper(btrim(coalesce(old.legend_code, ''))) = v_code then
    return new;
  end if;
  perform public.hr_pointage_formula_notify(v_code);
  return new;
end;
$$;

drop trigger if exists trg_hr_attendance_formula_alert on public.hr_attendance;
create trigger trg_hr_attendance_formula_alert
  after insert or update of legend_code on public.hr_attendance
  for each row execute function public.hr_attendance_formula_alert();

create or replace function public.hr_pointage_net_rates(
  p_site uuid,
  p_year integer,
  p_month integer
)
returns table (
  employee_id uuid,
  net_ref numeric,
  net_recup numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_start date;
  v_end date;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if p_year is null or p_month is null or p_month not between 1 and 12 then
    raise exception 'Période invalide.' using errcode = 'check_violation';
  end if;
  if p_site is null or not public.erp_can_see_site(p_site, v_uid) then
    raise exception 'Chantier hors de votre périmètre.' using errcode = 'insufficient_privilege';
  end if;
  if not public.hr_att_col_allowed('NET_A_PAYER', false, p_site, v_uid) then
    return;
  end if;
  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + interval '1 month - 1 day')::date;
  return query
  select distinct on (c.employee_id)
    c.employee_id,
    c.salaire_net_ref_monthly,
    c.salaire_net_recup_monthly
  from public.hr_contracts c
  where c.site_id = p_site
    and c.start_date <= v_end
    and (c.end_date is null or c.end_date >= v_start)
  order by c.employee_id, c.start_date desc;
end;
$$;

revoke all on function public.hr_pointage_net_rates(uuid, integer, integer) from public, anon;
grant execute on function public.hr_pointage_net_rates(uuid, integer, integer) to authenticated;

commit;
