-- Replace the cutoff snapshot for one box in a single transaction.
-- The deferred check (buyer openings = box opening) cannot survive one insert per request.
-- Box opening is set to the sum of the buyer rows. No fin_* objects.

create or replace function public.caisse_save_openings(
  p_box_id uuid,
  p_opening_date date,
  p_buyers jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_sum numeric(18,2) := 0;
  v_row jsonb;
  v_buyer uuid;
  v_amount numeric(18,2);
  v_seen uuid[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Session requise';
  end if;
  if not (
    public.erp_has_perm('caisse', 'update', null)
    or public.erp_has_perm('caisse', 'create', null)
  ) then
    raise exception 'Accès refusé';
  end if;
  if p_opening_date is null then
    raise exception 'Date de coupe requise';
  end if;
  if not exists (select 1 from public.caisse_boxes where id = p_box_id) then
    raise exception 'Caisse introuvable';
  end if;
  if p_buyers is null or jsonb_typeof(p_buyers) <> 'array' then
    raise exception 'Liste des acheteurs invalide';
  end if;

  for v_row in select value from jsonb_array_elements(p_buyers)
  loop
    v_buyer := (v_row->>'buyer_id')::uuid;
    v_amount := round((v_row->>'amount')::numeric, 2);
    if v_amount < 0 or v_amount > 999999999999.99 then
      raise exception 'Montant d''ouverture invalide';
    end if;
    if v_buyer = any (v_seen) then
      raise exception 'Acheteur en double';
    end if;
    v_seen := v_seen || v_buyer;
    if not exists (select 1 from public.caisse_buyers where id = v_buyer) then
      raise exception 'Acheteur introuvable';
    end if;
    v_sum := v_sum + v_amount;
  end loop;

  delete from public.caisse_openings
  where box_id = p_box_id
    and opening_date = p_opening_date;

  insert into public.caisse_openings (box_id, buyer_id, opening_date, amount)
  values (p_box_id, null, p_opening_date, v_sum);

  for v_row in select value from jsonb_array_elements(p_buyers)
  loop
    insert into public.caisse_openings (box_id, buyer_id, opening_date, amount)
    values (
      p_box_id,
      (v_row->>'buyer_id')::uuid,
      p_opening_date,
      round((v_row->>'amount')::numeric, 2)
    );
  end loop;
end;
$$;

revoke all on function public.caisse_save_openings(uuid, date, jsonb) from public, anon;
grant execute on function public.caisse_save_openings(uuid, date, jsonb) to authenticated;

notify pgrst, 'reload schema';
