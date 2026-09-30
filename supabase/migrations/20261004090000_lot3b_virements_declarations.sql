-- Lot 3b — Virements et déclarations
--   1. Nature des paies : janvier à août 2026 (et avant) = paie de reprise, payée et déclarée hors de l'application.
--   2. D9 : aucune ligne de virement, en base, pour un bulletin de reprise, pour un salarié dont le salaire du mois a déjà
--      été viré par un lot exécuté, ou couvert par un paiement externe enregistré, sans décision D9 valide (mois, chantier,
--      mode et liste exacte de bulletins vérifiée par empreinte, consommée une seule fois).
--   3. D10 : aucun export de déclaration (mensuel, DAS annuelle, fichiers CNAS / DAS, état G50) couvrant un mois de reprise
--      ou un mois déjà déclaré hors application n'est enregistré sans décision D10 valide. Chaque fichier produit est
--      inscrit au registre des exports de déclaration (nature officielle / contrôle, empreinte, auteur, décision).
--   4. Registre des opérations externes : paiements et déclarations faits hors de l'application, conservés comme donnée
--      historique distincte des exports. Trois indicateurs indépendants (information déclarée, enregistrement confirmé,
--      pièce examinée) ; aucun ne lève un blocage ni n'atténue un avertissement. Retrait justifié, jamais de suppression ;
--      une correction crée une nouvelle version. Pièces dans un stockage privé, avec empreinte.
--   5. D7 : l'écran de réouverture affiche le registre des exports et les opérations externes du mois.
--   L'absence de trace dans l'application n'est jamais la preuve qu'aucun paiement ou aucune déclaration n'a eu lieu :
--   une entrée externe, même retirée, remplacée ou non confirmée, continue de compter pour le blocage.

begin;

-- ---------------------------------------------------------------------------
-- 1. Rights matrix: D9 / D10 deciders, external operations register (read / enter / withdraw, confirm, examine)
-- ---------------------------------------------------------------------------
insert into public.sys_screens (code, path, module, label_fr, label_ar, sort_order) values
  ('decision_payroll_transfer', '/decisions?type=D9', 'decisions',
   'Décision D9 · Virement d''une paie de reprise, déjà virée ou payée hors application (classe : à risque)', null, 62),
  ('decision_declaration_export', '/decisions?type=D10', 'decisions',
   'Décision D10 · Déclaration couvrant une période de reprise ou déjà déclarée hors application (classe : à risque)', null, 63),
  ('hr_external_operations', '/rh/paie/operations-externes', 'hr',
   'Opérations externes · lire, saisir ou corriger (créer), retirer (modifier)', null, 140),
  ('hr_external_operations_confirm', '/rh/paie/operations-externes?vue=confirmation', 'hr',
   'Opérations externes · confirmer l''enregistrement (modifier)', null, 141),
  ('hr_external_operations_examine', '/rh/paie/operations-externes?vue=examen', 'hr',
   'Opérations externes · examiner une pièce justificative (modifier)', null, 142)
on conflict (code) do nothing;

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select r.id, s.id, true, true, true, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code = 'SUPER_ADMIN'
  and s.code in ('decision_payroll_transfer', 'decision_declaration_export', 'hr_external_operations',
                 'hr_external_operations_confirm', 'hr_external_operations_examine')
on conflict (role_id, screen_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Decision types D9 and D10
-- ---------------------------------------------------------------------------
insert into public.sys_decision_types (code, label_fr, description_fr, risk_class, policy_allowed, screen_code, options) values
  ('D9',
   'Virement d''une paie de reprise, déjà virée ou payée hors application',
   'Bloqué par défaut en base : aucune ligne de virement pour un bulletin de reprise (janvier à août 2026, payé hors de l''application), pour un salarié dont le salaire du mois a déjà été viré par un lot exécuté, ou couvert par un paiement externe enregistré. Décision par mois, chantier, mode et liste exacte de bulletins (empreinte), consommée une seule fois. L''absence de trace dans l''application ne prouve jamais qu''aucun paiement n''a eu lieu.',
   'RISKY', false, 'decision_payroll_transfer',
   jsonb_build_array(
     jsonb_build_object(
       'code', 'NONE',
       'label_fr', 'Aucun virement',
       'consequence_fr', 'Aucun fichier ni lot n''est produit. Ces bulletins restent bloqués pour le virement ; une nouvelle demande sera nécessaire.',
       'executes', false),
     jsonb_build_object(
       'code', 'RECONCILIATION',
       'label_fr', 'État de rapprochement non bancaire',
       'consequence_fr', 'Un état listant ces bulletins, leurs nets et les virements déjà exécutés est produit une seule fois depuis l''écran Virements. Ce n''est pas un ordre de paiement : il ne se dépose ni à la banque ni à Algérie Poste. Aucun lot n''est créé.',
       'executes', true),
     jsonb_build_object(
       'code', 'REAL_BATCH',
       'label_fr', 'Lot de virement réel — risque de double paiement',
       'consequence_fr', 'Un lot de virement réel est généré une seule fois depuis l''écran Virements, pour exactement ces bulletins, et marqué « risque de double paiement » dans l''historique du lot. Si ces salaires ont déjà été versés hors de l''application ou par un lot exécuté, ils seront payés deux fois.',
       'executes', true))),
  ('D10',
   'Déclaration couvrant une période de reprise ou déjà déclarée hors application',
   'Bloqué par défaut : aucun export de déclaration (fichier mensuel, DAS annuelle, fichiers CNAS / DAS, état G50) couvrant un mois de reprise (janvier à août 2026, déclaré hors de l''application) ou un mois déjà déclaré hors application selon le registre des opérations externes. Chaque fichier produit est inscrit au registre des exports. Décision par type, période et chantier, consommée une seule fois. L''absence de trace dans l''application ne prouve jamais qu''aucune déclaration n''a eu lieu.',
   'RISKY', false, 'decision_declaration_export',
   jsonb_build_array(
     jsonb_build_object(
       'code', 'EXCLUDE',
       'label_fr', 'Exclure les mois concernés',
       'consequence_fr', 'Le fichier est produit une seule fois sans les mois de reprise ni les mois déjà déclarés hors application (liste ci-dessus), puis inscrit au registre des exports.',
       'executes', true),
     jsonb_build_object(
       'code', 'CONTROL',
       'label_fr', 'État de contrôle interne',
       'consequence_fr', 'Un état marqué « ÉTAT DE CONTRÔLE — reconstitution, non déclaratif » est produit une seule fois, avec tous les mois, et inscrit au registre comme contrôle. Il ne doit pas être déposé.',
       'executes', true),
     jsonb_build_object(
       'code', 'OFFICIAL',
       'label_fr', 'Fichier officiel — risque de double déclaration',
       'consequence_fr', 'Le fichier officiel est produit une seule fois avec tous les mois et inscrit au registre avec la mention « risque de double déclaration ». Si ces mois ont déjà été déclarés hors de l''application, ils le seront deux fois.',
       'executes', true)))
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 3. External operations register (historical data, distinct from the application's exports)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_external_operations (
  id uuid primary key default gen_random_uuid(),
  root_id uuid not null,
  version_no integer not null default 1 check (version_no >= 1),
  supersedes_id uuid unique references public.hr_external_operations(id),
  kind text not null check (kind in ('PAYMENT', 'DECLARATION')),
  subtype text not null check (subtype in ('SALARY', 'G50', 'CNAS', 'DAS', 'OTHER')),
  period_from date not null check (extract(day from period_from) = 1),
  period_to date not null check (extract(day from period_to) = 1),
  site_ids uuid[] check (site_ids is null or cardinality(site_ids) between 1 and 200),
  employee_ids uuid[] check (employee_ids is null or cardinality(employee_ids) between 1 and 2000),
  operation_date date,
  reference text check (char_length(reference) <= 120),
  organism text check (char_length(organism) <= 120),
  total_amount numeric(14, 2) check (total_amount is null or total_amount >= 0),
  source text not null check (source in ('DECLARATIVE', 'DOCUMENT')),
  description text not null check (char_length(btrim(description)) between 10 and 1000),
  correction_reason text check (correction_reason is null or char_length(btrim(correction_reason)) between 10 and 500),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUPERSEDED', 'WITHDRAWN')),
  confirmed_by uuid references public.sys_users(id),
  confirmed_at timestamptz,
  withdrawn_by uuid references public.sys_users(id),
  withdrawn_at timestamptz,
  withdrawn_reason text,
  created_by uuid not null default auth.uid() references public.sys_users(id),
  created_at timestamptz not null default now(),
  constraint hr_external_operations_period_chk
    check (period_to >= period_from and period_to < (period_from + interval '12 months')::date),
  constraint hr_external_operations_subtype_chk check (
    (kind = 'PAYMENT' and subtype in ('SALARY', 'OTHER'))
    or (kind = 'DECLARATION' and subtype in ('G50', 'CNAS', 'DAS', 'OTHER'))),
  constraint hr_external_operations_confirm_chk check ((confirmed_by is null) = (confirmed_at is null)),
  constraint hr_external_operations_withdraw_chk check (
    (status = 'WITHDRAWN') = (withdrawn_at is not null)
    and (withdrawn_at is null
         or (withdrawn_by is not null and char_length(btrim(coalesce(withdrawn_reason, ''))) between 10 and 500))),
  constraint hr_external_operations_correction_chk check ((supersedes_id is null) = (correction_reason is null))
);

create index if not exists hr_external_operations_period_idx on public.hr_external_operations (period_from, period_to);
create index if not exists hr_external_operations_root_idx on public.hr_external_operations (root_id, version_no);

create table if not exists public.hr_external_operation_documents (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.hr_external_operations(id),
  storage_path text not null
    check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'),
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid not null references public.sys_users(id),
  uploaded_at timestamptz not null default now(),
  copied_from uuid references public.hr_external_operation_documents(id),
  is_current boolean not null default true,
  replaced_by uuid references public.hr_external_operation_documents(id),
  replaced_at timestamptz,
  examined_by uuid references public.sys_users(id),
  examined_at timestamptz,
  examination_note text,
  constraint hr_external_operation_documents_exam_chk check (
    (examined_by is null) = (examined_at is null) and (examined_at is null) = (examination_note is null)),
  constraint hr_external_operation_documents_note_chk check (
    examination_note is null or char_length(btrim(examination_note)) between 10 and 1000),
  constraint hr_external_operation_documents_replace_chk check (is_current = (replaced_at is null))
);

create index if not exists hr_external_operation_documents_op_idx on public.hr_external_operation_documents (operation_id);

-- Version bookkeeping is set by the database, never by the caller.
create or replace function public.hr_external_operation_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.hr_external_operations%rowtype;
begin
  if new.supersedes_id is null then
    new.root_id := new.id;
    new.version_no := 1;
  else
    select * into p from public.hr_external_operations where id = new.supersedes_id;
    if not found then
      raise exception 'Version précédente introuvable.' using errcode = 'foreign_key_violation';
    end if;
    new.root_id := p.root_id;
    new.version_no := p.version_no + 1;
  end if;
  new.status := 'ACTIVE';
  new.confirmed_by := null;
  new.confirmed_at := null;
  new.withdrawn_by := null;
  new.withdrawn_at := null;
  new.withdrawn_reason := null;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists trg_hr_external_operations_insert on public.hr_external_operations;
create trigger trg_hr_external_operations_insert
  before insert on public.hr_external_operations
  for each row execute function public.hr_external_operation_insert();

-- Content is immutable; only the confirmation (once) and the status (withdrawal, replacement) move.
create or replace function public.hr_external_operation_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Opération externe : suppression interdite (retrait justifié uniquement).' using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - array['status', 'confirmed_by', 'confirmed_at', 'withdrawn_by', 'withdrawn_at', 'withdrawn_reason'])
     is distinct from
     (to_jsonb(old) - array['status', 'confirmed_by', 'confirmed_at', 'withdrawn_by', 'withdrawn_at', 'withdrawn_reason']) then
    raise exception 'Opération externe : contenu non modifiable (une correction crée une nouvelle version).'
      using errcode = 'check_violation';
  end if;
  if old.status <> 'ACTIVE' then
    raise exception 'Opération externe %: enregistrement définitif.', old.status using errcode = 'check_violation';
  end if;
  if old.confirmed_at is not null
     and (new.confirmed_by, new.confirmed_at) is distinct from (old.confirmed_by, old.confirmed_at) then
    raise exception 'Confirmation de l''enregistrement déjà faite : non modifiable.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_external_operations_guard on public.hr_external_operations;
create trigger trg_hr_external_operations_guard
  before update or delete on public.hr_external_operations
  for each row execute function public.hr_external_operation_guard();

create or replace function public.hr_external_document_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Pièce justificative : suppression interdite (remplacement uniquement).' using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - array['is_current', 'replaced_by', 'replaced_at', 'examined_by', 'examined_at', 'examination_note'])
     is distinct from
     (to_jsonb(old) - array['is_current', 'replaced_by', 'replaced_at', 'examined_by', 'examined_at', 'examination_note']) then
    raise exception 'Pièce justificative : fichier et métadonnées non modifiables.' using errcode = 'check_violation';
  end if;
  if not old.is_current then
    raise exception 'Pièce remplacée : enregistrement définitif.' using errcode = 'check_violation';
  end if;
  if old.examined_at is not null
     and (new.examined_by, new.examined_at, new.examination_note)
         is distinct from (old.examined_by, old.examined_at, old.examination_note) then
    raise exception 'Examen de la pièce déjà enregistré : non modifiable.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_external_documents_guard on public.hr_external_operation_documents;
create trigger trg_hr_external_documents_guard
  before update or delete on public.hr_external_operation_documents
  for each row execute function public.hr_external_document_guard();

drop trigger if exists trg_hr_external_operations_audit on public.hr_external_operations;
create trigger trg_hr_external_operations_audit
  after insert or update or delete on public.hr_external_operations
  for each row execute function public.sys_audit_row_change();

drop trigger if exists trg_hr_external_documents_audit on public.hr_external_operation_documents;
create trigger trg_hr_external_documents_audit
  after insert or update or delete on public.hr_external_operation_documents
  for each row execute function public.sys_audit_row_change();

alter table public.hr_external_operations enable row level security;
alter table public.hr_external_operation_documents enable row level security;

drop policy if exists hr_external_operations_read on public.hr_external_operations;
create policy hr_external_operations_read on public.hr_external_operations
  for select to authenticated using (public.erp_has_perm('hr_external_operations', 'read'));

drop policy if exists hr_external_documents_read on public.hr_external_operation_documents;
create policy hr_external_documents_read on public.hr_external_operation_documents
  for select to authenticated using (public.erp_has_perm('hr_external_operations', 'read'));

revoke insert, update, delete, truncate on public.hr_external_operations from anon, authenticated;
revoke insert, update, delete, truncate on public.hr_external_operation_documents from anon, authenticated;
revoke all on public.hr_external_operations from anon;
revoke all on public.hr_external_operation_documents from anon;

-- Private bucket: <operation root id>/<uuid>.<ext>; files are never replaced nor deleted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hr-external-docs', 'hr-external-docs', false, 15728640,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.hr_external_op_upload_allowed(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.erp_has_perm('hr_external_operations', 'create'::public.rbac_action)
     and exists (
       select 1 from public.hr_external_operations o
       where o.root_id::text = p_folder and o.status = 'ACTIVE'
     );
$$;

drop policy if exists hr_external_docs_select on storage.objects;
create policy hr_external_docs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'hr-external-docs' and public.erp_has_perm('hr_external_operations', 'read'));

