-- =============================================================================
-- Ventes Admin — sal_rights + sal_lists + sal_can extension.
-- Does NOT alter Banque (fin_bank_*) or Caisse (caisse_*) tables/RPCs.
-- Adds optional SELECT/INSERT/UPDATE policies on ref_clients for ventes only.
-- =============================================================================

begin;

-- ---- Fine-grained ventes rights (parallel to caisse_rights, isolated) ----

create table if not exists public.sal_rights (
  user_id uuid primary key references public.sys_users(id) on delete cascade,
  ventes_active boolean not null default true,
  can_saisie boolean not null default true,
  can_emit boolean not null default true,
  can_encaisser boolean not null default false,
  can_cancel boolean not null default false,
  can_admin boolean not null default false,
  can_export boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.sys_users(id) on delete set null
);

comment on table public.sal_rights is
  'Droits fins module Ventes (indépendant de caisse_rights / Banque).';

drop trigger if exists trg_sal_rights_updated on public.sal_rights;
create trigger trg_sal_rights_updated
  before update on public.sal_rights
  for each row execute function public.erp_set_updated_at();

-- ---- UI lists (banques prévues, établie par, modes) ----

create table if not exists public.sal_lists (
  id uuid primary key default gen_random_uuid(),
  list_key text not null
    check (list_key = upper(trim(list_key)) and list_key in ('BANK_EXPECTED', 'ETABLIE_PAR', 'PAYMENT_MODE')),
  label text not null check (char_length(trim(label)) between 1 and 160),
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (list_key, label)
);

create index if not exists sal_lists_key_idx
  on public.sal_lists (list_key, sort_order, label)
  where active;

insert into public.sal_lists (list_key, label, sort_order)
values
  ('BANK_EXPECTED', 'BEA SETIF', 10),
  ('BANK_EXPECTED', 'EL BARAKA', 20),
  ('BANK_EXPECTED', 'BNA', 30),
  ('PAYMENT_MODE', 'Virement', 10),
  ('PAYMENT_MODE', 'Chèque', 20),
  ('PAYMENT_MODE', 'Espèces', 30)
on conflict (list_key, label) do nothing;

-- ---- Defaults (TVA / RG / Timbre) ----

create table if not exists public.sal_settings (
  key text primary key check (char_length(trim(key)) between 1 and 64),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.sys_users(id) on delete set null
);

insert into public.sal_settings (key, value)
values (
  'defaults',
  jsonb_build_object(
    'tax_rate', 0,
    'retention_rate', 0.1,
    'stamp_amount', 0
  )
)
on conflict (key) do nothing;

-- ---- Admin helper ----

create or replace function public.sal_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and (
      public.erp_is_super_admin()
      or public.fin_can_access('update', null)
      or exists (
        select 1
        from public.sal_rights r
        where r.user_id = auth.uid()
          and r.ventes_active
          and r.can_admin
      )
    );
$$;

revoke all on function public.sal_is_admin() from public;
grant execute on function public.sal_is_admin() to authenticated;

-- Extend sal_can: keep screen/finance OR sal_rights flags
create or replace function public.sal_can(p_action public.rbac_action)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and (
      public.erp_has_perm('ventes', p_action, null)
      or public.fin_can_access(p_action, null)
      or exists (
        select 1
        from public.sal_rights r
        where r.user_id = auth.uid()
          and r.ventes_active
          and (
            (p_action = 'read')
            or (p_action = 'create' and r.can_saisie)
            or (
              p_action = 'update'
              and (r.can_saisie or r.can_emit or r.can_encaisser or r.can_admin)
            )
            or (p_action = 'delete' and (r.can_cancel or r.can_admin))
          )
      )
    );
$$;

revoke all on function public.sal_can(public.rbac_action) from public;
grant execute on function public.sal_can(public.rbac_action) to authenticated;

-- ---- RLS ----

alter table public.sal_rights enable row level security;
alter table public.sal_lists enable row level security;
alter table public.sal_settings enable row level security;

grant select on public.sal_rights to authenticated;
grant select, insert, update, delete on public.sal_rights to authenticated;
grant select on public.sal_lists to authenticated;
grant select, insert, update, delete on public.sal_lists to authenticated;
grant select on public.sal_settings to authenticated;
grant select, insert, update on public.sal_settings to authenticated;

drop policy if exists sal_rights_read on public.sal_rights;
create policy sal_rights_read on public.sal_rights
  for select to authenticated
  using (public.sal_can('read') or user_id = auth.uid());

drop policy if exists sal_rights_write on public.sal_rights;
create policy sal_rights_write on public.sal_rights
  for all to authenticated
  using (public.sal_is_admin())
  with check (public.sal_is_admin());

drop policy if exists sal_lists_read on public.sal_lists;
create policy sal_lists_read on public.sal_lists
  for select to authenticated
  using (public.sal_can('read'));

drop policy if exists sal_lists_write on public.sal_lists;
create policy sal_lists_write on public.sal_lists
  for all to authenticated
  using (public.sal_is_admin())
  with check (public.sal_is_admin());

drop policy if exists sal_settings_read on public.sal_settings;
create policy sal_settings_read on public.sal_settings
  for select to authenticated
  using (public.sal_can('read'));

drop policy if exists sal_settings_write on public.sal_settings;
create policy sal_settings_write on public.sal_settings
  for all to authenticated
  using (public.sal_is_admin())
  with check (public.sal_is_admin());

-- Clients: ventes may read / admin may insert-update (no delete; no Banque/Caisse change)
drop policy if exists ref_clients_sal_read on public.ref_clients;
create policy ref_clients_sal_read on public.ref_clients
  for select to authenticated
  using (public.sal_can('read'));

drop policy if exists ref_clients_sal_insert on public.ref_clients;
create policy ref_clients_sal_insert on public.ref_clients
  for insert to authenticated
  with check (public.sal_is_admin());

drop policy if exists ref_clients_sal_update on public.ref_clients;
create policy ref_clients_sal_update on public.ref_clients
  for update to authenticated
  using (public.sal_is_admin())
  with check (public.sal_is_admin());

-- Contracts list for invoice picker (read-only)
drop policy if exists ref_contracts_sal_read on public.ref_contracts;
create policy ref_contracts_sal_read on public.ref_contracts
  for select to authenticated
  using (public.sal_can('read'));

commit;
