-- Lot 8 — Veille juridique : sources surveillées, vérification planifiée et textes détectés
--   1. Le SUPER_ADMIN gère une liste de domaines autorisés (sites officiels préremplis), les pages surveillées sur ces
--      domaines (https uniquement) avec leur fréquence, et les mots-clés qui signalent un texte lié à la paie.
--   2. Une vérification (quotidienne par Vercel Cron, ou « Vérifier maintenant ») lit chaque page due, relève les liens
--      nouveaux et les enregistre comme « textes détectés ». La première lecture d'une page sert de référence : ses
--      liens sont conservés sans notification.
--   3. Un texte détecté n'a aucun effet : un humain l'écarte (motif) ou l'importe au registre des documents juridiques
--      (lot 4) en complétant ses informations. L'analyse IA (lot 7) reste lancée par un humain.
--   4. Aucune donnée n'est envoyée à Gemini pendant la veille. La veille ne garantit pas que tout nouveau texte est
--      détecté : la date de la dernière vérification et les erreurs de chaque source sont affichées.

begin;

-- ---------------------------------------------------------------------------
-- 1. Rights matrix and notification kind
-- ---------------------------------------------------------------------------
insert into public.sys_screens (code, path, module, label_fr, label_ar, sort_order) values
  ('legal_watch', '/rh/legal/veille', 'rh',
   'Veille juridique · consulter (lire), vérifier et importer (créer), gérer sources, domaines et mots-clés (modifier)',
   'الرصد القانوني', 217)
on conflict (code) do nothing;

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select r.id, s.id, true, true, true, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code = 'SUPER_ADMIN'
  and s.code = 'legal_watch'
on conflict (role_id, screen_id) do nothing;

alter table public.sys_notifications drop constraint if exists sys_notifications_kind_check;
alter table public.sys_notifications add constraint sys_notifications_kind_check
  check (kind in ('DECISION_PENDING', 'DECISION_TAKEN', 'DECISION_INVALIDATED', 'ATTENDANCE_IMPORT', 'LEGAL_WATCH'));

-- ---------------------------------------------------------------------------
-- 2. Configuration: allowed domains, keywords, watched pages
-- ---------------------------------------------------------------------------
create table if not exists public.ref_watch_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique
    check (char_length(domain) <= 200 and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'),
  label text not null check (char_length(btrim(label)) between 2 and 120),
  is_active boolean not null default true,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.sys_users(id),
  updated_at timestamptz
);

create table if not exists public.ref_watch_keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null check (char_length(btrim(keyword)) between 2 and 80),
  folded text not null unique check (char_length(folded) between 2 and 80),
  is_active boolean not null default true,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.sys_users(id),
  updated_at timestamptz
);

create table if not exists public.ref_watch_sources (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(btrim(label)) between 3 and 120),
  url text not null unique check (char_length(url) <= 500 and url ~ '^https://'),
  frequency text not null default 'WEEKLY' check (frequency in ('DAILY', 'WEEKLY', 'MONTHLY')),
  is_active boolean not null default true,
  last_checked_at timestamptz,
  last_status text check (last_status in ('OK', 'UNCHANGED', 'ERROR')),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_content_hash text check (last_content_hash is null or last_content_hash ~ '^[0-9a-f]{64}$'),
  baseline_done boolean not null default false,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.sys_users(id),
  updated_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 3. Checks and detected texts (logs: never deleted)
-- ---------------------------------------------------------------------------
create table if not exists public.ref_watch_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('CRON', 'MANUAL')),
  started_by uuid references public.sys_users(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'RUNNING' check (status in ('RUNNING', 'DONE', 'FAILED')),
  sources_planned integer not null default 0,
  sources_checked integer not null default 0,
  sources_failed integer not null default 0,
  items_new integer not null default 0,
  items_relevant integer not null default 0,
  note text check (note is null or char_length(note) <= 500),
  constraint ref_watch_runs_starter_chk check ((trigger = 'MANUAL') = (started_by is not null)),
  constraint ref_watch_runs_finished_chk check ((status = 'RUNNING') = (finished_at is null))
);
create index if not exists ref_watch_runs_started_idx on public.ref_watch_runs (started_at desc);

