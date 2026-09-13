import { redirect } from "next/navigation";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import type { WorkspaceProfile } from "@/lib/auth/types";

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
  codes: string[],
): boolean {
  const set = new Set(workspace.roles.map((r) => r.roleCode));
  return codes.some((c) => set.has(c));
}
