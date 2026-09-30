-- Lot 3a — Réouverture et traçabilité de la paie
--   1. D7 : une paie validée OU clôturée ne se réouvre que par décision explicite du SUPER_ADMIN (non délégable),
--      à risque, justifiée, consommée une seule fois et liée à une paie précise. La transition directe « reopen »
--      est supprimée ; une paie clôturée reste non modifiable sans cette décision.
--   2. Avant toute réouverture, une copie figée de chaque bulletin et de ses lignes est enregistrée (historique des
--      versions de bulletin, non modifiable, lié à la décision).
--   3. Audit ajouté sur les paies, bulletins, lignes et présences ; chaque ligne d'audit est rattachée à la décision
--      en cours (D7, D3, D4) quand elle existe. Partitions mensuelles du journal créées jusqu'à décembre 2027.
--   4. D6 : valider un mois opérationnel alors que des mois de reprise (janvier à août 2026) restent ouverts exige
--      une décision : attendre, figer leurs paramètres (clôture chronologique) ou séparer la chaîne de reprise.
--      En chaîne séparée, le premier mois ouvert est calculé par chaîne et une règle appliquée à un mois de reprise
--      s'arrête au 31/08/2026 : elle ne modifie jamais un mois opérationnel.

begin;

-- ---------------------------------------------------------------------------
-- 1. Rights matrix: D7 is reserved to SUPER_ADMIN and cannot be delegated
-- ---------------------------------------------------------------------------
insert into public.sys_screens (code, path, module, label_fr, label_ar, sort_order) values
  ('decision_payroll_reopen', '/decisions?type=D7', 'decisions',
   'Décision D7 · Réouverture d''une paie validée ou clôturée (SUPER_ADMIN uniquement, non délégable)', null, 60),
  ('decision_payroll_chains', '/decisions?type=D6', 'decisions',
   'Décision D6 · Validation d''un mois opérationnel avec des mois de reprise ouverts (classe : à risque)', null, 61)
on conflict (code) do nothing;

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select r.id, s.id, true, true, true, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code = 'SUPER_ADMIN'
  and s.code in ('decision_payroll_reopen', 'decision_payroll_chains')
on conflict (role_id, screen_id) do nothing;

create or replace function public.sys_permissions_non_delegable_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.sys_screens s where s.id = new.screen_id and s.code = 'decision_payroll_reopen')
     and not exists (select 1 from public.sys_roles r where r.id = new.role_id and r.code = 'SUPER_ADMIN')
     and (new.can_create or new.can_update or new.can_delete) then
    raise exception 'La réouverture d''une paie (D7) est réservée au SUPER_ADMIN et ne se délègue pas.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sys_permissions_non_delegable on public.sys_permissions;
create trigger trg_sys_permissions_non_delegable
  before insert or update on public.sys_permissions
  for each row execute function public.sys_permissions_non_delegable_guard();