create table if not exists public.ref_watch_checks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ref_watch_runs(id),
  source_id uuid not null references public.ref_watch_sources(id),
  checked_at timestamptz not null default now(),
  status text not null check (status in ('OK', 'UNCHANGED', 'ERROR')),
  http_status integer check (http_status is null or http_status between 100 and 599),
  error text check (error is null or char_length(error) <= 500),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  links_found integer not null default 0,
  items_new integer not null default 0,
  items_relevant integer not null default 0,
  unique (run_id, source_id),
  constraint ref_watch_checks_error_chk check ((status = 'ERROR') = (error is not null))
);
create index if not exists ref_watch_checks_source_idx on public.ref_watch_checks (source_id, checked_at desc);

create table if not exists public.ref_watch_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.ref_watch_sources(id),
  run_id uuid not null references public.ref_watch_runs(id),
  url text not null unique check (char_length(url) <= 1000 and url ~ '^https://'),
  title text check (title is null or char_length(title) <= 500),
  first_seen_at timestamptz not null default now(),
  keywords text[] not null default '{}',
  relevant boolean not null default false,
  baseline boolean not null default false,
  status text not null default 'NEW' check (status in ('NEW', 'IMPORTED', 'IGNORED')),
  document_id uuid references public.ref_legal_documents(id),
  decided_by uuid references public.sys_users(id),
  decided_at timestamptz,
  ignore_reason text check (ignore_reason is null or char_length(ignore_reason) <= 300),
  constraint ref_watch_items_imported_chk check ((status = 'IMPORTED') = (document_id is not null)),
  constraint ref_watch_items_decided_chk check (status = 'NEW' or (decided_by is not null and decided_at is not null)),
  constraint ref_watch_items_ignored_chk check ((status = 'IGNORED') = (ignore_reason is not null)),
  constraint ref_watch_items_relevant_chk check (relevant = (cardinality(keywords) > 0))
);
create index if not exists ref_watch_items_seen_idx on public.ref_watch_items (first_seen_at desc);
create index if not exists ref_watch_items_status_idx on public.ref_watch_items (status, relevant);

