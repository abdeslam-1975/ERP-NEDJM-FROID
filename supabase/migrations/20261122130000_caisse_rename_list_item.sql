-- Rename Affectation / Unité / Matricule labels and cascade to journal history.

begin;

create or replace function public.caisse_rename_list_item(
  p_list_key text,
  p_old text,
  p_new text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old text := trim(both from regexp_replace(coalesce(p_old, ''), '\s+', ' ', 'g'));
  v_new text := trim(both from regexp_replace(coalesce(p_new, ''), '\s+', ' ', 'g'));
  v_key text := upper(trim(coalesce(p_list_key, '')));
begin
  if not public.caisse_can_manage_lists() then
    raise exception 'Réservé à l’administrateur caisse ou à la personne déléguée (Listes)'
      using errcode = 'P0001';
  end if;

  if v_key not in ('AFFECTATION', 'UNIT', 'MATRICULE') then
    raise exception 'Liste inconnue' using errcode = 'P0001';
  end if;

  if char_length(v_old) < 1 or char_length(v_new) < 1 or char_length(v_new) > 120 then
    raise exception 'Libellé invalide (1 à 120 caractères)' using errcode = 'P0001';
  end if;

  if lower(v_old) = lower(v_new) and v_old = v_new then
    return;
  end if;

  if v_key = 'AFFECTATION' and upper(v_old) = 'PARC ROULANT' then
    raise exception 'PARC ROULANT est une affectation système et ne peut pas être renommée'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.caisse_lists l
    where l.list_key = v_key
      and l.label = v_old
  ) then
    raise exception 'Valeur introuvable dans la liste' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.caisse_lists l
    where l.list_key = v_key
      and lower(l.label) = lower(v_new)
      and l.label is distinct from v_old
  ) then
    raise exception 'Cette valeur existe déjà dans la liste' using errcode = 'P0001';
  end if;

  update public.caisse_lists
  set label = v_new
  where list_key = v_key
    and label = v_old;

  if v_key = 'AFFECTATION' then
    update public.caisse_operations
    set affectation = v_new
    where affectation = v_old;
  elsif v_key = 'MATRICULE' then
    update public.caisse_operations
    set matricule = v_new
    where matricule = v_old;
  elsif v_key = 'UNIT' then
    update public.caisse_lines
    set unit = v_new
    where unit = v_old;
  end if;
end;
$$;

revoke all on function public.caisse_rename_list_item(text, text, text) from public;
grant execute on function public.caisse_rename_list_item(text, text, text) to authenticated;

commit;
