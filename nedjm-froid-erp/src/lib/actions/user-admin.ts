"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { workspaceHasRole } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  assignUserRoleSchema,
  deleteUserSchema,
  provisionUserSchema,
  removeUserRoleSchema,
  resetPasswordSchema,
  setUserStatusSchema,
  updateUserProfileSchema,
} from "@/lib/validations/user-admin";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function requireUserAdmin() {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { error: "Session requise." as const, workspace: null };
  if (!workspaceHasRole(workspace, ["SUPER_ADMIN", "ADMIN_RH"])) {
    return {
      error: "Accès refusé. Réservé à SUPER_ADMIN et ADMIN_RH." as const,
      workspace: null,
    };
  }
  return { error: null, workspace };
}

type AdminWorkspace = NonNullable<Awaited<ReturnType<typeof getWorkspaceProfile>>>;
type ServiceClient = ReturnType<typeof createServiceClient>;

// Same rule as provisionUser: below SUPER_ADMIN, nobody manages an account of level ≥ 80,
// and a site-scoped ADMIN_RH only manages accounts attached to its own sites.
async function targetManageError(
  service: ServiceClient,
  workspace: AdminWorkspace,
  targetId: string,
): Promise<string | null> {
  if (workspace.isSuperAdmin) return null;
  const { data, error } = await service
    .from("sys_user_site_roles")
    .select("site_id, role:sys_roles ( code, hierarchy_level )")
    .eq("user_id", targetId);
  if (error) return error.message;
  const rows = (data ?? []).map((row) => {
    const role = Array.isArray(row.role) ? row.role[0] : row.role;
    return {
      siteId: (row.site_id as string | null) ?? null,
      code: (role?.code as string | undefined) ?? "",
      level: (role?.hierarchy_level as number | undefined) ?? 0,
    };
  });
  if (rows.some((r) => r.code === "SUPER_ADMIN" || r.level >= 80)) {
    return "Seul un SUPER_ADMIN peut gérer un compte de niveau ≥ 80.";
  }
  const adminRh = workspace.roles.filter((r) => r.roleCode === "ADMIN_RH");
  if (adminRh.length > 0 && adminRh.every((r) => r.siteId !== null)) {
    const sites = new Set(adminRh.map((r) => r.siteId));
    if (rows.length === 0 || rows.some((r) => r.siteId === null || !sites.has(r.siteId))) {
      return "Ce compte n'est pas rattaché à vos chantiers.";
    }
  }
  return null;
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function roleAssignError(
  supabase: ServerClient,
  workspace: AdminWorkspace,
  roleId: string,
  siteId: string | null,
): Promise<string | null> {
  const { data: role, error } = await supabase
    .from("sys_roles")
    .select("id, code, hierarchy_level, site_scoped_allowed, sites_only, is_active")
    .eq("id", roleId)
    .maybeSingle();
  if (error || !role || !role.is_active) return "Rôle introuvable.";
  if (role.sites_only && siteId === null) {
    return `Le rôle ${role.code} est limité à ses chantiers : choisissez un chantier.`;
  }

  if (role.code === "SUPER_ADMIN" && !workspace.isSuperAdmin) {
    return "Seul un SUPER_ADMIN peut créer un SUPER_ADMIN.";
  }
  if (role.hierarchy_level >= 80 && !workspace.isSuperAdmin) {
    return "Seul SUPER_ADMIN peut attribuer un rôle de niveau ≥ 80.";
  }
  if (role.code === "SUPER_ADMIN" && siteId !== null) {
    return "SUPER_ADMIN doit être global (sans site).";
  }
  if (!role.site_scoped_allowed && siteId !== null) {
    return `Le rôle ${role.code} ne peut pas être lié à un site.`;
  }

  const adminRh = workspace.roles.filter((r) => r.roleCode === "ADMIN_RH");
  if (!workspace.isSuperAdmin && adminRh.length > 0 && adminRh.every((r) => r.siteId !== null)) {
    if (siteId === null || !adminRh.some((r) => r.siteId === siteId)) {
      return "Vous ne pouvez attribuer un rôle que sur vos chantiers.";
    }
  }
  return null;
}

function friendlyAssignError(message: string): string {
  if (/duplicate key|unique/i.test(message)) {
    return "Ce compte a déjà ce rôle sur ce périmètre.";
  }
  return message;
}

function getService(): { service: ServiceClient } | { error: string } {
  try {
    return { service: createServiceClient() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Service role indisponible" };
  }
}

async function audit(
  service: ServiceClient,
  actorId: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  table: string,
  targetId: string,
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
) {
  await service.rpc("sys_audit_write", {
    p_user_id: actorId,
    p_action: action,
    p_table_name: table,
    p_target_id: targetId,
    p_old: oldValue,
    p_new: newValue,
    p_ip: null,
    p_user_agent: null,
    p_request_id: null,
  });
}

export type AdminUserAssignment = {
  id: string;
  role_id: string;
  role_code: string;
  role_label: string;
  site_id: string | null;
  site_name: string | null;
};

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  status: string;
  must_reset_password: boolean;
  last_login_at: string | null;
  assignments: AdminUserAssignment[];
};

export async function listAdminUsers(): Promise<ActionResult<AdminUserRow[]>> {
  const gate = await requireUserAdmin();
  if (gate.error || !gate.workspace) return { ok: false, error: gate.error! };

  const supabase = await createClient();

  // Two queries: sys_users ↔ sys_user_site_roles has two FKs (user_id + created_by),
  // so a nested embed from sys_users is ambiguous in PostgREST.
  const { data, error } = await supabase
    .from("sys_users")
    .select("id, email, full_name, phone, status, must_reset_password, last_login_at")
    .order("full_name");

  if (error) return { ok: false, error: error.message };

  const { data: assignmentRows, error: assignError } = await supabase
    .from("sys_user_site_roles")
    .select(
      `
      id,
      user_id,
      role_id,
      site_id,
      role:sys_roles ( code, label_fr, hierarchy_level ),
      site:ref_sites ( name_fr )
    `,
    );

  if (assignError) return { ok: false, error: assignError.message };

  type RoleJoin = { code: string; label_fr: string; hierarchy_level: number };
  type SiteJoin = { name_fr: string };
  const one = <T>(value: T | T[] | null | undefined): T | null => {
    if (value == null) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
  };

  const assignmentsByUser = new Map<string, (AdminUserAssignment & { level: number })[]>();
  for (const row of assignmentRows ?? []) {
    const role = one(row.role as RoleJoin | RoleJoin[] | null);
    const site = one(row.site as SiteJoin | SiteJoin[] | null);
    const list = assignmentsByUser.get(row.user_id as string) ?? [];
    list.push({
      id: row.id as string,
      role_id: row.role_id as string,
      role_code: role?.code ?? "?",
      role_label: role?.label_fr ?? "?",
      site_id: (row.site_id as string | null) ?? null,
      site_name: site?.name_fr ?? null,
      level: role?.hierarchy_level ?? 0,
    });
    assignmentsByUser.set(row.user_id as string, list);
  }

  const rows: AdminUserRow[] = (data ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    phone: (u.phone as string | null) ?? null,
    status: u.status,
    must_reset_password: u.must_reset_password,
    last_login_at: u.last_login_at,
    assignments: (assignmentsByUser.get(u.id) ?? [])
      .sort((a, b) => b.level - a.level)
      .map((a) => ({
        id: a.id,
        role_id: a.role_id,
        role_code: a.role_code,
        role_label: a.role_label,
        site_id: a.site_id,
        site_name: a.site_name,
      })),
  }));

  return { ok: true, data: rows };
}

