-- Fast admin RPCs for bulk bons import: month-scoped, no nested PostgREST RLS.

begin;

create or replace function public.caisse_sheet_month_bounds(p_sheet text)
returns table (start_date date, end_exclusive date)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sheet text := upper(trim(coalesce(p_sheet, '')));
  v_year int;
  v_month int;
  v_token text;
  months text[] := array[
    'JANVIER','FEVRIER','MARS','AVRIL','MAI','JUIN',
    'JUILLET','AOUT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DECEMBRE'
  ];
  i int;
begin
  v_year := nullif(substring(v_sheet from '(20\d{2})'), '')::int;
  if v_year is null then
    return;
  end if;
  v_token := regexp_replace(
    split_part(v_sheet, ' ', 1),
    '[ÉÈÊ]',
    'E',
    'g'
  );
  v_month := null;
  for i in 1..12 loop
    if months[i] = v_token then
      v_month := i;
      exit;
    end if;
  end loop;
  if v_month is null then
    return;
  end if;
  start_date := make_date(v_year, v_month, 1);
  end_exclusive := (start_date + interval '1 month')::date;
  return next;
end;
$$;

revoke all on function public.caisse_sheet_month_bounds(text) from public;
grant execute on function public.caisse_sheet_month_bounds(text) to authenticated;

create or replace function public.caisse_bon_attach_targets(p_month text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_bounds record;
  v_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Session requise' using errcode = 'P0001';
  end if;
  select exists (
    select 1 from public.caisse_flags() f where f.is_admin
  ) into v_is_admin;
  if not coalesce(v_is_admin, false) then
    raise exception 'Réservé à l’administrateur' using errcode = 'P0001';
  end if;

  select * into v_bounds from public.caisse_sheet_month_bounds(p_month) limit 1;
  if not found then
    raise exception 'Mois invalide' using errcode = 'P0001';
  end if;

  return coalesce(
    (
      select jsonb_agg(to_jsonb(t) order by t.date, t.op)
      from (
        select
          o.id as "operationId",
          o.op_number as op,
          to_char(o.op_date, 'YYYY-MM-DD') as date,
          round(coalesce(sum(l.qty * l.unit_price), 0)::numeric, 2) as amount,
          coalesce(o.buyer_name, '') as buyer,
          (o.photo_data is not null) as "hasPhoto"
        from public.caisse_operations o
        left join public.caisse_lines l on l.operation_id = o.id
        where o.voided_at is null
          and o.kind = 'ACHAT'
          and o.op_date >= v_bounds.start_date
          and o.op_date < v_bounds.end_exclusive
        group by o.id
      ) t
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.caisse_bon_attach_targets(text) from public;
grant execute on function public.caisse_bon_attach_targets(text) to authenticated;

create or replace function public.caisse_month_bon_downloads(p_month text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_bounds record;
  v_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Session requise' using errcode = 'P0001';
  end if;
  select exists (
    select 1 from public.caisse_flags() f where f.is_admin
  ) into v_is_admin;
  if not coalesce(v_is_admin, false) then
    raise exception 'Réservé à l’administrateur' using errcode = 'P0001';
  end if;

  select * into v_bounds from public.caisse_sheet_month_bounds(p_month) limit 1;
  if not found then
    raise exception 'Mois invalide' using errcode = 'P0001';
  end if;

  return coalesce(
    (
      select jsonb_agg(to_jsonb(t) order by t.op)
      from (
        select
          o.id as "operationId",
          o.op_number as op,
          to_char(o.op_date, 'YYYY-MM-DD') as date
        from public.caisse_operations o
        where o.voided_at is null
          and o.kind = 'ACHAT'
          and o.photo_data is not null
          and o.op_date >= v_bounds.start_date
          and o.op_date < v_bounds.end_exclusive
      ) t
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.caisse_month_bon_downloads(text) from public;
grant execute on function public.caisse_month_bon_downloads(text) to authenticated;

-- Attach large photo_data without nested RLS cost; still admin-gated.
create or replace function public.caisse_attach_bon_photo(
  p_operation_id uuid,
  p_photo_data text,
  p_match_status text default 'unknown',
  p_replace boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_admin boolean;
  v_op public.caisse_operations%rowtype;
  v_status text := lower(trim(coalesce(p_match_status, 'unknown')));
  v_archive text;
begin
  if auth.uid() is null then
    raise exception 'Session requise' using errcode = 'P0001';
  end if;
  select exists (
    select 1 from public.caisse_flags() f where f.is_admin
  ) into v_is_admin;
  if not coalesce(v_is_admin, false) then
    raise exception 'Réservé à l’administrateur' using errcode = 'P0001';
  end if;

  if p_photo_data is null
     or (
       p_photo_data not like 'data:image/%'
       and p_photo_data not like 'data:application/pdf%'
     ) then
    raise exception 'Le bon doit être une image ou un PDF.' using errcode = 'P0001';
  end if;
  if char_length(p_photo_data) > 3800000 then
    raise exception 'Bon trop lourd (limite ~3,5 Mo).' using errcode = 'P0001';
  end if;
  if v_status not in ('ok', 'warn', 'bad', 'unknown') then
    v_status := 'unknown';
  end if;

  select * into v_op
  from public.caisse_operations o
  where o.id = p_operation_id
    and o.voided_at is null;
  if not found then
    raise exception 'Opération introuvable.' using errcode = 'P0001';
  end if;
  if v_op.kind <> 'ACHAT' then
    raise exception 'Uniquement pour les achats.' using errcode = 'P0001';
  end if;
  if v_op.photo_data is not null and not coalesce(p_replace, false) then
    raise exception 'L’opération N° % a déjà un bon.', v_op.op_number using errcode = 'P0001';
  end if;

  update public.caisse_operations
  set
    photo_data = p_photo_data,
    bon_label = 'Voir Bon',
    bon_match_status = v_status
  where id = v_op.id;

  v_archive := 'Bon_N' || v_op.op_number::text;

  return jsonb_build_object(
    'op', v_op.op_number,
    'archiveName', v_archive,
    'date', to_char(v_op.op_date, 'YYYY-MM-DD'),
    'message', format('✅ Bon lié à N° %s', v_op.op_number)
  );
end;
$$;

revoke all on function public.caisse_attach_bon_photo(uuid, text, text, boolean) from public;
grant execute on function public.caisse_attach_bon_photo(uuid, text, text, boolean) to authenticated;

commit;
