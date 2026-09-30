-- Lot 5 — Import des archives de présence
--   1. Droits dédiés, attribués par le SUPER_ADMIN depuis la matrice : consulter / déposer, analyser et importer /
--      annuler un lot (écran « Imports de présences ») et valider les présences importées (écran séparé). Contrôlés en
--      base dans chaque fonction, chantier par chantier. Par défaut, seul le SUPER_ADMIN les détient.
--   2. Lot d'import : période et année de référence, chantiers, provenance (registre papier, logiciel source,
--      transmis par…, date de production), fichier d'origine en stockage privé avec son SHA-256, pièces justificatives
--      (scans du registre, jamais lus automatiquement), auteur, lignes lues / acceptées / rejetées, statut, commentaire.
--      Deux formats : grille mensuelle (un chantier, un mois) et une ligne par salarié et par jour.
--   3. Analyse à blanc en base, sans limite du nombre d'anomalies : matricule et nom, chantier, contrat couvrant la
--      date sur ce chantier, sortie, code (référentiel ou correspondance validée D11), période, date future, mois de
--      paie validé ou clôturé, heures supplémentaires dans les bornes, doublons (y compris deux chantiers le même jour),
--      totaux de contrôle déclarés, fichier déjà importé (même empreinte).
--   4. Conflit avec une présence déjà enregistrée (autre valeur, autre chantier le même jour, congé approuvé) : rien
--      n'est remplacé ; le lot attend la décision D5 du SUPER_ADMIN (non délégable), notifiée dans l'application :
--      conserver l'existant, retenir l'import, trancher ligne par ligne ou rejeter le lot.
--   5. Import : les lignes acceptées deviennent des présences PROPOSÉES d'origine IMPORT liées au lot. Validation
--      séparée (droit dédié ; l'auteur du lot ne valide pas son propre lot sauf politique D12 explicite et révocable,
--      SUPER_ADMIN excepté). Aucune paie n'est créée ni recalculée : brouillons signalés (D3) ou génération demandée (D4).
--   6. Annulation tant que la paie des mois concernés n'est ni validée ni clôturée : seules les présences importées non
--      modifiées sont retirées, les présences remplacées sur décision sont restaurées.
--   7. Les présences importées ne sont écrites que par ce circuit (garde en base) ; la saisie de la grille et les
--      ordres de mission ne les écrasent plus silencieusement.

begin;

-- ---------------------------------------------------------------------------
-- 1. Rights matrix
-- ---------------------------------------------------------------------------
insert into public.sys_screens (code, path, module, label_fr, label_ar, sort_order) values
  ('hr_attendance_import', '/rh/presence/imports', 'rh',
   'Imports de présences · consulter (lire), déposer, analyser et importer un lot (créer), annuler un lot (modifier)',
   'استيراد الحضور', 215),
  ('hr_attendance_import_validate', '/rh/presence/imports?vue=validation', 'rh',
   'Validation des présences importées (modifier) · séparée de l''import', 'اعتماد الحضور المستورد', 216),
  ('decision_attendance_import_conflict', '/decisions?type=D5', 'decisions',
   'Décision D5 · Conflit entre un import de présences et les présences enregistrées (SUPER_ADMIN uniquement, non délégable)',
   null, 64),
  ('decision_attendance_code_mapping', '/decisions?type=D11', 'decisions',
   'Décision D11 · Correspondance des codes de présence d''un import (classe : ordinaire)', null, 65),
  ('decision_attendance_import_policy', '/decisions?type=D12', 'decisions',
   'Décision D12 · Politique : l''auteur d''un import peut-il valider son propre lot (SUPER_ADMIN uniquement, non délégable)',
   null, 66)
on conflict (code) do nothing;

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select r.id, s.id, true, true, true, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code = 'SUPER_ADMIN'
  and s.code in ('hr_attendance_import', 'hr_attendance_import_validate', 'decision_attendance_import_conflict',
                 'decision_attendance_code_mapping', 'decision_attendance_import_policy')
on conflict (role_id, screen_id) do nothing;

create or replace function public.sys_permissions_non_delegable_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  select s.code into v_code from public.sys_screens s where s.id = new.screen_id;
  if v_code in ('decision_payroll_reopen', 'decision_attendance_import_conflict', 'decision_attendance_import_policy')
     and not exists (select 1 from public.sys_roles r where r.id = new.role_id and r.code = 'SUPER_ADMIN')
     and (new.can_create or new.can_update or new.can_delete) then
    raise exception '%', case v_code
      when 'decision_payroll_reopen' then 'La réouverture d''une paie (D7) est réservée au SUPER_ADMIN et ne se délègue pas.'
      when 'decision_attendance_import_conflict' then
        'Les conflits d''import de présences (D5) sont tranchés par le SUPER_ADMIN et ne se délèguent pas.'
      else 'La politique de validation des imports de présences (D12) est réservée au SUPER_ADMIN et ne se délègue pas.'
    end using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
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
       or (
         p_type not in ('D7', 'D5', 'D12')
         and exists (
           select 1 from public.sys_decision_types t
           where t.code = p_type and t.is_active
             and public.erp_has_perm(t.screen_code, 'update'::public.rbac_action, null, p_uid)
         )
       )
     );
$$;

-- Right held globally or on at least one site (site-scoped roles).
create or replace function public.hr_att_import_has(p_screen text, p_action text, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.sys_user_is_active(p_uid)
     and (
       public.erp_has_perm(p_screen, p_action::public.rbac_action, null, p_uid)
       or exists (
         select 1 from public.sys_user_site_roles usr
         where usr.user_id = p_uid and usr.site_id is not null
           and public.erp_has_perm(p_screen, p_action::public.rbac_action, usr.site_id, p_uid)
       )
     );
$$;

-- Right held on every site of a batch.
create or replace function public.hr_att_import_sites_allowed(
  p_sites uuid[],
  p_screen text,
  p_action text,
  p_uid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.sys_user_is_active(p_uid)
     and coalesce(cardinality(p_sites), 0) > 0
     and not exists (
       select 1 from unnest(p_sites) as s(id)
       where not (
         public.erp_has_perm(p_screen, p_action::public.rbac_action, s.id, p_uid)
         and public.erp_can_see_site(s.id, p_uid)
       )
     );
$$;

create or replace function public.hr_att_import_can_read(p_sites uuid[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.hr_att_import_sites_allowed(p_sites, 'hr_attendance_import', 'read')
      or public.hr_att_import_sites_allowed(p_sites, 'hr_attendance_import_validate', 'read');
$$;

-- ---------------------------------------------------------------------------
-- 2. Staging: batches, lines, supporting documents, code correspondences, validation policy
-- ---------------------------------------------------------------------------
create sequence if not exists public.hr_attendance_import_batch_seq;

create table if not exists public.hr_attendance_import_batches (
  id uuid primary key,
  batch_no text not null unique,
  format text not null check (format in ('GRID', 'ROWS')),
  period_from date not null check (extract(day from period_from) = 1),
  period_to date not null check (extract(day from period_to) = 1),
  reference_year integer not null check (reference_year between 2000 and 2100),
  site_ids uuid[] not null check (cardinality(site_ids) between 1 and 200),
  nature text not null check (nature in ('REPRISE', 'OPERATIONAL', 'MIXED')),
  provenance_kind text not null check (provenance_kind in ('PAPER_REGISTER', 'SOURCE_SOFTWARE', 'TRANSMITTED', 'OTHER')),
  provenance_detail text not null check (char_length(btrim(provenance_detail)) between 2 and 300),
  source_produced_on date,
  comment text check (char_length(comment) <= 1000),
  control_lines integer check (control_lines >= 0),
  control_employees integer check (control_employees >= 0),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  duplicate_of uuid references public.hr_attendance_import_batches(id),
  parse_report jsonb not null default '{}'::jsonb,
  code_map jsonb not null default '{}'::jsonb,
  lines_expected integer not null check (lines_expected between 0 and 200000),
  sealed_at timestamptz,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'ANALYZED', 'PENDING_DECISION', 'IMPORTED', 'VALIDATED', 'REJECTED', 'CANCELLED')),
  analysis jsonb not null default '{}'::jsonb,
  analyzed_at timestamptz,
  analyzed_by uuid references public.sys_users(id),
  lines_read integer not null default 0,
  lines_accepted integer not null default 0,
  lines_rejected integer not null default 0,
  lines_imported integer not null default 0,
  lines_validated integer not null default 0,
  created_by uuid not null references public.sys_users(id),
  created_at timestamptz not null default now(),
  imported_by uuid references public.sys_users(id),
  imported_at timestamptz,
  validated_by uuid references public.sys_users(id),
  validated_at timestamptz,
  closed_by uuid references public.sys_users(id),
  closed_at timestamptz,
  close_reason text check (char_length(close_reason) <= 600),
  updated_at timestamptz not null default now(),
  check (period_to >= period_from),
  check (period_to < (period_from + interval '12 months')::date)
);

create index if not exists hr_attendance_import_batches_status_idx
  on public.hr_attendance_import_batches (status, created_at desc);
create index if not exists hr_attendance_import_batches_sha_idx on public.hr_attendance_import_batches (sha256);

create table if not exists public.hr_attendance_import_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.hr_attendance_import_batches(id) on delete restrict,
  line_no integer not null check (line_no > 0),
  source_ref text not null check (char_length(source_ref) between 1 and 60),
  kind text not null default 'DAY' check (kind in ('DAY', 'HOURS')),
  matricule text not null default '' check (char_length(matricule) <= 40),
  last_name text check (char_length(last_name) <= 120),
  first_name text check (char_length(first_name) <= 120),
  raw_date text check (char_length(raw_date) <= 40),
  work_date date,
  site_code text check (char_length(site_code) <= 40),
  source_code text check (char_length(source_code) <= 16),
  hours jsonb not null default '{}'::jsonb check (jsonb_typeof(hours) = 'object'),
  parse_errors text[] not null default '{}',
  employee_id uuid references public.hr_employees(id),
  site_id uuid references public.ref_sites(id),
  legend_code text,
  code_origin text check (code_origin in ('DIRECT', 'BATCH_MAP', 'POLICY')),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'OK', 'WARNING', 'ERROR', 'DUPLICATE', 'SAME', 'CONFLICT')),
  errors text[] not null default '{}',
  warnings text[] not null default '{}',
  conflict_kinds text[] not null default '{}',
  existing jsonb not null default '[]'::jsonb,
  resolution text check (resolution in ('IMPORT', 'KEEP')),
  resolved_by uuid references public.sys_users(id),
  resolved_at timestamptz,
  resolution_decision uuid references public.sys_decisions(id),
  unique (batch_id, source_ref)
);

create index if not exists hr_attendance_import_lines_status_idx on public.hr_attendance_import_lines (batch_id, status);
create index if not exists hr_attendance_import_lines_emp_idx
  on public.hr_attendance_import_lines (batch_id, employee_id, work_date);

create table if not exists public.hr_attendance_import_documents (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.hr_attendance_import_batches(id) on delete restrict,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  description text check (char_length(description) <= 300),
  uploaded_by uuid not null references public.sys_users(id),
  uploaded_at timestamptz not null default now()
);

create index if not exists hr_attendance_import_documents_batch_idx on public.hr_attendance_import_documents (batch_id);

create table if not exists public.hr_attendance_code_mappings (
  id uuid primary key default gen_random_uuid(),
  source_code text not null check (source_code ~ '^[A-Z0-9_+./-]{1,16}$'),
  legend_code text not null references public.ref_legendes(code),
  status text not null default 'PENDING_CONFIRMATION' check (status in ('PENDING_CONFIRMATION', 'ACTIVE', 'REVOKED')),
  decision_id uuid not null references public.sys_decisions(id),
  batch_id uuid references public.hr_attendance_import_batches(id),
  created_by uuid not null references public.sys_users(id),
  created_at timestamptz not null default now(),
  confirmed_by uuid references public.sys_users(id),
  confirmed_at timestamptz,
  revoked_by uuid references public.sys_users(id),
  revoked_at timestamptz,
  revoke_reason text check (char_length(revoke_reason) <= 500)
);

create unique index if not exists hr_attendance_code_mappings_open_uidx
  on public.hr_attendance_code_mappings (source_code) where status in ('PENDING_CONFIRMATION', 'ACTIVE');

create table if not exists public.hr_attendance_import_policy (
  id boolean primary key default true check (id),
  importer_may_validate boolean not null,
  decision_id uuid not null references public.sys_decisions(id),
  decided_by uuid not null references public.sys_users(id),
  decided_at timestamptz not null default now()
);

-- Attendance: imported origin, always linked to its batch.
alter table public.hr_attendance
  add column if not exists import_batch_id uuid references public.hr_attendance_import_batches(id);
create index if not exists hr_attendance_import_batch_idx
  on public.hr_attendance (import_batch_id) where import_batch_id is not null;
alter table public.hr_attendance drop constraint if exists hr_attendance_import_link_chk;
alter table public.hr_attendance
  add constraint hr_attendance_import_link_chk check ((source_code = 'IMPORT') = (import_batch_id is not null));

-- In-app notification to the holders of the validation right.
alter table public.sys_notifications drop constraint if exists sys_notifications_kind_check;
alter table public.sys_notifications add constraint sys_notifications_kind_check
  check (kind in ('DECISION_PENDING', 'DECISION_TAKEN', 'DECISION_INVALIDATED', 'ATTENDANCE_IMPORT'));

