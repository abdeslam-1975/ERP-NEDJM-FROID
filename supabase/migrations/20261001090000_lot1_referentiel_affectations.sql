-- Lot 1 — Référentiel et affectations datées
--   1. Wilayas codées (69, découpage de la loi 26-06) et wilaya datée de chaque chantier (effet au 1er du mois).
--   2. Affectation datée de chaque contrat : un mois suit l'affectation en vigueur le 1er. Le chantier d'un
--      contrat ne se modifie plus directement ; il reflète l'affectation en vigueur.
--   3. Aucun changement daté sur un mois déjà traité : paie validée ou clôturée, ou mois antérieur à
--      septembre 2026 (payé et déclaré hors de l'application).
--   4. Contrats au 1er du mois : toute nouvelle date de début hors du 1er est refusée. Les contrats existants
--      passent par D13 (rapport de qualité) ; la contrainte n'est ajoutée qu'une fois toutes les décisions prises.
--   5. D8 : correction d'une affectation saisie par erreur, uniquement sur des mois non traités, sur décision.
--   6. Présences : une ligne par période d'affectation.

begin;

-- ---------------------------------------------------------------------------
-- 1. Rights matrix: one screen per new decision type (update = decide)
-- ---------------------------------------------------------------------------
insert into public.sys_screens (code, path, module, label_fr, label_ar, sort_order) values
  ('decision_assignment_correction', '/decisions?type=D8', 'decisions',
   'Décision D8 · Correction d''une affectation (classe : à risque)', null, 48),
  ('decision_contract_start', '/decisions?type=D13', 'decisions',
   'Décision D13 · Contrat existant ne commençant pas le 1er du mois (classe : ordinaire)', null, 49)
on conflict (code) do nothing;

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select r.id, s.id, true, true, true, false, true, true
from public.sys_roles r
cross join public.sys_screens s
where r.code = 'SUPER_ADMIN'
  and s.code in ('decision_assignment_correction', 'decision_contract_start')
on conflict (role_id, screen_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Coded wilayas (same list as src/lib/referentiels/wilayas.ts)
-- ---------------------------------------------------------------------------
create table if not exists public.ref_wilayas (
  code text primary key check (code ~ '^[0-9]{2}$'),
  name_fr text not null unique,
  sort_order integer not null,
  is_active boolean not null default true
);

insert into public.ref_wilayas (code, name_fr, sort_order) values
  ('01', 'Adrar', 1),
  ('02', 'Chlef', 2),
  ('03', 'Laghouat', 3),
  ('04', 'Oum El Bouaghi', 4),
  ('05', 'Batna', 5),
  ('06', 'Bejaia', 6),
  ('07', 'Biskra', 7),
  ('08', 'Bechar', 8),
  ('09', 'Blida', 9),
  ('10', 'Bouira', 10),
  ('11', 'Tamanrasset', 11),
  ('12', 'Tebessa', 12),
  ('13', 'Tlemcen', 13),
  ('14', 'Tiaret', 14),
  ('15', 'Tizi Ouzou', 15),
  ('16', 'Alger', 16),
  ('17', 'Djelfa', 17),
  ('18', 'Jijel', 18),
  ('19', 'Setif', 19),
  ('20', 'Saida', 20),
  ('21', 'Skikda', 21),
  ('22', 'Sidi Bel Abbes', 22),
  ('23', 'Annaba', 23),
  ('24', 'Guelma', 24),
  ('25', 'Constantine', 25),
  ('26', 'Medea', 26),
  ('27', 'Mostaganem', 27),
  ('28', 'M''Sila', 28),
  ('29', 'Mascara', 29),
  ('30', 'Ouargla', 30),
  ('31', 'Oran', 31),
  ('32', 'El Bayadh', 32),
  ('33', 'Illizi', 33),
  ('34', 'Bordj Bou Arreridj', 34),
  ('35', 'Boumerdes', 35),
  ('36', 'El Tarf', 36),
  ('37', 'Tindouf', 37),
  ('38', 'Tissemsilt', 38),
  ('39', 'El Oued', 39),
  ('40', 'Khenchela', 40),
  ('41', 'Souk Ahras', 41),
  ('42', 'Tipaza', 42),
  ('43', 'Mila', 43),
  ('44', 'Ain Defla', 44),
  ('45', 'Naama', 45),
  ('46', 'Ain Temouchent', 46),
  ('47', 'Ghardaia', 47),
  ('48', 'Relizane', 48),
  ('49', 'Timimoun', 49),
  ('50', 'Bordj Badji Mokhtar', 50),
  ('51', 'Ouled Djellal', 51),
  ('52', 'Beni Abbes', 52),
  ('53', 'In Salah', 53),
  ('54', 'In Guezzam', 54),
  ('55', 'Touggourt', 55),
  ('56', 'Djanet', 56),
  ('57', 'El M''Ghair', 57),
  ('58', 'El Meniaa', 58),
  ('59', 'Aflou', 59),
  ('60', 'Barika', 60),
  ('61', 'El Kantara', 61),
  ('62', 'Bir El Ater', 62),
  ('63', 'El Aricha', 63),
  ('64', 'Ksar Chellala', 64),
  ('65', 'Ain Oussara', 65),
  ('66', 'Messaad', 66),
  ('67', 'Ksar El Boukhari', 67),
  ('68', 'Bou Saada', 68),
  ('69', 'El Abiodh Sidi Cheikh', 69)
on conflict (code) do nothing;

alter table public.ref_wilayas enable row level security;
drop policy if exists ref_wilayas_read on public.ref_wilayas;
create policy ref_wilayas_read on public.ref_wilayas for select to authenticated using (true);
grant select on public.ref_wilayas to authenticated;

-- ---------------------------------------------------------------------------
-- 3. First month a dated change may affect
-- ---------------------------------------------------------------------------
create or replace function public.hr_first_changeable_month()
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select greatest(public.hr_first_open_payroll_month(), date '2026-09-01');
$$;

create or replace function public.hr_changeable_month_error(p_open date)
returns text
language sql
stable
as $$
  select 'Mois déjà traité (paie validée ou clôturée, ou mois antérieur à septembre 2026 payé hors de l''application) : '
      || 'date d''effet possible à partir du ' || to_char(p_open, 'DD/MM/YYYY') || '.';
$$;

-- ---------------------------------------------------------------------------
-- 4. Dated wilaya of each site
-- ---------------------------------------------------------------------------
alter table public.ref_sites add column if not exists wilaya_code text references public.ref_wilayas(code);

create table if not exists public.ref_site_wilaya_history (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.ref_sites(id) on delete cascade,
  effective_from date not null check (extract(day from effective_from) = 1),
  wilaya_code text not null references public.ref_wilayas(code),
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  document_ref text check (char_length(document_ref) <= 200),
  created_by uuid references public.sys_users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (site_id, effective_from)
);

create index if not exists ref_site_wilaya_history_idx
  on public.ref_site_wilaya_history (site_id, effective_from desc);

drop trigger if exists trg_ref_site_wilaya_history_audit on public.ref_site_wilaya_history;
create trigger trg_ref_site_wilaya_history_audit
  after insert or update or delete on public.ref_site_wilaya_history
  for each row execute function public.sys_audit_row_change();

alter table public.ref_site_wilaya_history enable row level security;
drop policy if exists ref_site_wilaya_history_read on public.ref_site_wilaya_history;
create policy ref_site_wilaya_history_read on public.ref_site_wilaya_history
  for select to authenticated using (public.erp_can_see_site(site_id));
grant select on public.ref_site_wilaya_history to authenticated;

create or replace function public.ref_site_wilaya_at(p_site uuid, p_date date)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select h.wilaya_code
  from public.ref_site_wilaya_history h
  where h.site_id = p_site and h.effective_from <= p_date
  order by h.effective_from desc
  limit 1;
$$;

-- Site fields mirror the wilaya in force today.
create or replace function public.ref_site_wilaya_refresh_current(p_site uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := public.ref_site_wilaya_at(p_site, current_date);
  v_name text;
begin
  if v_code is null then
    return;
  end if;
  select w.name_fr into v_name from public.ref_wilayas w where w.code = v_code;
  perform set_config('ref.site_wilaya', 'on', true);
  update public.ref_sites
  set wilaya_code = v_code, wilaya = v_name
  where id = p_site and (wilaya_code, wilaya) is distinct from (v_code, v_name);
  perform set_config('ref.site_wilaya', '', true);
end;
$$;

create or replace function public.ref_site_wilaya_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('ref.site_wilaya', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.wilaya_code is not null then
      select w.name_fr into new.wilaya from public.ref_wilayas w where w.code = new.wilaya_code;
    end if;
    return new;
  end if;
  if (new.wilaya_code, new.wilaya) is distinct from (old.wilaya_code, old.wilaya) then
    raise exception 'La wilaya d''un chantier ne se modifie pas directement : confirmation depuis le rapport de qualité des données, puis changement daté au 1er d''un mois ouvert.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ref_sites_wilaya_guard on public.ref_sites;
create trigger trg_ref_sites_wilaya_guard
  before insert or update of wilaya, wilaya_code on public.ref_sites
  for each row execute function public.ref_site_wilaya_guard();

-- A site created with a coded wilaya has always been in it.
create or replace function public.ref_site_wilaya_initial()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.wilaya_code is not null then
    insert into public.ref_site_wilaya_history (site_id, effective_from, wilaya_code, reason)
    values (new.id, date '2000-01-01', new.wilaya_code, 'Wilaya à la création du chantier')
    on conflict (site_id, effective_from) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ref_sites_wilaya_initial on public.ref_sites;
create trigger trg_ref_sites_wilaya_initial
  after insert on public.ref_sites
  for each row execute function public.ref_site_wilaya_initial();

create or replace function public.ref_site_wilaya_check_access(p_site uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.sys_user_is_active() then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.ref_sites s where s.id = p_site) then
    raise exception 'Chantier introuvable.' using errcode = 'no_data_found';
  end if;
  if not public.erp_has_perm('sites', 'update'::public.rbac_action, p_site) then
    raise exception 'Modification du chantier non autorisée.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Existing site: the coded wilaya it has always been in (quality report).
create or replace function public.ref_site_wilaya_confirm(p_site uuid, p_code text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform public.ref_site_wilaya_check_access(p_site);
  if not exists (select 1 from public.ref_wilayas w where w.code = p_code and w.is_active) then
    raise exception 'Wilaya inconnue.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.ref_site_wilaya_history h where h.site_id = p_site) then
    raise exception 'Wilaya déjà confirmée : utilisez un changement daté.' using errcode = 'check_violation';
  end if;
  insert into public.ref_site_wilaya_history (site_id, effective_from, wilaya_code, reason)
  values (p_site, date '2000-01-01', p_code, btrim(coalesce(p_reason, '')))
  returning id into v_id;
  perform public.ref_site_wilaya_refresh_current(p_site);
  return v_id;
end;
$$;

-- Official change of wilaya (e.g. new territorial division) from the 1st of an open month.
create or replace function public.ref_site_wilaya_change(
  p_site uuid,
  p_code text,
  p_from date,
  p_reason text,
  p_document text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_open date := public.hr_first_changeable_month();
  v_id uuid;
begin
  perform public.ref_site_wilaya_check_access(p_site);
  if not exists (select 1 from public.ref_wilayas w where w.code = p_code and w.is_active) then
    raise exception 'Wilaya inconnue.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.ref_site_wilaya_history h where h.site_id = p_site) then
    raise exception 'Confirmez d''abord la wilaya actuelle du chantier (rapport de qualité des données).'
      using errcode = 'check_violation';
  end if;
  if p_from is null or extract(day from p_from) <> 1 then
    raise exception 'Un changement de wilaya prend effet le 1er d''un mois (aucun découpage du mois).'
      using errcode = 'check_violation';
  end if;
  if p_from < v_open then
    raise exception '%', public.hr_changeable_month_error(v_open) using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.ref_site_wilaya_history h where h.site_id = p_site and h.effective_from = p_from) then
    raise exception 'Un changement de wilaya est déjà enregistré à cette date : supprimez-le d''abord.'
      using errcode = 'check_violation';
  end if;
  if public.ref_site_wilaya_at(p_site, p_from - 1) = p_code then
    raise exception 'Le chantier est déjà dans cette wilaya avant cette date.' using errcode = 'check_violation';
  end if;
  insert into public.ref_site_wilaya_history (site_id, effective_from, wilaya_code, reason, document_ref)
  values (p_site, p_from, p_code, btrim(coalesce(p_reason, '')), nullif(btrim(coalesce(p_document, '')), ''))
  returning id into v_id;
  perform public.ref_site_wilaya_refresh_current(p_site);
  return v_id;
end;
$$;

create or replace function public.ref_site_wilaya_delete(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  h public.ref_site_wilaya_history%rowtype;
  v_open date := public.hr_first_changeable_month();
begin
  select * into h from public.ref_site_wilaya_history where id = p_id;
  if not found then
    raise exception 'Changement de wilaya introuvable.' using errcode = 'no_data_found';
  end if;
  perform public.ref_site_wilaya_check_access(h.site_id);
  if h.effective_from = (select min(x.effective_from) from public.ref_site_wilaya_history x where x.site_id = h.site_id) then
    raise exception 'La wilaya d''origine ne peut pas être supprimée.' using errcode = 'check_violation';
  end if;
  if h.effective_from < v_open then
    raise exception '%', public.hr_changeable_month_error(v_open) using errcode = 'check_violation';
  end if;
  delete from public.ref_site_wilaya_history where id = p_id;
  perform public.ref_site_wilaya_refresh_current(h.site_id);
  return h.site_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Dated assignment of each contract
-- ---------------------------------------------------------------------------
alter table public.hr_contracts
  add column if not exists start_date_exception boolean not null default false,
  add column if not exists start_exception_decision uuid references public.sys_decisions(id);

create table if not exists public.hr_contract_assignments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.hr_contracts(id) on delete cascade,
  site_id uuid not null references public.ref_sites(id),
  effective_from date not null,
  kind text not null check (kind in ('INITIAL', 'OFFICIAL')),
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  document_ref text check (char_length(document_ref) <= 200),
  corrected_by_decision uuid references public.sys_decisions(id),
  created_by uuid references public.sys_users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, effective_from),
  constraint hr_contract_assignments_official_first_chk
    check (kind = 'INITIAL' or extract(day from effective_from) = 1)
);

create unique index if not exists hr_contract_assignments_initial_uidx
  on public.hr_contract_assignments (contract_id) where kind = 'INITIAL';
create index if not exists hr_contract_assignments_site_idx
  on public.hr_contract_assignments (site_id, effective_from);

drop trigger if exists trg_hr_contract_assignments_u on public.hr_contract_assignments;
create trigger trg_hr_contract_assignments_u before update on public.hr_contract_assignments
  for each row execute function public.erp_set_updated_at();

drop trigger if exists trg_hr_contract_assignments_audit on public.hr_contract_assignments;
create trigger trg_hr_contract_assignments_audit
  after insert or update or delete on public.hr_contract_assignments
  for each row execute function public.sys_audit_row_change();

alter table public.hr_contract_assignments enable row level security;
drop policy if exists hr_contract_assignments_read on public.hr_contract_assignments;
create policy hr_contract_assignments_read on public.hr_contract_assignments
  for select to authenticated
  using (exists (select 1 from public.hr_contracts c where c.id = contract_id));
grant select on public.hr_contract_assignments to authenticated;

insert into public.hr_contract_assignments (contract_id, site_id, effective_from, kind, reason, created_by)
select c.id, c.site_id, c.start_date, 'INITIAL', 'Affectation initiale (reprise des contrats existants)', null
from public.hr_contracts c
where not exists (select 1 from public.hr_contract_assignments a where a.contract_id = c.id);

create or replace function public.hr_contract_site_at(p_contract uuid, p_date date)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.site_id
  from public.hr_contract_assignments a
  where a.contract_id = p_contract and a.effective_from <= p_date
  order by a.effective_from desc
  limit 1;
$$;

-- hr_contracts.site_id mirrors the assignment in force today (within the contract period).
create or replace function public.hr_contract_assignment_refresh_current(p_contract uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.hr_contracts%rowtype;
  v_site uuid;
begin
  select * into c from public.hr_contracts where id = p_contract;
  if not found then
    return;
  end if;
  v_site := public.hr_contract_site_at(
    p_contract,
    least(greatest(current_date, c.start_date), coalesce(c.end_date, 'infinity'::date))
  );
  if v_site is null or v_site = c.site_id then
    return;
  end if;
  perform set_config('hr.assignment', 'on', true);
  update public.hr_contracts set site_id = v_site where id = p_contract;
  perform set_config('hr.assignment', '', true);
end;
$$;

-- Dated changes whose date has come: brings the mirrors up to date.
create or replace function public.hr_contract_assignments_refresh_due()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  n integer := 0;
begin
  if auth.uid() is null or not public.sys_user_is_active() then
    return 0;
  end if;
  for r in
    select c.id
    from public.hr_contracts c
    where exists (select 1 from public.hr_contract_assignments a where a.contract_id = c.id and a.kind = 'OFFICIAL')
      and c.site_id is distinct from public.hr_contract_site_at(
        c.id, least(greatest(current_date, c.start_date), coalesce(c.end_date, 'infinity'::date))
      )
  loop
    perform public.hr_contract_assignment_refresh_current(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.hr_contract_dates_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_start_flag boolean := coalesce(current_setting('hr.contract_start', true), '') = 'on';
begin
  if tg_op = 'UPDATE' and new.site_id is distinct from old.site_id
     and coalesce(current_setting('hr.assignment', true), '') <> 'on' then
    raise exception 'Le chantier d''un contrat ne se modifie pas directement : enregistrez un changement d''affectation daté (onglet Affectations) ou demandez une correction (décision D8).'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' or new.start_date is distinct from old.start_date then
    if extract(day from new.start_date) <> 1 then
      raise exception 'Un contrat commence le 1er du mois : aucun contrat ne débute en milieu de mois (ni découpage ni proratisation).'
        using errcode = 'check_violation';
    end if;
    if not v_start_flag then
      new.start_date_exception := false;
      new.start_exception_decision := null;
    end if;
  elsif (new.start_date_exception, new.start_exception_decision)
        is distinct from (old.start_date_exception, old.start_exception_decision)
        and not v_start_flag then
    raise exception 'Exception historique de date de début : uniquement par décision D13.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_contract_dates_guard on public.hr_contracts;
create trigger trg_hr_contract_dates_guard
  before insert or update on public.hr_contracts
  for each row execute function public.hr_contract_dates_guard();

-- The initial assignment follows the contract (creation, start date).
create or replace function public.hr_contract_assignment_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next date;
begin
  if tg_op = 'INSERT' then
    insert into public.hr_contract_assignments (contract_id, site_id, effective_from, kind, reason)
    values (new.id, new.site_id, new.start_date, 'INITIAL', 'Affectation initiale du contrat')
    on conflict (contract_id, effective_from) do nothing;
    return new;
  end if;
  if new.start_date is distinct from old.start_date then
    select min(a.effective_from) into v_next
    from public.hr_contract_assignments a
    where a.contract_id = new.id and a.kind = 'OFFICIAL';
    if v_next is not null and v_next <= new.start_date then
      raise exception 'Le début du contrat ne peut pas dépasser le changement d''affectation daté du %.', to_char(v_next, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;
    update public.hr_contract_assignments set effective_from = new.start_date
    where contract_id = new.id and kind = 'INITIAL';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_contract_assignment_sync on public.hr_contracts;
create trigger trg_hr_contract_assignment_sync
  after insert or update of start_date on public.hr_contracts
  for each row execute function public.hr_contract_assignment_sync();

-- Official change of assignment: new site from the 1st of an open month, the past is not rewritten.
create or replace function public.hr_contract_assignment_change(
  p_contract uuid,
  p_site uuid,
  p_from date,
  p_reason text,
  p_document text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.hr_contracts%rowtype;
  v_open date := public.hr_first_changeable_month();
  v_id uuid;
begin
  if auth.uid() is null or not public.sys_user_is_active() then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.hr_contracts where id = p_contract for update;
  if not found then
    raise exception 'Contrat introuvable.' using errcode = 'no_data_found';
  end if;
  if not (public.erp_has_perm('contracts', 'update'::public.rbac_action, c.site_id)
          and public.erp_has_perm('contracts', 'update'::public.rbac_action, p_site)) then
    raise exception 'Changement d''affectation non autorisé : droits sur les deux chantiers requis.'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.ref_sites s where s.id = p_site and s.is_active) then
    raise exception 'Chantier inconnu ou inactif.' using errcode = 'check_violation';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Motif requis (3 caractères minimum).' using errcode = 'check_violation';
  end if;
  if p_from is null or extract(day from p_from) <> 1 then
    raise exception 'Un changement d''affectation prend effet le 1er d''un mois (aucun découpage du mois).'
      using errcode = 'check_violation';
  end if;
  if p_from <= c.start_date then
    raise exception 'La date d''effet doit suivre le début du contrat : l''affectation initiale se corrige par décision D8.'
      using errcode = 'check_violation';
  end if;
  if c.end_date is not null and p_from > c.end_date then
    raise exception 'La date d''effet doit être comprise dans la période du contrat.' using errcode = 'check_violation';
  end if;
  if p_from < v_open then
    raise exception '%', public.hr_changeable_month_error(v_open) using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.hr_contract_assignments a where a.contract_id = p_contract and a.effective_from = p_from) then
    raise exception 'Un changement d''affectation existe déjà à cette date : supprimez-le d''abord.'
      using errcode = 'check_violation';
  end if;
  if public.hr_contract_site_at(p_contract, p_from - 1) = p_site then
    raise exception 'Le salarié est déjà affecté à ce chantier à cette date.' using errcode = 'check_violation';
  end if;
  insert into public.hr_contract_assignments (contract_id, site_id, effective_from, kind, reason, document_ref)
  values (p_contract, p_site, p_from, 'OFFICIAL', btrim(p_reason), nullif(btrim(coalesce(p_document, '')), ''))
  returning id into v_id;
  perform public.hr_contract_assignment_refresh_current(p_contract);
  return v_id;
end;
$$;

create or replace function public.hr_contract_assignment_delete(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.hr_contract_assignments%rowtype;
  c public.hr_contracts%rowtype;
  v_open date := public.hr_first_changeable_month();
begin
  if auth.uid() is null or not public.sys_user_is_active() then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.hr_contract_assignments where id = p_id for update;
  if not found then
    raise exception 'Affectation introuvable.' using errcode = 'no_data_found';
  end if;
  select * into c from public.hr_contracts where id = a.contract_id;
  if not (public.erp_has_perm('contracts', 'update'::public.rbac_action, c.site_id)
          and public.erp_has_perm('contracts', 'update'::public.rbac_action, a.site_id)) then
    raise exception 'Suppression non autorisée : droits sur les chantiers concernés requis.'
      using errcode = 'insufficient_privilege';
  end if;
  if a.kind = 'INITIAL' then
    raise exception 'L''affectation initiale ne peut pas être supprimée (correction : décision D8).'
      using errcode = 'check_violation';
  end if;
  if a.effective_from < v_open then
    raise exception '%', public.hr_changeable_month_error(v_open) using errcode = 'check_violation';
  end if;
  delete from public.hr_contract_assignments where id = p_id;
  perform public.hr_contract_assignment_refresh_current(a.contract_id);
  return a.contract_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Attendance roster: one row per assignment period
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
    g.seg_start as start_date,
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
  order by c.employee_id, g.site_id, g.seg_start desc;
$$;

-- ---------------------------------------------------------------------------
-- 7. Payroll change sources: assignment and site wilaya
-- ---------------------------------------------------------------------------
alter table public.hr_payroll_input_changes drop constraint if exists hr_payroll_input_changes_source_check;
alter table public.hr_payroll_input_changes add constraint hr_payroll_input_changes_source_check check (source in (
  'ATTENDANCE', 'CONTRACT', 'SALARY', 'SALARY_HISTORY', 'EXCEPTION', 'EXIT', 'LEAVE', 'ADVANCE', 'COMPLIANCE',
  'ASSIGNMENT', 'SITE_WILAYA'
));

create or replace function public.hr_payroll_signal_input_change(
  p_source text,
  p_employee uuid default null,
  p_contracts uuid[] default null,
  p_site uuid default null,
  p_year integer default null,
  p_month integer default null,
  p_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_emps uuid[];
  v_runs uuid[];
  v_run uuid;
  v_gen uuid;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.sys_user_site_roles usr where usr.user_id = v_uid) then
    raise exception 'Accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  if p_source not in ('ATTENDANCE', 'CONTRACT', 'SALARY', 'SALARY_HISTORY', 'EXCEPTION', 'EXIT', 'LEAVE', 'ADVANCE', 'COMPLIANCE',
                      'ASSIGNMENT', 'SITE_WILAYA') then
    raise exception 'Origine de modification inconnue.' using errcode = 'check_violation';
  end if;

  v_emps := array_remove(array[p_employee], null);
  if p_contracts is not null and cardinality(p_contracts) > 0 then
    v_emps := v_emps || coalesce(
      (select array_agg(distinct c.employee_id) from public.hr_contracts c where c.id = any (p_contracts)),
      '{}'::uuid[]
    );
  end if;
  select coalesce(array_agg(distinct v.employee_id), '{}'::uuid[]) into v_emps from unnest(v_emps) as v(employee_id);

  select coalesce(array_agg(distinct r.id), '{}'::uuid[]) into v_runs
  from public.hr_payroll_runs r
  where r.status_code = 'DRAFT'
    and (p_year is null or r.period_year = p_year)
    and (p_month is null or r.period_month = p_month)
    and (
      (p_site is not null and r.site_id = p_site)
      or exists (
        select 1 from public.hr_payroll_slips s
        where s.run_id = r.id and s.status_code = 'DRAFT'
          and (s.employee_id = any (v_emps) or s.hr_contract_id = any (coalesce(p_contracts, '{}'::uuid[])))
      )
    );

  if cardinality(v_runs) = 0 then
    if p_site is not null and p_year is not null and p_month is not null then
      v_gen := public.hr_payroll_request_generation(
        p_site, p_year, p_month, case when p_source = 'ATTENDANCE' then 'ATTENDANCE' else 'MANUAL' end
      );
    end if;
    return jsonb_build_object('flagged_runs', 0, 'generation_decision', v_gen);
  end if;

  foreach v_run in array v_runs loop
    if cardinality(v_emps) > 0 then
      insert into public.hr_payroll_input_changes (run_id, employee_id, source, detail, changed_by)
      select v_run, e, p_source, left(p_detail, 300), v_uid from unnest(v_emps) as e
      on conflict (run_id, coalesce(employee_id, '00000000-0000-0000-0000-000000000000'::uuid), source)
        where resolved_at is null
      do update set changed_at = now(), changed_by = excluded.changed_by, detail = excluded.detail;
    else
      insert into public.hr_payroll_input_changes (run_id, employee_id, source, detail, changed_by)
      values (v_run, null, p_source, left(p_detail, 300), v_uid)
      on conflict (run_id, coalesce(employee_id, '00000000-0000-0000-0000-000000000000'::uuid), source)
        where resolved_at is null
      do update set changed_at = now(), changed_by = excluded.changed_by, detail = excluded.detail;
    end if;
    perform public.hr_payroll_upsert_recalc_request(v_run, p_source, false);
  end loop;
  return jsonb_build_object('flagged_runs', cardinality(v_runs), 'generation_decision', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Decision types D8 and D13
-- ---------------------------------------------------------------------------
insert into public.sys_decision_types (code, label_fr, description_fr, risk_class, policy_allowed, screen_code, options) values
  ('D8',
   'Correction d''une affectation saisie par erreur',
   'Le chantier d''une affectation est corrigé à la source, uniquement pour des mois non traités. Par défaut rien n''est réécrit : un changement officiel d''affectation à partir d''un mois ouvert ne demande pas de décision. Une correction touchant un mois validé, clôturé ou payé hors de l''application relève de D7 (lot 3).',
   'RISKY', false, 'decision_assignment_correction',
   jsonb_build_array(
     jsonb_build_object(
       'code', 'APPLY_CORRECTION',
       'label_fr', 'Corriger l''affectation (erreur de saisie)',
       'consequence_fr', 'Le chantier de cette affectation est remplacé sur toute sa période, qui ne couvre que des mois non traités. La wilaya et la zone IRG de ces mois suivent le nouveau chantier. Les paies brouillon concernées sont signalées : aucun bulletin n''est recalculé sans décision D3.',
       'executes', true),
     jsonb_build_object(
       'code', 'KEEP',
       'label_fr', 'Ne pas corriger',
       'consequence_fr', 'L''affectation reste inchangée. Un changement officiel d''affectation reste possible à partir d''un mois ouvert.',
       'executes', false))),
  ('D13',
   'Contrat existant ne commençant pas le 1er du mois',
   'Rapport de qualité des données : chaque contrat existant dont le début n''est pas le 1er du mois est corrigé ou documenté comme exception historique. Rien n''est modifié d''office ; la règle « début au 1er du mois » ne devient une contrainte de la base qu''une fois toutes ces décisions prises.',
   'ORDINARY', false, 'decision_contract_start',
   jsonb_build_array(
     jsonb_build_object(
       'code', 'FIX_START',
       'label_fr', 'Corriger la date de début au 1er du mois',
       'consequence_fr', 'La date de début devient le 1er du même mois ; l''affectation initiale et le salaire initial suivent. Refusé si ce mois est déjà traité (paie validée ou clôturée, ou mois antérieur à septembre 2026). Les paies brouillon concernées sont signalées.',
       'executes', true),
     jsonb_build_object(
       'code', 'HISTORICAL_EXCEPTION',
       'label_fr', 'Marquer comme exception historique documentée',
       'consequence_fr', 'La date de début reste inchangée. Le contrat est marqué exception historique, avec cette décision comme justificatif. Aucun montant ne change.',
       'executes', true)))
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 9. D13: fingerprint, context, request, execution
-- ---------------------------------------------------------------------------
create or replace function public.hr_contract_start_fingerprint(p_contract uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(
    coalesce((
      select c.start_date::text || '|' || c.start_date_exception::text || '|' || c.status::text
      from public.hr_contracts c where c.id = p_contract
    ), 'MISSING') || '|' || public.hr_first_changeable_month()::text
  );
$$;

create or replace function public.hr_contract_start_context(p_contract uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'site_name', s.name_fr,
    'employee', trim(coalesce(e.matricule, '') || ' ' || coalesce(e.last_name, '') || ' ' || coalesce(e.first_name, '')),
    'contract_id', c.id,
    'contract_start', c.start_date,
    'contract_end', c.end_date,
    'contract_status', c.status::text,
    'fix_start', date_trunc('month', c.start_date)::date,
    'first_changeable', public.hr_first_changeable_month(),
    'fix_allowed', date_trunc('month', c.start_date)::date >= public.hr_first_changeable_month(),
    'period_nature', public.sys_period_nature(extract(year from c.start_date)::integer, extract(month from c.start_date)::integer)
  )
  from public.hr_contracts c
  join public.hr_employees e on e.id = c.employee_id
  left join public.ref_sites s on s.id = c.site_id
  where c.id = p_contract;
$$;

create or replace function public.hr_contract_start_request(p_contract uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  c public.hr_contracts%rowtype;
  v_key text;
  v_open_id uuid;
  v_ctx jsonb;
  v_id uuid;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.hr_contracts where id = p_contract;
  if not found then
    raise exception 'Contrat introuvable.' using errcode = 'no_data_found';
  end if;
  if not public.erp_has_perm('contracts', 'update'::public.rbac_action, c.site_id) then
    raise exception 'Demande non autorisée pour ce contrat.' using errcode = 'insufficient_privilege';
  end if;
  if extract(day from c.start_date) = 1 then
    raise exception 'Ce contrat commence déjà le 1er du mois.' using errcode = 'check_violation';
  end if;
  if c.start_date_exception then
    raise exception 'Ce contrat est déjà documenté comme exception historique.' using errcode = 'check_violation';
  end if;
  v_key := 'D13:' || p_contract::text;
  select d.id into v_open_id from public.sys_decisions d
  where d.dedupe_key = v_key and d.status in ('PENDING', 'DECIDED');
  if v_open_id is not null then
    return v_open_id;
  end if;
  v_ctx := public.hr_contract_start_context(p_contract);
  insert into public.sys_decisions (
    type_code, dedupe_key, period_year, period_month, site_id, scope, context, options, fingerprint,
    request_source, requested_by
  )
  select 'D13', v_key, extract(year from c.start_date)::integer, extract(month from c.start_date)::integer, c.site_id,
         jsonb_build_object('contract_id', c.id), v_ctx, t.options, public.hr_contract_start_fingerprint(c.id),
         'DATA_QUALITY', v_uid
  from public.sys_decision_types t
  where t.code = 'D13'
  returning id into v_id;

  perform public.sys_notify(
    'DECISION_PENDING',
    format('Contrat de %s : début le %s, pas le 1er du mois', v_ctx->>'employee', to_char(c.start_date, 'DD/MM/YYYY')),
    'Rapport de qualité des données : corriger la date de début ou documenter une exception historique. Rien n''est modifié sans votre décision.',
    '/decisions/' || v_id,
    null,
    'decision_contract_start',
    v_id
  );
  return v_id;
end;
$$;

-- Every contract of the report visible to the user and without open request.
create or replace function public.hr_contract_start_request_all()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  n integer := 0;
begin
  if auth.uid() is null or not public.sys_user_is_active() then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  for r in
    select c.id
    from public.hr_contracts c
    where extract(day from c.start_date) <> 1
      and not c.start_date_exception
      and public.erp_has_perm('contracts', 'update'::public.rbac_action, c.site_id)
      and not exists (
        select 1 from public.sys_decisions d
        where d.dedupe_key = 'D13:' || c.id::text and d.status in ('PENDING', 'DECIDED')
      )
  loop
    perform public.hr_contract_start_request(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.hr_decision_apply_d13(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.sys_decisions%rowtype;
  c public.hr_contracts%rowtype;
  v_fix date;
  v_open date := public.hr_first_changeable_month();
  v_sig jsonb;
  v_result jsonb;
begin
  select * into d from public.sys_decisions where id = p_id and type_code = 'D13' and status = 'DECIDED' for update;
  if not found then
    raise exception 'Décision D13 introuvable ou non décidée.' using errcode = 'no_data_found';
  end if;
  select * into c from public.hr_contracts where id = (d.scope->>'contract_id')::uuid for update;
  if not found then
    raise exception 'Contrat introuvable.' using errcode = 'no_data_found';
  end if;
  if d.chosen_option = 'FIX_START' then
    v_fix := date_trunc('month', c.start_date)::date;
    if v_fix < v_open then
      raise exception 'Le mois de début du contrat est déjà traité (paie validée ou clôturée, ou mois antérieur à septembre 2026) : seule l''exception historique documentée est possible.'
        using errcode = 'check_violation';
    end if;
    update public.hr_contracts set start_date = v_fix where id = c.id;
    v_sig := public.hr_payroll_signal_input_change(
      'CONTRACT', null, array[c.id], null, null, null, 'Date de début corrigée au 1er du mois (décision D13)'
    );
    v_result := jsonb_build_object('operation', 'CONTRACT_START_FIXED', 'from', c.start_date, 'to', v_fix,
                                   'flagged_runs', v_sig->'flagged_runs');
  elsif d.chosen_option = 'HISTORICAL_EXCEPTION' then
    perform set_config('hr.contract_start', 'on', true);
    update public.hr_contracts set start_date_exception = true, start_exception_decision = d.id where id = c.id;
    perform set_config('hr.contract_start', '', true);
    v_result := jsonb_build_object('operation', 'START_EXCEPTION_DOCUMENTED', 'start_date', c.start_date);
  else
    raise exception 'Option D13 inconnue.' using errcode = 'check_violation';
  end if;
  update public.sys_decisions set
    status = 'EXECUTED', executed_by = auth.uid(), executed_at = now(), execution_result = v_result
  where id = d.id;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. D8: preview, fingerprint, request, execution
-- ---------------------------------------------------------------------------
create or replace function public.hr_assignment_range_end(p_assignment uuid)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when n.next_from is null then c.end_date
    when c.end_date is null then n.next_from - 1
    else least(c.end_date, n.next_from - 1)
  end
  from public.hr_contract_assignments a
  join public.hr_contracts c on c.id = a.contract_id
  left join lateral (
    select min(b.effective_from) as next_from
    from public.hr_contract_assignments b
    where b.contract_id = a.contract_id and b.effective_from > a.effective_from
  ) n on true
  where a.id = p_assignment;
$$;

-- Draft slips of the contract for the months the assignment covers.
create or replace function public.hr_assignment_draft_slips(p_assignment uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slip_id', sl.id,
    'period', public.sys_period_label(r.period_year, r.period_month),
    'run_site', coalesce(rs.name_fr, 'Tous les chantiers'),
    'irg_amount', sl.irg_amount,
    'net_payable', sl.net_payable
  ) order by r.period_year, r.period_month, sl.id), '[]'::jsonb)
  from public.hr_contract_assignments a
  join public.hr_payroll_slips sl on sl.hr_contract_id = a.contract_id
  join public.hr_payroll_runs r on r.id = sl.run_id
  left join public.ref_sites rs on rs.id = r.site_id
  where a.id = p_assignment
    and r.status_code = 'DRAFT'
    and make_date(r.period_year, r.period_month, 1) >= date_trunc('month', a.effective_from)::date
    and make_date(r.period_year, r.period_month, 1)
        <= coalesce(public.hr_assignment_range_end(a.id), 'infinity'::date);
$$;

create or replace function public.hr_assignment_correction_fingerprint(p_assignment uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(
    coalesce((
      select a.site_id::text || '|' || a.effective_from::text
      from public.hr_contract_assignments a where a.id = p_assignment
    ), 'MISSING')
    || '|' || coalesce(public.hr_assignment_range_end(p_assignment)::text, 'OPEN')
    || '|' || public.hr_first_changeable_month()::text
    || '|' || public.hr_assignment_draft_slips(p_assignment)::text
  );
$$;

create or replace function public.hr_assignment_correction_context(p_assignment uuid, p_new_site uuid, p_reason text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'site_name', os.name_fr,
    'employee', trim(coalesce(e.matricule, '') || ' ' || coalesce(e.last_name, '') || ' ' || coalesce(e.first_name, '')),
    'contract_id', c.id,
    'assignment_id', a.id,
    'assignment_kind', a.kind,
    'effective_from', a.effective_from,
    'range_end', public.hr_assignment_range_end(a.id),
    'old_site_id', a.site_id,
    'old_site_name', os.name_fr,
    'new_site_id', p_new_site,
    'new_site_name', ns.name_fr,
    'old_wilaya', coalesce(
      (select w.name_fr from public.ref_wilayas w where w.code = public.ref_site_wilaya_at(a.site_id, a.effective_from)),
      os.wilaya),
    'new_wilaya', coalesce(
      (select w.name_fr from public.ref_wilayas w where w.code = public.ref_site_wilaya_at(p_new_site, a.effective_from)),
      ns.wilaya),
    'draft_slips', public.hr_assignment_draft_slips(a.id),
    'reason', p_reason,
    'period_nature', public.sys_period_nature(extract(year from a.effective_from)::integer, extract(month from a.effective_from)::integer)
  )
  from public.hr_contract_assignments a
  join public.hr_contracts c on c.id = a.contract_id
  join public.hr_employees e on e.id = c.employee_id
  join public.ref_sites os on os.id = a.site_id
  join public.ref_sites ns on ns.id = p_new_site
  where a.id = p_assignment;
$$;

create or replace function public.hr_assignment_request_correction(p_assignment uuid, p_site uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  a public.hr_contract_assignments%rowtype;
  v_open date := public.hr_first_changeable_month();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_key text;
  v_existing public.sys_decisions%rowtype;
  v_ctx jsonb;
  v_id uuid;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) then
    raise exception 'Session requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.hr_contract_assignments where id = p_assignment;
  if not found then
    raise exception 'Affectation introuvable.' using errcode = 'no_data_found';
  end if;
  if not (public.erp_has_perm('contracts', 'update'::public.rbac_action, a.site_id)
          and public.erp_has_perm('contracts', 'update'::public.rbac_action, p_site)) then
    raise exception 'Demande non autorisée : droits sur les deux chantiers requis.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.ref_sites s where s.id = p_site and s.is_active) then
    raise exception 'Chantier inconnu ou inactif.' using errcode = 'check_violation';
  end if;
  if p_site = a.site_id then
    raise exception 'Même chantier : rien à corriger.' using errcode = 'check_violation';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 300 then
    raise exception 'Motif de la correction obligatoire (10 à 300 caractères).' using errcode = 'check_violation';
  end if;
  if a.effective_from < v_open then
    raise exception 'Cette affectation couvre des mois déjà traités (paie validée ou clôturée, ou mois antérieurs à septembre 2026 payés hors de l''application) : la correction relève de D7 (lot 3), non disponible. Un changement officiel d''affectation reste possible à partir du %.', to_char(v_open, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;

  v_key := 'D8:' || a.id::text;
  select * into v_existing from public.sys_decisions
  where dedupe_key = v_key and status in ('PENDING', 'DECIDED');
  if found then
    if (v_existing.scope->>'new_site_id')::uuid = p_site then
      return v_existing.id;
    end if;
    raise exception 'Une demande de correction est déjà en attente pour cette affectation.' using errcode = 'check_violation';
  end if;

  v_ctx := public.hr_assignment_correction_context(a.id, p_site, v_reason);
  insert into public.sys_decisions (
    type_code, dedupe_key, period_year, period_month, site_id, scope, context, options, fingerprint,
    request_source, requested_by
  )
  select 'D8', v_key, extract(year from a.effective_from)::integer, extract(month from a.effective_from)::integer, a.site_id,
         jsonb_build_object('assignment_id', a.id, 'contract_id', a.contract_id, 'new_site_id', p_site, 'reason', v_reason),
         v_ctx, t.options, public.hr_assignment_correction_fingerprint(a.id), 'ASSIGNMENT', v_uid
  from public.sys_decision_types t
  where t.code = 'D8'
  returning id into v_id;

  perform public.sys_notify(
    'DECISION_PENDING',
    format('Correction d''affectation : %s, %s → %s', v_ctx->>'employee', v_ctx->>'old_site_name', v_ctx->>'new_site_name'),
    'Erreur de saisie signalée sur une affectation. Rien n''est corrigé sans votre décision.',
    '/decisions/' || v_id,
    null,
    'decision_assignment_correction',
    v_id
  );
  return v_id;
end;
$$;

create or replace function public.hr_decision_apply_d8(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.sys_decisions%rowtype;
  a public.hr_contract_assignments%rowtype;
  v_new uuid;
  v_open date := public.hr_first_changeable_month();
  v_sig jsonb;
  v_result jsonb;
begin
  select * into d from public.sys_decisions where id = p_id and type_code = 'D8' and status = 'DECIDED' for update;
  if not found then
    raise exception 'Décision D8 introuvable ou non décidée.' using errcode = 'no_data_found';
  end if;
  select * into a from public.hr_contract_assignments where id = (d.scope->>'assignment_id')::uuid for update;
  if not found then
    raise exception 'Affectation introuvable.' using errcode = 'no_data_found';
  end if;
  if a.effective_from < v_open then
    raise exception '%', public.hr_changeable_month_error(v_open) using errcode = 'check_violation';
  end if;
  v_new := (d.scope->>'new_site_id')::uuid;
  if not exists (select 1 from public.ref_sites s where s.id = v_new) then
    raise exception 'Chantier introuvable.' using errcode = 'no_data_found';
  end if;
  update public.hr_contract_assignments set site_id = v_new, corrected_by_decision = d.id where id = a.id;
  perform public.hr_contract_assignment_refresh_current(a.contract_id);
  v_sig := public.hr_payroll_signal_input_change(
    'ASSIGNMENT', null, array[a.contract_id], v_new, null, null, 'Affectation corrigée (décision D8)'
  );
  v_result := jsonb_build_object('operation', 'ASSIGNMENT_CORRECTED', 'assignment_id', a.id,
                                 'from_site', a.site_id, 'to_site', v_new, 'flagged_runs', v_sig->'flagged_runs');
  update public.sys_decisions set
    status = 'EXECUTED', executed_by = auth.uid(), executed_at = now(), execution_result = v_result
  where id = d.id;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Decision engine: D8 / D13 fingerprints, refresh and immediate execution
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
  end
  from public.sys_decisions d
  where d.id = p_id;
$$;

-- Pending D8 / D13 whose data changed: shows the new situation, or closes it when it no longer applies.
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
        'Mois désormais traité : la correction relève de D7 (lot 3).');
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

  -- Reference-data decisions run in the same transaction: decided and applied together, or not at all.
  if v_executes and d.type_code in ('D8', 'D13') then
    if d.type_code = 'D8' then
      perform public.hr_decision_apply_d8(d.id);
    else
      perform public.hr_decision_apply_d13(d.id);
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
-- 12. Quality report and activation of the "start on the 1st" constraint
-- ---------------------------------------------------------------------------
create table if not exists public.sys_data_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label_fr text not null,
  activated_at timestamptz,
  activated_by uuid references public.sys_users(id)
);

insert into public.sys_data_rules (code, label_fr) values
  ('CONTRACT_START_FIRST_OF_MONTH', 'Début des contrats au 1er du mois (contrainte de la base)')
on conflict (code) do nothing;

drop trigger if exists trg_sys_data_rules_audit on public.sys_data_rules;
create trigger trg_sys_data_rules_audit
  after insert or update or delete on public.sys_data_rules
  for each row execute function public.sys_audit_row_change();

alter table public.sys_data_rules enable row level security;
drop policy if exists sys_data_rules_read on public.sys_data_rules;
create policy sys_data_rules_read on public.sys_data_rules for select to authenticated using (true);
grant select on public.sys_data_rules to authenticated;

create or replace function public.hr_data_quality_contracts()
returns table (
  contract_id uuid,
  employee text,
  site_name text,
  start_date date,
  end_date date,
  status text,
  fix_allowed boolean,
  decision_id uuid,
  decision_status text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    trim(coalesce(e.matricule, '') || ' ' || coalesce(e.last_name, '') || ' ' || coalesce(e.first_name, '')),
    s.name_fr,
    c.start_date,
    c.end_date,
    c.status::text,
    date_trunc('month', c.start_date)::date >= public.hr_first_changeable_month(),
    d.id,
    d.status
  from public.hr_contracts c
  join public.hr_employees e on e.id = c.employee_id
  left join public.ref_sites s on s.id = c.site_id
  left join lateral (
    select x.id, x.status from public.sys_decisions x
    where x.dedupe_key = 'D13:' || c.id::text and x.status in ('PENDING', 'DECIDED')
    order by x.requested_at desc
    limit 1
  ) d on true
  where extract(day from c.start_date) <> 1
    and not c.start_date_exception
    and auth.uid() is not null
    and public.erp_has_perm('contracts', 'read'::public.rbac_action, c.site_id)
  order by c.start_date, 2;
$$;

create or replace function public.hr_contract_start_rule_status()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'active', exists (
      select 1 from pg_constraint k
      where k.conname = 'hr_contracts_start_first_of_month' and k.conrelid = 'public.hr_contracts'::regclass
    ),
    'pending', (select count(*) from public.hr_contracts c where extract(day from c.start_date) <> 1 and not c.start_date_exception),
    'exceptions', (select count(*) from public.hr_contracts c where c.start_date_exception),
    'activated_at', r.activated_at,
    'activated_by', u.full_name
  )
  from public.sys_data_rules r
  left join public.sys_users u on u.id = r.activated_by
  where r.code = 'CONTRACT_START_FIRST_OF_MONTH';
$$;

create or replace function public.hr_contract_start_rule_activate()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  n integer;
begin
  if v_uid is null or not public.sys_user_is_active(v_uid) or not public.erp_is_super_admin(v_uid) then
    raise exception 'Réservé au SUPER_ADMIN.' using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1 from pg_constraint k
    where k.conname = 'hr_contracts_start_first_of_month' and k.conrelid = 'public.hr_contracts'::regclass
  ) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  select count(*) into n from public.hr_contracts c where extract(day from c.start_date) <> 1 and not c.start_date_exception;
  if n > 0 then
    raise exception 'Contrainte non ajoutée : % contrat(s) sans décision D13 (début hors du 1er du mois).', n
      using errcode = 'check_violation';
  end if;
  execute 'alter table public.hr_contracts add constraint hr_contracts_start_first_of_month '
       || 'check (extract(day from start_date) = 1 or start_date_exception)';
  update public.sys_data_rules set activated_at = now(), activated_by = v_uid
  where code = 'CONTRACT_START_FIRST_OF_MONTH';
  return jsonb_build_object('ok', true, 'already', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Execute rights: RPCs for signed-in users, internal helpers for nobody
-- ---------------------------------------------------------------------------
revoke all on function public.ref_site_wilaya_at(uuid, date) from public, anon, authenticated;
revoke all on function public.ref_site_wilaya_refresh_current(uuid) from public, anon, authenticated;
revoke all on function public.ref_site_wilaya_check_access(uuid) from public, anon, authenticated;
revoke all on function public.hr_contract_site_at(uuid, date) from public, anon, authenticated;
revoke all on function public.hr_contract_assignment_refresh_current(uuid) from public, anon, authenticated;
revoke all on function public.hr_contract_start_fingerprint(uuid) from public, anon, authenticated;
revoke all on function public.hr_contract_start_context(uuid) from public, anon, authenticated;
revoke all on function public.hr_decision_apply_d13(uuid) from public, anon, authenticated;
revoke all on function public.hr_assignment_range_end(uuid) from public, anon, authenticated;
revoke all on function public.hr_assignment_draft_slips(uuid) from public, anon, authenticated;
revoke all on function public.hr_assignment_correction_fingerprint(uuid) from public, anon, authenticated;
revoke all on function public.hr_assignment_correction_context(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.hr_decision_apply_d8(uuid) from public, anon, authenticated;
revoke all on function public.sys_decision_refresh_record(uuid) from public, anon, authenticated;
revoke all on function public.sys_decision_current_fingerprint(uuid) from public, anon, authenticated;

revoke all on function public.hr_first_changeable_month() from public, anon;
revoke all on function public.hr_changeable_month_error(date) from public, anon;
revoke all on function public.ref_site_wilaya_confirm(uuid, text, text) from public, anon;
revoke all on function public.ref_site_wilaya_change(uuid, text, date, text, text) from public, anon;
revoke all on function public.ref_site_wilaya_delete(uuid) from public, anon;
revoke all on function public.hr_contract_assignments_refresh_due() from public, anon;
revoke all on function public.hr_contract_assignment_change(uuid, uuid, date, text, text) from public, anon;
revoke all on function public.hr_contract_assignment_delete(uuid) from public, anon;
revoke all on function public.hr_attendance_roster() from public, anon;
revoke all on function public.hr_payroll_signal_input_change(text, uuid, uuid[], uuid, integer, integer, text) from public, anon;
revoke all on function public.hr_contract_start_request(uuid) from public, anon;
revoke all on function public.hr_contract_start_request_all() from public, anon;
revoke all on function public.hr_assignment_request_correction(uuid, uuid, text) from public, anon;
revoke all on function public.sys_decision_decide(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.hr_data_quality_contracts() from public, anon;
revoke all on function public.hr_contract_start_rule_status() from public, anon;
revoke all on function public.hr_contract_start_rule_activate() from public, anon;

grant execute on function public.hr_first_changeable_month() to authenticated;
grant execute on function public.hr_changeable_month_error(date) to authenticated;
grant execute on function public.ref_site_wilaya_confirm(uuid, text, text) to authenticated;
grant execute on function public.ref_site_wilaya_change(uuid, text, date, text, text) to authenticated;
grant execute on function public.ref_site_wilaya_delete(uuid) to authenticated;
grant execute on function public.hr_contract_assignments_refresh_due() to authenticated;
grant execute on function public.hr_contract_assignment_change(uuid, uuid, date, text, text) to authenticated;
grant execute on function public.hr_contract_assignment_delete(uuid) to authenticated;
grant execute on function public.hr_attendance_roster() to authenticated;
grant execute on function public.hr_payroll_signal_input_change(text, uuid, uuid[], uuid, integer, integer, text) to authenticated;
grant execute on function public.hr_contract_start_request(uuid) to authenticated;
grant execute on function public.hr_contract_start_request_all() to authenticated;
grant execute on function public.hr_assignment_request_correction(uuid, uuid, text) to authenticated;
grant execute on function public.sys_decision_decide(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.hr_data_quality_contracts() to authenticated;
grant execute on function public.hr_contract_start_rule_status() to authenticated;
grant execute on function public.hr_contract_start_rule_activate() to authenticated;

commit;
