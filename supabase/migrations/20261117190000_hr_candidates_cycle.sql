-- Cycle d'embauche : table des candidats, pièces validées, spécimen imprimé
-- puis scan signé. L'entrée dans la base se fait à l'archivage du contrat.
-- Les salariés déjà présents restent affiliés (présence inchangée).

begin;

insert into public.sys_screens (code, path, module, label_fr, label_ar, sort_order) values
  ('hr_candidates', '/rh/candidats', 'rh',
   'Candidats · cycle d''embauche (pièces, fiche, contrat)',
   'المترشحون', 48)
on conflict (code) do update set
  path = excluded.path,
  label_fr = excluded.label_fr,
  label_ar = excluded.label_ar;

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select p.role_id, s_new.id, p.can_create, p.can_read, p.can_update, p.can_delete, p.can_print, p.can_export
from public.sys_permissions p
join public.sys_screens s_old on s_old.id = p.screen_id and s_old.code = 'employees'
join public.sys_screens s_new on s_new.code = 'hr_candidates'
on conflict (role_id, screen_id) do nothing;

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select r.id, s.id, true, true, true, true, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code = 'SUPER_ADMIN'
  and s.code = 'hr_candidates'
on conflict (role_id, screen_id) do nothing;

-- ---------------------------------------------------------------------------
-- Affiliation : les salariés déjà en base restent visibles au pointage.
-- Un salarié issu du cycle n'apparaît qu'à partir de la date portée sur l'attestation.
-- ---------------------------------------------------------------------------
alter table public.hr_employees
  add column if not exists affiliation_legacy boolean not null default false,
  add column if not exists affiliation_start date;

update public.hr_employees
set affiliation_legacy = true,
    affiliation_start = coalesce(affiliation_start, hired_at, created_at::date);

-- ---------------------------------------------------------------------------
-- Candidats
-- ---------------------------------------------------------------------------
create table if not exists public.hr_candidates (
  id uuid primary key default gen_random_uuid(),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 80),
  first_name text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name_ar text,
  first_name_ar text,
  nin text,
  birth_date date,
  phone text,
  cycle_step text not null default 'IDENTITY'
    check (cycle_step in ('IDENTITY', 'FICHE', 'CONTRACT', 'PROMOTED')),
  employee_id uuid references public.hr_employees(id) on delete set null,
  site_id uuid references public.ref_sites(id),
  activity_code_id uuid references public.ref_activity_codes(id),
  contract_type_code text,
  poste_fr text,
  salaire_base_monthly numeric(14,2) check (salaire_base_monthly is null or salaire_base_monthly >= 0),
  contract_start date,
  contract_end date,
  promoted_at timestamptz,
  created_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contract_end is null or contract_start is null or contract_end >= contract_start)
);

create index if not exists hr_candidates_step_idx on public.hr_candidates (cycle_step, updated_at desc);

drop trigger if exists trg_hr_candidates_updated on public.hr_candidates;
create trigger trg_hr_candidates_updated before update on public.hr_candidates
  for each row execute function public.erp_set_updated_at();

create table if not exists public.hr_candidate_documents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.hr_candidates(id) on delete cascade,
  doc_code text not null check (doc_code ~ '^[A-Z][A-Z0-9_]{0,39}$'),
  family text not null check (family in ('INCOMING', 'PRODUCED')),
  version_no integer not null default 1 check (version_no >= 1),
  is_current boolean not null default true,
  status text not null check (status in (
    'MISSING', 'UPLOADED', 'REJECTED', 'VALIDATED',
    'GENERATED', 'PENDING_REVIEW', 'ARCHIVED'
  )),
  file_url text,
  file_name text,
  storage_path text,
  specimen_url text,
  specimen_name text,
  specimen_path text,
  reject_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists hr_candidate_documents_current_uq
  on public.hr_candidate_documents (candidate_id, doc_code)
  where is_current;

create index if not exists hr_candidate_documents_candidate_idx
  on public.hr_candidate_documents (candidate_id, created_at);

drop trigger if exists trg_hr_candidates_audit on public.hr_candidates;
create trigger trg_hr_candidates_audit
  after insert or update or delete on public.hr_candidates
  for each row execute function public.sys_audit_row_change();

drop trigger if exists trg_hr_candidate_documents_audit on public.hr_candidate_documents;
create trigger trg_hr_candidate_documents_audit
  after insert or update or delete on public.hr_candidate_documents
  for each row execute function public.sys_audit_row_change();

alter table public.hr_candidates enable row level security;
alter table public.hr_candidate_documents enable row level security;

grant select, insert, update, delete on public.hr_candidates to authenticated;
grant select, insert, update, delete on public.hr_candidate_documents to authenticated;

