-- =============================================================================
-- Forced password change (Option B): harden self-service RPCs + audit
-- Prerequisites: sys_touch_login / sys_clear_must_reset_password (P1 RLS)
-- =============================================================================

begin;

-- Touch last_login_at only (never clears must_reset_password)
create or replace function public.sys_touch_login()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.sys_users
  set
    last_login_at = now(),
    updated_at = now()
  where id = auth.uid();
end;
$$;

-- Clear must_reset_password for the caller only, after Auth password change
create or replace function public.sys_clear_must_reset_password()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_had_flag boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select must_reset_password
    into v_had_flag
  from public.sys_users
  where id = v_uid
  for update;

  if not found then
    raise exception 'ERP profile not found';
  end if;

  if not v_had_flag then
    return;
  end if;

  update public.sys_users
  set
    must_reset_password = false,
    updated_at = now()
  where id = v_uid;

  perform public.sys_audit_write(
    v_uid,
    'UPDATE',
    'sys_users',
    v_uid::text,
    jsonb_build_object('must_reset_password', true),
    jsonb_build_object(
      'must_reset_password', false,
      'self_password_change', true
    ),
    null,
    null,
    null
  );
end;
$$;

grant execute on function public.sys_touch_login() to authenticated;
grant execute on function public.sys_clear_must_reset_password() to authenticated;

commit;
