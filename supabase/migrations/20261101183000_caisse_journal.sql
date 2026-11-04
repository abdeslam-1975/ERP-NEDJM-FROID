-- Journal de caisse (GESTION CAISSE) : opérations, soldes d'ouverture,
-- clôture journalière et droits, sur le même modèle que le cahier historique.

begin;

create sequence if not exists public.caisse_op_seq;

create table public.caisse_rights (
  user_id uuid primary key references public.sys_users(id) on delete cascade,
  dates_libres boolean not null default false,
  buy_for_others boolean not null default false,
  see_all boolean not null default false,
  caisse_ops boolean not null default false,
  can_edit boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.caisse_journal_buyers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  user_id uuid references public.sys_users(id) on delete set null,
  dates_libres boolean not null default false,
  buy_for_others boolean not null default false,
  see_all boolean not null default false,
  caisse_ops boolean not null default false,
  can_edit boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint caisse_journal_buyers_name_unique unique (name),
  constraint caisse_journal_buyers_name_len check (char_length(trim(name)) between 1 and 160)
);

create table public.caisse_journal_openings (
  buyer_name text primary key,
  amount numeric(18,2) not null check (amount > 0),
  updated_by uuid references public.sys_users(id),
  updated_at timestamptz not null default now()
);

create table public.caisse_operations (
  id uuid primary key default gen_random_uuid(),
  op_number integer not null unique default nextval('public.caisse_op_seq'),
  kind text not null check (kind in ('ACHAT', 'AVANCE', 'ALIMENTATION')),
  op_date date not null,
  affectation text not null,
  matricule text not null default '',
  buyer_name text not null,
  bon_label text not null default '',
  photo_data text,
  method text,
  reference text,
  voided_at timestamptz,
  voided_by uuid references public.sys_users(id),
  created_by uuid not null references public.sys_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  has_photo boolean generated always as (photo_data is not null) stored,
  constraint caisse_operations_buyer_len check (char_length(trim(buyer_name)) between 1 and 160),
  constraint caisse_operations_photo_size check (photo_data is null or char_length(photo_data) <= 1500000)
);

create table public.caisse_lines (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.caisse_operations(id) on delete cascade,
  line_no integer not null check (line_no >= 1),
  designation text not null,
  item_val text not null default '',
  unit text not null default 'U',
  qty numeric(18,4) not null check (qty > 0),
  unit_price numeric(18,2) not null check (unit_price >= 0),
  unique (operation_id, line_no)
);

create table public.caisse_journal_closures (
  op_date date primary key,
  status text not null check (status in ('OPEN', 'CLOSED')),
  system_solde numeric(18,2),
  physical_solde numeric(18,2),
  ecart numeric(18,2),
  note text,
  closed_by_name text,
  closed_at text,
  unlocked_by_name text,
  unlocked_at text,
  unlock_reason text
);

create table public.caisse_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_name text not null,
  action text not null,
  kind text not null default '',
  op_number text not null default '',
  sheet_name text not null default '',
  detail text not null default '',
  amount numeric(18,2)
);

create table public.caisse_lists (
  id uuid primary key default gen_random_uuid(),
  list_key text not null check (list_key in ('AFFECTATION', 'UNIT', 'MATRICULE')),
  label text not null,
  sort_order integer not null default 0,
  unique (list_key, label)
);

create index caisse_operations_date_idx on public.caisse_operations (op_date desc) where voided_at is null;
create index caisse_lines_operation_idx on public.caisse_lines (operation_id, line_no);
create index caisse_audit_at_idx on public.caisse_audit (at desc);

insert into public.caisse_lists (list_key, label, sort_order)
values
  ('AFFECTATION', 'PARC ROULANT', 1),
  ('AFFECTATION', 'BUREAU', 2),
  ('AFFECTATION', 'ATELIER', 3),
  ('AFFECTATION', 'CONTRAT CLIENT A', 4),
  ('AFFECTATION', 'MAGASIN', 5),
  ('UNIT', 'U', 1),
  ('UNIT', 'Kg', 2),
  ('UNIT', 'L', 3),
  ('UNIT', 'M', 4),
  ('UNIT', 'Lot', 5),
  ('MATRICULE', '16-123-45', 1),
  ('MATRICULE', '16-678-90', 2),
  ('MATRICULE', '31-001-22', 3)
on conflict (list_key, label) do nothing;

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
    case when adm.is_admin then true else coalesce(r.dates_libres, ger.is_gerant) end,
    case when adm.is_admin then true else coalesce(r.buy_for_others, false) end,
    case when adm.is_admin then true else coalesce(r.see_all, ger.is_gerant) end,
    case when adm.is_admin then true else coalesce(r.caisse_ops, ger.is_gerant) end,
    case when adm.is_admin then true else coalesce(r.can_edit, ger.is_gerant) end,
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
  where u.id = auth.uid()
    and u.status = 'ACTIVE';