-- ---------------------------------------------------------------------------
-- 3. Guards and audit
-- ---------------------------------------------------------------------------
create or replace function public.hr_att_import_batch_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Lot d''import de présences : suppression interdite (conservé pour l''audit).' using errcode = 'check_violation';
  end if;
  if (new.id, new.batch_no, new.format, new.period_from, new.period_to, new.reference_year, new.site_ids, new.nature,
      new.provenance_kind, new.provenance_detail, new.source_produced_on, new.comment, new.control_lines,
      new.control_employees, new.storage_path, new.file_name, new.mime, new.size_bytes, new.sha256, new.duplicate_of,
      new.parse_report, new.lines_expected, new.created_by, new.created_at)
     is distinct from
     (old.id, old.batch_no, old.format, old.period_from, old.period_to, old.reference_year, old.site_ids, old.nature,
      old.provenance_kind, old.provenance_detail, old.source_produced_on, old.comment, old.control_lines,
      old.control_employees, old.storage_path, old.file_name, old.mime, old.size_bytes, old.sha256, old.duplicate_of,
      old.parse_report, old.lines_expected, old.created_by, old.created_at) then
    raise exception 'Lot d''import de présences : fichier, période, chantiers et provenance non modifiables.'
      using errcode = 'check_violation';
  end if;
  if old.status in ('REJECTED', 'CANCELLED') then
    raise exception 'Lot d''import clos (%) : non modifiable.', old.status using errcode = 'check_violation';
  end if;
  if old.status = 'VALIDATED' and new.status not in ('VALIDATED', 'CANCELLED') then
    raise exception 'Lot d''import validé : seule l''annulation est possible.' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_hr_att_import_batch_guard on public.hr_attendance_import_batches;
create trigger trg_hr_att_import_batch_guard
  before update or delete on public.hr_attendance_import_batches
  for each row execute function public.hr_att_import_batch_guard();

create or replace function public.hr_att_import_line_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Ligne d''import : suppression interdite.' using errcode = 'check_violation';
  end if;
  if (new.batch_id, new.line_no, new.source_ref, new.kind, new.matricule, new.last_name, new.first_name, new.raw_date,
      new.work_date, new.site_code, new.source_code, new.hours, new.parse_errors)
     is distinct from
     (old.batch_id, old.line_no, old.source_ref, old.kind, old.matricule, old.last_name, old.first_name, old.raw_date,
      old.work_date, old.site_code, old.source_code, old.hours, old.parse_errors) then
    raise exception 'Ligne d''import : contenu lu dans le fichier non modifiable.' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.hr_attendance_import_batches b
    where b.id = new.batch_id and b.status in ('DRAFT', 'ANALYZED', 'PENDING_DECISION')
  ) then
    raise exception 'Ligne d''import : lot déjà importé ou clos.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_att_import_line_guard on public.hr_attendance_import_lines;
create trigger trg_hr_att_import_line_guard
  before update or delete on public.hr_attendance_import_lines
  for each row execute function public.hr_att_import_line_guard();

create or replace function public.hr_att_import_document_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Pièce justificative d''import : ni modifiable ni supprimable.' using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_hr_att_import_document_guard on public.hr_attendance_import_documents;
create trigger trg_hr_att_import_document_guard
  before update or delete on public.hr_attendance_import_documents
  for each row execute function public.hr_att_import_document_guard();

create or replace function public.hr_att_code_mapping_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Correspondance de code : suppression interdite (révoquez-la).' using errcode = 'check_violation';
  end if;
  if (new.id, new.source_code, new.legend_code, new.decision_id, new.batch_id, new.created_by, new.created_at)
     is distinct from (old.id, old.source_code, old.legend_code, old.decision_id, old.batch_id, old.created_by, old.created_at) then
    raise exception 'Correspondance de code : codes et décision non modifiables.' using errcode = 'check_violation';
  end if;
  if old.status = 'REVOKED' then
    raise exception 'Correspondance de code révoquée : non modifiable.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_att_code_mapping_guard on public.hr_attendance_code_mappings;
create trigger trg_hr_att_code_mapping_guard
  before update or delete on public.hr_attendance_code_mappings
  for each row execute function public.hr_att_code_mapping_guard();

drop trigger if exists trg_hr_attendance_import_batches_audit on public.hr_attendance_import_batches;
create trigger trg_hr_attendance_import_batches_audit
  after insert or update on public.hr_attendance_import_batches
  for each row execute function public.sys_audit_row_change();

-- Lines: their resolution (conflict decision) is audited; the lines read from the file stay with the batch.
drop trigger if exists trg_hr_attendance_import_lines_audit on public.hr_attendance_import_lines;
create trigger trg_hr_attendance_import_lines_audit
  after update of resolution on public.hr_attendance_import_lines
  for each row execute function public.sys_audit_row_change();

drop trigger if exists trg_hr_attendance_import_documents_audit on public.hr_attendance_import_documents;
create trigger trg_hr_attendance_import_documents_audit
  after insert on public.hr_attendance_import_documents
  for each row execute function public.sys_audit_row_change();

drop trigger if exists trg_hr_attendance_code_mappings_audit on public.hr_attendance_code_mappings;
create trigger trg_hr_attendance_code_mappings_audit
  after insert or update on public.hr_attendance_code_mappings
  for each row execute function public.sys_audit_row_change();

drop trigger if exists trg_hr_attendance_import_policy_audit on public.hr_attendance_import_policy;
create trigger trg_hr_attendance_import_policy_audit
  after insert or update or delete on public.hr_attendance_import_policy
  for each row execute function public.sys_audit_row_change();

-- Set only inside the import functions (commit, validation, cancellation) for the batch being processed.
create or replace function public.hr_attendance_import_flag()
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v text := nullif(current_setting('hr.attendance_import', true), '');
begin
  if v is null or v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v::uuid;
end;
$$;

-- Imported attendance is written, validated or re-linked only by the import circuit. A user edit turns the value
-- into an ordinary entry (no longer imported, no longer removed by a cancellation).
create or replace function public.hr_attendance_import_row_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_flag uuid := public.hr_attendance_import_flag();
begin
  if tg_op = 'INSERT' then
    if new.source_code = 'IMPORT' and v_flag is null then
      raise exception 'Présence importée : écriture réservée au circuit d''import (analyse, décision, import).'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if new.source_code <> 'IMPORT' then
    new.import_batch_id := null;
    return new;
  end if;
  if v_flag is null and (
       old.source_code <> 'IMPORT'
       or new.import_batch_id is distinct from old.import_batch_id
       or new.legend_code is distinct from old.legend_code
       or (new.employee_id, new.site_id, new.work_date) is distinct from (old.employee_id, old.site_id, old.work_date)
       or (new.status_code = 'VALIDATED' and old.status_code is distinct from 'VALIDATED')
     ) then
    raise exception 'Présence importée : modification ou validation réservée au circuit d''import (validation des présences importées).'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_attendance_import_guard on public.hr_attendance;
create trigger trg_hr_attendance_import_guard
  before insert or update on public.hr_attendance
  for each row execute function public.hr_attendance_import_row_guard();