drop policy if exists hr_external_docs_insert on storage.objects;
create policy hr_external_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'hr-external-docs'
    and public.hr_external_op_upload_allowed((storage.foldername(name))[1])
  );

-- ---------------------------------------------------------------------------
-- 4. External operations: read helpers and write functions
-- ---------------------------------------------------------------------------
-- Every version counts, whatever its status: withdrawing or correcting an entry never lifts a block.
create or replace function public.hr_external_ops_json(p_kind text, p_from date, p_to date, p_site uuid, p_employees uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'root_id', o.root_id,
    'version_no', o.version_no,
    'kind', o.kind,
    'subtype', o.subtype,
    'period_from', o.period_from,
    'period_to', o.period_to,
    'sites', case when o.site_ids is null then null else (
      select jsonb_agg(s.name_fr order by s.name_fr) from public.ref_sites s where s.id = any(o.site_ids)) end,
    'employee_count', cardinality(o.employee_ids),
    'operation_date', o.operation_date,
    'reference', o.reference,
    'organism', o.organism,
    'total_amount', o.total_amount,
    'source', o.source,
    'description', o.description,
    'status', o.status,
    'withdrawn_reason', o.withdrawn_reason,
    'withdrawn_at', o.withdrawn_at,
    'declared_by', (select u.full_name from public.sys_users u where u.id = o.created_by),
    'declared_at', o.created_at,
    'confirmed_by', (select u.full_name from public.sys_users u where u.id = o.confirmed_by),
    'confirmed_at', o.confirmed_at,
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', dd.id,
        'file_name', dd.file_name,
        'sha256', dd.sha256,
        'is_current', dd.is_current,
        'uploaded_by', (select u.full_name from public.sys_users u where u.id = dd.uploaded_by),
        'uploaded_at', dd.uploaded_at,
        'examined_by', (select u.full_name from public.sys_users u where u.id = dd.examined_by),
        'examined_at', dd.examined_at,
        'examination_note', dd.examination_note) order by dd.uploaded_at, dd.id)
      from public.hr_external_operation_documents dd where dd.operation_id = o.id), '[]'::jsonb)
  ) order by o.period_from, o.created_at), '[]'::jsonb)
  from public.hr_external_operations o
  where (p_kind is null or o.kind = p_kind)
    and o.period_from <= p_to and o.period_to >= p_from
    and (o.site_ids is null or p_site is null or p_site = any(o.site_ids))
    and (p_employees is null or o.employee_ids is null or o.employee_ids && p_employees);
$$;

create or replace function public.hr_external_ops_digest(p_kind text, p_from date, p_to date, p_site uuid, p_employees uuid[])
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(string_agg(
    o.id::text || ':' || o.status || ':' || coalesce(o.confirmed_at::text, '') || ':' ||
    coalesce((
      select string_agg(dd.id::text || '/' || dd.is_current::text || '/' || coalesce(dd.examined_at::text, ''), ',' order by dd.id)
      from public.hr_external_operation_documents dd where dd.operation_id = o.id), ''),
    ';' order by o.id), '')
  from public.hr_external_operations o
  where (p_kind is null or o.kind = p_kind)
    and o.period_from <= p_to and o.period_to >= p_from
    and (o.site_ids is null or p_site is null or p_site = any(o.site_ids))
    and (p_employees is null or o.employee_ids is null or o.employee_ids && p_employees);
$$;

-- Contributors of an entry: authors of every version and uploaders of every document of the entry.
create or replace function public.hr_external_op_contributors(p_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct x.u) filter (where x.u is not null), '{}'::uuid[])
  from (
    select o2.created_by as u
    from public.hr_external_operations o
    join public.hr_external_operations o2 on o2.root_id = o.root_id
    where o.id = p_id
    union all
    select dd.uploaded_by
    from public.hr_external_operations o
    join public.hr_external_operations o2 on o2.root_id = o.root_id
    join public.hr_external_operation_documents dd on dd.operation_id = o2.id
    where o.id = p_id
  ) x;
$$;

