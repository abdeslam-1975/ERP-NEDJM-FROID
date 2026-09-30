-- Lot 6 — Préparation de la paie par mois (D1) et coefficients de présence datés (D14)
--   1. Tableau de préparation d'un mois (lecture seule) : règles légales (en attente / non vérifiées), coefficients,
--      présences (proposées, validées, imports en cours, contrats sans présence validée), qualité des données (début de
--      contrat, wilaya du chantier), décisions ouvertes du mois, mois précédent, simulations. Le lancement de la paie
--      reste manuel (D4).
--   2. D1 « Paie d'un mois dont les règles ne sont pas toutes approuvées » : une proposition de règle SOUMISE, ou
--      APPROUVÉE mais pas encore appliquée, qui concerne le mois (ou un mois antérieur) bloque la génération réelle et
--      la validation de la paie. Les valeurs héritées non vérifiées restent un avertissement. Options : attendre, ou
--      simulation non validable « règles non approuvées », conservée dans des tables séparées, jamais bulletin, virement,
--      déclaration ni coût.
--   3. D14 « Coefficient d'un code de présence modifié » : le coefficient devient daté (versions par mois d'effet).
--      Une modification passe par une demande ; le décideur choisit d'appliquer à partir du mois indiqué (jamais un mois
--      déjà validé ou clôturé) ou de refuser. Les brouillons de paie concernés sont signalés (D3). Aucun effet sans
--      décision.

begin;

-- ---------------------------------------------------------------------------
-- 1. Rights matrix
-- ---------------------------------------------------------------------------
insert into public.sys_screens (code, path, module, label_fr, label_ar, sort_order) values
  ('hr_payroll_preparation', '/rh/paie/preparation', 'rh',
   'Préparation de la paie par mois · consulter le tableau (lire), demander D1 ou une simulation (modifier)',
   'تحضير الأجور الشهرية', 305),
  ('decision_payroll_unapproved_rules', '/decisions?type=D1', 'decisions',
   'Décision D1 · Paie d''un mois dont les règles ne sont pas toutes approuvées (classe : ordinaire)', null, 67),
  ('decision_attendance_coefficient', '/decisions?type=D14', 'decisions',
   'Décision D14 · Coefficient d''un code de présence : demander (créer), choisir le mois d''effet (modifier)', null, 68)
on conflict (code) do nothing;

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select r.id, s.id, true, true, true, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code = 'SUPER_ADMIN'
  and s.code in ('hr_payroll_preparation', 'decision_payroll_unapproved_rules', 'decision_attendance_coefficient')
on conflict (role_id, screen_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Decision types
-- ---------------------------------------------------------------------------
insert into public.sys_decision_types (code, label_fr, description_fr, risk_class, policy_allowed, screen_code, options) values
  ('D1', 'Paie d''un mois dont les règles ne sont pas toutes approuvées',
   'Une règle légale du mois (ou d''un mois antérieur) attend son approbation ou sa date d''application (D2). Une règle '
   'non approuvée n''est jamais appliquée à une paie réelle : la génération et la validation restent bloquées.',
   'ORDINARY', false, 'decision_payroll_unapproved_rules',
   jsonb_build_array(
     jsonb_build_object('code', 'WAIT', 'label_fr', 'Attendre l''approbation des règles',
       'consequence_fr', 'Rien n''est calculé. La génération de la paie de ce mois reste bloquée jusqu''à ce que les '
         'règles en attente soient appliquées (D2), rejetées ou retirées.',
       'executes', false),
     jsonb_build_object('code', 'SIMULATE', 'label_fr', 'Calculer une simulation non validable',
       'consequence_fr', 'Une simulation « règles non approuvées » est calculée avec les seules règles déjà en vigueur '
         '(les propositions en attente ne sont pas appliquées). Elle est conservée à part : jamais validée, payée, '
         'virée, déclarée ni comptée dans les coûts. Aucune paie réelle n''est créée.',
       'executes', true)
   )),
  ('D14', 'Coefficient d''un code de présence modifié',
   'Le coefficient d''un code de présence change. Il est versionné par mois d''effet : les mois déjà validés ou '
   'clôturés gardent l''ancien coefficient ; les brouillons de paie concernés sont signalés pour recalcul (D3).',
   'ORDINARY', false, 'decision_attendance_coefficient',
   jsonb_build_array(
     jsonb_build_object('code', 'APPLY', 'label_fr', 'Appliquer à partir du mois demandé',
       'consequence_fr', 'Le nouveau coefficient s''applique à partir du mois d''effet indiqué dans la demande. Les '
         'brouillons de paie de ce mois et des mois suivants qui utilisent ce code sont signalés (D3) ; aucun bulletin '
         'n''est recalculé automatiquement.',
       'executes', true),
     jsonb_build_object('code', 'REFUSE', 'label_fr', 'Refuser',
       'consequence_fr', 'Le coefficient reste inchangé pour tous les mois.',
       'executes', false)
   ))
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Simulations (D1) — separate tables, never bulletins
-- ---------------------------------------------------------------------------
create table if not exists public.hr_payroll_simulations (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null unique references public.sys_decisions(id),
  period_year integer not null check (period_year between 2000 and 2100),
  period_month integer not null check (period_month between 1 and 12),
  site_id uuid references public.ref_sites(id),
  status text not null default 'RULES_NOT_APPROVED' check (status = 'RULES_NOT_APPROVED'),
  blockers jsonb not null default '[]'::jsonb check (jsonb_typeof(blockers) = 'array'),
  legacy jsonb not null default '{}'::jsonb check (jsonb_typeof(legacy) = 'object'),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  slip_count integer not null default 0 check (slip_count >= 0),
  totals jsonb not null default '{}'::jsonb check (jsonb_typeof(totals) = 'object'),
  created_by uuid not null references public.sys_users(id),
  created_at timestamptz not null default now()
);
create index if not exists hr_payroll_simulations_period_idx
  on public.hr_payroll_simulations (period_year, period_month, site_id, created_at desc);

create table if not exists public.hr_payroll_simulation_slips (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.hr_payroll_simulations(id),
  employee_id uuid not null references public.hr_employees(id),
  contract_id uuid references public.hr_contracts(id),
  site_id uuid references public.ref_sites(id),
  days_paid numeric(8,2) not null default 0,
  gross_amount numeric(14,2) not null default 0,
  employee_ss numeric(14,2) not null default 0,
  employer_ss numeric(14,2) not null default 0,
  irg_amount numeric(14,2) not null default 0,
  net_payable numeric(14,2) not null default 0,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  unique (simulation_id, employee_id)
);

-- Written once by hr_payroll_simulation_save, then frozen.
create or replace function public.hr_payroll_simulation_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' and coalesce(current_setting('hr.payroll_simulation', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE' and tg_table_name = 'hr_payroll_simulations'
     and coalesce(current_setting('hr.payroll_simulation', true), '') = 'on' then
    return new;
  end if;
  raise exception 'Simulation de paie : enregistrement figé, écrit uniquement par l''exécution de la décision D1.'
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists trg_hr_payroll_simulations_guard on public.hr_payroll_simulations;
create trigger trg_hr_payroll_simulations_guard
  before insert or update or delete on public.hr_payroll_simulations
  for each row execute function public.hr_payroll_simulation_guard();

drop trigger if exists trg_hr_payroll_simulation_slips_guard on public.hr_payroll_simulation_slips;
create trigger trg_hr_payroll_simulation_slips_guard
  before insert or update or delete on public.hr_payroll_simulation_slips
  for each row execute function public.hr_payroll_simulation_guard();

drop trigger if exists trg_hr_payroll_simulations_audit on public.hr_payroll_simulations;
create trigger trg_hr_payroll_simulations_audit
  after insert on public.hr_payroll_simulations
  for each row execute function public.sys_audit_row_change();

alter table public.hr_payroll_simulations enable row level security;
alter table public.hr_payroll_simulation_slips enable row level security;

drop policy if exists hr_payroll_simulations_read on public.hr_payroll_simulations;
create policy hr_payroll_simulations_read on public.hr_payroll_simulations
  for select to authenticated
  using (
    public.erp_can_read_hr_salary(auth.uid())
    and (site_id is null or public.erp_can_see_site(site_id, auth.uid()))
  );

drop policy if exists hr_payroll_simulation_slips_read on public.hr_payroll_simulation_slips;
create policy hr_payroll_simulation_slips_read on public.hr_payroll_simulation_slips
  for select to authenticated
  using (
    public.erp_can_read_hr_salary(auth.uid())
    and exists (
      select 1 from public.hr_payroll_simulations s
      where s.id = simulation_id and (s.site_id is null or public.erp_can_see_site(s.site_id, auth.uid()))
    )
    and (site_id is null or public.erp_can_see_site(site_id, auth.uid()))
  );

revoke all on public.hr_payroll_simulations from anon;
revoke all on public.hr_payroll_simulation_slips from anon;
revoke insert, update, delete, truncate on public.hr_payroll_simulations from authenticated;
revoke insert, update, delete, truncate on public.hr_payroll_simulation_slips from authenticated;

-- ---------------------------------------------------------------------------
-- 4. D1 — rules of the month
-- ---------------------------------------------------------------------------
-- Proposals that block a real payroll of the month: submitted, or approved without application yet, concerning the
-- month or an earlier one (month asked in the open D2 request, otherwise the month requested on the proposal).
create or replace function public.hr_month_rule_blockers(p_month date)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'proposal_id', x.id,
      'title', x.title,
      'family', x.family,
      'action', x.action,
      'status', x.status,
      'month', x.concerned,
      'application_decision_id', x.d2_id
    ) order by x.concerned, x.title, x.id), '[]'::jsonb)
  from (
    select p.id, p.title, p.family, p.action, p.status, d2.id as d2_id,
           coalesce((d2.scope->>'month')::date, p.requested_month) as concerned
    from public.ref_rule_proposals p
    left join lateral (
      select d.id, d.scope
      from public.sys_decisions d
      where d.dedupe_key = 'D2:' || p.id::text and d.status in ('PENDING', 'DECIDED')
      order by d.requested_at desc
      limit 1
    ) d2 on true
    where p.status in ('SUBMITTED', 'APPROVED') and p.action <> 'VERIFY'
  ) x
  where x.concerned is not null
    and x.concerned <= date_trunc('month', p_month)::date;