-- ---------------------------------------------------------------------------
-- 4. Existing writers: the grid and the correspondences never overwrite imported values silently
-- ---------------------------------------------------------------------------
-- An untouched imported value sent back by the grid stays as it is (imported, validated only through its batch);
-- a changed or cleared value becomes an ordinary entry.
create or replace function public.hr_attendance_replace_month(
  p_site uuid,
  p_start date,
  p_end date,
  p_employee uuid,
  p_loaded_at timestamptz,
  p_rows jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  n integer := 0;
begin
  delete from public.hr_attendance a
  where a.site_id = p_site
    and a.work_date between p_start and p_end
    and (p_employee is null or a.employee_id = p_employee)
    and (p_loaded_at is null or a.status_code = 'VALIDATED' or a.updated_at <= p_loaded_at)
    and not (
      a.source_code = 'IMPORT'
      and exists (
        select 1
        from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(employee_id uuid, site_id uuid, work_date date, legend_code text)
        where r.employee_id = a.employee_id and r.site_id = a.site_id and r.work_date = a.work_date
          and r.legend_code = a.legend_code
      )
    );

  insert into public.hr_attendance (
    employee_id, site_id, work_date, legend_code, source_code, correspondence_id,
    status_code, validated_at, validated_by
  )
  select r.employee_id, r.site_id, r.work_date, r.legend_code,
         case when r.source_code is null or r.source_code = 'IMPORT' then 'MANUAL' else r.source_code end,
         case when r.source_code = 'IMPORT' then null else r.correspondence_id end,
         'VALIDATED', now(), auth.uid()
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(
    employee_id uuid, site_id uuid, work_date date, legend_code text, source_code text, correspondence_id uuid
  )
  where r.site_id = p_site and r.work_date between p_start and p_end
    and not exists (
      select 1 from public.hr_attendance a
      where a.employee_id = r.employee_id and a.site_id = r.site_id and a.work_date = r.work_date
        and a.source_code = 'IMPORT' and a.legend_code = r.legend_code
    )
  on conflict (employee_id, site_id, work_date) do update set
    legend_code = excluded.legend_code,
    source_code = excluded.source_code,
    correspondence_id = excluded.correspondence_id,
    status_code = 'VALIDATED',
    validated_at = excluded.validated_at,
    validated_by = excluded.validated_by
  where not (
    public.hr_attendance.source_code = 'IMPORT'
    and p_loaded_at is not null
    and public.hr_attendance.updated_at > p_loaded_at
  );
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.hr_attendance_replace_month(uuid, date, date, uuid, timestamptz, jsonb) to authenticated;

create or replace function public.hr_apply_correspondence_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  legend text;
  d date;
  site uuid;
  src text;
begin
  if tg_op = 'UPDATE'
     and new.type_code is not distinct from old.type_code
     and new.start_date is not distinct from old.start_date
     and new.end_date is not distinct from old.end_date
     and new.site_id is not distinct from old.site_id
     and new.employee_id is not distinct from old.employee_id
     and new.status_code is not distinct from old.status_code
     and (new.payload->>'legend') is not distinct from (old.payload->>'legend') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    delete from public.hr_attendance
    where correspondence_id = new.id
      and source_code not in ('MANUAL', 'IMPORT');
  end if;

  if new.status_code = 'CANCELLED' then
    return new;
  end if;

  legend := nullif(new.payload->>'legend', '');
  if legend is null then
    select nullif(extra->>'generates_legend', '') into legend
    from public.hr_catalogs
    where kind = 'correspondence_type' and code = new.type_code and is_active
    limit 1;
  end if;

  if legend is null or new.start_date is null or new.end_date is null then
    return new;
  end if;
  if not exists (select 1 from public.ref_legendes l where l.code = legend and l.is_active) then
    return new;
  end if;

  site := new.site_id;
  if site is null then
    select c.site_id into site
    from public.hr_contracts c
    where c.employee_id = new.employee_id
      and c.affectation_principale
      and c.status in ('ACTIVE', 'DRAFT', 'SUSPENDED')
    order by (c.status = 'ACTIVE') desc, c.start_date desc
    limit 1;
  end if;
  if site is null then
    return new;
  end if;

  src := case when new.type_code = 'OM' then 'OM' else 'AUTO' end;

  d := new.start_date;
  while d <= new.end_date loop
    insert into public.hr_attendance (
      employee_id, site_id, work_date, legend_code, source_code,
      correspondence_id, status_code, validated_at, validated_by
    ) values (
      new.employee_id, site, d, legend, src,
      new.id, 'PROPOSED', null, null
    )
    on conflict (employee_id, site_id, work_date) do update set
      legend_code = excluded.legend_code,
      source_code = excluded.source_code,
      correspondence_id = excluded.correspondence_id,
      status_code = 'PROPOSED',
      validated_at = null,
      validated_by = null,
      updated_at = now()
    where public.hr_attendance.source_code not in ('MANUAL', 'IMPORT');
    d := d + 1;
  end loop;
  return new;
end;
$$;

-- D4 requests may come from the import validation (source ATTENDANCE) of a user holding the import rights.
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
-- 5. RLS and private storage
-- ---------------------------------------------------------------------------
alter table public.hr_attendance_import_batches enable row level security;
alter table public.hr_attendance_import_lines enable row level security;
alter table public.hr_attendance_import_documents enable row level security;
alter table public.hr_attendance_code_mappings enable row level security;
alter table public.hr_attendance_import_policy enable row level security;

drop policy if exists hr_att_import_batches_read on public.hr_attendance_import_batches;
create policy hr_att_import_batches_read on public.hr_attendance_import_batches
  for select to authenticated using (public.hr_att_import_can_read(site_ids));

drop policy if exists hr_att_import_lines_read on public.hr_attendance_import_lines;
create policy hr_att_import_lines_read on public.hr_attendance_import_lines
  for select to authenticated
  using (exists (
    select 1 from public.hr_attendance_import_batches b
    where b.id = batch_id and public.hr_att_import_can_read(b.site_ids)
  ));

drop policy if exists hr_att_import_documents_read on public.hr_attendance_import_documents;
create policy hr_att_import_documents_read on public.hr_attendance_import_documents
  for select to authenticated
  using (exists (
    select 1 from public.hr_attendance_import_batches b
    where b.id = batch_id and public.hr_att_import_can_read(b.site_ids)
  ));

drop policy if exists hr_att_code_mappings_read on public.hr_attendance_code_mappings;
create policy hr_att_code_mappings_read on public.hr_attendance_code_mappings
  for select to authenticated
  using (
    public.hr_att_import_has('hr_attendance_import', 'read')
    or public.hr_att_import_has('hr_attendance_import_validate', 'read')
    or public.sys_decision_can_decide('D11')
  );

drop policy if exists hr_att_import_policy_read on public.hr_attendance_import_policy;
create policy hr_att_import_policy_read on public.hr_attendance_import_policy
  for select to authenticated using (public.sys_user_is_active(auth.uid()));

revoke all on public.hr_attendance_import_batches from anon;
revoke all on public.hr_attendance_import_lines from anon;
revoke all on public.hr_attendance_import_documents from anon;
revoke all on public.hr_attendance_code_mappings from anon;
revoke all on public.hr_attendance_import_policy from anon;
revoke all on sequence public.hr_attendance_import_batch_seq from public, anon, authenticated;

-- <batch id>/source.<xlsx|csv> (the folder becomes the batch id) and <batch id>/pieces/<uuid>.<ext>; never replaced.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance-imports', 'attendance-imports', false, 20971520,
        array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv',
              'application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.hr_att_import_upload_allowed(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(p_folder, '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and public.hr_att_import_has('hr_attendance_import', 'create')
     and not exists (
       select 1 from public.hr_attendance_import_batches b
       where b.id::text = p_folder
         and (b.status in ('REJECTED', 'CANCELLED')
              or not public.hr_att_import_sites_allowed(b.site_ids, 'hr_attendance_import', 'create'))
     );
$$;

-- Files of a batch follow the batch's site scope; a file not yet registered is visible to its uploader only.
create or replace function public.hr_att_import_object_readable(p_folder text, p_owner text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(p_folder, '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and case
       when exists (select 1 from public.hr_attendance_import_batches b where b.id::text = p_folder) then
         exists (
           select 1 from public.hr_attendance_import_batches b
           where b.id::text = p_folder
             and (public.hr_att_import_can_read(b.site_ids)
                  or public.hr_att_import_sites_allowed(b.site_ids, 'hr_attendance_import', 'create'))
         )
       else
         p_owner is not null and p_owner = auth.uid()::text
         and public.hr_att_import_has('hr_attendance_import', 'create')
     end;
$$;

drop policy if exists attendance_imports_select on storage.objects;
create policy attendance_imports_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attendance-imports'
    and public.hr_att_import_object_readable((storage.foldername(name))[1], owner_id)
  );

drop policy if exists attendance_imports_insert on storage.objects;
create policy attendance_imports_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attendance-imports'
    and public.hr_att_import_upload_allowed((storage.foldername(name))[1])
  );

-- ---------------------------------------------------------------------------
-- 6. Helpers
-- ---------------------------------------------------------------------------
-- Excel drops the leading zeros of numeric matricules ("031" → 31).
create or replace function public.hr_att_import_mat_key(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(upper(btrim(coalesce(p, ''))), '^0+(?=[0-9])', '');
$$;

create or replace function public.hr_att_import_name_key(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    upper(translate(btrim(coalesce(p, '')),
      'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
      'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY')),
    '[[:space:]''.-]', '', 'g');
$$;

create or replace function public.hr_att_import_period_label(p_from date, p_to date)
returns text
language sql
immutable
as $$
  select public.sys_period_label(extract(year from p_from)::integer, extract(month from p_from)::integer)
      || case when p_to > p_from
           then ' – ' || public.sys_period_label(extract(year from p_to)::integer, extract(month from p_to)::integer)
           else '' end;
$$;

create or replace function public.hr_attendance_import_recount(p_batch uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'read', count(*),
    'ok', count(*) filter (where kind = 'DAY' and status in ('OK', 'WARNING')),
    'warning', count(*) filter (where status = 'WARNING'),
    'error', count(*) filter (where status = 'ERROR'),
    'duplicate', count(*) filter (where status = 'DUPLICATE'),
    'same', count(*) filter (where status = 'SAME'),
    'conflict', count(*) filter (where status = 'CONFLICT'),
    'unresolved', count(*) filter (where status = 'CONFLICT' and resolution is null),
    'take_import', count(*) filter (where status = 'CONFLICT' and resolution = 'IMPORT'),
    'keep_existing', count(*) filter (where status = 'CONFLICT' and resolution = 'KEEP'),
    'hours_lines', count(*) filter (where kind = 'HOURS' and status in ('OK', 'WARNING')),
    'importable', count(*) filter (
      where kind = 'DAY' and (status in ('OK', 'WARNING') or (status = 'CONFLICT' and resolution = 'IMPORT')))
  ) into v
  from public.hr_attendance_import_lines
  where batch_id = p_batch;
  update public.hr_attendance_import_batches set
    lines_read = (v->>'read')::integer,
    lines_accepted = (v->>'importable')::integer,
    lines_rejected = (v->>'error')::integer,
    analysis = jsonb_set(analysis, '{counts}', v)
  where id = p_batch;
  return v;
end;
$$;

-- Payroll inputs changed by a batch: drafts flagged (D3) or generation requested (D4); nothing is calculated.
create or replace function public.hr_attendance_import_signal(p_months jsonb, p_detail text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v jsonb := '[]'::jsonb;
  s jsonb;
begin
  for r in
    select distinct (x.v->>'site_id')::uuid as site_id, (x.v->>'year')::integer as y, (x.v->>'month')::integer as m
    from jsonb_array_elements(coalesce(p_months, '[]'::jsonb)) as x(v)
    order by 2, 3
  loop
    s := public.hr_payroll_signal_input_change('ATTENDANCE', null, null, r.site_id, r.y, r.m, p_detail);
    v := v || jsonb_build_array(jsonb_build_object('site_id', r.site_id, 'year', r.y, 'month', r.m) || coalesce(s, '{}'::jsonb));
  end loop;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Decision types D5, D11, D12
-- ---------------------------------------------------------------------------
insert into public.sys_decision_types (code, label_fr, description_fr, risk_class, policy_allowed, screen_code, options) values
  ('D5',
   'Conflit entre un import de présences et les présences enregistrées',
   'L''analyse d''un lot d''archives a trouvé des présences déjà enregistrées pour les mêmes salariés et les mêmes jours (autre valeur, autre chantier le même jour, ou congé approuvé). Rien n''a été remplacé, écrasé ni fusionné : le lot attend votre décision. Les mois dont la paie est validée ou clôturée sont refusés à l''analyse ; les modifier demande d''abord une réouverture (D7).',
   'RISKY', false, 'decision_attendance_import_conflict',
   jsonb_build_array(
     jsonb_build_object(
       'code', 'KEEP_EXISTING',
       'label_fr', 'Conserver l''existant',
       'consequence_fr', 'Les présences déjà enregistrées restent inchangées ; les lignes importées en conflit ne seront pas importées. Le reste du lot pourra être importé puis validé.',
       'executes', true),
     jsonb_build_object(
       'code', 'TAKE_IMPORT',
       'label_fr', 'Retenir l''import',
       'consequence_fr', 'À l''import du lot, les présences en conflit seront remplacées par les valeurs importées, en attente de validation. Les valeurs remplacées restent consignées dans le lot et sont restaurées si le lot est annulé.',
       'executes', true),
     jsonb_build_object(
       'code', 'LINE_BY_LINE',
       'label_fr', 'Trancher ligne par ligne',
       'consequence_fr', 'Vous choisissez, pour chaque ligne en conflit, de conserver l''existant ou de retenir l''import, depuis l''écran des imports. Le lot reste en attente jusqu''à ce que toutes les lignes soient tranchées.',
       'executes', true),
     jsonb_build_object(
       'code', 'REJECT_BATCH',
       'label_fr', 'Rejeter le lot',
       'consequence_fr', 'Aucune présence n''est importée. Le lot est rejeté et conservé avec son fichier et son rapport pour l''audit.',
       'executes', true))),
  ('D11',
   'Correspondance des codes de présence d''un import',
   'Des codes du fichier importé n''existent pas dans le référentiel des codes de présence. La correspondance proposée peut valoir pour ce lot seulement, ou devenir une politique pour les prochains lots après une seconde confirmation explicite. Tant qu''elle n''est pas validée, les lignes concernées restent rejetées.',
   'ORDINARY', true, 'decision_attendance_code_mapping',
   jsonb_build_array(
     jsonb_build_object(
       'code', 'BATCH_ONLY',
       'label_fr', 'Valider pour ce lot seulement',
       'consequence_fr', 'Les codes sont convertis pour ce lot uniquement ; le lot est analysé à nouveau. Les prochains lots ne sont pas concernés.',
       'executes', true),
     jsonb_build_object(
       'code', 'POLICY',
       'label_fr', 'Valider et conserver comme politique',
       'consequence_fr', 'Les codes sont convertis pour ce lot, et la correspondance est proposée comme politique pour les prochains lots : elle ne s''appliquera qu''après une seconde confirmation depuis l''écran des imports, et reste révocable.',
       'executes', true),
     jsonb_build_object(
       'code', 'REFUSE',
       'label_fr', 'Refuser la correspondance',
       'consequence_fr', 'Rien n''est converti : les lignes concernées restent rejetées et ne seront pas importées.',
       'executes', false))),
  ('D12',
   'Politique de validation des imports de présences par leur auteur',
   'Par défaut, la personne qui importe un lot ne peut pas valider les présences de son propre lot : une autre personne détenant le droit de validation doit le faire. Cette politique explicite, révocable à tout moment par une nouvelle décision, peut l''autoriser. Le SUPER_ADMIN conserve dans tous les cas le droit de valider.',
   'RISKY', false, 'decision_attendance_import_policy',
   jsonb_build_array(
     jsonb_build_object(
       'code', 'ALLOW',
       'label_fr', 'L''auteur peut valider son propre lot',
       'consequence_fr', 'Dès maintenant et jusqu''à révocation, une personne qui importe un lot et détient le droit de validation peut valider ses propres présences importées. La séparation des tâches n''est plus garantie pour les imports.',
       'executes', true),
     jsonb_build_object(
       'code', 'FORBID',
       'label_fr', 'L''auteur ne peut pas valider son propre lot',
       'consequence_fr', 'La validation d''un lot revient toujours à une autre personne que son auteur (SUPER_ADMIN excepté). Choix confirmé explicitement comme politique.',
       'executes', true)))
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 8. D5: conflicts of a batch (context, live fingerprint, request)
-- ---------------------------------------------------------------------------
create or replace function public.hr_attendance_import_d5_fingerprint(p_batch uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(
    coalesce((select b.status from public.hr_attendance_import_batches b where b.id = p_batch), 'MISSING') || '|' ||
    coalesce(string_agg(
      l.id::text || '=' || coalesce((
        select string_agg(
          a.id::text || '/' || a.site_id::text || '/' || a.legend_code || '/' || coalesce(a.status_code, '') || '/' ||
          a.source_code || '/' || a.updated_at::text, ',' order by a.id)
        from public.hr_attendance a
        where a.employee_id = l.employee_id and a.work_date = l.work_date
      ), '-'),
      ',' order by l.id), '')
  )
  from public.hr_attendance_import_lines l
  where l.batch_id = p_batch and l.status = 'CONFLICT';
$$;

create or replace function public.hr_attendance_import_d5_context(p_batch uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'site_name', b.batch_no || ' · ' || coalesce((
      select string_agg(s.name_fr, ', ' order by s.name_fr) from public.ref_sites s where s.id = any (b.site_ids)), ''),
    'batch_id', b.id,
    'batch_no', b.batch_no,
    'period', public.hr_att_import_period_label(b.period_from, b.period_to),
    'reference_year', b.reference_year,
    'nature', b.nature,
    'provenance_kind', b.provenance_kind,
    'provenance_detail', b.provenance_detail,
    'source_produced_on', b.source_produced_on,
    'file_name', b.file_name,
    'sha256', b.sha256,
    'created_by', (select u.full_name from public.sys_users u where u.id = b.created_by),
    'counts', coalesce(b.analysis->'counts', '{}'::jsonb),
    'conflict_total', (select count(*) from public.hr_attendance_import_lines l where l.batch_id = b.id and l.status = 'CONFLICT'),
    'conflicts', coalesce((
      select jsonb_agg(q.item order by q.work_date, q.matricule)
      from (
        select l.work_date, l.matricule,
          jsonb_build_object(
            'line_id', l.id,
            'source_ref', l.source_ref,
            'matricule', l.matricule,
            'employee', coalesce(e.last_name || ' ' || e.first_name, ''),
            'work_date', l.work_date,
            'site_name', s.name_fr,
            'imported_code', l.legend_code,
            'kinds', to_jsonb(l.conflict_kinds),
            'resolution', l.resolution,
            'existing', coalesce((
              select jsonb_agg(jsonb_build_object(
                'site_name', xs.name_fr,
                'legend_code', x.v->>'legend_code',
                'status_code', x.v->>'status_code',
                'source_code', x.v->>'source_code'))
              from jsonb_array_elements(l.existing) as x(v)
              left join public.ref_sites xs on xs.id = (x.v->>'site_id')::uuid
            ), '[]'::jsonb)
          ) as item
        from public.hr_attendance_import_lines l
        left join public.hr_employees e on e.id = l.employee_id
        left join public.ref_sites s on s.id = l.site_id
        where l.batch_id = b.id and l.status = 'CONFLICT'
        order by l.work_date, l.matricule
        limit 300
      ) q
    ), '[]'::jsonb)
  )
  from public.hr_attendance_import_batches b
  where b.id = p_batch;
$$;

create or replace function public.hr_attendance_import_request_d5(p_batch uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.hr_attendance_import_batches%rowtype;
  v_key text := 'D5:' || p_batch::text;
  v_open public.sys_decisions%rowtype;
  v_fp text;
  v_ctx jsonb;
  v_id uuid;
begin
  select * into b from public.hr_attendance_import_batches where id = p_batch;
  v_fp := public.hr_attendance_import_d5_fingerprint(p_batch);
  v_ctx := public.hr_attendance_import_d5_context(p_batch);
  select * into v_open from public.sys_decisions
  where dedupe_key = v_key and status in ('PENDING', 'DECIDED')
  for update;
  if found then
    if v_open.status = 'PENDING' then
      update public.sys_decisions set fingerprint = v_fp, context = v_ctx where id = v_open.id;
    end if;
    return v_open.id;
  end if;

  insert into public.sys_decisions (
    type_code, dedupe_key, period_year, period_month, site_id, scope, context, options, fingerprint,
    request_source, requested_by
  )
  select 'D5', v_key, extract(year from b.period_from)::integer, extract(month from b.period_from)::integer,
         case when cardinality(b.site_ids) = 1 then b.site_ids[1] end,
         jsonb_build_object('batch_id', b.id), v_ctx, t.options, v_fp, 'ATTENDANCE_IMPORT', auth.uid()
  from public.sys_decision_types t
  where t.code = 'D5'
  returning id into v_id;

  perform public.sys_notify(
    'DECISION_PENDING',
    format('Conflits dans l''import de présences %s (%s)', b.batch_no, public.hr_att_import_period_label(b.period_from, b.period_to)),
    format('%s ligne(s) importée(s) en conflit avec des présences déjà enregistrées. Aucun remplacement, écrasement ou fusion n''a été fait : le lot attend votre décision.',
           (v_ctx->>'conflict_total')),
    '/decisions/' || v_id,
    null,
    'decision_attendance_import_conflict',
    v_id
  );
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Dry-run analysis (every anomaly kept, no cap)
-- ---------------------------------------------------------------------------
create or replace function public.hr_attendance_import_analyze_internal(p_batch uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.hr_attendance_import_batches%rowtype;
  v_end date;
  v_counts jsonb;
  v_warn jsonb := '[]'::jsonb;
  v_day_lines integer;
  v_emps integer;
  d public.sys_decisions%rowtype;
begin
  select * into b from public.hr_attendance_import_batches where id = p_batch for update;
  if not found then
    raise exception 'Lot d''import introuvable.' using errcode = 'no_data_found';
  end if;
  if b.status not in ('DRAFT', 'ANALYZED', 'PENDING_DECISION') then
    raise exception 'Lot % : analyse impossible (statut %).', b.batch_no, b.status using errcode = 'check_violation';
  end if;
  if b.sealed_at is null then
    raise exception 'Lot % : toutes les lignes du fichier n''ont pas été reçues. Rejetez ce lot et déposez à nouveau le fichier.', b.batch_no
      using errcode = 'check_violation';
  end if;
  v_end := (b.period_to + interval '1 month')::date;

  -- 0. Reset (the previous existing-value snapshot and resolution are compared in step 8)
  update public.hr_attendance_import_lines set
    employee_id = null, site_id = null, legend_code = null, code_origin = null,
    status = 'PENDING', errors = parse_errors, warnings = '{}'
  where batch_id = p_batch;

  -- 1. Employee (unambiguous matricule) and name consistency
  update public.hr_attendance_import_lines l set employee_id = m.id
  from (
    select k.key, min(e.id::text)::uuid as id, count(*) as n
    from (
      select distinct public.hr_att_import_mat_key(matricule) as key
      from public.hr_attendance_import_lines
      where batch_id = p_batch and btrim(matricule) <> ''
    ) k
    join public.hr_employees e on public.hr_att_import_mat_key(e.matricule) = k.key
    group by k.key
  ) m
  where l.batch_id = p_batch and btrim(l.matricule) <> '' and m.n = 1
    and m.key = public.hr_att_import_mat_key(l.matricule);

  update public.hr_attendance_import_lines l set errors = array_append(l.errors,
    case
      when btrim(l.matricule) = '' then 'MATRICULE_MISSING'
      when (select count(*) from public.hr_employees e
            where public.hr_att_import_mat_key(e.matricule) = public.hr_att_import_mat_key(l.matricule)) > 1
        then 'AMBIGUOUS_MATRICULE'
      else 'UNKNOWN_MATRICULE'
    end)
  where l.batch_id = p_batch and l.employee_id is null;

  update public.hr_attendance_import_lines l set warnings = array_append(l.warnings, 'NAME_MISMATCH')
  from public.hr_employees e
  where l.batch_id = p_batch and e.id = l.employee_id
    and (
      (public.hr_att_import_name_key(l.last_name) <> ''
       and public.hr_att_import_name_key(l.last_name) <> public.hr_att_import_name_key(e.last_name))
      or (public.hr_att_import_name_key(l.first_name) <> ''
          and public.hr_att_import_name_key(l.first_name) <> public.hr_att_import_name_key(e.first_name))
    );

  -- 2. Site
  if b.format = 'GRID' then
    update public.hr_attendance_import_lines set site_id = b.site_ids[1] where batch_id = p_batch;
  else
    update public.hr_attendance_import_lines l set site_id = s.id
    from public.ref_sites s
    where l.batch_id = p_batch and btrim(coalesce(l.site_code, '')) <> ''
      and upper(btrim(s.code)) = upper(btrim(l.site_code));
    update public.hr_attendance_import_lines l set errors = array_append(l.errors,
      case when btrim(coalesce(l.site_code, '')) = '' then 'SITE_MISSING' else 'UNKNOWN_SITE' end)
    where l.batch_id = p_batch and l.site_id is null;
  end if;
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'SITE_OUTSIDE_BATCH')
  where l.batch_id = p_batch and l.site_id is not null and not (l.site_id = any (b.site_ids));

  -- 3. Code: reference code, else correspondence validated for this batch (D11), else confirmed policy
  update public.hr_attendance_import_lines l set legend_code = g.code, code_origin = 'DIRECT'
  from public.ref_legendes g
  where l.batch_id = p_batch and l.kind = 'DAY' and g.is_active and upper(g.code) = upper(btrim(l.source_code));
  update public.hr_attendance_import_lines l set legend_code = g.code, code_origin = 'BATCH_MAP'
  from public.ref_legendes g
  where l.batch_id = p_batch and l.kind = 'DAY' and l.legend_code is null and g.is_active
    and g.code = b.code_map->>upper(btrim(l.source_code));
  update public.hr_attendance_import_lines l set legend_code = g.code, code_origin = 'POLICY'
  from public.hr_attendance_code_mappings m
  join public.ref_legendes g on g.code = m.legend_code and g.is_active
  where l.batch_id = p_batch and l.kind = 'DAY' and l.legend_code is null
    and m.status = 'ACTIVE' and m.source_code = upper(btrim(l.source_code));
  update public.hr_attendance_import_lines l set errors = array_append(l.errors,
    case when btrim(coalesce(l.source_code, '')) = '' then 'CODE_MISSING' else 'UNKNOWN_CODE' end)
  where l.batch_id = p_batch and l.kind = 'DAY' and l.legend_code is null;

  -- 4. Dates and payroll period
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'DATE_MISSING')
  where l.batch_id = p_batch and l.work_date is null
    and not (l.parse_errors && array['DATE_INVALID', 'DAY_OUT_OF_MONTH']);
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'DATE_OUT_OF_PERIOD')
  where l.batch_id = p_batch and l.work_date is not null and (l.work_date < b.period_from or l.work_date >= v_end);
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'FUTURE_DATE')
  where l.batch_id = p_batch and l.work_date > current_date;
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'MONTH_CLOSED')
  where l.batch_id = p_batch and l.work_date is not null and l.site_id is not null
    and public.hr_payroll_period_status(l.site_id, l.work_date) is not null;

  -- 5. Contract covering the date on that site; exit
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'NO_CONTRACT')
  where l.batch_id = p_batch and l.employee_id is not null and l.site_id is not null and l.work_date is not null
    and not exists (
      select 1 from public.hr_contracts c
      where c.employee_id = l.employee_id
        and c.start_date <= case when l.kind = 'HOURS' then (l.work_date + interval '1 month - 1 day')::date else l.work_date end
        and (c.end_date is null or c.end_date >= l.work_date)
        and (
          public.hr_contract_site_at(c.id, greatest(c.start_date, l.work_date)) = l.site_id
          or (l.kind = 'HOURS' and exists (
            select 1 from public.hr_contract_assignments a
            where a.contract_id = c.id and a.site_id = l.site_id
              and a.effective_from between l.work_date and (l.work_date + interval '1 month - 1 day')::date
          ))
        )
    );
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'AFTER_EXIT')
  where l.batch_id = p_batch and l.kind = 'DAY' and l.employee_id is not null and l.work_date is not null
    and exists (
      select 1 from public.hr_employee_exits x
      where x.employee_id = l.employee_id and x.status = 'VALIDATED' and x.exit_date < l.work_date
    );

  -- 6. Overtime hours: per day (0–24, total ≤ 24), per month column (0–300), monthly total per code ≤ 300
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'HOURS_OUT_OF_BOUNDS')
  where l.batch_id = p_batch and l.hours <> '{}'::jsonb
    and (
      exists (
        select 1 from jsonb_each(l.hours) as h(k, v)
        where h.k not in ('HS50', 'HS75', 'HS100')
           or jsonb_typeof(h.v) <> 'number'
           or case when jsonb_typeof(h.v) = 'number'
                   then (h.v)::numeric < 0 or (h.v)::numeric > case when l.kind = 'HOURS' then 300 else 24 end
                   else true end
      )
      or (l.kind = 'DAY' and (
        select coalesce(sum(case when jsonb_typeof(h.v) = 'number' then (h.v)::numeric else 0 end), 0)
        from jsonb_each(l.hours) as h(k, v)
      ) > 24)
    );
  update public.hr_attendance_import_lines l set errors = array_append(l.errors, 'HOURS_MONTH_EXCEEDED')
  from (
    select distinct t.employee_id, t.site_id, t.m
    from (
      select l2.employee_id, l2.site_id, date_trunc('month', l2.work_date)::date as m, h.k,
             sum(case when jsonb_typeof(h.v) = 'number' then (h.v)::numeric else 0 end) as total
      from public.hr_attendance_import_lines l2
      cross join jsonb_each(l2.hours) as h(k, v)
      where l2.batch_id = p_batch and l2.employee_id is not null and l2.work_date is not null
      group by 1, 2, 3, 4
    ) t
    where t.total > 300
  ) g
  where l.batch_id = p_batch and l.hours <> '{}'::jsonb and l.employee_id = g.employee_id
    and l.site_id is not distinct from g.site_id and date_trunc('month', l.work_date)::date = g.m;

  -- 7. Duplicates in the file: same employee and day (two sites, or two different codes, are errors;
  --    identical repeats are ignored after the first)
  update public.hr_attendance_import_lines l set
    errors = case
      when g.sites > 1 then array_append(l.errors, 'DUPLICATE_OTHER_SITE')
      when g.codes > 1 then array_append(l.errors, 'DUPLICATE_DIFFERENT')
      else l.errors end,
    warnings = case
      when g.sites <= 1 and g.codes <= 1 and l.id <> g.first_id then array_append(l.warnings, 'DUPLICATE_IGNORED')
      else l.warnings end,
    status = case when g.sites <= 1 and g.codes <= 1 and l.id <> g.first_id then 'DUPLICATE' else l.status end
  from (
    select employee_id, work_date,
           count(distinct site_id) as sites,
           count(distinct coalesce(legend_code, upper(btrim(coalesce(source_code, ''))))) as codes,
           (array_agg(id order by line_no, source_ref))[1] as first_id
    from public.hr_attendance_import_lines
    where batch_id = p_batch and kind = 'DAY' and employee_id is not null and work_date is not null
    group by employee_id, work_date
    having count(*) > 1
  ) g
  where l.batch_id = p_batch and l.kind = 'DAY' and l.employee_id = g.employee_id and l.work_date = g.work_date;

  -- 8. Existing attendance, leaves: never overwritten silently. A resolution already taken is kept only while
  --    the existing values are exactly those it was taken on.
  update public.hr_attendance_import_lines set
    conflict_kinds = '{}', existing = '[]'::jsonb,
    resolution = null, resolved_by = null, resolved_at = null, resolution_decision = null
  where batch_id = p_batch and (kind = 'HOURS' or errors <> '{}' or status = 'DUPLICATE');

  update public.hr_attendance_import_lines l set
    existing = k.ex,
    conflict_kinds = case when k.other_closed then '{}'::text[] else k.kinds end,
    errors = case when k.other_closed then array_append(l.errors, 'OTHER_SITE_CLOSED') else l.errors end,
    status = case when not k.other_closed and k.same then 'SAME' else l.status end,
    resolution = case when not k.other_closed and cardinality(k.kinds) > 0 and l.existing = k.ex then l.resolution end,
    resolved_by = case when not k.other_closed and cardinality(k.kinds) > 0 and l.existing = k.ex then l.resolved_by end,
    resolved_at = case when not k.other_closed and cardinality(k.kinds) > 0 and l.existing = k.ex then l.resolved_at end,
    resolution_decision = case
      when not k.other_closed and cardinality(k.kinds) > 0 and l.existing = k.ex then l.resolution_decision end
  from (
    select c.id, c.ex,
      array_remove(array[
        case when exists (
          select 1 from jsonb_array_elements(c.ex) as e(v)
          where (e.v->>'site_id')::uuid = c.site_id and e.v->>'legend_code' <> c.legend_code
        ) then 'EXISTING_DIFFERENT' end,
        case when exists (
          select 1 from jsonb_array_elements(c.ex) as e(v) where (e.v->>'site_id')::uuid <> c.site_id
        ) then 'OTHER_SITE' end,
        case when c.on_leave and jsonb_array_length(c.ex) = 0 then 'LEAVE' end
      ], null) as kinds,
      exists (
        select 1 from jsonb_array_elements(c.ex) as e(v)
        where (e.v->>'site_id')::uuid <> c.site_id
          and public.hr_payroll_period_status((e.v->>'site_id')::uuid, c.work_date) is not null
      ) as other_closed,
      (jsonb_array_length(c.ex) = 1
       and (c.ex->0->>'site_id')::uuid = c.site_id
       and c.ex->0->>'legend_code' = c.legend_code) as same
    from (
      select l2.id, l2.site_id, l2.work_date, l2.legend_code,
        coalesce((
          select jsonb_agg(to_jsonb(a) order by a.site_id, a.id)
          from public.hr_attendance a
          where a.employee_id = l2.employee_id and a.work_date = l2.work_date
        ), '[]'::jsonb) as ex,
        exists (
          select 1 from public.hr_leave_requests r
          where r.employee_id = l2.employee_id and r.status = 'APPROVED'
            and l2.work_date between r.start_date and r.end_date
        ) as on_leave
      from public.hr_attendance_import_lines l2
      where l2.batch_id = p_batch and l2.kind = 'DAY' and l2.errors = '{}' and l2.status <> 'DUPLICATE'
    ) c
  ) k
  where l.id = k.id;

  -- 9. Line status
  update public.hr_attendance_import_lines set status = case
      when errors <> '{}' then 'ERROR'
      when status = 'DUPLICATE' then 'DUPLICATE'
      when status = 'SAME' then 'SAME'
      when conflict_kinds <> '{}' then 'CONFLICT'
      when warnings <> '{}' then 'WARNING'
      else 'OK' end
  where batch_id = p_batch;
  update public.hr_attendance_import_lines set
    conflict_kinds = '{}', resolution = null, resolved_by = null, resolved_at = null, resolution_decision = null
  where batch_id = p_batch and status <> 'CONFLICT' and (conflict_kinds <> '{}' or resolution is not null);

  -- 10. Batch report: counts, anomalies by code, control totals, same file already imported
  v_counts := public.hr_attendance_import_recount(p_batch);
  select count(*) filter (where kind = 'DAY'),
         count(distinct public.hr_att_import_mat_key(matricule)) filter (where btrim(matricule) <> '')
    into v_day_lines, v_emps
  from public.hr_attendance_import_lines where batch_id = p_batch;
  if b.duplicate_of is not null then
    v_warn := v_warn || jsonb_build_array((
      select jsonb_build_object('code', 'DUPLICATE_FILE', 'batch_no', o.batch_no, 'status', o.status)
      from public.hr_attendance_import_batches o where o.id = b.duplicate_of));
  end if;
  if b.control_lines is not null and b.control_lines <> v_day_lines then
    v_warn := v_warn || jsonb_build_array(jsonb_build_object('code', 'CONTROL_LINES', 'expected', b.control_lines, 'actual', v_day_lines));
  end if;
  if b.control_employees is not null and b.control_employees <> v_emps then
    v_warn := v_warn || jsonb_build_array(jsonb_build_object('code', 'CONTROL_EMPLOYEES', 'expected', b.control_employees, 'actual', v_emps));
  end if;

  update public.hr_attendance_import_batches set
    analysis = jsonb_build_object(
      'counts', v_counts,
      'warnings', v_warn,
      'day_lines', v_day_lines,
      'employees', v_emps,
      'errors_by_code', coalesce((
        select jsonb_object_agg(x.code, x.n) from (
          select e.code, count(*) as n
          from public.hr_attendance_import_lines l, unnest(l.errors) as e(code)
          where l.batch_id = p_batch group by e.code
        ) x), '{}'::jsonb),
      'warnings_by_code', coalesce((
        select jsonb_object_agg(x.code, x.n) from (
          select w.code, count(*) as n
          from public.hr_attendance_import_lines l, unnest(l.warnings) as w(code)
          where l.batch_id = p_batch group by w.code
        ) x), '{}'::jsonb),
      'conflicts_by_kind', coalesce((
        select jsonb_object_agg(x.code, x.n) from (
          select c.code, count(*) as n
          from public.hr_attendance_import_lines l, unnest(l.conflict_kinds) as c(code)
          where l.batch_id = p_batch group by c.code
        ) x), '{}'::jsonb)
    ),
    analyzed_at = now(),
    analyzed_by = auth.uid(),
    status = case when (v_counts->>'unresolved')::integer > 0 then 'PENDING_DECISION' else 'ANALYZED' end
  where id = p_batch;

  if (v_counts->>'unresolved')::integer > 0 then
    perform public.hr_attendance_import_request_d5(p_batch);
  else
    for d in
      select * from public.sys_decisions
      where dedupe_key = 'D5:' || p_batch::text and status in ('PENDING', 'DECIDED')
    loop
      if d.status = 'PENDING' then
        perform public.sys_decision_close_internal(d.id, 'SUPERSEDED', 'Plus aucun conflit à trancher dans ce lot (nouvelle analyse).');
      else
        update public.sys_decisions set
          status = 'EXECUTED', executed_by = auth.uid(), executed_at = now(),
          execution_result = jsonb_build_object(
            'operation', 'LINE_BY_LINE',
            'take_import', (v_counts->>'take_import')::integer,
            'keep_existing', (v_counts->>'keep_existing')::integer)
        where id = d.id;
      end if;
    end loop;
  end if;

  select * into b from public.hr_attendance_import_batches where id = p_batch;
  return b.analysis || jsonb_build_object('status', b.status);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Batch creation, lines, analysis (import right on every site of the batch)