create or replace function public.hr_external_op_save(p_supersedes uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  prev public.hr_external_operations%rowtype;
  v_kind text := upper(btrim(coalesce(p->>'kind', '')));
  v_subtype text := upper(btrim(coalesce(p->>'subtype', '')));
  v_source text := upper(btrim(coalesce(p->>'source', 'DECLARATIVE')));
  v_desc text := btrim(coalesce(p->>'description', ''));
  v_reason text := nullif(btrim(coalesce(p->>'correction_reason', '')), '');
  v_from date;
  v_to date;
  v_op_date date;
  v_amount numeric;
  v_sites uuid[];
  v_emps uuid[];
  v_id uuid;
  n integer;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not public.erp_has_perm('hr_external_operations', 'create'::public.rbac_action) then
    raise exception 'Saisie des opérations externes non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  if v_kind not in ('PAYMENT', 'DECLARATION') then
    raise exception 'Type d''opération invalide (paiement ou déclaration).' using errcode = 'check_violation';
  end if;
  if not ((v_kind = 'PAYMENT' and v_subtype in ('SALARY', 'OTHER'))
          or (v_kind = 'DECLARATION' and v_subtype in ('G50', 'CNAS', 'DAS', 'OTHER'))) then
    raise exception 'Sous-type incompatible avec le type d''opération.' using errcode = 'check_violation';
  end if;
  if v_source not in ('DECLARATIVE', 'DOCUMENT') then
    raise exception 'Origine de l''information invalide.' using errcode = 'check_violation';
  end if;
  if char_length(v_desc) < 10 or char_length(v_desc) > 1000 then
    raise exception 'Description obligatoire (10 à 1000 caractères).' using errcode = 'check_violation';
  end if;
  begin
    v_from := date_trunc('month', (p->>'period_from')::date)::date;
    v_to := date_trunc('month', coalesce(nullif(p->>'period_to', ''), p->>'period_from')::date)::date;
    v_op_date := nullif(p->>'operation_date', '')::date;
    v_amount := nullif(p->>'total_amount', '')::numeric;
  exception when others then
    raise exception 'Période, date ou montant invalide.' using errcode = 'check_violation';
  end;
  if v_from is null or v_to is null or v_to < v_from or v_to >= (v_from + interval '12 months')::date then
    raise exception 'Période invalide (12 mois au plus).' using errcode = 'check_violation';
  end if;
  if v_amount is not null and v_amount < 0 then
    raise exception 'Montant négatif interdit.' using errcode = 'check_violation';
  end if;
  begin
    if jsonb_typeof(p->'site_ids') = 'array' and jsonb_array_length(p->'site_ids') > 0 then
      select array_agg(distinct x::uuid) into v_sites from jsonb_array_elements_text(p->'site_ids') x;
    end if;
    if jsonb_typeof(p->'employee_ids') = 'array' and jsonb_array_length(p->'employee_ids') > 0 then
      select array_agg(distinct x::uuid) into v_emps from jsonb_array_elements_text(p->'employee_ids') x;
    end if;
  exception when others then
    raise exception 'Chantier ou salarié invalide.' using errcode = 'check_violation';
  end;
  if v_sites is not null then
    select count(*) into n from public.ref_sites where id = any(v_sites);
    if n <> cardinality(v_sites) then
      raise exception 'Chantier inconnu.' using errcode = 'foreign_key_violation';
    end if;
  end if;
  if v_emps is not null then
    select count(*) into n from public.hr_employees where id = any(v_emps);
    if n <> cardinality(v_emps) then
      raise exception 'Salarié inconnu.' using errcode = 'foreign_key_violation';
    end if;
  end if;

  if p_supersedes is not null then
    select * into prev from public.hr_external_operations where id = p_supersedes for update;
    if not found then
      raise exception 'Opération externe introuvable.' using errcode = 'no_data_found';
    end if;
    if prev.status <> 'ACTIVE' then
      raise exception 'Seule une opération externe active peut être corrigée.' using errcode = 'check_violation';
    end if;
    if v_reason is null or char_length(v_reason) < 10 or char_length(v_reason) > 500 then
      raise exception 'Motif de la correction obligatoire (10 à 500 caractères).' using errcode = 'check_violation';
    end if;
  else
    v_reason := null;
  end if;

  insert into public.hr_external_operations (
    supersedes_id, kind, subtype, period_from, period_to, site_ids, employee_ids, operation_date, reference,
    organism, total_amount, source, description, correction_reason, created_by
  ) values (
    p_supersedes, v_kind, v_subtype, v_from, v_to, v_sites, v_emps, v_op_date,
    nullif(btrim(coalesce(p->>'reference', '')), ''), nullif(btrim(coalesce(p->>'organism', '')), ''),
    v_amount, v_source, v_desc, v_reason, v_uid
  )
  returning id into v_id;

  if p_supersedes is not null then
    update public.hr_external_operations set status = 'SUPERSEDED' where id = p_supersedes;
    -- The new version keeps the current documents, but not their examination: it must be examined again.
    insert into public.hr_external_operation_documents (
      operation_id, storage_path, file_name, mime_type, size_bytes, sha256, uploaded_by, uploaded_at, copied_from
    )
    select v_id, dd.storage_path, dd.file_name, dd.mime_type, dd.size_bytes, dd.sha256, dd.uploaded_by, dd.uploaded_at, dd.id
    from public.hr_external_operation_documents dd
    where dd.operation_id = p_supersedes and dd.is_current;
  end if;
  return v_id;
end;
$$;

create or replace function public.hr_external_op_confirm(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  o public.hr_external_operations%rowtype;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not public.erp_has_perm('hr_external_operations_confirm', 'update'::public.rbac_action) then
    raise exception 'Confirmation de l''enregistrement non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  select * into o from public.hr_external_operations where id = p_id for update;
  if not found then
    raise exception 'Opération externe introuvable.' using errcode = 'no_data_found';
  end if;
  if o.status <> 'ACTIVE' then
    raise exception 'Opération externe %: confirmation impossible.', o.status using errcode = 'check_violation';
  end if;
  if o.confirmed_at is not null then
    raise exception 'Enregistrement déjà confirmé.' using errcode = 'check_violation';
  end if;
  if not public.erp_is_super_admin(v_uid) and v_uid = any (public.hr_external_op_contributors(o.id)) then
    raise exception 'Séparation des tâches : vous avez contribué à cette entrée (saisie, correction ou pièce) ; une autre personne habilitée doit confirmer l''enregistrement.'
      using errcode = 'insufficient_privilege';
  end if;
  update public.hr_external_operations set confirmed_by = v_uid, confirmed_at = now() where id = o.id;
end;
$$;

create or replace function public.hr_external_op_withdraw(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  o public.hr_external_operations%rowtype;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not public.erp_has_perm('hr_external_operations', 'update'::public.rbac_action) then
    raise exception 'Retrait des opérations externes non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    raise exception 'Motif du retrait obligatoire (10 à 500 caractères).' using errcode = 'check_violation';
  end if;
  select * into o from public.hr_external_operations where id = p_id for update;
  if not found then
    raise exception 'Opération externe introuvable.' using errcode = 'no_data_found';
  end if;
  if o.status <> 'ACTIVE' then
    raise exception 'Opération externe %: retrait impossible.', o.status using errcode = 'check_violation';
  end if;
  update public.hr_external_operations set
    status = 'WITHDRAWN', withdrawn_by = v_uid, withdrawn_at = now(), withdrawn_reason = v_reason
  where id = o.id;
end;
$$;

create or replace function public.hr_external_op_add_document(
  p_op uuid,
  p_path text,
  p_name text,
  p_mime text,
  p_size bigint,
  p_sha256 text,
  p_replaces uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  o public.hr_external_operations%rowtype;
  v_old public.hr_external_operation_documents%rowtype;
  v_stored bigint;
  v_id uuid;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not public.erp_has_perm('hr_external_operations', 'create'::public.rbac_action) then
    raise exception 'Ajout de pièce non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  select * into o from public.hr_external_operations where id = p_op for update;
  if not found then
    raise exception 'Opération externe introuvable.' using errcode = 'no_data_found';
  end if;
  if o.status <> 'ACTIVE' then
    raise exception 'Opération externe %: ajout de pièce impossible.', o.status using errcode = 'check_violation';
  end if;
  if split_part(coalesce(p_path, ''), '/', 1) <> o.root_id::text then
    raise exception 'Chemin de pièce invalide.' using errcode = 'check_violation';
  end if;
  select (so.metadata->>'size')::bigint into v_stored
  from storage.objects so
  where so.bucket_id = 'hr-external-docs' and so.name = p_path;
  if not found then
    raise exception 'Pièce non reçue : réessayez l''envoi.' using errcode = 'no_data_found';
  end if;
  if v_stored is not null and v_stored <> p_size then
    raise exception 'Taille de la pièce différente du fichier reçu.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.hr_external_operation_documents dd where dd.storage_path = p_path) then
    raise exception 'Pièce déjà enregistrée.' using errcode = 'unique_violation';
  end if;
  if p_replaces is not null then
    select * into v_old from public.hr_external_operation_documents
    where id = p_replaces and operation_id = o.id and is_current
    for update;
    if not found then
      raise exception 'Pièce à remplacer introuvable ou déjà remplacée.' using errcode = 'no_data_found';
    end if;
  end if;
  insert into public.hr_external_operation_documents (
    operation_id, storage_path, file_name, mime_type, size_bytes, sha256, uploaded_by
  ) values (o.id, p_path, btrim(p_name), p_mime, p_size, lower(p_sha256), v_uid)
  returning id into v_id;
  if p_replaces is not null then
    update public.hr_external_operation_documents set
      is_current = false, replaced_by = v_id, replaced_at = now()
    where id = p_replaces;
  end if;
  return v_id;
end;
$$;

create or replace function public.hr_external_op_examine(p_doc uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_note text := btrim(coalesce(p_note, ''));
  dd public.hr_external_operation_documents%rowtype;
  o public.hr_external_operations%rowtype;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not public.erp_has_perm('hr_external_operations_examine', 'update'::public.rbac_action) then
    raise exception 'Examen des pièces non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_note) < 10 or char_length(v_note) > 1000 then
    raise exception 'Observation obligatoire (10 à 1000 caractères).' using errcode = 'check_violation';
  end if;
  select * into dd from public.hr_external_operation_documents where id = p_doc for update;
  if not found then
    raise exception 'Pièce introuvable.' using errcode = 'no_data_found';
  end if;
  if not dd.is_current then
    raise exception 'Pièce remplacée : examinez la pièce actuelle.' using errcode = 'check_violation';
  end if;
  if dd.examined_at is not null then
    raise exception 'Pièce déjà examinée.' using errcode = 'check_violation';
  end if;
  select * into o from public.hr_external_operations where id = dd.operation_id;
  if o.status <> 'ACTIVE' then
    raise exception 'Opération externe %: examen impossible.', o.status using errcode = 'check_violation';
  end if;
  if not public.erp_is_super_admin(v_uid) and v_uid = any (public.hr_external_op_contributors(o.id)) then
    raise exception 'Séparation des tâches : vous avez contribué à cette entrée (saisie, correction ou pièce) ; une autre personne habilitée doit examiner la pièce.'
      using errcode = 'insufficient_privilege';
  end if;
  update public.hr_external_operation_documents set
    examined_by = v_uid, examined_at = now(), examination_note = v_note
  where id = dd.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Declaration exports register (files produced by the application)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_declaration_exports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('monthly', 'das', 'cnas_file', 'das_file', 'g50')),
  nature text not null check (nature in ('OFFICIAL', 'CONTROL')),
  period_year integer not null check (period_year between 2000 and 2100),
  period_month integer check (period_month between 1 and 12),
  site_id uuid references public.ref_sites(id),
  months integer[] not null check (cardinality(months) between 1 and 12),
  excluded_months integer[] not null default '{}',
  file_name text not null check (char_length(file_name) between 1 and 200),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size > 0),
  slip_count integer not null check (slip_count >= 0),
  totals jsonb not null default '{}'::jsonb,
  payroll_status text not null check (payroll_status in ('FINAL', 'PROVISIONAL')),
  double_declaration_risk boolean not null default false,
  decision_id uuid references public.sys_decisions(id),
  created_by uuid not null default auth.uid() references public.sys_users(id),
  created_at timestamptz not null default now(),
  constraint hr_declaration_exports_period_chk check ((kind in ('das', 'das_file')) = (period_month is null))
);

create index if not exists hr_declaration_exports_period_idx on public.hr_declaration_exports (period_year, period_month);

create or replace function public.hr_declaration_export_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Registre des exports de déclaration : enregistrement définitif.' using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_hr_declaration_exports_guard on public.hr_declaration_exports;
create trigger trg_hr_declaration_exports_guard
  before update or delete on public.hr_declaration_exports
  for each row execute function public.hr_declaration_export_guard();

drop trigger if exists trg_hr_declaration_exports_audit on public.hr_declaration_exports;
create trigger trg_hr_declaration_exports_audit
  after insert or update or delete on public.hr_declaration_exports
  for each row execute function public.sys_audit_row_change();

alter table public.hr_declaration_exports enable row level security;
drop policy if exists hr_declaration_exports_read on public.hr_declaration_exports;
create policy hr_declaration_exports_read on public.hr_declaration_exports
  for select to authenticated using (public.erp_can_read_hr_salary());
revoke insert, update, delete, truncate on public.hr_declaration_exports from anon, authenticated;
revoke all on public.hr_declaration_exports from anon;

create or replace function public.hr_declaration_exports_json(p_year integer, p_months integer[], p_site uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'kind', e.kind,
    'nature', e.nature,
    'period_year', e.period_year,
    'period_month', e.period_month,
    'site_name', coalesce((select s.name_fr from public.ref_sites s where s.id = e.site_id), 'Tous les chantiers'),
    'months', to_jsonb(e.months),
    'excluded_months', to_jsonb(e.excluded_months),
    'file_name', e.file_name,
    'sha256', e.sha256,
    'payroll_status', e.payroll_status,
    'double_declaration_risk', e.double_declaration_risk,
    'decision_id', e.decision_id,
    'created_by', (select u.full_name from public.sys_users u where u.id = e.created_by),
    'created_at', e.created_at) order by e.created_at), '[]'::jsonb)
  from public.hr_declaration_exports e
  where e.period_year = p_year
    and e.months && p_months
    and (e.site_id is null or p_site is null or e.site_id = p_site);