$$;

create or replace function public.caisse_op_visible(p_kind text, p_buyer text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.caisse_flags() f
    where public.fin_can_access('read', null)
      and (
        (
          p_kind = 'ACHAT'
          and (f.see_all or f.is_admin or p_buyer = f.actor_name or coalesce(p_buyer, '') = '')
        )
        or (p_kind <> 'ACHAT' and (f.caisse_ops or f.is_admin))
      )
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
    when not public.fin_can_access('read', null) then null
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
  if auth.uid() is null or not public.fin_can_access('read', null) then
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
  if not found or not public.fin_can_access('read', null) then
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

create or replace function public.caisse_name_directory()
returns table (name text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.caisse_flags() f
    where f.is_admin or f.buy_for_others or f.see_all or f.caisse_ops
  ) then
    return;
  end if;
  return query
    select u.full_name
    from public.sys_users u
    where u.status = 'ACTIVE' and char_length(trim(u.full_name)) > 0
    union
    select b.name from public.caisse_journal_buyers b where b.active;
end;
$$;

create or replace function public.caisse_admin_users()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.caisse_flags() f where f.is_admin) then
    return '[]'::jsonb;
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.name), '[]'::jsonb)
    from (
      select
        u.id as "userId",
        u.full_name as name,
        coalesce(u.email, '') as email,
        adm.is_admin as "isAdmin",
        case when adm.is_admin then true else coalesce(r.dates_libres, ger.is_gerant) end as "datesLibres",
        case when adm.is_admin then true else coalesce(r.buy_for_others, false) end as "buyForOthers",
        case when adm.is_admin then true else coalesce(r.see_all, ger.is_gerant) end as "seeAll",
        case when adm.is_admin then true else coalesce(r.caisse_ops, ger.is_gerant) end as "caisseOps",
        case when adm.is_admin then true else coalesce(r.can_edit, ger.is_gerant) end as "canEdit"
      from public.sys_users u
      left join public.caisse_rights r on r.user_id = u.id
      cross join lateral (
        select exists (
          select 1 from public.sys_user_site_roles ur
          join public.sys_roles ro on ro.id = ur.role_id
          where ur.user_id = u.id and ro.code in ('SUPER_ADMIN', 'ADMIN_FINANCE')
        ) as is_admin
      ) adm
      cross join lateral (
        select exists (
          select 1 from public.sys_user_site_roles ur
          join public.sys_roles ro on ro.id = ur.role_id
          where ur.user_id = u.id and ro.code = 'GERANT'
        ) as is_gerant
      ) ger
      where u.status = 'ACTIVE'
    ) t
  );
end;
$$;

create or replace function public.caisse_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id
  from public.sys_users u
  where lower(u.email) = lower(trim(coalesce(p_email, '')))
    and exists (select 1 from public.caisse_flags() f where f.is_admin)
  limit 1;
$$;

create or replace function public.caisse_can_insert_lines(p_operation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.caisse_operations o
    cross join public.caisse_flags() f
    where o.id = p_operation_id
      and (f.is_admin or f.can_edit or o.created_by = auth.uid())
  );
$$;

create or replace function public.caisse_can_edit_lines()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select f.is_admin or f.can_edit from public.caisse_flags() f limit 1), false);
$$;

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

drop trigger if exists trg_caisse_operations_guard on public.caisse_operations;
create trigger trg_caisse_operations_guard
  before insert or update on public.caisse_operations
  for each row execute function public.caisse_guard_operation();

create or replace function public.caisse_guard_closure()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  f record;
begin
  select * into f from public.caisse_flags() limit 1;
  if not found then
    raise exception 'Session requise' using errcode = 'P0001';
  end if;
  if new.status = 'CLOSED' and not (f.is_admin or f.caisse_ops) then
    raise exception 'Accès caisse requis' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.status = 'CLOSED' and new.status = 'OPEN' and not f.is_admin then
    raise exception 'Seul l’administrateur peut rouvrir une journée' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_caisse_journal_closures_guard on public.caisse_journal_closures;
create trigger trg_caisse_journal_closures_guard
  before insert or update on public.caisse_journal_closures
  for each row execute function public.caisse_guard_closure();

drop trigger if exists trg_caisse_operations_updated on public.caisse_operations;
create trigger trg_caisse_operations_updated
  before update on public.caisse_operations
  for each row execute function public.erp_set_updated_at();

