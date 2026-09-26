-- Feuille de pointage : colonnes configurables (SUPER_ADMIN) + droits voir / modifier par rôle.
-- Unité = chantier × mois. Aucune colonne financière : les montants restent dans la paie.

begin;

-- ---------------------------------------------------------------------------
-- Registre des colonnes
-- ---------------------------------------------------------------------------
create table if not exists public.hr_attendance_columns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]{0,31}$'),
  label_fr text not null,
  label_ar text,
  -- IDENTITY : valeur du dossier / contrat (POSTE_EFFECTIF est saisissable par mois)
  -- DAYS : grille des jours · CODE_COUNTS : un total par code de présence
  -- TOTAL : calcul (NJ, COEF) · INPUT : saisie libre sur la ligne
  kind text not null check (kind in ('IDENTITY', 'DAYS', 'CODE_COUNTS', 'TOTAL', 'INPUT')),
  source text,
  value_type text not null default 'text' check (value_type in ('text', 'number', 'date', 'catalog')),
  catalog_kind text,
  sort_order integer not null default 0,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_hr_attendance_columns_u on public.hr_attendance_columns;
create trigger trg_hr_attendance_columns_u before update on public.hr_attendance_columns
  for each row execute function public.erp_set_updated_at();

create table if not exists public.hr_attendance_column_roles (
  column_id uuid not null references public.hr_attendance_columns(id) on delete cascade,
  role_id uuid not null references public.sys_roles(id) on delete cascade,
  can_view boolean not null default false,
  can_edit boolean not null default false,
  primary key (column_id, role_id),
  check (not can_edit or can_view)
);

-- ---------------------------------------------------------------------------
-- Valeurs saisies par ligne (employé × chantier × mois) : poste effectif, commentaire…
-- ---------------------------------------------------------------------------
create table if not exists public.hr_attendance_sheet_rows (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.ref_sites(id),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  period_year integer not null check (period_year between 2000 and 2100),
  period_month integer not null check (period_month between 1 and 12),
  cell_values jsonb not null default '{}'::jsonb,
  updated_by uuid references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, employee_id, period_year, period_month)
);

create index if not exists hr_attendance_sheet_rows_period_idx
  on public.hr_attendance_sheet_rows (site_id, period_year, period_month);

drop trigger if exists trg_hr_attendance_sheet_rows_u on public.hr_attendance_sheet_rows;
create trigger trg_hr_attendance_sheet_rows_u before update on public.hr_attendance_sheet_rows
  for each row execute function public.erp_set_updated_at();