$$;

-- ---------------------------------------------------------------------------
-- 6. Transfers: D9 guard (reprise, already paid, external payment), atomic batch creation
-- ---------------------------------------------------------------------------
alter table public.hr_payroll_transfer_batches
  add column if not exists decision_id uuid references public.sys_decisions(id),
  add column if not exists double_payment_risk boolean not null default false;
alter table public.hr_payroll_transfer_lines
  add column if not exists decision_id uuid references public.sys_decisions(id);

-- A D9 line may coexist with the executed line it knowingly pays again; ordinary lines stay unique per slip.
drop index if exists public.hr_payroll_transfer_lines_live_slip_uq;
create unique index if not exists hr_payroll_transfer_lines_live_slip_uq
  on public.hr_payroll_transfer_lines (slip_id) where is_live and decision_id is null;
create index if not exists hr_payroll_transfer_lines_employee_idx on public.hr_payroll_transfer_lines (employee_id);

create or replace function public.hr_transfer_decision_flag()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('hr.transfer_decision', true), '')::uuid;
$$;

-- Reasons are cumulative: a reprise month stays a reprise month, an executed batch is never cancelled and an
-- external entry is never deleted (withdrawn or corrected entries still count).
create or replace function public.hr_transfer_d9_reasons(p_slip uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_remove(array[
    case when public.sys_period_nature(r.period_year, r.period_month) = 'EXTERNAL' then 'EXTERNAL_PERIOD' end,
    case when exists (
      select 1
      from public.hr_payroll_transfer_lines l
      join public.hr_payroll_transfer_batches b on b.id = l.batch_id
      where b.status_code = 'EXECUTED' and l.employee_id = s.employee_id
        and b.period_year = r.period_year and b.period_month = r.period_month
    ) then 'ALREADY_PAID' end,
    case when exists (
      select 1 from public.hr_external_operations o
      where o.kind = 'PAYMENT'
        and make_date(r.period_year, r.period_month, 1) between o.period_from and o.period_to
        and (o.site_ids is null or r.site_id is null or r.site_id = any(o.site_ids))
        and (o.employee_ids is null or s.employee_id = any(o.employee_ids))
    ) then 'EXTERNAL_PAYMENT' end
  ], null), '{}'::text[])
  from public.hr_payroll_slips s
  join public.hr_payroll_runs r on r.id = s.run_id
  where s.id = p_slip;
$$;

create or replace function public.hr_transfer_reason_labels(p text[])
returns text
language sql
immutable
as $$
  select string_agg(case x
    when 'EXTERNAL_PERIOD' then 'paie de reprise payée hors de l''application'
    when 'ALREADY_PAID' then 'salaire du mois déjà viré par un lot exécuté'
    when 'EXTERNAL_PAYMENT' then 'paiement externe enregistré'
    else x end, ', ')
  from unnest(p) as x;
$$;

create or replace function public.hr_transfer_block_reasons(p_slips uuid[])
returns table (slip_id uuid, reasons text[])
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.erp_can_read_hr_salary() then
    raise exception 'Lecture des virements non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  if cardinality(p_slips) > 5000 then
    raise exception 'Trop de bulletins (5000 au plus).' using errcode = 'check_violation';
  end if;
  return query
  select x.id, coalesce(public.hr_transfer_d9_reasons(x.id), '{}'::text[])
  from unnest(p_slips) as x(id);
end;
$$;

create or replace function public.hr_transfer_line_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slip_status text;
  v_slip_employee uuid;
  v_batch_status text;
  v_batch_decision uuid;
  v_reasons text[];
  d public.sys_decisions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('hr_transfer_slip:' || new.slip_id::text, 0));
  select s.status_code, s.employee_id into v_slip_status, v_slip_employee
  from public.hr_payroll_slips s where s.id = new.slip_id;
  if v_slip_status is null or v_slip_status = 'DRAFT' then
    raise exception 'Bulletin non validé : virement impossible.' using errcode = 'check_violation';
  end if;
  select b.status_code, b.decision_id into v_batch_status, v_batch_decision
  from public.hr_payroll_transfer_batches b where b.id = new.batch_id;
  if v_batch_status is distinct from 'GENERATED' then
    raise exception 'Lot % : lignes figées.', v_batch_status using errcode = 'check_violation';
  end if;
  if new.employee_id is distinct from v_slip_employee then
    raise exception 'Ligne de virement : salarié différent de celui du bulletin.' using errcode = 'check_violation';
  end if;
  if new.decision_id is distinct from v_batch_decision then
    raise exception 'Ligne de virement : décision D9 différente de celle du lot.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1
    from public.hr_payroll_transfer_lines l
    join public.hr_payroll_transfer_batches b on b.id = l.batch_id
    where l.slip_id = new.slip_id and l.is_live and b.status_code in ('GENERATED', 'DEPOSITED')
  ) then
    raise exception 'Bulletin déjà inclus dans un lot de virement en cours (généré ou déposé).' using errcode = 'unique_violation';
  end if;

  v_reasons := coalesce(public.hr_transfer_d9_reasons(new.slip_id), '{}'::text[]);
  if cardinality(v_reasons) > 0 then
    if new.decision_id is null then
      raise exception 'Virement bloqué : décision D9 requise (%). L''absence de trace dans l''application ne prouve pas que ce salaire n''a pas été payé.',
        public.hr_transfer_reason_labels(v_reasons)
        using errcode = 'insufficient_privilege';
    end if;
    select * into d from public.sys_decisions where id = new.decision_id;
    if d.id is null or d.type_code <> 'D9' or d.status <> 'DECIDED' or d.chosen_option <> 'REAL_BATCH'
       or public.hr_transfer_decision_flag() is distinct from d.id
       or not ((d.scope->'slip_ids') ? new.slip_id::text) then
      raise exception 'Virement bloqué : la décision D9 ne couvre pas ce bulletin ou n''est pas en cours d''exécution.'
        using errcode = 'insufficient_privilege';
    end if;
  elsif new.decision_id is not null then
    raise exception 'Décision D9 inutile pour ce bulletin : il se vire par un lot ordinaire.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function public.hr_transfer_batch_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.decision_id is not null and public.hr_transfer_decision_flag() is distinct from new.decision_id then
    raise exception 'Lot sous décision D9 : création uniquement en exécution de la décision (écran Virements).'
      using errcode = 'insufficient_privilege';
  end if;
  new.double_payment_risk := new.decision_id is not null;
  return new;
end;
$$;

drop trigger if exists trg_hr_transfer_batch_insert_guard on public.hr_payroll_transfer_batches;
create trigger trg_hr_transfer_batch_insert_guard
  before insert on public.hr_payroll_transfer_batches
  for each row execute function public.hr_transfer_batch_insert_guard();

