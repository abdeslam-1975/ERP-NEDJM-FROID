import { redirect } from "next/navigation";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import type { WorkspaceProfile } from "@/lib/auth/types";

/** Roles allowed to open the contrats clients module (read). */
export const CONTRACT_READ_ROLES = [
  "SUPER_ADMIN",
  "ADMIN_FINANCE",
  "GERANT",
  "READ_ONLY",
] as const;

/** Roles allowed to mutate contrats / canva / attributes. */
export const CONTRACT_WRITE_ROLES = [
  "SUPER_ADMIN",
  "ADMIN_FINANCE",
  "GERANT",
] as const;

/** RH values on contracts / exceptions. Dictionary stays SUPER_ADMIN. */
export const HR_SALARY_VALUE_ROLES = [
  "SUPER_ADMIN",
  "ADMIN_RH",
  "GERANT",
] as const;

export async function requireRoles(
  allowed: string[],
): Promise<WorkspaceProfile> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) redirect("/login");

  const codes = new Set(workspace.roles.map((r) => r.roleCode));
  const ok = allowed.some((code) => codes.has(code));
  if (!ok) {
    redirect("/?error=forbidden");
  }
  return workspace;
}

export function workspaceHasRole(
  workspace: WorkspaceProfile,
  codes: readonly string[] | string[],
): boolean {
  const set = new Set(workspace.roles.map((r) => r.roleCode));
  return codes.some((c) => set.has(c));
}

export async function requireContractRead(): Promise<WorkspaceProfile> {
  return requireRoles([...CONTRACT_READ_ROLES]);
}

export async function requireContractWrite(): Promise<
  | { ok: true; workspace: WorkspaceProfile }
  | { ok: false; error: string }
> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { ok: false, error: "Session requise." };
  if (!workspaceHasRole(workspace, CONTRACT_WRITE_ROLES)) {
    return {
      ok: false,
      error:
        "Accès refusé. Modification des contrats réservée à SUPER_ADMIN, ADMIN_FINANCE et GERANT.",
    };
  }
  return { ok: true, workspace };
}

export async function requireContractAccess(): Promise<
  | { ok: true; workspace: WorkspaceProfile }
  | { ok: false; error: string }
> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { ok: false, error: "Session requise." };
  if (!workspaceHasRole(workspace, CONTRACT_READ_ROLES)) {
    return { ok: false, error: "Accès refusé aux contrats clients." };
  }
  return { ok: true, workspace };
}

export async function requireHrSalaryValues(): Promise<
  | { ok: true; workspace: WorkspaceProfile }
  | { ok: false; error: string }
> {
  const workspace = await getWorkspaceProfile();
  if (!workspace) return { ok: false, error: "Session requise. · يلزم تسجيل الدخول." };
  if (!workspaceHasRole(workspace, HR_SALARY_VALUE_ROLES)) {
    return {
      ok: false,
      error:
        "Saisie des montants réservée à SUPER_ADMIN, ADMIN_RH et GERANT. · إدخال المبالغ لـ SUPER_ADMIN و ADMIN_RH و GERANT.",
    };
  }
  return { ok: true, workspace };
}
