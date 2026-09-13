"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { workspaceHasRole } from "@/lib/auth/require-roles";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  provisionUserSchema,
  resetPasswordSchema,
  setUserStatusSchema,
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

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string;
  status: string;
  must_reset_password: boolean;
  last_login_at: string | null;
  assignments: {
    role_code: string;
    role_label: string;
    site_id: string | null;
    site_name: string | null;
  }[];
};

export async function listAdminUsers(): Promise<ActionResult<AdminUserRow[]>> {
  const gate = await requireUserAdmin();
  if (gate.error || !gate.workspace) return { ok: false, error: gate.error! };

  const supabase = await createClient();

  // Two queries: sys_users ↔ sys_user_site_roles has two FKs (user_id + created_by),
  // so a nested embed from sys_users is ambiguous in PostgREST.
  const { data, error } = await supabase
    .from("sys_users")
    .select("id, email, full_name, status, must_reset_password, last_login_at")
    .order("full_name");

  if (error) return { ok: false, error: error.message };

  const { data: assignmentRows, error: assignError } = await supabase
    .from("sys_user_site_roles")
    .select(
      `
      user_id,
      site_id,
      role:sys_roles ( code, label_fr ),
      site:ref_sites ( name_fr )
    `,
    );

  if (assignError) return { ok: false, error: assignError.message };

  type RoleJoin = { code: string; label_fr: string };
  type SiteJoin = { name_fr: string };
  const one = <T>(value: T | T[] | null | undefined): T | null => {
    if (value == null) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
  };

  const assignmentsByUser = new Map<string, AdminUserRow["assignments"]>();
  for (const row of assignmentRows ?? []) {
    const role = one(row.role as RoleJoin | RoleJoin[] | null);
    const site = one(row.site as SiteJoin | SiteJoin[] | null);
    const list = assignmentsByUser.get(row.user_id as string) ?? [];
    list.push({
      role_code: role?.code ?? "?",
      role_label: role?.label_fr ?? "?",
      site_id: (row.site_id as string | null) ?? null,
      site_name: site?.name_fr ?? null,
    });
    assignmentsByUser.set(row.user_id as string, list);
  }

  const rows: AdminUserRow[] = (data ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    status: u.status,
    must_reset_password: u.must_reset_password,
    last_login_at: u.last_login_at,
    assignments: assignmentsByUser.get(u.id) ?? [],
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

  const { data: role, error: roleErr } = await supabase
    .from("sys_roles")
    .select("id, code, hierarchy_level, site_scoped_allowed")
    .eq("id", payload.role_id)
    .maybeSingle();

  if (roleErr || !role) return { ok: false, error: "Rôle introuvable." };

  if (role.code === "SUPER_ADMIN" && !gate.workspace.isSuperAdmin) {
    return {
      ok: false,
      error: "Seul un SUPER_ADMIN peut créer un SUPER_ADMIN.",
    };
  }

  if (role.hierarchy_level >= 80 && !gate.workspace.isSuperAdmin) {
    return {
      ok: false,
      error: "Seul SUPER_ADMIN peut attribuer un rôle de niveau ≥ 80.",
    };
  }

  if (role.code === "SUPER_ADMIN" && payload.site_id !== null) {
    return {
      ok: false,
      error: "SUPER_ADMIN doit être global (sans site).",
    };
  }

  if (!role.site_scoped_allowed && payload.site_id !== null) {
    return {
      ok: false,
      error: `Le rôle ${role.code} ne peut pas être lié à un site.`,
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
    await service.auth.admin.deleteUser(userId);
    return { ok: false, error: `Affectation rôle: ${assignErr.message}` };
  }

  await service.rpc("sys_audit_write", {
    p_user_id: gate.workspace.id,
    p_action: "CREATE",
    p_table_name: "sys_users",
    p_target_id: userId,
    p_old: null,
    p_new: {
      email: payload.email,
      full_name: payload.full_name,
      role_id: payload.role_id,
      site_id: payload.site_id,
      provisioned_by: gate.workspace.email,
    },
    p_ip: null,
    p_user_agent: null,
    p_request_id: null,
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
