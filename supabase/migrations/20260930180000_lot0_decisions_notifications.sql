-- Lot 0 — Fondations
--   1. Types de décision (catalogue fixe), délégables depuis la matrice des droits.
--   2. Registre des décisions : définitif une fois décidé, empreinte des données, usage unique.
--   3. Notifications dans l'application (aucun e-mail).
--   4. Données de paie modifiées après calcul : signalées sur le brouillon, jamais recalculées d'office (D3).
--   5. Création et calcul de paie refusés en base sans décision valide (D3 recalcul, D4 génération).
--   6. Validation d'une paie refusée tant que des données modifiées n'ont pas fait l'objet d'une décision.

begin;

-- ---------------------------------------------------------------------------
-- 1. Rights matrix: the centre and one screen per decision type (update = decide)
-- ---------------------------------------------------------------------------
insert into public.sys_screens (code, path, module, label_fr, label_ar, sort_order) values
  ('decisions', '/decisions', 'decisions', 'Centre de décisions', 'مركز القرارات', 45),
  ('decision_payroll_recalc', '/decisions?type=D3', 'decisions',
   'Décision D3 · Recalcul des paies brouillon (classe : ordinaire)', null, 46),
  ('decision_payroll_generate', '/decisions?type=D4', 'decisions',
   'Décision D4 · Génération de paie (classe : ordinaire)', null, 47)
on conflict (code) do nothing;

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select r.id, s.id, true, true, true, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code = 'SUPER_ADMIN'
  and s.code in ('decisions', 'decision_payroll_recalc', 'decision_payroll_generate')
on conflict (role_id, screen_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Decision types
-- ---------------------------------------------------------------------------
create table if not exists public.sys_decision_types (
  code text primary key,
  label_fr text not null,
  description_fr text not null,
  risk_class text not null check (risk_class in ('ORDINARY', 'RISKY')),
  policy_allowed boolean not null default false,
  screen_code text not null references public.sys_screens(code),
  options jsonb not null,
  is_active boolean not null default true,
  constraint sys_decision_types_risky_no_policy check (risk_class = 'ORDINARY' or not policy_allowed),
  constraint sys_decision_types_options_chk check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 2)
);

insert into public.sys_decision_types (code, label_fr, description_fr, risk_class, policy_allowed, screen_code, options) values
  ('D3',
   'Paie brouillon modifiée depuis son calcul',
   'Des données de paie ont changé après le calcul du brouillon. Aucun recalcul n''est fait sans décision.',
   'ORDINARY', false, 'decision_payroll_recalc',
   jsonb_build_array(
     jsonb_build_object(
       'code', 'RECALCULATE',
       'label_fr', 'Recalculer les bulletins concernés',
       'consequence_fr', 'Les bulletins brouillon concernés sont recalculés avec les données actuelles. Les autres bulletins de la paie ne changent pas. Rien n''est validé, payé ni déclaré.',
       'executes', true),
     jsonb_build_object(
       'code', 'KEEP',
       'label_fr', 'Conserver les bulletins tels quels',
       'consequence_fr', 'Les bulletins gardent leurs montants actuels bien que les données aient changé depuis leur calcul. Ce choix est enregistré et la paie pourra être validée en l''état.',
       'executes', false))),
  ('D4',
   'Génération de paie',
   'Aucune paie n''est créée sans décision explicite, y compris après la validation des présences.',
   'ORDINARY', false, 'decision_payroll_generate',
   jsonb_build_array(
     jsonb_build_object(
       'code', 'GENERATE',
       'label_fr', 'Générer la paie du mois',
       'consequence_fr', 'Une paie brouillon est créée et les bulletins sont calculés avec les règles en vigueur au 1er du mois. Rien n''est validé, payé ni déclaré.',
       'executes', true),
     jsonb_build_object(
       'code', 'NOT_NOW',
       'label_fr', 'Ne pas générer',
       'consequence_fr', 'Aucune paie n''est créée. Une nouvelle demande sera ouverte à la prochaine validation de présences ou sur demande depuis l''écran Paie.',
       'executes', false)))
on conflict (code) do nothing;

alter table public.sys_decision_types enable row level security;
drop policy if exists sys_decision_types_read on public.sys_decision_types;
create policy sys_decision_types_read on public.sys_decision_types
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 3. Decision register
-- ---------------------------------------------------------------------------
create table if not exists public.sys_decisions (
  id uuid primary key default gen_random_uuid(),
  type_code text not null references public.sys_decision_types(code),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'DECIDED', 'EXECUTED', 'INVALIDATED', 'SUPERSEDED')),
  dedupe_key text not null,
  period_year integer check (period_year between 2000 and 2100),
  period_month integer check (period_month between 1 and 12),
  site_id uuid references public.ref_sites(id),
  run_id uuid references public.hr_payroll_runs(id),
  scope jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  options jsonb not null,
  fingerprint text not null,
  request_source text not null,
  requested_by uuid references public.sys_users(id),
  requested_at timestamptz not null default now(),
  chosen_option text,
  justification text,
  risk_acknowledged boolean not null default false,
  decided_by uuid references public.sys_users(id),
  decided_at timestamptz,
  executed_by uuid references public.sys_users(id),
  executed_at timestamptz,
  execution_result jsonb,
  closed_reason text,
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint sys_decisions_pending_chk check (status <> 'PENDING' or (chosen_option is null and decided_at is null)),
  constraint sys_decisions_decided_chk check (
    status not in ('DECIDED', 'EXECUTED')
    or (chosen_option is not null and justification is not null and decided_by is not null and decided_at is not null)
  ),
  constraint sys_decisions_executed_chk check (status <> 'EXECUTED' or executed_at is not null),
  constraint sys_decisions_closed_chk check (
    status not in ('INVALIDATED', 'SUPERSEDED') or (closed_at is not null and closed_reason is not null)
  )
);

