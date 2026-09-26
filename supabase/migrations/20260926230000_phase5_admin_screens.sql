-- Phase 5: register the RH screens added in phases 2-5 in the rights matrix.
-- Each role inherits its rights from the payroll screen (hr_payroll); adjust afterwards in /administration/permissions.
begin;

insert into public.sys_screens (code, path, module, label_fr, label_ar, sort_order)
values
  ('hr_postes', '/rh/postes', 'rh', 'Postes & grille salariale', 'المناصب وسلم الأجور', 215),
  ('hr_leave', '/rh/conges', 'rh', 'Congés & absences', 'العطل والغيابات', 216),
  ('hr_exits', '/rh/sorties', 'rh', 'Sorties & STC', 'الخروج وتصفية الحساب', 217),
  ('hr_letters', '/rh/attestations', 'rh', 'Attestations & courriers', 'الشهادات والمراسلات', 218),
  ('hr_advances', '/rh/paie/avances', 'rh', 'Avances & prêts', 'التسبيقات والقروض', 219),
  ('hr_transfers', '/rh/paie/virements', 'rh', 'Virements des salaires', 'تحويلات الأجور', 220),
  ('hr_costs', '/rh/couts', 'rh', 'Coûts par chantier / contrat', 'التكاليف حسب الورشة والعقد', 221),
  ('hr_interim', '/rh/interim', 'rh', 'Intérim', 'العمالة المؤقتة', 222)
on conflict (code) do nothing;

insert into public.sys_permissions (role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export)
select p.role_id, s.id, p.can_create, p.can_read, p.can_update, p.can_delete, p.can_print, p.can_export
from public.sys_permissions p
join public.sys_screens src on src.id = p.screen_id and src.code = 'hr_payroll'
cross join public.sys_screens s
where s.code in ('hr_postes', 'hr_leave', 'hr_exits', 'hr_letters', 'hr_advances', 'hr_transfers', 'hr_costs', 'hr_interim')
on conflict (role_id, screen_id) do nothing;

-- System roles keep their code and stay active (RLS helpers and page guards rely on them).
create or replace function public.sys_roles_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'Rôle système : suppression impossible.' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if old.is_system and (new.code is distinct from old.code or not new.is_active or not new.is_system) then
    raise exception 'Rôle système : code et activation non modifiables.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sys_roles_guard on public.sys_roles;
create trigger trg_sys_roles_guard before update or delete on public.sys_roles
  for each row execute function public.sys_roles_guard();

drop trigger if exists trg_sys_roles_audit on public.sys_roles;
create trigger trg_sys_roles_audit after insert or update or delete on public.sys_roles
  for each row execute function public.sys_audit_row_change();

drop trigger if exists trg_sys_period_locks_audit on public.sys_period_locks;
create trigger trg_sys_period_locks_audit after insert or update or delete on public.sys_period_locks
  for each row execute function public.sys_audit_row_change();

commit;