-- Same rules as phase 4, plus the D9 link and the double-payment mark are immutable.
create or replace function public.hr_transfer_batch_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un lot de virement ne se supprime pas : annulez-le.' using errcode = 'check_violation';
  end if;
  if new.content is distinct from old.content or new.sha256 is distinct from old.sha256
     or new.total_amount is distinct from old.total_amount or new.line_count is distinct from old.line_count
     or new.mode is distinct from old.mode or new.batch_no is distinct from old.batch_no
     or new.period_year is distinct from old.period_year or new.period_month is distinct from old.period_month
     or new.decision_id is distinct from old.decision_id or new.double_payment_risk is distinct from old.double_payment_risk then
    raise exception 'Fichier de virement figé : annulez le lot et régénérez-le.' using errcode = 'check_violation';
  end if;
  if new.status_code is distinct from old.status_code then
    if not (
      (old.status_code = 'GENERATED' and new.status_code in ('DEPOSITED', 'CANCELLED'))
      or (old.status_code = 'DEPOSITED' and new.status_code in ('EXECUTED', 'CANCELLED', 'GENERATED'))
    ) then
      raise exception 'Transition % -> % interdite.', old.status_code, new.status_code using errcode = 'check_violation';
    end if;
    if new.status_code = 'DEPOSITED' then
      if coalesce(trim(new.deposit_ref), '') = '' then
        raise exception 'Référence de dépôt obligatoire.' using errcode = 'check_violation';
      end if;
      new.deposit_date := coalesce(new.deposit_date, current_date);
      new.deposited_by := coalesce(auth.uid(), new.deposited_by);
    end if;
    if new.status_code = 'GENERATED' then
      new.deposit_ref := null;
      new.deposit_date := null;
      new.deposited_by := null;
    end if;
    if new.status_code = 'EXECUTED' then
      new.executed_at := now();
    end if;
    if new.status_code = 'CANCELLED' and coalesce(trim(new.cancelled_reason), '') = '' then
      raise exception 'Motif d''annulation obligatoire.' using errcode = 'check_violation';
    end if;
  elsif old.status_code in ('EXECUTED', 'CANCELLED')
        and (to_jsonb(new) - 'updated_at' - 'notes') is distinct from (to_jsonb(old) - 'updated_at' - 'notes') then
    raise exception 'Lot % : modification impossible.', old.status_code using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function public.hr_transfer_d9_context(p_scope jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with sc as (
    select (p_scope->>'year')::integer as y,
           (p_scope->>'month')::integer as m,
           nullif(p_scope->>'site_id', '')::uuid as site,
           p_scope->>'mode' as mode,
           array(select x::uuid from jsonb_array_elements_text(p_scope->'slip_ids') as x) as ids
  ),
  sl as (
    select s.id, s.employee_id, s.net_payable, s.status_code, e.matricule,
           trim(coalesce(e.last_name, '') || ' ' || coalesce(e.first_name, '')) as name
    from sc
    join public.hr_payroll_slips s on s.id = any (sc.ids)
    join public.hr_employees e on e.id = s.employee_id
  ),
  tb as (
    select b.id, b.batch_no, b.status_code, b.mode, b.executed_at, b.double_payment_risk, b.decision_id,
           count(l.id) as lines, coalesce(sum(l.amount), 0) as amount
    from sc
    join public.hr_payroll_transfer_batches b on b.period_year = sc.y and b.period_month = sc.m
    join public.hr_payroll_transfer_lines l on l.batch_id = b.id
    where l.employee_id in (select employee_id from sl)
    group by b.id
  )
  select jsonb_build_object(
    'period', public.sys_period_label(sc.y, sc.m),
    'period_nature', public.sys_period_nature(sc.y, sc.m),
    'site_name', coalesce((select s.name_fr from public.ref_sites s where s.id = sc.site), 'Tous les chantiers'),
    'mode', sc.mode,
    'slip_count', (select count(*) from sl),
    'net_total', (select coalesce(sum(net_payable), 0) from sl),
    'slips', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slip_id', sl.id, 'matricule', sl.matricule, 'employee', sl.name, 'net_payable', sl.net_payable,
        'status', sl.status_code,
        'reasons', to_jsonb(coalesce(public.hr_transfer_d9_reasons(sl.id), '{}'::text[]))) order by sl.matricule)
      from sl), '[]'::jsonb),
    'internal_transfers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'batch_no', tb.batch_no, 'status', tb.status_code, 'mode', tb.mode, 'lines', tb.lines, 'amount', tb.amount,
        'executed_at', tb.executed_at, 'double_payment_risk', tb.double_payment_risk, 'decision_id', tb.decision_id)
        order by tb.batch_no)
      from tb), '[]'::jsonb),
    'external_operations', public.hr_external_ops_json(
      'PAYMENT', make_date(sc.y, sc.m, 1), make_date(sc.y, sc.m, 1), sc.site, (select array_agg(employee_id) from sl))
  )
  from sc;
$$;

create or replace function public.hr_transfer_d9_fingerprint(p_scope jsonb)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with sc as (
    select (p_scope->>'year')::integer as y,
           (p_scope->>'month')::integer as m,
           nullif(p_scope->>'site_id', '')::uuid as site,
           array(select x::uuid from jsonb_array_elements_text(p_scope->'slip_ids') as x) as ids
  ),
  sl as (
    select s.id, s.employee_id, s.net_payable, s.status_code
    from sc join public.hr_payroll_slips s on s.id = any (sc.ids)
  )
  select md5(concat_ws('|',
    (select string_agg(sl.id::text || ':' || sl.status_code || ':' || sl.net_payable::text, ',' order by sl.id) from sl),
    (select string_agg(b.id::text || ':' || b.status_code, ',' order by b.id)
     from public.hr_payroll_transfer_batches b
     where b.period_year = sc.y and b.period_month = sc.m
       and exists (
         select 1 from public.hr_payroll_transfer_lines l
         where l.batch_id = b.id and l.employee_id in (select employee_id from sl))),
    public.hr_external_ops_digest(
      'PAYMENT', make_date(sc.y, sc.m, 1), make_date(sc.y, sc.m, 1), sc.site, (select array_agg(employee_id) from sl))
  ))
  from sc;
$$;

create or replace function public.hr_transfer_request_d9(
  p_year integer,
  p_month integer,
  p_site uuid,
  p_mode text,
  p_slips uuid[],
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_ids uuid[];
  v_scope jsonb;
  v_key text;
  v_existing uuid;
  v_ctx jsonb;
  v_id uuid;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not public.erp_can_write_hr_salary_values(v_uid) then
    raise exception 'Demande de virement non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  if p_mode is null or p_mode not in ('CCP', 'BANK') then
    raise exception 'Mode de virement invalide.' using errcode = 'check_violation';
  end if;
  if p_year is null or p_year not between 2000 and 2100 or p_month is null or p_month not between 1 and 12 then
    raise exception 'Période invalide.' using errcode = 'check_violation';
  end if;
  select array_agg(distinct x order by x) into v_ids from unnest(p_slips) as x where x is not null;
  if v_ids is null or cardinality(v_ids) > 2000 then
    raise exception 'Liste de bulletins invalide (1 à 2000).' using errcode = 'check_violation';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    raise exception 'Motif de la demande obligatoire (10 à 500 caractères).' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from unnest(v_ids) as x(id)
    left join public.hr_payroll_slips s on s.id = x.id
    left join public.hr_payroll_runs r on r.id = s.run_id
    where s.id is null or r.period_year <> p_year or r.period_month <> p_month
       or (p_site is not null and r.site_id is distinct from p_site)
  ) then
    raise exception 'Bulletin hors du mois ou du chantier demandé.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.hr_payroll_slips s where s.id = any (v_ids) and s.status_code not in ('VALIDATED', 'LOCKED')
  ) then
    raise exception 'Seuls les bulletins validés ou clôturés se virent.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from unnest(v_ids) as x(id) where cardinality(coalesce(public.hr_transfer_d9_reasons(x.id), '{}'::text[])) = 0
  ) then
    raise exception 'Bulletin sans blocage : il se vire par un lot ordinaire, sans décision D9.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1
    from public.hr_payroll_transfer_lines l
    join public.hr_payroll_transfer_batches b on b.id = l.batch_id
    where l.slip_id = any (v_ids) and l.is_live and b.status_code in ('GENERATED', 'DEPOSITED')
  ) then
    raise exception 'Bulletin déjà inclus dans un lot de virement en cours.' using errcode = 'check_violation';
  end if;

  v_scope := jsonb_build_object(
    'year', p_year, 'month', p_month, 'site_id', p_site, 'mode', p_mode, 'slip_ids', to_jsonb(v_ids), 'reason', v_reason);
  v_key := 'D9:' || md5(concat_ws('|', p_year, p_month, coalesce(p_site::text, 'ALL'), p_mode, array_to_string(v_ids, ',')));
  select id into v_existing from public.sys_decisions where dedupe_key = v_key and status in ('PENDING', 'DECIDED');
  if v_existing is not null then
    return v_existing;
  end if;

  v_ctx := public.hr_transfer_d9_context(v_scope) || jsonb_build_object('reason', v_reason);
  insert into public.sys_decisions (
    type_code, dedupe_key, period_year, period_month, site_id, scope, context, options, fingerprint,
    request_source, requested_by
  )
  select 'D9', v_key, p_year, p_month, p_site, v_scope, v_ctx, t.options, public.hr_transfer_d9_fingerprint(v_scope),
         'TRANSFER_PREPARATION', v_uid
  from public.sys_decision_types t
  where t.code = 'D9'
  returning id into v_id;

  perform public.sys_notify(
    'DECISION_PENDING',
    format('Virement bloqué : paie %s — %s (%s bulletin(s))', v_ctx->>'period', v_ctx->>'site_name', cardinality(v_ids)),
    case when v_ctx->>'period_nature' = 'EXTERNAL'
      then 'Paie de reprise, déjà payée hors de l''application : risque de double paiement. Aucun virement sans votre décision.'
      else 'Salaire déjà viré ou payé hors de l''application selon les registres : risque de double paiement. Aucun virement sans votre décision.' end,
    '/decisions/' || v_id,
    null,
    'decision_payroll_transfer',
    v_id
  );
  return v_id;
end;
$$;

