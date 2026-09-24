-- Salary rubriques: SUPER_ADMIN dictionary + assignment values (employee / site / contract).

begin;

create table if not exists public.hr_salary_rubriques (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label_ar text not null,
  label_fr text not null,
  nature text not null default 'indemnite'
    check (nature in ('indemnite', 'prime', 'rappel', 'remboursement', 'retenue')),
  unit text not null default 'month'
    check (unit in ('day', 'month', 'percent', 'presence_day')),
  category text not null default '1'
    check (category in ('1', '2', '3', '4')),
  cotisable boolean not null default true,
  taxable boolean not null default true,
  apply_scope text not null default 'employee'
    check (apply_scope in ('employee', 'site', 'contract')),
  default_amount numeric(14,2) not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_salary_assignments (
  id uuid primary key default gen_random_uuid(),
  rubrique_id uuid not null references public.hr_salary_rubriques(id) on delete cascade,
  employee_id uuid references public.hr_employees(id) on delete cascade,
  site_id uuid references public.ref_sites(id) on delete cascade,
  contract_id uuid references public.hr_contracts(id) on delete cascade,
  amount numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_salary_asg_one_target check (
    (employee_id is not null)::int
    + (site_id is not null)::int
    + (contract_id is not null)::int
    = 1
  )
);

create unique index if not exists hr_salary_asg_emp_uidx
  on public.hr_salary_assignments (rubrique_id, employee_id)
  where employee_id is not null;
create unique index if not exists hr_salary_asg_site_uidx
  on public.hr_salary_assignments (rubrique_id, site_id)
  where site_id is not null;
create unique index if not exists hr_salary_asg_ctr_uidx
  on public.hr_salary_assignments (rubrique_id, contract_id)
  where contract_id is not null;
create index if not exists hr_salary_asg_rubrique_idx
  on public.hr_salary_assignments (rubrique_id);

drop trigger if exists trg_hr_salary_rubriques_u on public.hr_salary_rubriques;
create trigger trg_hr_salary_rubriques_u before update on public.hr_salary_rubriques
  for each row execute function public.erp_set_updated_at();
drop trigger if exists trg_hr_salary_assignments_u on public.hr_salary_assignments;
create trigger trg_hr_salary_assignments_u before update on public.hr_salary_assignments
  for each row execute function public.erp_set_updated_at();

create or replace function public.hr_salary_asg_align()
returns trigger
language plpgsql
as $$
declare
  v_scope text;
begin
  select apply_scope into v_scope
  from public.hr_salary_rubriques
  where id = new.rubrique_id;
  if v_scope is null then
    raise exception 'Rubrique introuvable';
  end if;
  if v_scope = 'employee' and (new.employee_id is null or new.site_id is not null or new.contract_id is not null) then
    raise exception 'Cette rubrique s''applique uniquement à un employé';
  end if;
  if v_scope = 'site' and (new.site_id is null or new.employee_id is not null or new.contract_id is not null) then
    raise exception 'Cette rubrique s''applique uniquement à un chantier';
  end if;
  if v_scope = 'contract' and (new.contract_id is null or new.employee_id is not null or new.site_id is not null) then
    raise exception 'Cette rubrique s''applique uniquement à un contrat';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_salary_asg_align on public.hr_salary_assignments;
create trigger trg_hr_salary_asg_align
  before insert or update of rubrique_id, employee_id, site_id, contract_id
  on public.hr_salary_assignments
  for each row execute function public.hr_salary_asg_align();

alter table public.hr_salary_rubriques enable row level security;
alter table public.hr_salary_assignments enable row level security;

drop policy if exists hr_salary_rub_read on public.hr_salary_rubriques;
create policy hr_salary_rub_read on public.hr_salary_rubriques
  for select to authenticated using (true);
drop policy if exists hr_salary_rub_write on public.hr_salary_rubriques;
create policy hr_salary_rub_write on public.hr_salary_rubriques
  for all to authenticated
  using (public.erp_is_super_admin())
  with check (public.erp_is_super_admin());

drop policy if exists hr_salary_asg_read on public.hr_salary_assignments;
create policy hr_salary_asg_read on public.hr_salary_assignments
  for select to authenticated using (true);
drop policy if exists hr_salary_asg_write on public.hr_salary_assignments;
create policy hr_salary_asg_write on public.hr_salary_assignments
  for all to authenticated
  using (public.erp_is_super_admin())
  with check (public.erp_is_super_admin());

grant select, insert, update, delete on public.hr_salary_rubriques to authenticated;
grant select, insert, update, delete on public.hr_salary_assignments to authenticated;
grant execute on function public.hr_salary_asg_align() to authenticated;

insert into public.hr_salary_rubriques (
  code, label_ar, label_fr, nature, unit, category, cotisable, taxable, apply_scope, default_amount, sort_order
) values
  ('101', 'تدارك الأجر', 'Rappel Salaire', 'rappel', 'day', '1', true, true, 'employee', 0, 101),
  ('102', 'تعويض الساعات الإضافية', 'Indemnité des Heures Supplémentaires', 'indemnite', 'day', '1', true, true, 'employee', 0, 102),
  ('103', 'تعويض العطلة/الاسترجاع', 'Indemnité du Congés/Récup', 'indemnite', 'day', '1', true, true, 'employee', 0, 103),
  ('104', 'تعويض العطلة السنوية', 'Indemnité du Congés Annuel', 'indemnite', 'day', '1', true, true, 'contract', 0, 104),
  ('105', 'تعويض الخبرة المهنية', 'Indemnité Experience Professionnelle', 'indemnite', 'percent', '1', true, true, 'contract', 0, 105),
  ('106', 'تعويض الإزعاج', 'Indemnité de Nuisance', 'indemnite', 'month', '1', true, true, 'contract', 0, 106),
  ('107', 'منحة المسؤولية', 'Prime de Responsabilité', 'prime', 'percent', '1', true, true, 'contract', 0, 107),
  ('108', 'منحة الخطر', 'Prime de Risque', 'prime', 'percent', '1', true, true, 'contract', 0, 108),
  ('109', 'منحة السياقة', 'Prime de Conduite', 'prime', 'day', '1', true, true, 'site', 0, 109),
  ('110', 'منحة المردود الجماعي', 'Prime de Rendement Collectif', 'prime', 'month', '1', true, true, 'site', 0, 110),
  ('111', 'منحة المردود الفردي', 'Prime de Rendement Individuel', 'prime', 'month', '1', true, true, 'employee', 0, 111),
  ('301', 'تعويض النقل', 'Indemnité de Transport', 'indemnite', 'day', '3', false, true, 'site', 0, 301),
  ('302', 'وجبة العامل', 'Prime de Panier des Jours Travaillés', 'prime', 'day', '3', false, true, 'site', 0, 302),
  ('303', 'مستلزمات النظافة', 'Salissure', 'indemnite', 'month', '3', false, true, 'contract', 0, 303),
  ('400', 'تعويض المنطقة المعزولة', 'Indemnité Forfaitaire Région Isolée', 'indemnite', 'day', '4', false, false, 'site', 0, 400),
  ('401', 'تدارك تعويض المنطقة المعزولة', 'Rappel Indemnité Forfaitaire Région Isolée', 'rappel', 'day', '4', false, false, 'employee', 0, 401),
  ('402', 'منحة العيد', 'Prime de l''Aïd', 'prime', 'month', '4', false, false, 'employee', 0, 402),
  ('403', 'منحة الزواج', 'Prime de Mariage', 'prime', 'month', '4', false, false, 'employee', 0, 403),
  ('404', 'تعويض الوفاة', 'Indemnité de Décès', 'indemnite', 'day', '4', false, false, 'employee', 0, 404),
  ('405', 'تعويض المركبة', 'Indemnité de Véhicule', 'indemnite', 'day', '4', false, false, 'employee', 0, 405),
  ('406', 'استرجاع تكاليف الهاتف', 'Remboursement des Communications Téléphoniques', 'remboursement', 'month', '4', false, false, 'employee', 0, 406)
on conflict (code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  nature = excluded.nature,
  unit = excluded.unit,
  category = excluded.category,
  cotisable = excluded.cotisable,
  taxable = excluded.taxable,
  sort_order = excluded.sort_order;

comment on table public.hr_salary_rubriques is
  'Dictionnaire des rubriques de salaire. apply_scope et montants gérés par SUPER_ADMIN depuis l''UI.';
comment on table public.hr_salary_assignments is
  'Valeurs par employé, chantier ou contrat selon apply_scope de la rubrique.';

commit;