export async function listRolesAndSites(): Promise<
  ActionResult<{
    roles: {
      id: string;
      code: string;
      label_fr: string;
      hierarchy_level: number;
    }[];
    sites: { id: string; code: string; name_fr: string }[];
  }>
> {
  const gate = await requireUserAdmin();
  if (gate.error || !gate.workspace) return { ok: false, error: gate.error! };

  const supabase = await createClient();
  const [rolesRes, sitesRes] = await Promise.all([
    supabase
      .from("sys_roles")
      .select("id, code, label_fr, hierarchy_level")
      .eq("is_active", true)
      .order("hierarchy_level", { ascending: false }),
    supabase
      .from("ref_sites")
      .select("id, code, name_fr")
      .eq("is_active", true)
      .order("code"),
  ]);

  if (rolesRes.error) return { ok: false, error: rolesRes.error.message };
  if (sitesRes.error) return { ok: false, error: sitesRes.error.message };

  return {
    ok: true,
    data: { roles: rolesRes.data ?? [], sites: sitesRes.data ?? [] },
  };
}

export async function provisionUser(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireUserAdmin();
  if (gate.error || !gate.workspace) return { ok: false, error: gate.error! };

  const parsed = provisionUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Données invalides",
      fieldErrors: Object.fromEntries(
        Object.entries(parsed.error.flatten().fieldErrors).filter(
          (e): e is [string, string[]] => Array.isArray(e[1]),
        ),
      ),
    };
  }

  const payload = parsed.data;
  const supabase = await createClient();

  const roleError = await roleAssignError(
    supabase,
    gate.workspace,
    payload.role_id,
    payload.site_id,
  );
  if (roleError) return { ok: false, error: roleError };

  const svc = getService();
  if ("error" in svc) return { ok: false, error: svc.error };
  const { service } = svc;

  const { data: created, error: createErr } =
    await service.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: { full_name: payload.full_name },
    });

  if (createErr || !created.user) {
    return {
      ok: false,
      error: createErr?.message ?? "Échec création auth.users",
    };
  }

  const userId = created.user.id;

  const { error: profileErr } = await service.from("sys_users").upsert(
    {
      id: userId,
      email: payload.email,
      full_name: payload.full_name,
      status: "ACTIVE",
      locale: "fr",
      must_reset_password: true,
    },
    { onConflict: "id" },
  );

  if (profileErr) {
    await service.auth.admin.deleteUser(userId);
    return { ok: false, error: `sys_users: ${profileErr.message}` };
  }

  // Use the admin session (not service role) so erp_guard_role_assignment
  // sees auth.uid() and allows level ≥ 80 only for SUPER_ADMIN callers.
  const { error: assignErr } = await supabase.from("sys_user_site_roles").insert({
    user_id: userId,
    role_id: payload.role_id,
    site_id: payload.site_id,
    created_by: gate.workspace.id,
  });

  if (assignErr) {
    await service.from("sys_users").delete().eq("id", userId);
    await service.auth.admin.deleteUser(userId);
    return { ok: false, error: `Affectation rôle: ${assignErr.message}` };
  }

  await audit(service, gate.workspace.id, "CREATE", "sys_users", userId, null, {
    email: payload.email,
    full_name: payload.full_name,
    role_id: payload.role_id,
    site_id: payload.site_id,
    provisioned_by: gate.workspace.email,
  });

  revalidatePath("/parametres/utilisateurs");
  return { ok: true, data: { id: userId } };
}