-- ---------------------------------------------------------------------------
-- Droits effectifs (rôle effectif sur le chantier, comme erp_has_perm)
-- ---------------------------------------------------------------------------
create or replace function public.hr_att_col_allowed(
  p_code text,
  p_edit boolean,
  p_site uuid,
  p_uid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.erp_is_super_admin(p_uid)
    or exists (
      select 1
      from public.hr_attendance_column_roles cr
      join public.hr_attendance_columns c on c.id = cr.column_id
      where c.code = p_code
        and c.is_active
        and cr.role_id = public.erp_effective_role_id(p_uid, p_site)
        and cr.can_view
        and (not p_edit or cr.can_edit)
    );
$$;

grant execute on function public.hr_att_col_allowed(text, boolean, uuid, uuid) to authenticated;

create or replace function public.hr_attendance_sheet_access(p_site uuid)
returns table (code text, can_view boolean, can_edit boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with base as (
    select
      public.erp_can_see_site(p_site) and public.erp_has_perm('hr_attendance', 'read', p_site) as may_read,
      public.erp_has_perm('hr_attendance', 'update', p_site) as may_write
  )
  select
    c.code,
    b.may_read and public.hr_att_col_allowed(c.code, false, p_site),
    b.may_read and b.may_write and public.hr_att_col_allowed(c.code, true, p_site)
  from public.hr_attendance_columns c
  cross join base b
  where c.is_active;
$$;

grant execute on function public.hr_attendance_sheet_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Garde : chaque valeur modifiée doit être autorisée pour le rôle ; mois clôturé figé.
-- ---------------------------------------------------------------------------
create or replace function public.hr_attendance_sheet_rows_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  k text;
  before_vals jsonb := '{}'::jsonb;
  after_vals jsonb := '{}'::jsonb;
  r_site uuid;
  r_year integer;
  r_month integer;
begin
  if tg_op = 'DELETE' then
    before_vals := coalesce(old.cell_values, '{}'::jsonb);
    r_site := old.site_id;
    r_year := old.period_year;
    r_month := old.period_month;
  else
    after_vals := coalesce(new.cell_values, '{}'::jsonb);
    r_site := new.site_id;
    r_year := new.period_year;
    r_month := new.period_month;
    if tg_op = 'UPDATE' then
      before_vals := coalesce(old.cell_values, '{}'::jsonb);
      if (new.site_id, new.employee_id, new.period_year, new.period_month)
         is distinct from (old.site_id, old.employee_id, old.period_year, old.period_month) then
        raise exception 'Ligne de pointage : clé non modifiable.' using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if public.hr_payroll_period_status(r_site, make_date(r_year, r_month, 1)) = 'LOCKED' then
    raise exception 'Feuille de pointage figée : paie clôturée.' using errcode = 'check_violation';
  end if;

  for k in
    select key from jsonb_each(after_vals)
    union
    select key from jsonb_each(before_vals)
  loop
    if (after_vals -> k) is distinct from (before_vals -> k)
       and not public.hr_att_col_allowed(k, true, r_site) then
      raise exception 'Colonne % non modifiable pour votre rôle.', k using errcode = 'insufficient_privilege';
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_hr_attendance_sheet_rows_guard on public.hr_attendance_sheet_rows;
create trigger trg_hr_attendance_sheet_rows_guard
  before insert or update or delete on public.hr_attendance_sheet_rows
  for each row execute function public.hr_attendance_sheet_rows_guard();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.hr_attendance_columns enable row level security;
alter table public.hr_attendance_column_roles enable row level security;
alter table public.hr_attendance_sheet_rows enable row level security;

drop policy if exists hr_att_cols_read on public.hr_attendance_columns;
create policy hr_att_cols_read on public.hr_attendance_columns
  for select to authenticated using (true);
drop policy if exists hr_att_cols_write on public.hr_attendance_columns;
create policy hr_att_cols_write on public.hr_attendance_columns
  for all to authenticated
  using (public.erp_is_super_admin())
  with check (public.erp_is_super_admin());

drop policy if exists hr_att_col_roles_read on public.hr_attendance_column_roles;
create policy hr_att_col_roles_read on public.hr_attendance_column_roles
  for select to authenticated using (true);
drop policy if exists hr_att_col_roles_write on public.hr_attendance_column_roles;
create policy hr_att_col_roles_write on public.hr_attendance_column_roles
  for all to authenticated
  using (public.erp_is_super_admin())
  with check (public.erp_is_super_admin());

drop policy if exists hr_att_rows_read on public.hr_attendance_sheet_rows;
create policy hr_att_rows_read on public.hr_attendance_sheet_rows
  for select to authenticated
  using (public.erp_can_see_site(site_id) and public.erp_has_perm('hr_attendance', 'read', site_id));
drop policy if exists hr_att_rows_write on public.hr_attendance_sheet_rows;
create policy hr_att_rows_write on public.hr_attendance_sheet_rows
  for all to authenticated
  using (public.erp_has_perm('hr_attendance', 'update', site_id))
  with check (public.erp_has_perm('hr_attendance', 'update', site_id));

grant select on public.hr_attendance_columns, public.hr_attendance_column_roles to authenticated;
grant insert, update, delete on public.hr_attendance_columns, public.hr_attendance_column_roles to authenticated;
grant select, insert, update, delete on public.hr_attendance_sheet_rows to authenticated;

-- La grille des jours n'est modifiable que si la colonne DAYS l'est pour le rôle.
drop policy if exists hr_att_write on public.hr_attendance;
create policy hr_att_write on public.hr_attendance for all to authenticated
  using (
    public.erp_has_perm('hr_attendance', 'update', site_id)
    and public.hr_att_col_allowed('DAYS', true, site_id)
  )
  with check (
    public.erp_has_perm('hr_attendance', 'update', site_id)
    and public.hr_att_col_allowed('DAYS', true, site_id)
  );

-- ---------------------------------------------------------------------------
-- Colonnes initiales (modèle POINTAGE HAOUD BERKAOUI / EL GASSI, sans montants)
-- ---------------------------------------------------------------------------
insert into public.hr_attendance_columns
  (code, label_fr, label_ar, kind, source, value_type, catalog_kind, sort_order, is_system)
values
  ('ROW_NO',         'N°',               'الرقم',            'IDENTITY',    'ROW_NO',         'text',    null,        10,  true),
  ('MAT',            'MAT',              'الرقم التسلسلي',   'IDENTITY',    'MATRICULE',      'text',    null,        20,  true),
  ('NOM',            'NOM',              'اللقب',            'IDENTITY',    'LAST_NAME',      'text',    null,        30,  true),
  ('PRENOM',         'PRENOM',           'الاسم',            'IDENTITY',    'FIRST_NAME',     'text',    null,        40,  true),
  ('POSTE_EFFECTIF', 'POSTE OCCUPE',     'المنصب الفعلي',    'IDENTITY',    'POSTE_EFFECTIF', 'catalog', 'job_title', 50,  true),
  ('AFFECTATION',    'AFFECTATION',      'التعيين',          'IDENTITY',    'AFFECTATION',    'text',    null,        60,  true),
  ('DAYS',           'Jours du mois',    'أيام الشهر',       'DAYS',        null,             'text',    null,        100, true),
  ('CODE_COUNTS',    'Totaux par code',  'مجاميع الرموز',    'CODE_COUNTS', null,             'text',    null,        200, true),
  ('NJ',             'NJ',               'عدد أيام الشهر',   'TOTAL',       'NJ',             'number',  null,        300, true),
  ('COEF',           'Coef',             'مجموع المعاملات',  'TOTAL',       'COEF',           'number',  null,        310, true),
  ('DEBUT_CONTRAT',  'Début contrat',    'بداية العقد',      'IDENTITY',    'CONTRACT_START', 'date',    null,        320, true),
  ('COMMENTAIRE',    'COMMENTAIRE',      'ملاحظات',          'INPUT',       null,             'text',    null,        400, false),
  ('VALIDATION',     'VALIDATION',       'المصادقة',         'INPUT',       null,             'text',    null,        410, false)
on conflict (code) do nothing;

-- Droits initiaux (modifiables ensuite depuis Paramètres RH → Feuille de présence).
insert into public.hr_attendance_column_roles (column_id, role_id, can_view, can_edit)
select
  c.id,
  r.id,
  case
    when r.code = 'CHEF_CHANTIER' then c.code not in ('VALIDATION', 'DEBUT_CONTRAT', 'COEF')
    else true
  end,
  case
    when r.code in ('ADMIN_RH', 'GERANT') then c.code in ('DAYS', 'POSTE_EFFECTIF', 'COMMENTAIRE', 'VALIDATION')
    when r.code = 'CHEF_CHANTIER' then c.code in ('DAYS', 'COMMENTAIRE')
    else false
  end
from public.hr_attendance_columns c
cross join public.sys_roles r
where r.code <> 'SUPER_ADMIN'
on conflict (column_id, role_id) do nothing;

commit;