-- ---------------------------------------------------------------------------
-- 2. Decision types D6 and D7
-- ---------------------------------------------------------------------------
insert into public.sys_decision_types (code, label_fr, description_fr, risk_class, policy_allowed, screen_code, options) values
  ('D6',
   'Validation d''un mois opérationnel alors que des mois de reprise restent ouverts',
   'Valider septembre 2026 ou un mois suivant fixe le « premier mois ouvert » de la paie. Avec la clôture chronologique, les paramètres (règles légales) de tous les mois antérieurs, dont janvier à août 2026, ne peuvent plus changer. Cette décision modifie la capacité de traitement des mois de reprise ; elle est définitive.',
   'RISKY', false, 'decision_payroll_chains',
   jsonb_build_array(
     jsonb_build_object(
       'code', 'WAIT',
       'label_fr', 'Attendre',
       'consequence_fr', 'La validation reste bloquée. Les mois de reprise restent ouverts aux changements de paramètres. Une nouvelle demande pourra être faite plus tard.',
       'executes', false),
     jsonb_build_object(
       'code', 'FREEZE',
       'label_fr', 'Valider en figeant les paramètres des mois de reprise',
       'consequence_fr', 'Clôture chronologique : dès la validation de ce mois, les paramètres de tous les mois antérieurs, dont janvier à août 2026, sont figés. La validation elle-même reste à faire depuis l''écran Paie. Choix définitif.',
       'executes', true),
     jsonb_build_object(
       'code', 'SEPARATE',
       'label_fr', 'Chaîne de clôture séparée pour les mois de reprise',
       'consequence_fr', 'Janvier à août 2026 gardent leur propre clôture : leurs paramètres restent modifiables jusqu''à la validation de leur propre paie. Une règle appliquée à un mois de reprise s''arrête au 31/08/2026 et ne modifie jamais un mois opérationnel. La validation reste à faire depuis l''écran Paie. Choix définitif.',
       'executes', true))),
  ('D7',
   'Réouverture d''une paie validée ou clôturée',
   'Réservée au SUPER_ADMIN, non délégable, bloquée par défaut. Décision ponctuelle liée à une paie précise (mois et chantier), consommée une seule fois. Avant la réouverture, une copie figée de chaque bulletin et de ses lignes est conservée ; chaque modification ultérieure est tracée dans le journal d''audit.',
   'RISKY', false, 'decision_payroll_reopen',
   jsonb_build_array(
     jsonb_build_object(
       'code', 'REOPEN',
       'label_fr', 'Réouvrir la paie',
       'consequence_fr', 'Une copie figée de chaque bulletin et de ses lignes est enregistrée, puis la paie et ses bulletins repassent en brouillon et le pointage du mois redevient modifiable. Aucun bulletin n''est recalculé sans décision D3. Les lots de virement exécutés restent en l''état et un nouveau virement pour ces bulletins reste bloqué. Déclarations et certificats déjà produits ne sont pas modifiés par l''application.',
       'executes', true),
     jsonb_build_object(
       'code', 'KEEP',
       'label_fr', 'Ne pas réouvrir',
       'consequence_fr', 'La paie reste validée ou clôturée, sans aucune modification.',
       'executes', false)))
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Audit journal: monthly partitions reached only through sys_audit_logs
-- ---------------------------------------------------------------------------
create or replace function public.sys_audit_ensure_partitions(p_until date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := greatest(date_trunc('month', now())::date, date '2026-09-01');
  v_to date;
  v_name text;
  n integer := 0;
begin
  while v_month <= date_trunc('month', p_until)::date loop
    v_to := (v_month + interval '1 month')::date;
    v_name := 'sys_audit_logs_' || to_char(v_month, 'YYYY_MM');
    if to_regclass('public.' || v_name) is null then
      if exists (select 1 from public.sys_audit_logs_default where occurred_at >= v_month and occurred_at < v_to) then
        raise notice 'Partition % non créée : la partition par défaut contient déjà des lignes de ce mois.', v_name;
      else
        execute format('create table public.%I partition of public.sys_audit_logs for values from (%L) to (%L)',
                       v_name, v_month, v_to);
        n := n + 1;
      end if;
    end if;
    v_month := v_to;
  end loop;
  for v_name in
    select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid
    where i.inhparent = 'public.sys_audit_logs'::regclass
  loop
    execute format('alter table public.%I enable row level security', v_name);
    execute format('revoke all on public.%I from public, anon, authenticated', v_name);
  end loop;
  return n;
end;
$$;

select public.sys_audit_ensure_partitions(date '2027-12-01');

-- ---------------------------------------------------------------------------
-- 4. Slip version history (frozen copy taken before a reopening)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_payroll_slip_versions (
  id uuid primary key default gen_random_uuid(),
  slip_id uuid not null,
  run_id uuid not null references public.hr_payroll_runs(id),
  employee_id uuid not null references public.hr_employees(id),
  version_no integer not null check (version_no > 0),
  run_status text not null check (run_status in ('VALIDATED', 'LOCKED')),
  slip jsonb not null,
  lines jsonb not null default '[]'::jsonb,
  decision_id uuid not null references public.sys_decisions(id),
  captured_by uuid references public.sys_users(id),
  captured_at timestamptz not null default now(),
  unique (slip_id, version_no)
);

create index if not exists hr_payroll_slip_versions_run_idx on public.hr_payroll_slip_versions (run_id, employee_id);

create or replace function public.hr_payroll_slip_versions_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Historique des bulletins : une version enregistrée ne se modifie ni ne se supprime.'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_hr_payroll_slip_versions_immutable on public.hr_payroll_slip_versions;
create trigger trg_hr_payroll_slip_versions_immutable
  before update or delete on public.hr_payroll_slip_versions
  for each row execute function public.hr_payroll_slip_versions_immutable();

alter table public.hr_payroll_slip_versions enable row level security;
drop policy if exists hr_payroll_slip_versions_read on public.hr_payroll_slip_versions;
create policy hr_payroll_slip_versions_read on public.hr_payroll_slip_versions for select to authenticated
  using (public.erp_has_perm('hr_payroll_slips', 'read'::public.rbac_action, null));
revoke insert, update, delete, truncate on public.hr_payroll_slip_versions from public, anon, authenticated;
grant select on public.hr_payroll_slip_versions to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Transaction flags: reopening under a D7 decision
-- ---------------------------------------------------------------------------
create or replace function public.hr_payroll_reopen_flag()
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v text := nullif(current_setting('hr.payroll_reopen', true), '');
begin
  if v is null or v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v::uuid;
end;
$$;

-- True only inside the execution of a decided (not yet consumed) D7 « Réouvrir » for this very run.
create or replace function public.hr_payroll_reopen_allows(p_run uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sys_decisions d
    where d.id = public.hr_payroll_reopen_flag()
      and d.type_code = 'D7'
      and d.status = 'DECIDED'
      and d.chosen_option = 'REOPEN'
      and d.run_id = p_run
      and (d.scope->>'run_id')::uuid = p_run
      and public.erp_is_super_admin(d.decided_by)
  );
$$;

-- ---------------------------------------------------------------------------
-- 6. Audit triggers on payroll runs, slips, lines and attendance
-- ---------------------------------------------------------------------------
create or replace function public.hr_payroll_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_action public.audit_action;
  v_old jsonb;
  v_new jsonb;
  v_ref uuid;
  v_date date;
  v_site uuid;
begin
  begin
    v_uid := auth.uid();
  exception when others then
    v_uid := null;
  end;
  if tg_op = 'INSERT' then
    v_action := 'CREATE';
    v_new := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_action := 'UPDATE';
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
  else
    v_action := 'DELETE';
    v_old := to_jsonb(old);
  end if;

  v_ref := coalesce(public.hr_payroll_reopen_flag(), public.hr_payroll_decision_flag());
  if v_ref is null and tg_table_name = 'hr_attendance' then
    v_date := (coalesce(v_new, v_old)->>'work_date')::date;
    v_site := (coalesce(v_new, v_old)->>'site_id')::uuid;
    select d.id into v_ref
    from public.sys_decisions d
    join public.hr_payroll_runs r on r.id = d.run_id
    where d.type_code = 'D7' and d.status = 'EXECUTED' and r.status_code = 'DRAFT'
      and r.period_year = extract(year from v_date)::integer
      and r.period_month = extract(month from v_date)::integer
      and (r.site_id is null or r.site_id = v_site)
    order by d.executed_at desc
    limit 1;
  end if;

  perform public.sys_audit_write(
    v_uid, v_action, tg_table_name, coalesce(v_new, v_old)->>'id', v_old, v_new, null, null, v_ref
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['hr_payroll_runs', 'hr_payroll_slips', 'hr_payroll_slip_lines', 'hr_attendance'] loop
    execute format('drop trigger if exists trg_%s_audit on public.%I', t, t);
    execute format(
      'create trigger trg_%s_audit after insert or update or delete on public.%I
         for each row execute function public.hr_payroll_audit_row_change()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. D6: closing chains
-- ---------------------------------------------------------------------------
create table if not exists public.hr_payroll_chain_policy (
  id boolean primary key default true check (id),
  mode text not null check (mode in ('FROZEN', 'SEPARATE')),
  decision_id uuid not null references public.sys_decisions(id),
  decided_by uuid references public.sys_users(id),
  decided_at timestamptz not null default now()
);

create or replace function public.hr_payroll_chain_policy_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Politique de clôture (D6) définitive : elle ne se modifie ni ne se supprime.'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_hr_payroll_chain_policy_immutable on public.hr_payroll_chain_policy;
create trigger trg_hr_payroll_chain_policy_immutable
  before update or delete on public.hr_payroll_chain_policy
  for each row execute function public.hr_payroll_chain_policy_immutable();

drop trigger if exists trg_hr_payroll_chain_policy_audit on public.hr_payroll_chain_policy;
create trigger trg_hr_payroll_chain_policy_audit
  after insert or update or delete on public.hr_payroll_chain_policy
  for each row execute function public.sys_audit_row_change();

alter table public.hr_payroll_chain_policy enable row level security;
drop policy if exists hr_payroll_chain_policy_read on public.hr_payroll_chain_policy;
create policy hr_payroll_chain_policy_read on public.hr_payroll_chain_policy for select to authenticated using (true);
revoke insert, update, delete, truncate on public.hr_payroll_chain_policy from public, anon, authenticated;
grant select on public.hr_payroll_chain_policy to authenticated;

create or replace function public.hr_operational_start()
returns date
language sql
immutable
as $$
  select date '2026-09-01';
$$;

create or replace function public.hr_payroll_chain_mode()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select p.mode from public.hr_payroll_chain_policy p where p.id), 'UNDECIDED');
$$;

-- First month after the latest validated / closed run of one chain (EXTERNAL = reprise, OPERATIONAL).
create or replace function public.hr_payroll_chain_first_open(p_nature text)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select (make_date(r.period_year, r.period_month, 1) + interval '1 month')::date
      from public.hr_payroll_runs r
      where r.status_code in ('VALIDATED', 'LOCKED')
        and public.sys_period_nature(r.period_year, r.period_month) = p_nature
      order by r.period_year desc, r.period_month desc
      limit 1
    ),
    date '1900-01-01'
  );
$$;

-- First open month of the chain the month belongs to (global chronological order unless D6 separated the chains).
create or replace function public.hr_first_open_month_for(p_month date)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.hr_payroll_chain_mode() <> 'SEPARATE' then public.hr_first_open_payroll_month()
    when p_month < public.hr_operational_start() then public.hr_payroll_chain_first_open('EXTERNAL')
    else greatest(public.hr_payroll_chain_first_open('OPERATIONAL'), public.hr_operational_start())
  end;
$$;

create or replace function public.hr_month_is_closed(p_month date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_month < public.hr_first_open_month_for(p_month);
$$;

-- A dated range [p_from, p_to] (null = open-ended) covering at least one processed month.
create or replace function public.hr_range_touches_closed(p_from date, p_to date)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_start date := public.hr_operational_start();
  v_op date;
begin
  if public.hr_payroll_chain_mode() <> 'SEPARATE' then
    return p_from < public.hr_first_open_payroll_month();
  end if;
  if p_from < least(public.hr_payroll_chain_first_open('EXTERNAL'), v_start) then
    return true;
  end if;
  v_op := public.hr_payroll_chain_first_open('OPERATIONAL');
  return v_op > v_start and p_from < v_op and coalesce(p_to, 'infinity'::date) >= v_start;
end;
$$;

create or replace function public.hr_closed_range_error(p_from date)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.hr_payroll_chain_mode() <> 'SEPARATE' then public.hr_closed_period_error(public.hr_first_open_payroll_month())
    else 'Période qui couvre un mois déjà traité (paie validée ou clôturée). Chaînes séparées (D6) : reprise ouverte à partir de '
      || to_char(least(public.hr_payroll_chain_first_open('EXTERNAL'), public.hr_operational_start()), 'MM/YYYY')
      || ', paie opérationnelle ouverte à partir de '
      || to_char(greatest(public.hr_payroll_chain_first_open('OPERATIONAL'), public.hr_operational_start()), 'MM/YYYY') || '.'
  end;
$$;

-- Last day a rule applied from p_month may cover: 31/08/2026 for a reprise month when the chains are separated.
create or replace function public.hr_payroll_chain_bound(p_month date)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.hr_payroll_chain_mode() = 'SEPARATE' and p_month < public.hr_operational_start()
      then public.hr_operational_start() - 1
  end;
$$;

create or replace function public.hr_payroll_chain_state()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'mode', public.hr_payroll_chain_mode(),
    'decision_id', (select p.decision_id from public.hr_payroll_chain_policy p where p.id),
    'global_open', public.hr_first_open_payroll_month(),
    'external_open', public.hr_payroll_chain_first_open('EXTERNAL'),
    'operational_open', greatest(public.hr_payroll_chain_first_open('OPERATIONAL'), public.hr_operational_start()),
    'operational_start', public.hr_operational_start()
  )
  where auth.uid() is not null;