$$;

-- Values in force for the month that were never confirmed by an approved proposal (warning only).
create or replace function public.hr_month_legacy_rules(p_month date)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'legal_vars', coalesce((
      select jsonb_agg(jsonb_build_object('code', g.key, 'label', g.label_fr, 'from', v.effective_from)
                       order by g.sort_order, g.key)
      from public.ref_global_var_versions v
      join public.ref_global_vars g on g.id = v.var_id
      where v.proposal_id is null
        and v.effective_from <= p_month
        and (v.effective_to is null or v.effective_to >= p_month)
    ), '[]'::jsonb),
    'cnas_rates', coalesce((
      select jsonb_agg(jsonb_build_object('code', c.code, 'label', c.label_fr, 'from', r.effective_from)
                       order by c.code)
      from public.hr_social_profile_rates r
      join public.hr_catalogs c on c.id = r.profile_id
      where r.proposal_id is null
        and r.effective_from <= p_month
        and (r.effective_to is null or r.effective_to >= p_month)
    ), '[]'::jsonb),
    'irg_bareme', coalesce((
      select jsonb_agg(jsonb_build_object('code', b.code, 'from', b.effective_from) order by b.code)
      from public.ref_bareme_irg_versions b
      where b.status = 'LEGACY'
        and b.effective_from <= p_month
        and (b.effective_to is null or b.effective_to >= p_month)
    ), '[]'::jsonb),
    'irg_rules', coalesce((
      select jsonb_agg(jsonb_build_object('code', s.code, 'category', s.taxpayer_category::text, 'from', s.effective_from)
                       order by s.code)
      from public.ref_irg_rule_sets s
      where s.status = 'LEGACY'
        and s.effective_from <= p_month
        and (s.effective_to is null or s.effective_to >= p_month)
    ), '[]'::jsonb)
  );
$$;

create or replace function public.hr_payroll_d1_fingerprint(p_site uuid, p_year integer, p_month integer)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(
    public.hr_month_rule_blockers(make_date(p_year, p_month, 1))::text
    || '|' || coalesce(public.hr_payroll_generation_fingerprint(p_site, p_year, p_month), '')
  );
$$;

create or replace function public.hr_payroll_d1_context(p_site uuid, p_year integer, p_month integer)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'site_name', coalesce((select s.name_fr from public.ref_sites s where s.id = p_site), 'Tous les chantiers'),
    'period_nature', public.sys_period_nature(p_year, p_month),
    'blockers', public.hr_month_rule_blockers(make_date(p_year, p_month, 1)),
    'legacy', public.hr_month_legacy_rules(make_date(p_year, p_month, 1)),
    'run_status', (
      select r.status_code from public.hr_payroll_runs r
      where r.period_year = p_year and r.period_month = p_month and r.site_id is not distinct from p_site
    ),
    'attendance_days', (
      select count(*) from public.hr_attendance a
      where a.work_date between make_date(p_year, p_month, 1)
                            and (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date
        and (p_site is null or a.site_id = p_site)
        and a.status_code = 'VALIDATED'
    ),
    'simulations', (
      select count(*) from public.hr_payroll_simulations s
      where s.period_year = p_year and s.period_month = p_month and s.site_id is not distinct from p_site
    )
  );
$$;