export async function adminResetPassword(
  input: unknown,
): Promise<ActionResult<{ temporaryPasswordHint: string }>> {
  const gate = await requireUserAdmin();
  if (gate.error || !gate.workspace) return { ok: false, error: gate.error! };

  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Service role indisponible",
    };
  }

  const denied = await targetManageError(service, gate.workspace, parsed.data.user_id);
  if (denied) return { ok: false, error: denied };

  const { error } = await service.auth.admin.updateUserById(
    parsed.data.user_id,
    { password: parsed.data.password },
  );

  if (error) return { ok: false, error: error.message };

  const { error: flagErr } = await service
    .from("sys_users")
    .update({ must_reset_password: true, status: "ACTIVE" })
    .eq("id", parsed.data.user_id);

  if (flagErr) return { ok: false, error: flagErr.message };

  await service.rpc("sys_audit_write", {
    p_user_id: gate.workspace.id,
    p_action: "UPDATE",
    p_table_name: "sys_users",
    p_target_id: parsed.data.user_id,
    p_old: null,
    p_new: { must_reset_password: true, password_reset_by_admin: true },
    p_ip: null,
    p_user_agent: null,
    p_request_id: null,
  });

  revalidatePath("/parametres/utilisateurs");
  return {
    ok: true,
    data: { temporaryPasswordHint: "Mot de passe temporaire appliqué." },
  };
}

