-- Lot 2 — Versionnement et approbation des règles légales
--   1. Toute règle légale (variables et cotisations de l'unité 05, taux des régimes CNAS, barème IRG, règles IRG,
--      portée géographique des zones IRG) change par une proposition : brouillon, soumission, approbation.
--   2. Séparation des tâches : un contributeur (création, modification, soumission, extraction IA) n'approuve pas
--      sa propre proposition. Le SUPER_ADMIN en est exempté ; son auto-approbation est signalée.
--   3. Une règle approuvée n'a aucun effet tant que sa date d'application n'est pas décidée (D2). Elle s'applique
--      au 1er d'un mois non traité ; les paies validées ou clôturées ne sont jamais modifiées, les paies brouillon
--      des mois concernés sont signalées (D3).
--   4. D16 : la portée d'une zone IRG est une liste datée de wilayas (sélection directe ou reprise d'un groupement),
--      contenu légal soumis à approbation.
--   5. Les valeurs existantes restent en vigueur (« reprise, non vérifiée ») ; une demande de vérification les
--      approuve comme référence sans les modifier.
--   6. Les tables en vigueur refusent toute écriture hors de l'application d'une décision D2 ou d'une vérification.

begin;

-- ---------------------------------------------------------------------------
-- 1. Rights matrix
-- ---------------------------------------------------------------------------
insert into public.sys_screens (code, path, module, label_fr, label_ar, sort_order) values
  ('rule_proposals', '/rh/legal/propositions', 'rh', 'Propositions de règles légales', 'مقترحات القواعد القانونية', 215),
  ('rule_approval', '/rh/legal/propositions?vue=approbation', 'rh',
   'Approbation des règles légales', 'اعتماد القواعد القانونية', 216),
  ('decision_rule_application', '/decisions?type=D2', 'decisions',
   'Décision D2 · Date d''application d''une règle approuvée (classe : à risque)', null, 50)
on conflict (code) do nothing;

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select r.id, s.id,
       r.code in ('SUPER_ADMIN', 'ADMIN_RH', 'ADMIN_FINANCE'),
       true,
       r.code in ('SUPER_ADMIN', 'ADMIN_RH', 'ADMIN_FINANCE'),
       false,
       true,
       true
from public.sys_roles r
cross join public.sys_screens s
where s.code = 'rule_proposals'
  and r.code in ('SUPER_ADMIN', 'ADMIN_RH', 'ADMIN_FINANCE', 'GERANT')
on conflict (role_id, screen_id) do nothing;

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select r.id, s.id, r.code = 'SUPER_ADMIN', true, r.code = 'SUPER_ADMIN', false, true, true
from public.sys_roles r
cross join public.sys_screens s
where s.code = 'rule_approval'
  and r.code in ('SUPER_ADMIN', 'ADMIN_RH', 'ADMIN_FINANCE', 'GERANT')
on conflict (role_id, screen_id) do nothing;

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select r.id, s.id, true, true, true, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code = 'SUPER_ADMIN'
  and s.code = 'decision_rule_application'
on conflict (role_id, screen_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Decision type D2
-- ---------------------------------------------------------------------------
insert into public.sys_decision_types (code, label_fr, description_fr, risk_class, policy_allowed, screen_code, options) values
  ('D2',
   'Date d''application d''une règle légale approuvée',
   'Une règle approuvée n''a aucun effet tant que sa date d''application n''est pas décidée. Elle s''applique au 1er d''un mois non traité, sans découpage du mois. Les paies validées ou clôturées sont affichées pour information et ne sont jamais modifiées ; les paies brouillon des mois concernés sont signalées et ne sont recalculées que sur décision D3.',
   'RISKY', false, 'decision_rule_application',
   jsonb_build_array(
     jsonb_build_object(
       'code', 'APPLY',
       'label_fr', 'Appliquer à partir du mois indiqué',
       'consequence_fr', 'La règle approuvée entre en vigueur au 1er du mois indiqué ; la version précédente reste en vigueur pour les mois antérieurs. Les paies brouillon de ce mois et des suivants sont signalées ; aucun bulletin n''est recalculé sans décision D3. Aucune paie validée ou clôturée n''est modifiée.',
       'executes', true),
     jsonb_build_object(
       'code', 'NOT_NOW',
       'label_fr', 'Ne pas appliquer pour l''instant',
       'consequence_fr', 'La règle reste approuvée, sans aucun effet sur la paie. Une autre date d''application peut être demandée plus tard.',
       'executes', false)))
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Proposals and contributors
-- ---------------------------------------------------------------------------
create table if not exists public.ref_rule_proposals (
  id uuid primary key default gen_random_uuid(),
  family text not null check (family in ('LEGAL_VAR', 'CNAS_RATES', 'IRG_BAREME', 'IRG_RULES', 'IRG_ZONE_SCOPE')),
  action text not null check (action in ('SET', 'STOP', 'VERIFY')),
  target_id uuid,
  target_key text,
  payload jsonb not null default '{}'::jsonb,
  title text not null check (char_length(btrim(title)) between 3 and 200),
  source_ref text not null check (char_length(btrim(source_ref)) between 3 and 500),
  text_effective_date date,
  requested_month date check (requested_month is null or extract(day from requested_month) = 1),
  origin text not null default 'MANUAL' check (origin in ('MANUAL', 'AI')),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'APPLIED', 'SUPERSEDED')),
  created_by uuid references public.sys_users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_by uuid references public.sys_users(id),
  submitted_at timestamptz,
  reviewed_by uuid references public.sys_users(id),
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  self_approved boolean not null default false,
  application_decision_id uuid references public.sys_decisions(id),
  applied_month date,
  applied_at timestamptz,
  applied_by uuid references public.sys_users(id),
  closed_reason text,
  constraint ref_rule_proposals_dated_chk
    check (action = 'VERIFY' or (text_effective_date is not null and requested_month is not null)),
  constraint ref_rule_proposals_action_chk check (
    (action <> 'STOP' or family = 'LEGAL_VAR')
    and (action <> 'VERIFY' or family in ('LEGAL_VAR', 'CNAS_RATES', 'IRG_BAREME', 'IRG_RULES'))
  ),
  constraint ref_rule_proposals_target_chk check (
    case when family = 'IRG_ZONE_SCOPE' then target_key is not null else target_id is not null end
  ),
  constraint ref_rule_proposals_reviewed_chk check (
    status not in ('APPROVED', 'APPLIED', 'REJECTED') or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint ref_rule_proposals_rejected_chk check (status <> 'REJECTED' or review_note is not null),
  constraint ref_rule_proposals_applied_chk check (status <> 'APPLIED' or (applied_at is not null and applied_by is not null)),
  constraint ref_rule_proposals_submitted_chk check (status = 'DRAFT' or status = 'WITHDRAWN' or submitted_at is not null)
);

create index if not exists ref_rule_proposals_status_idx on public.ref_rule_proposals (status, created_at desc);
create index if not exists ref_rule_proposals_target_idx on public.ref_rule_proposals (family, target_id);
create unique index if not exists ref_rule_proposals_draft_uidx on public.ref_rule_proposals (target_id)
  where family in ('IRG_BAREME', 'IRG_RULES') and action = 'SET' and status in ('DRAFT', 'SUBMITTED', 'APPROVED');
create unique index if not exists ref_rule_proposals_verify_uidx on public.ref_rule_proposals (family, target_id)
  where action = 'VERIFY' and status in ('DRAFT', 'SUBMITTED', 'APPROVED');

drop trigger if exists trg_ref_rule_proposals_u on public.ref_rule_proposals;
create trigger trg_ref_rule_proposals_u before update on public.ref_rule_proposals
  for each row execute function public.erp_set_updated_at();

drop trigger if exists trg_ref_rule_proposals_audit on public.ref_rule_proposals;
create trigger trg_ref_rule_proposals_audit
  after insert or update or delete on public.ref_rule_proposals
  for each row execute function public.sys_audit_row_change();

create table if not exists public.ref_rule_contributors (
  id uuid primary key default gen_random_uuid(),
  subject_kind text not null check (subject_kind in ('PROPOSAL', 'IRG_BAREME', 'IRG_RULES')),
  subject_id uuid not null,
  user_id uuid not null references public.sys_users(id),
  role text not null check (role in ('CREATE', 'EDIT', 'SUBMIT', 'AI_EXTRACT')),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  unique (subject_kind, subject_id, user_id, role)
);

create index if not exists ref_rule_contributors_subject_idx on public.ref_rule_contributors (subject_kind, subject_id);

drop trigger if exists trg_ref_rule_contributors_audit on public.ref_rule_contributors;
create trigger trg_ref_rule_contributors_audit
  after insert or update or delete on public.ref_rule_contributors
  for each row execute function public.sys_audit_row_change();

create or replace function public.ref_rule_contributors_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Contributeurs d''une règle : suppression interdite.' using errcode = 'check_violation';
  end if;
  if (new.subject_kind, new.subject_id, new.user_id, new.role, new.first_at)
     is distinct from (old.subject_kind, old.subject_id, old.user_id, old.role, old.first_at) then
    raise exception 'Contributeurs d''une règle : enregistrement définitif.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ref_rule_contributors_guard on public.ref_rule_contributors;
create trigger trg_ref_rule_contributors_guard
  before update or delete on public.ref_rule_contributors
  for each row execute function public.ref_rule_contributors_guard();

-- Transaction-local switches, set only inside the functions below.
create or replace function public.ref_rule_applying()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('ref.rule_apply', true), '') = 'on';
$$;

create or replace function public.ref_rule_reviewing()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('ref.rule_review', true), '') = 'on';
$$;

create or replace function public.ref_rule_direct_write_error()
returns text
language sql
immutable
as $$
  select 'Règle légale : aucune modification directe. Créez une proposition ; une fois approuvée, la décision D2 fixe sa date d''application.';
$$;

create or replace function public.ref_rule_note_contributor(p_kind text, p_subject uuid, p_role text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.ref_rule_contributors (subject_kind, subject_id, user_id, role)
  select p_kind, p_subject, auth.uid(), p_role
  where auth.uid() is not null
  on conflict (subject_kind, subject_id, user_id, role) do update set last_at = now();
$$;

create or replace function public.ref_rule_proposal_contributors(p_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct c.user_id), '{}'::uuid[])
  from public.ref_rule_proposals p
  join public.ref_rule_contributors c
    on (c.subject_kind = 'PROPOSAL' and c.subject_id = p.id)
    or (p.family in ('IRG_BAREME', 'IRG_RULES') and p.action = 'SET'
        and c.subject_kind = p.family and c.subject_id = p.target_id)
  where p.id = p_id;
$$;