create or replace function public.hr_transfer_batch_create(p_batch jsonb, p_lines jsonb, p_decision uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  d public.sys_decisions%rowtype;
  v_year integer;
  v_month integer;
  v_site uuid;
  v_mode text := p_batch->>'mode';
  v_content text := p_batch->>'content';
  v_ids uuid[];
  v_count integer;
  v_total numeric(14, 2);
  v_batch uuid;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not public.erp_can_write_hr_salary_values(v_uid) then
    raise exception 'Virements non autorisés.' using errcode = 'insufficient_privilege';
  end if;
  begin
    v_year := (p_batch->>'period_year')::integer;
    v_month := (p_batch->>'period_month')::integer;
    v_site := nullif(p_batch->>'site_id', '')::uuid;
  exception when others then
    raise exception 'Lot invalide (période ou chantier).' using errcode = 'check_violation';
  end;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Lot vide.' using errcode = 'check_violation';
  end if;
  if v_content is null or encode(sha256(convert_to(v_content, 'UTF8')), 'hex') is distinct from p_batch->>'sha256' then
    raise exception 'Empreinte du fichier invalide.' using errcode = 'check_violation';
  end if;
  select count(*), sum((x->>'amount')::numeric), array_agg((x->>'slip_id')::uuid order by (x->>'slip_id')::uuid)
    into v_count, v_total, v_ids
  from jsonb_array_elements(p_lines) as x;
  if v_count is distinct from (p_batch->>'line_count')::integer
     or v_total is distinct from (p_batch->>'total_amount')::numeric then
    raise exception 'Nombre de lignes ou total incohérent avec le fichier.' using errcode = 'check_violation';
  end if;
  if (select count(distinct u) from unnest(v_ids) as u) <> v_count then
    raise exception 'Bulletin en double dans le lot.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_lines) as x
    left join public.hr_payroll_slips s on s.id = (x->>'slip_id')::uuid
    left join public.hr_payroll_runs r on r.id = s.run_id
    where s.id is null or r.period_year <> v_year or r.period_month <> v_month
       or (v_site is not null and r.site_id is distinct from v_site)
       or s.net_payable is distinct from (x->>'amount')::numeric
  ) then
    raise exception 'Ligne de virement incohérente avec le bulletin (mois, chantier ou net à payer).' using errcode = 'check_violation';
  end if;

  if p_decision is not null then
    select * into d from public.sys_decisions where id = p_decision for update;
    if not found or d.type_code <> 'D9' or d.status <> 'DECIDED' or d.chosen_option <> 'REAL_BATCH' then
      raise exception 'Décision D9 « lot de virement réel » requise (décidée, non encore utilisée).' using errcode = 'insufficient_privilege';
    end if;
    if v_uid is distinct from d.decided_by and v_uid is distinct from d.requested_by and not public.erp_is_super_admin(v_uid) then
      raise exception 'Seuls le demandeur, le décideur ou le SUPER_ADMIN exécutent cette décision.' using errcode = 'insufficient_privilege';
    end if;
    if (d.scope->>'year')::integer <> v_year or (d.scope->>'month')::integer <> v_month
       or d.scope->>'mode' is distinct from v_mode or nullif(d.scope->>'site_id', '')::uuid is distinct from v_site then
      raise exception 'Lot différent du périmètre de la décision D9 (mois, chantier ou mode).' using errcode = 'check_violation';
    end if;
    if array(select x::uuid from jsonb_array_elements_text(d.scope->'slip_ids') as x order by 1) is distinct from v_ids then
      raise exception 'Le lot doit contenir exactement les bulletins de la décision D9.' using errcode = 'check_violation';
    end if;
    if public.hr_transfer_d9_fingerprint(d.scope) is distinct from d.fingerprint then
      perform public.sys_decision_close_internal(d.id, 'INVALIDATED',
        'Données modifiées depuis la décision D9 (bulletins, virements ou opérations externes) : nouvelle demande nécessaire.');
      return jsonb_build_object('ok', false, 'reason', 'INVALIDATED');
    end if;
    perform set_config('hr.transfer_decision', d.id::text, true);
  end if;

  insert into public.hr_payroll_transfer_batches (
    batch_no, period_year, period_month, site_id, mode, file_format, file_name, content, sha256, line_count,
    total_amount, debit_account, value_date, notes, decision_id, created_by
  ) values (
    p_batch->>'batch_no', v_year, v_month, v_site, v_mode, p_batch->>'file_format', p_batch->>'file_name', v_content,
    p_batch->>'sha256', v_count, v_total, nullif(btrim(coalesce(p_batch->>'debit_account', '')), ''),
    nullif(p_batch->>'value_date', '')::date, nullif(btrim(coalesce(p_batch->>'notes', '')), ''), p_decision, v_uid
  )
  returning id into v_batch;

  insert into public.hr_payroll_transfer_lines (batch_id, slip_id, employee_id, matricule, employee_name, account, amount, decision_id)
  select v_batch, (x->>'slip_id')::uuid, (x->>'employee_id')::uuid, x->>'matricule', x->>'employee_name', x->>'account',
         (x->>'amount')::numeric, p_decision
  from jsonb_array_elements(p_lines) as x;

  if p_decision is not null then
    update public.sys_decisions set
      status = 'EXECUTED',
      executed_by = v_uid,
      executed_at = now(),
      execution_result = jsonb_build_object(
        'operation', 'TRANSFER_BATCH', 'batch_id', v_batch, 'batch_no', p_batch->>'batch_no',
        'lines', v_count, 'total', v_total, 'double_payment_risk', true)
    where id = d.id;
    perform set_config('hr.transfer_decision', '', true);
  end if;
  return jsonb_build_object('ok', true, 'id', v_batch, 'count', v_count, 'total', v_total);
end;
$$;

create or replace function public.hr_transfer_d9_reconciliation(p_decision uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  d public.sys_decisions%rowtype;
  v_ctx jsonb;
  v_rows jsonb;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not public.erp_can_write_hr_salary_values(v_uid) then
    raise exception 'Virements non autorisés.' using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.sys_decisions where id = p_decision for update;
  if not found or d.type_code <> 'D9' or d.status <> 'DECIDED' or d.chosen_option <> 'RECONCILIATION' then
    raise exception 'Décision D9 « état de rapprochement » requise (décidée, non encore utilisée).' using errcode = 'insufficient_privilege';
  end if;
  if v_uid is distinct from d.decided_by and v_uid is distinct from d.requested_by and not public.erp_is_super_admin(v_uid) then
    raise exception 'Seuls le demandeur, le décideur ou le SUPER_ADMIN exécutent cette décision.' using errcode = 'insufficient_privilege';
  end if;
  if public.hr_transfer_d9_fingerprint(d.scope) is distinct from d.fingerprint then
    perform public.sys_decision_close_internal(d.id, 'INVALIDATED',
      'Données modifiées depuis la décision D9 (bulletins, virements ou opérations externes) : nouvelle demande nécessaire.');
    return jsonb_build_object('ok', false, 'reason', 'INVALIDATED');
  end if;

  v_ctx := public.hr_transfer_d9_context(d.scope);
  select coalesce(jsonb_agg(jsonb_build_object(
    'matricule', x->>'matricule',
    'employee', x->>'employee',
    'net_payable', (x->>'net_payable')::numeric,
    'status', x->>'status',
    'reasons', x->'reasons',
    'transferred', coalesce((
      select sum(l.amount)
      from public.hr_payroll_transfer_lines l
      join public.hr_payroll_transfer_batches b on b.id = l.batch_id
      join public.hr_payroll_slips s on s.id = (x->>'slip_id')::uuid
      where b.status_code = 'EXECUTED' and l.employee_id = s.employee_id
        and b.period_year = (d.scope->>'year')::integer and b.period_month = (d.scope->>'month')::integer), 0)
  ) order by x->>'matricule'), '[]'::jsonb)
  into v_rows
  from jsonb_array_elements(v_ctx->'slips') as x;

  update public.sys_decisions set
    status = 'EXECUTED',
    executed_by = v_uid,
    executed_at = now(),
    execution_result = jsonb_build_object(
      'operation', 'RECONCILIATION_STATEMENT', 'slips', jsonb_array_length(v_rows),
      'net_total', v_ctx->'net_total', 'rows_md5', md5(v_rows::text))
  where id = d.id;

  return jsonb_build_object(
    'ok', true, 'decision_id', d.id, 'period', v_ctx->>'period', 'period_nature', v_ctx->>'period_nature',
    'site_name', v_ctx->>'site_name', 'mode', v_ctx->>'mode', 'rows', v_rows,
    'external_operations', v_ctx->'external_operations', 'generated_at', now());
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Declarations: D10 guard on the exports register
-- ---------------------------------------------------------------------------
create or replace function public.hr_declaration_covered_months(p_kind text, p_month integer)
returns integer[]
language sql
immutable
as $$
  select case when p_kind in ('das', 'das_file')
    then array(select generate_series(1, 12))
    else array[p_month] end;
$$;

create or replace function public.hr_declaration_subtypes(p_kind text)
returns text[]
language sql
immutable
as $$
  select case p_kind
    when 'monthly' then array['G50', 'CNAS', 'OTHER']
    when 'cnas_file' then array['CNAS', 'OTHER']
    when 'g50' then array['G50', 'OTHER']
    else array['DAS', 'OTHER'] end;
$$;

create or replace function public.hr_declaration_d10_key(p_kind text, p_year integer, p_month integer, p_site uuid)
returns text
language sql
immutable
as $$
  select 'D10:' || p_kind || ':' || p_year::text || ':' || coalesce(lpad(p_month::text, 2, '0'), 'AN') || ':' ||
         coalesce(p_site::text, 'ALL');
$$;

-- Months of the file that require a D10, with the reasons: {"3": ["EXTERNAL_PERIOD"], "10": ["EXTERNAL_DECLARATION"]}.
create or replace function public.hr_declaration_month_reasons(p_kind text, p_year integer, p_month integer, p_site uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(x.mm::text, to_jsonb(x.rs)), '{}'::jsonb)
  from (
    select g.mm, array_remove(array[
      case when public.sys_period_nature(p_year, g.mm) = 'EXTERNAL' then 'EXTERNAL_PERIOD' end,
      case when exists (
        select 1 from public.hr_external_operations o
        where o.kind = 'DECLARATION'
          and o.subtype = any (public.hr_declaration_subtypes(p_kind))
          and make_date(p_year, g.mm, 1) between o.period_from and o.period_to
          and (o.site_ids is null or p_site is null or p_site = any (o.site_ids))
      ) then 'EXTERNAL_DECLARATION' end
    ], null) as rs
    from unnest(public.hr_declaration_covered_months(p_kind, p_month)) as g(mm)
  ) x
  where cardinality(x.rs) > 0;
$$;

create or replace function public.hr_declaration_d10_months(p_kind text, p_year integer, p_month integer, p_site uuid)
returns integer[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(k::integer order by k::integer), '{}'::integer[])
  from jsonb_object_keys(public.hr_declaration_month_reasons(p_kind, p_year, p_month, p_site)) as k;
$$;

create or replace function public.hr_declaration_d10_context(p_scope jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cov as (
    select p_scope->>'kind' as kind,
           (p_scope->>'year')::integer as y,
           nullif(p_scope->>'month', '')::integer as m,
           nullif(p_scope->>'site_id', '')::uuid as site,
           public.hr_declaration_covered_months(p_scope->>'kind', nullif(p_scope->>'month', '')::integer) as months
  ),
  mo as (
    select g.mm, x.runs, x.validated, z.slips, z.gross, z.irg, z.cnas
    from cov
    cross join unnest(cov.months) as g(mm)
    cross join lateral (
      select count(*) as runs, count(*) filter (where r.status_code in ('VALIDATED', 'LOCKED')) as validated
      from public.hr_payroll_runs r
      where r.period_year = cov.y and r.period_month = g.mm and (cov.site is null or r.site_id = cov.site)
    ) x
    cross join lateral (
      select count(s.id) as slips, coalesce(sum(s.gross_amount), 0) as gross, coalesce(sum(s.irg_amount), 0) as irg,
             coalesce(sum(s.employee_ss + s.employer_ss), 0) as cnas
      from public.hr_payroll_runs r
      join public.hr_payroll_slips s on s.run_id = r.id
      where r.period_year = cov.y and r.period_month = g.mm and (cov.site is null or r.site_id = cov.site)
    ) z
  )
  select jsonb_build_object(
    'kind', cov.kind,
    'period', case when cov.m is null then 'Année ' || cov.y::text else public.sys_period_label(cov.y, cov.m) end,
    'site_name', coalesce((select s.name_fr from public.ref_sites s where s.id = cov.site), 'Tous les chantiers'),
    'covered_months', to_jsonb(cov.months),
    'required_months', to_jsonb(public.hr_declaration_d10_months(cov.kind, cov.y, cov.m, cov.site)),
    'month_reasons', public.hr_declaration_month_reasons(cov.kind, cov.y, cov.m, cov.site),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', mo.mm, 'period', public.sys_period_label(cov.y, mo.mm), 'nature', public.sys_period_nature(cov.y, mo.mm),
        'runs', mo.runs, 'validated', mo.validated, 'slips', mo.slips, 'gross', mo.gross, 'irg', mo.irg, 'cnas', mo.cnas)
        order by mo.mm)
      from mo), '[]'::jsonb),
    'external_operations', public.hr_external_ops_json(
      'DECLARATION',
      make_date(cov.y, (select min(x) from unnest(cov.months) as x), 1),
      make_date(cov.y, (select max(x) from unnest(cov.months) as x), 1),
      cov.site, null),
    'prior_exports', public.hr_declaration_exports_json(cov.y, cov.months, cov.site)
  )
  from cov;
