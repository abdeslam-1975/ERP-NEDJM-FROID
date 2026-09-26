"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { PERM_FIELDS, permissionPatch, type PermField } from "@/lib/auth/rbac-fields";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type RoleRow = {
  id: string;
  code: string;
  label_fr: string;
  label_ar: string | null;
  hierarchy_level: number;
  is_system: boolean;
  require_mfa: boolean;
  site_scoped_allowed: boolean;
  is_active: boolean;
  users: number;
};

export type ScreenRow = { id: string; code: string; path: string; module: string; label_fr: string; sort_order: number };

export type PermissionRow = { role_id: string; screen_id: string } & Record<PermField, boolean>;

export type AuditRow = {
  id: string;
  occurred_at: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  table_name: string;
  target_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
};

export type PeriodLockRow = {
  id: string;
  year: number;
  month: number;
  locked_at: string;
  locked_by_name: string | null;
  unlocked_at: string | null;
  unlocked_by_name: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireSuperAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session expirée." };
  if (!ws.isSuperAdmin) return { ok: false, error: "Réservé au SUPER_ADMIN." };
  return { ok: true, userId: ws.id };
}

const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export async function listRolesAdmin(): Promise<ActionResult<RoleRow[]>> {
  const supabase = await createClient();
  const [roles, links] = await Promise.all([
    supabase
      .from("sys_roles")
      .select("id, code, label_fr, label_ar, hierarchy_level, is_system, require_mfa, site_scoped_allowed, is_active")
      .order("hierarchy_level", { ascending: false }),
    supabase.from("sys_user_site_roles").select("user_id, role_id"),
  ]);
  if (roles.error) return { ok: false, error: roles.error.message };
  const counts = new Map<string, Set<string>>();
  for (const l of links.data ?? []) {
    const set = counts.get(l.role_id) ?? new Set<string>();
    set.add(l.user_id);
    counts.set(l.role_id, set);
  }
  return {
    ok: true,
    data: (roles.data ?? []).map((r) => ({ ...r, users: counts.get(r.id)?.size ?? 0 })),
  };
}

export async function saveRole(input: {
  id?: string;
  code: string;
  label_fr: string;
  label_ar?: string | null;
  hierarchy_level: number;
  require_mfa: boolean;
  site_scoped_allowed: boolean;
  is_active: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{2,30}$/.test(code)) return { ok: false, error: "Code : 3 à 31 caractères A-Z, 0-9, _." };
  if (!input.label_fr.trim()) return { ok: false, error: "Libellé obligatoire." };
  const level = Math.round(Number(input.hierarchy_level));
  if (!(level >= 0 && level <= 99)) return { ok: false, error: "Niveau entre 0 et 99 (100 réservé au SUPER_ADMIN)." };
  const payload = {
    code,
    label_fr: input.label_fr.trim(),
    label_ar: input.label_ar?.trim() || null,
    hierarchy_level: level,
    require_mfa: input.require_mfa,
    site_scoped_allowed: input.site_scoped_allowed,
    is_active: input.is_active,
  };
  const supabase = await createClient();
  const q = input.id
    ? supabase.from("sys_roles").update(payload).eq("id", input.id)
    : supabase.from("sys_roles").insert(payload);
  const { data, error } = await q.select("id").maybeSingle();
  if (error) return { ok: false, error: error.code === "23505" ? "Ce code de rôle existe déjà." : error.message };
  if (!data) return { ok: false, error: "Enregistrement refusé." };
  revalidatePath("/administration/roles");
  revalidatePath("/administration/permissions");
  return { ok: true, data: { id: data.id } };
}

export async function loadPermissionMatrix(): Promise<
  ActionResult<{ roles: RoleRow[]; screens: ScreenRow[]; permissions: PermissionRow[] }>