drop policy if exists hr_candidates_read on public.hr_candidates;
create policy hr_candidates_read on public.hr_candidates
  for select to authenticated
  using (
    public.erp_has_perm('hr_candidates', 'read', null)
    or public.erp_has_perm('employees', 'read', null)
  );

drop policy if exists hr_candidates_write on public.hr_candidates;
create policy hr_candidates_write on public.hr_candidates
  for all to authenticated
  using (
    public.erp_has_perm('hr_candidates', 'update', null)
    or public.erp_has_perm('employees', 'update', null)
  )
  with check (
    public.erp_has_perm('hr_candidates', 'update', null)
    or public.erp_has_perm('employees', 'update', null)
  );

drop policy if exists hr_candidate_documents_read on public.hr_candidate_documents;
create policy hr_candidate_documents_read on public.hr_candidate_documents
  for select to authenticated
  using (
    public.erp_has_perm('hr_candidates', 'read', null)
    or public.erp_has_perm('employees', 'read', null)
  );

drop policy if exists hr_candidate_documents_write on public.hr_candidate_documents;
create policy hr_candidate_documents_write on public.hr_candidate_documents
  for all to authenticated
  using (
    public.erp_has_perm('hr_candidates', 'update', null)
    or public.erp_has_perm('employees', 'update', null)
  )
  with check (
    public.erp_has_perm('hr_candidates', 'update', null)
    or public.erp_has_perm('employees', 'update', null)
  );

drop policy if exists hr_docs_insert on storage.objects;
create policy hr_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'hr-docs'
    and (
      public.erp_has_perm('hr_documents', 'update', null)
      or public.erp_has_perm('employees', 'update', null)
      or public.erp_has_perm('hr_candidates', 'update', null)
    )
  );

drop policy if exists hr_docs_update on storage.objects;
create policy hr_docs_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'hr-docs'
    and (
      public.erp_has_perm('hr_documents', 'update', null)
      or public.erp_has_perm('employees', 'update', null)
      or public.erp_has_perm('hr_candidates', 'update', null)
    )
  );

drop policy if exists hr_docs_delete on storage.objects;
create policy hr_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'hr-docs'
    and (
      public.erp_has_perm('hr_documents', 'update', null)
      or public.erp_has_perm('employees', 'update', null)
      or public.erp_has_perm('hr_candidates', 'update', null)
    )
  );

-- ---------------------------------------------------------------------------
-- Pointage : un salarié du cycle n'entre dans la feuille qu'avec une date d'affiliation.
-- Cette date devient le premier jour pointable du segment.
-- ---------------------------------------------------------------------------
create or replace function public.hr_attendance_roster()
returns table (
  employee_id uuid,
  matricule text,
  last_name text,
  first_name text,
  poste text,
  site_id uuid,
  site_name text,
  start_date date,
  end_date date,
  status text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with seg as (
    select
      a.contract_id,
      a.site_id,
      greatest(a.effective_from, c.start_date) as seg_start,
      lead(a.effective_from) over (partition by a.contract_id order by a.effective_from) as next_from
    from public.hr_contract_assignments a
    join public.hr_contracts c on c.id = a.contract_id
  )
  select
    c.employee_id,
    e.matricule,
    e.last_name,
    e.first_name,
    coalesce(nullif(btrim(c.poste_fr), ''), nullif(btrim(c.poste_ar), ''), '') as poste,
    g.site_id,
    s.name_fr as site_name,
    case
      when e.affiliation_legacy or e.affiliation_start is null then g.seg_start
      else greatest(g.seg_start, e.affiliation_start)
    end as start_date,
    case
      when g.next_from is null then c.end_date
      when c.end_date is null then g.next_from - 1
      else least(c.end_date, g.next_from - 1)
    end as end_date,
    c.status::text as status
  from seg g
  join public.hr_contracts c on c.id = g.contract_id
  join public.hr_employees e on e.id = c.employee_id
  join public.ref_sites s on s.id = g.site_id
  where (c.end_date is null or g.seg_start <= c.end_date)
    and (g.next_from is null or g.seg_start < g.next_from)
    and public.erp_can_see_site(g.site_id)
    and public.erp_has_perm('hr_attendance', 'read'::public.rbac_action, g.site_id)
    and (
      e.affiliation_legacy
      or (
        e.affiliation_start is not null
        and (c.end_date is null or c.end_date >= e.affiliation_start)
        and (g.next_from is null or g.next_from > e.affiliation_start)
      )
    )
  order by c.employee_id, g.site_id, g.seg_start desc;
$$;

insert into public.sys_ui_catalog_seen (item_key)
values ('rh.candidats')
on conflict (item_key) do nothing;

commit;
