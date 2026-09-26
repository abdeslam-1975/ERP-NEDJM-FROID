import { RhShell } from "@/components/rh/rh-shell";
import { PostesManager } from "@/components/rh/postes-manager";
import { listPostes } from "@/lib/actions/hr-postes";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { HR_SALARY_VALUE_ROLES, workspaceHasRole } from "@/lib/auth/require-roles";

export const dynamic = "force-dynamic";

export default async function PostesPage() {
  const [rows, workspace] = await Promise.all([listPostes(), getWorkspaceProfile()]);
  const canEdit = workspace ? workspaceHasRole(workspace, HR_SALARY_VALUE_ROLES) : false;
  return (
    <RhShell title="Postes & grille salariale">
      <PostesManager
        initialRows={rows.ok ? rows.data : []}
        canEdit={canEdit}
        loadError={(!rows.ok && rows.error) || undefined}
      />
    </RhShell>
  );
}