$$;

-- ---------------------------------------------------------------------------
-- 8. Chain-aware period guards on the dated rules
-- ---------------------------------------------------------------------------
create or replace function public.hr_guard_var_versions_period()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lo date;
  v_hi date;
begin
  if coalesce(current_setting('erp.allow_closed_period_edit', true), '') = 'on'
     or coalesce(current_setting('ref.rule_split', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if public.erp_is_compliance_var(new.var_id) and public.hr_range_touches_closed(new.effective_from, new.effective_to) then
      raise exception '%', public.hr_closed_range_error(new.effective_from) using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if public.erp_is_compliance_var(old.var_id) and public.hr_range_touches_closed(old.effective_from, old.effective_to) then
      raise exception '%', public.hr_closed_range_error(old.effective_from) using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if not public.erp_is_compliance_var(new.var_id) then
    return new;
  end if;
  if not public.hr_range_touches_closed(old.effective_from, old.effective_to) then
    if public.hr_range_touches_closed(new.effective_from, new.effective_to) then
      raise exception '%', public.hr_closed_range_error(new.effective_from) using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.var_id <> old.var_id
     or new.effective_from <> old.effective_from
     or new.value_numeric is distinct from old.value_numeric
     or new.value_text is distinct from old.value_text
     or new.contrib_part is distinct from old.contrib_part
     or new.contrib_base is distinct from old.contrib_base
     or new.contrib_reduces_irg is distinct from old.contrib_reduces_irg
     or new.contrib_scope is distinct from old.contrib_scope then
    raise exception '%', public.hr_closed_range_error(old.effective_from) using errcode = 'check_violation';
  end if;
  if new.effective_to is distinct from old.effective_to then
    v_lo := least(coalesce(old.effective_to, 'infinity'::date), coalesce(new.effective_to, 'infinity'::date)) + 1;
    v_hi := greatest(coalesce(old.effective_to, 'infinity'::date), coalesce(new.effective_to, 'infinity'::date));
    if public.hr_range_touches_closed(v_lo, v_hi) then
      raise exception '%', public.hr_closed_range_error(v_lo) using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.hr_guard_social_rates_period()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lo date;
  v_hi date;
begin
  if coalesce(current_setting('erp.allow_closed_period_edit', true), '') = 'on'
     or coalesce(current_setting('ref.rule_split', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if public.hr_range_touches_closed(new.effective_from, new.effective_to) then
      raise exception '%', public.hr_closed_range_error(new.effective_from) using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if public.hr_range_touches_closed(old.effective_from, old.effective_to)
       and exists (select 1 from public.hr_catalogs c where c.id = old.profile_id) then
      raise exception '%', public.hr_closed_range_error(old.effective_from) using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if not public.hr_range_touches_closed(old.effective_from, old.effective_to) then
    if public.hr_range_touches_closed(new.effective_from, new.effective_to) then
      raise exception '%', public.hr_closed_range_error(new.effective_from) using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.profile_id <> old.profile_id
     or new.effective_from <> old.effective_from
     or new.employee_pct is distinct from old.employee_pct
     or new.employer_pct is distinct from old.employer_pct
     or new.fos_pct is distinct from old.fos_pct then
    raise exception '%', public.hr_closed_range_error(old.effective_from) using errcode = 'check_violation';
  end if;
  if new.effective_to is distinct from old.effective_to then
    v_lo := least(coalesce(old.effective_to, 'infinity'::date), coalesce(new.effective_to, 'infinity'::date)) + 1;
    v_hi := greatest(coalesce(old.effective_to, 'infinity'::date), coalesce(new.effective_to, 'infinity'::date));
    if public.hr_range_touches_closed(v_lo, v_hi) then
      raise exception '%', public.hr_closed_range_error(v_lo) using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.hr_guard_used_contribution()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.contrib_part is not null and (
    exists (
      select 1 from public.hr_payroll_slips s
      where s.extra_contributions @> jsonb_build_array(jsonb_build_object('key', old.key))
    )
    or exists (
      select 1 from public.ref_global_var_versions x
      where x.var_id = old.id and public.hr_range_touches_closed(x.effective_from, x.effective_to)
    )
  ) then
    raise exception 'Cotisation déjà appliquée sur des bulletins : utilisez « Arrêter » pour la stopper sans toucher au passé.'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

-- Separated chains: the row in force on 01/09/2026 is cut in two identical rows so that a rule applied to a
-- reprise month stops on 31/08/2026. The original row keeps its id and covers the operational months.
create or replace function public.ref_rule_chain_split(p_family text, p_key text, p_month date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_b date := public.hr_operational_start();
  v_new uuid;
  v_code text;
  n integer := 0;
  gv public.ref_global_var_versions%rowtype;
  sp public.hr_social_profile_rates%rowtype;
  zs public.ref_irg_zone_scopes%rowtype;
  bv public.ref_bareme_irg_versions%rowtype;
  rs public.ref_irg_rule_sets%rowtype;
begin
  if public.hr_payroll_chain_bound(p_month) is null then
    return 0;
  end if;
  if not public.ref_rule_applying() then
    raise exception '%', public.ref_rule_direct_write_error() using errcode = 'insufficient_privilege';
  end if;
  perform set_config('ref.rule_split', 'on', true);

  if p_family = 'LEGAL_VAR' then
    for gv in
      select * from public.ref_global_var_versions
      where var_id = p_key::uuid and effective_from < v_b and (effective_to is null or effective_to >= v_b)
      for update
    loop
      update public.ref_global_var_versions set effective_from = v_b where id = gv.id;
      insert into public.ref_global_var_versions
      select * from jsonb_populate_record(null::public.ref_global_var_versions,
        to_jsonb(gv) || jsonb_build_object('id', gen_random_uuid(), 'effective_to', v_b - 1));
      n := n + 1;
    end loop;
  elsif p_family = 'CNAS_RATES' then
    for sp in
      select * from public.hr_social_profile_rates
      where profile_id = p_key::uuid and effective_from < v_b and (effective_to is null or effective_to >= v_b)
      for update
    loop
      update public.hr_social_profile_rates set effective_from = v_b where id = sp.id;
      insert into public.hr_social_profile_rates
      select * from jsonb_populate_record(null::public.hr_social_profile_rates,
        to_jsonb(sp) || jsonb_build_object('id', gen_random_uuid(), 'effective_to', v_b - 1));
      n := n + 1;
    end loop;
  elsif p_family = 'IRG_ZONE_SCOPE' then
    for zs in
      select * from public.ref_irg_zone_scopes
      where zone_code = p_key and effective_from < v_b and (effective_to is null or effective_to >= v_b)
      for update
    loop
      update public.ref_irg_zone_scopes set effective_from = v_b where id = zs.id;
      insert into public.ref_irg_zone_scopes
      select * from jsonb_populate_record(null::public.ref_irg_zone_scopes,
        to_jsonb(zs) || jsonb_build_object('id', gen_random_uuid(), 'effective_to', v_b - 1));
      n := n + 1;
    end loop;
  elsif p_family = 'IRG_BAREME' then
    for bv in
      select * from public.ref_bareme_irg_versions
      where status in ('LEGACY', 'APPLIED') and effective_from < v_b and (effective_to is null or effective_to >= v_b)
      for update
    loop
      v_new := gen_random_uuid();
      v_code := left(bv.code, 60) || '~' || to_char(v_b - 1, 'YYYYMM');
      if exists (select 1 from public.ref_bareme_irg_versions where code = v_code) then
        v_code := v_code || '-' || left(v_new::text, 4);
      end if;
      update public.ref_bareme_irg_versions set effective_from = v_b where id = bv.id;
      insert into public.ref_bareme_irg_versions
      select * from jsonb_populate_record(null::public.ref_bareme_irg_versions,
        to_jsonb(bv) || jsonb_build_object('id', v_new, 'code', v_code, 'effective_to', v_b - 1));
      insert into public.ref_bareme_irg
      select (jsonb_populate_record(null::public.ref_bareme_irg,
        to_jsonb(b) || jsonb_build_object('id', gen_random_uuid(), 'version_id', v_new))).*
      from public.ref_bareme_irg b where b.version_id = bv.id;
      n := n + 1;
    end loop;
  elsif p_family = 'IRG_RULES' then
    for rs in
      select * from public.ref_irg_rule_sets
      where status in ('LEGACY', 'APPLIED') and taxpayer_category::text = p_key
        and effective_from < v_b and (effective_to is null or effective_to >= v_b)
      for update
    loop
      v_new := gen_random_uuid();
      v_code := left(rs.code, 60) || '~' || to_char(v_b - 1, 'YYYYMM');
      if exists (select 1 from public.ref_irg_rule_sets where code = v_code) then
        v_code := v_code || '-' || left(v_new::text, 4);
      end if;
      update public.ref_irg_rule_sets set effective_from = v_b where id = rs.id;
      insert into public.ref_irg_rule_sets
      select * from jsonb_populate_record(null::public.ref_irg_rule_sets,
        to_jsonb(rs) || jsonb_build_object('id', v_new, 'code', v_code, 'effective_to', v_b - 1));
      insert into public.ref_irg_rules
      select (jsonb_populate_record(null::public.ref_irg_rules,
        to_jsonb(x) || jsonb_build_object('id', gen_random_uuid(), 'rule_set_id', v_new))).*
      from public.ref_irg_rules x where x.rule_set_id = rs.id;
      n := n + 1;
    end loop;
  end if;

  perform set_config('ref.rule_split', '', true);
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. D2 path: chain-aware month checks, rules of a reprise month bounded to 31/08/2026
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
  if public.hr_month_is_closed(p_from) then
    raise exception '%', public.hr_closed_period_error(public.hr_first_open_month_for(p_from)) using errcode = 'check_violation';
  end if;
  perform public.ref_rule_chain_split('LEGAL_VAR', p_var_id::text, p_from);

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
  v_bound date;
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
  if public.hr_month_is_closed(p_from) then
    raise exception '%', public.hr_closed_period_error(public.hr_first_open_month_for(p_from)) using errcode = 'check_violation';
  end if;
  perform public.ref_rule_chain_split('LEGAL_VAR', p_var_id::text, p_from);
  v_bound := public.hr_payroll_chain_bound(p_from);

  delete from public.ref_global_var_versions
  where var_id = p_var_id and effective_from >= p_from and (v_bound is null or effective_from <= v_bound);
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
  if public.hr_month_is_closed(p_from) then
    raise exception '%', public.hr_closed_period_error(public.hr_first_open_month_for(p_from)) using errcode = 'check_violation';
  end if;
  perform public.ref_rule_chain_split('CNAS_RATES', p_profile_id::text, p_from);

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
    perform public.ref_rule_chain_split('IRG_BAREME', null, p_month);
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
    perform public.ref_rule_chain_split('IRG_RULES', v_cat, p_month);
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
  perform public.ref_rule_chain_split('IRG_ZONE_SCOPE', p.target_key, p_month);
  select min(effective_from) into v_next
  from public.ref_irg_zone_scopes where zone_code = p.target_key and effective_from > p_month;
  select string_agg(distinct w.code || ' ' || w.name_fr || ' (' || z.zone_code || ')', ', ') into v_conflicts
  from public.ref_irg_zone_scopes z
  cross join unnest(z.wilaya_codes) as c(code)
  join public.ref_wilayas w on w.code = c.code
  where z.zone_code <> p.target_key
    and (z.effective_to is null or z.effective_to >= p_month)
    and (v_next is null or z.effective_from < v_next)
    and c.code = any (v_codes);
  if v_conflicts is not null then
    raise exception 'Wilaya(s) déjà rattachée(s) à une autre zone sur cette période : %.', v_conflicts
      using errcode = 'check_violation';
  end if;
  delete from public.ref_irg_zone_scopes where zone_code = p.target_key and effective_from = p_month;
  update public.ref_irg_zone_scopes set effective_to = p_month - 1
  where zone_code = p.target_key and effective_from < p_month and (effective_to is null or effective_to >= p_month);
  insert into public.ref_irg_zone_scopes (
    zone_code, effective_from, effective_to, wilaya_codes, scope_mode, group_from, proposal_id, decision_id
  ) values (
    p.target_key, p_month, v_next - 1, v_codes, p.payload->>'mode', p.payload->>'group_from', p.id, p_decision
  )
  returning id into v_id;
  return jsonb_build_object('row_id', v_id, 'effective_to', v_next - 1);
end;
$$;

create or replace function public.ref_rule_signal_drafts(p_from date, p_detail text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run uuid;
  v_bound date := public.hr_payroll_chain_bound(p_from);
  n integer := 0;
begin
  for v_run in
    select r.id from public.hr_payroll_runs r
    where r.status_code = 'DRAFT' and make_date(r.period_year, r.period_month, 1) >= p_from
      and (v_bound is null or make_date(r.period_year, r.period_month, 1) <= v_bound)
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

create or replace function public.ref_rule_application_fingerprint(p_id uuid, p_month date)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(concat_ws('|',
    p.status, p.updated_at, p_month, public.hr_payroll_chain_mode(), public.hr_first_open_month_for(p_month),
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
    'first_open_month', public.hr_first_open_month_for(p_month),
    'chain_mode', public.hr_payroll_chain_mode(),
    'bounded_to', public.hr_payroll_chain_bound(p_month),
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
            and (public.hr_payroll_chain_bound(p_month) is null
                 or make_date(r.period_year, r.period_month, 1) <= public.hr_payroll_chain_bound(p_month))
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
  if public.hr_month_is_closed(p_month) then
    raise exception '%', public.hr_closed_period_error(public.hr_first_open_month_for(p_month)) using errcode = 'check_violation';
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
  if public.hr_month_is_closed(v_month) then
    raise exception '%', public.hr_closed_period_error(public.hr_first_open_month_for(v_month)) using errcode = 'check_violation';
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
    'month', v_month, 'bounded_to', public.hr_payroll_chain_bound(v_month), 'flagged_runs', v_flagged
  ) || v_detail;
  update public.sys_decisions set
    status = 'EXECUTED', executed_by = auth.uid(), executed_at = now(), execution_result = v_result
  where id = d.id;
  return v_result;
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
begin
  select * into p from public.ref_rule_proposals where id = p_id for update;
  if p.status <> 'DRAFT' then
    raise exception 'Seule une proposition en brouillon peut être soumise.' using errcode = 'check_violation';
  end if;
  if p.action <> 'VERIFY' and public.hr_month_is_closed(p.requested_month) then
    raise exception '%', public.hr_closed_period_error(public.hr_first_open_month_for(p.requested_month))
      using errcode = 'check_violation';
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
  elsif not public.hr_month_is_closed(p.requested_month) then
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

-- ---------------------------------------------------------------------------
-- 10. D7: context, fingerprint, request and execution
-- ---------------------------------------------------------------------------
create or replace function public.hr_payroll_reopen_context(p_run uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with r as (
    select * from public.hr_payroll_runs where id = p_run
  ),
  sl as (
    select s.* from public.hr_payroll_slips s where s.run_id = p_run
  ),
  tb as (
    select b.id, b.batch_no, b.status_code, b.mode, b.executed_at, b.deposit_date,
           count(l.id) as lines, coalesce(sum(l.amount), 0) as amount
    from public.hr_payroll_transfer_batches b
    join public.hr_payroll_transfer_lines l on l.batch_id = b.id
    where l.slip_id in (select id from sl)
    group by b.id
  )
  select jsonb_build_object(
    'run_id', r.id,
    'site_name', coalesce((select s.name_fr from public.ref_sites s where s.id = r.site_id), 'Toute l''entreprise'),
    'period', public.sys_period_label(r.period_year, r.period_month),
    'period_nature', public.sys_period_nature(r.period_year, r.period_month),
    'status', r.status_code,
    'slip_count', (select count(*) from sl),
    'gross_total', (select coalesce(sum(gross_amount), 0) from sl),
    'irg_total', (select coalesce(sum(irg_amount), 0) from sl),
    'net_total', (select coalesce(sum(net_payable), 0) from sl),
    'validated_at', r.validated_at,
    'validated_by', (select u.full_name from public.sys_users u where u.id = r.validated_by),
    'locked_at', r.locked_at,
    'locked_by', (select u.full_name from public.sys_users u where u.id = r.locked_by),
    'transfers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'batch_no', tb.batch_no, 'status', tb.status_code, 'mode', tb.mode, 'lines', tb.lines,
        'amount', tb.amount, 'executed_at', tb.executed_at, 'deposit_date', tb.deposit_date) order by tb.batch_no)
      from tb), '[]'::jsonb),
    'transfer_executed', exists (select 1 from tb where tb.status_code = 'EXECUTED'),
    'transfer_pending', exists (select 1 from tb where tb.status_code in ('GENERATED', 'DEPOSITED')),
    'declarations_registry', false,
    'certificates', coalesce((
      select jsonb_agg(x.c order by x.at)
      from (
        select jsonb_build_object(
                 'number', c.number, 'type', c.type_code, 'issued_at', c.created_at,
                 'employee', trim(coalesce(e.matricule, '') || ' ' || coalesce(e.last_name, '') || ' ' || coalesce(e.first_name, ''))
               ) as c, c.created_at as at
        from public.hr_correspondences c
        join public.hr_employees e on e.id = c.employee_id
        where c.type_code in ('ATTEST', 'CERTIF', 'STC')
          and c.status_code <> 'CANCELLED'
          and c.employee_id in (select employee_id from sl)
          and c.created_at >= coalesce(r.validated_at, r.created_at)
        order by c.created_at
        limit 50
      ) x), '[]'::jsonb),
    'later_runs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'period', public.sys_period_label(x.period_year, x.period_month),
        'status', x.status_code,
        'site_name', coalesce((select s.name_fr from public.ref_sites s where s.id = x.site_id), 'Toute l''entreprise'))
        order by x.period_year, x.period_month)
      from public.hr_payroll_runs x
      where x.status_code in ('VALIDATED', 'LOCKED')
        and make_date(x.period_year, x.period_month, 1) > make_date(r.period_year, r.period_month, 1)
        and (r.site_id is null or x.site_id is null or x.site_id = r.site_id)), '[]'::jsonb),
    'prior_decisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'type', d.type_code, 'status', d.status, 'option', d.chosen_option,
        'at', coalesce(d.decided_at, d.requested_at)) order by d.requested_at)
      from public.sys_decisions d
      where d.run_id = r.id and not (d.type_code = 'D7' and d.status in ('PENDING', 'DECIDED'))), '[]'::jsonb),
    'versions', (select count(*) from public.hr_payroll_slip_versions v where v.run_id = r.id),
    'chain_mode', public.hr_payroll_chain_mode()
  )
  from r;
