-- Caisse buyers: active flag for ERP users + rename cascade helpers.

alter table public.caisse_rights
  add column if not exists caisse_active boolean not null default true;

comment on column public.caisse_rights.caisse_active is
  'Si false, l’utilisateur n’apparaît plus dans les listes acheteurs caisse (sans désactiver le compte ERP).';

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
    left join public.caisse_rights r on r.user_id = u.id
    where u.status = 'ACTIVE'
      and char_length(trim(u.full_name)) > 0
      and coalesce(r.caisse_active, true)
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
        case when adm.is_admin then true else coalesce(r.can_edit, ger.is_gerant) end as "canEdit",
        case when adm.is_admin then true else coalesce(r.caisse_active, true) end as "active"
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

create or replace function public.caisse_rename_buyer(p_old text, p_new text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old text := trim(coalesce(p_old, ''));
  v_new text := trim(coalesce(p_new, ''));
begin
  if not exists (select 1 from public.caisse_flags() f where f.is_admin) then
    raise exception 'Réservé à l’administrateur' using errcode = 'P0001';
  end if;
  if char_length(v_old) < 1 or char_length(v_new) < 1 then
    raise exception 'Nom invalide' using errcode = 'P0001';
  end if;
  if v_old = v_new then
    return;
  end if;
  if exists (
    select 1 from public.sys_users u where lower(trim(u.full_name)) = lower(v_new)
  ) or exists (
    select 1 from public.caisse_journal_buyers b where lower(trim(b.name)) = lower(v_new)
  ) then
    raise exception 'Ce nom existe déjà' using errcode = 'P0001';
  end if;

  update public.caisse_operations set buyer_name = v_new where buyer_name = v_old;
  update public.caisse_journal_openings set buyer_name = v_new where buyer_name = v_old;
end;
$$;

revoke all on function public.caisse_rename_buyer(text, text) from public;
grant execute on function public.caisse_rename_buyer(text, text) to authenticated;
