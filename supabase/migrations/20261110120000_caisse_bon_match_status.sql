-- Statut de contrôle du bon (date / montant) pour alerte visuelle dans le journal.
alter table public.caisse_operations
  add column if not exists bon_match_status text;

alter table public.caisse_operations
  drop constraint if exists caisse_operations_bon_match_status_check;

alter table public.caisse_operations
  add constraint caisse_operations_bon_match_status_check
  check (
    bon_match_status is null
    or bon_match_status in ('ok', 'warn', 'bad', 'unknown')
  );

comment on column public.caisse_operations.bon_match_status is
  'Contrôle OCR du bon: ok | warn (1 écart) | bad (date+montant) | unknown';

-- Remettre le libellé d’affichage standard (le nom d’archive est calculé à l’export).
update public.caisse_operations
set bon_label = 'Voir Bon'
where has_photo
  and (
    bon_label is null
    or bon_label = ''
    or bon_label like 'Bon_N%'
  );
