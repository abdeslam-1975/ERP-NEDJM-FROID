-- Lot 4 — Registre des documents juridiques par période d'application
--   1. Registre des documents juridiques : type, référence, Journal officiel, publication, période d'application
--      (fin ouverte possible), langue, provenance, fichier conservé dans un stockage privé avec son empreinte SHA-256.
--      Importer un document n'a aucun effet sur les règles ni sur la paie.
--   2. Un document ne se supprime jamais : une correction de ses informations crée une nouvelle version (le fichier ne
--      change pas), un retrait exige un motif. Un document retiré ne peut plus être cité.
--   3. Toute proposition de règle légale (lot 2) cite au moins un document du registre, avec article, page et extrait
--      saisis par l'utilisateur. Contrôle en base à la soumission et à l'approbation : au moins un document cité non
--      retiré. Les justificatifs sont figés dès la soumission.
--   4. Contrôle de couverture (avertissement, non bloquant) : mois demandé ou date d'effet hors de la période
--      d'application des documents cités, document cité corrigé ou retiré. L'écran d'approbation et la décision D2
--      affichent les justificatifs et ces avertissements.
--   5. Voie de saisie selon la période (affichage) : entièrement avant 2026 = saisie manuelle ; à partir de 2026 =
--      extraction IA possible (lot 7) ; à cheval sur 2025 et 2026 = décision D15 (lot 7).

begin;

-- ---------------------------------------------------------------------------
-- 1. Rights matrix
-- ---------------------------------------------------------------------------
insert into public.sys_screens (code, path, module, label_fr, label_ar, sort_order) values
  ('legal_documents', '/rh/legal/documents', 'rh',
   'Documents juridiques · consulter, importer ou corriger (créer), retirer (modifier)', 'الوثائق القانونية', 214)
on conflict (code) do nothing;

-- Rule preparers (lot 2) must be able to import the documents they cite; withdrawal stays with the SUPER_ADMIN.
insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select r.id, s.id,
       r.code in ('SUPER_ADMIN', 'ADMIN_RH', 'ADMIN_FINANCE'),
       true,
       r.code = 'SUPER_ADMIN',
       false,
       true,
       true
from public.sys_roles r
cross join public.sys_screens s
where s.code = 'legal_documents'
  and r.code in ('SUPER_ADMIN', 'ADMIN_RH', 'ADMIN_FINANCE', 'GERANT')