-- ---------------------------------------------------------------------------
-- 4. Guards, audit, read access
-- ---------------------------------------------------------------------------
create or replace function public.ref_watch_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Veille juridique : suppression interdite (désactivez, ou écartez avec un motif).'
      using errcode = 'check_violation';
  end if;
  if coalesce(current_setting('ref.watch', true), '') <> 'on' then
    raise exception 'Veille juridique : enregistrement écrit uniquement par les fonctions de la veille.'
      using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' then
    if tg_table_name = 'ref_watch_checks' then
      raise exception 'Veille juridique : une vérification enregistrée ne se modifie pas.' using errcode = 'check_violation';
    elsif tg_table_name = 'ref_watch_runs' then
      if old.status <> 'RUNNING'
         or (new.trigger, new.started_by, new.started_at) is distinct from (old.trigger, old.started_by, old.started_at) then
        raise exception 'Veille juridique : vérification close, enregistrement définitif.' using errcode = 'check_violation';
      end if;
    elsif tg_table_name = 'ref_watch_items' then
      if old.status <> 'NEW'
         or (to_jsonb(new) - array['status', 'document_id', 'decided_by', 'decided_at', 'ignore_reason'])
            is distinct from (to_jsonb(old) - array['status', 'document_id', 'decided_by', 'decided_at', 'ignore_reason']) then
        raise exception 'Texte détecté : seul un texte nouveau peut être importé ou écarté.' using errcode = 'check_violation';
      end if;
    elsif tg_table_name = 'ref_watch_domains' then
      if to_jsonb(new)->>'domain' is distinct from to_jsonb(old)->>'domain' then
        raise exception 'Un domaine autorisé ne se renomme pas : désactivez-le et ajoutez le nouveau.' using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['ref_watch_domains', 'ref_watch_keywords', 'ref_watch_sources', 'ref_watch_runs',
                           'ref_watch_checks', 'ref_watch_items'] loop
    execute format('drop trigger if exists trg_%s_guard on public.%I', t, t);
    execute format(
      'create trigger trg_%s_guard before insert or update or delete on public.%I
         for each row execute function public.ref_watch_guard()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %s_read on public.%I', t, t);
    execute format(
      'create policy %s_read on public.%I for select to authenticated
         using (public.erp_has_perm(''legal_watch'', ''read''::public.rbac_action, null))', t, t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
  foreach t in array array['ref_watch_domains', 'ref_watch_keywords', 'ref_watch_sources', 'ref_watch_items'] loop
    execute format('drop trigger if exists trg_%s_audit on public.%I', t, t);
    execute format(
      'create trigger trg_%s_audit after insert or update on public.%I
         for each row execute function public.sys_audit_row_change()', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Helpers
-- ---------------------------------------------------------------------------
-- Host of an https address (lower case), or null: no credentials, no port other than 443, no IP literal.
-- Keep in sync with parseWatchUrl() in src/lib/watch/net.ts.
create or replace function public.ref_watch_host(p_url text)
returns text
language sql
immutable
as $$
  select case
    when h is null or h ~ '^[0-9.]+$' or h !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$' then null
    else h
  end
  from (
    select lower(substring(btrim(coalesce(p_url, '')) from '^[Hh][Tt][Tt][Pp][Ss]://([^/?#@:\s\[\]]+)(?::443)?(?:[/?#]\S*)?$')) as h
  ) x;
$$;

create or replace function public.ref_watch_url_allowed(p_url text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(char_length(p_url) <= 1000, false) and exists (
    select 1 from public.ref_watch_domains d
    where d.is_active
      and (public.ref_watch_host(p_url) = d.domain or public.ref_watch_host(p_url) like '%.' || d.domain)
  );
$$;

create or replace function public.ref_watch_keywords_match(p_text text)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(k.keyword order by k.keyword), '{}'::text[])
  from public.ref_watch_keywords k
  where k.is_active and position(k.folded in public.ref_ai_fold(p_text)) > 0;
$$;

create or replace function public.ref_watch_can_read()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.erp_has_perm('legal_watch', 'read'::public.rbac_action, null);
$$;

-- Who runs a check: an active user holding the right (manual check), or the scheduler (service role, no user).
create or replace function public.ref_watch_actor()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null then
    if not public.sys_user_is_active(v_uid)
       or not public.erp_has_perm('legal_watch', 'create'::public.rbac_action, null) then
      raise exception 'Vérification de la veille juridique non autorisée.' using errcode = 'insufficient_privilege';
    end if;
    return v_uid;
  end if;
  if coalesce(auth.role(), '') = 'service_role' then
    return null;
  end if;
  raise exception 'Session requise.' using errcode = 'insufficient_privilege';
end;
$$;

create or replace function public.ref_watch_require(p_action text)
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
  if not public.erp_has_perm('legal_watch', p_action::public.rbac_action, null) then
    raise exception '%', case when p_action = 'update'
      then 'Gestion des sources de veille non autorisée.'
      else 'Traitement des textes détectés non autorisé.' end
      using errcode = 'insufficient_privilege';
  end if;
  return v_uid;
end;
$$;

-- A source is due when its period has elapsed (a little margin for the daily schedule); after an error, the next day.
create or replace function public.ref_watch_source_due(s public.ref_watch_sources)
returns boolean
language sql
stable
as $$
  select s.last_checked_at is null
      or s.last_checked_at <= now() - case
           when s.last_status = 'ERROR' or s.frequency = 'DAILY' then interval '20 hours'
           when s.frequency = 'WEEKLY' then interval '6 days 20 hours'
           else interval '27 days'
         end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Seed: official domains and payroll keywords (editable by the SUPER_ADMIN)
-- ---------------------------------------------------------------------------
select set_config('ref.watch', 'on', true);

insert into public.ref_watch_domains (domain, label) values
  ('joradp.dz', 'Journal officiel de la République algérienne (JORADP)'),
  ('mfdgi.gov.dz', 'Direction générale des impôts'),
  ('cnas.dz', 'CNAS — Caisse nationale des assurances sociales'),
  ('cacobatph.dz', 'CACOBATPH — Caisse des congés payés et du chômage-intempéries (BTPH)'),
  ('mtess.gov.dz', 'Ministère du Travail, de l''Emploi et de la Sécurité sociale')
on conflict (domain) do nothing;

insert into public.ref_watch_keywords (keyword, folded)
select k, public.ref_ai_fold(k)
from unnest(array[
  'IRG', 'impôt sur le revenu', 'salaire', 'SNMG', 'salaire national minimum', 'CNAS', 'sécurité sociale',
  'cotisation', 'CACOBATPH', 'congés payés', 'intempéries', 'loi de finances', 'abattement', 'exonération',
  'barème', 'الأجر', 'الأجور', 'الضريبة', 'الدخل الإجمالي', 'الضمان الاجتماعي', 'قانون المالية', 'الاشتراك'
]) as k
on conflict (folded) do nothing;

select set_config('ref.watch', '', true);

-- ---------------------------------------------------------------------------
-- 7. Configuration functions (SUPER_ADMIN by default: legal_watch update)
-- ---------------------------------------------------------------------------
create or replace function public.ref_watch_domain_save(p_id uuid, p_domain text, p_label text, p_active boolean)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.ref_watch_require('update');
  v_domain text := lower(btrim(coalesce(p_domain, '')));
  v_label text := btrim(coalesce(p_label, ''));
  v_id uuid;
begin
  if v_domain !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$' or char_length(v_domain) > 200 then
    raise exception 'Domaine invalide : nom de domaine seul, sans https:// ni chemin (ex. joradp.dz).' using errcode = 'check_violation';
  end if;
  if char_length(v_label) not between 2 and 120 then
    raise exception 'Libellé du domaine requis (2 à 120 caractères).' using errcode = 'check_violation';
  end if;
  perform set_config('ref.watch', 'on', true);
  if p_id is null then
    if exists (select 1 from public.ref_watch_domains where domain = v_domain) then
      raise exception 'Domaine déjà dans la liste : réactivez-le si besoin.' using errcode = 'unique_violation';
    end if;
    insert into public.ref_watch_domains (domain, label, is_active, created_by)
    values (v_domain, v_label, coalesce(p_active, true), v_uid)
    returning id into v_id;
  else
    update public.ref_watch_domains set
      domain = v_domain, label = v_label, is_active = coalesce(p_active, is_active), updated_by = v_uid, updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Domaine introuvable.' using errcode = 'no_data_found';
    end if;
  end if;
  perform set_config('ref.watch', '', true);
  return v_id;
end;
$$;

create or replace function public.ref_watch_keyword_save(p_id uuid, p_keyword text, p_active boolean)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.ref_watch_require('update');
  v_kw text := regexp_replace(btrim(coalesce(p_keyword, '')), '\s+', ' ', 'g');
  v_folded text := public.ref_ai_fold(v_kw);
  v_id uuid;
begin
  if char_length(v_kw) not between 2 and 80 or char_length(v_folded) < 2 then
    raise exception 'Mot-clé requis (2 à 80 caractères).' using errcode = 'check_violation';
  end if;
  perform set_config('ref.watch', 'on', true);
  if p_id is null then
    if exists (select 1 from public.ref_watch_keywords where folded = v_folded) then
      raise exception 'Mot-clé déjà dans la liste : réactivez-le si besoin.' using errcode = 'unique_violation';
    end if;
    insert into public.ref_watch_keywords (keyword, folded, is_active, created_by)
    values (v_kw, v_folded, coalesce(p_active, true), v_uid)
    returning id into v_id;
  else
    if exists (select 1 from public.ref_watch_keywords where folded = v_folded and id <> p_id) then
      raise exception 'Mot-clé déjà dans la liste.' using errcode = 'unique_violation';
    end if;
    update public.ref_watch_keywords set
      keyword = v_kw, folded = v_folded, is_active = coalesce(p_active, is_active), updated_by = v_uid, updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Mot-clé introuvable.' using errcode = 'no_data_found';
    end if;
  end if;
  perform set_config('ref.watch', '', true);
  return v_id;
end;
$$;

create or replace function public.ref_watch_source_save(p_id uuid, p_label text, p_url text, p_frequency text, p_active boolean)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.ref_watch_require('update');
  v_label text := btrim(coalesce(p_label, ''));
  v_url text := btrim(coalesce(p_url, ''));
  v_freq text := upper(btrim(coalesce(p_frequency, '')));
  s public.ref_watch_sources%rowtype;
  v_id uuid;
begin
  if char_length(v_label) not between 3 and 120 then
    raise exception 'Libellé de la source requis (3 à 120 caractères).' using errcode = 'check_violation';
  end if;
  if char_length(v_url) > 500 or public.ref_watch_host(v_url) is null then
    raise exception 'Adresse invalide : https:// suivi d''un nom de domaine (pas d''adresse IP, de port ni d''identifiants), 500 caractères au plus.'
      using errcode = 'check_violation';
  end if;
  if not public.ref_watch_url_allowed(v_url) then
    raise exception 'Domaine non autorisé : ajoutez-le d''abord à la liste des domaines autorisés.' using errcode = 'check_violation';
  end if;
  if v_freq not in ('DAILY', 'WEEKLY', 'MONTHLY') then
    raise exception 'Fréquence invalide (quotidienne, hebdomadaire ou mensuelle).' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.ref_watch_sources where url = v_url and id is distinct from p_id) then
    raise exception 'Cette page est déjà surveillée.' using errcode = 'unique_violation';
  end if;
  perform set_config('ref.watch', 'on', true);
  if p_id is null then
    insert into public.ref_watch_sources (label, url, frequency, is_active, created_by)
    values (v_label, v_url, v_freq, coalesce(p_active, true), v_uid)
    returning id into v_id;
  else
    select * into s from public.ref_watch_sources where id = p_id for update;
    if not found then
      raise exception 'Source introuvable.' using errcode = 'no_data_found';
    end if;
    update public.ref_watch_sources set
      label = v_label, url = v_url, frequency = v_freq, is_active = coalesce(p_active, is_active),
      updated_by = v_uid, updated_at = now(),
      baseline_done = case when v_url = s.url then baseline_done else false end,
      last_content_hash = case when v_url = s.url then last_content_hash end,
      consecutive_failures = case when v_url = s.url then consecutive_failures else 0 end
    where id = p_id
    returning id into v_id;
  end if;
  perform set_config('ref.watch', '', true);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Checks: start, record one source, finish (manual user or scheduler)
-- ---------------------------------------------------------------------------
create or replace function public.ref_watch_run_start(p_trigger text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.ref_watch_actor();
  v_trigger text := upper(coalesce(p_trigger, ''));
  v_run uuid;
  v_sources jsonb;
  s record;
  n integer := 0;
begin
  if v_trigger = 'MANUAL' and v_actor is null or v_trigger = 'CRON' and v_actor is not null
     or v_trigger not in ('MANUAL', 'CRON') then
    raise exception 'Déclenchement de la vérification invalide.' using errcode = 'check_violation';
  end if;
  perform set_config('ref.watch', 'on', true);
  update public.ref_watch_runs set
    status = 'FAILED', finished_at = now(), note = 'Vérification interrompue (délai dépassé).'
  where status = 'RUNNING' and started_at < now() - interval '15 minutes';
  if exists (select 1 from public.ref_watch_runs where status = 'RUNNING') then
    raise exception 'Une vérification est déjà en cours : réessayez dans quelques minutes.' using errcode = 'check_violation';
  end if;
  insert into public.ref_watch_runs (trigger, started_by) values (v_trigger, v_actor) returning id into v_run;

  v_sources := '[]'::jsonb;
  for s in
    select * from public.ref_watch_sources x
    where x.is_active and (v_trigger = 'MANUAL' or public.ref_watch_source_due(x))
    order by x.last_checked_at nulls first, x.created_at
    limit 50
  loop
    n := n + 1;
    v_sources := v_sources || jsonb_build_object(
      'id', s.id, 'label', s.label, 'url', s.url, 'last_content_hash', s.last_content_hash,
      'allowed', public.ref_watch_url_allowed(s.url));
  end loop;
  update public.ref_watch_runs set sources_planned = n where id = v_run;
  perform set_config('ref.watch', '', true);

  return jsonb_build_object(
    'run_id', v_run,
    'sources', v_sources,
    'domains', (select coalesce(jsonb_agg(d.domain order by d.domain), '[]'::jsonb)
                from public.ref_watch_domains d where d.is_active)
  );
end;
$$;

create or replace function public.ref_watch_record_check(
  p_run uuid,
  p_source uuid,
  p_status text,
  p_http_status integer,
  p_error text,
  p_content_hash text,
  p_links jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.ref_watch_actor();
  r public.ref_watch_runs%rowtype;
  s public.ref_watch_sources%rowtype;
  v_status text := upper(coalesce(p_status, ''));
  v_error text := left(nullif(btrim(coalesce(p_error, '')), ''), 500);
  v_hash text := lower(nullif(btrim(coalesce(p_content_hash, '')), ''));
  v_baseline boolean;
  v_found integer := 0;
  v_new integer := 0;
  v_relevant integer := 0;
  v_fail integer;
  l jsonb;
  v_url text;
  v_title text;
  v_kw text[];
  v_item uuid;
begin
  select * into r from public.ref_watch_runs where id = p_run for update;
  if not found or r.status <> 'RUNNING' then
    raise exception 'Vérification introuvable ou close.' using errcode = 'check_violation';
  end if;
  if r.started_by is distinct from v_actor then
    raise exception 'Vérification lancée par une autre personne.' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.ref_watch_sources where id = p_source for update;
  if not found then
    raise exception 'Source introuvable.' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.ref_watch_checks where run_id = p_run and source_id = p_source) then
    raise exception 'Source déjà vérifiée pendant cette vérification.' using errcode = 'unique_violation';
  end if;
  if v_status not in ('OK', 'UNCHANGED', 'ERROR') then
    raise exception 'Résultat de vérification invalide.' using errcode = 'check_violation';
  end if;
  if v_status <> 'ERROR' and not public.ref_watch_url_allowed(s.url) then
    v_status := 'ERROR';
    v_error := 'Domaine de la source retiré de la liste des domaines autorisés.';
  end if;
  if v_status = 'ERROR' then
    v_error := coalesce(v_error, 'Erreur inconnue.');
    v_hash := null;
  else
    v_error := null;
    if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then
      raise exception 'Empreinte de la page invalide.' using errcode = 'check_violation';
    end if;
  end if;
  if v_status = 'OK' and (p_links is null or jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) > 500) then
    raise exception 'Liens relevés invalides (500 au plus).' using errcode = 'check_violation';
  end if;

  perform set_config('ref.watch', 'on', true);
  v_baseline := not s.baseline_done;
  if v_status = 'OK' then
    for l in select value from jsonb_array_elements(p_links) loop
      continue when jsonb_typeof(l) <> 'object';
      v_url := btrim(coalesce(l->>'url', ''));
      continue when char_length(v_url) > 1000 or v_url !~ '^https://' or not public.ref_watch_url_allowed(v_url);
      v_found := v_found + 1;
      v_title := left(nullif(regexp_replace(btrim(coalesce(l->>'title', '')), '\s+', ' ', 'g'), ''), 500);
      v_kw := public.ref_watch_keywords_match(coalesce(v_title, '') || ' ' || v_url);
      v_item := null;
      insert into public.ref_watch_items (source_id, run_id, url, title, keywords, relevant, baseline)
      values (s.id, p_run, v_url, v_title, v_kw, cardinality(v_kw) > 0, v_baseline)
      on conflict (url) do nothing
      returning id into v_item;
      if v_item is not null then
        v_new := v_new + 1;
        if cardinality(v_kw) > 0 and not v_baseline then
          v_relevant := v_relevant + 1;
        end if;
      end if;
    end loop;
  end if;

  v_fail := case when v_status = 'ERROR' then s.consecutive_failures + 1 else 0 end;
  update public.ref_watch_sources set
    last_checked_at = now(),
    last_status = v_status,
    last_error = v_error,
    consecutive_failures = v_fail,
    last_content_hash = coalesce(v_hash, last_content_hash),
    baseline_done = baseline_done or v_status = 'OK'
  where id = s.id;

  insert into public.ref_watch_checks (run_id, source_id, status, http_status, error, content_hash, links_found, items_new, items_relevant)
  values (p_run, s.id, v_status, p_http_status, v_error, v_hash, v_found, v_new, v_relevant);

  update public.ref_watch_runs set
    sources_checked = sources_checked + 1,
    sources_failed = sources_failed + (v_status = 'ERROR')::integer,
    items_new = items_new + v_new,
    items_relevant = items_relevant + v_relevant
  where id = p_run;
  perform set_config('ref.watch', '', true);

  if v_fail = 3 then
    perform public.sys_notify(
      'LEGAL_WATCH',
      format('Source de veille en erreur : %s', left(s.label, 150)),
      format('Trois vérifications consécutives ont échoué (%s). Les nouveaux textes de cette source ne sont plus détectés : vérifiez l''adresse ou désactivez la source.', left(v_error, 300)),
      '/rh/legal/veille?onglet=sources',
      null,
      'legal_watch',
      null
    );
  end if;

  return jsonb_build_object('status', v_status, 'links', v_found, 'new', v_new, 'relevant', v_relevant, 'baseline', v_baseline);
end;
$$;

create or replace function public.ref_watch_run_finish(p_run uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.ref_watch_actor();
  r public.ref_watch_runs%rowtype;
begin
  select * into r from public.ref_watch_runs where id = p_run for update;
  if not found or r.status <> 'RUNNING' then
    raise exception 'Vérification introuvable ou close.' using errcode = 'check_violation';
  end if;
  if r.started_by is distinct from v_actor then
    raise exception 'Vérification lancée par une autre personne.' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('ref.watch', 'on', true);
  update public.ref_watch_runs set
    status = 'DONE', finished_at = now(), note = left(nullif(btrim(coalesce(p_note, '')), ''), 500)
  where id = p_run
  returning * into r;
  perform set_config('ref.watch', '', true);

  if r.items_relevant > 0 then
    perform public.sys_notify(
      'LEGAL_WATCH',
      format('Veille juridique : %s nouveau(x) texte(s) à examiner', r.items_relevant),
      'Textes détectés contenant un mot-clé lié à la paie. Aucun effet avant leur import au registre, l''analyse, puis l''approbation habituelle.',
      '/rh/legal/veille',
      null,
      'legal_watch',
      null
    );
  end if;

  return jsonb_build_object(
    'run_id', r.id, 'status', r.status, 'planned', r.sources_planned, 'checked', r.sources_checked,
    'failed', r.sources_failed, 'new', r.items_new, 'relevant', r.items_relevant
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Detected texts: ignore, or import into the register (lot 4)
-- ---------------------------------------------------------------------------
create or replace function public.ref_watch_item_ignore(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.ref_watch_require('create');
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) not between 5 and 300 then
    raise exception 'Motif requis pour écarter un texte détecté (5 à 300 caractères).' using errcode = 'check_violation';
  end if;
  perform set_config('ref.watch', 'on', true);
  update public.ref_watch_items set
    status = 'IGNORED', ignore_reason = v_reason, decided_by = v_uid, decided_at = now()
  where id = p_id and status = 'NEW';
  if not found then
    raise exception 'Texte détecté introuvable ou déjà traité.' using errcode = 'check_violation';
  end if;
  perform set_config('ref.watch', '', true);
end;
$$;

-- What the server may download for an import: the link of a new text, on a domain still allowed.
create or replace function public.ref_watch_item_prepare_import(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.ref_watch_require('create');
  i public.ref_watch_items%rowtype;
  v_source text;
begin
  if not public.erp_has_perm('legal_documents', 'create'::public.rbac_action, null) then
    raise exception 'Import des documents juridiques non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  select * into i from public.ref_watch_items where id = p_id;
  if not found or i.status <> 'NEW' then
    raise exception 'Texte détecté introuvable ou déjà traité.' using errcode = 'check_violation';
  end if;
  if not public.ref_watch_url_allowed(i.url) then
    raise exception 'Domaine du lien retiré de la liste des domaines autorisés : import impossible.' using errcode = 'check_violation';
  end if;
  select label into v_source from public.ref_watch_sources where id = i.source_id;
  return jsonb_build_object(
    'id', i.id, 'url', i.url, 'title', i.title, 'source_label', v_source,
    'domains', (select coalesce(jsonb_agg(d.domain order by d.domain), '[]'::jsonb) from public.ref_watch_domains d where d.is_active)
  );
end;
$$;

create or replace function public.ref_watch_item_import(
  p_id uuid,
  p_path text,
  p_name text,
  p_mime text,
  p_size bigint,
  p_sha256 text,
  p jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.ref_watch_require('create');
  i public.ref_watch_items%rowtype;
  v_meta jsonb;
  v_doc uuid;
begin
  select * into i from public.ref_watch_items where id = p_id for update;
  if not found or i.status <> 'NEW' then
    raise exception 'Texte détecté introuvable ou déjà traité.' using errcode = 'check_violation';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Informations du document invalides.' using errcode = 'check_violation';
  end if;
  v_meta := p;
  if coalesce(btrim(p->>'source_url'), '') = '' and char_length(i.url) <= 500 then
    v_meta := v_meta || jsonb_build_object('source_url', i.url);
  end if;
  v_doc := public.ref_legal_doc_create(p_path, p_name, p_mime, p_size, p_sha256, v_meta);

  perform set_config('ref.watch', 'on', true);
  update public.ref_watch_items set
    status = 'IMPORTED', document_id = v_doc, decided_by = v_uid, decided_at = now()
  where id = i.id;
  perform set_config('ref.watch', '', true);
  return v_doc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.ref_watch_guard() from public, anon, authenticated;
revoke all on function public.ref_watch_actor() from public, anon, authenticated;
revoke all on function public.ref_watch_require(text) from public, anon, authenticated;
revoke all on function public.ref_watch_source_due(public.ref_watch_sources) from public, anon, authenticated;

revoke all on function public.ref_watch_host(text) from public, anon;
revoke all on function public.ref_watch_url_allowed(text) from public, anon;
revoke all on function public.ref_watch_keywords_match(text) from public, anon;
revoke all on function public.ref_watch_can_read() from public, anon;
revoke all on function public.ref_watch_domain_save(uuid, text, text, boolean) from public, anon;
revoke all on function public.ref_watch_keyword_save(uuid, text, boolean) from public, anon;
revoke all on function public.ref_watch_source_save(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.ref_watch_run_start(text) from public, anon;
revoke all on function public.ref_watch_record_check(uuid, uuid, text, integer, text, text, jsonb) from public, anon;
revoke all on function public.ref_watch_run_finish(uuid, text) from public, anon;
revoke all on function public.ref_watch_item_ignore(uuid, text) from public, anon;
revoke all on function public.ref_watch_item_prepare_import(uuid) from public, anon;
revoke all on function public.ref_watch_item_import(uuid, text, text, text, bigint, text, jsonb) from public, anon;

grant execute on function public.ref_watch_host(text) to authenticated;
grant execute on function public.ref_watch_url_allowed(text) to authenticated;
grant execute on function public.ref_watch_keywords_match(text) to authenticated;
grant execute on function public.ref_watch_can_read() to authenticated;
grant execute on function public.ref_watch_domain_save(uuid, text, text, boolean) to authenticated;
grant execute on function public.ref_watch_keyword_save(uuid, text, boolean) to authenticated;
grant execute on function public.ref_watch_source_save(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.ref_watch_run_start(text) to authenticated, service_role;
grant execute on function public.ref_watch_record_check(uuid, uuid, text, integer, text, text, jsonb) to authenticated, service_role;
grant execute on function public.ref_watch_run_finish(uuid, text) to authenticated, service_role;
grant execute on function public.ref_watch_item_ignore(uuid, text) to authenticated;
grant execute on function public.ref_watch_item_prepare_import(uuid) to authenticated;
grant execute on function public.ref_watch_item_import(uuid, text, text, text, bigint, text, jsonb) to authenticated;

commit;