-- Status, review and application fields change only through the approval functions; the separation of duties
-- holds even for a direct write that would set the switch.
create or replace function public.ref_rule_proposals_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contrib uuid[];
begin
  if tg_op = 'DELETE' then
    raise exception 'Registre des propositions : suppression interdite (retirez la proposition).' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' or new.reviewed_by is not null or new.applied_at is not null
       or new.application_decision_id is not null or new.self_approved then
      raise exception 'Une proposition naît en brouillon.' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if old.status in ('REJECTED', 'WITHDRAWN', 'APPLIED', 'SUPERSEDED') then
    raise exception 'Proposition close (%) : enregistrement définitif.', old.status using errcode = 'check_violation';
  end if;
  if (new.family, new.action, new.target_id, new.target_key, new.origin, new.created_by, new.created_at)
     is distinct from (old.family, old.action, old.target_id, old.target_key, old.origin, old.created_by, old.created_at) then
    raise exception 'Famille, cible et auteur d''une proposition ne se modifient pas.' using errcode = 'check_violation';
  end if;
  if old.status <> 'DRAFT'
     and (new.payload, new.title, new.source_ref, new.text_effective_date, new.requested_month)
         is distinct from (old.payload, old.title, old.source_ref, old.text_effective_date, old.requested_month) then
    raise exception 'Proposition soumise : son contenu ne se modifie plus (retirez-la puis créez-en une autre).'
      using errcode = 'check_violation';
  end if;
  if (new.status, new.submitted_by, new.submitted_at, new.reviewed_by, new.reviewed_at, new.review_note,
      new.self_approved, new.application_decision_id, new.applied_month, new.applied_at, new.applied_by, new.closed_reason)
     is distinct from
     (old.status, old.submitted_by, old.submitted_at, old.reviewed_by, old.reviewed_at, old.review_note,
      old.self_approved, old.application_decision_id, old.applied_month, old.applied_at, old.applied_by, old.closed_reason)
     and not public.ref_rule_reviewing() then
    raise exception 'Le statut d''une proposition ne change que par soumission, approbation, rejet, retrait ou décision D2.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.status <> old.status and not (
    (old.status = 'DRAFT' and new.status in ('SUBMITTED', 'WITHDRAWN', 'SUPERSEDED'))
    or (old.status = 'SUBMITTED' and new.status in ('APPROVED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED'))
    or (old.status = 'APPROVED' and new.status in ('APPLIED', 'WITHDRAWN', 'SUPERSEDED'))
  ) then
    raise exception 'Passage de statut interdit : % → %.', old.status, new.status using errcode = 'check_violation';
  end if;

  if new.status = 'APPROVED' and old.status <> 'APPROVED' then
    if new.reviewed_by is null
       or not public.sys_user_is_active(new.reviewed_by)
       or not public.erp_has_perm('rule_approval', 'update'::public.rbac_action, null, new.reviewed_by) then
      raise exception 'Approbation réservée aux approbateurs des règles légales.' using errcode = 'insufficient_privilege';
    end if;
    v_contrib := public.ref_rule_proposal_contributors(new.id);
    if new.reviewed_by = any (v_contrib) then
      if not public.erp_is_super_admin(new.reviewed_by) then
        raise exception 'Séparation des tâches : un contributeur ne peut pas approuver cette proposition.'
          using errcode = 'insufficient_privilege';
      end if;
      if not new.self_approved then
        raise exception 'Auto-approbation SUPER_ADMIN : elle doit être signalée.' using errcode = 'check_violation';
      end if;
    elsif new.self_approved then
      raise exception 'Auto-approbation signalée à tort : l''approbateur n''a pas contribué.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ref_rule_proposals_guard on public.ref_rule_proposals;
create trigger trg_ref_rule_proposals_guard
  before insert or update or delete on public.ref_rule_proposals
  for each row execute function public.ref_rule_proposals_guard();

alter table public.ref_rule_proposals enable row level security;
alter table public.ref_rule_contributors enable row level security;

drop policy if exists ref_rule_proposals_read on public.ref_rule_proposals;
create policy ref_rule_proposals_read on public.ref_rule_proposals
  for select to authenticated
  using (
    public.erp_has_perm('rule_proposals', 'read'::public.rbac_action, null)
    or public.erp_has_perm('rule_approval', 'read'::public.rbac_action, null)
    or created_by = auth.uid()
  );

drop policy if exists ref_rule_contributors_read on public.ref_rule_contributors;
create policy ref_rule_contributors_read on public.ref_rule_contributors
  for select to authenticated
  using (
    public.erp_has_perm('rule_proposals', 'read'::public.rbac_action, null)
    or public.erp_has_perm('rule_approval', 'read'::public.rbac_action, null)
    or user_id = auth.uid()
  );

revoke insert, update, delete on public.ref_rule_proposals from anon, authenticated;
revoke insert, update, delete on public.ref_rule_contributors from anon, authenticated;
grant select on public.ref_rule_proposals to authenticated;
grant select on public.ref_rule_contributors to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Traceability columns on the rules in force (null = existing value, not verified)
-- ---------------------------------------------------------------------------
alter table public.ref_global_var_versions
  add column if not exists proposal_id uuid references public.ref_rule_proposals(id),
  add column if not exists decision_id uuid references public.sys_decisions(id);

alter table public.hr_social_profile_rates
  add column if not exists proposal_id uuid references public.ref_rule_proposals(id),
  add column if not exists decision_id uuid references public.sys_decisions(id);

alter table public.ref_bareme_irg_versions
  add column if not exists status text not null default 'LEGACY',
  add column if not exists proposal_id uuid references public.ref_rule_proposals(id),
  add column if not exists decision_id uuid references public.sys_decisions(id);
alter table public.ref_bareme_irg_versions alter column status set default 'DRAFT';
alter table public.ref_bareme_irg_versions drop constraint if exists ref_bareme_irg_versions_status_check;
alter table public.ref_bareme_irg_versions add constraint ref_bareme_irg_versions_status_check
  check (status in ('LEGACY', 'DRAFT', 'PROPOSED', 'APPLIED', 'REPLACED'));

alter table public.ref_irg_rule_sets
  add column if not exists status text not null default 'LEGACY',
  add column if not exists proposal_id uuid references public.ref_rule_proposals(id),
  add column if not exists decision_id uuid references public.sys_decisions(id),
  add column if not exists created_by uuid references public.sys_users(id) default auth.uid();
alter table public.ref_irg_rule_sets alter column status set default 'DRAFT';
alter table public.ref_irg_rule_sets drop constraint if exists ref_irg_rule_sets_status_check;
alter table public.ref_irg_rule_sets add constraint ref_irg_rule_sets_status_check
  check (status in ('LEGACY', 'DRAFT', 'PROPOSED', 'APPLIED', 'REPLACED'));

drop trigger if exists trg_hr_social_profile_rates_audit on public.hr_social_profile_rates;
create trigger trg_hr_social_profile_rates_audit
  after insert or update or delete on public.hr_social_profile_rates
  for each row execute function public.sys_audit_row_change();