-- ---------------------------------------------------------------------------
create or replace function public.hr_attendance_import_create(
  p_path text,
  p_name text,
  p_mime text,
  p_size bigint,
  p_sha256 text,
  p jsonb,
  p_parse jsonb,
  p_expected integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_format text := p->>'format';
  v_from date;
  v_to date;
  v_year integer;
  v_sites uuid[];
  v_kind text := p->>'provenance_kind';
  v_detail text := btrim(coalesce(p->>'provenance_detail', ''));
  v_produced date;
  v_nature text;
  v_dup uuid;
  v_ext text;
  v_no text;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_path, '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/source\.(xlsx|csv)$' then
    raise exception 'Chemin du fichier invalide.' using errcode = 'check_violation';
  end if;
  v_id := split_part(p_path, '/', 1)::uuid;
  v_ext := substring(p_path from '\.(xlsx|csv)$');
  if exists (select 1 from public.hr_attendance_import_batches b where b.id = v_id) then
    raise exception 'Ce fichier est déjà rattaché à un lot.' using errcode = 'unique_violation';
  end if;
  if (v_ext = 'xlsx' and p_mime <> 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
     or (v_ext = 'csv' and p_mime <> 'text/csv') then
    raise exception 'Le type du fichier ne correspond pas à son extension.' using errcode = 'check_violation';
  end if;
  if p_size is null or p_size <= 0 or p_size > 10485760 then
    raise exception 'Fichier vide ou trop volumineux (10 Mo maximum).' using errcode = 'check_violation';
  end if;
  if coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte du fichier invalide.' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'attendance-imports' and o.name = p_path
      and (o.metadata->>'size')::bigint = p_size
  ) then
    raise exception 'Fichier non reçu dans le stockage : réessayez l''envoi.' using errcode = 'check_violation';
  end if;

  if v_format not in ('GRID', 'ROWS') then
    raise exception 'Format de fichier inconnu.' using errcode = 'check_violation';
  end if;
  begin
    v_from := (p->>'period_from')::date;
    v_to := (p->>'period_to')::date;
    v_year := (p->>'reference_year')::integer;
    v_produced := nullif(p->>'source_produced_on', '')::date;
    select coalesce(array_agg(distinct x::uuid), '{}') into v_sites from jsonb_array_elements_text(coalesce(p->'site_ids', '[]'::jsonb)) as x;
  exception when others then
    raise exception 'Période, année de référence, date ou chantiers invalides.' using errcode = 'check_violation';
  end;
  if v_from is null or v_to is null or extract(day from v_from) <> 1 or extract(day from v_to) <> 1 or v_to < v_from then
    raise exception 'Période couverte invalide (du premier mois au dernier mois).' using errcode = 'check_violation';
  end if;
  if v_to >= (v_from + interval '12 months')::date then
    raise exception 'Un lot couvre au plus 12 mois.' using errcode = 'check_violation';
  end if;
  if v_to > date_trunc('month', current_date)::date then
    raise exception 'Période future : un import d''archives ne couvre que des mois commencés.' using errcode = 'check_violation';
  end if;
  if v_year is null or v_year not between extract(year from v_from)::integer and extract(year from v_to)::integer then
    raise exception 'L''année de référence doit correspondre à la période couverte.' using errcode = 'check_violation';
  end if;
  if cardinality(v_sites) = 0 or exists (
    select 1 from unnest(v_sites) s(id) where not exists (select 1 from public.ref_sites r where r.id = s.id)
  ) then
    raise exception 'Chantier(s) du lot invalide(s).' using errcode = 'check_violation';
  end if;
  if v_format = 'GRID' and (cardinality(v_sites) <> 1 or v_to <> v_from) then
    raise exception 'Grille mensuelle : un seul chantier et un seul mois par fichier.' using errcode = 'check_violation';
  end if;
  if not public.hr_att_import_sites_allowed(v_sites, 'hr_attendance_import', 'create') then
    raise exception 'Import des archives de présence non autorisé sur au moins un des chantiers du lot.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_kind not in ('PAPER_REGISTER', 'SOURCE_SOFTWARE', 'TRANSMITTED', 'OTHER') then
    raise exception 'Provenance des données obligatoire.' using errcode = 'check_violation';
  end if;
  if char_length(v_detail) < 2 or char_length(v_detail) > 300 then
    raise exception 'Précisez la provenance (registre, logiciel, personne ou service ayant transmis les données).'
      using errcode = 'check_violation';
  end if;
  if v_produced is not null and v_produced > current_date then
    raise exception 'La date de production de la source ne peut pas être future.' using errcode = 'check_violation';
  end if;
  if p_expected is null or p_expected < 0 or p_expected > 200000 then
    raise exception 'Nombre de lignes lues invalide.' using errcode = 'check_violation';
  end if;

  v_nature := case
    when v_to < date '2026-09-01' then 'REPRISE'
    when v_from >= date '2026-09-01' then 'OPERATIONAL'
    else 'MIXED' end;
  select b.id into v_dup from public.hr_attendance_import_batches b
  where b.sha256 = p_sha256 and b.status not in ('REJECTED', 'CANCELLED')
  order by b.created_at desc limit 1;
  v_no := 'IMP-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.hr_attendance_import_batch_seq')::text, 4, '0');

  insert into public.hr_attendance_import_batches (
    id, batch_no, format, period_from, period_to, reference_year, site_ids, nature, provenance_kind, provenance_detail,
    source_produced_on, comment, control_lines, control_employees, storage_path, file_name, mime, size_bytes, sha256,
    duplicate_of, parse_report, lines_expected, sealed_at, created_by
  ) values (
    v_id, v_no, v_format, v_from, v_to, v_year, v_sites, v_nature, v_kind, v_detail,
    v_produced, nullif(btrim(coalesce(p->>'comment', '')), ''),
    nullif(p->>'control_lines', '')::integer, nullif(p->>'control_employees', '')::integer,
    p_path, left(btrim(p_name), 200), p_mime, p_size, p_sha256,
    v_dup, coalesce(p_parse, '{}'::jsonb), p_expected, case when p_expected = 0 then now() end, v_uid
  );
  return v_id;