$$;

create or replace function public.hr_declaration_d10_fingerprint(p_scope jsonb)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cov as (
    select p_scope->>'kind' as kind,
           (p_scope->>'year')::integer as y,
           nullif(p_scope->>'month', '')::integer as m,
           nullif(p_scope->>'site_id', '')::uuid as site,
           public.hr_declaration_covered_months(p_scope->>'kind', nullif(p_scope->>'month', '')::integer) as months
  )
  select md5(concat_ws('|',
    array_to_string(public.hr_declaration_d10_months(cov.kind, cov.y, cov.m, cov.site), ','),
    (select string_agg(r.id::text || ':' || r.status_code || ':' || (
              select count(*)::text || '/' || coalesce(sum(s.net_payable), 0)::text || '/' || coalesce(sum(s.gross_amount), 0)::text
              from public.hr_payroll_slips s where s.run_id = r.id), ',' order by r.id)
     from public.hr_payroll_runs r
     where r.period_year = cov.y and r.period_month = any (cov.months) and (cov.site is null or r.site_id = cov.site)),
    public.hr_external_ops_digest(
      'DECLARATION',
      make_date(cov.y, (select min(x) from unnest(cov.months) as x), 1),
      make_date(cov.y, (select max(x) from unnest(cov.months) as x), 1),
      cov.site, null),
    (select count(*)::text from public.hr_declaration_exports e
     where e.period_year = cov.y and e.months && cov.months and (e.site_id is null or cov.site is null or e.site_id = cov.site))
  ))
  from cov;
$$;

create or replace function public.hr_declaration_request_d10(p_kind text, p_year integer, p_month integer, p_site uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_month integer := case when p_kind in ('das', 'das_file') then null else p_month end;
  v_required integer[];
  v_all boolean;
  v_key text;
  v_existing uuid;
  v_scope jsonb;
  v_ctx jsonb;
  v_id uuid;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not public.erp_can_write_hr_salary_values(v_uid) then
    raise exception 'Demande de déclaration non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  if p_kind is null or p_kind not in ('monthly', 'das', 'cnas_file', 'das_file', 'g50') then
    raise exception 'Type de déclaration invalide.' using errcode = 'check_violation';
  end if;
  if p_year is null or p_year not between 2000 and 2100
     or (p_kind not in ('das', 'das_file') and (v_month is null or v_month not between 1 and 12)) then
    raise exception 'Période invalide.' using errcode = 'check_violation';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    raise exception 'Motif de la demande obligatoire (10 à 500 caractères).' using errcode = 'check_violation';
  end if;
  v_required := public.hr_declaration_d10_months(p_kind, p_year, v_month, p_site);
  if cardinality(v_required) = 0 then
    raise exception 'Aucune décision D10 nécessaire pour cet export.' using errcode = 'check_violation';
  end if;
  v_key := public.hr_declaration_d10_key(p_kind, p_year, v_month, p_site);
  select id into v_existing from public.sys_decisions where dedupe_key = v_key and status in ('PENDING', 'DECIDED');
  if v_existing is not null then
    return v_existing;
  end if;

  v_all := cardinality(v_required) = cardinality(public.hr_declaration_covered_months(p_kind, v_month));
  v_scope := jsonb_build_object('kind', p_kind, 'year', p_year, 'month', v_month, 'site_id', p_site, 'reason', v_reason);
  v_ctx := public.hr_declaration_d10_context(v_scope) || jsonb_build_object('reason', v_reason);
  insert into public.sys_decisions (
    type_code, dedupe_key, period_year, period_month, site_id, scope, context, options, fingerprint,
    request_source, requested_by
  )
  select 'D10', v_key, p_year, v_month, p_site, v_scope, v_ctx,
         (select jsonb_agg(
            case when e.o->>'code' = 'EXCLUDE' and v_all then e.o || jsonb_build_object(
              'executes', false,
              'label_fr', 'Exclure les mois concernés — aucun fichier',
              'consequence_fr', 'Tous les mois de ce fichier sont concernés : aucun fichier n''est produit ni inscrit au registre.')
            else e.o end order by e.ord)
          from jsonb_array_elements(t.options) with ordinality as e(o, ord)),
         public.hr_declaration_d10_fingerprint(v_scope), 'DECLARATION_EXPORT', v_uid
  from public.sys_decision_types t
  where t.code = 'D10'
  returning id into v_id;

  perform public.sys_notify(
    'DECISION_PENDING',
    format('Déclaration bloquée : %s %s — %s', p_kind, v_ctx->>'period', v_ctx->>'site_name'),
    'Période de reprise ou déjà déclarée hors de l''application : risque de double déclaration. Aucun fichier sans votre décision.',
    '/decisions/' || v_id,
    null,
    'decision_declaration_export',
    v_id
  );
  return v_id;
end;
$$;

-- What an export may contain now (and under which D10): read-only, nothing is consumed.
create or replace function public.hr_declaration_export_plan(
  p_kind text,
  p_year integer,
  p_month integer,
  p_site uuid,
  p_decision uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_month integer := case when p_kind in ('das', 'das_file') then null else p_month end;
  v_cover integer[];
  v_required integer[];
  v_months integer[];
  v_excluded integer[] := '{}';
  v_nature text := 'OFFICIAL';
  v_blocked boolean := false;
  v_msg text;
  v_option text;
  v_open_id uuid;
  v_open_status text;
  v_open_option text;
  d public.sys_decisions%rowtype;
begin
  if not public.erp_can_read_hr_salary() then
    raise exception 'Lecture des déclarations non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  if p_kind is null or p_kind not in ('monthly', 'das', 'cnas_file', 'das_file', 'g50') then
    raise exception 'Type de déclaration invalide.' using errcode = 'check_violation';
  end if;
  if p_year is null or p_year not between 2000 and 2100
     or (p_kind not in ('das', 'das_file') and (v_month is null or v_month not between 1 and 12)) then
    raise exception 'Période invalide.' using errcode = 'check_violation';
  end if;
  v_cover := public.hr_declaration_covered_months(p_kind, v_month);
  v_required := public.hr_declaration_d10_months(p_kind, p_year, v_month, p_site);
  v_months := v_cover;
  select id, status, chosen_option into v_open_id, v_open_status, v_open_option
  from public.sys_decisions
  where dedupe_key = public.hr_declaration_d10_key(p_kind, p_year, v_month, p_site) and status in ('PENDING', 'DECIDED')
  limit 1;

  if cardinality(v_required) > 0 then
    if p_decision is null then
      v_blocked := true;
      v_msg := 'Export bloqué : décision D10 requise (mois de reprise ou déjà déclarés hors de l''application). L''absence de trace dans l''application ne prouve pas qu''aucune déclaration n''a eu lieu.';
    else
      select * into d from public.sys_decisions where id = p_decision;
      if not found or d.type_code <> 'D10' or d.status <> 'DECIDED'
         or d.dedupe_key <> public.hr_declaration_d10_key(p_kind, p_year, v_month, p_site) then
        v_blocked := true;
        v_msg := 'Décision D10 non valide pour cet export (non décidée, déjà utilisée ou autre périmètre).';
      else
        v_option := d.chosen_option;
        if v_option = 'CONTROL' then
          v_nature := 'CONTROL';
        elsif v_option = 'EXCLUDE' then
          v_excluded := v_required;
          v_months := array(select x from unnest(v_cover) as x where x <> all (v_required) order by x);
          if cardinality(v_months) = 0 then
            v_blocked := true;
            v_msg := 'Aucun mois à déclarer après exclusion.';
          end if;
        elsif v_option is distinct from 'OFFICIAL' then
          v_blocked := true;
          v_msg := 'Option D10 sans fichier.';
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'kind', p_kind, 'year', p_year, 'month', v_month, 'site_id', p_site,
    'covered_months', to_jsonb(v_cover),
    'required_months', to_jsonb(v_required),
    'month_reasons', public.hr_declaration_month_reasons(p_kind, p_year, v_month, p_site),
    'blocked', v_blocked,
    'message', v_msg,
    'option', v_option,
    'nature', v_nature,
    'months', to_jsonb(v_months),
    'excluded_months', to_jsonb(v_excluded),
    'open_decision', case when v_open_id is null then null
      else jsonb_build_object('id', v_open_id, 'status', v_open_status, 'option', v_open_option) end,
    'prior_exports', public.hr_declaration_exports_json(p_year, v_cover, p_site),
    'external_operations', public.hr_external_ops_json(
      'DECLARATION',
      make_date(p_year, (select min(x) from unnest(v_cover) as x), 1),
      make_date(p_year, (select max(x) from unnest(v_cover) as x), 1),
      p_site, null)
  );
end;
$$;

-- Inscribes a produced file in the register; refused for a blocked period without the matching D10 (consumed here).
create or replace function public.hr_declaration_export_record(p jsonb, p_decision uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_kind text := p->>'kind';
  v_year integer;
  v_month integer;
  v_site uuid;
  v_plan jsonb;
  v_required integer[];
  v_months integer[];
  v_excluded integer[];
  v_official boolean;
  d public.sys_decisions%rowtype;
  v_id uuid;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not public.erp_can_write_hr_salary_values(v_uid) then
    raise exception 'Export des déclarations non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  begin
    v_year := (p->>'year')::integer;
    v_month := case when v_kind in ('das', 'das_file') then null else nullif(p->>'month', '')::integer end;
    v_site := nullif(p->>'site_id', '')::uuid;
  exception when others then
    raise exception 'Export invalide (période ou chantier).' using errcode = 'check_violation';
  end;

  if p_decision is not null then
    select * into d from public.sys_decisions where id = p_decision for update;
    if found and d.type_code = 'D10' and d.status = 'DECIDED' then
      if v_uid is distinct from d.decided_by and v_uid is distinct from d.requested_by and not public.erp_is_super_admin(v_uid) then
        raise exception 'Seuls le demandeur, le décideur ou le SUPER_ADMIN exécutent cette décision.' using errcode = 'insufficient_privilege';
      end if;
      if public.hr_declaration_d10_fingerprint(d.scope) is distinct from d.fingerprint then
        perform public.sys_decision_close_internal(d.id, 'INVALIDATED',
          'Données modifiées depuis la décision D10 (paies, opérations externes ou registre des exports) : nouvelle demande nécessaire.');
        return jsonb_build_object('ok', false, 'reason', 'INVALIDATED');
      end if;
    end if;
  end if;

  v_plan := public.hr_declaration_export_plan(v_kind, v_year, v_month, v_site, p_decision);
  if (v_plan->>'blocked')::boolean then
    if d.id is not null and d.chosen_option = 'EXCLUDE' and d.status = 'DECIDED' and v_plan->>'message' like 'Aucun mois%' then
      perform public.sys_decision_close_internal(d.id, 'INVALIDATED', 'Plus aucun mois à déclarer après exclusion : nouvelle demande nécessaire.');
      return jsonb_build_object('ok', false, 'reason', 'INVALIDATED');
    end if;
    raise exception '%', v_plan->>'message' using errcode = 'insufficient_privilege';
  end if;

  v_required := array(select x::integer from jsonb_array_elements_text(v_plan->'required_months') as x);
  v_months := array(select x::integer from jsonb_array_elements_text(v_plan->'months') as x order by 1);
  v_excluded := array(select x::integer from jsonb_array_elements_text(v_plan->'excluded_months') as x order by 1);
  v_official := coalesce(v_plan->>'option', '') = 'OFFICIAL';
  if jsonb_typeof(p->'months') is distinct from 'array'
     or array(select x::integer from jsonb_array_elements_text(p->'months') as x order by 1) is distinct from v_months then
    raise exception 'Mois du fichier différents du plan d''export (exclusions D10).' using errcode = 'check_violation';
  end if;
  if p->>'nature' is distinct from v_plan->>'nature' then
    raise exception 'Nature du fichier différente de la décision D10.' using errcode = 'check_violation';
  end if;

  insert into public.hr_declaration_exports (
    kind, nature, period_year, period_month, site_id, months, excluded_months, file_name, sha256, byte_size,
    slip_count, totals, payroll_status, double_declaration_risk, decision_id, created_by
  ) values (
    v_kind, v_plan->>'nature', v_year, v_month, v_site, v_months, v_excluded, p->>'file_name', lower(p->>'sha256'),
    (p->>'byte_size')::bigint, (p->>'slip_count')::integer, coalesce(p->'totals', '{}'::jsonb), p->>'payroll_status',
    v_official, case when cardinality(v_required) > 0 then p_decision end, v_uid
  )
  returning id into v_id;

  if cardinality(v_required) > 0 then
    update public.sys_decisions set
      status = 'EXECUTED',
      executed_by = v_uid,
      executed_at = now(),
      execution_result = jsonb_build_object(
        'operation', 'DECLARATION_EXPORT', 'export_id', v_id, 'nature', v_plan->>'nature',
        'file_name', p->>'file_name', 'sha256', lower(p->>'sha256'), 'months', to_jsonb(v_months),
        'excluded_months', to_jsonb(v_excluded), 'double_declaration_risk', v_official)
    where id = p_decision;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. D7: the reopening screen shows the exports register and the external operations of the month
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
    'declarations_registry', true,
    'declaration_exports', public.hr_declaration_exports_json(r.period_year, array[r.period_month], r.site_id),
    'external_operations', public.hr_external_ops_json(
      null, make_date(r.period_year, r.period_month, 1), make_date(r.period_year, r.period_month, 1), r.site_id,
      (select array_agg(employee_id) from sl)),
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
       and c.created_at >= coalesce(r.validated_at, r.created_at)),
    public.hr_external_ops_digest(
      null, make_date(r.period_year, r.period_month, 1), make_date(r.period_year, r.period_month, 1), r.site_id,
      (select array_agg(s.employee_id) from public.hr_payroll_slips s where s.run_id = r.id)),
    (select count(*)::text from public.hr_declaration_exports e
     where e.period_year = r.period_year and r.period_month = any (e.months)
       and (e.site_id is null or r.site_id is null or e.site_id = r.site_id))
  ))
  from public.hr_payroll_runs r
  where r.id = p_run;
