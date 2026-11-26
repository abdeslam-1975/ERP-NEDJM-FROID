-- Banque archive documents: private Storage bucket + import tracking.
-- Files land under banque-docs/<account_id>/<line_id>/<kind>__<driveFileId>.<ext>
-- App serves them via /api/banque/documents/[lineId]/[kind] (signed URL).

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'banque-docs',
  'banque-docs',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.fin_bank_doc_imports (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.fin_bank_lines(id) on delete cascade,
  kind text not null check (kind in ('bc', 'mode', 'fac')),
  drive_file_id text not null,
  drive_url text not null,
  storage_path text not null,
  file_name text not null default '',
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  imported_at timestamptz not null default now(),
  constraint fin_bank_doc_imports_uniq unique (line_id, kind),
  constraint fin_bank_doc_imports_path_uniq unique (storage_path)
);

create index if not exists fin_bank_doc_imports_drive_idx
  on public.fin_bank_doc_imports (drive_file_id);

alter table public.fin_bank_doc_imports enable row level security;

drop policy if exists fin_bank_doc_imports_read on public.fin_bank_doc_imports;
create policy fin_bank_doc_imports_read on public.fin_bank_doc_imports
  for select to authenticated
  using (public.erp_has_perm('finance', 'read', null));

drop policy if exists fin_bank_doc_imports_write on public.fin_bank_doc_imports;
create policy fin_bank_doc_imports_write on public.fin_bank_doc_imports
  for all to authenticated
  using (public.erp_has_perm('finance', 'update', null))
  with check (public.erp_has_perm('finance', 'update', null));

grant select, insert, update, delete on public.fin_bank_doc_imports to authenticated;

drop policy if exists banque_docs_select on storage.objects;
create policy banque_docs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'banque-docs'
    and public.erp_has_perm('finance', 'read', null)
  );

drop policy if exists banque_docs_insert on storage.objects;
create policy banque_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'banque-docs'
    and public.erp_has_perm('finance', 'update', null)
  );

drop policy if exists banque_docs_update on storage.objects;
create policy banque_docs_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'banque-docs'
    and public.erp_has_perm('finance', 'update', null)
  )
  with check (
    bucket_id = 'banque-docs'
    and public.erp_has_perm('finance', 'update', null)
  );

drop policy if exists banque_docs_delete on storage.objects;
create policy banque_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'banque-docs'
    and public.erp_has_perm('finance', 'update', null)
  );

commit;
