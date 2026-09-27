-- Documents attached to a client contract (signed copy, amendments, annexes...).
-- Files live in the private bucket contract-docs under <contract_id>/<uuid>.<ext>
-- and are served through /api/contracts/documents/<id> (signed URL).

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contract-docs',
  'contract-docs',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.contract_documents (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.ref_contracts(id) on delete cascade,
  kind text not null default 'CONTRAT'
    check (kind in ('CONTRAT', 'AVENANT', 'ANNEXE', 'CAHIER_CHARGES', 'PV', 'CORRESPONDANCE', 'AUTRE')),
  title text,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  signed_on date,
  notes text,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint contract_documents_path_prefix
    check (split_part(storage_path, '/', 1) = contract_id::text)
);

create index if not exists contract_documents_contract_idx
  on public.contract_documents (contract_id, created_at desc);

alter table public.contract_documents enable row level security;

drop policy if exists contract_documents_read on public.contract_documents;
create policy contract_documents_read on public.contract_documents
  for select to authenticated
  using (
    exists (
      select 1 from public.ref_contracts c
      where c.id = contract_id
        and public.erp_can_see_site(c.site_id)
        and public.erp_has_perm('client_contracts', 'read', c.site_id)
    )
  );

drop policy if exists contract_documents_write on public.contract_documents;
create policy contract_documents_write on public.contract_documents
  for all to authenticated
  using (
    exists (
      select 1 from public.ref_contracts c
      where c.id = contract_id
        and public.erp_has_perm('client_contracts', 'update', c.site_id)
    )
  )
  with check (
    exists (
      select 1 from public.ref_contracts c
      where c.id = contract_id
        and public.erp_has_perm('client_contracts', 'update', c.site_id)
    )
  );

grant select, insert, update, delete on public.contract_documents to authenticated;

drop policy if exists contract_docs_select on storage.objects;
create policy contract_docs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'contract-docs'
    and exists (
      select 1 from public.ref_contracts c
      where c.id::text = (storage.foldername(name))[1]
        and public.erp_can_see_site(c.site_id)
        and public.erp_has_perm('client_contracts', 'read', c.site_id)
    )
  );

drop policy if exists contract_docs_insert on storage.objects;
create policy contract_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'contract-docs'
    and exists (
      select 1 from public.ref_contracts c
      where c.id::text = (storage.foldername(name))[1]
        and public.erp_has_perm('client_contracts', 'update', c.site_id)
    )
  );

drop policy if exists contract_docs_delete on storage.objects;
create policy contract_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'contract-docs'
    and exists (
      select 1 from public.ref_contracts c
      where c.id::text = (storage.foldername(name))[1]
        and public.erp_has_perm('client_contracts', 'update', c.site_id)
    )
  );

commit;