> {
  const supabase = await createClient();
  const [roles, screens, perms] = await Promise.all([
    listRolesAdmin(),
    supabase.from("sys_screens").select("id, code, path, module, label_fr, sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("sys_permissions").select(`role_id, screen_id, ${PERM_FIELDS.join(", ")}`),
  ]);
  if (!roles.ok) return roles;
  if (screens.error) return { ok: false, error: screens.error.message };
  if (perms.error) return { ok: false, error: perms.error.message };
  return {
    ok: true,
    data: {
      roles: roles.data,
      screens: screens.data ?? [],
      permissions: (perms.data ?? []) as unknown as PermissionRow[],
    },
  };
}

export async function setPermission(input: {
  role_id: string;
  screen_id: string;
  field: PermField;
  value: boolean;
}): Promise<ActionResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  if (!UUID_RE.test(input.role_id) || !UUID_RE.test(input.screen_id)) return { ok: false, error: "Paramètres invalides." };
  if (!PERM_FIELDS.includes(input.field)) return { ok: false, error: "Droit inconnu." };
  const supabase = await createClient();
  const { data: role } = await supabase.from("sys_roles").select("code").eq("id", input.role_id).maybeSingle();
  if (role?.code === "SUPER_ADMIN") return { ok: false, error: "SUPER_ADMIN a tous les droits (non modifiable)." };
  const patch = permissionPatch(input.field, input.value);
  const { error } = await supabase
    .from("sys_permissions")
    .upsert({ role_id: input.role_id, screen_id: input.screen_id, ...patch }, { onConflict: "role_id,screen_id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/administration/permissions");
  return { ok: true, data: undefined };
}

export async function listAuditLogs(input: {
  table?: string;
  action?: string;
  target?: string;
  from?: string;
  to?: string;
  page?: number;
}): Promise<ActionResult<{ rows: AuditRow[]; hasMore: boolean }>> {
  const pageSize = 50;
  const page = Math.max(0, Math.floor(input.page ?? 0));
  const supabase = await createClient();
  let q = supabase
    .from("sys_audit_logs")
    .select("id, occurred_at, user_id, action, table_name, target_id, old_values, new_values")
    .order("occurred_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize);
  if (input.table && /^[a-z0-9_]+$/.test(input.table)) q = q.eq("table_name", input.table);
  if (input.action && /^[A-Z]+$/.test(input.action)) q = q.eq("action", input.action);
  if (input.target?.trim()) q = q.eq("target_id", input.target.trim());
  if (input.from && /^\d{4}-\d{2}-\d{2}$/.test(input.from)) q = q.gte("occurred_at", input.from);
  if (input.to && /^\d{4}-\d{2}-\d{2}$/.test(input.to)) q = q.lt("occurred_at", `${input.to}T23:59:59.999Z`);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  const rows = data ?? [];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data: users } = await supabase.from("sys_users").select("id, full_name").in("id", userIds);
    for (const u of users ?? []) names.set(u.id, u.full_name);
  }
  return {
    ok: true,
    data: {
      hasMore: rows.length > pageSize,
      rows: rows.slice(0, pageSize).map((r) => ({
        ...r,
        user_name: r.user_id ? names.get(r.user_id) ?? null : null,
        old_values: (r.old_values as Record<string, unknown> | null) ?? null,
        new_values: (r.new_values as Record<string, unknown> | null) ?? null,
      })),
    },
  };
}

export async function listAuditTables(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sys_audit_logs")
    .select("table_name")
    .order("occurred_at", { ascending: false })
    .limit(2000);
  return [...new Set((data ?? []).map((r) => r.table_name))].sort();
}

export async function listPeriodLocks(year: number): Promise<ActionResult<PeriodLockRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sys_period_locks")
    .select(
      "id, year, month, locked_at, unlocked_at, locker:sys_users!locked_by ( full_name ), unlocker:sys_users!unlocked_by ( full_name )",
    )
    .eq("year", year)
    .order("month");
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id,
      year: r.year,
      month: r.month,
      locked_at: r.locked_at,
      unlocked_at: r.unlocked_at,
      locked_by_name: one(r.locker)?.full_name ?? null,
      unlocked_by_name: one(r.unlocker)?.full_name ?? null,
    })),
  };
}

export async function listPayrollMonthStatus(
  year: number,
): Promise<Record<number, { runs: number; draft: number; validated: number; locked: number }>> {
  const supabase = await createClient();
  const { data } = await supabase.from("hr_payroll_runs").select("period_month, status_code").eq("period_year", year);
  const out: Record<number, { runs: number; draft: number; validated: number; locked: number }> = {};
  for (const r of data ?? []) {
    const m = (out[r.period_month] ??= { runs: 0, draft: 0, validated: 0, locked: 0 });
    m.runs += 1;
    if (r.status_code === "LOCKED") m.locked += 1;
    else if (r.status_code === "VALIDATED") m.validated += 1;
    else m.draft += 1;
  }
  return out;
}

export async function setPeriodLock(input: { year: number; month: number; locked: boolean }): Promise<ActionResult> {
  const ws = await getWorkspaceProfile();
  if (!ws) return { ok: false, error: "Session expirée." };
  if (!Number.isInteger(input.year) || !Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
    return { ok: false, error: "Période invalide." };
  }
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("sys_period_locks")
    .select("id")
    .eq("year", input.year)
    .eq("month", input.month)
    .maybeSingle();
  const now = new Date().toISOString();
  const res = existing
    ? await supabase
        .from("sys_period_locks")
        .update(
          input.locked
            ? { locked_at: now, locked_by: ws.id, unlocked_at: null, unlocked_by: null }
            : { unlocked_at: now, unlocked_by: ws.id },
        )
        .eq("id", existing.id)
        .select("id")
    : input.locked
      ? await supabase
          .from("sys_period_locks")
          .insert({ year: input.year, month: input.month, locked_by: ws.id })
          .select("id")
      : { data: [{ id: "" }], error: null };
  if (res.error) return { ok: false, error: res.error.message };
  if (!res.data?.length) return { ok: false, error: "Droit « Clôture des périodes » requis." };
  revalidatePath("/administration/periodes");
  return { ok: true, data: undefined };
}
