import { RhShell } from "@/components/rh/rh-shell";
import { ExitsManager } from "@/components/rh/exits-manager";
import { listExits } from "@/lib/actions/hr-exits";
import { listLeaveEmployees } from "@/lib/actions/hr-leave";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { HR_SALARY_VALUE_ROLES, workspaceHasRole } from "@/lib/auth/require-roles";

export const dynamic = "force-dynamic";

export default async function ExitsPage() {
  const [rows, employees, workspace] = await Promise.all([listExits(), listLeaveEmployees(), getWorkspaceProfile()]);
  const canEdit = workspace ? workspaceHasRole(workspace, HR_SALARY_VALUE_ROLES) : false;
  return (
    <RhShell title="Sorties & solde de tout compte">
      <ExitsManager
        initialRows={rows.ok ? rows.data : []}
        employees={employees.ok ? employees.data : []}
        canEdit={canEdit}
        loadError={(!rows.ok && rows.error) || (!employees.ok && employees.error) || undefined}
      />
    </RhShell>
  );
}
