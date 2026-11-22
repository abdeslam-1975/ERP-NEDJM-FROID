-- Caisse access for ERP users who have caisse rights / caisse screen
-- (not only finance RBAC), plus link journal buyers to accounts by email.

begin;

create or replace function public.caisse_can_access()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and (
      public.fin_can_access('read', null)
      or public.erp_has_perm('caisse', 'read', null)
      or exists (
        select 1
        from public.caisse_rights r
        where r.user_id = auth.uid()
          and coalesce(r.caisse_active, true)
      )
      or exists (
        select 1
        from public.caisse_journal_buyers b
        where b.user_id = auth.uid()
          and b.active
      )
    );
$$;

comment on function public.caisse_can_access() is
  'True when the signed-in user may enter the caisse module (finance read, caisse screen, or delegated caisse rights / linked buyer).';

revoke all on function public.caisse_can_access() from public;
grant execute on function public.caisse_can_access() to authenticated;

-- COMPTABLE is the cash-desk accountant: grant finance + caisse like GERANT.
insert into public.sys_permissions (
  role_id, screen_id, can_create, can_read, can_update, can_delete, can_print, can_export
)
select ro.id, s.id, true, true, true, false, false, false
from public.sys_roles ro
cross join public.sys_screens s
where ro.code = 'COMPTABLE'
  and s.code in ('finance', 'caisse')
  and not exists (
    select 1
    from public.sys_permissions p
    where p.role_id = ro.id and p.screen_id = s.id
  );

create or replace function public.caisse_flags()
returns table (
  is_admin boolean,
  dates_libres boolean,
  buy_for_others boolean,
  see_all boolean,
  caisse_ops boolean,
  can_edit boolean,
  actor_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    adm.is_admin,
    case when adm.is_admin then true else coalesce(r.dates_libres, jb.dates_libres, ger.is_gerant) end,
    case when adm.is_admin then true else coalesce(r.buy_for_others, jb.buy_for_others, false) end,
    case when adm.is_admin then true else coalesce(r.see_all, jb.see_all, ger.is_gerant) end,
    case when adm.is_admin then true else coalesce(r.caisse_ops, jb.caisse_ops, ger.is_gerant) end,
    case when adm.is_admin then true else coalesce(r.can_edit, jb.can_edit, ger.is_gerant) end,
    u.full_name
  from public.sys_users u
  left join public.caisse_rights r on r.user_id = u.id
  cross join lateral (
    select exists (
      select 1
      from public.sys_user_site_roles ur
      join public.sys_roles ro on ro.id = ur.role_id
      where ur.user_id = u.id
        and ro.code in ('SUPER_ADMIN', 'ADMIN_FINANCE')
    ) as is_admin
  ) adm
  cross join lateral (
    select exists (
      select 1
      from public.sys_user_site_roles ur
      join public.sys_roles ro on ro.id = ur.role_id
      where ur.user_id = u.id
        and ro.code = 'GERANT'
    ) as is_gerant
  ) ger
  cross join lateral (
    select
      bool_or(b.dates_libres) as dates_libres,
      bool_or(b.buy_for_others) as buy_for_others,
      bool_or(b.see_all) as see_all,
      bool_or(b.caisse_ops) as caisse_ops,
      bool_or(b.can_edit) as can_edit
    from public.caisse_journal_buyers b
    where b.user_id = u.id
      and b.active
  ) jb
  where u.id = auth.uid()
    and u.status = 'ACTIVE';
$$;

create or replace function public.caisse_buyer_aliases()
returns table (name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.full_name
  from public.sys_users u
  where u.id = auth.uid()
  union
  select b.name
  from public.caisse_journal_buyers b
  where b.user_id = auth.uid()
    and b.active
    and char_length(trim(b.name)) > 0;
$$;

revoke all on function public.caisse_buyer_aliases() from public;
grant execute on function public.caisse_buyer_aliases() to authenticated;

create or replace function public.caisse_op_visible(p_kind text, p_buyer text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select case
        when not (select public.caisse_can_access()) then false
        when p_kind = 'ACHAT' then (
          f.see_all
          or f.is_admin
          or coalesce(p_buyer, '') = ''
          or exists (
            select 1 from public.caisse_buyer_aliases() a where a.name = p_buyer
          )
        )
        else (f.caisse_ops or f.is_admin)
      end
      from public.caisse_flags() f
      limit 1
    ),
    false
  );
$$;

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
        where o.voided_at is null and o.kind = 'ALIMENTATION' and l.line_no = 1
      ), 0)
      - coalesce((
        select sum(l.qty * l.unit_price)
        from public.caisse_lines l
        join public.caisse_operations o on o.id = l.operation_id
        where o.voided_at is null and o.kind = 'AVANCE' and l.line_no = 1
      ), 0)
  end;
$$;

create or replace function public.caisse_my_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  f record;
begin
  if auth.uid() is null or not public.caisse_can_access() then
    return null;
  end if;
  select * into f from public.caisse_flags() limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'isAdmin', f.is_admin,
    'isMaster', f.buy_for_others or f.is_admin,
    'isUnlimited', f.dates_libres or f.is_admin,
    'canSeeAllJournal', f.see_all or f.is_admin,
    'canSeeCaisse', f.caisse_ops or f.is_admin,
    'canManage', f.can_edit or f.is_admin,
    'userName', f.actor_name,
    'solde', public.caisse_system_solde(),
    'today', to_char((timezone('Africa/Algiers', now()))::date, 'YYYY-MM-DD')
  );
end;
$$;

