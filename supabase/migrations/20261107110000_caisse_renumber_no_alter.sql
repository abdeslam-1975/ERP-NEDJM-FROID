-- Renumber must not ALTER TABLE (fails during INSERT/UPDATE triggers:
-- "cannot ALTER TABLE caisse_operations because it is being used by active queries").
-- Use a session flag instead so the guard lets the renumber pass through.

begin;

create or replace function public.caisse_guard_operation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  f record;
  v_today date := (timezone('Africa/Algiers', now()))::date;
  v_closed boolean;
begin
  -- Internal renumber pass (op_number only): skip business checks.
  if current_setting('caisse.skip_guard', true) = 'on' then
    return new;
  end if;

  select * into f from public.caisse_flags() limit 1;
  if not found then
    raise exception 'Session requise' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and new.voided_at is not null and old.voided_at is null then
    if not (f.is_admin or f.can_edit) then
      raise exception 'Accès réservé : droit Modifier/Supprimer requis.' using errcode = 'P0001';
    end if;
    new.voided_by := auth.uid();
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.kind = 'ACHAT' then
      if not (
        f.is_admin
        or new.buyer_name = f.actor_name
        or (f.buy_for_others and char_length(trim(new.buyer_name)) > 0)
      ) then
        raise exception 'Achat non autorisé pour cet acheteur' using errcode = 'P0001';
      end if;
      if not (f.is_admin or f.dates_libres) and new.op_date not in (v_today, v_today - 1) then
        raise exception 'Date limitée à hier et aujourd’hui' using errcode = 'P0001';
      end if;
    elsif not (f.is_admin or f.caisse_ops) then
      raise exception 'Accès caisse requis' using errcode = 'P0001';
    end if;
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
  elsif not (f.is_admin or f.can_edit) then
    raise exception 'Accès réservé : droit Modifier/Supprimer requis.' using errcode = 'P0001';
  end if;

  if new.kind in ('AVANCE', 'ALIMENTATION') and new.voided_at is null then
    select exists (
      select 1 from public.caisse_journal_closures c
      where c.op_date = new.op_date and c.status = 'CLOSED'
    ) into v_closed;
    if v_closed then
      raise exception 'Journée % clôturée. Demandez à l’admin de rouvrir la caisse pour cette date.', to_char(new.op_date, 'YYYY-MM-DD')
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.caisse_renumber_active_operations()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  perform set_config('caisse.skip_guard', 'on', true);

  with numbered as (
    select
      id,
      row_number() over (order by voided_at nulls last, created_at, id) as rn
    from public.caisse_operations
    where voided_at is not null
  )
  update public.caisse_operations o
  set op_number = -numbered.rn
  from numbered
  where o.id = numbered.id
    and o.op_number is distinct from -numbered.rn;

  with ordered as (
    select
      id,
      row_number() over (order by op_date, created_at, id) as rn
    from public.caisse_operations
    where voided_at is null
  )
  update public.caisse_operations o
  set op_number = 1000000000 + ordered.rn
  from ordered
  where o.id = ordered.id;

  with ordered as (
    select
      id,
      row_number() over (order by op_date, created_at, id) as rn
    from public.caisse_operations
    where voided_at is null
  )
  update public.caisse_operations o
  set op_number = ordered.rn
  from ordered
  where o.id = ordered.id;

  perform set_config('caisse.skip_guard', 'off', true);

  select count(*)::integer into v_count
  from public.caisse_operations
  where voided_at is null;

  if v_count = 0 then
    perform setval('public.caisse_op_seq', 1, false);
  else
    perform setval('public.caisse_op_seq', v_count, true);
  end if;

  return v_count;
exception
  when others then
    perform set_config('caisse.skip_guard', 'off', true);
    raise;
end;
$$;

revoke all on function public.caisse_renumber_active_operations() from public;
grant execute on function public.caisse_renumber_active_operations() to authenticated;

commit;