create unique index if not exists sys_decisions_open_uidx
  on public.sys_decisions (dedupe_key) where status in ('PENDING', 'DECIDED');
create index if not exists sys_decisions_status_idx on public.sys_decisions (status, requested_at desc);
create index if not exists sys_decisions_run_idx on public.sys_decisions (run_id);

-- Decided decisions are final: changing one's mind means a new decision.
create or replace function public.sys_decision_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Registre des décisions : suppression interdite.' using errcode = 'check_violation';
  end if;
  if old.status in ('EXECUTED', 'INVALIDATED', 'SUPERSEDED') then
    raise exception 'Décision close (%) : enregistrement définitif.', old.status using errcode = 'check_violation';
  end if;
  if (new.id, new.type_code, new.dedupe_key, new.period_year, new.period_month, new.site_id, new.run_id,
      new.options, new.request_source, new.requested_by, new.requested_at)
     is distinct from
     (old.id, old.type_code, old.dedupe_key, old.period_year, old.period_month, old.site_id, old.run_id,
      old.options, old.request_source, old.requested_by, old.requested_at) then
    raise exception 'Décision : type, périmètre et options non modifiables.' using errcode = 'check_violation';
  end if;
  if old.status = 'PENDING' and new.status not in ('PENDING', 'DECIDED', 'INVALIDATED', 'SUPERSEDED') then
    raise exception 'Décision : transition % → % refusée.', old.status, new.status using errcode = 'check_violation';
  end if;
  if old.status = 'DECIDED' then
    if new.status not in ('DECIDED', 'EXECUTED', 'INVALIDATED', 'SUPERSEDED') then
      raise exception 'Décision : transition % → % refusée.', old.status, new.status using errcode = 'check_violation';
    end if;
    if (new.scope, new.context, new.fingerprint, new.chosen_option, new.justification, new.risk_acknowledged,
        new.decided_by, new.decided_at)
       is distinct from
       (old.scope, old.context, old.fingerprint, old.chosen_option, old.justification, old.risk_acknowledged,
        old.decided_by, old.decided_at) then
      raise exception 'Décision prise : non modifiable. Une nouvelle décision doit la remplacer.'
        using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sys_decisions_guard on public.sys_decisions;
create trigger trg_sys_decisions_guard
  before update or delete on public.sys_decisions
  for each row execute function public.sys_decision_guard();

drop trigger if exists trg_sys_decisions_audit on public.sys_decisions;
create trigger trg_sys_decisions_audit
  after insert or update or delete on public.sys_decisions
  for each row execute function public.sys_audit_row_change();

-- ---------------------------------------------------------------------------
-- 4. Payroll inputs changed after calculation (one open row per run / employee / source)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_payroll_input_changes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.hr_payroll_runs(id) on delete cascade,
  employee_id uuid references public.hr_employees(id),
  source text not null check (source in (
    'ATTENDANCE', 'CONTRACT', 'SALARY', 'SALARY_HISTORY', 'EXCEPTION', 'EXIT', 'LEAVE', 'ADVANCE', 'COMPLIANCE'
  )),
  detail text check (char_length(detail) <= 300),
  changed_by uuid references public.sys_users(id),
  changed_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.sys_users(id),
  resolution text check (resolution in ('RECALCULATED', 'KEPT')),
  decision_id uuid references public.sys_decisions(id),
  constraint hr_payroll_input_changes_resolution_chk check ((resolved_at is null) = (resolution is null))
);

create unique index if not exists hr_payroll_input_changes_open_uidx
  on public.hr_payroll_input_changes (run_id, coalesce(employee_id, '00000000-0000-0000-0000-000000000000'::uuid), source)
  where resolved_at is null;

create or replace function public.hr_payroll_input_change_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    -- Only the cascade of a deleted draft run may remove rows.
    if exists (select 1 from public.hr_payroll_runs where id = old.run_id) then
      raise exception 'Signalement de paie : suppression interdite.' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if old.resolved_at is not null then
    raise exception 'Signalement de paie traité : non modifiable.' using errcode = 'check_violation';
  end if;
  if (new.id, new.run_id, new.employee_id, new.source) is distinct from (old.id, old.run_id, old.employee_id, old.source) then
    raise exception 'Signalement de paie : paie, salarié et source non modifiables.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_payroll_input_changes_guard on public.hr_payroll_input_changes;
create trigger trg_hr_payroll_input_changes_guard
  before update or delete on public.hr_payroll_input_changes
  for each row execute function public.hr_payroll_input_change_guard();

drop trigger if exists trg_hr_payroll_input_changes_audit on public.hr_payroll_input_changes;
create trigger trg_hr_payroll_input_changes_audit
  after insert or update or delete on public.hr_payroll_input_changes
  for each row execute function public.sys_audit_row_change();

alter table public.hr_payroll_input_changes enable row level security;
drop policy if exists hr_payroll_input_changes_read on public.hr_payroll_input_changes;
create policy hr_payroll_input_changes_read on public.hr_payroll_input_changes
  for select to authenticated
  using (exists (
    select 1 from public.hr_payroll_runs r
    where r.id = run_id and public.erp_has_perm('hr_payroll', 'read', r.site_id)
  ));

