-- Documents created from Paramètres RH › Documents › Créer un document: definition (source of the data,
-- fields typed at print time, page setup, numbering), uploaded fonts and letterheads, yearly numbering and
-- the register of the printed copies. The template itself is a doc_templates row (doc_type = 'custom_' || code).

begin;

create table if not exists public.hr_doc_defs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  doc_type text generated always as ('custom_' || code) stored,
  name_fr text not null check (length(trim(name_fr)) between 1 and 160),
  name_ar text not null default '',
  family text not null default 'autres' check (family in ('lettres', 'fiches', 'contrats', 'autres')),
  lang text not null default 'fr' check (lang in ('fr', 'ar', 'bi')),
  source text not null check (source in ('employee', 'contract', 'leave', 'mission', 'exit', 'free')),
  inputs jsonb not null default '[]'::jsonb check (jsonb_typeof(inputs) = 'array'),
  page jsonb not null default '{}'::jsonb check (jsonb_typeof(page) = 'object'),
  numbering jsonb not null default '{}'::jsonb check (jsonb_typeof(numbering) = 'object'),
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.hr_doc_defs_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.code is distinct from old.code or new.source is distinct from old.source then
    raise exception 'Le code et la source d''un document ne changent plus après sa création.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_doc_defs_guard on public.hr_doc_defs;
create trigger trg_hr_doc_defs_guard before update on public.hr_doc_defs
  for each row execute function public.hr_doc_defs_guard();

drop trigger if exists trg_hr_doc_defs_u on public.hr_doc_defs;
create trigger trg_hr_doc_defs_u before update on public.hr_doc_defs
  for each row execute function public.erp_set_updated_at();

alter table public.hr_doc_defs enable row level security;

drop policy if exists hr_doc_defs_read on public.hr_doc_defs;
create policy hr_doc_defs_read on public.hr_doc_defs
  for select to authenticated using (true);

drop policy if exists hr_doc_defs_insert on public.hr_doc_defs;
create policy hr_doc_defs_insert on public.hr_doc_defs
  for insert to authenticated with check (public.erp_has_perm('hr_settings', 'update', null));

drop policy if exists hr_doc_defs_update on public.hr_doc_defs;
create policy hr_doc_defs_update on public.hr_doc_defs
  for update to authenticated
  using (public.erp_has_perm('hr_settings', 'update', null))
  with check (public.erp_has_perm('hr_settings', 'update', null));

grant select, insert, update on public.hr_doc_defs to authenticated;

comment on table public.hr_doc_defs is
  'Documents créés depuis l''interface (Paramètres RH › Documents › Créer un document). Modèle : doc_templates.doc_type = ''custom_'' || code.';

-- ---------------------------------------------------------------------------
-- Fonts uploaded by the users (the bundled ones ship with the application)
-- ---------------------------------------------------------------------------
create table if not exists public.doc_fonts (
  id uuid primary key default gen_random_uuid(),
  family text not null check (family ~ '^[A-Za-z0-9 _-]{2,60}$'),
  weight integer not null default 400 check (weight between 100 and 900),
  style text not null default 'normal' check (style in ('normal', 'italic')),
  format text not null check (format in ('woff2', 'woff', 'truetype', 'opentype')),
  storage_path text not null,
  url text not null,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (family, weight, style)
);

alter table public.doc_fonts enable row level security;

drop policy if exists doc_fonts_read on public.doc_fonts;
create policy doc_fonts_read on public.doc_fonts
  for select to authenticated using (true);

drop policy if exists doc_fonts_write on public.doc_fonts;
create policy doc_fonts_write on public.doc_fonts
  for all to authenticated
  using (public.erp_has_perm('hr_settings', 'update', null))
  with check (public.erp_has_perm('hr_settings', 'update', null));

grant select, insert, update, delete on public.doc_fonts to authenticated;

-- Fonts and letterheads are not personal data: public bucket, so print frames and PDFs load them directly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'doc-assets',
  'doc-assets',
  true,
  8388608,
  array['font/woff2', 'font/woff', 'font/ttf', 'font/otf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists doc_assets_select on storage.objects;
create policy doc_assets_select on storage.objects
  for select to authenticated
  using (bucket_id = 'doc-assets');

drop policy if exists doc_assets_insert on storage.objects;
create policy doc_assets_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'doc-assets' and public.erp_has_perm('hr_settings', 'update', null));

drop policy if exists doc_assets_delete on storage.objects;
create policy doc_assets_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'doc-assets' and public.erp_has_perm('hr_settings', 'update', null));

-- ---------------------------------------------------------------------------
-- Numbering: one counter per document and period ('' = never reset, '2026' = yearly)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_doc_counters (
  doc_type text not null,
  period text not null,
  last_value integer not null default 0,
  primary key (doc_type, period)
);

alter table public.hr_doc_counters enable row level security;

create or replace function public.hr_doc_next_seq(p_doc_type text, p_period text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer;
begin
  if not public.erp_has_perm('hr_documents', 'update', null) then
    raise exception 'Droits insuffisants pour numéroter un document.';
  end if;
  if not exists (select 1 from public.hr_doc_defs d where d.doc_type = p_doc_type) then
    raise exception 'Document inconnu : %', p_doc_type;
  end if;
  insert into public.hr_doc_counters as c (doc_type, period, last_value)
  values (p_doc_type, coalesce(p_period, ''), 1)
  on conflict (doc_type, period) do update set last_value = c.last_value + 1
  returning last_value into v;
  return v;
end;
$$;

revoke all on function public.hr_doc_next_seq(text, text) from public;
grant execute on function public.hr_doc_next_seq(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Register of the printed copies (PDF archived in the private hr-docs bucket)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_doc_issued (
  id uuid primary key default gen_random_uuid(),
  def_id uuid not null references public.hr_doc_defs(id) on delete restrict,
  doc_type text not null,
  template_version integer,
  reference text unique,
  employee_id uuid references public.hr_employees(id) on delete restrict,
  source_id uuid,
  inputs jsonb not null default '{}'::jsonb,
  storage_path text,
  status text not null default 'ISSUED' check (status in ('ISSUED', 'CANCELLED')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists hr_doc_issued_def_idx on public.hr_doc_issued (def_id, created_at desc);
create index if not exists hr_doc_issued_emp_idx on public.hr_doc_issued (employee_id);

alter table public.hr_doc_issued enable row level security;

drop policy if exists hr_doc_issued_read on public.hr_doc_issued;
create policy hr_doc_issued_read on public.hr_doc_issued
  for select to authenticated using (public.erp_has_perm('hr_documents', 'read', null));

drop policy if exists hr_doc_issued_insert on public.hr_doc_issued;
create policy hr_doc_issued_insert on public.hr_doc_issued
  for insert to authenticated with check (public.erp_has_perm('hr_documents', 'update', null));

drop policy if exists hr_doc_issued_update on public.hr_doc_issued;
create policy hr_doc_issued_update on public.hr_doc_issued
  for update to authenticated
  using (public.erp_has_perm('hr_documents', 'update', null))
  with check (public.erp_has_perm('hr_documents', 'update', null));

grant select, insert, update on public.hr_doc_issued to authenticated;

comment on table public.hr_doc_issued is
  'Exemplaires imprimés des documents créés depuis l''interface : référence, valeurs saisies, PDF archivé.';

commit;
