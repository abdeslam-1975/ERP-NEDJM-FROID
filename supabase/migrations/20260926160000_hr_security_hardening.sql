-- HR security hardening:
--   1. hr-docs bucket private (ID cards, certificates) — served through /api/rh/fichier (signed URLs)
--   2. Payroll validation / closing roles enforced in the database, not only in the app
--   3. sys_audit_write cannot be forged by direct callers

begin;

-- ---------------------------------------------------------------------------
-- 1. Private HR documents
-- ---------------------------------------------------------------------------
update storage.buckets
set public = false,
    allowed_mime_types = array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'text/html'
    ]
where id = 'hr-docs';

drop policy if exists hr_docs_select on storage.objects;
create policy hr_docs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'hr-docs'
    and (
      public.erp_has_perm('hr_documents', 'read', null)
      or public.erp_has_perm('employees', 'update', null)
    )
  );

update public.hr_employee_files
set file_url = '/api/rh/fichier?p=' || storage_path
where storage_path is not null
  and file_url like '%/storage/v1/object/public/hr-docs/%';

update public.hr_correspondences
set payload = jsonb_set(payload, '{archive_url}', to_jsonb('/api/rh/fichier?p=' || (payload->>'archive_path')))
where payload ? 'archive_path'
  and coalesce(payload->>'archive_url', '') like '%/storage/v1/object/public/hr-docs/%';

-- ---------------------------------------------------------------------------
-- 2. Payroll transitions: roles checked by the run guard (covers RPC and direct updates)
-- ---------------------------------------------------------------------------
create or replace function public.erp_has_any_role(p_codes text[], p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sys_user_site_roles usr
    join public.sys_roles r on r.id = usr.role_id
    join public.sys_users u on u.id = usr.user_id
    where usr.user_id = p_uid
      and r.code = any (p_codes)
      and r.is_active
      and u.status = 'ACTIVE'
  );
$$;

grant execute on function public.erp_has_any_role(text[], uuid) to authenticated;

create or replace function public.hr_payroll_run_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.status_code <> 'DRAFT' then
      raise exception 'Paie % : suppression impossible (validée ou clôturée).', old.status_code
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if old.status_code = 'LOCKED' then
    raise exception 'Paie clôturée : aucune modification possible.'
      using errcode = 'check_violation';
  end if;

  if new.status_code is distinct from old.status_code
     and not (
       (old.status_code = 'DRAFT' and new.status_code = 'VALIDATED')
       or (old.status_code = 'VALIDATED' and new.status_code in ('DRAFT', 'LOCKED'))
     ) then
    raise exception 'Transition de paie refusée : % → %.', old.status_code, new.status_code
      using errcode = 'check_violation';
  end if;

  -- auth.uid() is null for service-role / maintenance sessions.
  if new.status_code is distinct from old.status_code and auth.uid() is not null then
    if new.status_code = 'LOCKED'
       and not public.erp_has_any_role(array['SUPER_ADMIN', 'GERANT']) then
      raise exception 'Clôture de paie réservée à SUPER_ADMIN et GERANT.'
        using errcode = 'insufficient_privilege';
    end if;
    if new.status_code in ('VALIDATED', 'DRAFT')
       and not public.erp_has_any_role(array['SUPER_ADMIN', 'ADMIN_RH', 'GERANT']) then
      raise exception 'Validation de paie réservée à SUPER_ADMIN, ADMIN_RH et GERANT.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if old.status_code = 'VALIDATED'
     and new.status_code = 'VALIDATED'
     and (new.period_year, new.period_month, new.site_id)
         is distinct from (old.period_year, old.period_month, old.site_id) then
    raise exception 'Paie validée : période et chantier figés.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Audit log: direct (non-trigger) calls from a user session are pinned to that user
--    and limited to self events on sys_users (login, password change).
-- ---------------------------------------------------------------------------
create or replace function public.sys_audit_write(
  p_user_id uuid,
  p_action public.audit_action,
  p_table_name text,
  p_target_id text,
  p_old jsonb,
  p_new jsonb,
  p_ip inet,
  p_user_agent text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_ts timestamptz := now();
  v_uid uuid := auth.uid();
begin
  if pg_trigger_depth() = 0 and v_uid is not null then
    if p_table_name is distinct from 'sys_users' or p_target_id is distinct from v_uid::text then
      raise exception 'Écriture d''audit refusée.' using errcode = 'insufficient_privilege';
    end if;
    p_user_id := v_uid;
  end if;

  insert into public.sys_audit_logs (
    user_id, action, table_name, target_id, old_values, new_values,
    ip_address, user_agent, request_id, occurred_at
  ) values (
    p_user_id, p_action, p_table_name, p_target_id, p_old, p_new,
    p_ip, p_user_agent, p_request_id, v_ts
  )
  returning id into v_id;
  return v_id;
end;
$$;

commit;