on conflict (role_id, screen_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Register
-- ---------------------------------------------------------------------------
create table if not exists public.ref_legal_documents (
  id uuid primary key default gen_random_uuid(),
  root_id uuid not null,
  version_no integer not null default 1 check (version_no >= 1),
  supersedes_id uuid unique references public.ref_legal_documents(id),
  doc_type text not null check (doc_type in (
    'LOI_FINANCES', 'LOI_FINANCES_COMPL', 'LOI', 'ORDONNANCE', 'DECRET_PRESIDENTIEL', 'DECRET_EXECUTIF',
    'ARRETE', 'DECISION', 'CIRCULAIRE', 'INSTRUCTION', 'NOTE', 'CONVENTION', 'OTHER')),
  title text not null check (char_length(btrim(title)) between 3 and 300),
  reference text not null check (char_length(btrim(reference)) between 3 and 200),
  jo_number text check (jo_number is null or char_length(btrim(jo_number)) between 1 and 40),
  jo_date date,
  publication_date date,
  applies_from date not null,
  applies_to date,
  language text not null check (language in ('FR', 'AR', 'FR_AR', 'OTHER')),
  origin text not null check (char_length(btrim(origin)) between 3 and 200),
  source_url text check (source_url is null or (source_url ~ '^https://[^\s]+$' and char_length(source_url) <= 500)),
  notes text check (notes is null or char_length(notes) <= 1000),
  storage_path text not null check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'),
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  correction_reason text check (correction_reason is null or char_length(btrim(correction_reason)) between 10 and 500),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUPERSEDED', 'WITHDRAWN')),
  withdrawn_by uuid references public.sys_users(id),
  withdrawn_at timestamptz,
  withdrawn_reason text,
  created_by uuid not null default auth.uid() references public.sys_users(id),
  created_at timestamptz not null default now(),
  unique (root_id, version_no),
  constraint ref_legal_documents_period_chk check (applies_to is null or applies_to >= applies_from),
  constraint ref_legal_documents_path_chk check (split_part(storage_path, '/', 1) = root_id::text),
  constraint ref_legal_documents_correction_chk check ((supersedes_id is null) = (correction_reason is null)),
  constraint ref_legal_documents_withdraw_chk check (
    (status = 'WITHDRAWN') = (withdrawn_at is not null)
    and (withdrawn_at is null
         or (withdrawn_by is not null and char_length(btrim(coalesce(withdrawn_reason, ''))) between 10 and 500)))
);

create unique index if not exists ref_legal_documents_active_uidx on public.ref_legal_documents (root_id) where status = 'ACTIVE';
create index if not exists ref_legal_documents_period_idx on public.ref_legal_documents (applies_from, applies_to);
create index if not exists ref_legal_documents_sha_idx on public.ref_legal_documents (sha256);

-- Version bookkeeping is set by the database; a correction keeps the file of the version it corrects.
create or replace function public.ref_legal_document_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.ref_legal_documents%rowtype;
begin
  if new.supersedes_id is null then
    new.root_id := new.id;
    new.version_no := 1;
  else
    select * into p from public.ref_legal_documents where id = new.supersedes_id;
    if not found then
      raise exception 'Version précédente introuvable.' using errcode = 'foreign_key_violation';
    end if;
    if (new.storage_path, new.file_name, new.mime_type, new.size_bytes, new.sha256)
       is distinct from (p.storage_path, p.file_name, p.mime_type, p.size_bytes, p.sha256) then
      raise exception 'Le fichier d''un document ne change pas : une correction ne porte que sur ses informations.'
        using errcode = 'check_violation';
    end if;
    new.root_id := p.root_id;
    new.version_no := p.version_no + 1;
  end if;
  new.status := 'ACTIVE';
  new.withdrawn_by := null;
  new.withdrawn_at := null;
  new.withdrawn_reason := null;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ref_legal_documents_insert on public.ref_legal_documents;
create trigger trg_ref_legal_documents_insert
  before insert on public.ref_legal_documents
  for each row execute function public.ref_legal_document_insert();

create or replace function public.ref_legal_document_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Document juridique : suppression interdite (retrait justifié uniquement).' using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - array['status', 'withdrawn_by', 'withdrawn_at', 'withdrawn_reason'])
     is distinct from (to_jsonb(old) - array['status', 'withdrawn_by', 'withdrawn_at', 'withdrawn_reason']) then
    raise exception 'Document juridique : informations non modifiables (une correction crée une nouvelle version).'
      using errcode = 'check_violation';
  end if;
  if old.status <> 'ACTIVE' then
    raise exception 'Document juridique %: enregistrement définitif.', old.status using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ref_legal_documents_guard on public.ref_legal_documents;
create trigger trg_ref_legal_documents_guard
  before update or delete on public.ref_legal_documents
  for each row execute function public.ref_legal_document_guard();

drop trigger if exists trg_ref_legal_documents_audit on public.ref_legal_documents;
create trigger trg_ref_legal_documents_audit
  after insert or update or delete on public.ref_legal_documents
  for each row execute function public.sys_audit_row_change();

-- Readers: the register itself, and whoever prepares or approves legal rules (they cite and check documents).
create or replace function public.ref_legal_docs_can_read()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.erp_has_perm('legal_documents', 'read'::public.rbac_action, null)
      or public.erp_has_perm('rule_proposals', 'read'::public.rbac_action, null)
      or public.erp_has_perm('rule_approval', 'read'::public.rbac_action, null);
$$;

alter table public.ref_legal_documents enable row level security;

drop policy if exists ref_legal_documents_read on public.ref_legal_documents;
create policy ref_legal_documents_read on public.ref_legal_documents
  for select to authenticated using (public.ref_legal_docs_can_read());

revoke insert, update, delete, truncate on public.ref_legal_documents from anon, authenticated;
revoke all on public.ref_legal_documents from anon;

-- ---------------------------------------------------------------------------
-- 3. Private storage: <document root id>/<uuid>.<ext>; files are never replaced nor deleted.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('legal-documents', 'legal-documents', false, 26214400,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- A file is uploaded before its entry exists: the folder is the future document id, never an existing one.
create or replace function public.ref_legal_doc_upload_allowed(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.erp_has_perm('legal_documents', 'create'::public.rbac_action, null)
     and coalesce(p_folder, '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and not exists (select 1 from public.ref_legal_documents d where d.root_id::text = p_folder);
$$;

drop policy if exists legal_documents_select on storage.objects;
create policy legal_documents_select on storage.objects
  for select to authenticated
  using (bucket_id = 'legal-documents' and public.ref_legal_docs_can_read());

drop policy if exists legal_documents_insert on storage.objects;
create policy legal_documents_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'legal-documents'
    and public.ref_legal_doc_upload_allowed((storage.foldername(name))[1])
  );

-- ---------------------------------------------------------------------------
-- 4. Register functions
-- ---------------------------------------------------------------------------
create or replace function public.ref_legal_doc_entry_path(p_from date, p_to date)
returns text
language sql
immutable
as $$
  select case
    when p_to is not null and p_to < date '2026-01-01' then 'MANUAL'
    when p_from >= date '2026-01-01' then 'AI_ALLOWED'
    else 'D15'
  end;
$$;

-- Validated metadata of an entry (creation or correction); the file columns are filled by the caller.
create or replace function public.ref_legal_doc_fields(p jsonb)
returns public.ref_legal_documents
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  r public.ref_legal_documents%rowtype;
begin
  r.doc_type := upper(btrim(coalesce(p->>'doc_type', '')));
  r.title := btrim(coalesce(p->>'title', ''));
  r.reference := btrim(coalesce(p->>'reference', ''));
  r.jo_number := nullif(btrim(coalesce(p->>'jo_number', '')), '');
  r.language := upper(btrim(coalesce(p->>'language', '')));
  r.origin := btrim(coalesce(p->>'origin', ''));
  r.source_url := nullif(btrim(coalesce(p->>'source_url', '')), '');
  r.notes := nullif(btrim(coalesce(p->>'notes', '')), '');
  begin
    r.jo_date := nullif(p->>'jo_date', '')::date;
    r.publication_date := nullif(p->>'publication_date', '')::date;
    r.applies_from := nullif(p->>'applies_from', '')::date;
    r.applies_to := nullif(p->>'applies_to', '')::date;
  exception when others then
    raise exception 'Date invalide.' using errcode = 'check_violation';
  end;
  if r.doc_type not in ('LOI_FINANCES', 'LOI_FINANCES_COMPL', 'LOI', 'ORDONNANCE', 'DECRET_PRESIDENTIEL', 'DECRET_EXECUTIF',
                        'ARRETE', 'DECISION', 'CIRCULAIRE', 'INSTRUCTION', 'NOTE', 'CONVENTION', 'OTHER') then
    raise exception 'Type de document invalide.' using errcode = 'check_violation';
  end if;
  if char_length(r.title) < 3 or char_length(r.title) > 300 then
    raise exception 'Intitulé requis (3 à 300 caractères).' using errcode = 'check_violation';
  end if;
  if char_length(r.reference) < 3 or char_length(r.reference) > 200 then
    raise exception 'Référence requise : numéro et date du texte (3 à 200 caractères).' using errcode = 'check_violation';
  end if;
  if r.jo_number is not null and char_length(r.jo_number) > 40 then
    raise exception 'Numéro du Journal officiel : 40 caractères maximum.' using errcode = 'check_violation';
  end if;
  if r.language not in ('FR', 'AR', 'FR_AR', 'OTHER') then
    raise exception 'Langue invalide.' using errcode = 'check_violation';
  end if;
  if char_length(r.origin) < 3 or char_length(r.origin) > 200 then
    raise exception 'Provenance requise : organisme, site officiel ou transmission (3 à 200 caractères).' using errcode = 'check_violation';
  end if;
  if r.source_url is not null and (r.source_url !~ '^https://[^\s]+$' or char_length(r.source_url) > 500) then
    raise exception 'Lien de la source : adresse https:// valide (500 caractères maximum).' using errcode = 'check_violation';
  end if;
  if r.notes is not null and char_length(r.notes) > 1000 then
    raise exception 'Observations : 1000 caractères maximum.' using errcode = 'check_violation';
  end if;
  if r.applies_from is null then
    raise exception 'Début de la période d''application requis.' using errcode = 'check_violation';
  end if;
  if r.applies_to is not null and r.applies_to < r.applies_from then
    raise exception 'Fin de la période d''application antérieure à son début.' using errcode = 'check_violation';
  end if;
  if r.applies_from < date '1990-01-01' or r.applies_from > date '2100-12-31' then
    raise exception 'Début de la période d''application hors des limites (1990 à 2100).' using errcode = 'check_violation';
  end if;
  return r;
end;
$$;

create or replace function public.ref_legal_doc_session(p_action text)
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
  if not public.erp_has_perm('legal_documents', p_action::public.rbac_action, null) then
    raise exception '%', case when p_action = 'update' then 'Retrait des documents juridiques non autorisé.'
                              else 'Import des documents juridiques non autorisé.' end
      using errcode = 'insufficient_privilege';
  end if;
  return v_uid;
end;
$$;

create or replace function public.ref_legal_doc_create(
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
  v_uid uuid := public.ref_legal_doc_session('create');
  r public.ref_legal_documents%rowtype := public.ref_legal_doc_fields(p);
  v_folder text := split_part(coalesce(p_path, ''), '/', 1);
  v_stored bigint;
  v_dup record;
  v_id uuid;
begin
  if coalesce(p_path, '') !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$' then
    raise exception 'Chemin de fichier invalide.' using errcode = 'check_violation';
  end if;
  if p_mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Format non accepté (PDF, JPEG, PNG ou WebP).' using errcode = 'check_violation';
  end if;
  if coalesce(p_sha256, '') !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Empreinte du fichier invalide.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.ref_legal_documents d where d.root_id::text = v_folder) then
    raise exception 'Fichier déjà enregistré.' using errcode = 'unique_violation';
  end if;
  select (so.metadata->>'size')::bigint into v_stored
  from storage.objects so
  where so.bucket_id = 'legal-documents' and so.name = p_path;
  if not found then
    raise exception 'Fichier non reçu : réessayez l''envoi.' using errcode = 'no_data_found';
  end if;
  if v_stored is not null and v_stored <> p_size then
    raise exception 'Taille différente du fichier reçu.' using errcode = 'check_violation';
  end if;
  select d.title, d.version_no into v_dup
  from public.ref_legal_documents d
  where d.sha256 = lower(p_sha256) and d.status = 'ACTIVE'
  limit 1;
  if found then
    raise exception 'Ce fichier est déjà au registre : « % » (version %).', v_dup.title, v_dup.version_no
      using errcode = 'unique_violation';
  end if;

  insert into public.ref_legal_documents (
    id, doc_type, title, reference, jo_number, jo_date, publication_date, applies_from, applies_to, language, origin,
    source_url, notes, storage_path, file_name, mime_type, size_bytes, sha256, created_by
  ) values (
    v_folder::uuid, r.doc_type, r.title, r.reference, r.jo_number, r.jo_date, r.publication_date, r.applies_from,
    r.applies_to, r.language, r.origin, r.source_url, r.notes, p_path, btrim(coalesce(p_name, '')), p_mime, p_size,
    lower(p_sha256), v_uid
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.ref_legal_doc_correct(p_id uuid, p jsonb, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.ref_legal_doc_session('create');
  r public.ref_legal_documents%rowtype := public.ref_legal_doc_fields(p);
  prev public.ref_legal_documents%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  select * into prev from public.ref_legal_documents where id = p_id for update;
  if not found then
    raise exception 'Document introuvable.' using errcode = 'no_data_found';
  end if;
  if prev.status <> 'ACTIVE' then
    raise exception 'Seule la version en vigueur d''un document se corrige.' using errcode = 'check_violation';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    raise exception 'Motif de la correction obligatoire (10 à 500 caractères).' using errcode = 'check_violation';
  end if;
  if (r.doc_type, r.title, r.reference, r.jo_number, r.jo_date, r.publication_date, r.applies_from, r.applies_to,
      r.language, r.origin, r.source_url, r.notes)
     is not distinct from
     (prev.doc_type, prev.title, prev.reference, prev.jo_number, prev.jo_date, prev.publication_date, prev.applies_from,
      prev.applies_to, prev.language, prev.origin, prev.source_url, prev.notes) then
    raise exception 'Aucune information modifiée.' using errcode = 'check_violation';
  end if;
  update public.ref_legal_documents set status = 'SUPERSEDED' where id = prev.id;
  insert into public.ref_legal_documents (
    supersedes_id, doc_type, title, reference, jo_number, jo_date, publication_date, applies_from, applies_to, language,
    origin, source_url, notes, storage_path, file_name, mime_type, size_bytes, sha256, correction_reason, created_by
  ) values (
    prev.id, r.doc_type, r.title, r.reference, r.jo_number, r.jo_date, r.publication_date, r.applies_from, r.applies_to,
    r.language, r.origin, r.source_url, r.notes, prev.storage_path, prev.file_name, prev.mime_type, prev.size_bytes,
    prev.sha256, v_reason, v_uid
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.ref_legal_doc_withdraw(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.ref_legal_doc_session('update');
  v_reason text := btrim(coalesce(p_reason, ''));
  d public.ref_legal_documents%rowtype;
begin
  if char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    raise exception 'Motif du retrait obligatoire (10 à 500 caractères).' using errcode = 'check_violation';
  end if;
  select * into d from public.ref_legal_documents where id = p_id for update;
  if not found then
    raise exception 'Document introuvable.' using errcode = 'no_data_found';
  end if;
  if d.status <> 'ACTIVE' then
    raise exception 'Document %: retrait impossible.', d.status using errcode = 'check_violation';
  end if;
  update public.ref_legal_documents set
    status = 'WITHDRAWN', withdrawn_by = v_uid, withdrawn_at = now(), withdrawn_reason = v_reason
  where id = d.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Citations: the documents a rule proposal relies on (article, page, excerpt)
-- ---------------------------------------------------------------------------
create table if not exists public.ref_rule_citations (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.ref_rule_proposals(id),
  document_id uuid not null references public.ref_legal_documents(id),
  article text not null check (char_length(btrim(article)) between 1 and 120),
  page integer not null check (page between 1 and 5000),
  excerpt text not null check (char_length(btrim(excerpt)) between 10 and 2000),
  created_by uuid references public.sys_users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (proposal_id, document_id, article, page)
);

create index if not exists ref_rule_citations_proposal_idx on public.ref_rule_citations (proposal_id);
create index if not exists ref_rule_citations_document_idx on public.ref_rule_citations (document_id);

-- Citations change only while the proposal is a draft, and only through ref_rule_proposal_save.
create or replace function public.ref_rule_citation_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Justificatif d''une proposition : enregistrement non modifiable.' using errcode = 'check_violation';
  end if;
  select p.status into v_status
  from public.ref_rule_proposals p
  where p.id = case when tg_op = 'DELETE' then old.proposal_id else new.proposal_id end;
  if v_status is distinct from 'DRAFT' then
    raise exception 'Justificatifs figés après la soumission de la proposition.' using errcode = 'check_violation';
  end if;
  if not public.ref_rule_reviewing() then
    raise exception 'Les justificatifs se modifient avec la proposition.' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.ref_legal_documents d where d.id = new.document_id and d.status = 'ACTIVE') then
      raise exception 'Document cité retiré ou remplacé par une version corrigée : citez la version en vigueur.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_ref_rule_citations_guard on public.ref_rule_citations;
create trigger trg_ref_rule_citations_guard
  before insert or update or delete on public.ref_rule_citations
  for each row execute function public.ref_rule_citation_guard();

drop trigger if exists trg_ref_rule_citations_audit on public.ref_rule_citations;
create trigger trg_ref_rule_citations_audit
  after insert or update or delete on public.ref_rule_citations
  for each row execute function public.sys_audit_row_change();

alter table public.ref_rule_citations enable row level security;

drop policy if exists ref_rule_citations_read on public.ref_rule_citations;
create policy ref_rule_citations_read on public.ref_rule_citations
  for select to authenticated
  using (
    public.ref_legal_docs_can_read()
    or exists (select 1 from public.ref_rule_proposals p where p.id = proposal_id and p.created_by = auth.uid())
  );

revoke insert, update, delete, truncate on public.ref_rule_citations from anon, authenticated;
revoke all on public.ref_rule_citations from anon;

create or replace function public.ref_rule_citations_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'document_id', d.id,
    'root_id', d.root_id,
    'version_no', d.version_no,
    'latest_version_no', (select max(x.version_no) from public.ref_legal_documents x where x.root_id = d.root_id),
    'doc_type', d.doc_type,
    'title', d.title,
    'reference', d.reference,
    'applies_from', d.applies_from,
    'applies_to', d.applies_to,
    'status', d.status,
    'withdrawn_reason', d.withdrawn_reason,
    'withdrawn_at', d.withdrawn_at,
    'article', c.article,
    'page', c.page,
    'excerpt', c.excerpt
  ) order by c.created_at, c.id), '[]'::jsonb)
  from public.ref_rule_citations c
  join public.ref_legal_documents d on d.id = c.document_id
  where c.proposal_id = p_id;
$$;

-- Coverage and validity warnings; they never block (the blocking rule is "at least one document not withdrawn").
create or replace function public.ref_rule_citation_warnings(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  p public.ref_rule_proposals%rowtype;
  w text[] := '{}';
  c record;
  v_live integer;
begin
  select * into p from public.ref_rule_proposals where id = p_id;
  if not found then
    return '[]'::jsonb;
  end if;
  select count(*) filter (where d.status <> 'WITHDRAWN') into v_live
  from public.ref_rule_citations rc join public.ref_legal_documents d on d.id = rc.document_id
  where rc.proposal_id = p.id;
  if not exists (select 1 from public.ref_rule_citations rc where rc.proposal_id = p.id) then
    w := w || 'Aucun document justificatif cité : la proposition ne peut être ni soumise ni approuvée.'::text;
  elsif v_live = 0 then
    w := w || 'Tous les documents cités ont été retirés du registre : la proposition ne peut plus être approuvée.'::text;
  end if;
  for c in
    select distinct d.id, d.title, d.version_no, d.status, d.withdrawn_at, d.withdrawn_reason,
           (select max(x.version_no) from public.ref_legal_documents x where x.root_id = d.root_id) as latest
    from public.ref_rule_citations rc join public.ref_legal_documents d on d.id = rc.document_id
    where rc.proposal_id = p.id
    order by d.title
  loop
    if c.status = 'WITHDRAWN' then
      w := w || format('Document « %s » retiré du registre le %s : %s', c.title, to_char(c.withdrawn_at, 'DD/MM/YYYY'),
                       c.withdrawn_reason);
    elsif c.status = 'SUPERSEDED' then
      w := w || format('Document « %s » : la version citée (v%s) a été corrigée depuis (v%s au registre).', c.title,
                       c.version_no, c.latest);
    end if;
  end loop;
  if p.action <> 'VERIFY' and v_live > 0 then
    if p.requested_month is not null and not exists (
      select 1 from public.ref_rule_citations rc join public.ref_legal_documents d on d.id = rc.document_id
      where rc.proposal_id = p.id and d.status <> 'WITHDRAWN'
        and d.applies_from <= p.requested_month and (d.applies_to is null or d.applies_to >= p.requested_month)
    ) then
      w := w || format('Le mois demandé (%s) sort de la période d''application des documents cités.',
                       to_char(p.requested_month, 'MM/YYYY'));
    end if;
    if p.text_effective_date is not null and not exists (
      select 1 from public.ref_rule_citations rc join public.ref_legal_documents d on d.id = rc.document_id
      where rc.proposal_id = p.id and d.status <> 'WITHDRAWN'
        and d.applies_from <= p.text_effective_date and (d.applies_to is null or d.applies_to >= p.text_effective_date)
    ) then
      w := w || format('La date d''effet du texte (%s) sort de la période d''application des documents cités.',
                       to_char(p.text_effective_date, 'DD/MM/YYYY'));
    end if;
  end if;
  return to_jsonb(w);
end;
$$;

-- Submission and approval need at least one cited document that is not withdrawn, whatever the path.
create or replace function public.ref_rule_proposals_citation_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is not distinct from old.status or new.status not in ('SUBMITTED', 'APPROVED') then
    return new;
  end if;
  if not exists (select 1 from public.ref_rule_citations c where c.proposal_id = new.id) then
    raise exception 'Justificatif requis : citez au moins un document du registre des documents juridiques (article, page, extrait).'
      using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.ref_rule_citations c join public.ref_legal_documents d on d.id = c.document_id
    where c.proposal_id = new.id and d.status <> 'WITHDRAWN'
  ) then
    raise exception 'Tous les documents cités ont été retirés du registre : retirez la proposition et créez-en une autre avec un justificatif valide.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ref_rule_proposals_citations on public.ref_rule_proposals;
create trigger trg_ref_rule_proposals_citations
  before update on public.ref_rule_proposals
  for each row execute function public.ref_rule_proposals_citation_guard();

-- ---------------------------------------------------------------------------
-- 6. Proposal save: same checks as lot 2, plus the citations (replaced as a whole while the proposal is a draft)
-- ---------------------------------------------------------------------------
drop function if exists public.ref_rule_proposal_save(uuid, text, text, uuid, text, jsonb, text, text, date, date, boolean);

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
  p_submit boolean default false,
  p_citations jsonb default null
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
  c jsonb;
  v_doc uuid;
  v_article text;
  v_page integer;
  v_excerpt text;
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
  if p_citations is not null and (jsonb_typeof(p_citations) <> 'array' or jsonb_array_length(p_citations) > 20) then
    raise exception 'Justificatifs invalides (20 au plus).' using errcode = 'check_violation';
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

  if p_citations is not null then
    delete from public.ref_rule_citations where proposal_id = v_id;
    for c in select value from jsonb_array_elements(p_citations)
    loop
      begin
        v_doc := (c->>'document_id')::uuid;
        v_page := (c->>'page')::integer;
      exception when others then
        raise exception 'Justificatif : document ou page invalide.' using errcode = 'check_violation';
      end;
      v_article := btrim(coalesce(c->>'article', ''));
      v_excerpt := btrim(coalesce(c->>'excerpt', ''));
      if v_doc is null or not exists (select 1 from public.ref_legal_documents d where d.id = v_doc) then
        raise exception 'Justificatif : document introuvable au registre.' using errcode = 'foreign_key_violation';
      end if;
      if char_length(v_article) < 1 or char_length(v_article) > 120 then
        raise exception 'Justificatif : article requis (120 caractères maximum).' using errcode = 'check_violation';
      end if;
      if v_page is null or v_page < 1 or v_page > 5000 then
        raise exception 'Justificatif : page requise (1 à 5000).' using errcode = 'check_violation';
      end if;
      if char_length(v_excerpt) < 10 or char_length(v_excerpt) > 2000 then
        raise exception 'Justificatif : extrait du texte requis (10 à 2000 caractères).' using errcode = 'check_violation';
      end if;
      insert into public.ref_rule_citations (proposal_id, document_id, article, page, excerpt, created_by)
      values (v_id, v_doc, v_article, v_page, v_excerpt, v_uid)
      on conflict (proposal_id, document_id, article, page) do nothing;
    end loop;
  end if;

  if coalesce(p_submit, false) then
    perform public.ref_rule_submit_internal(v_id);
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Proposals overview and D2 context show the supporting documents and the warnings
-- ---------------------------------------------------------------------------
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
    'proposed', public.ref_rule_proposal_content(p.id),
    'citations', public.ref_rule_citations_json(p.id),
    'citation_warnings', public.ref_rule_citation_warnings(p.id)
  ) order by p.created_at desc), '[]'::jsonb)
  from public.ref_rule_proposals p
  where (public.erp_has_perm('rule_proposals', 'read'::public.rbac_action, null)
         or public.erp_has_perm('rule_approval', 'read'::public.rbac_action, null)
         or p.created_by = auth.uid())
    and (not coalesce(p_only_open, true) or p.status in ('DRAFT', 'SUBMITTED', 'APPROVED')
         or p.updated_at > now() - interval '30 days');
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
    'citations', public.ref_rule_citations_json(p.id),
    'citation_warnings', public.ref_rule_citation_warnings(p.id),
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

