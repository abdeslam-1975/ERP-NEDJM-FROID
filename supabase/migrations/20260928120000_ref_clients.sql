-- Client référentiel. Les contrats gardent client_name comme copie d'affichage
-- (factures, coûts) et pointent vers ref_clients.client_id.

create table if not exists public.ref_clients (
  id uuid primary key default gen_random_uuid(),
  code_client text,
  nom_fr text not null,
  nom_ar text,
  code_activite text,
  nif text,
  nis text,
  rc text,
  article_imposition text,
  adresse text,
  wilaya text,
  commune text,
  telephone text,
  email text,
  site_web text,
  banque_nom text,
  banque_compte text,
  banque_rib text,
  responsable_nom text,
  responsable_telephone text,
  responsable_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ref_clients_nom_fr_len check (char_length(btrim(nom_fr)) >= 2)
);

create unique index if not exists ref_clients_code_uidx
  on public.ref_clients (code_client)
  where code_client is not null;

create unique index if not exists ref_clients_nif_uidx
  on public.ref_clients (nif)
  where nif is not null;

create unique index if not exists ref_clients_nis_uidx
  on public.ref_clients (nis)
  where nis is not null;

create unique index if not exists ref_clients_rc_uidx
  on public.ref_clients (rc)
  where rc is not null;

create unique index if not exists ref_clients_rib_uidx
  on public.ref_clients (banque_rib)
  where banque_rib is not null;

drop trigger if exists ref_clients_set_updated_at on public.ref_clients;
create trigger ref_clients_set_updated_at
  before update on public.ref_clients
  for each row execute function public.erp_set_updated_at();

alter table public.ref_clients enable row level security;

drop policy if exists ref_clients_read on public.ref_clients;
create policy ref_clients_read on public.ref_clients
  for select to authenticated
  using (
    public.erp_is_super_admin()
    or exists (
      select 1
      from public.sys_user_site_roles usr
      where usr.user_id = auth.uid()
        and public.erp_has_perm('client_contracts', 'read', usr.site_id)
    )
  );

drop policy if exists ref_clients_write on public.ref_clients;
create policy ref_clients_write on public.ref_clients
  for all to authenticated
  using (
    public.erp_is_super_admin()
    or exists (
      select 1
      from public.sys_user_site_roles usr
      where usr.user_id = auth.uid()
        and public.erp_has_perm('client_contracts', 'update', usr.site_id)
    )
  )
  with check (
    public.erp_is_super_admin()
    or exists (
      select 1
      from public.sys_user_site_roles usr
      where usr.user_id = auth.uid()
        and public.erp_has_perm('client_contracts', 'update', usr.site_id)
    )
  );

grant select, insert, update, delete on public.ref_clients to authenticated;

insert into public.sys_screens (code, path, module, label_fr, sort_order)
values ('ref_clients', '/referentiels/clients', 'com', 'Clients', 141)
on conflict (code) do update
  set path = excluded.path,
      module = excluded.module,
      label_fr = excluded.label_fr,
      sort_order = excluded.sort_order;

alter table public.ref_contracts
  add column if not exists client_id uuid references public.ref_clients(id) on delete restrict;

create index if not exists ref_contracts_client_idx
  on public.ref_contracts (client_id);

insert into public.ref_clients (nom_fr, code_client)
select names.nom_fr,
       'CLI-' || lpad(row_number() over (order by names.nom_fr)::text, 4, '0')
from (
  select distinct btrim(client_name) as nom_fr
  from public.ref_contracts
  where btrim(client_name) <> ''
) names
where not exists (
  select 1 from public.ref_clients c where c.nom_fr = names.nom_fr
);

update public.ref_contracts k
set client_id = c.id
from public.ref_clients c
where k.client_id is null
  and c.nom_fr = btrim(k.client_name);