-- ---------------------------------------------------------------------------
-- 5. In-app notifications (recipient = one user, or every holder of a decision right)
-- ---------------------------------------------------------------------------
create table if not exists public.sys_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('DECISION_PENDING', 'DECISION_TAKEN', 'DECISION_INVALIDATED')),
  title text not null check (char_length(title) <= 200),
  body text check (char_length(body) <= 1000),
  link text check (link is null or link ~ '^/[A-Za-z0-9/_=&?%-]*$'),
  recipient_user uuid references public.sys_users(id),
  recipient_screen text references public.sys_screens(code),
  decision_id uuid references public.sys_decisions(id),
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  constraint sys_notifications_recipient_chk check ((recipient_user is null) <> (recipient_screen is null))
);

create index if not exists sys_notifications_user_idx on public.sys_notifications (recipient_user, created_at desc);
create index if not exists sys_notifications_screen_idx on public.sys_notifications (recipient_screen, created_at desc);

create table if not exists public.sys_notification_reads (
  notification_id uuid not null references public.sys_notifications(id) on delete cascade,
  user_id uuid not null references public.sys_users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table public.sys_notifications enable row level security;
drop policy if exists sys_notifications_read on public.sys_notifications;
create policy sys_notifications_read on public.sys_notifications
  for select to authenticated
  using (
    recipient_user = auth.uid()
    or (recipient_screen is not null and public.erp_has_perm(recipient_screen, 'update', null))
  );

alter table public.sys_notification_reads enable row level security;
drop policy if exists sys_notification_reads_read on public.sys_notification_reads;
create policy sys_notification_reads_read on public.sys_notification_reads
  for select to authenticated using (user_id = auth.uid());
drop policy if exists sys_notification_reads_insert on public.sys_notification_reads;
create policy sys_notification_reads_insert on public.sys_notification_reads
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.sys_notifications n where n.id = notification_id)
  );

-- ---------------------------------------------------------------------------
-- 6. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.sys_user_is_active(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.sys_users u where u.id = p_uid and u.status = 'ACTIVE');
$$;

