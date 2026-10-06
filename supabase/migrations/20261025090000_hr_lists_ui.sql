-- HR lists managed from Paramètres RH › Listes et codes instead of the code: leave kinds, exit
-- reasons, transport modes of the sheets, print defaults of each contract type, and the text printed
-- for the return of an open-ended ordre de mission. Seeds keep exactly what the code did.

begin;

-- ---------------------------------------------------------------------------
-- List kinds and the keys their `extra` understands
-- ---------------------------------------------------------------------------
insert into public.hr_catalog_kinds (code, label_ar, label_fr, extra_hint, sort_order) values
  ('leave_kind', 'نوع العطلة', 'Type de congé',
   '{"legend":"code de présence posé à l''approbation (CA, CM…)","annual":"true = décompté du solde de congé annuel"}', 180),
  ('exit_reason', 'سبب الخروج', 'Motif de sortie',
   '{"mise_en_demeure":"true = proposer les deux mises en demeure avant la sortie"}', 190)
on conflict (code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  extra_hint = excluded.extra_hint;

update public.hr_catalog_kinds
set extra_hint = '{"vehicle":"true = coche « véhicule de service » sur l''ordre de mission et le titre de congé"}'
where code = 'transport_mode';

update public.hr_catalog_kinds
set extra_hint = '{"allows_fixed_irg":"true = taux libératoire IRG autorisé pour ce type","interim":"true = mise à disposition (agence)","cdi":"true = contrat imprimé comme CDI","essai":"période d''essai imprimée","preavis":"préavis imprimé","cdd_reason":"n° du motif de CDD coché par défaut"}'
where code = 'contract_type';

-- ---------------------------------------------------------------------------
-- Seeds (were LEAVE_KINDS, EXIT_REASONS, OM_MOYENS and contractPrintDefaults in the code)
-- ---------------------------------------------------------------------------
insert into public.hr_catalogs (kind, code, label_ar, label_fr, extra, sort_order) values
  ('leave_kind', 'ANNUAL', 'عطلة سنوية', 'Congé annuel', '{"legend":"CA","annual":true}', 10),
  ('leave_kind', 'RECOVERY', 'عطلة تعويضية', 'Récupération', '{"legend":"CRP"}', 20),
  ('leave_kind', 'SICK', 'عطلة مرضية', 'Congé maladie', '{"legend":"CM"}', 30),
  ('leave_kind', 'UNPAID', 'عطلة بدون أجر', 'Congé sans solde', '{"legend":"CSS"}', 40),
  ('leave_kind', 'EXCEPTIONAL', 'غياب مرخص مدفوع', 'Absence autorisée payée', '{"legend":"AOP"}', 50),
  ('exit_reason', 'END_CDD', 'انتهاء مدة العقد', 'Fin de contrat (CDD)', '{}', 10),
  ('exit_reason', 'RESIGNATION', 'استقالة', 'Démission', '{}', 20),
  ('exit_reason', 'DISMISSAL', 'تسريح', 'Licenciement', '{}', 30),
  ('exit_reason', 'ABANDON', 'إهمال المنصب', 'Abandon de poste', '{"mise_en_demeure":true}', 40),
  ('exit_reason', 'MUTUAL', 'فسخ بالتراضي', 'Rupture à l''amiable', '{}', 50),
  ('exit_reason', 'TRIAL_END', 'إنهاء فترة التجربة', 'Fin de période d''essai', '{}', 60),
  ('exit_reason', 'RETIREMENT', 'تقاعد', 'Retraite', '{}', 70),
  ('exit_reason', 'DEATH', 'وفاة', 'Décès', '{}', 80),
  ('exit_reason', 'OTHER', 'أخرى', 'Autre', '{}', 90),
  ('transport_mode', 'TOUS', 'جميع وسائل النقل', 'Tous moyens de transport', '{}', 1),
  ('transport_mode', 'SERVICE', 'مركبة المصلحة', 'Véhicule de service', '{"vehicle":true}', 2)
on conflict (kind, code) do nothing;

-- The older transport seeds were never offered by the sheets: archived, so the choice stays the same.
update public.hr_catalogs
set is_active = false
where kind = 'transport_mode' and code in ('COMPANY', 'TAXI', 'PLANE', 'TRAIN');
update public.hr_catalogs
set extra = extra || '{"vehicle":true}'::jsonb
where kind = 'transport_mode' and code = 'COMPANY' and not extra ? 'vehicle';

-- Print defaults of the contract form (values already set on a type are kept).
update public.hr_catalogs
set extra = '{"essai":"شهرا واحدا","preavis":"ثلاثة أشهر","cdd_reason":5}'::jsonb || extra
where kind = 'contract_type';
update public.hr_catalogs
set extra = extra || '{"cdi":true}'::jsonb
where kind = 'contract_type' and code = 'CDI' and not extra ? 'cdi';

-- ---------------------------------------------------------------------------
-- Leave kinds and exit reasons are checked against the lists, not a fixed CHECK
-- ---------------------------------------------------------------------------
create or replace function public.hr_catalog_code_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text := tg_argv[0];
  v_col text := tg_argv[1];
  v_code text := to_jsonb(new) ->> v_col;
begin
  if tg_op = 'UPDATE' and (to_jsonb(old) ->> v_col) is not distinct from v_code then
    return new;
  end if;
  if not exists (
    select 1 from public.hr_catalogs c where c.kind = v_kind and c.code = v_code and c.is_active
  ) then
    raise exception 'Code « % » absent de la liste « % » (Paramètres RH › Listes et codes).', v_code, v_kind
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.hr_catalog_code_check() from public;

alter table public.hr_leave_requests drop constraint if exists hr_leave_requests_kind_check;
drop trigger if exists trg_hr_leave_requests_kind on public.hr_leave_requests;
create trigger trg_hr_leave_requests_kind
  before insert or update of kind on public.hr_leave_requests
  for each row execute function public.hr_catalog_code_check('leave_kind', 'kind');

alter table public.hr_employee_exits drop constraint if exists hr_employee_exits_reason_code_check;
drop trigger if exists trg_hr_employee_exits_reason on public.hr_employee_exits;
create trigger trg_hr_employee_exits_reason
  before insert or update of reason_code on public.hr_employee_exits
  for each row execute function public.hr_catalog_code_check('exit_reason', 'reason_code');

-- The attendance code of an approved leave comes from its leave kind (extra.legend).
create or replace function public.hr_leave_decide(p_id uuid, p_status text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.hr_leave_requests%rowtype;
  v_legend text;
  v_number text;
  v_corr uuid;
  v_uid uuid := auth.uid();
begin
  select * into r from public.hr_leave_requests where id = p_id for update;
  if not found then
    raise exception 'Demande introuvable.' using errcode = 'no_data_found';
  end if;

  if p_status = 'CANCELLED' and r.status = 'SUBMITTED' and r.requested_by = v_uid then
    null;
  elsif not public.erp_can_write_hr_salary_values(v_uid) then
    raise exception 'Décision réservée aux RH (SUPER_ADMIN, ADMIN_RH, GERANT).' using errcode = 'insufficient_privilege';
  end if;

  if not (
    (r.status = 'SUBMITTED' and p_status in ('APPROVED', 'REJECTED', 'CANCELLED'))
    or (r.status = 'APPROVED' and p_status = 'CANCELLED')
  ) then
    raise exception 'Transition % → % impossible.', r.status, p_status using errcode = 'check_violation';
  end if;

  if p_status = 'APPROVED' then
    select upper(nullif(btrim(c.extra ->> 'legend'), '')) into v_legend
    from public.hr_catalogs c
    where c.kind = 'leave_kind' and c.code = r.kind;
    if v_legend is null or not exists (select 1 from public.ref_legendes l where l.code = v_legend) then
      raise exception 'Type de congé « % » : code de présence (extra.legend) manquant ou inconnu (Paramètres RH › Listes et codes).', r.kind
        using errcode = 'check_violation';
    end if;
    v_number := public.hr_next_doc_number('LEAVE');
    insert into public.hr_correspondences
      (employee_id, site_id, type_code, number, status_code, start_date, end_date, payload, created_by)
    values
      (r.employee_id, null, 'LEAVE', v_number, 'ISSUED', r.start_date, r.end_date,
       jsonb_build_object('legend', v_legend, 'leave_request_id', r.id, 'kind', r.kind, 'days', r.days),
       v_uid)
    returning id into v_corr;
    update public.hr_leave_requests
    set status = 'APPROVED', decided_by = v_uid, decided_at = now(), decision_note = p_note,
        correspondence_id = v_corr
    where id = p_id;
    return v_corr;
  end if;

  if r.status = 'APPROVED' and r.correspondence_id is not null then
    update public.hr_correspondences set status_code = 'CANCELLED' where id = r.correspondence_id;
  end if;
  update public.hr_leave_requests
  set status = p_status, decided_by = v_uid, decided_at = now(), decision_note = p_note
  where id = p_id;
  return r.correspondence_id;
end;
$$;

revoke all on function public.hr_leave_decide(uuid, text, text) from public;
grant execute on function public.hr_leave_decide(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Return printed on an ordre de mission without return date (was « Fin de mission » in the code)
-- ---------------------------------------------------------------------------
alter table public.hr_company_profile
  add column if not exists mission_open_return text not null default '';
update public.hr_company_profile
set mission_open_return = 'Fin de mission'
where id = 'default' and mission_open_return = '';

commit;
