-- Speed up caisse desk load: InitPlan-friendly RLS + money RPC (one flags lookup).
-- authenticated role has statement_timeout=8s; nested PostgREST + per-row RLS was timing out
-- after archive months were imported (~700+ operations).

begin;

-- Force InitPlan caching: wrap flag/access checks in (SELECT ...) so Postgres
-- evaluates them once per query instead of once per row.
create or replace function public.caisse_op_visible(p_kind text, p_buyer text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    (
      select case
        when not (select public.fin_can_access('read', null)) then false
        when p_kind = 'ACHAT' then (
          f.see_all or f.is_admin or p_buyer = f.actor_name or coalesce(p_buyer, '') = ''
        )
        else (f.caisse_ops or f.is_admin)
      end
      from public.caisse_flags() f
      limit 1
    ),
    false
  );
$$;

drop policy if exists caisse_operations_read on public.caisse_operations;
create policy caisse_operations_read on public.caisse_operations
  for select to authenticated
  using (
    (voided_at is null)
    and (select public.caisse_op_visible(kind, buyer_name))
  );

drop policy if exists caisse_lines_read on public.caisse_lines;
create policy caisse_lines_read on public.caisse_lines
  for select to authenticated
  using (
    exists (
      select 1
      from public.caisse_operations o
      where o.id = caisse_lines.operation_id
        and o.voided_at is null
        and (select public.caisse_op_visible(o.kind, o.buyer_name))
    )
  );

-- Lightweight money rows for soldes (SECURITY DEFINER, visibility checked once).
create or replace function public.caisse_journal_money()
returns table (
  id uuid,
  op_number integer,
  kind text,
  op_date date,
  buyer_name text,
  total numeric
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  f record;
begin
  if auth.uid() is null or not public.fin_can_access('read', null) then
    return;
  end if;
  select * into f from public.caisse_flags() limit 1;
  if not found then
    return;
  end if;

  return query
  select
    o.id,
    o.op_number,
    o.kind,
    o.op_date,
    o.buyer_name,
    coalesce(sum(l.qty * l.unit_price), 0)::numeric as total
  from public.caisse_operations o
  left join public.caisse_lines l on l.operation_id = o.id
  where o.voided_at is null
    and (
      (
        o.kind = 'ACHAT'
        and (f.see_all or f.is_admin or o.buyer_name = f.actor_name or coalesce(o.buyer_name, '') = '')
      )
      or (o.kind <> 'ACHAT' and (f.caisse_ops or f.is_admin))
    )
  group by o.id, o.op_number, o.kind, o.op_date, o.buyer_name
  order by o.op_date desc, o.op_number desc;
end;
$$;

revoke all on function public.caisse_journal_money() from public;
grant execute on function public.caisse_journal_money() to authenticated;

commit;