-- ---------------------------------------------------------------------------
-- 8. Register listing (names included: sys_users is not readable by every role)
-- ---------------------------------------------------------------------------
create or replace function public.ref_legal_documents_list(p_year integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_from date;
  v_to date;
begin
  if not public.ref_legal_docs_can_read() then
    raise exception 'Consultation des documents juridiques non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  if p_year is not null then
    v_from := make_date(p_year, 1, 1);
    v_to := make_date(p_year, 12, 31);
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id,
      'root_id', d.root_id,
      'version_no', d.version_no,
      'supersedes_id', d.supersedes_id,
      'doc_type', d.doc_type,
      'title', d.title,
      'reference', d.reference,
      'jo_number', d.jo_number,
      'jo_date', d.jo_date,
      'publication_date', d.publication_date,
      'applies_from', d.applies_from,
      'applies_to', d.applies_to,
      'entry_path', public.ref_legal_doc_entry_path(d.applies_from, d.applies_to),
      'language', d.language,
      'origin', d.origin,
      'source_url', d.source_url,
      'notes', d.notes,
      'file_name', d.file_name,
      'mime_type', d.mime_type,
      'size_bytes', d.size_bytes,
      'sha256', d.sha256,
      'correction_reason', d.correction_reason,
      'status', d.status,
      'withdrawn_reason', d.withdrawn_reason,
      'withdrawn_at', d.withdrawn_at,
      'withdrawn_by', (select u.full_name from public.sys_users u where u.id = d.withdrawn_by),
      'created_by', (select u.full_name from public.sys_users u where u.id = d.created_by),
      'created_at', d.created_at,
      'citations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'proposal_id', p.id, 'title', p.title, 'family', p.family, 'status', p.status,
          'article', c.article, 'page', c.page) order by p.created_at desc)
        from public.ref_rule_citations c join public.ref_rule_proposals p on p.id = c.proposal_id
        where c.document_id = d.id), '[]'::jsonb)
    ) order by d.applies_from desc, d.root_id, d.version_no desc)
    from public.ref_legal_documents d
    where p_year is null
       or exists (
         select 1 from public.ref_legal_documents v
         where v.root_id = d.root_id and v.status <> 'SUPERSEDED'
           and v.applies_from <= v_to and (v.applies_to is null or v.applies_to >= v_from))
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.ref_legal_document_insert() from public, anon, authenticated;
revoke all on function public.ref_legal_document_guard() from public, anon, authenticated;
revoke all on function public.ref_legal_doc_fields(jsonb) from public, anon, authenticated;
revoke all on function public.ref_legal_doc_session(text) from public, anon, authenticated;
revoke all on function public.ref_rule_citation_guard() from public, anon, authenticated;
revoke all on function public.ref_rule_citations_json(uuid) from public, anon, authenticated;
revoke all on function public.ref_rule_citation_warnings(uuid) from public, anon, authenticated;
revoke all on function public.ref_rule_proposals_citation_guard() from public, anon, authenticated;
revoke all on function public.ref_rule_application_context(uuid, date, date) from public, anon, authenticated;