create or replace function public.caisse_log(
  p_action text,
  p_kind text,
  p_op text,
  p_sheet text,
  p_detail text,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  f record;
begin
  select * into f from public.caisse_flags() limit 1;
  if not found or not public.caisse_can_access() then
    return;
  end if;
  insert into public.caisse_audit (user_name, action, kind, op_number, sheet_name, detail, amount)
  values (
    f.actor_name,
    left(coalesce(p_action, ''), 40),
    left(coalesce(p_kind, ''), 40),
    left(coalesce(p_op, ''), 40),
    left(coalesce(p_sheet, ''), 80),
    left(coalesce(p_detail, ''), 500),
    p_amount
  );
end;
$$;

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
set search_path = public, pg_temp
as $$
declare
  f record;
begin
  if auth.uid() is null or not public.caisse_can_access() then
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
        and (
          f.see_all
          or f.is_admin
          or coalesce(o.buyer_name, '') = ''
          or exists (
            select 1 from public.caisse_buyer_aliases() a where a.name = o.buyer_name
          )
        )
      )
      or (o.kind <> 'ACHAT' and (f.caisse_ops or f.is_admin))
    )
  group by o.id, o.op_number, o.kind, o.op_date, o.buyer_name
  order by o.op_date desc, o.op_number desc;
end;
$$;

create or replace function public.caisse_void_operation(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  f record;
  v_op integer;
begin
  if auth.uid() is null or not public.caisse_can_access() then
    raise exception 'Accès caisse refusé.' using errcode = 'P0001';
  end if;
  select * into f from public.caisse_flags() limit 1;
  if not found or not (f.is_admin or f.can_edit) then
    raise exception 'Accès réservé : droit Modifier/Supprimer requis.' using errcode = 'P0001';
  end if;

  select o.op_number into v_op
  from public.caisse_operations o
  where o.id = p_id
    and o.voided_at is null;
  if v_op is null then
    raise exception 'Opération introuvable.' using errcode = 'P0001';
  end if;

  update public.caisse_operations
  set voided_at = now()
  where id = p_id
    and voided_at is null;

  perform public.caisse_renumber_active_operations();
  return v_op;
end;
$$;

drop policy if exists caisse_journal_buyers_read on public.caisse_journal_buyers;
create policy caisse_journal_buyers_read on public.caisse_journal_buyers
  for select to authenticated
  using (public.caisse_can_access());

drop policy if exists caisse_lists_read on public.caisse_lists;
create policy caisse_lists_read on public.caisse_lists
  for select to authenticated
  using (public.caisse_can_access());

drop policy if exists caisse_operations_insert on public.caisse_operations;
create policy caisse_operations_insert on public.caisse_operations
  for insert to authenticated
  with check (public.caisse_can_access());

drop policy if exists caisse_journal_openings_read on public.caisse_journal_openings;
create policy caisse_journal_openings_read on public.caisse_journal_openings
  for select to authenticated
  using (
    public.caisse_can_access()
    and (
      (select f.is_admin or f.see_all from public.caisse_flags() f)
      or exists (
        select 1 from public.caisse_buyer_aliases() a where a.name = buyer_name
      )
    )
  );

-- Link journal buyers to ERP users sharing the same email, copy rights, align history names.
do $$
declare
  rec record;
  v_user_name text;
  v_buyer_name text;
  v_open_amt numeric;
begin
  for rec in
    select b.id as buyer_id, b.name as buyer_name, u.id as user_id, u.full_name as user_name,
           b.dates_libres, b.buy_for_others, b.see_all, b.caisse_ops, b.can_edit, b.active
    from public.caisse_journal_buyers b
    join public.sys_users u
      on lower(trim(u.email)) = lower(trim(b.email))
     and u.status = 'ACTIVE'
    where b.email is not null
      and char_length(trim(b.email)) > 0
      and (b.user_id is null or b.user_id = u.id)
  loop
    update public.caisse_journal_buyers
    set user_id = rec.user_id
    where id = rec.buyer_id
      and (user_id is distinct from rec.user_id);

    insert into public.caisse_rights as r (
      user_id, dates_libres, buy_for_others, see_all, caisse_ops, can_edit, caisse_active, updated_at
    )
    values (
      rec.user_id,
      coalesce(rec.dates_libres, false),
      coalesce(rec.buy_for_others, false),
      coalesce(rec.see_all, false),
      coalesce(rec.caisse_ops, false),
      coalesce(rec.can_edit, false),
      coalesce(rec.active, true),
      now()
    )
    on conflict (user_id) do update
    set
      dates_libres = r.dates_libres or excluded.dates_libres,
      buy_for_others = r.buy_for_others or excluded.buy_for_others,
      see_all = r.see_all or excluded.see_all,
      caisse_ops = r.caisse_ops or excluded.caisse_ops,
      can_edit = r.can_edit or excluded.can_edit,
      caisse_active = coalesce(r.caisse_active, true) and coalesce(excluded.caisse_active, true),
      updated_at = now();

    v_user_name := trim(rec.user_name);
    v_buyer_name := trim(rec.buyer_name);
    if v_user_name <> '' and v_buyer_name <> '' and lower(v_user_name) <> lower(v_buyer_name) then
      update public.caisse_operations
      set buyer_name = v_user_name
      where buyer_name = v_buyer_name;

      select amount into v_open_amt
      from public.caisse_journal_openings
      where buyer_name = v_buyer_name;
      if found then
        insert into public.caisse_journal_openings (buyer_name, amount)
        values (v_user_name, v_open_amt)
        on conflict (buyer_name) do update
        set amount = excluded.amount;
        delete from public.caisse_journal_openings where buyer_name = v_buyer_name;
      end if;

      update public.caisse_journal_buyers
      set name = v_user_name
      where id = rec.buyer_id
        and not exists (
          select 1
          from public.caisse_journal_buyers x
          where x.id <> rec.buyer_id
            and lower(trim(x.name)) = lower(v_user_name)
        );
    end if;
  end loop;
end;
$$;

commit;