end;
$$;

create or replace function public.hr_attendance_import_add_lines(p_batch uuid, p_lines jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.hr_attendance_import_batches%rowtype;
  n integer;
  v_total integer;
begin
  select * into b from public.hr_attendance_import_batches where id = p_batch for update;
  if not found then
    raise exception 'Lot d''import introuvable.' using errcode = 'no_data_found';
  end if;
  if b.created_by <> auth.uid() then
    raise exception 'Seul l''auteur du lot transmet ses lignes.' using errcode = 'insufficient_privilege';
  end if;
  if b.status <> 'DRAFT' or b.sealed_at is not null then
    raise exception 'Lot %: toutes les lignes ont déjà été reçues.', b.batch_no using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 2000 then
    raise exception 'Envoi de lignes invalide (1 à 2000 par envoi).' using errcode = 'check_violation';
  end if;
  insert into public.hr_attendance_import_lines (
    batch_id, line_no, source_ref, kind, matricule, last_name, first_name, raw_date, work_date, site_code, source_code,
    hours, parse_errors
  )
  select p_batch, r.line_no, r.source_ref, coalesce(r.kind, 'DAY'), left(coalesce(r.matricule, ''), 40),
         nullif(left(btrim(coalesce(r.last_name, '')), 120), ''), nullif(left(btrim(coalesce(r.first_name, '')), 120), ''),
         left(r.raw_date, 40), r.work_date, nullif(left(btrim(coalesce(r.site_code, '')), 40), ''),
         nullif(left(upper(btrim(coalesce(r.source_code, ''))), 16), ''),
         coalesce(r.hours, '{}'::jsonb), coalesce(r.parse_errors, '{}')
  from jsonb_to_recordset(p_lines) as r(
    line_no integer, source_ref text, kind text, matricule text, last_name text, first_name text, raw_date text,
    work_date date, site_code text, source_code text, hours jsonb, parse_errors text[]
  );
  get diagnostics n = row_count;
  select count(*) into v_total from public.hr_attendance_import_lines where batch_id = p_batch;
  if v_total > b.lines_expected then
    raise exception 'Lot % : plus de lignes reçues que lues dans le fichier.', b.batch_no using errcode = 'check_violation';
  end if;
  if v_total = b.lines_expected then
    update public.hr_attendance_import_batches set sealed_at = now() where id = p_batch;
  end if;
  return n;
end;
$$;

create or replace function public.hr_attendance_import_analyze(p_batch uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.hr_attendance_import_batches%rowtype;
begin
  if auth.uid() is null or not public.sys_user_is_active(auth.uid()) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.hr_attendance_import_batches where id = p_batch;
  if not found then
    raise exception 'Lot d''import introuvable.' using errcode = 'no_data_found';
  end if;
  if not public.hr_att_import_sites_allowed(b.site_ids, 'hr_attendance_import', 'create') then
    raise exception 'Analyse d''import non autorisée sur au moins un des chantiers du lot.' using errcode = 'insufficient_privilege';
  end if;
  return public.hr_attendance_import_analyze_internal(p_batch);
end;
$$;

create or replace function public.hr_attendance_import_add_document(
  p_batch uuid,
  p_path text,
  p_name text,
  p_mime text,
  p_size bigint,
  p_sha256 text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.hr_attendance_import_batches%rowtype;
  v_ext text;
  v_id uuid;
begin
  if auth.uid() is null or not public.sys_user_is_active(auth.uid()) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.hr_attendance_import_batches where id = p_batch;
  if not found then
    raise exception 'Lot d''import introuvable.' using errcode = 'no_data_found';
  end if;
  if not public.hr_att_import_sites_allowed(b.site_ids, 'hr_attendance_import', 'create') then
    raise exception 'Ajout de pièce justificative non autorisé pour ce lot.' using errcode = 'insufficient_privilege';
  end if;
  if b.status in ('REJECTED', 'CANCELLED') then
    raise exception 'Lot clos : aucune pièce ne peut être ajoutée.' using errcode = 'check_violation';
  end if;
  if coalesce(p_path, '') !~ ('^' || p_batch::text || '/pieces/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$') then
    raise exception 'Chemin de la pièce invalide.' using errcode = 'check_violation';
  end if;
  v_ext := substring(p_path from '\.(pdf|jpg|png|webp)$');
  if p_mime is distinct from (case v_ext when 'pdf' then 'application/pdf' when 'jpg' then 'image/jpeg'
                                         when 'png' then 'image/png' else 'image/webp' end) then
    raise exception 'Le type de la pièce ne correspond pas à son extension.' using errcode = 'check_violation';
  end if;
  if p_size is null or p_size <= 0 or p_size > 20971520 then
    raise exception 'Pièce vide ou trop volumineuse (20 Mo maximum).' using errcode = 'check_violation';
  end if;
  if coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte de la pièce invalide.' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'attendance-imports' and o.name = p_path and (o.metadata->>'size')::bigint = p_size
  ) then
    raise exception 'Pièce non reçue dans le stockage : réessayez l''envoi.' using errcode = 'check_violation';
  end if;
  insert into public.hr_attendance_import_documents (batch_id, storage_path, file_name, mime, size_bytes, sha256, description, uploaded_by)
  values (p_batch, p_path, left(btrim(p_name), 200), p_mime, p_size, p_sha256,
          nullif(left(btrim(coalesce(p_description, '')), 300), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. D11: code correspondence (batch only, or policy after a second confirmation)
-- ---------------------------------------------------------------------------
create or replace function public.hr_attendance_import_d11_context(p_scope jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'site_name', b.batch_no || ' · correspondance des codes',
    'batch_id', b.id,
    'batch_no', b.batch_no,
    'period', public.hr_att_import_period_label(b.period_from, b.period_to),
    'provenance_detail', b.provenance_detail,
    'file_name', b.file_name,
    'reason', p_scope->>'reason',
    'pairs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source_code', m.key,
        'legend_code', m.value,
        'legend_label', (select g.label_fr from public.ref_legendes g where g.code = m.value),
        'lines', (select count(*) from public.hr_attendance_import_lines l
                  where l.batch_id = b.id and l.kind = 'DAY' and upper(btrim(l.source_code)) = m.key),
        'policy', (select jsonb_build_object('legend_code', c.legend_code, 'status', c.status)
                   from public.hr_attendance_code_mappings c
                   where c.source_code = m.key and c.status in ('PENDING_CONFIRMATION', 'ACTIVE') limit 1)
      ) order by m.key)
      from jsonb_each_text(p_scope->'map') as m(key, value)
    ), '[]'::jsonb)
  )
  from public.hr_attendance_import_batches b
  where b.id = (p_scope->>'batch_id')::uuid;
