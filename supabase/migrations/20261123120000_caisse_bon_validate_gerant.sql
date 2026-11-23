-- Expose GERANT in caisse context so gérant can validate bons (Conforme).

begin;

create or replace function public.caisse_my_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  f record;
  v_is_gerant boolean := false;
begin
  if auth.uid() is null or not public.caisse_can_access() then
    return null;
  end if;
  select * into f from public.caisse_flags() limit 1;
  if not found then
    return null;
  end if;
  select exists (
    select 1
    from public.sys_user_site_roles ur
    join public.sys_roles ro on ro.id = ur.role_id
    where ur.user_id = auth.uid()
      and ro.code = 'GERANT'
  ) into v_is_gerant;
  return jsonb_build_object(
    'isAdmin', f.is_admin,
    'isGerant', coalesce(v_is_gerant, false),
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

commit;