create or replace function public.sys_decision_can_decide(p_type text, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.sys_user_is_active(p_uid)
     and (
       public.erp_is_super_admin(p_uid)
       or exists (
         select 1 from public.sys_decision_types t
         where t.code = p_type and t.is_active
           and public.erp_has_perm(t.screen_code, 'update'::public.rbac_action, null, p_uid)
       )
     );
$$;

-- January–August 2026 (and earlier months) were paid and declared outside the application.
create or replace function public.sys_period_nature(p_year integer, p_month integer)
returns text
language sql
immutable
as $$
  select case when make_date(p_year, p_month, 1) < date '2026-09-01' then 'EXTERNAL' else 'OPERATIONAL' end;
$$;

drop policy if exists sys_decisions_read on public.sys_decisions;
alter table public.sys_decisions enable row level security;
create policy sys_decisions_read on public.sys_decisions
  for select to authenticated
  using (
    public.erp_has_perm('decisions', 'read', null)
    or requested_by = auth.uid()
    or public.sys_decision_can_decide(type_code)
  );

create or replace function public.sys_notify(
  p_kind text,
  p_title text,
  p_body text,
  p_link text,
  p_user uuid,
  p_screen text,
  p_decision uuid
)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.sys_notifications (kind, title, body, link, recipient_user, recipient_screen, decision_id, created_by)
  values (p_kind, left(p_title, 200), left(p_body, 1000), p_link, p_user, p_screen, p_decision, auth.uid())
  returning id;
$$;

create or replace function public.hr_payroll_generation_fingerprint(p_site uuid, p_year integer, p_month integer)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(
    coalesce(public.hr_payroll_period_status(p_site, make_date(p_year, p_month, 1)), 'OPEN') || '|' ||
    coalesce(string_agg(
      a.employee_id::text || ':' || a.site_id::text || ':' || a.work_date::text || ':' ||
      coalesce(a.legend_code, '') || ':' || coalesce(a.status_code, ''),
      ',' order by a.employee_id, a.site_id, a.work_date), '')
  )
  from public.hr_attendance a
  where a.work_date between make_date(p_year, p_month, 1)
                        and (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date
    and (p_site is null or a.site_id = p_site);
$$;

create or replace function public.hr_payroll_recalc_fingerprint(p_run uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(
    coalesce((select r.status_code from public.hr_payroll_runs r where r.id = p_run), 'MISSING') || '|' ||
    coalesce((
      select string_agg(c.id::text || '@' || c.changed_at::text, ',' order by c.id)
      from public.hr_payroll_input_changes c
      where c.run_id = p_run and c.resolved_at is null
    ), '')
  );
$$;

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
  end
  from public.sys_decisions d
  where d.id = p_id;
$$;

create or replace function public.sys_decision_close_internal(p_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.sys_decisions%rowtype;
  t public.sys_decision_types%rowtype;
begin
  select * into d from public.sys_decisions where id = p_id and status in ('PENDING', 'DECIDED') for update;
  if not found then
    return;
  end if;
  update public.sys_decisions
  set status = p_status, closed_reason = p_reason, closed_at = now()
  where id = p_id;
  if p_status = 'INVALIDATED' then
    select * into t from public.sys_decision_types where code = d.type_code;
    perform public.sys_notify(
      'DECISION_INVALIDATED',
      'Décision invalidée : ' || t.label_fr,
      p_reason,
      '/decisions/' || d.id,
      null,
      t.screen_code,
      d.id
    );
  end if;
end;
$$;

create or replace function public.sys_period_label(p_year integer, p_month integer)
returns text
language sql
immutable
as $$
  select lpad(p_month::text, 2, '0') || '/' || p_year::text;
$$;

-- ---------------------------------------------------------------------------
-- 7. D4 request: generation of a payroll that does not exist yet
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 8. D3 request: one open decision per draft run, refreshed with every new change
-- ---------------------------------------------------------------------------
create or replace function public.hr_payroll_upsert_recalc_request(p_run uuid, p_source text, p_whole_run boolean)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.hr_payroll_runs%rowtype;
  v_key text;
  v_open public.sys_decisions%rowtype;
  v_has_open boolean;
  v_whole boolean;
  v_changes jsonb;
  v_emps jsonb;
  v_scope jsonb;
  v_ctx jsonb;
  v_fp text;
  v_site_name text;
  v_id uuid;
begin
  select * into r from public.hr_payroll_runs where id = p_run;
  if not found or r.status_code <> 'DRAFT' then
    return null;
  end if;
  v_key := 'D3:' || p_run::text;
  select * into v_open from public.sys_decisions
  where dedupe_key = v_key and status in ('PENDING', 'DECIDED')
  for update;
  v_has_open := found;

  v_whole := coalesce(p_whole_run, false)
    or (v_has_open and v_open.status = 'PENDING' and coalesce((v_open.scope->>'whole_run')::boolean, false))
    or exists (
      select 1 from public.hr_payroll_input_changes c
      where c.run_id = p_run and c.resolved_at is null and c.employee_id is null
    );
  select coalesce(jsonb_agg(c.id order by c.id), '[]'::jsonb) into v_changes
  from public.hr_payroll_input_changes c
  where c.run_id = p_run and c.resolved_at is null;
  if jsonb_array_length(v_changes) = 0 and not v_whole then
    return null;
  end if;
  select coalesce(jsonb_agg(distinct c.employee_id), '[]'::jsonb) into v_emps
  from public.hr_payroll_input_changes c
  where c.run_id = p_run and c.resolved_at is null and c.employee_id is not null;

  v_fp := public.hr_payroll_recalc_fingerprint(p_run);
  v_scope := jsonb_build_object(
    'change_ids', v_changes,
    'employee_ids', case when v_whole then null else v_emps end,
    'whole_run', v_whole
  );
  select s.name_fr into v_site_name from public.ref_sites s where s.id = r.site_id;
  v_ctx := jsonb_build_object(
    'site_name', coalesce(v_site_name, 'Tous les chantiers'),
    'period_nature', public.sys_period_nature(r.period_year, r.period_month),
    'slip_count', (select count(*) from public.hr_payroll_slips s where s.run_id = p_run),
    'changes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source', c.source,
        'detail', c.detail,
        'employee_id', c.employee_id,
        'employee', case when e.id is null then null else trim(coalesce(e.matricule, '') || ' ' || coalesce(e.last_name, '') || ' ' || coalesce(e.first_name, '')) end,
        'changed_at', c.changed_at
      ) order by c.changed_at)
      from public.hr_payroll_input_changes c
      left join public.hr_employees e on e.id = c.employee_id
      where c.run_id = p_run and c.resolved_at is null
    ), '[]'::jsonb)
  );

  if v_has_open and v_open.status = 'PENDING' then
    update public.sys_decisions set scope = v_scope, context = v_ctx, fingerprint = v_fp where id = v_open.id;
    return v_open.id;
  end if;
  if v_has_open then
    if v_open.fingerprint = v_fp then
      return v_open.id;
    end if;
    perform public.sys_decision_close_internal(v_open.id, 'INVALIDATED', 'Données de paie modifiées après la décision.');
  end if;

  insert into public.sys_decisions (
    type_code, dedupe_key, period_year, period_month, site_id, run_id, scope, context, options, fingerprint,
    request_source, requested_by
  )
  select 'D3', v_key, r.period_year, r.period_month, r.site_id, p_run, v_scope, v_ctx, t.options, v_fp,
         p_source, auth.uid()
  from public.sys_decision_types t
  where t.code = 'D3'
  returning id into v_id;

  perform public.sys_notify(
    'DECISION_PENDING',
    format('Paie brouillon %s — %s modifiée depuis son calcul', public.sys_period_label(r.period_year, r.period_month), coalesce(v_site_name, 'tous les chantiers')),
    case when p_source = 'MANUAL'
      then 'Recalcul demandé depuis l''écran Paie. Aucun recalcul n''a été fait : votre décision est requise.'
      else 'Des données ont changé depuis le calcul. Aucun recalcul automatique : votre décision est requise.'
    end,
    '/decisions/' || v_id,
    null,
    'decision_payroll_recalc',
    v_id
  );
  return v_id;
end;
$$;

