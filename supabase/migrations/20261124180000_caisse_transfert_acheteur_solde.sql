-- Les avances « TRANSFERT ACHETEUR » déplacent du solde entre acheteurs
-- sans toucher la caisse centrale (pas un tirage Espèces / banque).

begin;

create or replace function public.caisse_system_solde()
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when not public.caisse_can_access() then null
    else
      coalesce((select sum(amount) from public.caisse_journal_openings), 0)
      + coalesce((
        select sum(l.qty * l.unit_price)
        from public.caisse_lines l
        join public.caisse_operations o on o.id = l.operation_id
        where o.voided_at is null
          and o.kind = 'ALIMENTATION'
          and l.line_no = 1
      ), 0)
      - coalesce((
        select sum(l.qty * l.unit_price)
        from public.caisse_lines l
        join public.caisse_operations o on o.id = l.operation_id
        where o.voided_at is null
          and o.kind = 'AVANCE'
          and l.line_no = 1
          and coalesce(o.affectation, '') <> 'TRANSFERT ACHETEUR'
      ), 0)
  end;
$$;

commit;
