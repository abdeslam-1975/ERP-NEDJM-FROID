-- Le remplissage précédent a marqué les 817 employés comme cartes réalisées.
-- On ne garde que les cartes enregistrées par un compte connecté
-- durant la semaine du 22 au 28 novembre 2026 (heure d'Alger).
-- Les dossiers salariés, contrats et documents restent en place.

begin;

set local session_replication_role = replica;

with week_cards as (
  select a.target_id, max(a.occurred_at) as done_at
  from public.sys_audit_logs a
  where a.table_name = 'hr_employees'
    and a.action = 'UPDATE'
    and a.user_id is not null
    and a.occurred_at >= timestamptz '2026-11-22 00:00:00+01'
    and a.occurred_at < timestamptz '2026-11-29 00:00:00+01'
    and (
      coalesce(a.new_values->>'last_name_ar', '') <> ''
      or coalesce(a.new_values->>'first_name_ar', '') <> ''
    )
  group by a.target_id
)
update public.hr_employees e
set fiche_done_at = w.done_at
from public.hr_employees src
left join week_cards w on w.target_id = src.id::text
where e.id = src.id
  and e.fiche_done_at is distinct from w.done_at;

commit;
