-- A work contract may start on any calendar day. Days of the month before that
-- date stay outside the contract. Wilaya, official assignment and legal-variable
-- dates keep their own first-of-month rule.

begin;

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

alter table public.hr_contracts drop constraint if exists hr_contracts_start_first_of_month;

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
  execute 'alter table public.hr_contracts drop constraint if exists hr_contracts_start_first_of_month';
  select count(*) into n
  from public.hr_contracts c
  where extract(day from c.start_date) <> 1 and not c.start_date_exception;
  if n > 0 then
    raise exception 'Contrainte non ajoutée : % contrat(s) sans décision D13 (début hors du 1er du mois).', n
      using errcode = 'check_violation';
  end if;
  return jsonb_build_object('ok', true, 'already', true, 'retired', true);
end;
$$;

commit;