-- Returns the open (or already settled with the same fingerprint) D1 request, or null when no rule blocks the month.
create or replace function public.hr_payroll_d1_request_internal(
  p_site uuid,
  p_year integer,
  p_month integer,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start date := make_date(p_year, p_month, 1);
  v_key text;
  v_open public.sys_decisions%rowtype;
  v_fp text;
  v_ctx jsonb;
  v_id uuid;
  v_site_name text;
begin
  if jsonb_array_length(public.hr_month_rule_blockers(v_start)) = 0 then
    return null;
  end if;
  v_key := format('D1:%s:%s', to_char(v_start, 'YYYY-MM'), coalesce(p_site::text, 'ALL'));
  v_fp := public.hr_payroll_d1_fingerprint(p_site, p_year, p_month);
  v_ctx := public.hr_payroll_d1_context(p_site, p_year, p_month);

  select * into v_open from public.sys_decisions
  where dedupe_key = v_key and status in ('PENDING', 'DECIDED')
  for update;
  if found then
    if v_open.status = 'PENDING' then
      update public.sys_decisions set fingerprint = v_fp, context = v_ctx where id = v_open.id;
      return v_open.id;
    end if;
    if v_open.fingerprint = v_fp then
      return v_open.id;
    end if;
    perform public.sys_decision_close_internal(v_open.id, 'INVALIDATED',
      'Règles ou présences du mois modifiées après la décision.');
  else
    -- Already answered (wait, or simulation done) and nothing changed since: no new request.
    select * into v_open from public.sys_decisions
    where dedupe_key = v_key and status = 'EXECUTED' and fingerprint = v_fp
    order by decided_at desc
    limit 1;
    if found then
      return v_open.id;
    end if;
  end if;

  insert into public.sys_decisions (
    type_code, dedupe_key, period_year, period_month, site_id, scope, context, options, fingerprint,
    request_source, requested_by
  )
  select 'D1', v_key, p_year, p_month, p_site, jsonb_build_object('month', v_start), v_ctx, t.options, v_fp,
         p_source, auth.uid()
  from public.sys_decision_types t
  where t.code = 'D1'
  returning id into v_id;

  select s.name_fr into v_site_name from public.ref_sites s where s.id = p_site;
  perform public.sys_notify(
    'DECISION_PENDING',
    format('Paie %s — %s : règles en attente', public.sys_period_label(p_year, p_month),
           coalesce(v_site_name, 'tous les chantiers')),
    'Des règles légales du mois attendent leur approbation ou leur date d''application. La génération de la paie est '
      || 'bloquée ; une simulation non validable peut être demandée.',
    '/decisions/' || v_id,
    null,
    'decision_payroll_unapproved_rules',
    v_id
  );
  return v_id;
end;
$$;

create or replace function public.hr_payroll_d1_request(p_site uuid, p_year integer, p_month integer)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if p_year is null or p_month is null or p_month not between 1 and 12 or p_year not between 2000 and 2100 then
    raise exception 'Période invalide.' using errcode = 'check_violation';
  end if;
  if not (
    public.erp_has_perm('hr_payroll', 'update', p_site)
    or public.erp_has_perm('hr_payroll_preparation', 'update', p_site)
  ) then
    raise exception 'Demande D1 non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  if p_site is not null and not public.erp_can_see_site(p_site, v_uid) then
    raise exception 'Chantier hors de votre périmètre.' using errcode = 'insufficient_privilege';
  end if;
  if public.hr_payroll_period_status(p_site, make_date(p_year, p_month, 1)) is not null then
    raise exception 'La paie de ce mois est déjà validée ou clôturée.' using errcode = 'check_violation';
  end if;
  v_id := public.hr_payroll_d1_request_internal(p_site, p_year, p_month, 'MANUAL');
  if v_id is null then
    raise exception 'Aucune règle en attente pour ce mois : la génération peut être demandée directement (D4).'
      using errcode = 'check_violation';
  end if;
  return v_id;
end;
$$;

-- D4 requests now give way to D1 while rules of the month are pending.
create or replace function public.hr_payroll_request_generation(
  p_site uuid,
  p_year integer,
  p_month integer,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_open public.sys_decisions%rowtype;
  v_has_open boolean;
  v_fp text;
  v_ctx jsonb;
  v_site_name text;
  v_id uuid;
  v_start date;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if p_year is null or p_month is null or p_month not between 1 and 12 or p_year not between 2000 and 2100 then
    raise exception 'Période invalide.' using errcode = 'check_violation';
  end if;
  if p_source not in ('ATTENDANCE', 'MANUAL') then
    raise exception 'Origine de demande inconnue.' using errcode = 'check_violation';
  end if;
  if not (
    public.erp_has_perm('hr_payroll', 'update', p_site)
    or public.erp_has_perm('hr_attendance', 'update', p_site)
    or (p_source = 'ATTENDANCE' and (
      public.erp_has_perm('hr_attendance_import', 'create', p_site)
      or public.erp_has_perm('hr_attendance_import_validate', 'update', p_site)
    ))
  ) then
    raise exception 'Demande de génération de paie non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  v_start := make_date(p_year, p_month, 1);
  if public.hr_payroll_period_status(p_site, v_start) is not null then
    return null;
  end if;
  if exists (
    select 1 from public.hr_payroll_runs r
    where r.period_year = p_year and r.period_month = p_month and r.site_id is not distinct from p_site
  ) then
    return null;
  end if;

  v_key := format('D4:%s:%s', to_char(v_start, 'YYYY-MM'), coalesce(p_site::text, 'ALL'));
  if jsonb_array_length(public.hr_month_rule_blockers(v_start)) > 0 then
    select * into v_open from public.sys_decisions
    where dedupe_key = v_key and status = 'PENDING'
    for update;
    if found then
      perform public.sys_decision_close_internal(v_open.id, 'SUPERSEDED',
        'Règles du mois en attente d''approbation : génération bloquée (D1).');
    end if;
    return public.hr_payroll_d1_request_internal(p_site, p_year, p_month, p_source);
  end if;

  v_fp := public.hr_payroll_generation_fingerprint(p_site, p_year, p_month);
  select s.name_fr into v_site_name from public.ref_sites s where s.id = p_site;
  v_ctx := jsonb_build_object(
    'site_name', coalesce(v_site_name, 'Tous les chantiers'),
    'period_nature', public.sys_period_nature(p_year, p_month),
    'attendance_days', (
      select count(*) from public.hr_attendance a
      where a.work_date between v_start and (v_start + interval '1 month - 1 day')::date
        and (p_site is null or a.site_id = p_site)
        and a.status_code = 'VALIDATED'
    )
  );

  select * into v_open from public.sys_decisions
  where dedupe_key = v_key and status in ('PENDING', 'DECIDED')
  for update;
  v_has_open := found;
  if v_has_open and v_open.status = 'PENDING' then
    update public.sys_decisions set fingerprint = v_fp, context = v_ctx where id = v_open.id;
    return v_open.id;
  end if;
  if v_has_open then
    if v_open.fingerprint = v_fp then
      return v_open.id;
    end if;
    perform public.sys_decision_close_internal(v_open.id, 'INVALIDATED', 'Présences modifiées après la décision.');
  end if;

  insert into public.sys_decisions (
    type_code, dedupe_key, period_year, period_month, site_id, scope, context, options, fingerprint,
    request_source, requested_by
  )
  select 'D4', v_key, p_year, p_month, p_site, '{}'::jsonb, v_ctx, t.options, v_fp, p_source, v_uid
  from public.sys_decision_types t
  where t.code = 'D4'
  returning id into v_id;

  perform public.sys_notify(
    'DECISION_PENDING',
    format('Générer la paie %s — %s ?', public.sys_period_label(p_year, p_month), coalesce(v_site_name, 'tous les chantiers')),
    case p_source
      when 'ATTENDANCE' then 'Présences validées. Aucune paie n''a été créée : votre décision est requise.'
      else 'Génération demandée depuis l''écran Paie. Aucune paie n''a été créée : votre décision est requise.'
    end,
    '/decisions/' || v_id,
    null,
    'decision_payroll_generate',
    v_id
  );
  return v_id;
end;
$$;

-- A real payroll is never created nor validated while a rule of the month awaits approval or application.
create or replace function public.hr_payroll_run_rules_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_what text;
begin
  if tg_op = 'UPDATE' and not (old.status_code = 'DRAFT' and new.status_code = 'VALIDATED') then
    return new;
  end if;
  v_count := jsonb_array_length(public.hr_month_rule_blockers(make_date(new.period_year, new.period_month, 1)));
  if v_count > 0 then
    v_what := (case when tg_op = 'INSERT' then 'génération' else 'validation' end);
    raise exception '% règle(s) légale(s) attendent leur approbation ou leur date d''application pour % : % de la paie bloquée (décision D1). Une simulation non validable peut être demandée depuis la préparation du mois.',
      v_count, public.sys_period_label(new.period_year, new.period_month), v_what
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_payroll_run_rules_guard on public.hr_payroll_runs;
create trigger trg_hr_payroll_run_rules_guard
  before insert or update of status_code on public.hr_payroll_runs
  for each row execute function public.hr_payroll_run_rules_guard();

create or replace function public.hr_payroll_simulation_save(p_decision uuid, p_slips jsonb, p_warnings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  d public.sys_decisions%rowtype;
  v_start date;
  v_id uuid;
  v_new uuid;
  n integer;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.sys_decisions where id = p_decision for update;
  if not found or d.type_code <> 'D1' or d.status <> 'DECIDED' or d.chosen_option is distinct from 'SIMULATE' then
    raise exception 'Décision D1 « simulation » décidée requise.' using errcode = 'insufficient_privilege';
  end if;
  if d.decided_by is distinct from v_uid and not public.erp_is_super_admin(v_uid) then
    raise exception 'Seul l''auteur de la décision ou le SUPER_ADMIN peut l''exécuter.' using errcode = 'insufficient_privilege';
  end if;
  if not (
    public.erp_has_perm('hr_payroll', 'update', d.site_id)
    or public.erp_has_perm('hr_payroll_preparation', 'update', d.site_id)
  ) or not public.erp_can_read_hr_salary(v_uid) then
    raise exception 'Simulation de la paie non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  v_start := make_date(d.period_year, d.period_month, 1);
  if public.sys_decision_current_fingerprint(d.id) is distinct from d.fingerprint then
    perform public.sys_decision_close_internal(d.id, 'INVALIDATED',
      'Règles ou présences du mois modifiées entre la décision et la simulation.');
    v_new := public.hr_payroll_d1_request_internal(d.site_id, d.period_year, d.period_month, d.request_source);
    return jsonb_build_object('ok', false, 'reason', 'INVALIDATED', 'new_decision_id', v_new);
  end if;
  if p_slips is null or jsonb_typeof(p_slips) <> 'array' or jsonb_array_length(p_slips) > 5000 then
    raise exception 'Bulletins simulés invalides.' using errcode = 'check_violation';
  end if;
  if p_warnings is not null and (jsonb_typeof(p_warnings) <> 'array' or jsonb_array_length(p_warnings) > 2000) then
    raise exception 'Avertissements invalides.' using errcode = 'check_violation';
  end if;

  perform set_config('hr.payroll_simulation', 'on', true);
  insert into public.hr_payroll_simulations (
    decision_id, period_year, period_month, site_id, blockers, legacy, warnings, created_by
  ) values (
    d.id, d.period_year, d.period_month, d.site_id,
    public.hr_month_rule_blockers(v_start), public.hr_month_legacy_rules(v_start),
    coalesce(p_warnings, '[]'::jsonb), v_uid
  )
  returning id into v_id;

  insert into public.hr_payroll_simulation_slips (
    simulation_id, employee_id, contract_id, site_id, days_paid, gross_amount, employee_ss, employer_ss,
    irg_amount, net_payable, detail
  )
  select v_id, r.employee_id, r.contract_id, r.site_id,
         coalesce(r.days_paid, 0), coalesce(r.gross_amount, 0), coalesce(r.employee_ss, 0), coalesce(r.employer_ss, 0),
         coalesce(r.irg_amount, 0), coalesce(r.net_payable, 0), coalesce(r.detail, '{}'::jsonb)
  from jsonb_to_recordset(p_slips) as r(
    employee_id uuid, contract_id uuid, site_id uuid, days_paid numeric, gross_amount numeric, employee_ss numeric,
    employer_ss numeric, irg_amount numeric, net_payable numeric, detail jsonb
  );
  get diagnostics n = row_count;

  update public.hr_payroll_simulations set
    slip_count = n,
    totals = (
      select jsonb_build_object(
        'gross', coalesce(sum(s.gross_amount), 0),
        'employee_ss', coalesce(sum(s.employee_ss), 0),
        'employer_ss', coalesce(sum(s.employer_ss), 0),
        'irg', coalesce(sum(s.irg_amount), 0),
        'net', coalesce(sum(s.net_payable), 0)
      )
      from public.hr_payroll_simulation_slips s
      where s.simulation_id = v_id
    )
  where id = v_id;
  perform set_config('hr.payroll_simulation', '', true);

  update public.sys_decisions set
    status = 'EXECUTED',
    executed_by = v_uid,
    executed_at = now(),
    execution_result = jsonb_build_object('operation', 'SIMULATION', 'simulation_id', v_id, 'slips', n)
  where id = d.id;
  return jsonb_build_object('ok', true, 'simulation_id', v_id, 'slips', n);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. D14 — dated attendance coefficients
-- ---------------------------------------------------------------------------
create table if not exists public.ref_legende_coefficients (
  id uuid primary key default gen_random_uuid(),
  legend_id uuid not null references public.ref_legendes(id) on delete cascade,
  coefficient numeric(6,3) not null check (coefficient >= 0 and coefficient <= 999.999),
  effective_from date not null check (extract(day from effective_from) = 1),
  origin text not null check (origin in ('INITIAL', 'D14')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REPLACED')),
  decision_id uuid references public.sys_decisions(id),
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  replaced_at timestamptz,
  constraint ref_legende_coefficients_origin_chk check ((origin = 'D14') = (decision_id is not null))
);
create unique index if not exists ref_legende_coefficients_active_uidx
  on public.ref_legende_coefficients (legend_id, effective_from) where status = 'ACTIVE';

-- Current coefficients become the initial version, valid for every month until a D14 decision.
insert into public.ref_legende_coefficients (legend_id, coefficient, effective_from, origin)
select l.id, l.coefficient, date '1900-01-01', 'INITIAL'
from public.ref_legendes l
where not exists (select 1 from public.ref_legende_coefficients v where v.legend_id = l.id);

create or replace function public.ref_legende_coefficient_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.ref_legendes l where l.id = old.legend_id) then
      raise exception 'Coefficient daté d''un code de présence : suppression interdite (historique conservé).'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if coalesce(current_setting('ref.legend_coefficient', true), '') <> 'on' then
    raise exception 'Coefficients datés : écriture réservée à la décision D14 (mois d''effet).'
      using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and (
       (new.id, new.legend_id, new.coefficient, new.effective_from, new.origin, new.decision_id, new.created_by,
        new.created_at)
       is distinct from
       (old.id, old.legend_id, old.coefficient, old.effective_from, old.origin, old.decision_id, old.created_by,
        old.created_at)
       or old.status <> 'ACTIVE' or new.status <> 'REPLACED'
     ) then
    raise exception 'Coefficient daté : seul le remplacement d''une version active est possible.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ref_legende_coefficients_guard on public.ref_legende_coefficients;
create trigger trg_ref_legende_coefficients_guard
  before insert or update or delete on public.ref_legende_coefficients
  for each row execute function public.ref_legende_coefficient_guard();

drop trigger if exists trg_ref_legende_coefficients_audit on public.ref_legende_coefficients;
create trigger trg_ref_legende_coefficients_audit
  after insert or update on public.ref_legende_coefficients
  for each row execute function public.sys_audit_row_change();

-- A new attendance code starts with its coefficient as initial version.
create or replace function public.ref_legende_initial_coefficient()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config('ref.legend_coefficient', 'on', true);
  insert into public.ref_legende_coefficients (legend_id, coefficient, effective_from, origin, created_by)
  values (new.id, new.coefficient, date '1900-01-01', 'INITIAL', auth.uid());
  perform set_config('ref.legend_coefficient', '', true);
  return new;
end;
$$;

drop trigger if exists trg_ref_legendes_initial_coefficient on public.ref_legendes;
create trigger trg_ref_legendes_initial_coefficient
  after insert on public.ref_legendes
  for each row execute function public.ref_legende_initial_coefficient();

create or replace function public.ref_legende_coefficient_lock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.coefficient is distinct from old.coefficient
     and coalesce(current_setting('ref.legend_coefficient', true), '') <> 'on' then
    raise exception 'Le coefficient d''un code de présence se modifie par une demande datée (décision D14) : choisissez son mois d''effet. Les mois déjà calculés gardent l''ancien coefficient.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ref_legendes_coefficient_lock on public.ref_legendes;
create trigger trg_ref_legendes_coefficient_lock
  before update of coefficient on public.ref_legendes
  for each row execute function public.ref_legende_coefficient_lock();

alter table public.ref_legende_coefficients enable row level security;
drop policy if exists ref_legende_coefficients_read on public.ref_legende_coefficients;
create policy ref_legende_coefficients_read on public.ref_legende_coefficients
  for select to authenticated using (public.sys_user_is_active(auth.uid()));
revoke all on public.ref_legende_coefficients from anon;
revoke insert, update, delete, truncate on public.ref_legende_coefficients from authenticated;

create or replace function public.ref_legende_coefficient_at(p_legend uuid, p_month date)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select v.coefficient from public.ref_legende_coefficients v
      where v.legend_id = p_legend and v.status = 'ACTIVE'
        and v.effective_from <= date_trunc('month', p_month)::date
      order by v.effective_from desc
      limit 1
    ),
    (select l.coefficient from public.ref_legendes l where l.id = p_legend)
  );
$$;

create or replace function public.ref_legende_coefficients_at(p_month date)
returns table (code text, coefficient numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.code::text, public.ref_legende_coefficient_at(l.id, p_month)
  from public.ref_legendes l
  where public.sys_user_is_active(auth.uid())
  order by l.code;
$$;

create or replace function public.hr_legend_coefficient_fingerprint(p_scope jsonb)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(
    coalesce((
      select string_agg(v.id::text || ':' || v.status || ':' || v.coefficient::text || ':' || v.effective_from::text,
                        '|' order by v.effective_from, v.id)
      from public.ref_legende_coefficients v
      where v.legend_id = (p_scope->>'legend_id')::uuid
    ), '')
    || '|' || public.hr_first_open_payroll_month()::text
    || '|' || coalesce((
      select l.is_active::text from public.ref_legendes l where l.id = (p_scope->>'legend_id')::uuid
    ), 'deleted')
  );
$$;

create or replace function public.hr_legend_coefficient_context(p_scope jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'code', l.code,
    'label_fr', l.label_fr,
    'is_active', l.is_active,
    'month', p_scope->>'month',
    'coefficient', (p_scope->>'coefficient')::numeric,
    'reason', p_scope->>'reason',
    'current_at_month', public.ref_legende_coefficient_at(l.id, (p_scope->>'month')::date),
    'current_today', public.ref_legende_coefficient_at(l.id, current_date),
    'first_open_month', public.hr_first_open_payroll_month(),
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
          'effective_from', v.effective_from, 'coefficient', v.coefficient, 'origin', v.origin,
          'decision_id', v.decision_id
        ) order by v.effective_from)
      from public.ref_legende_coefficients v
      where v.legend_id = l.id and v.status = 'ACTIVE'
    ), '[]'::jsonb),
    'later_versions', (
      select count(*) from public.ref_legende_coefficients v
      where v.legend_id = l.id and v.status = 'ACTIVE' and v.effective_from > (p_scope->>'month')::date
    ),
    'draft_runs', coalesce((
      select jsonb_agg(jsonb_build_object(
          'run_id', r.id, 'year', r.period_year, 'month', r.period_month,
          'site_name', coalesce(s.name_fr, 'Tous les chantiers')
        ) order by r.period_year, r.period_month)
      from public.hr_payroll_runs r
      left join public.ref_sites s on s.id = r.site_id
      where r.status_code = 'DRAFT'
        and make_date(r.period_year, r.period_month, 1) >= (p_scope->>'month')::date
    ), '[]'::jsonb),
    'attendance_days', (
      select count(*) from public.hr_attendance a
      where a.legend_code = l.code and a.work_date >= (p_scope->>'month')::date
    )
  )
  from public.ref_legendes l
  where l.id = (p_scope->>'legend_id')::uuid;