-- Manual recalculation request from the payroll screen (whole run).
create or replace function public.hr_payroll_request_recalc(p_run uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.hr_payroll_runs%rowtype;
begin
  if auth.uid() is null or not public.sys_user_is_active() then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.hr_payroll_runs where id = p_run;
  if not found then
    raise exception 'Paie introuvable.' using errcode = 'no_data_found';
  end if;
  if not public.erp_has_perm('hr_payroll', 'update', r.site_id) then
    raise exception 'Demande de recalcul non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  if r.status_code <> 'DRAFT' then
    raise exception 'Paie %: seule une paie brouillon peut être recalculée.', r.status_code using errcode = 'check_violation';
  end if;
  return public.hr_payroll_upsert_recalc_request(p_run, 'MANUAL', true);
end;
$$;

-- Any change to payroll inputs: flags the draft runs concerned (never recalculates them)
-- and, for a validated attendance month without payroll, opens a D4 request.
create or replace function public.hr_payroll_signal_input_change(
  p_source text,
  p_employee uuid default null,
  p_contracts uuid[] default null,
  p_site uuid default null,
  p_year integer default null,
  p_month integer default null,
  p_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_emps uuid[];
  v_runs uuid[];
  v_run uuid;
  v_gen uuid;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.sys_user_site_roles usr where usr.user_id = v_uid) then
    raise exception 'Accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  if p_source not in ('ATTENDANCE', 'CONTRACT', 'SALARY', 'SALARY_HISTORY', 'EXCEPTION', 'EXIT', 'LEAVE', 'ADVANCE', 'COMPLIANCE') then
    raise exception 'Origine de modification inconnue.' using errcode = 'check_violation';
  end if;

  v_emps := array_remove(array[p_employee], null);
  if p_contracts is not null and cardinality(p_contracts) > 0 then
    v_emps := v_emps || coalesce(
      (select array_agg(distinct c.employee_id) from public.hr_contracts c where c.id = any (p_contracts)),
      '{}'::uuid[]
    );
  end if;
  select coalesce(array_agg(distinct v.employee_id), '{}'::uuid[]) into v_emps from unnest(v_emps) as v(employee_id);

  select coalesce(array_agg(distinct r.id), '{}'::uuid[]) into v_runs
  from public.hr_payroll_runs r
  where r.status_code = 'DRAFT'
    and (p_year is null or r.period_year = p_year)
    and (p_month is null or r.period_month = p_month)
    and (
      (p_site is not null and r.site_id = p_site)
      or exists (
        select 1 from public.hr_payroll_slips s
        where s.run_id = r.id and s.status_code = 'DRAFT'
          and (s.employee_id = any (v_emps) or s.hr_contract_id = any (coalesce(p_contracts, '{}'::uuid[])))
      )
    );

  if cardinality(v_runs) = 0 then
    if p_site is not null and p_year is not null and p_month is not null then
      v_gen := public.hr_payroll_request_generation(
        p_site, p_year, p_month, case when p_source = 'ATTENDANCE' then 'ATTENDANCE' else 'MANUAL' end
      );
    end if;
    return jsonb_build_object('flagged_runs', 0, 'generation_decision', v_gen);
  end if;

  foreach v_run in array v_runs loop
    if cardinality(v_emps) > 0 then
      insert into public.hr_payroll_input_changes (run_id, employee_id, source, detail, changed_by)
      select v_run, e, p_source, left(p_detail, 300), v_uid from unnest(v_emps) as e
      on conflict (run_id, coalesce(employee_id, '00000000-0000-0000-0000-000000000000'::uuid), source)
        where resolved_at is null
      do update set changed_at = now(), changed_by = excluded.changed_by, detail = excluded.detail;
    else
      insert into public.hr_payroll_input_changes (run_id, employee_id, source, detail, changed_by)
      values (v_run, null, p_source, left(p_detail, 300), v_uid)
      on conflict (run_id, coalesce(employee_id, '00000000-0000-0000-0000-000000000000'::uuid), source)
        where resolved_at is null
      do update set changed_at = now(), changed_by = excluded.changed_by, detail = excluded.detail;
    end if;
    perform public.hr_payroll_upsert_recalc_request(v_run, p_source, false);
  end loop;
  return jsonb_build_object('flagged_runs', cardinality(v_runs), 'generation_decision', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Recording a decision (the only way to decide)
-- ---------------------------------------------------------------------------
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
    else
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
    'status', case when v_executes then 'DECIDED' else 'EXECUTED' end,
    'executes', v_executes
  );
end;
$$;

-- Before running a decided operation: the data must still match what was decided.
create or replace function public.sys_decision_check(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  d public.sys_decisions%rowtype;
  v_opt jsonb;
  v_new uuid;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.sys_decisions where id = p_id for update;
  if not found then
    raise exception 'Décision introuvable.' using errcode = 'no_data_found';
  end if;
  if d.status <> 'DECIDED' then
    return jsonb_build_object('ok', false, 'reason', 'NOT_DECIDED', 'status', d.status);
  end if;
  if d.decided_by is distinct from v_uid and not public.erp_is_super_admin(v_uid) then
    raise exception 'Seul l''auteur de la décision ou le SUPER_ADMIN peut l''exécuter.' using errcode = 'insufficient_privilege';
  end if;
  select o.value into v_opt from jsonb_array_elements(d.options) as o(value) where o.value->>'code' = d.chosen_option;
  if not coalesce((v_opt->>'executes')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'NOTHING_TO_EXECUTE', 'status', d.status);
  end if;
  if public.sys_decision_current_fingerprint(d.id) is distinct from d.fingerprint then
    perform public.sys_decision_close_internal(d.id, 'INVALIDATED', 'Données modifiées entre la décision et son exécution.');
    if d.type_code = 'D3' then
      v_new := public.hr_payroll_upsert_recalc_request(d.run_id, d.request_source, coalesce((d.scope->>'whole_run')::boolean, false));
    else
      begin
        v_new := public.hr_payroll_request_generation(d.site_id, d.period_year, d.period_month, d.request_source);
      exception when insufficient_privilege then
        v_new := null;
      end;
    end if;
    return jsonb_build_object('ok', false, 'reason', 'INVALIDATED', 'new_decision_id', v_new);
  end if;
  return jsonb_build_object(
    'ok', true,
    'type_code', d.type_code,
    'chosen_option', d.chosen_option,
    'period_year', d.period_year,
    'period_month', d.period_month,
    'site_id', d.site_id,
    'run_id', d.run_id,
    'employee_ids', d.scope->'employee_ids'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Payroll writes require a decided D3 / D4 (blocked by default)
-- ---------------------------------------------------------------------------
create or replace function public.hr_payroll_decision_flag()
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v text := nullif(current_setting('hr.payroll_decision', true), '');
begin
  if v is null or v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v::uuid;
end;
$$;

create or replace function public.hr_payroll_decision_allows(p_decision uuid, p_year integer, p_month integer, p_site uuid, p_run uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sys_decisions d
    where d.id = p_decision
      and d.status = 'DECIDED'
      and (
        (d.type_code = 'D3' and d.chosen_option = 'RECALCULATE' and p_run is not null and d.run_id = p_run)
        or (d.type_code = 'D4' and d.chosen_option = 'GENERATE'
            and d.period_year = p_year and d.period_month = p_month and d.site_id is not distinct from p_site)
      )
  );
$$;

create or replace function public.hr_payroll_run_decision_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- auth.uid() is null for service-role / maintenance sessions.
    if auth.uid() is not null and not public.hr_payroll_decision_allows(
      public.hr_payroll_decision_flag(), new.period_year, new.period_month, new.site_id, null
    ) then
      raise exception 'Création de paie refusée : une décision D4 est requise (Centre de décisions).'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if old.status_code = 'DRAFT' and new.status_code = 'VALIDATED' then
    if exists (
      select 1 from public.hr_payroll_input_changes c where c.run_id = new.id and c.resolved_at is null
    ) then
      raise exception 'Données modifiées depuis le calcul : décidez de recalculer ou de conserver les bulletins (Centre de décisions) avant de valider.'
        using errcode = 'check_violation';
    end if;
    update public.sys_decisions
    set status = 'SUPERSEDED', closed_reason = 'Paie validée sans recalcul.', closed_at = now()
    where run_id = new.id and type_code = 'D3' and status in ('PENDING', 'DECIDED');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_payroll_run_decision_guard on public.hr_payroll_runs;
create trigger trg_hr_payroll_run_decision_guard
  before insert or update on public.hr_payroll_runs
  for each row execute function public.hr_payroll_run_decision_guard();

create or replace function public.hr_payroll_slip_decision_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.hr_payroll_runs%rowtype;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  -- Status changes (validate / reopen / close) go through hr_payroll_run_transition.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'status_code' - 'locked_at' - 'updated_at')
         = (to_jsonb(old) - 'status_code' - 'locked_at' - 'updated_at') then
    return new;
  end if;
  select * into r from public.hr_payroll_runs where id = coalesce(new.run_id, old.run_id);
  if not found then
    return coalesce(new, old);
  end if;
  if not public.hr_payroll_decision_allows(public.hr_payroll_decision_flag(), r.period_year, r.period_month, r.site_id, r.id) then
    raise exception 'Bulletins modifiables uniquement en exécution d''une décision D3 ou D4 (Centre de décisions).'
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_hr_payroll_slip_decision_guard on public.hr_payroll_slips;
create trigger trg_hr_payroll_slip_decision_guard
  before insert or update or delete on public.hr_payroll_slips
  for each row execute function public.hr_payroll_slip_decision_guard();

create or replace function public.hr_payroll_slip_line_decision_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.hr_payroll_runs%rowtype;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  select run.* into r
  from public.hr_payroll_slips s
  join public.hr_payroll_runs run on run.id = s.run_id
  where s.id = coalesce(new.slip_id, old.slip_id);
  if not found then
    return coalesce(new, old);
  end if;
  if not public.hr_payroll_decision_allows(public.hr_payroll_decision_flag(), r.period_year, r.period_month, r.site_id, r.id) then
    raise exception 'Lignes de bulletin modifiables uniquement en exécution d''une décision D3 ou D4 (Centre de décisions).'
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_hr_payroll_slip_line_decision_guard on public.hr_payroll_slip_lines;
create trigger trg_hr_payroll_slip_line_decision_guard
  before insert or update or delete on public.hr_payroll_slip_lines
  for each row execute function public.hr_payroll_slip_line_decision_guard();

-- Opens the payroll decided by a D4 (returns the existing draft run on a retry).
create or replace function public.hr_payroll_run_open(p_decision uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  d public.sys_decisions%rowtype;
  v_run uuid;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.sys_decisions where id = p_decision for update;
  if not found or d.type_code <> 'D4' or d.status <> 'DECIDED' or d.chosen_option <> 'GENERATE' then
    raise exception 'Décision D4 « Générer » requise.' using errcode = 'insufficient_privilege';
  end if;
  if d.decided_by is distinct from v_uid and not public.erp_is_super_admin(v_uid) then
    raise exception 'Seul l''auteur de la décision ou le SUPER_ADMIN peut l''exécuter.' using errcode = 'insufficient_privilege';
  end if;
  if not public.erp_has_perm('hr_payroll', 'update', d.site_id) then
    raise exception 'Génération de la paie non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  if public.sys_decision_current_fingerprint(d.id) is distinct from d.fingerprint then
    raise exception 'Données modifiées depuis la décision : rechargez la décision.' using errcode = 'check_violation';
  end if;
  select r.id into v_run from public.hr_payroll_runs r
  where r.period_year = d.period_year and r.period_month = d.period_month
    and r.site_id is not distinct from d.site_id and r.status_code = 'DRAFT';
  if v_run is not null then
    return v_run;
  end if;
  perform set_config('hr.payroll_decision', p_decision::text, true);
  insert into public.hr_payroll_runs (period_year, period_month, site_id, status_code, created_by)
  values (d.period_year, d.period_month, d.site_id, 'DRAFT', v_uid)
  returning id into v_run;
  perform set_config('hr.payroll_decision', '', true);
  return v_run;
end;
$$;

create or replace function public.sys_decision_begin_payroll_write(p_decision uuid, p_run uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  d public.sys_decisions%rowtype;
  r public.hr_payroll_runs%rowtype;
begin
  if v_uid is null then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.sys_decisions where id = p_decision for update;
  select * into r from public.hr_payroll_runs where id = p_run;
  if d.id is null or r.id is null
     or not public.hr_payroll_decision_allows(p_decision, r.period_year, r.period_month, r.site_id, r.id) then
    raise exception 'Calcul de paie refusé : décision D3 ou D4 valide requise (Centre de décisions).'
      using errcode = 'insufficient_privilege';
  end if;
  if d.decided_by is distinct from v_uid and not public.erp_is_super_admin(v_uid) then
    raise exception 'Seul l''auteur de la décision ou le SUPER_ADMIN peut l''exécuter.' using errcode = 'insufficient_privilege';
  end if;
  if public.sys_decision_current_fingerprint(d.id) is distinct from d.fingerprint then
    raise exception 'Données modifiées depuis la décision : rechargez la décision.' using errcode = 'check_violation';
  end if;
  perform set_config('hr.payroll_decision', p_decision::text, true);
end;
$$;

-- Consumes the decision (single use) once the slips are written, in the same transaction.
create or replace function public.sys_decision_finish_payroll_write(p_decision uuid, p_run uuid, p_count integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.sys_decisions%rowtype;
  n integer := 0;
begin
  if public.hr_payroll_decision_flag() is distinct from p_decision then
    raise exception 'Exécution de décision hors transaction de paie.' using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.sys_decisions where id = p_decision for update;
  update public.hr_payroll_input_changes set
    resolved_at = now(), resolved_by = auth.uid(), resolution = 'RECALCULATED', decision_id = p_decision
  where run_id = p_run
    and resolved_at is null
    and id in (
      select x.value::uuid from jsonb_array_elements_text(coalesce(d.scope->'change_ids', '[]'::jsonb)) as x(value)
    );
  get diagnostics n = row_count;
  update public.sys_decisions set
    status = 'EXECUTED',
    executed_by = auth.uid(),
    executed_at = now(),
    execution_result = jsonb_build_object(
      'operation', case d.type_code when 'D4' then 'GENERATE' else 'RECALCULATE' end,
      'run_id', p_run,
      'slips', p_count,
      'resolved_changes', n
    )
  where id = p_decision and status = 'DECIDED';
  if not found then
    raise exception 'Décision déjà exécutée ou close.' using errcode = 'check_violation';
  end if;
  perform set_config('hr.payroll_decision', '', true);
end;
$$;

drop function if exists public.hr_payroll_replace_slips(uuid, jsonb, jsonb);

create or replace function public.hr_payroll_replace_slips(
  p_run_id uuid,
  p_slips jsonb,
  p_lines jsonb,
  p_decision uuid
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  n integer := 0;
begin
  if not exists (select 1 from public.hr_payroll_runs where id = p_run_id and status_code = 'DRAFT') then
    raise exception 'Paie introuvable ou non modifiable.' using errcode = 'check_violation';
  end if;
  perform public.sys_decision_begin_payroll_write(p_decision, p_run_id);

  delete from public.hr_payroll_slips s
  where s.run_id = p_run_id
    and s.status_code = 'DRAFT'
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_slips, '[]'::jsonb)) e
      where (e->>'employee_id')::uuid = s.employee_id
    );

  insert into public.hr_payroll_slips (
    run_id, employee_id, hr_contract_id, days_worked, days_paid, days_leave, days_absence,
    days_weekend, days_abandon, days_rappel, days_by_code, net_target, gross_amount, employee_ss, employer_ss,
    cacobatph, intemperies_employee, intemperies_employer, extra_employee, extra_employer,
    extra_contributions, irg_base, irg_amount, net_payable, status_code, legal_snapshot
  )
  select p_run_id, r.employee_id, r.hr_contract_id,
         coalesce(r.days_worked, 0), coalesce(r.days_paid, 0), coalesce(r.days_leave, 0),
         coalesce(r.days_absence, 0), coalesce(r.days_weekend, 0), coalesce(r.days_abandon, 0),
         coalesce(r.days_rappel, 0), coalesce(r.days_by_code, '{}'::jsonb),
         coalesce(r.net_target, 0), coalesce(r.gross_amount, 0),
         coalesce(r.employee_ss, 0), coalesce(r.employer_ss, 0), coalesce(r.cacobatph, 0),
         coalesce(r.intemperies_employee, 0), coalesce(r.intemperies_employer, 0),
         coalesce(r.extra_employee, 0), coalesce(r.extra_employer, 0),
         coalesce(r.extra_contributions, '[]'::jsonb),
         coalesce(r.irg_base, 0), coalesce(r.irg_amount, 0), coalesce(r.net_payable, 0),
         'DRAFT', r.legal_snapshot
  from jsonb_populate_recordset(null::public.hr_payroll_slips, coalesce(p_slips, '[]'::jsonb)) r
  on conflict (run_id, employee_id) do update set
    hr_contract_id = excluded.hr_contract_id,
    days_worked = excluded.days_worked,
    days_paid = excluded.days_paid,
    days_leave = excluded.days_leave,
    days_absence = excluded.days_absence,
    days_weekend = excluded.days_weekend,
    days_abandon = excluded.days_abandon,
    days_rappel = excluded.days_rappel,
    days_by_code = excluded.days_by_code,
    net_target = excluded.net_target,
    gross_amount = excluded.gross_amount,
    employee_ss = excluded.employee_ss,
    employer_ss = excluded.employer_ss,
    cacobatph = excluded.cacobatph,
    intemperies_employee = excluded.intemperies_employee,
    intemperies_employer = excluded.intemperies_employer,
    extra_employee = excluded.extra_employee,
    extra_employer = excluded.extra_employer,
    extra_contributions = excluded.extra_contributions,
    irg_base = excluded.irg_base,
    irg_amount = excluded.irg_amount,
    net_payable = excluded.net_payable,
    status_code = 'DRAFT',
    legal_snapshot = excluded.legal_snapshot;
  get diagnostics n = row_count;

  delete from public.hr_payroll_slip_lines l
  using public.hr_payroll_slips s
  where l.slip_id = s.id and s.run_id = p_run_id and s.status_code = 'DRAFT';

  insert into public.hr_payroll_slip_lines (
    slip_id, rubrique_id, exception_id, advance_id, source_code, code, label_ar, label_fr, category,
    nature, unit, cotisable, taxable, quantity, unit_amount, amount, sort_order
  )
  select s.id, r.rubrique_id, r.exception_id, r.advance_id, r.source_code, r.code, r.label_ar, r.label_fr,
         r.category, r.nature, r.unit, coalesce(r.cotisable, false), coalesce(r.taxable, false),
         coalesce(r.quantity, 1), coalesce(r.unit_amount, 0), coalesce(r.amount, 0),
         coalesce(r.sort_order, 0)
  from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb)) as r(
    employee_id uuid, rubrique_id uuid, exception_id uuid, advance_id uuid, source_code text, code text,
    label_ar text, label_fr text, category text, nature text, unit text, cotisable boolean,
    taxable boolean, quantity numeric, unit_amount numeric, amount numeric, sort_order integer
  )
  join public.hr_payroll_slips s on s.run_id = p_run_id and s.employee_id = r.employee_id;

  perform public.sys_decision_finish_payroll_write(p_decision, p_run_id, n);
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Execute rights: RPCs for signed-in users, internal helpers for nobody
-- ---------------------------------------------------------------------------
revoke all on function public.sys_notify(text, text, text, text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.sys_decision_close_internal(uuid, text, text) from public, anon, authenticated;
revoke all on function public.hr_payroll_upsert_recalc_request(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.hr_payroll_generation_fingerprint(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.hr_payroll_recalc_fingerprint(uuid) from public, anon, authenticated;
revoke all on function public.sys_decision_current_fingerprint(uuid) from public, anon, authenticated;
revoke all on function public.hr_payroll_decision_allows(uuid, integer, integer, uuid, uuid) from public, anon, authenticated;

revoke all on function public.sys_user_is_active(uuid) from public, anon;
revoke all on function public.sys_decision_can_decide(text, uuid) from public, anon;
revoke all on function public.hr_payroll_request_generation(uuid, integer, integer, text) from public, anon;
revoke all on function public.hr_payroll_request_recalc(uuid) from public, anon;
revoke all on function public.hr_payroll_signal_input_change(text, uuid, uuid[], uuid, integer, integer, text) from public, anon;
revoke all on function public.sys_decision_decide(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.sys_decision_check(uuid) from public, anon;
revoke all on function public.hr_payroll_run_open(uuid) from public, anon;
revoke all on function public.sys_decision_begin_payroll_write(uuid, uuid) from public, anon;
revoke all on function public.sys_decision_finish_payroll_write(uuid, uuid, integer) from public, anon;
revoke all on function public.hr_payroll_replace_slips(uuid, jsonb, jsonb, uuid) from public, anon;

grant execute on function public.sys_user_is_active(uuid) to authenticated;
grant execute on function public.sys_decision_can_decide(text, uuid) to authenticated;
grant execute on function public.sys_period_nature(integer, integer) to authenticated;
grant execute on function public.sys_period_label(integer, integer) to authenticated;
grant execute on function public.hr_payroll_request_generation(uuid, integer, integer, text) to authenticated;
grant execute on function public.hr_payroll_request_recalc(uuid) to authenticated;
grant execute on function public.hr_payroll_signal_input_change(text, uuid, uuid[], uuid, integer, integer, text) to authenticated;
grant execute on function public.sys_decision_decide(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.sys_decision_check(uuid) to authenticated;
grant execute on function public.hr_payroll_run_open(uuid) to authenticated;
grant execute on function public.sys_decision_begin_payroll_write(uuid, uuid) to authenticated;
grant execute on function public.sys_decision_finish_payroll_write(uuid, uuid, integer) to authenticated;
grant execute on function public.hr_payroll_replace_slips(uuid, jsonb, jsonb, uuid) to authenticated;

commit;
