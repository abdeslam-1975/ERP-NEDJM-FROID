-- Lot 7 — Extraction IA des documents juridiques (application à partir de 2026) et décision D15
--   1. Une analyse IA (OCR et lecture par Gemini) d'un document du registre prépare des suggestions : variables légales
--      (SNMG, taux CNAS et CACOBATPH…), taux CNAS d'un régime, wilayas d'une zone IRG. Les tranches d'un barème IRG sont
--      affichées avec leur extrait, pour une saisie manuelle : jamais transformées automatiquement.
--   2. Seuls les textes officiels publiés (lois, ordonnances, décrets, arrêtés, décisions, circulaires, instructions)
--      peuvent être analysés, après confirmation qu'ils ne contiennent aucune donnée personnelle. Conventions, notes
--      internes et autres textes restent en saisie manuelle.
--   3. Une suggestion ne devient une proposition (origine IA) que par un humain, qui la relit et peut la corriger ; la
--      proposition suit ensuite le circuit habituel (approbation par une autre personne, date d'application D2). La
--      personne qui a lancé l'analyse est enregistrée comme contributrice (séparation des tâches).
--   4. Contrôle bloquant : la valeur proposée doit figurer dans l'extrait cité (chiffres arabes et séparateurs
--      normalisés). Les écarts de cohérence (unité, écart avec la valeur en vigueur, tranches) sont des avertissements.
--   5. D15 « Document à cheval sur 2025 et 2026 » : le décideur choisit la saisie manuelle ou l'extraction IA. Les cas
--      nets suivent la règle fixée : application entièrement avant 2026 = saisie manuelle ; à partir de 2026 = IA possible.

begin;

-- ---------------------------------------------------------------------------
-- 1. Rights matrix
-- ---------------------------------------------------------------------------
insert into public.sys_screens (code, path, module, label_fr, label_ar, sort_order) values
  ('legal_ai_extraction', '/rh/legal/extraction-ia', 'rh',
   'Extraction IA des documents juridiques · consulter (lire), lancer une analyse (créer), écarter une suggestion (modifier)',
   'الاستخراج الآلي للنصوص القانونية', 216),
  ('decision_legal_entry_path', '/decisions?type=D15', 'decisions',
   'Décision D15 · Voie de saisie d''un document à cheval sur 2025 et 2026 (classe : ordinaire)', null, 69)
on conflict (code) do nothing;

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select r.id, s.id, true, true, true, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code = 'SUPER_ADMIN'
  and s.code in ('legal_ai_extraction', 'decision_legal_entry_path')