$$;

create or replace function public.hr_legend_coefficient_request(
  p_legend uuid,
  p_coefficient numeric,
  p_month date,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  l public.ref_legendes%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_scope jsonb;
  v_key text;
  v_open public.sys_decisions%rowtype;
  v_id uuid;
  v_first date;
  v_current numeric;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not (
    public.erp_is_super_admin(v_uid)
    or public.erp_has_perm('legendes', 'update', null, v_uid)
    or public.erp_has_perm('decision_attendance_coefficient', 'create', null, v_uid)
  ) then
    raise exception 'Demande de changement de coefficient non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  select * into l from public.ref_legendes where id = p_legend;
  if not found then
    raise exception 'Code de présence introuvable.' using errcode = 'no_data_found';
  end if;
  if p_coefficient is null or p_coefficient < 0 or p_coefficient > 999.999 or p_coefficient <> round(p_coefficient, 3) then
    raise exception 'Coefficient invalide (0 à 999,999, trois décimales au plus).' using errcode = 'check_violation';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Le mois d''effet commence le 1er du mois.' using errcode = 'check_violation';
  end if;
  if p_month > (date_trunc('month', current_date) + interval '24 months')::date then
    raise exception 'Mois d''effet trop lointain (24 mois au plus).' using errcode = 'check_violation';
  end if;
  v_first := public.hr_first_open_payroll_month();
  if p_month < v_first then
    raise exception 'Une paie de ce mois ou d''un mois suivant est déjà validée ou clôturée : le premier mois d''effet possible est %.',
      to_char(v_first, 'MM/YYYY') using errcode = 'check_violation';
  end if;
  v_current := public.ref_legende_coefficient_at(l.id, p_month);
  if v_current = p_coefficient then
    raise exception 'Le coefficient du code % vaut déjà % pour ce mois.', l.code, v_current using errcode = 'check_violation';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    raise exception 'Motif obligatoire (10 à 500 caractères).' using errcode = 'check_violation';
  end if;

  v_scope := jsonb_build_object('legend_id', l.id, 'code', l.code, 'coefficient', p_coefficient, 'month', p_month,
                                'reason', v_reason);
  v_key := 'D14:' || l.id::text;
  for v_open in
    select * from public.sys_decisions where dedupe_key = v_key and status in ('PENDING', 'DECIDED') for update
  loop
    perform public.sys_decision_close_internal(v_open.id, 'SUPERSEDED', 'Nouvelle demande de coefficient pour ce code.');
  end loop;

  insert into public.sys_decisions (
    type_code, dedupe_key, period_year, period_month, scope, context, options, fingerprint, request_source, requested_by
  )
  select 'D14', v_key, extract(year from p_month)::integer, extract(month from p_month)::integer, v_scope,
         public.hr_legend_coefficient_context(v_scope), t.options, public.hr_legend_coefficient_fingerprint(v_scope),
         'LEGEND_COEFFICIENT', v_uid
  from public.sys_decision_types t
  where t.code = 'D14'
  returning id into v_id;

  perform public.sys_notify(
    'DECISION_PENDING',
    format('Coefficient du code %s : %s → %s à partir de %s', l.code, v_current, p_coefficient, to_char(p_month, 'MM/YYYY')),
    'Aucun effet tant que la décision D14 n''est pas prise. Les mois déjà validés gardent l''ancien coefficient.',
    '/decisions/' || v_id,
    null,
    'decision_attendance_coefficient',
    v_id
  );
  return v_id;
end;
$$;

alter table public.hr_payroll_input_changes drop constraint if exists hr_payroll_input_changes_source_check;
alter table public.hr_payroll_input_changes add constraint hr_payroll_input_changes_source_check
  check (source in ('ATTENDANCE', 'CONTRACT', 'SALARY', 'SALARY_HISTORY', 'EXCEPTION', 'EXIT', 'LEAVE', 'ADVANCE',
                    'COMPLIANCE', 'ASSIGNMENT', 'SITE_WILAYA', 'LEGAL_RULE', 'LEGEND_COEFFICIENT'));

create or replace function public.hr_decision_apply_d14(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.sys_decisions%rowtype;
  l public.ref_legendes%rowtype;
  v_month date;
  v_coef numeric;
  v_new uuid;
  v_replaced integer;
  v_first date;
  v_today date := date_trunc('month', current_date)::date;
  v_run record;
  n integer := 0;
  v_result jsonb;
begin
  select * into d from public.sys_decisions where id = p_id and type_code = 'D14' and status = 'DECIDED' for update;
  if not found then
    raise exception 'Décision D14 introuvable ou déjà exécutée.' using errcode = 'check_violation';
  end if;
  select * into l from public.ref_legendes where id = (d.scope->>'legend_id')::uuid for update;
  if not found then
    raise exception 'Code de présence supprimé.' using errcode = 'no_data_found';
  end if;
  v_month := (d.scope->>'month')::date;
  v_coef := (d.scope->>'coefficient')::numeric;
  v_first := public.hr_first_open_payroll_month();
  if v_month < v_first then
    raise exception 'Mois d''effet déjà traité : le premier mois possible est %.', to_char(v_first, 'MM/YYYY')
      using errcode = 'check_violation';
  end if;

  perform set_config('ref.legend_coefficient', 'on', true);
  update public.ref_legende_coefficients set status = 'REPLACED', replaced_at = now()
  where legend_id = l.id and effective_from = v_month and status = 'ACTIVE';
  get diagnostics v_replaced = row_count;
  insert into public.ref_legende_coefficients (legend_id, coefficient, effective_from, origin, decision_id, created_by)
  values (l.id, v_coef, v_month, 'D14', d.id, auth.uid())
  returning id into v_new;
  -- ref_legendes.coefficient mirrors the value in force this month (read by older screens).
  update public.ref_legendes set coefficient = public.ref_legende_coefficient_at(l.id, v_today)
  where id = l.id and coefficient is distinct from public.ref_legende_coefficient_at(l.id, v_today);
  perform set_config('ref.legend_coefficient', '', true);

  for v_run in
    select r.id, r.period_year, r.period_month, r.site_id
    from public.hr_payroll_runs r
    where r.status_code = 'DRAFT'
      and make_date(r.period_year, r.period_month, 1) >= v_month
      and exists (
        select 1 from public.hr_attendance a
        where a.legend_code = l.code
          and a.work_date between make_date(r.period_year, r.period_month, 1)
                              and (make_date(r.period_year, r.period_month, 1) + interval '1 month - 1 day')::date
          and (r.site_id is null or a.site_id = r.site_id)
      )
    order by r.period_year, r.period_month
  loop
    insert into public.hr_payroll_input_changes (run_id, employee_id, source, detail, changed_by)
    values (
      v_run.id, null, 'LEGEND_COEFFICIENT',
      left(format('Coefficient du code %s : %s à partir de %s (décision D14)', l.code, v_coef, to_char(v_month, 'MM/YYYY')), 300),
      auth.uid()
    )
    on conflict (run_id, coalesce(employee_id, '00000000-0000-0000-0000-000000000000'::uuid), source)
      where resolved_at is null
    do update set changed_at = now(), changed_by = excluded.changed_by, detail = excluded.detail;
    perform public.hr_payroll_upsert_recalc_request(v_run.id, 'LEGEND_COEFFICIENT', true);
    n := n + 1;
  end loop;

  v_result := jsonb_build_object(
    'operation', 'LEGEND_COEFFICIENT',
    'code', l.code,
    'coefficient', v_coef,
    'month', v_month,
    'version_id', v_new,
    'replaced_same_month', v_replaced,
    'flagged_runs', n
  );
  update public.sys_decisions set
    status = 'EXECUTED',
    executed_by = auth.uid(),
    executed_at = now(),
    execution_result = v_result
  where id = d.id;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Month preparation dashboard (read only)
-- ---------------------------------------------------------------------------
create or replace function public.hr_payroll_month_preparation(p_year integer, p_month integer, p_site uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_start date;
  v_end date;
  v_prev date;
  v_run jsonb;
  v_prev_status text;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if p_year is null or p_month is null or p_month not between 1 and 12 or p_year not between 2000 and 2100 then
    raise exception 'Période invalide.' using errcode = 'check_violation';
  end if;
  if not public.erp_has_perm('hr_payroll_preparation', 'read', p_site) then
    raise exception 'Préparation de la paie non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  if p_site is not null and not public.erp_can_see_site(p_site, v_uid) then
    raise exception 'Chantier hors de votre périmètre.' using errcode = 'insufficient_privilege';
  end if;
  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + interval '1 month - 1 day')::date;
  v_prev := (v_start - interval '1 month')::date;

  select jsonb_build_object(
      'id', r.id,
      'status', r.status_code,
      'slips', (select count(*) from public.hr_payroll_slips s where s.run_id = r.id),
      'pending_changes', (
        select count(*) from public.hr_payroll_input_changes c where c.run_id = r.id and c.resolved_at is null
      )
    )
  into v_run
  from public.hr_payroll_runs r
  where r.period_year = p_year and r.period_month = p_month and r.site_id is not distinct from p_site;

  select r.status_code into v_prev_status
  from public.hr_payroll_runs r
  where r.period_year = extract(year from v_prev)::integer and r.period_month = extract(month from v_prev)::integer
    and r.site_id is not distinct from p_site;

  return jsonb_build_object(
    'period', jsonb_build_object(
      'year', p_year,
      'month', p_month,
      'label', public.sys_period_label(p_year, p_month),
      'nature', public.sys_period_nature(p_year, p_month),
      'site_id', p_site,
      'site_name', coalesce((select s.name_fr from public.ref_sites s where s.id = p_site), 'Tous les chantiers'),
      'closed', public.hr_month_is_closed(v_start),
      'period_status', public.hr_payroll_period_status(p_site, v_start),
      'first_open_month', public.hr_first_open_payroll_month(),
      'chain_required', public.hr_payroll_chain_required(p_year, p_month)
    ),
    'run', v_run,
    'previous', jsonb_build_object(
      'label', public.sys_period_label(extract(year from v_prev)::integer, extract(month from v_prev)::integer),
      'nature', public.sys_period_nature(extract(year from v_prev)::integer, extract(month from v_prev)::integer),
      'status', coalesce(v_prev_status, public.hr_payroll_period_status(p_site, v_prev))
    ),
    'rules', jsonb_build_object(
      'blockers', public.hr_month_rule_blockers(v_start),
      'legacy', public.hr_month_legacy_rules(v_start)
    ),
    'coefficients', jsonb_build_object(
      'pending', coalesce((
        select jsonb_agg(jsonb_build_object(
            'decision_id', d.id, 'code', d.scope->>'code', 'coefficient', (d.scope->>'coefficient')::numeric,
            'month', d.scope->>'month'
          ) order by d.requested_at)
        from public.sys_decisions d
        where d.type_code = 'D14' and d.status = 'PENDING' and (d.scope->>'month')::date <= v_start
      ), '[]'::jsonb),
      'changes', coalesce((
        select jsonb_agg(jsonb_build_object(
            'code', l.code, 'coefficient', v.coefficient,
            'previous', public.ref_legende_coefficient_at(l.id, v_prev), 'decision_id', v.decision_id
          ) order by l.code)
        from public.ref_legende_coefficients v
        join public.ref_legendes l on l.id = v.legend_id
        where v.status = 'ACTIVE' and v.origin = 'D14' and v.effective_from = v_start
      ), '[]'::jsonb)
    ),
    'attendance', jsonb_build_object(
      'validated', (
        select count(*) from public.hr_attendance a
        where a.work_date between v_start and v_end and a.status_code = 'VALIDATED'
          and (p_site is null or a.site_id = p_site)
      ),
      'proposed', (
        select count(*) from public.hr_attendance a
        where a.work_date between v_start and v_end and a.status_code = 'PROPOSED'
          and (p_site is null or a.site_id = p_site)
      ),
      'imports', coalesce((
        select jsonb_agg(jsonb_build_object('id', b.id, 'batch_no', b.batch_no, 'status', b.status) order by b.created_at)
        from public.hr_attendance_import_batches b
        where b.status in ('DRAFT', 'ANALYZED', 'PENDING_DECISION', 'IMPORTED')
          and b.period_from <= v_end and b.period_to >= v_start
          and (p_site is null or p_site = any (b.site_ids))
      ), '[]'::jsonb),
      'contracts_without_attendance', (
        select jsonb_build_object(
          'count', count(*),
          'sample', coalesce(jsonb_agg(x.label order by x.label) filter (where x.rn <= 20), '[]'::jsonb)
        )
        from (
          select trim(coalesce(e.matricule, '') || ' ' || coalesce(e.last_name, '') || ' ' || coalesce(e.first_name, '')) as label,
                 row_number() over (order by e.matricule, e.last_name) as rn
          from public.hr_contracts c
          join public.hr_employees e on e.id = c.employee_id
          where c.affectation_principale
            and coalesce(c.contract_type_code, '') <> 'INTERIM'
            and c.start_date <= v_end
            and (c.end_date is null or c.end_date >= v_start)
            and (c.status in ('DRAFT', 'ACTIVE') or (c.status = 'ENDED' and c.end_date between v_start and v_end))
            and (p_site is null or public.hr_contract_site_at(c.id, greatest(c.start_date, v_start)) = p_site)
            and not exists (
              select 1 from public.hr_attendance a
              where a.employee_id = c.employee_id and a.status_code = 'VALIDATED'
                and a.work_date between v_start and v_end
                and (p_site is null or a.site_id = p_site)
            )
        ) x
      )
    ),
    'quality', jsonb_build_object(
      'contract_start', (
        select count(*) from public.hr_contracts c
        where extract(day from c.start_date) <> 1 and not c.start_date_exception
          and c.start_date <= v_end and (c.end_date is null or c.end_date >= v_start)
          and (p_site is null or public.hr_contract_site_at(c.id, greatest(c.start_date, v_start)) = p_site)
      ),
      'sites_without_wilaya', coalesce((
        select jsonb_agg(distinct s.name_fr)
        from public.hr_contracts c
        join public.ref_sites s on s.id = public.hr_contract_site_at(c.id, greatest(c.start_date, v_start))
        where c.status in ('DRAFT', 'ACTIVE', 'ENDED')
          and c.start_date <= v_end and (c.end_date is null or c.end_date >= v_start)
          and coalesce(c.contract_type_code, '') <> 'INTERIM'
          and (p_site is null or s.id = p_site)
          and public.ref_site_wilaya_at(s.id, v_start) is null
      ), '[]'::jsonb)
    ),
    'decisions', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', d.id, 'type_code', d.type_code, 'status', d.status, 'label', t.label_fr, 'site_id', d.site_id,
          'requested_at', d.requested_at
        ) order by d.requested_at)
      from public.sys_decisions d
      join public.sys_decision_types t on t.code = d.type_code
      where d.status in ('PENDING', 'DECIDED')
        and d.period_year = p_year and d.period_month = p_month
        and (p_site is null or d.site_id is null or d.site_id = p_site)
    ), '[]'::jsonb),
    'simulations', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', s.id, 'decision_id', s.decision_id, 'created_at', s.created_at, 'slip_count', s.slip_count,
          'totals', s.totals, 'blockers', jsonb_array_length(s.blockers)
        ) order by s.created_at desc)
      from public.hr_payroll_simulations s
      where s.period_year = p_year and s.period_month = p_month and s.site_id is not distinct from p_site
        and public.erp_can_read_hr_salary(v_uid)
    ), '[]'::jsonb),
    'can', jsonb_build_object(
      'request', public.erp_has_perm('hr_payroll', 'update', p_site)
                 or public.erp_has_perm('hr_payroll_preparation', 'update', p_site),
      'read_salary', public.erp_can_read_hr_salary(v_uid)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Decision engine: D1 and D14
-- ---------------------------------------------------------------------------
create or replace function public.sys_decision_current_fingerprint(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case d.type_code
    when 'D4' then public.hr_payroll_generation_fingerprint(d.site_id, d.period_year, d.period_month)
    when 'D3' then public.hr_payroll_recalc_fingerprint(d.run_id)
    when 'D8' then public.hr_assignment_correction_fingerprint((d.scope->>'assignment_id')::uuid)
    when 'D13' then public.hr_contract_start_fingerprint((d.scope->>'contract_id')::uuid)
    when 'D2' then public.ref_rule_application_fingerprint((d.scope->>'proposal_id')::uuid, (d.scope->>'month')::date)
    when 'D7' then public.hr_payroll_reopen_fingerprint(d.run_id)
    when 'D6' then public.hr_payroll_chain_fingerprint()
    when 'D9' then public.hr_transfer_d9_fingerprint(d.scope)
    when 'D10' then public.hr_declaration_d10_fingerprint(d.scope)
    when 'D5' then public.hr_attendance_import_d5_fingerprint((d.scope->>'batch_id')::uuid)
    when 'D11' then public.hr_attendance_import_d11_fingerprint(d.scope)
    when 'D12' then public.hr_attendance_import_policy_fingerprint()
    when 'D1' then public.hr_payroll_d1_fingerprint(d.site_id, d.period_year, d.period_month)
    when 'D14' then public.hr_legend_coefficient_fingerprint(d.scope)
  end
  from public.sys_decisions d
  where d.id = p_id;
$$;

create or replace function public.sys_decision_refresh_record(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.sys_decisions%rowtype;
  a public.hr_contract_assignments%rowtype;
  c public.hr_contracts%rowtype;
  p public.ref_rule_proposals%rowtype;
  r public.hr_payroll_runs%rowtype;
  ib public.hr_attendance_import_batches%rowtype;
  v_required integer[];
  v_month integer;
  v_status text;
begin
  select * into d from public.sys_decisions where id = p_id and status = 'PENDING' for update;
  if not found then
    return null;
  end if;
  if d.type_code = 'D8' then
    select * into a from public.hr_contract_assignments where id = (d.scope->>'assignment_id')::uuid;
    if not found then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'Affectation supprimée.');
      return 'SUPERSEDED';
    end if;
    if a.effective_from < public.hr_first_changeable_month() then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED',
        'Mois désormais traité : la correction relève de D7 (réouverture de la paie).');
      return 'SUPERSEDED';
    end if;
    if a.site_id = (d.scope->>'new_site_id')::uuid then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'Affectation déjà sur ce chantier.');
      return 'SUPERSEDED';
    end if;
    update public.sys_decisions set
      context = public.hr_assignment_correction_context(a.id, (d.scope->>'new_site_id')::uuid, d.scope->>'reason'),
      fingerprint = public.hr_assignment_correction_fingerprint(a.id)
    where id = d.id;
    return 'PENDING';
  elsif d.type_code = 'D13' then
    select * into c from public.hr_contracts where id = (d.scope->>'contract_id')::uuid;
    if not found then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'Contrat supprimé.');
      return 'SUPERSEDED';
    end if;
    if extract(day from c.start_date) = 1 or c.start_date_exception then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'Contrat déjà conforme ou documenté.');
      return 'SUPERSEDED';
    end if;
    update public.sys_decisions set
      context = public.hr_contract_start_context(c.id),
      fingerprint = public.hr_contract_start_fingerprint(c.id)
    where id = d.id;
    return 'PENDING';
  elsif d.type_code = 'D2' then
    select * into p from public.ref_rule_proposals where id = (d.scope->>'proposal_id')::uuid;
    if not found or p.status <> 'APPROVED' then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'Proposition retirée ou déjà appliquée.');
      return 'SUPERSEDED';
    end if;
    if public.hr_month_is_closed((d.scope->>'month')::date) then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED',
        'Mois désormais traité (paie validée ou clôturée) : demandez une autre date d''application.');
      return 'SUPERSEDED';
    end if;
    update public.sys_decisions set
      context = public.ref_rule_application_context(p.id, (d.scope->>'month')::date, (d.scope->>'date')::date),
      fingerprint = public.ref_rule_application_fingerprint(p.id, (d.scope->>'month')::date)
    where id = d.id;
    return 'PENDING';
  elsif d.type_code = 'D7' then
    select * into r from public.hr_payroll_runs where id = d.run_id;
    if not found or r.status_code not in ('VALIDATED', 'LOCKED') then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'La paie n''est plus validée ni clôturée.');
      return 'SUPERSEDED';
    end if;
    update public.sys_decisions set
      context = public.hr_payroll_reopen_context(r.id) || jsonb_build_object('reason', d.scope->>'reason'),
      fingerprint = public.hr_payroll_reopen_fingerprint(r.id)
    where id = d.id;
    return 'PENDING';
  elsif d.type_code = 'D6' then
    if public.hr_payroll_chain_mode() <> 'UNDECIDED' then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'Politique de clôture déjà décidée.');
      return 'SUPERSEDED';
    end if;
    if public.hr_first_open_payroll_month() >= public.hr_operational_start() then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'Plus aucun mois de reprise ouvert.');
      return 'SUPERSEDED';
    end if;
    update public.sys_decisions set
      context = coalesce(public.hr_payroll_chain_context((d.scope->>'run_id')::uuid), d.context),
      fingerprint = public.hr_payroll_chain_fingerprint()
    where id = d.id;
    return 'PENDING';
  elsif d.type_code = 'D9' then
    if exists (
      select 1 from jsonb_array_elements_text(d.scope->'slip_ids') as x(v)
      left join public.hr_payroll_slips s on s.id = x.v::uuid
      where s.id is null or s.status_code not in ('VALIDATED', 'LOCKED')
    ) then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED',
        'Bulletins supprimés ou repassés en brouillon (réouverture) : nouvelle demande nécessaire.');
      return 'SUPERSEDED';
    end if;
    if exists (
      select 1
      from public.hr_payroll_transfer_lines l
      join public.hr_payroll_transfer_batches b on b.id = l.batch_id
      where l.is_live and b.status_code in ('GENERATED', 'DEPOSITED')
        and (d.scope->'slip_ids') ? l.slip_id::text
    ) then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'Un bulletin a été inclus depuis dans un lot en cours.');
      return 'SUPERSEDED';
    end if;
    update public.sys_decisions set
      context = public.hr_transfer_d9_context(d.scope) || jsonb_build_object('reason', d.scope->>'reason'),
      fingerprint = public.hr_transfer_d9_fingerprint(d.scope)
    where id = d.id;
    return 'PENDING';
  elsif d.type_code = 'D10' then
    v_month := nullif(d.scope->>'month', '')::integer;
    v_required := public.hr_declaration_d10_months(
      d.scope->>'kind', (d.scope->>'year')::integer, v_month, nullif(d.scope->>'site_id', '')::uuid);
    if cardinality(v_required) = 0 then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'Plus aucune décision D10 nécessaire pour cet export.');
      return 'SUPERSEDED';
    end if;
    if (cardinality(v_required) = cardinality(public.hr_declaration_covered_months(d.scope->>'kind', v_month)))
       is distinct from exists (
         select 1 from jsonb_array_elements(d.options) as o(value)
         where o.value->>'code' = 'EXCLUDE' and (o.value->>'executes')::boolean = false) then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED',
        'Mois concernés modifiés : les options ne correspondent plus, nouvelle demande nécessaire.');
      return 'SUPERSEDED';
    end if;
    update public.sys_decisions set
      context = public.hr_declaration_d10_context(d.scope) || jsonb_build_object('reason', d.scope->>'reason'),
      fingerprint = public.hr_declaration_d10_fingerprint(d.scope)
    where id = d.id;
    return 'PENDING';
  elsif d.type_code = 'D5' then
    select * into ib from public.hr_attendance_import_batches where id = (d.scope->>'batch_id')::uuid;
    if not found or ib.status <> 'PENDING_DECISION' then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED',
        'Le lot n''attend plus de décision (importé, rejeté, annulé ou analysé sans conflit).');
      return 'SUPERSEDED';
    end if;
    -- A fresh analysis updates this request (context, fingerprint) or closes it when no conflict remains.
    perform public.hr_attendance_import_analyze_internal(ib.id);
    select status into v_status from public.sys_decisions where id = d.id;
    return v_status;
  elsif d.type_code = 'D11' then
    select * into ib from public.hr_attendance_import_batches where id = (d.scope->>'batch_id')::uuid;
    if not found or ib.status not in ('ANALYZED', 'PENDING_DECISION') then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'Lot importé, rejeté ou annulé : correspondance sans objet.');
      return 'SUPERSEDED';
    end if;
    if exists (
      select 1 from jsonb_each_text(d.scope->'map') as m(key, value)
      where not exists (select 1 from public.ref_legendes g where g.code = m.value and g.is_active)
    ) then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'Code de présence cible désactivé : nouvelle demande nécessaire.');
      return 'SUPERSEDED';
    end if;
    update public.sys_decisions set
      context = public.hr_attendance_import_d11_context(d.scope),
      fingerprint = public.hr_attendance_import_d11_fingerprint(d.scope)
    where id = d.id;
    return 'PENDING';
  elsif d.type_code = 'D12' then
    update public.sys_decisions set
      context = public.hr_attendance_import_policy_context(d.scope->>'reason'),
      fingerprint = public.hr_attendance_import_policy_fingerprint()
    where id = d.id;
    return 'PENDING';
  elsif d.type_code = 'D1' then
    if public.hr_payroll_period_status(d.site_id, make_date(d.period_year, d.period_month, 1)) is not null then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'Paie du mois validée ou clôturée.');
      return 'SUPERSEDED';
    end if;
    if jsonb_array_length(public.hr_month_rule_blockers(make_date(d.period_year, d.period_month, 1))) = 0 then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED',
        'Plus aucune règle en attente pour ce mois : la génération peut être demandée (D4).');
      return 'SUPERSEDED';
    end if;
    update public.sys_decisions set
      context = public.hr_payroll_d1_context(d.site_id, d.period_year, d.period_month),
      fingerprint = public.hr_payroll_d1_fingerprint(d.site_id, d.period_year, d.period_month)
    where id = d.id;
    return 'PENDING';
  elsif d.type_code = 'D14' then
    if not exists (select 1 from public.ref_legendes g where g.id = (d.scope->>'legend_id')::uuid) then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'Code de présence supprimé.');
      return 'SUPERSEDED';
    end if;
    if (d.scope->>'month')::date < public.hr_first_open_payroll_month() then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED',
        'Mois d''effet désormais traité (paie validée ou clôturée) : nouvelle demande nécessaire.');
      return 'SUPERSEDED';
    end if;
    if public.ref_legende_coefficient_at((d.scope->>'legend_id')::uuid, (d.scope->>'month')::date)
       = (d.scope->>'coefficient')::numeric then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'Coefficient déjà en vigueur pour ce mois.');
      return 'SUPERSEDED';
    end if;
    update public.sys_decisions set
      context = public.hr_legend_coefficient_context(d.scope),
      fingerprint = public.hr_legend_coefficient_fingerprint(d.scope)
    where id = d.id;
    return 'PENDING';
  end if;
  return d.status;