$$;

-- ---------------------------------------------------------------------------
-- 9. Decision engine: D9 / D10 fingerprints and refresh
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
  v_required integer[];
  v_month integer;
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
  end if;
  return d.status;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.hr_external_operation_insert() from public, anon, authenticated;
revoke all on function public.hr_external_operation_guard() from public, anon, authenticated;
revoke all on function public.hr_external_document_guard() from public, anon, authenticated;
revoke all on function public.hr_declaration_export_guard() from public, anon, authenticated;
revoke all on function public.hr_external_ops_json(text, date, date, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.hr_external_ops_digest(text, date, date, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.hr_external_op_contributors(uuid) from public, anon, authenticated;
revoke all on function public.hr_declaration_exports_json(integer, integer[], uuid) from public, anon, authenticated;
revoke all on function public.hr_transfer_decision_flag() from public, anon, authenticated;
revoke all on function public.hr_transfer_d9_reasons(uuid) from public, anon, authenticated;
revoke all on function public.hr_transfer_reason_labels(text[]) from public, anon, authenticated;
revoke all on function public.hr_transfer_line_guard() from public, anon, authenticated;
revoke all on function public.hr_transfer_batch_insert_guard() from public, anon, authenticated;
revoke all on function public.hr_transfer_batch_guard() from public, anon, authenticated;
revoke all on function public.hr_transfer_d9_context(jsonb) from public, anon, authenticated;
revoke all on function public.hr_transfer_d9_fingerprint(jsonb) from public, anon, authenticated;
revoke all on function public.hr_declaration_covered_months(text, integer) from public, anon, authenticated;
revoke all on function public.hr_declaration_subtypes(text) from public, anon, authenticated;
revoke all on function public.hr_declaration_d10_key(text, integer, integer, uuid) from public, anon, authenticated;
revoke all on function public.hr_declaration_month_reasons(text, integer, integer, uuid) from public, anon, authenticated;
revoke all on function public.hr_declaration_d10_months(text, integer, integer, uuid) from public, anon, authenticated;
revoke all on function public.hr_declaration_d10_context(jsonb) from public, anon, authenticated;
revoke all on function public.hr_declaration_d10_fingerprint(jsonb) from public, anon, authenticated;
revoke all on function public.hr_payroll_reopen_context(uuid) from public, anon, authenticated;
revoke all on function public.hr_payroll_reopen_fingerprint(uuid) from public, anon, authenticated;
revoke all on function public.sys_decision_current_fingerprint(uuid) from public, anon, authenticated;
revoke all on function public.sys_decision_refresh_record(uuid) from public, anon, authenticated;

revoke all on function public.hr_external_op_upload_allowed(text) from public, anon;
revoke all on function public.hr_external_op_save(uuid, jsonb) from public, anon;
revoke all on function public.hr_external_op_confirm(uuid) from public, anon;
revoke all on function public.hr_external_op_withdraw(uuid, text) from public, anon;
revoke all on function public.hr_external_op_add_document(uuid, text, text, text, bigint, text, uuid) from public, anon;
revoke all on function public.hr_external_op_examine(uuid, text) from public, anon;
revoke all on function public.hr_transfer_block_reasons(uuid[]) from public, anon;
revoke all on function public.hr_transfer_request_d9(integer, integer, uuid, text, uuid[], text) from public, anon;
revoke all on function public.hr_transfer_batch_create(jsonb, jsonb, uuid) from public, anon;
revoke all on function public.hr_transfer_d9_reconciliation(uuid) from public, anon;
revoke all on function public.hr_declaration_request_d10(text, integer, integer, uuid, text) from public, anon;
revoke all on function public.hr_declaration_export_plan(text, integer, integer, uuid, uuid) from public, anon;
revoke all on function public.hr_declaration_export_record(jsonb, uuid) from public, anon;

grant execute on function public.hr_external_op_upload_allowed(text) to authenticated;
grant execute on function public.hr_external_op_save(uuid, jsonb) to authenticated;
grant execute on function public.hr_external_op_confirm(uuid) to authenticated;
grant execute on function public.hr_external_op_withdraw(uuid, text) to authenticated;
grant execute on function public.hr_external_op_add_document(uuid, text, text, text, bigint, text, uuid) to authenticated;
grant execute on function public.hr_external_op_examine(uuid, text) to authenticated;
grant execute on function public.hr_transfer_block_reasons(uuid[]) to authenticated;
grant execute on function public.hr_transfer_request_d9(integer, integer, uuid, text, uuid[], text) to authenticated;
grant execute on function public.hr_transfer_batch_create(jsonb, jsonb, uuid) to authenticated;
grant execute on function public.hr_transfer_d9_reconciliation(uuid) to authenticated;
grant execute on function public.hr_declaration_request_d10(text, integer, integer, uuid, text) to authenticated;
grant execute on function public.hr_declaration_export_plan(text, integer, integer, uuid, uuid) to authenticated;
grant execute on function public.hr_declaration_export_record(jsonb, uuid) to authenticated;

commit;
