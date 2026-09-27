-- AI extraction drafts for client contracts. Nothing here touches ref_contracts:
-- a user reviews the proposals and applies the ones they accept.

begin;

alter table public.contract_documents
  drop constraint if exists contract_documents_kind_check;
alter table public.contract_documents
  add constraint contract_documents_kind_check
  check (kind in ('CONTRAT', 'EXTRAIT', 'AVENANT', 'ANNEXE', 'CAHIER_CHARGES', 'PV', 'CORRESPONDANCE', 'AUTRE'));

create table if not exists public.contract_extractions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.ref_contracts(id) on delete cascade,
  document_ids uuid[] not null default '{}',
  targets text[] not null,
  pasted_text boolean not null default false,
  status text not null default 'DONE'
    check (status in ('DONE', 'APPLIED', 'DISCARDED')),
  model text not null,
  result jsonb not null,
  applied_selection jsonb,
  applied_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists contract_extractions_contract_idx
  on public.contract_extractions (contract_id, created_at desc);

alter table public.contract_extractions enable row level security;

drop policy if exists contract_extractions_read on public.contract_extractions;
create policy contract_extractions_read on public.contract_extractions
  for select to authenticated
  using (
    exists (
      select 1 from public.ref_contracts c
      where c.id = contract_id
        and public.erp_can_see_site(c.site_id)
        and public.erp_has_perm('client_contracts', 'read', c.site_id)
    )
  );

drop policy if exists contract_extractions_write on public.contract_extractions;
create policy contract_extractions_write on public.contract_extractions
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

grant select, insert, update, delete on public.contract_extractions to authenticated;

commit;