alter table public.caisse_rights enable row level security;
alter table public.caisse_journal_buyers enable row level security;
alter table public.caisse_journal_openings enable row level security;
alter table public.caisse_operations enable row level security;
alter table public.caisse_lines enable row level security;
alter table public.caisse_journal_closures enable row level security;
alter table public.caisse_audit enable row level security;
alter table public.caisse_lists enable row level security;

create policy caisse_rights_read on public.caisse_rights for select to authenticated
  using (user_id = auth.uid() or (select f.is_admin from public.caisse_flags() f));
create policy caisse_rights_write on public.caisse_rights for all to authenticated
  using ((select f.is_admin from public.caisse_flags() f))
  with check ((select f.is_admin from public.caisse_flags() f));

create policy caisse_journal_buyers_read on public.caisse_journal_buyers for select to authenticated
  using (public.fin_can_access('read', null));
create policy caisse_journal_buyers_write on public.caisse_journal_buyers for all to authenticated
  using ((select f.is_admin from public.caisse_flags() f))
  with check ((select f.is_admin from public.caisse_flags() f));

create policy caisse_journal_openings_read on public.caisse_journal_openings for select to authenticated
  using (
    public.fin_can_access('read', null)
    and (
      (select f.is_admin or f.see_all from public.caisse_flags() f)
      or buyer_name = (select f.actor_name from public.caisse_flags() f)
    )
  );
create policy caisse_journal_openings_write on public.caisse_journal_openings for all to authenticated
  using ((select f.is_admin from public.caisse_flags() f))
  with check ((select f.is_admin from public.caisse_flags() f));

create policy caisse_operations_read on public.caisse_operations for select to authenticated
  using (voided_at is null and public.caisse_op_visible(kind, buyer_name));
create policy caisse_operations_insert on public.caisse_operations for insert to authenticated
  with check (public.fin_can_access('read', null));
create policy caisse_operations_update on public.caisse_operations for update to authenticated
  using ((select f.is_admin or f.can_edit from public.caisse_flags() f) and voided_at is null)
  with check ((select f.is_admin or f.can_edit from public.caisse_flags() f));

create policy caisse_lines_read on public.caisse_lines for select to authenticated
  using (
    exists (
      select 1 from public.caisse_operations o
      where o.id = operation_id
        and o.voided_at is null
        and public.caisse_op_visible(o.kind, o.buyer_name)
    )
  );
create policy caisse_lines_insert on public.caisse_lines for insert to authenticated
  with check (public.caisse_can_insert_lines(operation_id));
create policy caisse_lines_update on public.caisse_lines for update to authenticated
  using (public.caisse_can_edit_lines())
  with check (public.caisse_can_edit_lines());
create policy caisse_lines_delete on public.caisse_lines for delete to authenticated
  using (public.caisse_can_edit_lines());

create policy caisse_journal_closures_read on public.caisse_journal_closures for select to authenticated
  using ((select f.is_admin or f.caisse_ops from public.caisse_flags() f));
create policy caisse_journal_closures_write on public.caisse_journal_closures for all to authenticated
  using ((select f.is_admin or f.caisse_ops from public.caisse_flags() f))
  with check ((select f.is_admin or f.caisse_ops from public.caisse_flags() f));

create policy caisse_audit_read on public.caisse_audit for select to authenticated
  using ((select f.is_admin from public.caisse_flags() f));

create policy caisse_lists_read on public.caisse_lists for select to authenticated
  using (public.fin_can_access('read', null));

grant select, insert, update, delete on public.caisse_rights to authenticated;
grant select, insert, update, delete on public.caisse_journal_buyers to authenticated;
grant select, insert, update, delete on public.caisse_journal_openings to authenticated;
grant select, insert, update on public.caisse_operations to authenticated;
grant select, insert, update, delete on public.caisse_lines to authenticated;
grant select, insert, update, delete on public.caisse_journal_closures to authenticated;
grant select on public.caisse_audit to authenticated;
grant select on public.caisse_lists to authenticated;
grant usage, select on sequence public.caisse_op_seq to authenticated;

grant execute on function public.caisse_flags() to authenticated;
grant execute on function public.caisse_op_visible(text, text) to authenticated;
grant execute on function public.caisse_system_solde() to authenticated;
grant execute on function public.caisse_my_context() to authenticated;
grant execute on function public.caisse_log(text, text, text, text, text, numeric) to authenticated;
grant execute on function public.caisse_can_insert_lines(uuid) to authenticated;
grant execute on function public.caisse_can_edit_lines() to authenticated;
grant execute on function public.caisse_name_directory() to authenticated;
grant execute on function public.caisse_admin_users() to authenticated;
grant execute on function public.caisse_user_id_by_email(text) to authenticated;

commit;