export async function setUserLifecycleStatus(
  input: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  const gate = await requireUserAdmin();
  if (gate.error || !gate.workspace) return { ok: false, error: gate.error! };

  const parsed = setUserStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  if (
    parsed.data.user_id === gate.workspace.id &&
    parsed.data.status !== "ACTIVE"
  ) {
    return {
      ok: false,
      error: "Vous ne pouvez pas désactiver votre propre compte.",
    };
  }

  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Service role indisponible",
    };
  }

  const denied = await targetManageError(service, gate.workspace, parsed.data.user_id);
  if (denied) return { ok: false, error: denied };

  const { data, error } = await service
    .from("sys_users")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.user_id)
    .select("id, status")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Utilisateur introuvable." };

  await service.rpc("sys_audit_write", {
    p_user_id: gate.workspace.id,
    p_action: "UPDATE",
    p_table_name: "sys_users",
    p_target_id: data.id,
    p_old: null,
    p_new: { status: data.status },
    p_ip: null,
    p_user_agent: null,
    p_request_id: null,
  });

  revalidatePath("/parametres/utilisateurs");
  return { ok: true, data: { id: data.id, status: data.status } };
}

export async function updateUserProfile(
  input: unknown,
): Promise<ActionResult<{ id: string; full_name: string; phone: string | null }>> {
  const gate = await requireUserAdmin();
  if (gate.error || !gate.workspace) return { ok: false, error: gate.error! };

  const parsed = updateUserProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  const svc = getService();
  if ("error" in svc) return { ok: false, error: svc.error };
  const { service } = svc;

  const denied = await targetManageError(service, gate.workspace, parsed.data.user_id);
  if (denied) return { ok: false, error: denied };

  const { data, error } = await service
    .from("sys_users")
    .update({ full_name: parsed.data.full_name, phone: parsed.data.phone })
    .eq("id", parsed.data.user_id)
    .select("id, full_name, phone")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Utilisateur introuvable." };

  await service.auth.admin.updateUserById(data.id, {
    user_metadata: { full_name: data.full_name },
  });
  await audit(service, gate.workspace.id, "UPDATE", "sys_users", data.id, null, {
    full_name: data.full_name,
    phone: data.phone,
  });

  revalidatePath("/parametres/utilisateurs");
  return {
    ok: true,
    data: { id: data.id, full_name: data.full_name, phone: (data.phone as string | null) ?? null },
  };
}

export async function assignUserRole(
  input: unknown,
): Promise<ActionResult<AdminUserAssignment>> {
  const gate = await requireUserAdmin();
  if (gate.error || !gate.workspace) return { ok: false, error: gate.error! };

  const parsed = assignUserRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const { user_id, role_id, site_id } = parsed.data;

  const svc = getService();
  if ("error" in svc) return { ok: false, error: svc.error };
  const { service } = svc;

  const denied = await targetManageError(service, gate.workspace, user_id);
  if (denied) return { ok: false, error: denied };

  const supabase = await createClient();
  const roleError = await roleAssignError(supabase, gate.workspace, role_id, site_id);
  if (roleError) return { ok: false, error: roleError };

  // Admin session (not service role) so erp_guard_role_assignment sees auth.uid().
  const { data, error } = await supabase
    .from("sys_user_site_roles")
    .insert({ user_id, role_id, site_id, created_by: gate.workspace.id })
    .select("id, role_id, site_id, role:sys_roles ( code, label_fr ), site:ref_sites ( name_fr )")
    .single();

  if (error) return { ok: false, error: friendlyAssignError(error.message) };

  const role = (Array.isArray(data.role) ? data.role[0] : data.role) as
    | { code: string; label_fr: string }
    | null;
  const site = (Array.isArray(data.site) ? data.site[0] : data.site) as
    | { name_fr: string }
    | null;

  await audit(service, gate.workspace.id, "CREATE", "sys_user_site_roles", data.id, null, {
    user_id,
    role_id,
    site_id,
  });

  revalidatePath("/parametres/utilisateurs");
  return {
    ok: true,
    data: {
      id: data.id,
      role_id: data.role_id,
      role_code: role?.code ?? "?",
      role_label: role?.label_fr ?? "?",
      site_id: (data.site_id as string | null) ?? null,
      site_name: site?.name_fr ?? null,
    },
  };
}