on conflict (role_id, screen_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Decision type D15
-- ---------------------------------------------------------------------------
insert into public.sys_decision_types (code, label_fr, description_fr, risk_class, policy_allowed, screen_code, options) values
  ('D15', 'Voie de saisie d''un document juridique à cheval sur 2025 et 2026',
   'La période d''application du document commence avant 2026 et se poursuit après. Avant 2026, les valeurs se saisissent '
   'à la main ; à partir de 2026, une extraction IA peut préparer des suggestions. Les deux voies aboutissent au même '
   'circuit d''approbation.',
   'ORDINARY', false, 'decision_legal_entry_path',
   jsonb_build_array(
     jsonb_build_object('code', 'MANUAL', 'label_fr', 'Saisie manuelle',
       'consequence_fr', 'Les valeurs de ce document sont saisies à la main dans des propositions qui le citent. Aucune '
         'analyse IA n''est possible pour ce document.',
       'executes', false),
     jsonb_build_object('code', 'AI', 'label_fr', 'Extraction IA possible',
       'consequence_fr', 'Une analyse IA peut préparer des suggestions à partir de ce document. Chaque suggestion est '
         'relue par un humain avant de devenir une proposition, puis suit l''approbation habituelle ; rien ne s''applique '
         'à la paie avant la décision D2.',
       'executes', false)
   ))
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Entry path of a document (MANUAL / AI_ALLOWED / D15 + decision)
-- ---------------------------------------------------------------------------
-- Official published texts only; conventions, internal notes and other texts are never sent to the AI.
create or replace function public.ref_legal_doc_ai_type_allowed(p_type text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_type, '') in ('LOI_FINANCES', 'LOI_FINANCES_COMPL', 'LOI', 'ORDONNANCE', 'DECRET_PRESIDENTIEL',
                                  'DECRET_EXECUTIF', 'ARRETE', 'DECISION', 'CIRCULAIRE', 'INSTRUCTION');
$$;

-- Last D15 answer for an entry (all versions share the root): MANUAL, AI or null.
create or replace function public.ref_legal_doc_d15_choice(p_root uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.chosen_option
  from public.sys_decisions d
  where d.type_code = 'D15' and d.dedupe_key = 'D15:' || p_root::text and d.status = 'EXECUTED'
  order by d.decided_at desc, d.id desc
  limit 1;
$$;

create or replace function public.ref_legal_doc_d15_decision(p_root uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.id
  from public.sys_decisions d
  where d.type_code = 'D15' and d.dedupe_key = 'D15:' || p_root::text and d.status = 'EXECUTED'
  order by d.decided_at desc, d.id desc
  limit 1;
$$;

-- NOT_ACTIVE, MANUAL, TYPE_EXCLUDED, AI_ALLOWED, D15_PENDING, D15_UNDECIDED, D15_MANUAL or D15_AI.
create or replace function public.ref_legal_doc_ai_path(p_doc uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  d public.ref_legal_documents%rowtype;
  v_path text;
  v_choice text;
begin
  select * into d from public.ref_legal_documents where id = p_doc;
  if not found then
    return null;
  end if;
  if d.status <> 'ACTIVE' then
    return 'NOT_ACTIVE';
  end if;
  v_path := public.ref_legal_doc_entry_path(d.applies_from, d.applies_to);
  if v_path = 'MANUAL' then
    return 'MANUAL';
  end if;
  if not public.ref_legal_doc_ai_type_allowed(d.doc_type) then
    return 'TYPE_EXCLUDED';
  end if;
  if v_path = 'AI_ALLOWED' then
    return 'AI_ALLOWED';
  end if;
  if exists (
    select 1 from public.sys_decisions x
    where x.type_code = 'D15' and x.dedupe_key = 'D15:' || d.root_id::text and x.status in ('PENDING', 'DECIDED')
  ) then
    return 'D15_PENDING';
  end if;
  v_choice := public.ref_legal_doc_d15_choice(d.root_id);
  return case v_choice when 'AI' then 'D15_AI' when 'MANUAL' then 'D15_MANUAL' else 'D15_UNDECIDED' end;
end;
$$;

-- Paths of the active versions the caller may read (register screen).
create or replace function public.ref_legal_ai_paths()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(d.id, public.ref_legal_doc_ai_path(d.id)), '{}'::jsonb)
  from public.ref_legal_documents d
  where d.status = 'ACTIVE' and public.ref_legal_docs_can_read();
$$;

-- ---------------------------------------------------------------------------
-- 4. Blocking check: the proposed value appears in the cited excerpt
-- ---------------------------------------------------------------------------
-- Arabic-Indic and Persian digits become ASCII, the Arabic decimal sign a comma, thin and non-breaking spaces a space.
-- Keep in sync with normalizeExcerpt() in src/lib/rules/ai-extraction.ts.
create or replace function public.ref_ai_normalize_text(p text)
returns text
language sql
immutable
as $$
  select translate(
    coalesce(p, ''),
    '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٫٬' || chr(160) || chr(8239) || chr(8201),
    '01234567890123456789, ' || '   '
  );
$$;

-- Every number written in the text, with the readings of ambiguous separators (24.000 = 24000 or 24 ; 24,000 = 24 or
-- 24000). Keep in sync with excerptNumbers() in src/lib/rules/ai-extraction.ts.
create or replace function public.ref_ai_excerpt_numbers(p text)
returns numeric[]
language plpgsql
immutable
as $$
declare
  t text := public.ref_ai_normalize_text(p);
  m text[];
  tok text;
  v_out numeric[] := '{}';
begin
  for m in select regexp_matches(t, '[0-9]{1,3}(?:[ .][0-9]{3})+(?![0-9])(?:,[0-9]+)?|[0-9]+(?:[.,][0-9]+)?', 'g') loop
    tok := m[1];
    if tok ~ '^[0-9]{1,3}([ .][0-9]{3})+(,[0-9]+)?$' then
      v_out := v_out || replace(regexp_replace(tok, '[ .]', '', 'g'), ',', '.')::numeric;
      if tok ~ '^[0-9]{1,3}\.[0-9]{3}$' then
        v_out := v_out || tok::numeric;
      end if;
    elsif tok ~ '^[0-9]+,[0-9]+$' then
      v_out := v_out || replace(tok, ',', '.')::numeric;
      if tok ~ '^[0-9]{1,3},[0-9]{3}$' then
        v_out := v_out || replace(tok, ',', '')::numeric;
      end if;
    else
      v_out := v_out || tok::numeric;
    end if;
  end loop;
  return v_out;
end;
$$;

-- A rate stored as a fraction (0.09) is written as a percentage (9 %): both readings are accepted.
create or replace function public.ref_ai_number_in_excerpt(p_value numeric, p text)
returns boolean
language sql
immutable
as $$
  select p_value is not null and exists (
    select 1 from unnest(public.ref_ai_excerpt_numbers(p)) as c(v)
    where c.v = p_value or c.v = p_value * 100
  );
$$;

-- Keep in sync with foldText() in src/lib/rules/ai-extraction.ts.
create or replace function public.ref_ai_fold(p text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
    lower(translate(coalesce(p, ''), 'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ''’-', 'aaaeeeeiioouuucaaaeeeeiioouuuc   ')),
    '\s+', ' ', 'g'));
$$;

create or replace function public.ref_ai_payload_in_excerpt(p_kind text, p_payload jsonb, p_excerpt text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  k text;
  n integer := 0;
  w record;
  b jsonb;
  v_fold text := public.ref_ai_fold(p_excerpt);
begin
  if coalesce(btrim(p_excerpt), '') = '' or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return false;
  end if;
  if p_kind = 'LEGAL_VAR' then
    return jsonb_typeof(p_payload->'value') = 'number'
       and public.ref_ai_number_in_excerpt((p_payload->>'value')::numeric, p_excerpt);
  elsif p_kind = 'CNAS_RATES' then
    foreach k in array array['employee_pct', 'employer_pct', 'fos_pct'] loop
      if jsonb_typeof(p_payload->k) = 'number' then
        n := n + 1;
        if not public.ref_ai_number_in_excerpt((p_payload->>k)::numeric, p_excerpt) then
          return false;
        end if;
      end if;
    end loop;
    return n > 0;
  elsif p_kind = 'IRG_ZONE_SCOPE' then
    if jsonb_typeof(p_payload->'wilayas') is distinct from 'array' or jsonb_array_length(p_payload->'wilayas') = 0 then
      return false;
    end if;
    for w in
      select x.code, rw.name_fr
      from jsonb_array_elements_text(p_payload->'wilayas') as x(code)
      left join public.ref_wilayas rw on rw.code = x.code
    loop
      if w.name_fr is null then
        return false;
      end if;
      if position(public.ref_ai_fold(w.name_fr) in v_fold) = 0 then
        return false;
      end if;
    end loop;
    return true;
  elsif p_kind = 'IRG_BAREME' then
    if jsonb_typeof(p_payload->'brackets') is distinct from 'array' or jsonb_array_length(p_payload->'brackets') = 0 then
      return false;
    end if;
    for b in select value from jsonb_array_elements(p_payload->'brackets') loop
      if jsonb_typeof(b->'rate') is distinct from 'number'
         or not public.ref_ai_number_in_excerpt((b->>'rate')::numeric, p_excerpt) then
        return false;
      end if;
      if jsonb_typeof(b->'from') = 'number' and (b->>'from')::numeric > 0
         and not public.ref_ai_number_in_excerpt((b->>'from')::numeric, p_excerpt) then
        return false;
      end if;
      if jsonb_typeof(b->'to') = 'number' and not public.ref_ai_number_in_excerpt((b->>'to')::numeric, p_excerpt) then
        return false;
      end if;
    end loop;
    return true;
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Analyses and suggestions — written only by the functions below, never deleted
-- ---------------------------------------------------------------------------
create table if not exists public.ref_legal_ai_extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.ref_legal_documents(id),
  root_id uuid not null,
  model text not null check (char_length(btrim(model)) between 1 and 100),
  personal_data_confirmed boolean not null check (personal_data_confirmed),
  entry_path text not null check (entry_path in ('AI_ALLOWED', 'D15_AI')),
  d15_decision_id uuid references public.sys_decisions(id),
  document_info jsonb not null default '{}'::jsonb check (jsonb_typeof(document_info) = 'object'),
  issues jsonb not null default '[]'::jsonb check (jsonb_typeof(issues) = 'array'),
  suggestion_count integer not null default 0 check (suggestion_count between 0 and 100),
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  created_by uuid not null references public.sys_users(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint ref_legal_ai_extractions_d15_chk check ((entry_path = 'D15_AI') = (d15_decision_id is not null)),
  constraint ref_legal_ai_extractions_closed_chk check ((status = 'CLOSED') = (closed_at is not null))
);
create index if not exists ref_legal_ai_extractions_root_idx on public.ref_legal_ai_extractions (root_id, created_at desc);
create unique index if not exists ref_legal_ai_extractions_open_uidx on public.ref_legal_ai_extractions (root_id)
  where status = 'OPEN';

create table if not exists public.ref_legal_ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  extraction_id uuid not null references public.ref_legal_ai_extractions(id),
  seq integer not null check (seq between 1 and 100),
  kind text not null check (kind in ('LEGAL_VAR', 'CNAS_RATES', 'IRG_ZONE_SCOPE', 'IRG_BAREME')),
  target_code text check (target_code is null or char_length(target_code) <= 60),
  target_id uuid,
  target_key text,
  target_label text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  value_as_written text check (value_as_written is null or char_length(value_as_written) <= 200),
  effective_date date,
  article text check (article is null or char_length(article) <= 120),
  page integer check (page is null or page between 1 and 5000),
  excerpt text check (excerpt is null or char_length(excerpt) <= 2000),
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  notes text check (notes is null or char_length(notes) <= 1000),
  excerpt_match boolean not null default false,
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  status text not null default 'OPEN' check (status in ('OPEN', 'CONVERTED', 'DISMISSED')),
  proposal_id uuid references public.ref_rule_proposals(id),
  final jsonb,
  decided_by uuid references public.sys_users(id),
  decided_at timestamptz,
  dismiss_reason text check (dismiss_reason is null or char_length(dismiss_reason) <= 500),
  unique (extraction_id, seq),
  constraint ref_legal_ai_suggestions_converted_chk check ((status = 'CONVERTED') = (proposal_id is not null)),
  constraint ref_legal_ai_suggestions_bareme_chk check (status <> 'CONVERTED' or kind <> 'IRG_BAREME'),
  constraint ref_legal_ai_suggestions_decided_chk check (status = 'OPEN' or (decided_by is not null and decided_at is not null)),
  constraint ref_legal_ai_suggestions_dismissed_chk check (status <> 'DISMISSED' or dismiss_reason is not null)
);
create index if not exists ref_legal_ai_suggestions_proposal_idx on public.ref_legal_ai_suggestions (proposal_id);

create or replace function public.ref_legal_ai_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Analyse IA : suppression interdite (historique conservé).' using errcode = 'check_violation';
  end if;
  if coalesce(current_setting('ref.ai_extraction', true), '') <> 'on' then
    raise exception 'Analyse IA : enregistrement écrit uniquement par l''analyse et le traitement des suggestions.'
      using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' then
    if tg_table_name = 'ref_legal_ai_extractions' then
      if (to_jsonb(new) - array['status', 'closed_at', 'suggestion_count'])
         is distinct from (to_jsonb(old) - array['status', 'closed_at', 'suggestion_count'])
         or old.status = 'CLOSED' then
        raise exception 'Analyse IA : seule la clôture d''une analyse est possible.' using errcode = 'check_violation';
      end if;
    elsif (to_jsonb(new) - array['status', 'proposal_id', 'final', 'decided_by', 'decided_at', 'dismiss_reason'])
          is distinct from (to_jsonb(old) - array['status', 'proposal_id', 'final', 'decided_by', 'decided_at', 'dismiss_reason'])
          or old.status <> 'OPEN' then
      raise exception 'Suggestion IA : contenu figé ; seule une suggestion ouverte peut être transformée ou écartée.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ref_legal_ai_extractions_guard on public.ref_legal_ai_extractions;
create trigger trg_ref_legal_ai_extractions_guard
  before insert or update or delete on public.ref_legal_ai_extractions
  for each row execute function public.ref_legal_ai_guard();
drop trigger if exists trg_ref_legal_ai_suggestions_guard on public.ref_legal_ai_suggestions;
create trigger trg_ref_legal_ai_suggestions_guard
  before insert or update or delete on public.ref_legal_ai_suggestions
  for each row execute function public.ref_legal_ai_guard();

drop trigger if exists trg_ref_legal_ai_extractions_audit on public.ref_legal_ai_extractions;
create trigger trg_ref_legal_ai_extractions_audit
  after insert or update on public.ref_legal_ai_extractions
  for each row execute function public.sys_audit_row_change();
drop trigger if exists trg_ref_legal_ai_suggestions_audit on public.ref_legal_ai_suggestions;
create trigger trg_ref_legal_ai_suggestions_audit
  after insert or update on public.ref_legal_ai_suggestions
  for each row execute function public.sys_audit_row_change();

-- Readers: the extraction screen, and whoever prepares or approves legal rules (the approver sees the AI checks).
create or replace function public.ref_legal_ai_can_read()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.erp_has_perm('legal_ai_extraction', 'read'::public.rbac_action, null)
      or public.erp_has_perm('rule_proposals', 'read'::public.rbac_action, null)
      or public.erp_has_perm('rule_approval', 'read'::public.rbac_action, null);
$$;

alter table public.ref_legal_ai_extractions enable row level security;
alter table public.ref_legal_ai_suggestions enable row level security;

drop policy if exists ref_legal_ai_extractions_read on public.ref_legal_ai_extractions;
create policy ref_legal_ai_extractions_read on public.ref_legal_ai_extractions
  for select to authenticated using (public.ref_legal_ai_can_read());
drop policy if exists ref_legal_ai_suggestions_read on public.ref_legal_ai_suggestions;
create policy ref_legal_ai_suggestions_read on public.ref_legal_ai_suggestions
  for select to authenticated using (public.ref_legal_ai_can_read());

revoke all on public.ref_legal_ai_extractions from anon;
revoke all on public.ref_legal_ai_suggestions from anon;
revoke insert, update, delete, truncate on public.ref_legal_ai_extractions from authenticated;
revoke insert, update, delete, truncate on public.ref_legal_ai_suggestions from authenticated;
grant select on public.ref_legal_ai_extractions to authenticated;
grant select on public.ref_legal_ai_suggestions to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Analysis: checked before the document leaves the application, then recorded
-- ---------------------------------------------------------------------------
create or replace function public.ref_legal_ai_extract_check(p_document uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  d public.ref_legal_documents%rowtype;
  v_path text;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not public.erp_has_perm('legal_ai_extraction', 'create'::public.rbac_action, null) then
    raise exception 'Analyse IA des documents juridiques non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.ref_legal_documents where id = p_document;
  if not found then
    raise exception 'Document introuvable au registre.' using errcode = 'no_data_found';
  end if;
  if not public.ref_legal_docs_can_read() then
    raise exception 'Lecture du document non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  v_path := public.ref_legal_doc_ai_path(d.id);
  if v_path = 'NOT_ACTIVE' then
    raise exception 'Document retiré ou remplacé par une version corrigée : analysez la version en vigueur.'
      using errcode = 'check_violation';
  elsif v_path = 'MANUAL' then
    raise exception 'Application entièrement antérieure à 2026 : les valeurs de ce document se saisissent à la main.'
      using errcode = 'check_violation';
  elsif v_path = 'TYPE_EXCLUDED' then
    raise exception 'Seuls les textes officiels publiés sont envoyés à l''analyse IA (pas les conventions, notes internes ni autres textes) : saisie manuelle.'
      using errcode = 'check_violation';
  elsif v_path = 'D15_UNDECIDED' then
    raise exception 'Document à cheval sur 2025 et 2026 : demandez d''abord la décision D15 (voie de saisie).'
      using errcode = 'check_violation';
  elsif v_path = 'D15_PENDING' then
    raise exception 'Décision D15 en attente pour ce document : aucune analyse avant la décision.' using errcode = 'check_violation';
  elsif v_path = 'D15_MANUAL' then
    raise exception 'Décision D15 : saisie manuelle pour ce document.' using errcode = 'check_violation';
  end if;
  return jsonb_build_object(
    'document_id', d.id, 'root_id', d.root_id, 'path', v_path, 'storage_path', d.storage_path,
    'mime_type', d.mime_type, 'size_bytes', d.size_bytes, 'doc_type', d.doc_type, 'title', d.title,
    'reference', d.reference, 'applies_from', d.applies_from, 'applies_to', d.applies_to, 'language', d.language
  );
end;
$$;

create or replace function public.ref_legal_ai_extraction_save(
  p_document uuid,
  p_model text,
  p_confirmed boolean,
  p_document_info jsonb,
  p_issues jsonb,
  p_suggestions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_check jsonb := public.ref_legal_ai_extract_check(p_document);
  v_uid uuid := auth.uid();
  v_root uuid := (v_check->>'root_id')::uuid;
  v_id uuid;
  s jsonb;
  i integer := 0;
  k text;
  v_kind text;
  v_code text;
  v_target uuid;
  v_key text;
  v_label text;
  v_payload jsonb;
  v_conf text;
  v_page integer;
  v_eff date;
  v_excerpt text;
  v_article text;
  v_written text;
  v_notes text;
  v_warn jsonb;
  v_codes text[];
begin
  if not coalesce(p_confirmed, false) then
    raise exception 'Confirmez que le document ne contient aucune donnée personnelle avant l''analyse.'
      using errcode = 'check_violation';
  end if;
  if char_length(btrim(coalesce(p_model, ''))) not between 1 and 100 then
    raise exception 'Modèle d''analyse invalide.' using errcode = 'check_violation';
  end if;
  if p_document_info is null or jsonb_typeof(p_document_info) <> 'object' or char_length(p_document_info::text) > 20000 then
    raise exception 'Informations du document invalides.' using errcode = 'check_violation';
  end if;
  if p_issues is null or jsonb_typeof(p_issues) <> 'array' or jsonb_array_length(p_issues) > 200
     or char_length(p_issues::text) > 100000 then
    raise exception 'Points d''attention invalides (200 au plus).' using errcode = 'check_violation';
  end if;
  if p_suggestions is null or jsonb_typeof(p_suggestions) <> 'array' or jsonb_array_length(p_suggestions) > 100 then
    raise exception 'Suggestions invalides (100 au plus).' using errcode = 'check_violation';
  end if;

  perform set_config('ref.ai_extraction', 'on', true);
  update public.ref_legal_ai_suggestions s set
    status = 'DISMISSED', dismiss_reason = 'Remplacée par une nouvelle analyse du document.',
    decided_by = v_uid, decided_at = now()
  where s.status = 'OPEN'
    and s.extraction_id in (select e.id from public.ref_legal_ai_extractions e where e.root_id = v_root and e.status = 'OPEN');
  update public.ref_legal_ai_extractions set status = 'CLOSED', closed_at = now()
  where root_id = v_root and status = 'OPEN';

  insert into public.ref_legal_ai_extractions (
    document_id, root_id, model, personal_data_confirmed, entry_path, d15_decision_id, document_info, issues, created_by
  ) values (
    p_document, v_root, btrim(p_model), true, v_check->>'path',
    case when v_check->>'path' = 'D15_AI' then public.ref_legal_doc_d15_decision(v_root) end,
    p_document_info, p_issues, v_uid
  )
  returning id into v_id;

  for s in select value from jsonb_array_elements(p_suggestions) loop
    i := i + 1;
    if jsonb_typeof(s) <> 'object' then
      raise exception 'Suggestion % invalide.', i using errcode = 'check_violation';
    end if;
    v_kind := upper(btrim(coalesce(s->>'kind', '')));
    if v_kind not in ('LEGAL_VAR', 'CNAS_RATES', 'IRG_ZONE_SCOPE', 'IRG_BAREME') then
      raise exception 'Suggestion % : type inconnu.', i using errcode = 'check_violation';
    end if;
    v_conf := upper(coalesce(s->>'confidence', ''));
    if v_conf not in ('HIGH', 'MEDIUM', 'LOW') then
      v_conf := 'LOW';
    end if;
    v_code := left(nullif(btrim(coalesce(s->>'target_code', '')), ''), 60);
    v_target := null;
    v_key := null;
    v_label := null;
    v_warn := case when jsonb_typeof(s->'warnings') = 'array' then (
      select coalesce(jsonb_agg(left(x.v, 500)), '[]'::jsonb)
      from (select v from jsonb_array_elements_text(s->'warnings') as t(v) limit 20) x
    ) else '[]'::jsonb end;

    if v_kind = 'LEGAL_VAR' then
      select g.id, g.label_fr into v_target, v_label
      from public.ref_global_vars g where g.key = upper(coalesce(v_code, '')) and public.erp_is_compliance_key(g.key);
      v_payload := case when jsonb_typeof(s->'payload'->'value') = 'number' and (s->'payload'->>'value')::numeric >= 0
                        then jsonb_build_object('value', (s->'payload'->>'value')::numeric) else '{}'::jsonb end;
    elsif v_kind = 'CNAS_RATES' then
      select c.id, c.label_fr into v_target, v_label
      from public.hr_catalogs c where c.kind = 'social_profile' and c.code = v_code;
      v_payload := '{}'::jsonb;
      foreach k in array array['employee_pct', 'employer_pct', 'fos_pct'] loop
        v_payload := v_payload || jsonb_build_object(k,
          case when jsonb_typeof(s->'payload'->k) = 'number' and (s->'payload'->>k)::numeric between 0 and 100
               then (s->'payload'->>k)::numeric end);
      end loop;
    elsif v_kind = 'IRG_ZONE_SCOPE' then
      select c.code, c.label_fr into v_key, v_label
      from public.hr_catalogs c where c.kind = 'irg_zone' and c.code = v_code;
      select coalesce(array_agg(distinct x.v order by x.v), '{}'::text[]) into v_codes
      from jsonb_array_elements_text(
        case when jsonb_typeof(s->'payload'->'wilayas') = 'array' then s->'payload'->'wilayas' else '[]'::jsonb end
      ) as x(v)
      where exists (select 1 from public.ref_wilayas w where w.code = x.v);
      v_payload := jsonb_build_object('mode', 'WILAYAS', 'wilayas', to_jsonb(v_codes));
    else
      if jsonb_typeof(s->'payload'->'brackets') = 'array' and jsonb_array_length(s->'payload'->'brackets') > 50 then
        raise exception 'Suggestion % : 50 tranches au plus.', i using errcode = 'check_violation';
      end if;
      v_payload := jsonb_build_object('brackets', coalesce((
        select jsonb_agg(jsonb_build_object(
            'from', case when jsonb_typeof(b.value->'from') = 'number' then (b.value->>'from')::numeric end,
            'to', case when jsonb_typeof(b.value->'to') = 'number' then (b.value->>'to')::numeric end,
            'rate', case when jsonb_typeof(b.value->'rate') = 'number' then (b.value->>'rate')::numeric end
          ) order by b.ordinality)
        from jsonb_array_elements(
          case when jsonb_typeof(s->'payload'->'brackets') = 'array' then s->'payload'->'brackets' else '[]'::jsonb end
        ) with ordinality as b(value, ordinality)
      ), '[]'::jsonb));
    end if;

    begin
      v_page := nullif(s->>'page', '')::integer;
    exception when others then
      v_page := null;
    end;
    if v_page is not null and v_page not between 1 and 5000 then
      v_page := null;
    end if;
    begin
      v_eff := nullif(s->>'effective_date', '')::date;
    exception when others then
      v_eff := null;
    end;
    v_excerpt := left(nullif(btrim(coalesce(s->>'excerpt', '')), ''), 2000);
    v_article := left(nullif(btrim(coalesce(s->>'article', '')), ''), 120);
    v_written := left(nullif(btrim(coalesce(s->>'value_as_written', '')), ''), 200);
    v_notes := left(nullif(btrim(coalesce(s->>'notes', '')), ''), 1000);
    if v_kind in ('LEGAL_VAR', 'CNAS_RATES') and v_target is null
       or v_kind = 'IRG_ZONE_SCOPE' and v_key is null then
      v_warn := v_warn || to_jsonb('Cible non reconnue : choisissez-la avant de créer la proposition.'::text);
    end if;

    insert into public.ref_legal_ai_suggestions (
      extraction_id, seq, kind, target_code, target_id, target_key, target_label, payload, value_as_written,
      effective_date, article, page, excerpt, confidence, notes, excerpt_match, warnings
    ) values (
      v_id, i, v_kind, v_code, v_target, v_key, v_label, v_payload, v_written,
      v_eff, v_article, v_page, v_excerpt, v_conf, v_notes,
      public.ref_ai_payload_in_excerpt(v_kind, v_payload, v_excerpt), v_warn
    );
  end loop;

  update public.ref_legal_ai_extractions set suggestion_count = i where id = v_id;
  perform set_config('ref.ai_extraction', '', true);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. A human turns a suggestion into a proposal (origin AI), or dismisses it
-- ---------------------------------------------------------------------------
-- Same guard as lot 2, plus one transition: a draft created from an AI suggestion is marked origin AI.
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
  if (new.family, new.action, new.target_id, new.target_key, new.created_by, new.created_at)
     is distinct from (old.family, old.action, old.target_id, old.target_key, old.created_by, old.created_at)
     or (new.origin is distinct from old.origin and not (
       old.origin = 'MANUAL' and new.origin = 'AI' and old.status = 'DRAFT'
       and coalesce(current_setting('ref.ai_origin', true), '') = 'on'
     )) then
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

create or replace function public.ref_legal_ai_suggestion_convert(
  p_id uuid,
  p_target uuid,
  p_target_key text,
  p_payload jsonb,
  p_title text,
  p_source_ref text,
  p_text_effective date,
  p_requested_month date,
  p_article text,
  p_page integer,
  p_excerpt text,
  p_submit boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  s public.ref_legal_ai_suggestions%rowtype;
  e public.ref_legal_ai_extractions%rowtype;
  v_path text;
  v_id uuid;
  v_excerpt text := btrim(coalesce(p_excerpt, ''));
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not public.erp_has_perm('rule_proposals', 'update'::public.rbac_action, null) then
    raise exception 'Proposition de règle non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.ref_legal_ai_suggestions where id = p_id for update;
  if not found then
    raise exception 'Suggestion introuvable.' using errcode = 'no_data_found';
  end if;
  if s.status <> 'OPEN' then
    raise exception 'Suggestion déjà transformée ou écartée.' using errcode = 'check_violation';
  end if;
  if s.kind = 'IRG_BAREME' then
    raise exception 'Les tranches d''un barème IRG se saisissent à la main dans un brouillon de barème (jamais transformées automatiquement).'
      using errcode = 'check_violation';
  end if;
  select * into e from public.ref_legal_ai_extractions where id = s.extraction_id;
  v_path := public.ref_legal_doc_ai_path(e.document_id);
  if v_path is null or v_path not in ('AI_ALLOWED', 'D15_AI') then
    raise exception 'Le document analysé n''est plus utilisable par la voie IA (retiré, corrigé ou décision D15 modifiée) : relancez une analyse de la version en vigueur.'
      using errcode = 'check_violation';
  end if;
  if not public.ref_ai_payload_in_excerpt(s.kind, p_payload, v_excerpt) then
    raise exception 'Contrôle bloquant : la valeur proposée ne figure pas dans l''extrait cité. Corrigez la valeur ou recopiez exactement le passage du texte.'
      using errcode = 'check_violation';
  end if;

  v_id := public.ref_rule_proposal_save(
    null, s.kind, 'SET', p_target, p_target_key, p_payload, p_title, p_source_ref, p_text_effective, p_requested_month,
    false,
    jsonb_build_array(jsonb_build_object('document_id', e.document_id, 'article', p_article, 'page', p_page,
                                         'excerpt', v_excerpt))
  );

  perform set_config('ref.ai_origin', 'on', true);
  update public.ref_rule_proposals set origin = 'AI' where id = v_id;
  perform set_config('ref.ai_origin', '', true);

  insert into public.ref_rule_contributors (subject_kind, subject_id, user_id, role)
  values ('PROPOSAL', v_id, e.created_by, 'AI_EXTRACT')
  on conflict (subject_kind, subject_id, user_id, role) do update set last_at = now();

  perform set_config('ref.ai_extraction', 'on', true);
  update public.ref_legal_ai_suggestions set
    status = 'CONVERTED',
    proposal_id = v_id,
    decided_by = v_uid,
    decided_at = now(),
    final = jsonb_build_object(
      'target_id', p_target, 'target_key', p_target_key, 'payload', p_payload, 'title', p_title,
      'source_ref', p_source_ref, 'text_effective_date', p_text_effective, 'requested_month', p_requested_month,
      'article', p_article, 'page', p_page, 'excerpt', v_excerpt,
      'payload_edited', p_payload is distinct from s.payload,
      'excerpt_edited', v_excerpt is distinct from coalesce(s.excerpt, '')
    )
  where id = s.id;
  perform set_config('ref.ai_extraction', '', true);

  if coalesce(p_submit, true) then
    perform public.ref_rule_submit_internal(v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.ref_legal_ai_suggestion_dismiss(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not (public.erp_has_perm('legal_ai_extraction', 'update'::public.rbac_action, null)
          or public.erp_has_perm('rule_proposals', 'update'::public.rbac_action, null)) then
    raise exception 'Traitement des suggestions IA non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Motif requis pour écarter une suggestion (5 à 500 caractères).' using errcode = 'check_violation';
  end if;
  perform set_config('ref.ai_extraction', 'on', true);
  update public.ref_legal_ai_suggestions set
    status = 'DISMISSED', dismiss_reason = v_reason, decided_by = v_uid, decided_at = now()
  where id = p_id and status = 'OPEN';
  if not found then
    raise exception 'Suggestion introuvable ou déjà traitée.' using errcode = 'check_violation';
  end if;
  perform set_config('ref.ai_extraction', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. D15 request
-- ---------------------------------------------------------------------------
create or replace function public.ref_legal_doc_d15_fingerprint(p_scope jsonb)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(coalesce((
    select d.id::text || '|' || d.applies_from::text || '|' || coalesce(d.applies_to::text, '') || '|' || d.doc_type
    from public.ref_legal_documents d
    where d.root_id = (p_scope->>'root_id')::uuid and d.status = 'ACTIVE'
  ), 'none'));
$$;

create or replace function public.ref_legal_doc_d15_context(p_scope jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'document_id', d.id,
    'root_id', d.root_id,
    'version_no', d.version_no,
    'doc_type', d.doc_type,
    'title', d.title,
    'reference', d.reference,
    'applies_from', d.applies_from,
    'applies_to', d.applies_to,
    'language', d.language,
    'previous_choice', public.ref_legal_doc_d15_choice(d.root_id),
    'citations', (
      select count(*) from public.ref_rule_citations c
      join public.ref_legal_documents x on x.id = c.document_id
      where x.root_id = d.root_id
    ),
    'extractions', (select count(*) from public.ref_legal_ai_extractions e where e.root_id = d.root_id)
  )
  from public.ref_legal_documents d
  where d.root_id = (p_scope->>'root_id')::uuid and d.status = 'ACTIVE';
$$;

create or replace function public.ref_legal_doc_request_d15(p_document uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  d public.ref_legal_documents%rowtype;
  v_key text;
  v_scope jsonb;
  v_open public.sys_decisions%rowtype;
  v_id uuid;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not (
    public.erp_is_super_admin(v_uid)
    or public.erp_has_perm('legal_ai_extraction', 'create'::public.rbac_action, null)
    or public.erp_has_perm('legal_documents', 'create'::public.rbac_action, null)
    or public.erp_has_perm('decision_legal_entry_path', 'create'::public.rbac_action, null)
  ) then
    raise exception 'Demande D15 non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.ref_legal_documents where id = p_document;
  if not found then
    raise exception 'Document introuvable au registre.' using errcode = 'no_data_found';
  end if;
  if d.status <> 'ACTIVE' then
    raise exception 'Document retiré ou corrigé : la décision porte sur la version en vigueur.' using errcode = 'check_violation';
  end if;
  if public.ref_legal_doc_entry_path(d.applies_from, d.applies_to) <> 'D15' then
    raise exception 'Ce document n''est pas à cheval sur 2025 et 2026 : sa voie de saisie découle de sa période, sans décision D15.'
      using errcode = 'check_violation';
  end if;
  if not public.ref_legal_doc_ai_type_allowed(d.doc_type) then
    raise exception 'Type de document exclu de l''analyse IA (convention, note interne ou autre texte) : saisie manuelle, sans décision D15.'
      using errcode = 'check_violation';
  end if;

  v_key := 'D15:' || d.root_id::text;
  v_scope := jsonb_build_object('root_id', d.root_id, 'document_id', d.id);
  select * into v_open from public.sys_decisions
  where dedupe_key = v_key and status in ('PENDING', 'DECIDED')
  for update;
  if found then
    if v_open.status = 'PENDING' then
      update public.sys_decisions set
        scope = v_scope,
        context = public.ref_legal_doc_d15_context(v_scope),
        fingerprint = public.ref_legal_doc_d15_fingerprint(v_scope)
      where id = v_open.id;
    end if;
    return v_open.id;
  end if;

  insert into public.sys_decisions (type_code, dedupe_key, scope, context, options, fingerprint, request_source, requested_by)
  select 'D15', v_key, v_scope, public.ref_legal_doc_d15_context(v_scope), t.options,
         public.ref_legal_doc_d15_fingerprint(v_scope), 'LEGAL_DOCUMENT', v_uid
  from public.sys_decision_types t
  where t.code = 'D15'
  returning id into v_id;

  perform public.sys_notify(
    'DECISION_PENDING',
    format('Voie de saisie à décider : %s', left(d.title, 150)),
    'Document appliqué à cheval sur 2025 et 2026 : choisissez la saisie manuelle ou l''extraction IA. Aucune analyse '
      || 'n''est possible avant la décision.',
    '/decisions/' || v_id,
    null,
    'decision_legal_entry_path',
    v_id
  );
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Decision engine: D15
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
    when 'D15' then public.ref_legal_doc_d15_fingerprint(d.scope)
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
  elsif d.type_code = 'D15' then
    if not exists (
      select 1 from public.ref_legal_documents x
      where x.root_id = (d.scope->>'root_id')::uuid and x.status = 'ACTIVE'
        and public.ref_legal_doc_entry_path(x.applies_from, x.applies_to) = 'D15'
        and public.ref_legal_doc_ai_type_allowed(x.doc_type)
    ) then
      perform public.sys_decision_close_internal(d.id, 'SUPERSEDED',
        'Document retiré, ou sa période d''application ou son type ne demandent plus de décision D15.');
      return 'SUPERSEDED';
    end if;
    update public.sys_decisions set
      context = public.ref_legal_doc_d15_context(d.scope),
      fingerprint = public.ref_legal_doc_d15_fingerprint(d.scope)
    where id = d.id;
    return 'PENDING';
  end if;
  return d.status;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.ref_legal_doc_d15_choice(uuid) from public, anon, authenticated;
revoke all on function public.ref_legal_doc_d15_decision(uuid) from public, anon, authenticated;
revoke all on function public.ref_legal_doc_ai_path(uuid) from public, anon, authenticated;
revoke all on function public.ref_ai_payload_in_excerpt(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.ref_legal_ai_guard() from public, anon, authenticated;
revoke all on function public.ref_legal_doc_d15_fingerprint(jsonb) from public, anon, authenticated;
revoke all on function public.ref_legal_doc_d15_context(jsonb) from public, anon, authenticated;
revoke all on function public.ref_rule_proposals_guard() from public, anon, authenticated;
revoke all on function public.sys_decision_current_fingerprint(uuid) from public, anon, authenticated;
revoke all on function public.sys_decision_refresh_record(uuid) from public, anon, authenticated;

revoke all on function public.ref_legal_doc_ai_type_allowed(text) from public, anon;
revoke all on function public.ref_ai_normalize_text(text) from public, anon;
revoke all on function public.ref_ai_excerpt_numbers(text) from public, anon;
revoke all on function public.ref_ai_number_in_excerpt(numeric, text) from public, anon;
revoke all on function public.ref_ai_fold(text) from public, anon;
revoke all on function public.ref_legal_ai_can_read() from public, anon;
revoke all on function public.ref_legal_ai_paths() from public, anon;
revoke all on function public.ref_legal_ai_extract_check(uuid) from public, anon;
revoke all on function public.ref_legal_ai_extraction_save(uuid, text, boolean, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.ref_legal_ai_suggestion_convert(uuid, uuid, text, jsonb, text, text, date, date, text, integer, text, boolean) from public, anon;
revoke all on function public.ref_legal_ai_suggestion_dismiss(uuid, text) from public, anon;
revoke all on function public.ref_legal_doc_request_d15(uuid) from public, anon;

grant execute on function public.ref_legal_doc_ai_type_allowed(text) to authenticated;
grant execute on function public.ref_ai_normalize_text(text) to authenticated;
grant execute on function public.ref_ai_excerpt_numbers(text) to authenticated;
grant execute on function public.ref_ai_number_in_excerpt(numeric, text) to authenticated;
grant execute on function public.ref_ai_fold(text) to authenticated;
grant execute on function public.ref_legal_ai_can_read() to authenticated;
grant execute on function public.ref_legal_ai_paths() to authenticated;
grant execute on function public.ref_legal_ai_extract_check(uuid) to authenticated;
grant execute on function public.ref_legal_ai_extraction_save(uuid, text, boolean, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.ref_legal_ai_suggestion_convert(uuid, uuid, text, jsonb, text, text, date, date, text, integer, text, boolean) to authenticated;
grant execute on function public.ref_legal_ai_suggestion_dismiss(uuid, text) to authenticated;
grant execute on function public.ref_legal_doc_request_d15(uuid) to authenticated;

commit;