$$;

create or replace function public.hr_attendance_import_d11_fingerprint(p_scope jsonb)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(
    coalesce((select b.status from public.hr_attendance_import_batches b where b.id = (p_scope->>'batch_id')::uuid), 'MISSING')
    || '|' || coalesce((p_scope->'map')::text, '')
    || '|' || coalesce((
      select string_agg(m.key || '>' || m.value || ':' || coalesce((select g.is_active::text from public.ref_legendes g where g.code = m.value), 'missing')
                        || ':' || coalesce((select c.status || c.legend_code from public.hr_attendance_code_mappings c
                                            where c.source_code = m.key and c.status in ('PENDING_CONFIRMATION', 'ACTIVE') limit 1), '-'),
                        ',' order by m.key)
      from jsonb_each_text(p_scope->'map') as m(key, value)
    ), '')
  );
$$;

create or replace function public.hr_attendance_import_request_mapping(p_batch uuid, p_map jsonb, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  b public.hr_attendance_import_batches%rowtype;
  v_map jsonb := '{}'::jsonb;
  r record;
  v_key text := 'D11:' || p_batch::text;
  v_scope jsonb;
  v_ctx jsonb;
  v_id uuid;
  v_open uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.hr_attendance_import_batches where id = p_batch for update;
  if not found then
    raise exception 'Lot d''import introuvable.' using errcode = 'no_data_found';
  end if;
  if not public.hr_att_import_sites_allowed(b.site_ids, 'hr_attendance_import', 'create') then
    raise exception 'Demande de correspondance non autorisée pour ce lot.' using errcode = 'insufficient_privilege';
  end if;
  if b.status not in ('ANALYZED', 'PENDING_DECISION') then
    raise exception 'Correspondance possible seulement pour un lot analysé et non importé.' using errcode = 'check_violation';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    raise exception 'Motif de la correspondance obligatoire (10 à 500 caractères).' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_map) <> 'object' then
    raise exception 'Correspondance invalide.' using errcode = 'check_violation';
  end if;
  for r in select upper(btrim(m.key)) as src, btrim(m.value) as dst from jsonb_each_text(p_map) as m(key, value) loop
    if r.src !~ '^[A-Z0-9_+./-]{1,16}$' then
      raise exception 'Code source « % » invalide.', r.src using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.ref_legendes g where upper(g.code) = r.src and g.is_active) then
      raise exception 'Le code « % » existe déjà dans le référentiel : aucune correspondance nécessaire.', r.src
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from public.hr_attendance_import_lines l
      where l.batch_id = p_batch and l.kind = 'DAY' and upper(btrim(l.source_code)) = r.src and 'UNKNOWN_CODE' = any (l.errors)
    ) then
      raise exception 'Le code « % » n''apparaît pas parmi les codes inconnus de ce lot.', r.src using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.ref_legendes g where g.code = r.dst and g.is_active) then
      raise exception 'Code de présence cible « % » inconnu ou désactivé.', r.dst using errcode = 'check_violation';
    end if;
    v_map := v_map || jsonb_build_object(r.src, r.dst);
  end loop;
  if v_map = '{}'::jsonb or (select count(*) from jsonb_object_keys(v_map)) > 50 then
    raise exception 'Indiquez de 1 à 50 correspondances.' using errcode = 'check_violation';
  end if;

  for v_open in select id from public.sys_decisions where dedupe_key = v_key and status = 'PENDING' loop
    perform public.sys_decision_close_internal(v_open, 'SUPERSEDED', 'Nouvelle demande de correspondance pour ce lot.');
  end loop;

  v_scope := jsonb_build_object('batch_id', p_batch, 'map', v_map, 'reason', v_reason);
  v_ctx := public.hr_attendance_import_d11_context(v_scope);
  insert into public.sys_decisions (
    type_code, dedupe_key, period_year, period_month, site_id, scope, context, options, fingerprint,
    request_source, requested_by
  )
  select 'D11', v_key, extract(year from b.period_from)::integer, extract(month from b.period_from)::integer,
         case when cardinality(b.site_ids) = 1 then b.site_ids[1] end,
         v_scope, v_ctx, t.options, public.hr_attendance_import_d11_fingerprint(v_scope), 'ATTENDANCE_IMPORT', v_uid
  from public.sys_decision_types t
  where t.code = 'D11'
  returning id into v_id;

  perform public.sys_notify(
    'DECISION_PENDING',
    format('Correspondance de codes demandée — import %s', b.batch_no),
    format('%s code(s) du fichier à convertir vers le référentiel. Les lignes concernées restent rejetées jusqu''à votre décision.',
           (select count(*) from jsonb_object_keys(v_map))),
    '/decisions/' || v_id,
    null,
    'decision_attendance_code_mapping',
    v_id
  );
  return v_id;
end;
$$;