revoke all on function public.ref_legal_docs_can_read() from public, anon;
revoke all on function public.ref_legal_doc_upload_allowed(text) from public, anon;
revoke all on function public.ref_legal_doc_entry_path(date, date) from public, anon;
revoke all on function public.ref_legal_doc_create(text, text, text, bigint, text, jsonb) from public, anon;
revoke all on function public.ref_legal_doc_correct(uuid, jsonb, text) from public, anon;
revoke all on function public.ref_legal_doc_withdraw(uuid, text) from public, anon;
revoke all on function public.ref_legal_documents_list(integer) from public, anon;
revoke all on function public.ref_rule_proposal_save(uuid, text, text, uuid, text, jsonb, text, text, date, date, boolean, jsonb) from public, anon;
revoke all on function public.ref_rule_proposals_overview(boolean) from public, anon;

grant execute on function public.ref_legal_docs_can_read() to authenticated;
grant execute on function public.ref_legal_doc_upload_allowed(text) to authenticated;
grant execute on function public.ref_legal_doc_entry_path(date, date) to authenticated;
grant execute on function public.ref_legal_doc_create(text, text, text, bigint, text, jsonb) to authenticated;
grant execute on function public.ref_legal_doc_correct(uuid, jsonb, text) to authenticated;
grant execute on function public.ref_legal_doc_withdraw(uuid, text) to authenticated;
grant execute on function public.ref_legal_documents_list(integer) to authenticated;
grant execute on function public.ref_rule_proposal_save(uuid, text, text, uuid, text, jsonb, text, text, date, date, boolean, jsonb) to authenticated;
grant execute on function public.ref_rule_proposals_overview(boolean) to authenticated;

commit;
