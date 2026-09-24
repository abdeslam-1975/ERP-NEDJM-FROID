import { RhShell } from "@/components/rh/rh-shell";
import { ExceptionsManager } from "@/components/rh/exceptions-manager";
import { listSalaryExceptions } from "@/lib/actions/hr-exceptions";
import { listHrEmployeeRows } from "@/lib/actions/hr-employees";
import { listSalaryRubriques } from "@/lib/actions/hr-salary";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { HR_SALARY_VALUE_ROLES, workspaceHasRole } from "@/lib/auth/require-roles";

export const dynamic = "force-dynamic";

export default async function ExceptionsPage() {
  const now = new Date();
  const [rows, employees, rubriques, workspace] = await Promise.all([
    listSalaryExceptions(),
    listHrEmployeeRows(),
    listSalaryRubriques(),
    getWorkspaceProfile(),
  ]);
  const canEdit = workspace
    ? workspaceHasRole(workspace, HR_SALARY_VALUE_ROLES)
    : false;
  return (
    <RhShell title="Rubriques exceptionnelles">
      <ExceptionsManager
        initialRows={rows.ok ? rows.data : []}
        employees={(employees.ok ? employees.data : []).map((e) => ({
          id: e.id,
          label: `${e.matricule} · ${e.last_name} ${e.first_name}`,
        }))}
        rubriques={rubriques.ok ? rubriques.data : []}
        canEdit={canEdit}
        year={now.getFullYear()}
        month={now.getMonth() + 1}
        loadError={
          (!rows.ok && rows.error) ||
          (!rubriques.ok && rubriques.error) ||
          undefined
        }
      />
    </RhShell>
  );
}