$$;

create or replace function public.hr_payroll_reopen_fingerprint(p_run uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(concat_ws('|',
    r.status_code, r.updated_at,
    (select count(*)::text || ':' || coalesce(sum(s.net_payable), 0)::text from public.hr_payroll_slips s where s.run_id = r.id),
    (select string_agg(b.id::text || ':' || b.status_code, ',' order by b.id)
     from public.hr_payroll_transfer_batches b
     where exists (
       select 1 from public.hr_payroll_transfer_lines l join public.hr_payroll_slips s on s.id = l.slip_id
       where l.batch_id = b.id and s.run_id = r.id)),
    (select count(*) from public.hr_correspondences c
     where c.type_code in ('ATTEST', 'CERTIF', 'STC') and c.status_code <> 'CANCELLED'
       and c.employee_id in (select s.employee_id from public.hr_payroll_slips s where s.run_id = r.id)
       and c.created_at >= coalesce(r.validated_at, r.created_at))
  ))
  from public.hr_payroll_runs r
  where r.id = p_run;
$$;

create or replace function public.hr_payroll_pending_transfer(p_run uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.hr_payroll_transfer_lines l
    join public.hr_payroll_transfer_batches b on b.id = l.batch_id
    join public.hr_payroll_slips s on s.id = l.slip_id
    where s.run_id = p_run and l.is_live and b.status_code in ('GENERATED', 'DEPOSITED')
  );
$$;

create or replace function public.hr_payroll_request_reopen(p_run uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  r public.hr_payroll_runs%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_key text;
  v_existing uuid;
  v_ctx jsonb;
  v_id uuid;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.hr_payroll_runs where id = p_run;
  if not found then
    raise exception 'Paie introuvable.' using errcode = 'no_data_found';
  end if;
  if not public.erp_has_perm('hr_payroll', 'update'::public.rbac_action, r.site_id) then
    raise exception 'Demande de réouverture non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  if r.status_code not in ('VALIDATED', 'LOCKED') then
    raise exception 'Seule une paie validée ou clôturée se réouvre (décision D7).' using errcode = 'check_violation';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    raise exception 'Motif de la réouverture obligatoire (10 à 500 caractères).' using errcode = 'check_violation';
  end if;
  if public.hr_payroll_pending_transfer(r.id) then
    raise exception 'Lot de virement généré ou déposé pour cette paie : annulez-le, ou enregistrez son exécution, avant de demander la réouverture.'
      using errcode = 'check_violation';
  end if;

  v_key := 'D7:' || r.id::text;
  select id into v_existing from public.sys_decisions where dedupe_key = v_key and status in ('PENDING', 'DECIDED');
  if v_existing is not null then
    return v_existing;
  end if;

  v_ctx := public.hr_payroll_reopen_context(r.id) || jsonb_build_object('reason', v_reason);
  insert into public.sys_decisions (
    type_code, dedupe_key, period_year, period_month, site_id, run_id, scope, context, options, fingerprint,
    request_source, requested_by
  )
  select 'D7', v_key, r.period_year, r.period_month, r.site_id, r.id,
         jsonb_build_object('run_id', r.id, 'reason', v_reason, 'status_at_request', r.status_code),
         v_ctx, t.options, public.hr_payroll_reopen_fingerprint(r.id), 'PAYROLL_REOPEN', v_uid
  from public.sys_decision_types t
  where t.code = 'D7'
  returning id into v_id;

  perform public.sys_notify(
    'DECISION_PENDING',
    format('Réouverture demandée : paie %s — %s', v_ctx->>'period', v_ctx->>'site_name'),
    case when (v_ctx->>'transfer_executed')::boolean
      then 'Un virement de ce mois a déjà été exécuté : risque de double paiement. Rien n''est réouvert sans votre décision.'
      else 'Paie validée ou clôturée. Rien n''est réouvert sans votre décision.' end,
    '/decisions/' || v_id,
    null,
    'decision_payroll_reopen',
    v_id
  );
  return v_id;
end;
$$;

create or replace function public.hr_decision_apply_d7(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.sys_decisions%rowtype;
  r public.hr_payroll_runs%rowtype;
  n_versions integer := 0;
  n_slips integer := 0;
  n_executed integer := 0;
  v_result jsonb;
begin
  select * into d from public.sys_decisions
  where id = p_id and type_code = 'D7' and status = 'DECIDED' and chosen_option = 'REOPEN'
  for update;
  if not found then
    raise exception 'Décision D7 « Réouvrir » introuvable ou déjà consommée.' using errcode = 'no_data_found';
  end if;
  if not public.erp_is_super_admin(auth.uid()) or not public.erp_is_super_admin(d.decided_by) then
    raise exception 'Réouverture réservée au SUPER_ADMIN (non délégable).' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.hr_payroll_runs where id = d.run_id for update;
  if not found or r.id is distinct from (d.scope->>'run_id')::uuid then
    raise exception 'Paie de la décision introuvable.' using errcode = 'no_data_found';
  end if;
  if r.status_code not in ('VALIDATED', 'LOCKED') then
    raise exception 'La paie n''est plus validée ni clôturée.' using errcode = 'check_violation';
  end if;
  if public.hr_payroll_pending_transfer(r.id) then
    raise exception 'Lot de virement généré ou déposé pour cette paie : annulez-le avant la réouverture.'
      using errcode = 'check_violation';
  end if;

  perform set_config('hr.payroll_reopen', d.id::text, true);

  insert into public.hr_payroll_slip_versions (
    slip_id, run_id, employee_id, version_no, run_status, slip, lines, decision_id, captured_by
  )
  select s.id, s.run_id, s.employee_id,
         coalesce((select max(v.version_no) from public.hr_payroll_slip_versions v where v.slip_id = s.id), 0) + 1,
         r.status_code,
         to_jsonb(s),
         coalesce((
           select jsonb_agg(to_jsonb(l) order by l.sort_order, l.code)
           from public.hr_payroll_slip_lines l where l.slip_id = s.id), '[]'::jsonb),
         d.id, auth.uid()
  from public.hr_payroll_slips s
  where s.run_id = r.id;
  get diagnostics n_versions = row_count;

  select count(distinct b.id) into n_executed
  from public.hr_payroll_transfer_batches b
  join public.hr_payroll_transfer_lines l on l.batch_id = b.id
  join public.hr_payroll_slips s on s.id = l.slip_id
  where s.run_id = r.id and b.status_code = 'EXECUTED';

  update public.hr_payroll_runs set
    status_code = 'DRAFT', validated_at = null, validated_by = null, locked_at = null, locked_by = null
  where id = r.id;
  update public.hr_payroll_slips set status_code = 'DRAFT', locked_at = null
  where run_id = r.id and status_code in ('VALIDATED', 'LOCKED');
  get diagnostics n_slips = row_count;

  v_result := jsonb_build_object(
    'operation', 'PAYROLL_REOPENED', 'run_id', r.id, 'from_status', r.status_code,
    'slips', n_slips, 'versions', n_versions, 'executed_transfers', n_executed
  );
  update public.sys_decisions set
    status = 'EXECUTED', executed_by = auth.uid(), executed_at = now(), execution_result = v_result
  where id = d.id;
  perform set_config('hr.payroll_reopen', '', true);
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Guard triggers: reopening only under D7, validation blocked while D6 is required
-- ---------------------------------------------------------------------------
create or replace function public.hr_payroll_chain_required(p_year integer, p_month integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.sys_period_nature(p_year, p_month) = 'OPERATIONAL'
     and public.hr_payroll_chain_mode() = 'UNDECIDED'
     and public.hr_first_open_payroll_month() < public.hr_operational_start();
$$;

create or replace function public.hr_payroll_run_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reopen boolean := false;
begin
  if tg_op = 'DELETE' then
    if old.status_code <> 'DRAFT' then
      raise exception 'Paie % : suppression impossible (validée ou clôturée).', old.status_code
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if new.status_code = 'DRAFT' and old.status_code in ('VALIDATED', 'LOCKED') then
    v_reopen := public.hr_payroll_reopen_allows(old.id);
    if not v_reopen then
      raise exception 'Réouverture de paie : décision D7 du SUPER_ADMIN requise (Centre de décisions).'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if old.status_code = 'LOCKED' and not v_reopen then
    raise exception 'Paie clôturée : aucune modification possible sans décision D7 du SUPER_ADMIN.'
      using errcode = 'check_violation';
  end if;

  if new.status_code is distinct from old.status_code
     and not (
       (old.status_code = 'DRAFT' and new.status_code = 'VALIDATED')
       or (old.status_code = 'VALIDATED' and new.status_code = 'LOCKED')
       or v_reopen
     ) then
    raise exception 'Transition de paie refusée : % → %.', old.status_code, new.status_code
      using errcode = 'check_violation';
  end if;

  if v_reopen and (new.period_year, new.period_month, new.site_id)
                  is distinct from (old.period_year, old.period_month, old.site_id) then
    raise exception 'Réouverture : période et chantier figés.' using errcode = 'check_violation';
  end if;

  -- auth.uid() is null for service-role / maintenance sessions.
  if new.status_code is distinct from old.status_code and auth.uid() is not null then
    if new.status_code = 'LOCKED'
       and not public.erp_has_any_role(array['SUPER_ADMIN', 'GERANT']) then
      raise exception 'Clôture de paie réservée à SUPER_ADMIN et GERANT.'
        using errcode = 'insufficient_privilege';
    end if;
    if new.status_code = 'VALIDATED'
       and not public.erp_has_any_role(array['SUPER_ADMIN', 'ADMIN_RH', 'GERANT']) then
      raise exception 'Validation de paie réservée à SUPER_ADMIN, ADMIN_RH et GERANT.'
        using errcode = 'insufficient_privilege';
    end if;
    if new.status_code = 'DRAFT' and not public.erp_is_super_admin(auth.uid()) then
      raise exception 'Réouverture réservée au SUPER_ADMIN (décision D7).' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if old.status_code = 'DRAFT' and new.status_code = 'VALIDATED'
     and public.hr_payroll_chain_required(new.period_year, new.period_month) then
    raise exception 'Validation bloquée : des mois de reprise (janvier à août 2026) restent ouverts. Décision D6 requise (Centre de décisions) : attendre, figer leurs paramètres ou séparer la chaîne de reprise.'
      using errcode = 'check_violation';
  end if;

  if old.status_code = 'VALIDATED'
     and new.status_code = 'VALIDATED'
     and (new.period_year, new.period_month, new.site_id)
         is distinct from (old.period_year, old.period_month, old.site_id) then
    raise exception 'Paie validée : période et chantier figés.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace function public.hr_payroll_slip_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  run_status text;
begin
  if tg_op = 'INSERT' then
    select status_code into run_status from public.hr_payroll_runs where id = new.run_id;
    if run_status is distinct from 'DRAFT' then
      raise exception 'Paie % : ajout de bulletin impossible.', coalesce(run_status, '?')
        using errcode = 'check_violation';
    end if;
    if new.status_code is distinct from 'DRAFT' then
      raise exception 'Nouveau bulletin : statut DRAFT obligatoire.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status_code <> 'DRAFT' then
      raise exception 'Bulletin % : suppression impossible.', old.status_code
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if old.status_code = 'LOCKED' then
    if new.status_code = 'DRAFT'
       and public.hr_payroll_reopen_allows(old.run_id)
       and (to_jsonb(new) - 'status_code' - 'locked_at' - 'updated_at')
           = (to_jsonb(old) - 'status_code' - 'locked_at' - 'updated_at') then
      return new;
    end if;
    raise exception 'Bulletin verrouillé : aucune modification possible sans décision D7 du SUPER_ADMIN.'
      using errcode = 'check_violation';
  end if;

  if new.status_code is distinct from old.status_code then
    select status_code into run_status from public.hr_payroll_runs where id = new.run_id;
    if new.status_code is distinct from run_status then
      raise exception 'Bulletin : le statut suit la paie du mois (% demandé, paie %).',
        new.status_code, coalesce(run_status, '?')
        using errcode = 'check_violation';
    end if;
  end if;

  if old.status_code = 'VALIDATED'
     and (to_jsonb(new) - 'status_code' - 'locked_at' - 'updated_at')
         is distinct from (to_jsonb(old) - 'status_code' - 'locked_at' - 'updated_at') then
    raise exception 'Bulletin validé : montants figés. Une réouverture (décision D7) est nécessaire pour recalculer.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Reopening never touches a batch in progress; a slip already paid (executed batch) is reopened only under D7
-- and stays in its batch, so a second transfer for it remains blocked (unique live line).
create or replace function public.hr_slip_transfer_lock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status_code = 'DRAFT' and old.status_code <> 'DRAFT' then
    if exists (
      select 1 from public.hr_payroll_transfer_lines l
      join public.hr_payroll_transfer_batches b on b.id = l.batch_id
      where l.slip_id = old.id and l.is_live and b.status_code <> 'EXECUTED'
    ) then
      raise exception 'Bulletin inclus dans un lot de virement : annulez le lot avant de réouvrir la paie.'
        using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.hr_payroll_transfer_lines l where l.slip_id = old.id and l.is_live)
       and not public.hr_payroll_reopen_allows(old.run_id) then
      raise exception 'Bulletin déjà viré (lot exécuté) : réouverture uniquement par décision D7 du SUPER_ADMIN.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.hr_payroll_run_transition(p_run_id uuid, p_action text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r public.hr_payroll_runs%rowtype;
  target text;
  n integer;
  expected integer;
  period_start date;
  period_end date;
begin
  if p_action = 'reopen' then
    raise exception 'Réouverture : décision D7 du SUPER_ADMIN requise (demande depuis l''écran Paie, décision au Centre de décisions).'
      using errcode = 'insufficient_privilege';
  end if;

  select * into r from public.hr_payroll_runs where id = p_run_id for update;
  if not found then
    raise exception 'Paie introuvable.' using errcode = 'no_data_found';
  end if;

  target := case
    when p_action = 'validate' and r.status_code = 'DRAFT' then 'VALIDATED'
    when p_action = 'close' and r.status_code = 'VALIDATED' then 'LOCKED'
  end;
  if target is null then
    raise exception 'Transition de paie refusée : % depuis %.', p_action, r.status_code
      using errcode = 'check_violation';
  end if;

  if p_action = 'validate' then
    select count(*) into n from public.hr_payroll_slips where run_id = r.id;
    if n = 0 then
      raise exception 'Aucun bulletin à valider : générez la paie d''abord.'
        using errcode = 'check_violation';
    end if;
    period_start := make_date(r.period_year, r.period_month, 1);
    period_end := (period_start + interval '1 month' - interval '1 day')::date;
    select count(*) into n
    from public.hr_attendance a
    where a.status_code = 'PROPOSED'
      and a.work_date between period_start and period_end
      and (r.site_id is null or a.site_id = r.site_id);
    if n > 0 then
      raise exception '% jour(s) proposé(s) (ordres de mission) non validé(s) dans le pointage.', n
        using errcode = 'check_violation';
    end if;
  end if;

  update public.hr_payroll_runs set
    status_code = target,
    validated_at = case target when 'VALIDATED' then now() else validated_at end,
    validated_by = case target when 'VALIDATED' then auth.uid() else validated_by end,
    locked_at = case when target = 'LOCKED' then now() else locked_at end,
    locked_by = case when target = 'LOCKED' then auth.uid() else locked_by end
  where id = r.id;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Accès refusé à cette paie.' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into expected
  from public.hr_payroll_slips
  where run_id = r.id
    and status_code = case target when 'VALIDATED' then 'DRAFT' else 'VALIDATED' end;

  if target = 'VALIDATED' then
    update public.hr_payroll_slips set status_code = 'VALIDATED'
    where run_id = r.id and status_code = 'DRAFT';
  else
    update public.hr_payroll_slips set status_code = 'LOCKED', locked_at = now()
    where run_id = r.id and status_code = 'VALIDATED';
  end if;
  get diagnostics n = row_count;
  if n <> expected then
    raise exception 'Accès refusé aux bulletins de cette paie.' using errcode = 'insufficient_privilege';
  end if;

  return target;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. D6: context, fingerprint, request and execution
-- ---------------------------------------------------------------------------
create or replace function public.hr_payroll_chain_context(p_run uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'run_id', r.id,
    'run_period', public.sys_period_label(r.period_year, r.period_month),
    'site_name', coalesce(s.name_fr, 'Toute l''entreprise'),
    'global_open', public.hr_first_open_payroll_month(),
    'operational_start', public.hr_operational_start(),
    'reprise_months', (
      select jsonb_agg(jsonb_build_object(
        'month', g.m::date,
        'period', public.sys_period_label(extract(year from g.m)::integer, extract(month from g.m)::integer),
        'open', g.m::date >= public.hr_first_open_payroll_month(),
        'runs', (select count(*) from public.hr_payroll_runs x
                 where x.period_year = extract(year from g.m)::integer and x.period_month = extract(month from g.m)::integer),
        'validated', (select count(*) from public.hr_payroll_runs x
                      where x.period_year = extract(year from g.m)::integer and x.period_month = extract(month from g.m)::integer
                        and x.status_code in ('VALIDATED', 'LOCKED')),
        'slips', (select count(*) from public.hr_payroll_slips sl
                  join public.hr_payroll_runs x on x.id = sl.run_id
                  where x.period_year = extract(year from g.m)::integer and x.period_month = extract(month from g.m)::integer)
      ) order by g.m)
      from generate_series(date '2026-01-01', date '2026-08-01', interval '1 month') as g(m)),
    'pending_rules', (
      select count(*) from public.ref_rule_proposals p
      where p.status in ('DRAFT', 'SUBMITTED', 'APPROVED') and p.action <> 'VERIFY'
        and p.requested_month < public.hr_operational_start())
  )
  from public.hr_payroll_runs r
  left join public.ref_sites s on s.id = r.site_id
  where r.id = p_run;
$$;

create or replace function public.hr_payroll_chain_fingerprint()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(concat_ws('|',
    public.hr_payroll_chain_mode(),
    public.hr_first_open_payroll_month(),
    (select string_agg(r.id::text || ':' || r.status_code, ',' order by r.id)
     from public.hr_payroll_runs r
     where public.sys_period_nature(r.period_year, r.period_month) = 'EXTERNAL'),
    (select count(*) from public.ref_rule_proposals p
     where p.status in ('DRAFT', 'SUBMITTED', 'APPROVED') and p.action <> 'VERIFY'
       and p.requested_month < public.hr_operational_start())
  ));
$$;

create or replace function public.hr_payroll_request_chain_decision(p_run uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  r public.hr_payroll_runs%rowtype;
  v_existing uuid;
  v_ctx jsonb;
  v_id uuid;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.hr_payroll_runs where id = p_run;
  if not found then
    raise exception 'Paie introuvable.' using errcode = 'no_data_found';
  end if;
  if not public.erp_has_perm('hr_payroll', 'update'::public.rbac_action, r.site_id) then
    raise exception 'Demande non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  if not public.hr_payroll_chain_required(r.period_year, r.period_month) then
    raise exception 'Aucune décision D6 nécessaire pour cette paie.' using errcode = 'check_violation';
  end if;
  select id into v_existing from public.sys_decisions where dedupe_key = 'D6' and status in ('PENDING', 'DECIDED');
  if v_existing is not null then
    return v_existing;
  end if;

  v_ctx := public.hr_payroll_chain_context(r.id);
  insert into public.sys_decisions (
    type_code, dedupe_key, period_year, period_month, site_id, scope, context, options, fingerprint,
    request_source, requested_by
  )
  select 'D6', 'D6', r.period_year, r.period_month, r.site_id,
         jsonb_build_object('run_id', r.id), v_ctx, t.options, public.hr_payroll_chain_fingerprint(),
         'PAYROLL_VALIDATION', v_uid
  from public.sys_decision_types t
  where t.code = 'D6'
  returning id into v_id;

  perform public.sys_notify(
    'DECISION_PENDING',
    format('Validation de la paie %s : mois de reprise encore ouverts', v_ctx->>'run_period'),
    'Valider ce mois figerait les paramètres de janvier à août 2026. Rien n''est validé sans votre décision.',
    '/decisions/' || v_id,
    null,
    'decision_payroll_chains',
    v_id
  );
  return v_id;
end;
$$;

create or replace function public.hr_decision_apply_d6(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.sys_decisions%rowtype;
  v_mode text;
  v_result jsonb;
begin
  select * into d from public.sys_decisions where id = p_id and type_code = 'D6' and status = 'DECIDED' for update;
  if not found then
    raise exception 'Décision D6 introuvable ou non décidée.' using errcode = 'no_data_found';
  end if;
  if public.hr_payroll_chain_mode() <> 'UNDECIDED' then
    raise exception 'Politique de clôture déjà décidée.' using errcode = 'check_violation';
  end if;
  v_mode := case d.chosen_option when 'FREEZE' then 'FROZEN' when 'SEPARATE' then 'SEPARATE' end;
  if v_mode is null then
    raise exception 'Option D6 inconnue.' using errcode = 'check_violation';
  end if;
  insert into public.hr_payroll_chain_policy (id, mode, decision_id, decided_by)
  values (true, v_mode, d.id, auth.uid());
  v_result := jsonb_build_object(
    'operation', 'CHAIN_POLICY', 'mode', v_mode,
    'external_open', public.hr_payroll_chain_first_open('EXTERNAL'),
    'operational_open', greatest(public.hr_payroll_chain_first_open('OPERATIONAL'), public.hr_operational_start())
  );
  update public.sys_decisions set
    status = 'EXECUTED', executed_by = auth.uid(), executed_at = now(), execution_result = v_result
  where id = d.id;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Decision engine: D7 not delegable, D6 / D7 fingerprints, refresh and immediate execution
-- ---------------------------------------------------------------------------
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
       or (
         p_type <> 'D7'
         and exists (
           select 1 from public.sys_decision_types t
           where t.code = p_type and t.is_active
             and public.erp_has_perm(t.screen_code, 'update'::public.rbac_action, null, p_uid)
         )
       )
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
    when 'D8' then public.hr_assignment_correction_fingerprint((d.scope->>'assignment_id')::uuid)
    when 'D13' then public.hr_contract_start_fingerprint((d.scope->>'contract_id')::uuid)
    when 'D2' then public.ref_rule_application_fingerprint((d.scope->>'proposal_id')::uuid, (d.scope->>'month')::date)
    when 'D7' then public.hr_payroll_reopen_fingerprint(d.run_id)
    when 'D6' then public.hr_payroll_chain_fingerprint()
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

  -- Reference-data and closing decisions run in the same transaction: decided and applied together, or not at all.
  if v_executes and d.type_code in ('D8', 'D13', 'D2', 'D6', 'D7') then
    if d.type_code = 'D8' then
      perform public.hr_decision_apply_d8(d.id);
    elsif d.type_code = 'D13' then
      perform public.hr_decision_apply_d13(d.id);
    elsif d.type_code = 'D2' then
      perform public.ref_rule_apply_d2(d.id);
    elsif d.type_code = 'D6' then
      perform public.hr_decision_apply_d6(d.id);
    else
      perform public.hr_decision_apply_d7(d.id);
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
-- 14. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.sys_permissions_non_delegable_guard() from public, anon, authenticated;
revoke all on function public.sys_audit_ensure_partitions(date) from public, anon, authenticated;
revoke all on function public.hr_payroll_slip_versions_immutable() from public, anon, authenticated;
revoke all on function public.hr_payroll_reopen_flag() from public, anon, authenticated;
revoke all on function public.hr_payroll_reopen_allows(uuid) from public, anon, authenticated;
revoke all on function public.hr_payroll_audit_row_change() from public, anon, authenticated;
revoke all on function public.hr_payroll_chain_policy_immutable() from public, anon, authenticated;
revoke all on function public.hr_payroll_chain_mode() from public, anon, authenticated;
revoke all on function public.hr_payroll_chain_first_open(text) from public, anon, authenticated;
revoke all on function public.hr_first_open_month_for(date) from public, anon, authenticated;
revoke all on function public.hr_month_is_closed(date) from public, anon, authenticated;
revoke all on function public.hr_range_touches_closed(date, date) from public, anon, authenticated;
revoke all on function public.hr_closed_range_error(date) from public, anon, authenticated;
revoke all on function public.hr_payroll_chain_bound(date) from public, anon, authenticated;
revoke all on function public.ref_rule_chain_split(text, text, date) from public, anon, authenticated;
revoke all on function public.hr_payroll_reopen_context(uuid) from public, anon, authenticated;
revoke all on function public.hr_payroll_reopen_fingerprint(uuid) from public, anon, authenticated;
revoke all on function public.hr_payroll_pending_transfer(uuid) from public, anon, authenticated;
revoke all on function public.hr_decision_apply_d7(uuid) from public, anon, authenticated;
revoke all on function public.hr_payroll_chain_required(integer, integer) from public, anon, authenticated;
revoke all on function public.hr_payroll_chain_context(uuid) from public, anon, authenticated;
revoke all on function public.hr_payroll_chain_fingerprint() from public, anon, authenticated;
revoke all on function public.hr_decision_apply_d6(uuid) from public, anon, authenticated;

revoke all on function public.hr_set_legal_var_version(uuid, date, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.hr_stop_legal_var(uuid, date) from public, anon, authenticated;
revoke all on function public.hr_set_social_profile_rates(uuid, date, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.ref_rule_apply_irg_version(text, uuid, date, uuid, uuid) from public, anon, authenticated;
revoke all on function public.ref_rule_apply_zone_scope(uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.ref_rule_signal_drafts(date, text) from public, anon, authenticated;
revoke all on function public.ref_rule_application_fingerprint(uuid, date) from public, anon, authenticated;
revoke all on function public.ref_rule_application_context(uuid, date, date) from public, anon, authenticated;
revoke all on function public.ref_rule_request_application_internal(uuid, date, date) from public, anon, authenticated;
revoke all on function public.ref_rule_apply_d2(uuid) from public, anon, authenticated;
revoke all on function public.ref_rule_submit_internal(uuid) from public, anon, authenticated;
revoke all on function public.sys_decision_refresh_record(uuid) from public, anon, authenticated;
revoke all on function public.sys_decision_current_fingerprint(uuid) from public, anon, authenticated;

revoke all on function public.hr_payroll_request_reopen(uuid, text) from public, anon;
revoke all on function public.hr_payroll_request_chain_decision(uuid) from public, anon;
revoke all on function public.hr_payroll_chain_state() from public, anon;
revoke all on function public.ref_rule_proposal_approve(uuid, text) from public, anon;
revoke all on function public.sys_decision_decide(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.hr_payroll_run_transition(uuid, text) from public, anon;

grant execute on function public.hr_payroll_request_reopen(uuid, text) to authenticated;
grant execute on function public.hr_payroll_request_chain_decision(uuid) to authenticated;
grant execute on function public.hr_payroll_chain_state() to authenticated;
grant execute on function public.ref_rule_proposal_approve(uuid, text) to authenticated;
grant execute on function public.sys_decision_decide(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.hr_payroll_run_transition(uuid, text) to authenticated;

commit;