end;
$$;

create or replace function public.sys_decision_decide(
  p_id uuid,
  p_option text,
  p_justification text,
  p_fingerprint text,
  p_risk_ack boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  d public.sys_decisions%rowtype;
  t public.sys_decision_types%rowtype;
  v_opt jsonb;
  v_executes boolean;
  v_applied boolean := false;
  v_fp text;
  v_just text := btrim(coalesce(p_justification, ''));
  v_run_status text;
  n integer := 0;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.sys_decisions where id = p_id for update;
  if not found then
    raise exception 'Décision introuvable.' using errcode = 'no_data_found';
  end if;
  select * into t from public.sys_decision_types where code = d.type_code;
  if not public.sys_decision_can_decide(d.type_code, v_uid) then
    raise exception 'Vous n''avez pas le droit de prendre cette décision.' using errcode = 'insufficient_privilege';
  end if;
  if d.requested_by = v_uid and not public.erp_is_super_admin(v_uid) then
    raise exception 'Séparation des tâches : vous êtes à l''origine de cette demande, un autre décideur doit la trancher.'
      using errcode = 'insufficient_privilege';
  end if;
  if d.type_code = 'D2' and not public.erp_is_super_admin(v_uid)
     and v_uid = any (public.ref_rule_proposal_contributors((d.scope->>'proposal_id')::uuid)) then
    raise exception 'Séparation des tâches : vous avez contribué à cette règle, un autre décideur doit fixer sa date d''application.'
      using errcode = 'insufficient_privilege';
  end if;
  if d.status <> 'PENDING' then
    raise exception 'Cette décision n''est plus en attente (%).', d.status using errcode = 'check_violation';
  end if;
  if char_length(v_just) < 10 then
    raise exception 'Justification obligatoire (10 caractères minimum).' using errcode = 'check_violation';
  end if;
  if char_length(v_just) > 2000 then
    raise exception 'Justification trop longue (2000 caractères maximum).' using errcode = 'check_violation';
  end if;
  select o.value into v_opt from jsonb_array_elements(d.options) as o(value) where o.value->>'code' = p_option;
  if v_opt is null then
    raise exception 'Option inconnue pour cette décision.' using errcode = 'check_violation';
  end if;
  if t.risk_class = 'RISKY' and not coalesce(p_risk_ack, false) then
    raise exception 'Décision à risque : confirmez avoir pris connaissance des conséquences.' using errcode = 'check_violation';
  end if;

  v_fp := public.sys_decision_current_fingerprint(d.id);
  if v_fp is distinct from d.fingerprint then
    if d.type_code = 'D3' then
      select status_code into v_run_status from public.hr_payroll_runs where id = d.run_id;
      if v_run_status is distinct from 'DRAFT' then
        perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'La paie n''est plus en brouillon.');
        return jsonb_build_object('ok', false, 'reason', 'CLOSED');
      end if;
      perform public.hr_payroll_upsert_recalc_request(d.run_id, d.request_source, false);
    elsif d.type_code = 'D4' then
      if public.hr_payroll_period_status(d.site_id, make_date(d.period_year, d.period_month, 1)) is not null
         or exists (
           select 1 from public.hr_payroll_runs r
           where r.period_year = d.period_year and r.period_month = d.period_month
             and r.site_id is not distinct from d.site_id
         ) then
        perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'Une paie existe déjà pour ce mois.');
        return jsonb_build_object('ok', false, 'reason', 'CLOSED');
      end if;
      update public.sys_decisions set fingerprint = v_fp where id = d.id;
    else
      if public.sys_decision_refresh_record(d.id) is distinct from 'PENDING' then
        return jsonb_build_object('ok', false, 'reason', 'CLOSED');
      end if;
    end if;
    return jsonb_build_object('ok', false, 'reason', 'STALE');
  end if;
  if p_fingerprint is distinct from d.fingerprint then
    return jsonb_build_object('ok', false, 'reason', 'STALE');
  end if;

  v_executes := coalesce((v_opt->>'executes')::boolean, false);
  update public.sys_decisions set
    status = 'DECIDED',
    chosen_option = p_option,
    justification = v_just,
    risk_acknowledged = coalesce(p_risk_ack, false),
    decided_by = v_uid,
    decided_at = now()
  where id = d.id;

  -- Reference-data, closing, import and coefficient decisions run in the same transaction: decided and applied
  -- together, or not at all. D5 « trancher ligne par ligne » is carried out afterwards on the imports screen; the D1
  -- simulation and D3/D4 are computed by the application.
  if v_executes and (
       d.type_code in ('D8', 'D13', 'D2', 'D6', 'D7', 'D11', 'D12', 'D14')
       or (d.type_code = 'D5' and p_option <> 'LINE_BY_LINE')
     ) then
    if d.type_code = 'D8' then
      perform public.hr_decision_apply_d8(d.id);
    elsif d.type_code = 'D13' then
      perform public.hr_decision_apply_d13(d.id);
    elsif d.type_code = 'D2' then
      perform public.ref_rule_apply_d2(d.id);
    elsif d.type_code = 'D6' then
      perform public.hr_decision_apply_d6(d.id);
    elsif d.type_code = 'D7' then
      perform public.hr_decision_apply_d7(d.id);
    elsif d.type_code = 'D5' then
      perform public.hr_attendance_import_apply_d5(d.id);
    elsif d.type_code = 'D11' then
      perform public.hr_attendance_import_apply_d11(d.id);
    elsif d.type_code = 'D14' then
      perform public.hr_decision_apply_d14(d.id);
    else
      perform public.hr_attendance_import_apply_d12(d.id);
    end if;
    v_applied := true;
  end if;

  if not v_executes then
    if d.type_code = 'D3' then
      update public.hr_payroll_input_changes set
        resolved_at = now(), resolved_by = v_uid, resolution = 'KEPT', decision_id = d.id
      where run_id = d.run_id
        and resolved_at is null
        and id in (select x.value::uuid from jsonb_array_elements_text(d.scope->'change_ids') as x(value));
      get diagnostics n = row_count;
    end if;
    update public.sys_decisions set
      status = 'EXECUTED',
      executed_by = v_uid,
      executed_at = now(),
      execution_result = jsonb_build_object('operation', 'NONE', 'resolved_changes', n)
    where id = d.id;
  end if;

  if d.requested_by is not null and d.requested_by <> v_uid then
    perform public.sys_notify(
      'DECISION_TAKEN',
      'Décision prise : ' || t.label_fr,
      v_opt->>'label_fr',
      '/decisions/' || d.id,
      d.requested_by,
      null,
      d.id
    );
  end if;
  return jsonb_build_object(
    'ok', true,
    'status', case when v_executes and not v_applied then 'DECIDED' else 'EXECUTED' end,
    'executes', v_executes and not v_applied,
    'applied', v_applied
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.hr_payroll_simulation_guard() from public, anon, authenticated;
revoke all on function public.hr_payroll_run_rules_guard() from public, anon, authenticated;
revoke all on function public.ref_legende_coefficient_guard() from public, anon, authenticated;
revoke all on function public.ref_legende_initial_coefficient() from public, anon, authenticated;
revoke all on function public.ref_legende_coefficient_lock() from public, anon, authenticated;
revoke all on function public.hr_payroll_d1_fingerprint(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.hr_payroll_d1_context(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.hr_payroll_d1_request_internal(uuid, integer, integer, text) from public, anon, authenticated;
revoke all on function public.hr_legend_coefficient_fingerprint(jsonb) from public, anon, authenticated;
revoke all on function public.hr_legend_coefficient_context(jsonb) from public, anon, authenticated;
revoke all on function public.hr_decision_apply_d14(uuid) from public, anon, authenticated;
revoke all on function public.sys_decision_current_fingerprint(uuid) from public, anon, authenticated;
revoke all on function public.sys_decision_refresh_record(uuid) from public, anon, authenticated;

revoke all on function public.hr_month_rule_blockers(date) from public, anon, authenticated;
revoke all on function public.hr_month_legacy_rules(date) from public, anon, authenticated;
revoke all on function public.hr_payroll_d1_request(uuid, integer, integer) from public, anon;
revoke all on function public.hr_payroll_request_generation(uuid, integer, integer, text) from public, anon;
revoke all on function public.hr_payroll_simulation_save(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.ref_legende_coefficient_at(uuid, date) from public, anon;
revoke all on function public.ref_legende_coefficients_at(date) from public, anon;
revoke all on function public.hr_legend_coefficient_request(uuid, numeric, date, text) from public, anon;
revoke all on function public.hr_payroll_month_preparation(integer, integer, uuid) from public, anon;
revoke all on function public.sys_decision_decide(uuid, text, text, text, boolean) from public, anon;

grant execute on function public.hr_payroll_d1_request(uuid, integer, integer) to authenticated;
grant execute on function public.hr_payroll_request_generation(uuid, integer, integer, text) to authenticated;
grant execute on function public.hr_payroll_simulation_save(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.ref_legende_coefficient_at(uuid, date) to authenticated;
grant execute on function public.ref_legende_coefficients_at(date) to authenticated;
grant execute on function public.hr_legend_coefficient_request(uuid, numeric, date, text) to authenticated;
grant execute on function public.hr_payroll_month_preparation(integer, integer, uuid) to authenticated;
grant execute on function public.sys_decision_decide(uuid, text, text, text, boolean) to authenticated;

commit;
