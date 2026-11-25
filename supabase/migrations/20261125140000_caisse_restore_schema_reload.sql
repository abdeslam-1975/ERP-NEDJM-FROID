-- Fix corbeille: avoid reading photo_data blob; reload PostgREST schema cache
-- so RPCs created via SQL Editor are visible to the API.

begin;

create or replace function public.caisse_list_voided_operations(p_limit integer default 100)
returns table (
  id uuid,
  op_number integer,
  kind text,
  op_date date,
  affectation text,
  buyer_name text,
  reference text,
  designation text,
  amount numeric,
  voided_at timestamptz,
  has_photo boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.caisse_can_restore_operations() then
    raise exception 'Accès réservé : restauration admin (ou droit délégué).' using errcode = 'P0001';
  end if;

  return query
  select
    o.id,
    o.op_number,
    o.kind,
    o.op_date,
    o.affectation,
    o.buyer_name,
    o.reference,
    coalesce(
      (
        select l.designation
        from public.caisse_lines l
        where l.operation_id = o.id
        order by l.line_no
        limit 1
      ),
      ''
    ) as designation,
    coalesce(
      (
        select sum(l.qty * l.unit_price)
        from public.caisse_lines l
        where l.operation_id = o.id
      ),
      0
    )::numeric as amount,
    o.voided_at,
    coalesce(o.has_photo, false) as has_photo
  from public.caisse_operations o
  where o.voided_at is not null
  order by o.voided_at desc nulls last, o.op_date desc, o.id
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.caisse_list_voided_operations(integer) from public;
grant execute on function public.caisse_list_voided_operations(integer) to authenticated;

commit;

-- Make new / replaced RPCs visible to the API immediately.
notify pgrst, 'reload schema';