export async function removeUserRole(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireUserAdmin();
  if (gate.error || !gate.workspace) return { ok: false, error: gate.error! };

  const parsed = removeUserRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const svc = getService();
  if ("error" in svc) return { ok: false, error: svc.error };
  const { service } = svc;

  const { data: assignment, error: loadErr } = await service
    .from("sys_user_site_roles")
    .select("id, user_id, role_id, site_id, role:sys_roles ( code )")
    .eq("id", parsed.data.assignment_id)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!assignment) return { ok: false, error: "Affectation introuvable." };

  if (assignment.user_id === gate.workspace.id) {
    return { ok: false, error: "Vous ne pouvez pas retirer vos propres rôles." };
  }

  const denied = await targetManageError(service, gate.workspace, assignment.user_id);
  if (denied) return { ok: false, error: denied };

  const { count, error: countErr } = await service
    .from("sys_user_site_roles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", assignment.user_id);
  if (countErr) return { ok: false, error: countErr.message };
  if ((count ?? 0) <= 1) {
    return {
      ok: false,
      error: "Un compte doit garder au moins un rôle. Ajoutez-en un autre d'abord, ou désactivez le compte.",
    };
  }

  const role = (Array.isArray(assignment.role) ? assignment.role[0] : assignment.role) as
    | { code: string }
    | null;

  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("sys_user_site_roles")
    .delete()
    .eq("id", assignment.id)
    .select("id");

  if (error) {
    return {
      ok: false,
      error: /last SUPER_ADMIN/i.test(error.message)
        ? "Impossible de retirer le dernier SUPER_ADMIN actif."
        : error.message,
    };
  }
  if (!deleted?.length) return { ok: false, error: "Suppression refusée par les droits." };

  await audit(service, gate.workspace.id, "DELETE", "sys_user_site_roles", assignment.id, {
    user_id: assignment.user_id,
    role_id: assignment.role_id,
    role_code: role?.code ?? null,
    site_id: assignment.site_id,
  }, null);

  revalidatePath("/parametres/utilisateurs");
  return { ok: true, data: { id: assignment.id } };
}

function friendlyDeleteError(message: string, code?: string): string {
  if (code === "23503" || /foreign key/i.test(message)) {
    return "Ce compte a déjà été utilisé dans l'ERP (connexions, saisies, validations) : il ne peut pas être supprimé. Désactivez-le à la place.";
  }
  if (/last SUPER_ADMIN/i.test(message)) return "Impossible de supprimer le dernier SUPER_ADMIN actif.";
  if (code === "P0002") return "Utilisateur introuvable.";
  return message;
}

export async function deleteUser(input: unknown): Promise<ActionResult<{ id: string }>> {
  const gate = await requireUserAdmin();
  if (gate.error || !gate.workspace) return { ok: false, error: gate.error! };

  const parsed = deleteUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const userId = parsed.data.user_id;

  if (userId === gate.workspace.id) {
    return { ok: false, error: "Vous ne pouvez pas supprimer votre propre compte." };
  }

  const svc = getService();
  if ("error" in svc) return { ok: false, error: svc.error };
  const { service } = svc;

  const denied = await targetManageError(service, gate.workspace, userId);
  if (denied) return { ok: false, error: denied };

  const { data: target, error: loadErr } = await service
    .from("sys_users")
    .select("id, email, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!target) return { ok: false, error: "Utilisateur introuvable." };

  const { error } = await service.rpc("erp_delete_user", { p_user_id: userId });
  if (error) return { ok: false, error: friendlyDeleteError(error.message, error.code) };

  await audit(service, gate.workspace.id, "DELETE", "sys_users", userId, {
    email: target.email,
    full_name: target.full_name,
    deleted_by: gate.workspace.email,
  }, null);

  revalidatePath("/parametres/utilisateurs");
  return { ok: true, data: { id: userId } };
}
