import { RhShell } from "@/components/rh/rh-shell";
import { AdvancesManager } from "@/components/rh/advances-manager";
import { listAdvances } from "@/lib/actions/hr-advances";
import { listHrEmployeeRows } from "@/lib/actions/hr-employees";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { HR_SALARY_VALUE_ROLES, workspaceHasRole } from "@/lib/auth/require-roles";

export const dynamic = "force-dynamic";

export default async function AdvancesPage() {
  const now = new Date();
  const [rows, employees, workspace] = await Promise.all([
    listAdvances(),
    listHrEmployeeRows(),
    getWorkspaceProfile(),
  ]);
  const canEdit = workspace ? workspaceHasRole(workspace, HR_SALARY_VALUE_ROLES) : false;
  return (
    <RhShell title="Avances & prêts">
      <AdvancesManager
        initialRows={rows.ok ? rows.data : []}
        employees={(employees.ok ? employees.data : []).map((e) => ({
          id: e.id,
          label: `${e.matricule} · ${e.last_name} ${e.first_name}`,
        }))}
        canEdit={canEdit}
        year={now.getFullYear()}
        month={now.getMonth() + 1}
        loadError={(!rows.ok && rows.error) || undefined}
      />
    </RhShell>
  );
}