-- ---------------------------------------------------------------------------
-- 5. D16: dated geographic scope of an IRG zone
-- ---------------------------------------------------------------------------
create table if not exists public.ref_irg_zone_scopes (
  id uuid primary key default gen_random_uuid(),
  zone_code text not null,
  effective_from date not null check (extract(day from effective_from) = 1),
  effective_to date,
  wilaya_codes text[] not null check (cardinality(wilaya_codes) > 0),
  scope_mode text not null check (scope_mode in ('WILAYAS', 'GROUP')),
  group_from text,
  proposal_id uuid not null references public.ref_rule_proposals(id),
  decision_id uuid references public.sys_decisions(id),
  created_by uuid references public.sys_users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  constraint ref_irg_zone_scopes_dates check (effective_to is null or effective_to >= effective_from),
  constraint ref_irg_zone_scopes_no_overlap exclude using gist (
    zone_code with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
);

create index if not exists ref_irg_zone_scopes_from_idx on public.ref_irg_zone_scopes (effective_from);

drop trigger if exists trg_ref_irg_zone_scopes_audit on public.ref_irg_zone_scopes;
create trigger trg_ref_irg_zone_scopes_audit
  after insert or update or delete on public.ref_irg_zone_scopes
  for each row execute function public.sys_audit_row_change();

alter table public.ref_irg_zone_scopes enable row level security;
drop policy if exists ref_irg_zone_scopes_read on public.ref_irg_zone_scopes;
create policy ref_irg_zone_scopes_read on public.ref_irg_zone_scopes for select to authenticated using (true);
revoke insert, update, delete on public.ref_irg_zone_scopes from anon, authenticated;
grant select on public.ref_irg_zone_scopes to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Rules in force: no write outside a D2 application or a verification.
--    IRG drafts (status DRAFT) stay editable; their editors are recorded as contributors.
-- ---------------------------------------------------------------------------
create or replace function public.ref_rule_live_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent text;
begin
  if public.ref_rule_applying() then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'ref_global_var_versions' then
    if tg_op = 'DELETE' then
      if old.proposal_id is null
         and (not exists (select 1 from public.ref_global_vars v where v.id = old.var_id)
              or not public.erp_is_compliance_var(old.var_id)) then
        return old;
      end if;
    elsif not public.erp_is_compliance_var(new.var_id)
          and (tg_op = 'INSERT' or not public.erp_is_compliance_var(old.var_id)) then
      return new;
    end if;
  elsif tg_table_name = 'hr_social_profile_rates' then
    if tg_op = 'DELETE' and old.proposal_id is null
       and not exists (select 1 from public.hr_catalogs c where c.id = old.profile_id) then
      return old;
    end if;
  elsif tg_table_name in ('ref_bareme_irg_versions', 'ref_irg_rule_sets') then
    if tg_op = 'INSERT' and new.status = 'DRAFT' and new.proposal_id is null and new.decision_id is null then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.status = 'DRAFT' and new.status = 'DRAFT'
       and new.proposal_id is null and new.decision_id is null then
      return new;
    end if;
    if tg_op = 'DELETE' and old.status = 'DRAFT' then
      return old;
    end if;
  elsif tg_table_name = 'ref_bareme_irg' then
    if tg_op in ('UPDATE', 'DELETE') then
      select v.status into v_parent from public.ref_bareme_irg_versions v where v.id = old.version_id;
      if tg_op = 'DELETE' and (v_parent is null or v_parent = 'DRAFT') then
        return old;
      end if;
      if v_parent is distinct from 'DRAFT' then
        raise exception '%', public.ref_rule_direct_write_error() using errcode = 'insufficient_privilege';
      end if;
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      select v.status into v_parent from public.ref_bareme_irg_versions v where v.id = new.version_id;
      if v_parent = 'DRAFT' then
        return new;
      end if;
    end if;
  elsif tg_table_name = 'ref_irg_rules' then
    if tg_op in ('UPDATE', 'DELETE') then
      select s.status into v_parent from public.ref_irg_rule_sets s where s.id = old.rule_set_id;
      if tg_op = 'DELETE' and (v_parent is null or v_parent = 'DRAFT') then
        return old;
      end if;
      if v_parent is distinct from 'DRAFT' then
        raise exception '%', public.ref_rule_direct_write_error() using errcode = 'insufficient_privilege';
      end if;
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      select s.status into v_parent from public.ref_irg_rule_sets s where s.id = new.rule_set_id;
      if v_parent = 'DRAFT' then
        return new;
      end if;
    end if;
  end if;
  raise exception '%', public.ref_rule_direct_write_error() using errcode = 'insufficient_privilege';
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ref_global_var_versions', 'hr_social_profile_rates', 'ref_bareme_irg_versions', 'ref_bareme_irg',
    'ref_irg_rule_sets', 'ref_irg_rules', 'ref_irg_zone_scopes'
  ] loop
    execute format('drop trigger if exists trg_%s_rule_guard on public.%I', t, t);
    execute format(
      'create trigger trg_%s_rule_guard before insert or update or delete on public.%I
         for each row execute function public.ref_rule_live_guard()', t, t);
  end loop;
end $$;

create or replace function public.ref_rule_draft_contributors()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_subject uuid;
  v_status text;
  v_role text := 'EDIT';
begin
  if public.ref_rule_applying() or auth.uid() is null then
    return null;
  end if;
  if tg_table_name in ('ref_bareme_irg_versions', 'ref_irg_rule_sets') then
    if tg_op = 'DELETE' then
      return null;
    end if;
    v_kind := case when tg_table_name = 'ref_bareme_irg_versions' then 'IRG_BAREME' else 'IRG_RULES' end;
    v_subject := new.id;
    v_status := new.status;
    if tg_op = 'INSERT' then
      v_role := 'CREATE';
    end if;
  elsif tg_table_name = 'ref_bareme_irg' then
    v_kind := 'IRG_BAREME';
    v_subject := case when tg_op = 'DELETE' then old.version_id else new.version_id end;
    select v.status into v_status from public.ref_bareme_irg_versions v where v.id = v_subject;
  else
    v_kind := 'IRG_RULES';
    v_subject := case when tg_op = 'DELETE' then old.rule_set_id else new.rule_set_id end;
    select s.status into v_status from public.ref_irg_rule_sets s where s.id = v_subject;
  end if;
  if v_status = 'DRAFT' then
    perform public.ref_rule_note_contributor(v_kind, v_subject, v_role);
  end if;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['ref_bareme_irg_versions', 'ref_bareme_irg', 'ref_irg_rule_sets', 'ref_irg_rules'] loop
    execute format('drop trigger if exists trg_%s_rule_contrib on public.%I', t, t);
    execute format(
      'create trigger trg_%s_rule_contrib after insert or update or delete on public.%I
         for each row execute function public.ref_rule_draft_contributors()', t, t);
  end loop;
end $$;

-- Proposers edit IRG drafts (SUPER_ADMIN keeps its existing policies).
drop policy if exists ref_irg_ver_draft_read on public.ref_bareme_irg_versions;
create policy ref_irg_ver_draft_read on public.ref_bareme_irg_versions for select to authenticated
  using (public.erp_has_perm('rule_proposals', 'read'::public.rbac_action, null));
drop policy if exists ref_irg_ver_draft_write on public.ref_bareme_irg_versions;
create policy ref_irg_ver_draft_write on public.ref_bareme_irg_versions for all to authenticated
  using (status = 'DRAFT' and public.erp_has_perm('rule_proposals', 'update'::public.rbac_action, null))
  with check (status = 'DRAFT' and public.erp_has_perm('rule_proposals', 'update'::public.rbac_action, null));

drop policy if exists ref_irg_br_draft_read on public.ref_bareme_irg;
create policy ref_irg_br_draft_read on public.ref_bareme_irg for select to authenticated
  using (public.erp_has_perm('rule_proposals', 'read'::public.rbac_action, null));
drop policy if exists ref_irg_br_draft_write on public.ref_bareme_irg;
create policy ref_irg_br_draft_write on public.ref_bareme_irg for all to authenticated
  using (
    public.erp_has_perm('rule_proposals', 'update'::public.rbac_action, null)
    and exists (select 1 from public.ref_bareme_irg_versions v where v.id = version_id and v.status = 'DRAFT')
  )
  with check (
    public.erp_has_perm('rule_proposals', 'update'::public.rbac_action, null)
    and exists (select 1 from public.ref_bareme_irg_versions v where v.id = version_id and v.status = 'DRAFT')
  );

drop policy if exists ref_irg_rs_draft_read on public.ref_irg_rule_sets;
create policy ref_irg_rs_draft_read on public.ref_irg_rule_sets for select to authenticated
  using (public.erp_has_perm('rule_proposals', 'read'::public.rbac_action, null));
drop policy if exists ref_irg_rs_draft_write on public.ref_irg_rule_sets;
create policy ref_irg_rs_draft_write on public.ref_irg_rule_sets for all to authenticated
  using (status = 'DRAFT' and public.erp_has_perm('rule_proposals', 'update'::public.rbac_action, null))
  with check (status = 'DRAFT' and public.erp_has_perm('rule_proposals', 'update'::public.rbac_action, null));

drop policy if exists ref_irg_rl_draft_read on public.ref_irg_rules;
create policy ref_irg_rl_draft_read on public.ref_irg_rules for select to authenticated
  using (public.erp_has_perm('rule_proposals', 'read'::public.rbac_action, null));
drop policy if exists ref_irg_rl_draft_write on public.ref_irg_rules;
create policy ref_irg_rl_draft_write on public.ref_irg_rules for all to authenticated
  using (
    public.erp_has_perm('rule_proposals', 'update'::public.rbac_action, null)
    and exists (select 1 from public.ref_irg_rule_sets s where s.id = rule_set_id and s.status = 'DRAFT')
  )
  with check (
    public.erp_has_perm('rule_proposals', 'update'::public.rbac_action, null)
    and exists (select 1 from public.ref_irg_rule_sets s where s.id = rule_set_id and s.status = 'DRAFT')
  );

-- ---------------------------------------------------------------------------
-- 7. Existing writers become internal appliers (only inside a D2 application)
-- ---------------------------------------------------------------------------
create or replace function public.hr_set_legal_var_version(
  p_var_id uuid,
  p_from date,
  p_value numeric,
  p_params jsonb default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_var public.ref_global_vars%rowtype;
  v_open date := public.hr_first_open_payroll_month();
  v_same public.ref_global_var_versions%rowtype;
  v_prev public.ref_global_var_versions%rowtype;
  v_src public.ref_global_var_versions%rowtype;
  v_next_from date;
  v_part text;
  v_base text;
  v_reduces boolean;
  v_scope text;
  v_id uuid;
begin
  if not public.ref_rule_applying() then
    raise exception '%', public.ref_rule_direct_write_error() using errcode = 'insufficient_privilege';
  end if;
  if not public.erp_is_compliance_var(p_var_id) then
    raise exception 'Variable hors du périmètre de l''unité 05.' using errcode = 'check_violation';
  end if;
  if p_from is null or p_value is null then
    raise exception 'Mois et valeur requis.' using errcode = 'check_violation';
  end if;
  if extract(day from p_from) <> 1 then
    raise exception 'La date d''effet doit être le 1er d''un mois (la paie lit la valeur du 1er).'
      using errcode = 'check_violation';
  end if;
  if p_from < v_open then
    raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
  end if;

  select * into v_var from public.ref_global_vars where id = p_var_id;

  select * into v_same
  from public.ref_global_var_versions
  where var_id = p_var_id and effective_from = p_from
  for update;

  select * into v_prev
  from public.ref_global_var_versions
  where var_id = p_var_id and effective_from < p_from
  order by effective_from desc
  limit 1
  for update;

  if v_var.contrib_part is not null then
    if v_same.id is not null then
      v_src := v_same;
    else
      v_src := v_prev;
    end if;
    v_part := coalesce(nullif(p_params->>'part', ''), v_src.contrib_part, v_var.contrib_part);
    v_base := coalesce(nullif(p_params->>'base', ''), v_src.contrib_base, v_var.contrib_base, 'COTISABLE');
    v_reduces := coalesce((p_params->>'reduces_irg')::boolean, v_src.contrib_reduces_irg, v_var.contrib_reduces_irg, false);
    v_scope := coalesce(nullif(p_params->>'scope', ''), v_src.contrib_scope, v_var.contrib_scope, 'ALL');
    if v_part = 'EMPLOYER' then
      v_reduces := false;
    end if;
  end if;

  if v_same.id is not null then
    update public.ref_global_var_versions
    set value_numeric = p_value,
        contrib_part = v_part,
        contrib_base = case when v_part is null then null else v_base end,
        contrib_reduces_irg = case when v_part is null then null else v_reduces end,
        contrib_scope = case when v_part is null then null else v_scope end,
        created_by = auth.uid()
    where id = v_same.id;
    v_id := v_same.id;
  else
    select min(effective_from) into v_next_from
    from public.ref_global_var_versions
    where var_id = p_var_id and effective_from > p_from;

    if v_prev.id is not null and (v_prev.effective_to is null or v_prev.effective_to >= p_from) then
      update public.ref_global_var_versions
      set effective_to = p_from - 1
      where id = v_prev.id;
    end if;

    insert into public.ref_global_var_versions (
      var_id, value_numeric, effective_from, effective_to, created_by,
      contrib_part, contrib_base, contrib_reduces_irg, contrib_scope
    )
    values (
      p_var_id, p_value, p_from,
      case when v_next_from is null then null else v_next_from - 1 end,
      auth.uid(),
      v_part,
      case when v_part is null then null else v_base end,
      case when v_part is null then null else v_reduces end,
      case when v_part is null then null else v_scope end
    )
    returning id into v_id;
  end if;

  perform public.hr_sync_contribution_columns(p_var_id);
  return v_id;
end;
$$;

create or replace function public.hr_stop_legal_var(p_var_id uuid, p_from date)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_var public.ref_global_vars%rowtype;
  v_open date := public.hr_first_open_payroll_month();
begin
  if not public.ref_rule_applying() then
    raise exception '%', public.ref_rule_direct_write_error() using errcode = 'insufficient_privilege';
  end if;
  select * into v_var from public.ref_global_vars where id = p_var_id;
  if v_var.id is null or not public.erp_is_compliance_key(v_var.key) then
    raise exception 'Cotisation introuvable.' using errcode = 'no_data_found';
  end if;
  if v_var.is_system or v_var.contrib_part is null then
    raise exception 'Seules les cotisations ajoutées peuvent être arrêtées.' using errcode = 'check_violation';
  end if;
  if p_from is null or extract(day from p_from) <> 1 then
    raise exception 'La date d''arrêt doit être le 1er d''un mois.' using errcode = 'check_violation';
  end if;
  if p_from < v_open then
    raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
  end if;

  delete from public.ref_global_var_versions where var_id = p_var_id and effective_from >= p_from;
  update public.ref_global_var_versions
  set effective_to = p_from - 1
  where var_id = p_var_id
    and effective_from < p_from
    and (effective_to is null or effective_to >= p_from);
end;
$$;

create or replace function public.hr_set_social_profile_rates(
  p_profile_id uuid,
  p_from date,
  p_employee numeric,
  p_employer numeric,
  p_fos numeric
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_open date := public.hr_first_open_payroll_month();
  v_same uuid;
  v_prev public.hr_social_profile_rates%rowtype;
  v_next_from date;
  v_id uuid;
begin
  if not public.ref_rule_applying() then
    raise exception '%', public.ref_rule_direct_write_error() using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.hr_catalogs where id = p_profile_id and kind = 'social_profile') then
    raise exception 'Régime introuvable.' using errcode = 'no_data_found';
  end if;
  if p_from is null or extract(day from p_from) <> 1 then
    raise exception 'La date d''effet doit être le 1er d''un mois.' using errcode = 'check_violation';
  end if;
  if p_from < v_open then
    raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
  end if;

  select id into v_same
  from public.hr_social_profile_rates
  where profile_id = p_profile_id and effective_from = p_from
  for update;
  if v_same is not null then
    update public.hr_social_profile_rates
    set employee_pct = p_employee, employer_pct = p_employer, fos_pct = p_fos, created_by = auth.uid()
    where id = v_same;
    return v_same;
  end if;

  select * into v_prev
  from public.hr_social_profile_rates
  where profile_id = p_profile_id and effective_from < p_from
  order by effective_from desc
  limit 1
  for update;
  select min(effective_from) into v_next_from
  from public.hr_social_profile_rates
  where profile_id = p_profile_id and effective_from > p_from;

  if v_prev.id is not null and (v_prev.effective_to is null or v_prev.effective_to >= p_from) then
    update public.hr_social_profile_rates set effective_to = p_from - 1 where id = v_prev.id;
  end if;

  insert into public.hr_social_profile_rates (profile_id, employee_pct, employer_pct, fos_pct, effective_from, effective_to)
  values (p_profile_id, p_employee, p_employer, p_fos, p_from, case when v_next_from is null then null else v_next_from - 1 end)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Rule content, labels and payload validation
-- ---------------------------------------------------------------------------
create or replace function public.ref_rule_row_content(p_family text, p_row uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case p_family
    when 'LEGAL_VAR' then (
      select jsonb_build_object(
        'row_id', x.id, 'value', x.value_numeric, 'effective_from', x.effective_from, 'effective_to', x.effective_to,
        'params', case when x.contrib_part is null then null else jsonb_build_object(
          'part', x.contrib_part, 'base', x.contrib_base, 'reduces_irg', x.contrib_reduces_irg, 'scope', x.contrib_scope) end,
        'verified', x.proposal_id is not null, 'proposal_id', x.proposal_id, 'decision_id', x.decision_id)
      from public.ref_global_var_versions x where x.id = p_row)
    when 'CNAS_RATES' then (
      select jsonb_build_object(
        'row_id', x.id, 'employee_pct', x.employee_pct, 'employer_pct', x.employer_pct, 'fos_pct', x.fos_pct,
        'effective_from', x.effective_from, 'effective_to', x.effective_to,
        'verified', x.proposal_id is not null, 'proposal_id', x.proposal_id, 'decision_id', x.decision_id)
      from public.hr_social_profile_rates x where x.id = p_row)
    when 'IRG_BAREME' then (
      select jsonb_build_object(
        'row_id', v.id, 'code', v.code, 'label', v.label_fr, 'source_ref', v.source_ref, 'status', v.status,
        'effective_from', v.effective_from, 'effective_to', v.effective_to,
        'verified', v.status = 'APPLIED', 'proposal_id', v.proposal_id, 'decision_id', v.decision_id,
        'brackets', coalesce((
          select jsonb_agg(jsonb_build_object('min_annual', b.min_annual, 'max_annual', b.max_annual, 'rate', b.rate)
                           order by b.sort_order, b.min_annual)
          from public.ref_bareme_irg b where b.version_id = v.id), '[]'::jsonb))
      from public.ref_bareme_irg_versions v where v.id = p_row)
    when 'IRG_RULES' then (
      select jsonb_build_object(
        'row_id', s.id, 'code', s.code, 'label', s.label_fr, 'taxpayer_category', s.taxpayer_category, 'status', s.status,
        'effective_from', s.effective_from, 'effective_to', s.effective_to,
        'verified', s.status = 'APPLIED', 'proposal_id', s.proposal_id, 'decision_id', s.decision_id,
        'rules', coalesce((
          select jsonb_agg(jsonb_build_object('kind', r.kind, 'applies_to', r.applies_to, 'sequence', r.sequence,
                                              'params', r.params, 'formula', r.formula)
                           order by r.sequence, r.id)
          from public.ref_irg_rules r where r.rule_set_id = s.id), '[]'::jsonb))
      from public.ref_irg_rule_sets s where s.id = p_row)
    when 'IRG_ZONE_SCOPE' then (
      select jsonb_build_object(
        'row_id', z.id, 'zone_code', z.zone_code, 'effective_from', z.effective_from, 'effective_to', z.effective_to,
        'scope_mode', z.scope_mode, 'group_from', z.group_from, 'wilaya_codes', to_jsonb(z.wilaya_codes),
        'wilayas', coalesce((
          select jsonb_agg(w.code || ' ' || w.name_fr order by w.sort_order)
          from public.ref_wilayas w where w.code = any (z.wilaya_codes)), '[]'::jsonb),
        'verified', true, 'proposal_id', z.proposal_id, 'decision_id', z.decision_id)
      from public.ref_irg_zone_scopes z where z.id = p_row)
  end;
$$;

create or replace function public.ref_rule_verify_hash(p_family text, p_row uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(coalesce((public.ref_rule_row_content(p_family, p_row) - 'verified' - 'proposal_id' - 'decision_id' - 'status')::text, ''));
$$;

create or replace function public.ref_rule_target_label(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case p.family
    when 'LEGAL_VAR' then coalesce(
      (select v.label_fr || ' (' || v.key || ')' from public.ref_global_vars v where v.id = p.target_id),
      (select v.label_fr || ' (' || v.key || ')' from public.ref_global_var_versions x
         join public.ref_global_vars v on v.id = x.var_id where x.id = p.target_id))
    when 'CNAS_RATES' then coalesce(
      (select 'Régime CNAS ' || c.label_fr from public.hr_catalogs c where c.id = p.target_id),
      (select 'Régime CNAS ' || c.label_fr from public.hr_social_profile_rates x
         join public.hr_catalogs c on c.id = x.profile_id where x.id = p.target_id))
    when 'IRG_BAREME' then (select 'Barème IRG ' || v.code || ' — ' || v.label_fr from public.ref_bareme_irg_versions v where v.id = p.target_id)
    when 'IRG_RULES' then (select 'Règles IRG ' || s.code || ' (' || s.taxpayer_category || ')' from public.ref_irg_rule_sets s where s.id = p.target_id)
    when 'IRG_ZONE_SCOPE' then 'Zone IRG ' || p.target_key || coalesce(
      (select ' — ' || c.label_fr from public.hr_catalogs c where c.kind = 'irg_zone' and c.code = p.target_key limit 1), '')
  end
  from public.ref_rule_proposals p
  where p.id = p_id;
$$;

-- Normalised payload; raises with a readable message when the proposal cannot be accepted at this stage.
create or replace function public.ref_rule_check_payload(
  p_family text,
  p_action text,
  p_target uuid,
  p_key text,
  p_payload jsonb,
  p_stage text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_var public.ref_global_vars%rowtype;
  v_params jsonb;
  v_status text;
  v_num numeric;
  v_codes text[];
  v_bad text;
  v_pct jsonb := '{}'::jsonb;
  k text;
begin
  p_payload := coalesce(p_payload, '{}'::jsonb);
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Contenu de la proposition invalide.' using errcode = 'check_violation';
  end if;

  if p_action = 'VERIFY' then
    if p_family = 'LEGAL_VAR' then
      if not exists (
        select 1 from public.ref_global_var_versions x
        where x.id = p_target and x.proposal_id is null and public.erp_is_compliance_var(x.var_id)
      ) then
        raise exception 'Valeur introuvable ou déjà vérifiée.' using errcode = 'check_violation';
      end if;
    elsif p_family = 'CNAS_RATES' then
      if not exists (select 1 from public.hr_social_profile_rates x where x.id = p_target and x.proposal_id is null) then
        raise exception 'Taux introuvables ou déjà vérifiés.' using errcode = 'check_violation';
      end if;
    elsif p_family = 'IRG_BAREME' then
      if not exists (select 1 from public.ref_bareme_irg_versions v where v.id = p_target and v.status = 'LEGACY') then
        raise exception 'Seul un barème repris (non vérifié) peut être soumis à vérification.' using errcode = 'check_violation';
      end if;
    elsif p_family = 'IRG_RULES' then
      if not exists (select 1 from public.ref_irg_rule_sets s where s.id = p_target and s.status = 'LEGACY') then
        raise exception 'Seul un jeu de règles repris (non vérifié) peut être soumis à vérification.' using errcode = 'check_violation';
      end if;
    else
      raise exception 'Vérification non prévue pour cette famille.' using errcode = 'check_violation';
    end if;
    if p_stage = 'APPROVE' then
      return p_payload;
    end if;
    return jsonb_build_object(
      'snapshot', public.ref_rule_row_content(p_family, p_target),
      'snapshot_hash', public.ref_rule_verify_hash(p_family, p_target)
    );
  end if;

  if p_family = 'LEGAL_VAR' then
    select * into v_var from public.ref_global_vars where id = p_target;
    if not found or not public.erp_is_compliance_key(v_var.key) then
      raise exception 'Variable légale introuvable.' using errcode = 'check_violation';
    end if;
    if p_action = 'STOP' then
      if v_var.is_system or v_var.contrib_part is null then
        raise exception 'Seules les cotisations ajoutées peuvent être arrêtées.' using errcode = 'check_violation';
      end if;
      return '{}'::jsonb;
    end if;
    if jsonb_typeof(p_payload->'value') <> 'number' then
      raise exception 'Valeur numérique requise.' using errcode = 'check_violation';
    end if;
    v_num := (p_payload->>'value')::numeric;
    if v_num < 0 then
      raise exception 'Valeur négative refusée.' using errcode = 'check_violation';
    end if;
    v_params := p_payload->'params';
    if v_params is not null and jsonb_typeof(v_params) = 'object' then
      if v_var.contrib_part is null then
        v_params := null;
      elsif coalesce(v_params->>'part', '') not in ('', 'EMPLOYEE', 'EMPLOYER')
         or coalesce(v_params->>'base', '') not in ('', 'COTISABLE', 'TAXABLE')
         or coalesce(v_params->>'scope', '') not in ('', 'ALL', 'CACOBATPH_CONGES', 'CACOBATPH_INTEMPERIES')
         or coalesce(jsonb_typeof(v_params->'reduces_irg'), 'boolean') not in ('boolean', 'null') then
        raise exception 'Paramètres de cotisation invalides.' using errcode = 'check_violation';
      end if;
    else
      v_params := null;
    end if;
    return jsonb_build_object(
      'value', v_num,
      'params', v_params,
      'deviations', case when jsonb_typeof(p_payload->'deviations') = 'array' then p_payload->'deviations' else '[]'::jsonb end
    );
  end if;

  if p_family = 'CNAS_RATES' then
    if not exists (select 1 from public.hr_catalogs c where c.id = p_target and c.kind = 'social_profile') then
      raise exception 'Régime CNAS introuvable.' using errcode = 'check_violation';
    end if;
    foreach k in array array['employee_pct', 'employer_pct', 'fos_pct'] loop
      if p_payload->k is null or jsonb_typeof(p_payload->k) = 'null' then
        v_pct := v_pct || jsonb_build_object(k, null);
      elsif jsonb_typeof(p_payload->k) <> 'number'
            or (p_payload->>k)::numeric < 0 or (p_payload->>k)::numeric > 100 then
        raise exception 'Taux CNAS invalide (0 à 100 %%).' using errcode = 'check_violation';
      else
        v_pct := v_pct || jsonb_build_object(k, (p_payload->>k)::numeric);
      end if;
    end loop;
    return v_pct || jsonb_build_object(
      'deviations', case when jsonb_typeof(p_payload->'deviations') = 'array' then p_payload->'deviations' else '[]'::jsonb end
    );
  end if;

  if p_family = 'IRG_BAREME' then
    select v.status into v_status from public.ref_bareme_irg_versions v where v.id = p_target;
    if v_status is null then
      raise exception 'Brouillon de barème introuvable.' using errcode = 'check_violation';
    end if;
    if (p_stage in ('SAVE', 'SUBMIT') and v_status <> 'DRAFT') or (p_stage = 'APPROVE' and v_status <> 'PROPOSED') then
      raise exception 'Le barème proposé doit être un brouillon (statut actuel : %).', v_status using errcode = 'check_violation';
    end if;
    if p_stage <> 'SAVE' and not exists (select 1 from public.ref_bareme_irg b where b.version_id = p_target) then
      raise exception 'Barème vide : ajoutez au moins une tranche.' using errcode = 'check_violation';
    end if;
    return '{}'::jsonb;
  end if;

  if p_family = 'IRG_RULES' then
    select s.status into v_status from public.ref_irg_rule_sets s where s.id = p_target;
    if v_status is null then
      raise exception 'Brouillon de règles introuvable.' using errcode = 'check_violation';
    end if;
    if (p_stage in ('SAVE', 'SUBMIT') and v_status <> 'DRAFT') or (p_stage = 'APPROVE' and v_status <> 'PROPOSED') then
      raise exception 'Le jeu de règles proposé doit être un brouillon (statut actuel : %).', v_status using errcode = 'check_violation';
    end if;
    return '{}'::jsonb;
  end if;

  if p_family = 'IRG_ZONE_SCOPE' then
    if not exists (select 1 from public.hr_catalogs c where c.kind = 'irg_zone' and c.code = p_key) then
      raise exception 'Zone IRG inconnue.' using errcode = 'check_violation';
    end if;
    if coalesce(p_payload->>'mode', '') not in ('WILAYAS', 'GROUP') then
      raise exception 'Mode de portée requis : sélection de wilayas ou groupement.' using errcode = 'check_violation';
    end if;
    if p_payload->>'mode' = 'GROUP' and coalesce(btrim(p_payload->>'group_from'), '') = '' then
      raise exception 'Indiquez le groupement repris.' using errcode = 'check_violation';
    end if;
    if jsonb_typeof(p_payload->'wilayas') <> 'array' then
      raise exception 'Sélectionnez au moins une wilaya.' using errcode = 'check_violation';
    end if;
    select coalesce(array_agg(distinct x order by x), '{}'::text[]) into v_codes
    from jsonb_array_elements_text(p_payload->'wilayas') as t(x);
    if cardinality(v_codes) = 0 then
      raise exception 'Sélectionnez au moins une wilaya.' using errcode = 'check_violation';
    end if;
    select string_agg(c, ', ') into v_bad from unnest(v_codes) as c
    where not exists (select 1 from public.ref_wilayas w where w.code = c);
    if v_bad is not null then
      raise exception 'Wilaya(s) inconnue(s) : %.', v_bad using errcode = 'check_violation';
    end if;
    return jsonb_build_object(
      'mode', p_payload->>'mode',
      'group_from', nullif(btrim(coalesce(p_payload->>'group_from', '')), ''),
      'wilayas', to_jsonb(v_codes)
    );
  end if;

  raise exception 'Famille de règle inconnue.' using errcode = 'check_violation';
end;
$$;

-- Row of the target in force on the 1st of p_month (what the proposal would replace).
create or replace function public.ref_rule_current_row(p_id uuid, p_month date)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case p.family
    when 'LEGAL_VAR' then (
      select x.id from public.ref_global_var_versions x
      where x.var_id = p.target_id and x.effective_from <= p_month and (x.effective_to is null or x.effective_to >= p_month)
      order by x.effective_from desc limit 1)
    when 'CNAS_RATES' then (
      select x.id from public.hr_social_profile_rates x
      where x.profile_id = p.target_id and x.effective_from <= p_month and (x.effective_to is null or x.effective_to >= p_month)
      order by x.effective_from desc limit 1)
    when 'IRG_BAREME' then (
      select v.id from public.ref_bareme_irg_versions v
      where v.status in ('LEGACY', 'APPLIED') and v.effective_from <= p_month
        and (v.effective_to is null or v.effective_to >= p_month)
      order by v.effective_from desc limit 1)
    when 'IRG_RULES' then (
      select s.id from public.ref_irg_rule_sets s
      where s.status in ('LEGACY', 'APPLIED') and s.effective_from <= p_month
        and (s.effective_to is null or s.effective_to >= p_month)
        and s.taxpayer_category = (select d.taxpayer_category from public.ref_irg_rule_sets d where d.id = p.target_id)
      order by s.effective_from desc limit 1)
    when 'IRG_ZONE_SCOPE' then (
      select z.id from public.ref_irg_zone_scopes z
      where z.zone_code = p.target_key and z.effective_from <= p_month and (z.effective_to is null or z.effective_to >= p_month)
      order by z.effective_from desc limit 1)
  end
  from public.ref_rule_proposals p
  where p.id = p_id;
$$;

create or replace function public.ref_rule_current_content(p_id uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  p public.ref_rule_proposals%rowtype;
  v_row uuid;
begin
  select * into p from public.ref_rule_proposals where id = p_id;
  if not found then
    return null;
  end if;
  if p.action = 'VERIFY' then
    return public.ref_rule_row_content(p.family, p.target_id);
  end if;
  v_row := public.ref_rule_current_row(p.id, coalesce(p_month, p.requested_month, current_date));
  if v_row is not null then
    return public.ref_rule_row_content(p.family, v_row);
  end if;
  if p.family = 'IRG_ZONE_SCOPE' then
    return jsonb_build_object(
      'source', 'catalog',
      'wilayas', coalesce((
        select jsonb_agg(c.label_fr order by c.sort_order, c.label_fr)
        from public.hr_catalogs c
        where c.kind = 'irg_zone_wilaya' and c.is_active and c.extra->>'zone' = p.target_key), '[]'::jsonb)
    );
  end if;
  return null;
end;
$$;

create or replace function public.ref_rule_proposal_content(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p.action = 'VERIFY' then p.payload->'snapshot'
    when p.family in ('IRG_BAREME', 'IRG_RULES') then public.ref_rule_row_content(p.family, p.target_id)
    when p.family = 'IRG_ZONE_SCOPE' then p.payload || jsonb_build_object(
      'wilaya_labels', coalesce((
        select jsonb_agg(w.code || ' ' || w.name_fr order by w.sort_order)
        from public.ref_wilayas w
        where w.code in (select jsonb_array_elements_text(p.payload->'wilayas'))), '[]'::jsonb))
    else p.payload
  end
  from public.ref_rule_proposals p
  where p.id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- 9. D2: fingerprint, context, request, application
-- ---------------------------------------------------------------------------
create or replace function public.ref_rule_target_state(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case p.family
    when 'LEGAL_VAR' then (
      select string_agg(concat_ws('|', x.id, x.effective_from, x.effective_to, x.value_numeric, x.contrib_part,
                                  x.contrib_base, x.contrib_reduces_irg, x.contrib_scope, x.proposal_id), ',' order by x.effective_from, x.id)
      from public.ref_global_var_versions x where x.var_id = p.target_id)
    when 'CNAS_RATES' then (
      select string_agg(concat_ws('|', x.id, x.effective_from, x.effective_to, x.employee_pct, x.employer_pct, x.fos_pct, x.proposal_id),
                        ',' order by x.effective_from, x.id)
      from public.hr_social_profile_rates x where x.profile_id = p.target_id)
    when 'IRG_BAREME' then concat_ws('#',
      (select string_agg(concat_ws('|', v.id, v.status, v.effective_from, v.effective_to), ',' order by v.effective_from, v.id)
       from public.ref_bareme_irg_versions v where v.status <> 'DRAFT'),
      (select string_agg(concat_ws('|', b.id, b.min_annual, b.max_annual, b.rate, b.sort_order), ',' order by b.sort_order, b.id)
       from public.ref_bareme_irg b where b.version_id = p.target_id))
    when 'IRG_RULES' then concat_ws('#',
      (select string_agg(concat_ws('|', s.id, s.status, s.effective_from, s.effective_to), ',' order by s.effective_from, s.id)
       from public.ref_irg_rule_sets s
       where s.status <> 'DRAFT'
         and s.taxpayer_category = (select d.taxpayer_category from public.ref_irg_rule_sets d where d.id = p.target_id)),
      (select string_agg(concat_ws('|', r.id, r.kind, r.applies_to, r.sequence, r.params::text, r.formula), ',' order by r.sequence, r.id)
       from public.ref_irg_rules r where r.rule_set_id = p.target_id))
    when 'IRG_ZONE_SCOPE' then (
      select string_agg(concat_ws('|', z.id, z.zone_code, z.effective_from, z.effective_to, array_to_string(z.wilaya_codes, ' ')),
                        ',' order by z.zone_code, z.effective_from)
      from public.ref_irg_zone_scopes z)
  end
  from public.ref_rule_proposals p
  where p.id = p_id;
$$;

create or replace function public.ref_rule_first_month(p_id uuid, p_month date)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select least(coalesce(date_trunc('month', p.text_effective_date)::date, p_month), p_month)
  from public.ref_rule_proposals p
  where p.id = p_id;
$$;

create or replace function public.ref_rule_application_fingerprint(p_id uuid, p_month date)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(concat_ws('|',
    p.status, p.updated_at, p_month, public.hr_first_open_payroll_month(),
    public.ref_rule_target_state(p.id),
    (select string_agg(r.id::text || ':' || r.status_code, ',' order by r.id)
     from public.hr_payroll_runs r
     where make_date(r.period_year, r.period_month, 1) >= public.ref_rule_first_month(p.id, p_month))
  ))
  from public.ref_rule_proposals p
  where p.id = p_id;
$$;

create or replace function public.ref_rule_application_context(p_id uuid, p_month date, p_date date)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'proposal_id', p.id,
    'family', p.family,
    'action', p.action,
    'title', p.title,
    'target_label', public.ref_rule_target_label(p.id),
    'source_ref', p.source_ref,
    'text_effective_date', p.text_effective_date,
    'requested_month', p.requested_month,
    'approved_at', p.reviewed_at,
    'approved_by', (select u.full_name from public.sys_users u where u.id = p.reviewed_by),
    'self_approved', p.self_approved,
    'contributors', coalesce((
      select jsonb_agg(distinct u.full_name)
      from public.sys_users u where u.id = any (public.ref_rule_proposal_contributors(p.id))), '[]'::jsonb),
    'application_month', p_month,
    'application_date', p_date,
    'first_open_month', public.hr_first_open_payroll_month(),
    'period_nature', public.sys_period_nature(extract(year from p_month)::integer, extract(month from p_month)::integer),
    'current', public.ref_rule_current_content(p.id, p_month),
    'proposed', public.ref_rule_proposal_content(p.id),
    'slips', coalesce((
      select jsonb_agg(q.x order by q.x->>'period_key', q.x->>'status')
      from (
        select jsonb_build_object(
          'period_key', to_char(make_date(r.period_year, r.period_month, 1), 'YYYY-MM'),
          'period', public.sys_period_label(r.period_year, r.period_month),
          'status', r.status_code,
          'runs', count(distinct r.id),
          'slips', count(s.id),
          'affected', r.status_code = 'DRAFT' and make_date(r.period_year, r.period_month, 1) >= p_month
        ) as x
        from public.hr_payroll_runs r
        left join public.hr_payroll_slips s on s.run_id = r.id
        where make_date(r.period_year, r.period_month, 1) >= public.ref_rule_first_month(p.id, p_month)
        group by r.period_year, r.period_month, r.status_code
      ) q), '[]'::jsonb)
  )
  from public.ref_rule_proposals p
  where p.id = p_id;
$$;

create or replace function public.ref_rule_request_application_internal(p_id uuid, p_month date, p_date date)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.ref_rule_proposals%rowtype;
  v_open date := public.hr_first_open_payroll_month();
  v_key text;
  v_existing public.sys_decisions%rowtype;
  v_ctx jsonb;
  v_id uuid;
begin
  select * into p from public.ref_rule_proposals where id = p_id for update;
  if not found then
    raise exception 'Proposition introuvable.' using errcode = 'no_data_found';
  end if;
  if p.status <> 'APPROVED' or p.action = 'VERIFY' then
    raise exception 'Seule une modification approuvée et non appliquée reçoit une date d''application.' using errcode = 'check_violation';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Le mois d''application commence le 1er.' using errcode = 'check_violation';
  end if;
  if p_month < v_open then
    raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
  end if;
  if p_date is not null
     and p_month <> date_trunc('month', p_date)::date
     and p_month <> (date_trunc('month', p_date) + interval '1 month')::date then
    raise exception 'La date choisie (%) se rattache à son mois ou au mois suivant, pas à %.',
      to_char(p_date, 'DD/MM/YYYY'), to_char(p_month, 'MM/YYYY') using errcode = 'check_violation';
  end if;

  v_key := 'D2:' || p.id::text;
  select * into v_existing from public.sys_decisions
  where dedupe_key = v_key and status in ('PENDING', 'DECIDED')
  for update;
  if found then
    if (v_existing.scope->>'month')::date = p_month
       and (v_existing.scope->>'date') is not distinct from (p_date::text) then
      return v_existing.id;
    end if;
    perform public.sys_decision_close_internal(v_existing.id, 'SUPERSEDED', 'Nouvelle date d''application demandée.');
  end if;

  v_ctx := public.ref_rule_application_context(p.id, p_month, p_date);
  insert into public.sys_decisions (
    type_code, dedupe_key, period_year, period_month, scope, context, options, fingerprint, request_source, requested_by
  )
  select 'D2', v_key, extract(year from p_month)::integer, extract(month from p_month)::integer,
         jsonb_build_object('proposal_id', p.id, 'month', p_month, 'date', p_date),
         v_ctx, t.options, public.ref_rule_application_fingerprint(p.id, p_month), 'RULE_APPROVAL', auth.uid()
  from public.sys_decision_types t
  where t.code = 'D2'
  returning id into v_id;

  perform set_config('ref.rule_review', 'on', true);
  update public.ref_rule_proposals set application_decision_id = v_id where id = p.id;

  perform public.sys_notify(
    'DECISION_PENDING',
    format('Date d''application : %s (%s)', p.title, to_char(p_month, 'MM/YYYY')),
    'Règle légale approuvée, sans effet tant que sa date d''application n''est pas décidée.',
    '/decisions/' || v_id,
    null,
    'decision_rule_application',
    v_id
  );
  return v_id;
end;
$$;

create or replace function public.ref_rule_apply_irg_version(p_family text, p_draft uuid, p_month date, p_prop uuid, p_decision uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_cat text;
  v_next date;
  v_replaced uuid[];
begin
  if p_family = 'IRG_BAREME' then
    select status into v_status from public.ref_bareme_irg_versions where id = p_draft for update;
    if v_status is distinct from 'PROPOSED' then
      raise exception 'Barème proposé introuvable ou déjà traité.' using errcode = 'check_violation';
    end if;
    select coalesce(array_agg(id), '{}'::uuid[]) into v_replaced
    from public.ref_bareme_irg_versions where status in ('LEGACY', 'APPLIED') and effective_from = p_month;
    update public.ref_bareme_irg_versions set status = 'REPLACED' where id = any (v_replaced);
    update public.ref_bareme_irg_versions set effective_to = p_month - 1
    where status in ('LEGACY', 'APPLIED') and effective_from < p_month and (effective_to is null or effective_to >= p_month);
    select min(effective_from) into v_next
    from public.ref_bareme_irg_versions where status in ('LEGACY', 'APPLIED') and effective_from > p_month;
    update public.ref_bareme_irg_versions set
      status = 'APPLIED', effective_from = p_month, effective_to = v_next - 1,
      proposal_id = p_prop, decision_id = p_decision
    where id = p_draft;
  else
    select status, taxpayer_category into v_status, v_cat from public.ref_irg_rule_sets where id = p_draft for update;
    if v_status is distinct from 'PROPOSED' then
      raise exception 'Jeu de règles proposé introuvable ou déjà traité.' using errcode = 'check_violation';
    end if;
    select coalesce(array_agg(id), '{}'::uuid[]) into v_replaced
    from public.ref_irg_rule_sets
    where status in ('LEGACY', 'APPLIED') and taxpayer_category = v_cat and effective_from = p_month;
    update public.ref_irg_rule_sets set status = 'REPLACED' where id = any (v_replaced);
    update public.ref_irg_rule_sets set effective_to = p_month - 1
    where status in ('LEGACY', 'APPLIED') and taxpayer_category = v_cat
      and effective_from < p_month and (effective_to is null or effective_to >= p_month);
    select min(effective_from) into v_next
    from public.ref_irg_rule_sets
    where status in ('LEGACY', 'APPLIED') and taxpayer_category = v_cat and effective_from > p_month;
    update public.ref_irg_rule_sets set
      status = 'APPLIED', effective_from = p_month, effective_to = v_next - 1,
      proposal_id = p_prop, decision_id = p_decision
    where id = p_draft;
  end if;
  return jsonb_build_object('row_id', p_draft, 'replaced', to_jsonb(v_replaced), 'effective_to', v_next - 1);
end;
$$;

create or replace function public.ref_rule_apply_zone_scope(p_prop uuid, p_month date, p_decision uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.ref_rule_proposals%rowtype;
  v_codes text[];
  v_conflicts text;
  v_next date;
  v_id uuid;
begin
  select * into p from public.ref_rule_proposals where id = p_prop;
  select coalesce(array_agg(x order by x), '{}'::text[]) into v_codes
  from jsonb_array_elements_text(p.payload->'wilayas') as t(x);
  select string_agg(distinct w.code || ' ' || w.name_fr || ' (' || z.zone_code || ')', ', ') into v_conflicts
  from public.ref_irg_zone_scopes z
  cross join unnest(z.wilaya_codes) as c(code)
  join public.ref_wilayas w on w.code = c.code
  where z.zone_code <> p.target_key
    and (z.effective_to is null or z.effective_to >= p_month)
    and c.code = any (v_codes);
  if v_conflicts is not null then
    raise exception 'Wilaya(s) déjà rattachée(s) à une autre zone à partir de ce mois : %.', v_conflicts
      using errcode = 'check_violation';
  end if;
  delete from public.ref_irg_zone_scopes where zone_code = p.target_key and effective_from = p_month;
  update public.ref_irg_zone_scopes set effective_to = p_month - 1
  where zone_code = p.target_key and effective_from < p_month and (effective_to is null or effective_to >= p_month);
  select min(effective_from) into v_next
  from public.ref_irg_zone_scopes where zone_code = p.target_key and effective_from > p_month;
  insert into public.ref_irg_zone_scopes (
    zone_code, effective_from, effective_to, wilaya_codes, scope_mode, group_from, proposal_id, decision_id
  ) values (
    p.target_key, p_month, v_next - 1, v_codes, p.payload->>'mode', p.payload->>'group_from', p.id, p_decision
  )
  returning id into v_id;
  return jsonb_build_object('row_id', v_id, 'effective_to', v_next - 1);
end;
$$;

-- Draft payroll runs of the application month and after: one whole-run change, then a D3 request.
alter table public.hr_payroll_input_changes drop constraint if exists hr_payroll_input_changes_source_check;
alter table public.hr_payroll_input_changes add constraint hr_payroll_input_changes_source_check check (source in (
  'ATTENDANCE', 'CONTRACT', 'SALARY', 'SALARY_HISTORY', 'EXCEPTION', 'EXIT', 'LEAVE', 'ADVANCE', 'COMPLIANCE',
  'ASSIGNMENT', 'SITE_WILAYA', 'LEGAL_RULE'
));

create or replace function public.ref_rule_signal_drafts(p_from date, p_detail text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run uuid;
  n integer := 0;
begin
  for v_run in
    select r.id from public.hr_payroll_runs r
    where r.status_code = 'DRAFT' and make_date(r.period_year, r.period_month, 1) >= p_from
    order by r.period_year, r.period_month, r.id
  loop
    insert into public.hr_payroll_input_changes (run_id, employee_id, source, detail, changed_by)
    values (v_run, null, 'LEGAL_RULE', left(p_detail, 300), auth.uid())
    on conflict (run_id, coalesce(employee_id, '00000000-0000-0000-0000-000000000000'::uuid), source)
      where resolved_at is null
    do update set changed_at = now(), changed_by = excluded.changed_by, detail = excluded.detail;
    perform public.hr_payroll_upsert_recalc_request(v_run, 'LEGAL_RULE', true);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.ref_rule_apply_d2(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.sys_decisions%rowtype;
  p public.ref_rule_proposals%rowtype;
  v_month date;
  v_open date := public.hr_first_open_payroll_month();
  v_row uuid;
  v_detail jsonb := '{}'::jsonb;
  v_flagged integer;
  v_result jsonb;
begin
  select * into d from public.sys_decisions where id = p_id and type_code = 'D2' and status = 'DECIDED' for update;
  if not found then
    raise exception 'Décision D2 introuvable ou non décidée.' using errcode = 'no_data_found';
  end if;
  select * into p from public.ref_rule_proposals where id = (d.scope->>'proposal_id')::uuid for update;
  if not found or p.status <> 'APPROVED' then
    raise exception 'Proposition introuvable ou plus approuvée.' using errcode = 'check_violation';
  end if;
  v_month := (d.scope->>'month')::date;
  if v_month < v_open then
    raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
  end if;
  perform public.ref_rule_check_payload(p.family, p.action, p.target_id, p.target_key, p.payload, 'APPROVE');

  perform set_config('ref.rule_apply', 'on', true);
  if p.family = 'LEGAL_VAR' and p.action = 'SET' then
    v_row := public.hr_set_legal_var_version(p.target_id, v_month, (p.payload->>'value')::numeric, p.payload->'params');
    update public.ref_global_var_versions set proposal_id = p.id, decision_id = d.id where id = v_row;
    v_detail := jsonb_build_object('row_id', v_row);
  elsif p.family = 'LEGAL_VAR' and p.action = 'STOP' then
    perform public.hr_stop_legal_var(p.target_id, v_month);
    v_detail := jsonb_build_object('stopped_from', v_month);
  elsif p.family = 'CNAS_RATES' then
    v_row := public.hr_set_social_profile_rates(
      p.target_id, v_month,
      (p.payload->>'employee_pct')::numeric, (p.payload->>'employer_pct')::numeric, (p.payload->>'fos_pct')::numeric);
    update public.hr_social_profile_rates set proposal_id = p.id, decision_id = d.id where id = v_row;
    v_detail := jsonb_build_object('row_id', v_row);
  elsif p.family in ('IRG_BAREME', 'IRG_RULES') then
    v_detail := public.ref_rule_apply_irg_version(p.family, p.target_id, v_month, p.id, d.id);
  elsif p.family = 'IRG_ZONE_SCOPE' then
    v_detail := public.ref_rule_apply_zone_scope(p.id, v_month, d.id);
  else
    raise exception 'Famille de règle inconnue.' using errcode = 'check_violation';
  end if;
  perform set_config('ref.rule_apply', 'off', true);

  perform set_config('ref.rule_review', 'on', true);
  update public.ref_rule_proposals set
    status = 'APPLIED', applied_month = v_month, applied_at = now(), applied_by = auth.uid(), application_decision_id = d.id
  where id = p.id;

  v_flagged := public.ref_rule_signal_drafts(
    v_month, format('Règle légale appliquée à partir du %s : %s (décision D2)', to_char(v_month, 'MM/YYYY'), p.title));

  v_result := jsonb_build_object(
    'operation', 'RULE_APPLIED', 'proposal_id', p.id, 'family', p.family, 'action', p.action,
    'month', v_month, 'flagged_runs', v_flagged
  ) || v_detail;
  update public.sys_decisions set
    status = 'EXECUTED', executed_by = auth.uid(), executed_at = now(), execution_result = v_result
  where id = d.id;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Proposal lifecycle (RPC)
-- ---------------------------------------------------------------------------
create or replace function public.ref_rule_session()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  return v_uid;
end;
$$;

create or replace function public.ref_rule_submit_internal(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.ref_rule_proposals%rowtype;
  v_open date := public.hr_first_open_payroll_month();
begin
  select * into p from public.ref_rule_proposals where id = p_id for update;
  if p.status <> 'DRAFT' then
    raise exception 'Seule une proposition en brouillon peut être soumise.' using errcode = 'check_violation';
  end if;
  if p.action <> 'VERIFY' and p.requested_month < v_open then
    raise exception '%', public.hr_closed_period_error(v_open) using errcode = 'check_violation';
  end if;
  perform public.ref_rule_check_payload(p.family, p.action, p.target_id, p.target_key, p.payload, 'SUBMIT');

  perform set_config('ref.rule_apply', 'on', true);
  if p.family = 'IRG_BAREME' and p.action = 'SET' then
    update public.ref_bareme_irg_versions set status = 'PROPOSED' where id = p.target_id;
  elsif p.family = 'IRG_RULES' and p.action = 'SET' then
    update public.ref_irg_rule_sets set status = 'PROPOSED' where id = p.target_id;
  end if;
  perform set_config('ref.rule_apply', 'off', true);

  perform set_config('ref.rule_review', 'on', true);
  update public.ref_rule_proposals set status = 'SUBMITTED', submitted_by = auth.uid(), submitted_at = now()
  where id = p.id;
  perform public.ref_rule_note_contributor('PROPOSAL', p.id, 'SUBMIT');

  perform public.sys_notify(
    'DECISION_PENDING',
    'Règle légale à approuver : ' || p.title,
    coalesce(public.ref_rule_target_label(p.id), '') || '. Aucun effet avant approbation puis décision de la date d''application.',
    '/rh/legal/propositions?id=' || p.id,
    null,
    'rule_approval',
    null
  );
end;
$$;

create or replace function public.ref_rule_proposal_save(
  p_id uuid,
  p_family text,
  p_action text,
  p_target uuid,
  p_target_key text,
  p_payload jsonb,
  p_title text,
  p_source_ref text,
  p_text_effective date,
  p_requested_month date,
  p_submit boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.ref_rule_session();
  p public.ref_rule_proposals%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_source text := btrim(coalesce(p_source_ref, ''));
  v_payload jsonb;
  v_id uuid;
begin
  if not public.erp_has_perm('rule_proposals', 'update'::public.rbac_action, null) then
    raise exception 'Proposition de règle non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_title) < 3 or char_length(v_title) > 200 then
    raise exception 'Intitulé requis (3 à 200 caractères).' using errcode = 'check_violation';
  end if;
  if char_length(v_source) < 3 or char_length(v_source) > 500 then
    raise exception 'Source légale requise : texte, article, date de publication (3 à 500 caractères).' using errcode = 'check_violation';
  end if;
  if p_action <> 'VERIFY' then
    if p_text_effective is null then
      raise exception 'Date d''effet prévue par le texte requise.' using errcode = 'check_violation';
    end if;
    if p_requested_month is null or extract(day from p_requested_month) <> 1 then
      raise exception 'Mois d''application souhaité requis (1er du mois).' using errcode = 'check_violation';
    end if;
  end if;
  v_payload := public.ref_rule_check_payload(p_family, p_action, p_target, nullif(btrim(coalesce(p_target_key, '')), ''),
                                             p_payload, 'SAVE');

  if p_id is null and exists (
    select 1 from public.ref_rule_proposals x
    where x.family = p_family and x.target_id = p_target and x.status in ('DRAFT', 'SUBMITTED', 'APPROVED')
      and (x.action = 'VERIFY' and p_action = 'VERIFY'
           or (x.action = 'SET' and p_action = 'SET' and p_family in ('IRG_BAREME', 'IRG_RULES')))
  ) then
    raise exception 'Une proposition est déjà ouverte pour cette cible : terminez-la ou retirez-la d''abord.'
      using errcode = 'check_violation';
  end if;

  perform set_config('ref.rule_review', 'on', true);
  if p_id is null then
    insert into public.ref_rule_proposals (
      family, action, target_id, target_key, payload, title, source_ref, text_effective_date, requested_month, created_by
    ) values (
      p_family, p_action, p_target, nullif(btrim(coalesce(p_target_key, '')), ''), v_payload, v_title, v_source,
      case when p_action = 'VERIFY' then null else p_text_effective end,
      case when p_action = 'VERIFY' then null else p_requested_month end,
      v_uid
    )
    returning id into v_id;
    perform public.ref_rule_note_contributor('PROPOSAL', v_id, 'CREATE');
  else
    select * into p from public.ref_rule_proposals where id = p_id for update;
    if not found then
      raise exception 'Proposition introuvable.' using errcode = 'no_data_found';
    end if;
    if p.status <> 'DRAFT' then
      raise exception 'Seule une proposition en brouillon se modifie.' using errcode = 'check_violation';
    end if;
    if p.family <> p_family or p.action <> p_action or p.target_id is distinct from p_target
       or p.target_key is distinct from nullif(btrim(coalesce(p_target_key, '')), '') then
      raise exception 'La famille et la cible d''une proposition ne se modifient pas.' using errcode = 'check_violation';
    end if;
    update public.ref_rule_proposals set
      payload = v_payload, title = v_title, source_ref = v_source,
      text_effective_date = case when p_action = 'VERIFY' then null else p_text_effective end,
      requested_month = case when p_action = 'VERIFY' then null else p_requested_month end
    where id = p.id;
    v_id := p.id;
    perform public.ref_rule_note_contributor('PROPOSAL', v_id, 'EDIT');
  end if;

  if coalesce(p_submit, false) then
    perform public.ref_rule_submit_internal(v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.ref_rule_proposal_submit(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.ref_rule_session();
begin
  if not public.erp_has_perm('rule_proposals', 'update'::public.rbac_action, null) then
    raise exception 'Proposition de règle non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.ref_rule_proposals where id = p_id) then
    raise exception 'Proposition introuvable.' using errcode = 'no_data_found';
  end if;
  perform public.ref_rule_submit_internal(p_id);
end;
$$;

create or replace function public.ref_rule_release_draft(p public.ref_rule_proposals)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p.action <> 'SET' or p.family not in ('IRG_BAREME', 'IRG_RULES') then
    return;
  end if;
  perform set_config('ref.rule_apply', 'on', true);
  if p.family = 'IRG_BAREME' then
    update public.ref_bareme_irg_versions set status = 'DRAFT' where id = p.target_id and status = 'PROPOSED';
  else
    update public.ref_irg_rule_sets set status = 'DRAFT' where id = p.target_id and status = 'PROPOSED';
  end if;
  perform set_config('ref.rule_apply', 'off', true);
end;
$$;

create or replace function public.ref_rule_proposal_withdraw(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.ref_rule_session();
  p public.ref_rule_proposals%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_dec uuid;
begin
  select * into p from public.ref_rule_proposals where id = p_id for update;
  if not found then
    raise exception 'Proposition introuvable.' using errcode = 'no_data_found';
  end if;
  if not (
    public.erp_is_super_admin(v_uid)
    or public.erp_has_perm('rule_approval', 'update'::public.rbac_action, null)
    or (public.erp_has_perm('rule_proposals', 'update'::public.rbac_action, null)
        and v_uid = any (public.ref_rule_proposal_contributors(p.id)))
  ) then
    raise exception 'Retrait réservé aux contributeurs, aux approbateurs et au SUPER_ADMIN.' using errcode = 'insufficient_privilege';
  end if;
  if p.status not in ('DRAFT', 'SUBMITTED', 'APPROVED') then
    raise exception 'Proposition déjà close (%).', p.status using errcode = 'check_violation';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 300 then
    raise exception 'Motif du retrait requis (5 à 300 caractères).' using errcode = 'check_violation';
  end if;
  for v_dec in
    select id from public.sys_decisions
    where dedupe_key = 'D2:' || p.id::text and status in ('PENDING', 'DECIDED')
  loop
    perform public.sys_decision_close_internal(v_dec, 'SUPERSEDED', 'Proposition retirée.');
  end loop;
  perform public.ref_rule_release_draft(p);
  perform set_config('ref.rule_review', 'on', true);
  update public.ref_rule_proposals set status = 'WITHDRAWN', closed_reason = v_reason where id = p.id;
end;
$$;

create or replace function public.ref_rule_proposal_reject(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.ref_rule_session();
  p public.ref_rule_proposals%rowtype;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if not public.erp_has_perm('rule_approval', 'update'::public.rbac_action, null) then
    raise exception 'Rejet réservé aux approbateurs des règles légales.' using errcode = 'insufficient_privilege';
  end if;
  select * into p from public.ref_rule_proposals where id = p_id for update;
  if not found then
    raise exception 'Proposition introuvable.' using errcode = 'no_data_found';
  end if;
  if p.status <> 'SUBMITTED' then
    raise exception 'Seule une proposition soumise peut être rejetée.' using errcode = 'check_violation';
  end if;
  if char_length(v_note) < 10 or char_length(v_note) > 1000 then
    raise exception 'Motif du rejet requis (10 à 1000 caractères).' using errcode = 'check_violation';
  end if;
  perform public.ref_rule_release_draft(p);
  perform set_config('ref.rule_review', 'on', true);
  update public.ref_rule_proposals set
    status = 'REJECTED', reviewed_by = v_uid, reviewed_at = now(), review_note = v_note, closed_reason = v_note
  where id = p.id;
  if p.created_by is not null and p.created_by <> v_uid then
    perform public.sys_notify('DECISION_TAKEN', 'Proposition rejetée : ' || p.title, v_note,
                              '/rh/legal/propositions?id=' || p.id, p.created_by, null, null);
  end if;
end;
$$;

create or replace function public.ref_rule_proposal_approve(p_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.ref_rule_session();
  p public.ref_rule_proposals%rowtype;
  v_self boolean;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_open date := public.hr_first_open_payroll_month();
  v_dec uuid;
begin
  if not public.erp_has_perm('rule_approval', 'update'::public.rbac_action, null) then
    raise exception 'Approbation réservée aux approbateurs des règles légales.' using errcode = 'insufficient_privilege';
  end if;
  select * into p from public.ref_rule_proposals where id = p_id for update;
  if not found then
    raise exception 'Proposition introuvable.' using errcode = 'no_data_found';
  end if;
  if p.status <> 'SUBMITTED' then
    raise exception 'Seule une proposition soumise peut être approuvée (statut : %).', p.status using errcode = 'check_violation';
  end if;
  v_self := v_uid = any (public.ref_rule_proposal_contributors(p.id));
  if v_self and not public.erp_is_super_admin(v_uid) then
    raise exception 'Séparation des tâches : vous avez contribué à cette proposition (création, modification, soumission ou extraction IA). Un autre approbateur ou le SUPER_ADMIN doit l''approuver.'
      using errcode = 'insufficient_privilege';
  end if;

  perform set_config('ref.rule_review', 'on', true);
  if p.action = 'VERIFY' then
    begin
      perform public.ref_rule_check_payload(p.family, p.action, p.target_id, p.target_key, p.payload, 'APPROVE');
    exception when check_violation then
      update public.ref_rule_proposals set status = 'SUPERSEDED', closed_reason = 'Valeur déjà vérifiée ou supprimée.'
      where id = p.id;
      return jsonb_build_object('ok', false, 'reason', 'CHANGED');
    end;
    if public.ref_rule_verify_hash(p.family, p.target_id) is distinct from p.payload->>'snapshot_hash' then
      update public.ref_rule_proposals set status = 'SUPERSEDED', closed_reason = 'Valeur modifiée depuis la demande de vérification.'
      where id = p.id;
      return jsonb_build_object('ok', false, 'reason', 'CHANGED');
    end if;
  else
    perform public.ref_rule_check_payload(p.family, p.action, p.target_id, p.target_key, p.payload, 'APPROVE');
  end if;

  update public.ref_rule_proposals set
    status = 'APPROVED', reviewed_by = v_uid, reviewed_at = now(), review_note = v_note, self_approved = v_self
  where id = p.id;

  if p.action = 'VERIFY' then
    perform set_config('ref.rule_apply', 'on', true);
    if p.family = 'LEGAL_VAR' then
      update public.ref_global_var_versions set proposal_id = p.id where id = p.target_id;
    elsif p.family = 'CNAS_RATES' then
      update public.hr_social_profile_rates set proposal_id = p.id where id = p.target_id;
    elsif p.family = 'IRG_BAREME' then
      update public.ref_bareme_irg_versions set status = 'APPLIED', proposal_id = p.id where id = p.target_id;
    else
      update public.ref_irg_rule_sets set status = 'APPLIED', proposal_id = p.id where id = p.target_id;
    end if;
    perform set_config('ref.rule_apply', 'off', true);
    update public.ref_rule_proposals set status = 'APPLIED', applied_at = now(), applied_by = v_uid where id = p.id;
  elsif p.requested_month >= v_open then
    v_dec := public.ref_rule_request_application_internal(p.id, p.requested_month, null);
  end if;

  if p.created_by is not null and p.created_by <> v_uid then
    perform public.sys_notify('DECISION_TAKEN', 'Proposition approuvée : ' || p.title,
      case when p.action = 'VERIFY' then 'Valeur approuvée comme référence.'
           else 'Sans effet tant que la date d''application n''est pas décidée (D2).' end,
      '/rh/legal/propositions?id=' || p.id, p.created_by, null, null);
  end if;
  return jsonb_build_object(
    'ok', true,
    'status', case when p.action = 'VERIFY' then 'APPLIED' else 'APPROVED' end,
    'self_approved', v_self,
    'decision_id', v_dec,
    'month_closed', p.action <> 'VERIFY' and v_dec is null
  );
end;
$$;

create or replace function public.ref_rule_proposal_request_application(p_id uuid, p_month date, p_date date)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.ref_rule_session();
begin
  if not (public.erp_has_perm('rule_approval', 'update'::public.rbac_action, null)
          or public.sys_decision_can_decide('D2', v_uid)) then
    raise exception 'Demande de date d''application non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  return public.ref_rule_request_application_internal(p_id, p_month, p_date);
end;
$$;

-- Everything the proposals screen shows, names included (sys_users is not readable by every role).
create or replace function public.ref_rule_proposals_overview(p_only_open boolean default true)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'family', p.family,
    'action', p.action,
    'target_id', p.target_id,
    'target_key', p.target_key,
    'target_label', public.ref_rule_target_label(p.id),
    'title', p.title,
    'source_ref', p.source_ref,
    'text_effective_date', p.text_effective_date,
    'requested_month', p.requested_month,
    'origin', p.origin,
    'status', p.status,
    'created_at', p.created_at,
    'created_by_name', (select u.full_name from public.sys_users u where u.id = p.created_by),
    'submitted_at', p.submitted_at,
    'reviewed_at', p.reviewed_at,
    'reviewed_by_name', (select u.full_name from public.sys_users u where u.id = p.reviewed_by),
    'review_note', p.review_note,
    'self_approved', p.self_approved,
    'applied_month', p.applied_month,
    'applied_at', p.applied_at,
    'closed_reason', p.closed_reason,
    'application_decision_id', p.application_decision_id,
    'application_decision_status', (select d.status from public.sys_decisions d where d.id = p.application_decision_id),
    'contributors', coalesce((
      select jsonb_agg(jsonb_build_object('name', u.full_name, 'role', c.role, 'at', c.last_at) order by c.first_at)
      from public.ref_rule_contributors c
      join public.sys_users u on u.id = c.user_id
      where (c.subject_kind = 'PROPOSAL' and c.subject_id = p.id)
         or (p.family in ('IRG_BAREME', 'IRG_RULES') and p.action = 'SET'
             and c.subject_kind = p.family and c.subject_id = p.target_id)), '[]'::jsonb),
    'is_contributor', auth.uid() = any (public.ref_rule_proposal_contributors(p.id)),
    'current', public.ref_rule_current_content(p.id, p.requested_month),
    'proposed', public.ref_rule_proposal_content(p.id)
  ) order by p.created_at desc), '[]'::jsonb)
  from public.ref_rule_proposals p
  where (public.erp_has_perm('rule_proposals', 'read'::public.rbac_action, null)
         or public.erp_has_perm('rule_approval', 'read'::public.rbac_action, null)
         or p.created_by = auth.uid())
    and (not coalesce(p_only_open, true) or p.status in ('DRAFT', 'SUBMITTED', 'APPROVED')
         or p.updated_at > now() - interval '30 days');
$$;

-- ---------------------------------------------------------------------------
-- 11. Decision engine: D2 fingerprint, refresh and immediate execution
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
        'Mois désormais traité : la correction relève de D7 (lot 3).');
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
    if (d.scope->>'month')::date < public.hr_first_open_payroll_month() then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED',
        'Mois désormais traité (paie validée ou clôturée) : demandez une autre date d''application.');
      return 'SUPERSEDED';
    end if;
    update public.sys_decisions set
      context = public.ref_rule_application_context(p.id, (d.scope->>'month')::date, (d.scope->>'date')::date),
      fingerprint = public.ref_rule_application_fingerprint(p.id, (d.scope->>'month')::date)
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

  -- Reference-data decisions run in the same transaction: decided and applied together, or not at all.
  if v_executes and d.type_code in ('D8', 'D13', 'D2') then
    if d.type_code = 'D8' then
      perform public.hr_decision_apply_d8(d.id);
    elsif d.type_code = 'D13' then
      perform public.hr_decision_apply_d13(d.id);
    else
      perform public.ref_rule_apply_d2(d.id);
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
-- 12. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.hr_set_legal_var_version(uuid, date, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.hr_cancel_legal_var_version(uuid) from public, anon, authenticated;
revoke all on function public.hr_stop_legal_var(uuid, date) from public, anon, authenticated;
revoke all on function public.hr_set_social_profile_rates(uuid, date, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.hr_cancel_social_profile_rates(uuid) from public, anon, authenticated;

revoke all on function public.ref_rule_note_contributor(text, uuid, text) from public, anon, authenticated;
revoke all on function public.ref_rule_proposal_contributors(uuid) from public, anon, authenticated;
revoke all on function public.ref_rule_row_content(text, uuid) from public, anon, authenticated;
revoke all on function public.ref_rule_verify_hash(text, uuid) from public, anon, authenticated;
revoke all on function public.ref_rule_target_label(uuid) from public, anon, authenticated;
revoke all on function public.ref_rule_check_payload(text, text, uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.ref_rule_current_row(uuid, date) from public, anon, authenticated;
revoke all on function public.ref_rule_current_content(uuid, date) from public, anon, authenticated;
revoke all on function public.ref_rule_proposal_content(uuid) from public, anon, authenticated;
revoke all on function public.ref_rule_target_state(uuid) from public, anon, authenticated;
revoke all on function public.ref_rule_first_month(uuid, date) from public, anon, authenticated;
revoke all on function public.ref_rule_application_fingerprint(uuid, date) from public, anon, authenticated;
revoke all on function public.ref_rule_application_context(uuid, date, date) from public, anon, authenticated;
revoke all on function public.ref_rule_request_application_internal(uuid, date, date) from public, anon, authenticated;
revoke all on function public.ref_rule_apply_irg_version(text, uuid, date, uuid, uuid) from public, anon, authenticated;
revoke all on function public.ref_rule_apply_zone_scope(uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.ref_rule_signal_drafts(date, text) from public, anon, authenticated;
revoke all on function public.ref_rule_apply_d2(uuid) from public, anon, authenticated;
revoke all on function public.ref_rule_submit_internal(uuid) from public, anon, authenticated;
revoke all on function public.ref_rule_release_draft(public.ref_rule_proposals) from public, anon, authenticated;
revoke all on function public.ref_rule_session() from public, anon, authenticated;
revoke all on function public.sys_decision_refresh_record(uuid) from public, anon, authenticated;
revoke all on function public.sys_decision_current_fingerprint(uuid) from public, anon, authenticated;

revoke all on function public.ref_rule_proposal_save(uuid, text, text, uuid, text, jsonb, text, text, date, date, boolean) from public, anon;
revoke all on function public.ref_rule_proposal_submit(uuid) from public, anon;
revoke all on function public.ref_rule_proposal_withdraw(uuid, text) from public, anon;
revoke all on function public.ref_rule_proposal_reject(uuid, text) from public, anon;
revoke all on function public.ref_rule_proposal_approve(uuid, text) from public, anon;
revoke all on function public.ref_rule_proposal_request_application(uuid, date, date) from public, anon;
revoke all on function public.ref_rule_proposals_overview(boolean) from public, anon;
revoke all on function public.sys_decision_decide(uuid, text, text, text, boolean) from public, anon;

grant execute on function public.ref_rule_proposal_save(uuid, text, text, uuid, text, jsonb, text, text, date, date, boolean) to authenticated;
grant execute on function public.ref_rule_proposal_submit(uuid) to authenticated;
grant execute on function public.ref_rule_proposal_withdraw(uuid, text) to authenticated;
grant execute on function public.ref_rule_proposal_reject(uuid, text) to authenticated;
grant execute on function public.ref_rule_proposal_approve(uuid, text) to authenticated;
grant execute on function public.ref_rule_proposal_request_application(uuid, date, date) to authenticated;
grant execute on function public.ref_rule_proposals_overview(boolean) to authenticated;
grant execute on function public.sys_decision_decide(uuid, text, text, text, boolean) to authenticated;

commit;