create or replace function public.hr_attendance_code_mapping_confirm(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m public.hr_attendance_code_mappings%rowtype;
begin
  if not public.sys_decision_can_decide('D11') then
    raise exception 'Confirmation des correspondances de codes non autorisée (droit de décision D11 requis).'
      using errcode = 'insufficient_privilege';
  end if;
  select * into m from public.hr_attendance_code_mappings where id = p_id for update;
  if not found or m.status <> 'PENDING_CONFIRMATION' then
    raise exception 'Correspondance introuvable ou déjà confirmée ou révoquée.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.ref_legendes g where g.code = m.legend_code and g.is_active) then
    raise exception 'Code de présence cible désactivé : révoquez cette correspondance.' using errcode = 'check_violation';
  end if;
  update public.hr_attendance_code_mappings set status = 'ACTIVE', confirmed_by = auth.uid(), confirmed_at = now()
  where id = p_id;
end;
$$;

create or replace function public.hr_attendance_code_mapping_revoke(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m public.hr_attendance_code_mappings%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.sys_decision_can_decide('D11') then
    raise exception 'Révocation des correspondances de codes non autorisée (droit de décision D11 requis).'
      using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    raise exception 'Motif de la révocation obligatoire (10 à 500 caractères).' using errcode = 'check_violation';
  end if;
  select * into m from public.hr_attendance_code_mappings where id = p_id for update;
  if not found or m.status = 'REVOKED' then
    raise exception 'Correspondance introuvable ou déjà révoquée.' using errcode = 'check_violation';
  end if;
  update public.hr_attendance_code_mappings set
    status = 'REVOKED', revoked_by = auth.uid(), revoked_at = now(), revoke_reason = v_reason
  where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. D12: validation policy (single row, default = the author may not validate)
-- ---------------------------------------------------------------------------
create or replace function public.hr_attendance_import_policy_context(p_reason text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'site_name', 'Tous les chantiers',
    'reason', p_reason,
    'current', (select p.importer_may_validate from public.hr_attendance_import_policy p),
    'decided_at', (select p.decided_at from public.hr_attendance_import_policy p),
    'decided_by', (select u.full_name from public.hr_attendance_import_policy p join public.sys_users u on u.id = p.decided_by),
    'batches_to_validate', (select count(*) from public.hr_attendance_import_batches b where b.status = 'IMPORTED')
  );
$$;

create or replace function public.hr_attendance_import_policy_fingerprint()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(coalesce((
    select p.importer_may_validate::text || ':' || p.decision_id::text from public.hr_attendance_import_policy p
  ), 'UNSET'));
$$;

create or replace function public.hr_attendance_import_policy_request(p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_open public.sys_decisions%rowtype;
  v_id uuid;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not (
    public.erp_is_super_admin(v_uid)
    or public.hr_att_import_has('hr_attendance_import', 'update')
    or public.hr_att_import_has('hr_attendance_import_validate', 'update')
  ) then
    raise exception 'Demande de politique de validation non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    raise exception 'Motif de la demande obligatoire (10 à 500 caractères).' using errcode = 'check_violation';
  end if;
  select * into v_open from public.sys_decisions where dedupe_key = 'D12' and status in ('PENDING', 'DECIDED') for update;
  if found then
    if v_open.status = 'PENDING' then
      update public.sys_decisions set
        context = public.hr_attendance_import_policy_context(v_reason),
        scope = jsonb_build_object('reason', v_reason),
        fingerprint = public.hr_attendance_import_policy_fingerprint()
      where id = v_open.id;
    end if;
    return v_open.id;
  end if;
  insert into public.sys_decisions (
    type_code, dedupe_key, scope, context, options, fingerprint, request_source, requested_by
  )
  select 'D12', 'D12', jsonb_build_object('reason', v_reason), public.hr_attendance_import_policy_context(v_reason),
         t.options, public.hr_attendance_import_policy_fingerprint(), 'IMPORT_POLICY', v_uid
  from public.sys_decision_types t
  where t.code = 'D12'
  returning id into v_id;
  perform public.sys_notify(
    'DECISION_PENDING',
    'Politique de validation des imports de présences',
    'Décidez si l''auteur d''un import peut valider son propre lot. Tant que rien n''est décidé, il ne le peut pas.',
    '/decisions/' || v_id,
    null,
    'decision_attendance_import_policy',
    v_id
  );
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Decision execution (same transaction as the decision)
-- ---------------------------------------------------------------------------
create or replace function public.hr_attendance_import_apply_d5(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.sys_decisions%rowtype;
  b public.hr_attendance_import_batches%rowtype;
  n integer := 0;
  v_result jsonb;
begin
  select * into d from public.sys_decisions where id = p_id and type_code = 'D5' and status = 'DECIDED' for update;
  if not found then
    raise exception 'Décision D5 introuvable ou non décidée.' using errcode = 'no_data_found';
  end if;
  select * into b from public.hr_attendance_import_batches where id = (d.scope->>'batch_id')::uuid for update;
  if not found or b.status <> 'PENDING_DECISION' then
    raise exception 'Le lot n''attend plus de décision.' using errcode = 'check_violation';
  end if;
  if d.chosen_option in ('KEEP_EXISTING', 'TAKE_IMPORT') then
    update public.hr_attendance_import_lines set
      resolution = case d.chosen_option when 'TAKE_IMPORT' then 'IMPORT' else 'KEEP' end,
      resolved_by = auth.uid(), resolved_at = now(), resolution_decision = d.id
    where batch_id = b.id and status = 'CONFLICT' and resolution is null;
    get diagnostics n = row_count;
    update public.hr_attendance_import_batches set status = 'ANALYZED' where id = b.id;
    perform public.hr_attendance_import_recount(b.id);
    v_result := jsonb_build_object('operation', 'CONFLICT_RESOLUTION', 'option', d.chosen_option, 'lines', n, 'batch_no', b.batch_no);
  elsif d.chosen_option = 'REJECT_BATCH' then
    update public.hr_attendance_import_batches set
      status = 'REJECTED', closed_by = auth.uid(), closed_at = now(),
      close_reason = left('Rejeté par décision D5 : ' || d.justification, 600)
    where id = b.id;
    for v_result in
      select jsonb_build_object('id', x.id) from public.sys_decisions x
      where x.dedupe_key = 'D11:' || b.id::text and x.status = 'PENDING'
    loop
      perform public.sys_decision_close_internal((v_result->>'id')::uuid, 'SUPERSEDED', 'Lot rejeté (décision D5).');
    end loop;
    v_result := jsonb_build_object('operation', 'BATCH_REJECTED', 'batch_no', b.batch_no);
  else
    raise exception 'Option D5 exécutée depuis l''écran des imports.' using errcode = 'check_violation';
  end if;
  update public.sys_decisions set
    status = 'EXECUTED', executed_by = auth.uid(), executed_at = now(), execution_result = v_result
  where id = d.id;
  return v_result;
end;
$$;

create or replace function public.hr_attendance_import_apply_d11(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.sys_decisions%rowtype;
  b public.hr_attendance_import_batches%rowtype;
  r record;
  v_added integer := 0;
  v_skipped text[] := '{}';
  v_result jsonb;
begin
  select * into d from public.sys_decisions where id = p_id and type_code = 'D11' and status = 'DECIDED' for update;
  if not found then
    raise exception 'Décision D11 introuvable ou non décidée.' using errcode = 'no_data_found';
  end if;
  select * into b from public.hr_attendance_import_batches where id = (d.scope->>'batch_id')::uuid for update;
  if not found or b.status not in ('ANALYZED', 'PENDING_DECISION') then
    raise exception 'Le lot n''est plus en attente d''import.' using errcode = 'check_violation';
  end if;
  update public.hr_attendance_import_batches set code_map = code_map || (d.scope->'map') where id = b.id;
  if d.chosen_option = 'POLICY' then
    for r in select m.key as src, m.value as dst from jsonb_each_text(d.scope->'map') as m(key, value) loop
      if exists (
        select 1 from public.hr_attendance_code_mappings c
        where c.source_code = r.src and c.status in ('PENDING_CONFIRMATION', 'ACTIVE')
      ) then
        v_skipped := array_append(v_skipped, r.src);
      else
        insert into public.hr_attendance_code_mappings (source_code, legend_code, decision_id, batch_id, created_by)
        values (r.src, r.dst, d.id, b.id, auth.uid());
        v_added := v_added + 1;
      end if;
    end loop;
  end if;
  v_result := jsonb_build_object(
    'operation', 'CODE_MAPPING', 'option', d.chosen_option, 'batch_no', b.batch_no,
    'policy_pending_confirmation', v_added, 'policy_already_open', to_jsonb(v_skipped));
  update public.sys_decisions set
    status = 'EXECUTED', executed_by = auth.uid(), executed_at = now(), execution_result = v_result
  where id = d.id;
  v_result := v_result || jsonb_build_object('analysis', public.hr_attendance_import_analyze_internal(b.id));
  return v_result;
end;
$$;

create or replace function public.hr_attendance_import_apply_d12(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.sys_decisions%rowtype;
  v_allow boolean;
  v_result jsonb;
begin
  select * into d from public.sys_decisions where id = p_id and type_code = 'D12' and status = 'DECIDED' for update;
  if not found then
    raise exception 'Décision D12 introuvable ou non décidée.' using errcode = 'no_data_found';
  end if;
  v_allow := case d.chosen_option when 'ALLOW' then true when 'FORBID' then false end;
  if v_allow is null then
    raise exception 'Option D12 inconnue.' using errcode = 'check_violation';
  end if;
  insert into public.hr_attendance_import_policy (id, importer_may_validate, decision_id, decided_by, decided_at)
  values (true, v_allow, d.id, auth.uid(), now())
  on conflict (id) do update set
    importer_may_validate = excluded.importer_may_validate,
    decision_id = excluded.decision_id,
    decided_by = excluded.decided_by,
    decided_at = excluded.decided_at;
  v_result := jsonb_build_object('operation', 'IMPORT_POLICY', 'importer_may_validate', v_allow);
  update public.sys_decisions set
    status = 'EXECUTED', executed_by = auth.uid(), executed_at = now(), execution_result = v_result
  where id = d.id;
  return v_result;
end;
$$;

-- D5 « trancher ligne par ligne »: the SUPER_ADMIN resolves each conflict line on the imports screen; the decision
-- is executed once every conflict line of the batch is resolved.
create or replace function public.hr_attendance_import_resolve_lines(p_decision uuid, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.sys_decisions%rowtype;
  b public.hr_attendance_import_batches%rowtype;
  n integer;
  v_counts jsonb;
  v_result jsonb;
begin
  if not public.sys_decision_can_decide('D5') then
    raise exception 'Les conflits d''import sont tranchés par le SUPER_ADMIN.' using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.sys_decisions where id = p_decision and type_code = 'D5' for update;
  if not found or d.status <> 'DECIDED' or d.chosen_option <> 'LINE_BY_LINE' then
    raise exception 'Décision D5 « trancher ligne par ligne » introuvable ou déjà exécutée.' using errcode = 'check_violation';
  end if;
  select * into b from public.hr_attendance_import_batches where id = (d.scope->>'batch_id')::uuid for update;
  if not found or b.status <> 'PENDING_DECISION' then
    raise exception 'Le lot n''attend plus de décision.' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 2000 then
    raise exception 'Sélection de lignes invalide (1 à 2000).' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as r(id uuid, resolution text)
    where r.resolution not in ('IMPORT', 'KEEP')
       or not exists (
         select 1 from public.hr_attendance_import_lines l
         where l.id = r.id and l.batch_id = b.id and l.status = 'CONFLICT')
  ) then
    raise exception 'Ligne hors des conflits de ce lot, ou choix inconnu.' using errcode = 'check_violation';
  end if;
  update public.hr_attendance_import_lines l set
    resolution = r.resolution, resolved_by = auth.uid(), resolved_at = now(), resolution_decision = d.id
  from jsonb_to_recordset(p_lines) as r(id uuid, resolution text)
  where l.id = r.id and l.resolution is distinct from r.resolution;
  get diagnostics n = row_count;
  v_counts := public.hr_attendance_import_recount(b.id);
  if (v_counts->>'unresolved')::integer = 0 then
    v_result := jsonb_build_object(
      'operation', 'LINE_BY_LINE', 'batch_no', b.batch_no,
      'take_import', (v_counts->>'take_import')::integer,
      'keep_existing', (v_counts->>'keep_existing')::integer);
    update public.hr_attendance_import_batches set status = 'ANALYZED' where id = b.id;
    update public.sys_decisions set
      status = 'EXECUTED', executed_by = auth.uid(), executed_at = now(), execution_result = v_result
    where id = d.id;
  end if;
  return jsonb_build_object('updated', n, 'remaining', (v_counts->>'unresolved')::integer);
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. Import, validation, cancellation
-- ---------------------------------------------------------------------------
create or replace function public.hr_attendance_import_commit(p_batch uuid, p_ack_rejected boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  b public.hr_attendance_import_batches%rowtype;
  v_analysis jsonb;
  v_expected integer;
  n_new integer := 0;
  n_taken integer := 0;
  v_months jsonb;
  v_signals jsonb := '[]'::jsonb;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.hr_attendance_import_batches where id = p_batch for update;
  if not found then
    raise exception 'Lot d''import introuvable.' using errcode = 'no_data_found';
  end if;
  if not public.hr_att_import_sites_allowed(b.site_ids, 'hr_attendance_import', 'create') then
    raise exception 'Import des archives de présence non autorisé sur au moins un des chantiers du lot.'
      using errcode = 'insufficient_privilege';
  end if;
  if b.status <> 'ANALYZED' then
    raise exception 'Lot % : import possible seulement après analyse et décision sur les conflits (statut %).', b.batch_no, b.status
      using errcode = 'check_violation';
  end if;

  -- Fresh check against the data as it is now; new conflicts stop the import and are submitted to decision.
  v_analysis := public.hr_attendance_import_analyze_internal(p_batch);
  if v_analysis->>'status' <> 'ANALYZED' then
    return jsonb_build_object('ok', false, 'reason', 'CONFLICTS',
                              'unresolved', (v_analysis->'counts'->>'unresolved')::integer);
  end if;
  if (v_analysis->'counts'->>'error')::integer > 0 and not coalesce(p_ack_rejected, false) then
    raise exception '% ligne(s) rejetée(s) ne seront pas importées : confirmez l''import des seules lignes acceptées.',
      (v_analysis->'counts'->>'error') using errcode = 'check_violation';
  end if;
  v_expected := (v_analysis->'counts'->>'importable')::integer;
  if v_expected = 0 then
    raise exception 'Aucune ligne à importer dans ce lot.' using errcode = 'check_violation';
  end if;

  -- Months whose validated attendance is replaced on decision (payroll inputs change now).
  select coalesce(jsonb_agg(distinct jsonb_build_object(
           'site_id', (e.v->>'site_id')::uuid,
           'year', extract(year from l.work_date)::integer,
           'month', extract(month from l.work_date)::integer)), '[]'::jsonb)
    into v_months
  from public.hr_attendance_import_lines l
  cross join jsonb_array_elements(l.existing) as e(v)
  where l.batch_id = p_batch and l.status = 'CONFLICT' and l.resolution = 'IMPORT' and e.v->>'status_code' = 'VALIDATED';

  perform set_config('hr.attendance_import', p_batch::text, true);

  delete from public.hr_attendance a
  using public.hr_attendance_import_lines l
  where l.batch_id = p_batch and l.status = 'CONFLICT' and l.resolution = 'IMPORT'
    and a.employee_id = l.employee_id and a.work_date = l.work_date and a.site_id <> l.site_id;

  insert into public.hr_attendance (
    employee_id, site_id, work_date, legend_code, source_code, import_batch_id, correspondence_id,
    status_code, validated_at, validated_by
  )
  select l.employee_id, l.site_id, l.work_date, l.legend_code, 'IMPORT', p_batch, null, 'PROPOSED', null, null
  from public.hr_attendance_import_lines l
  where l.batch_id = p_batch and l.kind = 'DAY' and l.status = 'CONFLICT' and l.resolution = 'IMPORT'
  on conflict (employee_id, site_id, work_date) do update set
    legend_code = excluded.legend_code,
    source_code = 'IMPORT',
    import_batch_id = excluded.import_batch_id,
    correspondence_id = null,
    status_code = 'PROPOSED',
    validated_at = null,
    validated_by = null,
    updated_at = now();
  get diagnostics n_taken = row_count;

  insert into public.hr_attendance (
    employee_id, site_id, work_date, legend_code, source_code, import_batch_id, correspondence_id,
    status_code, validated_at, validated_by
  )
  select l.employee_id, l.site_id, l.work_date, l.legend_code, 'IMPORT', p_batch, null, 'PROPOSED', null, null
  from public.hr_attendance_import_lines l
  where l.batch_id = p_batch and l.kind = 'DAY' and l.status in ('OK', 'WARNING')
  on conflict (employee_id, site_id, work_date) do nothing;
  get diagnostics n_new = row_count;

  perform set_config('hr.attendance_import', '', true);

  if n_new + n_taken <> v_expected then
    raise exception 'Présences modifiées pendant l''import : rien n''a été importé. Relancez l''analyse du lot.'
      using errcode = 'serialization_failure';
  end if;

  update public.hr_attendance_import_batches set
    status = 'IMPORTED', imported_by = v_uid, imported_at = now(), lines_imported = n_new + n_taken
  where id = p_batch;

  if jsonb_array_length(v_months) > 0 then
    v_signals := public.hr_attendance_import_signal(v_months, 'Import ' || b.batch_no || ' : présences validées remplacées sur décision D5');
  end if;

  perform public.sys_notify(
    'ATTENDANCE_IMPORT',
    format('Présences importées à valider — %s (%s)', b.batch_no, public.hr_att_import_period_label(b.period_from, b.period_to)),
    format('%s présence(s) importée(s), en attente de validation. Aucune paie n''est créée ni recalculée.', n_new + n_taken),
    '/rh/presence/imports?lot=' || p_batch::text,
    null,
    'hr_attendance_import_validate',
    null
  );
  return jsonb_build_object('ok', true, 'imported', n_new + n_taken, 'replaced', n_taken, 'signals', v_signals);
end;
$$;

create or replace function public.hr_attendance_import_validate(p_batch uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  b public.hr_attendance_import_batches%rowtype;
  v_may boolean;
  v_months jsonb;
  n integer := 0;
  v_signals jsonb;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.hr_attendance_import_batches where id = p_batch for update;
  if not found then
    raise exception 'Lot d''import introuvable.' using errcode = 'no_data_found';
  end if;
  if not public.hr_att_import_sites_allowed(b.site_ids, 'hr_attendance_import_validate', 'update') then
    raise exception 'Validation des présences importées non autorisée sur au moins un des chantiers du lot.'
      using errcode = 'insufficient_privilege';
  end if;
  if b.status <> 'IMPORTED' then
    raise exception 'Lot % : rien à valider (statut %).', b.batch_no, b.status using errcode = 'check_violation';
  end if;
  if b.created_by = v_uid and not public.erp_is_super_admin(v_uid) then
    select p.importer_may_validate into v_may from public.hr_attendance_import_policy p;
    if not coalesce(v_may, false) then
      raise exception 'Séparation des tâches : vous avez importé ce lot, sa validation revient à une autre personne (politique D12).'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  if exists (
    select 1 from public.hr_attendance a
    where a.import_batch_id = p_batch and a.status_code = 'PROPOSED'
      and public.hr_payroll_period_status(a.site_id, a.work_date) is not null
  ) then
    raise exception 'Paie validée ou clôturée depuis l''import pour un mois de ce lot : validation impossible sans réouverture (D7).'
      using errcode = 'check_violation';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('site_id', q.site_id, 'year', q.y, 'month', q.m)), '[]'::jsonb) into v_months
  from (
    select distinct a.site_id, extract(year from a.work_date)::integer as y, extract(month from a.work_date)::integer as m
    from public.hr_attendance a
    where a.import_batch_id = p_batch and a.status_code = 'PROPOSED'
  ) q;

  perform set_config('hr.attendance_import', p_batch::text, true);
  update public.hr_attendance set
    status_code = 'VALIDATED', validated_at = now(), validated_by = v_uid, updated_at = now()
  where import_batch_id = p_batch and source_code = 'IMPORT' and status_code = 'PROPOSED';
  get diagnostics n = row_count;
  perform set_config('hr.attendance_import', '', true);

  update public.hr_attendance_import_batches set
    status = 'VALIDATED', validated_by = v_uid, validated_at = now(), lines_validated = n
  where id = p_batch;

  v_signals := public.hr_attendance_import_signal(v_months, 'Import ' || b.batch_no || ' validé');
  return jsonb_build_object('validated', n, 'modified_since_import', greatest(b.lines_imported - n, 0), 'signals', v_signals);
end;
$$;

create or replace function public.hr_attendance_import_cancel(p_batch uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  b public.hr_attendance_import_batches%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_open uuid;
  v_months jsonb;
  n_removed integer := 0;
  n_restored integer := 0;
  v_signals jsonb := '[]'::jsonb;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    raise exception 'Motif obligatoire (10 à 500 caractères).' using errcode = 'check_violation';
  end if;
  select * into b from public.hr_attendance_import_batches where id = p_batch for update;
  if not found then
    raise exception 'Lot d''import introuvable.' using errcode = 'no_data_found';
  end if;
  if not public.hr_att_import_sites_allowed(b.site_ids, 'hr_attendance_import', 'update') then
    raise exception 'Annulation des imports de présences non autorisée sur au moins un des chantiers du lot.'
      using errcode = 'insufficient_privilege';
  end if;
  if b.status in ('REJECTED', 'CANCELLED') then
    raise exception 'Lot % déjà clos.', b.batch_no using errcode = 'check_violation';
  end if;

  if b.status in ('DRAFT', 'ANALYZED', 'PENDING_DECISION') then
    update public.hr_attendance_import_batches set
      status = 'REJECTED', closed_by = v_uid, closed_at = now(), close_reason = v_reason
    where id = p_batch;
    for v_open in
      select id from public.sys_decisions
      where dedupe_key in ('D5:' || p_batch::text, 'D11:' || p_batch::text) and status in ('PENDING', 'DECIDED')
    loop
      perform public.sys_decision_close_internal(v_open, 'SUPERSEDED', 'Lot d''import abandonné avant import.');
    end loop;
    return jsonb_build_object('status', 'REJECTED', 'removed', 0, 'restored', 0);
  end if;

  if exists (
    select 1 from public.hr_attendance_import_lines l
    where l.batch_id = p_batch and l.kind = 'DAY'
      and (l.status in ('OK', 'WARNING') or (l.status = 'CONFLICT' and l.resolution = 'IMPORT'))
      and public.hr_payroll_period_status(l.site_id, l.work_date) is not null
  ) then
    raise exception 'Paie validée ou clôturée pour au moins un mois de ce lot : annulation impossible sans réouverture (D7).'
      using errcode = 'check_violation';
  end if;

  select coalesce(jsonb_agg(distinct jsonb_build_object(
           'site_id', l.site_id, 'year', extract(year from l.work_date)::integer, 'month', extract(month from l.work_date)::integer)),
         '[]'::jsonb)
    into v_months
  from public.hr_attendance_import_lines l
  where l.batch_id = p_batch and l.kind = 'DAY'
    and (l.status in ('OK', 'WARNING') or (l.status = 'CONFLICT' and l.resolution = 'IMPORT'));

  perform set_config('hr.attendance_import', p_batch::text, true);
  delete from public.hr_attendance where import_batch_id = p_batch and source_code = 'IMPORT';
  get diagnostics n_removed = row_count;

  -- Values replaced on decision come back when their day is free again (not re-entered since).
  insert into public.hr_attendance
  select (jsonb_populate_record(null::public.hr_attendance, e.v)).*
  from public.hr_attendance_import_lines l
  cross join jsonb_array_elements(l.existing) as e(v)
  where l.batch_id = p_batch and l.status = 'CONFLICT' and l.resolution = 'IMPORT'
    and not exists (
      select 1 from public.hr_attendance a where a.employee_id = l.employee_id and a.work_date = l.work_date
    )
  on conflict do nothing;
  get diagnostics n_restored = row_count;
  perform set_config('hr.attendance_import', '', true);

  update public.hr_attendance_import_batches set
    status = 'CANCELLED', closed_by = v_uid, closed_at = now(), close_reason = v_reason
  where id = p_batch;

  if b.status = 'VALIDATED' or n_restored > 0 then
    v_signals := public.hr_attendance_import_signal(v_months, 'Import ' || b.batch_no || ' annulé');
  end if;
  return jsonb_build_object('status', 'CANCELLED', 'removed', n_removed, 'restored', n_restored, 'signals', v_signals);
end;
$$;

-- ---------------------------------------------------------------------------
-- 15. Decision engine: D5 / D12 not delegable, fingerprints, refresh and immediate execution
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

  -- Reference-data, closing and import decisions run in the same transaction: decided and applied together, or not
  -- at all. D5 « trancher ligne par ligne » is carried out afterwards on the imports screen.
  if v_executes and (
       d.type_code in ('D8', 'D13', 'D2', 'D6', 'D7', 'D11', 'D12')
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
-- 16. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.hr_att_import_batch_guard() from public, anon, authenticated;
revoke all on function public.hr_att_import_line_guard() from public, anon, authenticated;
revoke all on function public.hr_att_import_document_guard() from public, anon, authenticated;
revoke all on function public.hr_att_code_mapping_guard() from public, anon, authenticated;
revoke all on function public.hr_attendance_import_flag() from public, anon, authenticated;
revoke all on function public.hr_attendance_import_row_guard() from public, anon, authenticated;
revoke all on function public.hr_att_import_mat_key(text) from public, anon, authenticated;
revoke all on function public.hr_att_import_name_key(text) from public, anon, authenticated;
revoke all on function public.hr_att_import_period_label(date, date) from public, anon, authenticated;
revoke all on function public.hr_attendance_import_recount(uuid) from public, anon, authenticated;
revoke all on function public.hr_attendance_import_signal(jsonb, text) from public, anon, authenticated;
revoke all on function public.hr_attendance_import_d5_fingerprint(uuid) from public, anon, authenticated;
revoke all on function public.hr_attendance_import_d5_context(uuid) from public, anon, authenticated;
revoke all on function public.hr_attendance_import_request_d5(uuid) from public, anon, authenticated;
revoke all on function public.hr_attendance_import_analyze_internal(uuid) from public, anon, authenticated;
revoke all on function public.hr_attendance_import_d11_context(jsonb) from public, anon, authenticated;
revoke all on function public.hr_attendance_import_d11_fingerprint(jsonb) from public, anon, authenticated;
revoke all on function public.hr_attendance_import_policy_context(text) from public, anon, authenticated;
revoke all on function public.hr_attendance_import_policy_fingerprint() from public, anon, authenticated;
revoke all on function public.hr_attendance_import_apply_d5(uuid) from public, anon, authenticated;
revoke all on function public.hr_attendance_import_apply_d11(uuid) from public, anon, authenticated;
revoke all on function public.hr_attendance_import_apply_d12(uuid) from public, anon, authenticated;
revoke all on function public.sys_decision_current_fingerprint(uuid) from public, anon, authenticated;
revoke all on function public.sys_decision_refresh_record(uuid) from public, anon, authenticated;

revoke all on function public.hr_att_import_has(text, text, uuid) from public, anon;
revoke all on function public.hr_att_import_sites_allowed(uuid[], text, text, uuid) from public, anon;
revoke all on function public.hr_att_import_can_read(uuid[]) from public, anon;
revoke all on function public.hr_att_import_upload_allowed(text) from public, anon;
revoke all on function public.hr_att_import_object_readable(text, text) from public, anon;
revoke all on function public.hr_attendance_import_create(text, text, text, bigint, text, jsonb, jsonb, integer) from public, anon;
revoke all on function public.hr_attendance_import_add_lines(uuid, jsonb) from public, anon;
revoke all on function public.hr_attendance_import_analyze(uuid) from public, anon;
revoke all on function public.hr_attendance_import_add_document(uuid, text, text, text, bigint, text, text) from public, anon;
revoke all on function public.hr_attendance_import_request_mapping(uuid, jsonb, text) from public, anon;
revoke all on function public.hr_attendance_code_mapping_confirm(uuid) from public, anon;
revoke all on function public.hr_attendance_code_mapping_revoke(uuid, text) from public, anon;
revoke all on function public.hr_attendance_import_policy_request(text) from public, anon;
revoke all on function public.hr_attendance_import_resolve_lines(uuid, jsonb) from public, anon;
revoke all on function public.hr_attendance_import_commit(uuid, boolean) from public, anon;
revoke all on function public.hr_attendance_import_validate(uuid) from public, anon;
revoke all on function public.hr_attendance_import_cancel(uuid, text) from public, anon;
revoke all on function public.hr_payroll_request_generation(uuid, integer, integer, text) from public, anon;
revoke all on function public.sys_decision_decide(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.sys_decision_can_decide(text, uuid) from public, anon;

grant execute on function public.hr_att_import_has(text, text, uuid) to authenticated;
grant execute on function public.hr_att_import_sites_allowed(uuid[], text, text, uuid) to authenticated;
grant execute on function public.hr_att_import_can_read(uuid[]) to authenticated;
grant execute on function public.hr_att_import_upload_allowed(text) to authenticated;
grant execute on function public.hr_att_import_object_readable(text, text) to authenticated;
grant execute on function public.hr_attendance_import_create(text, text, text, bigint, text, jsonb, jsonb, integer) to authenticated;
grant execute on function public.hr_attendance_import_add_lines(uuid, jsonb) to authenticated;
grant execute on function public.hr_attendance_import_analyze(uuid) to authenticated;
grant execute on function public.hr_attendance_import_add_document(uuid, text, text, text, bigint, text, text) to authenticated;
grant execute on function public.hr_attendance_import_request_mapping(uuid, jsonb, text) to authenticated;
grant execute on function public.hr_attendance_code_mapping_confirm(uuid) to authenticated;
grant execute on function public.hr_attendance_code_mapping_revoke(uuid, text) to authenticated;
grant execute on function public.hr_attendance_import_policy_request(text) to authenticated;
grant execute on function public.hr_attendance_import_resolve_lines(uuid, jsonb) to authenticated;
grant execute on function public.hr_attendance_import_commit(uuid, boolean) to authenticated;
grant execute on function public.hr_attendance_import_validate(uuid) to authenticated;
grant execute on function public.hr_attendance_import_cancel(uuid, text) to authenticated;
grant execute on function public.hr_payroll_request_generation(uuid, integer, integer, text) to authenticated;
grant execute on function public.sys_decision_decide(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.sys_decision_can_decide(text, uuid) to authenticated;

commit;
