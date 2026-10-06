import { AppShell } from "@/components/layout/app-shell";
import { SalaryRubricsManager } from "@/components/rh/salary-rubrics-manager";
import { RhAlert, RhPage } from "@/components/rh/rh-ui";
import { listHrEmployeeRows } from "@/lib/actions/hr-employees";
import { listHrContracts } from "@/lib/actions/hr-contracts";
import { listPostes } from "@/lib/actions/hr-postes";
import { listSalaryAssignments, listSalaryRubriques } from "@/lib/actions/hr-salary";
import { listSites } from "@/lib/actions/sites";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { HR_SALARY_VALUE_ROLES, workspaceHasRole } from "@/lib/auth/require-roles";

export const dynamic = "force-dynamic";

export default async function SalaryRubricsPage() {
  const [workspace, rubriques, assignments, employees, contracts, sites, postes] = await Promise.all([
    getWorkspaceProfile(),
    listSalaryRubriques(),
    listSalaryAssignments(),
    listHrEmployeeRows(),
    listHrContracts(),
    listSites(),
    listPostes(),
  ]);
  const loadError = (!rubriques.ok && rubriques.error) || (!assignments.ok && assignments.error) || undefined;
  return (
    <AppShell title="Rubriques de salaire">
      <RhPage>
        {loadError ? <RhAlert tone="danger">{loadError}</RhAlert> : null}
        <SalaryRubricsManager
          isSuperAdmin={workspace?.isSuperAdmin ?? false}
          canEditValues={workspace ? workspaceHasRole(workspace, HR_SALARY_VALUE_ROLES) : false}
          rubriques={rubriques.ok ? rubriques.data : []}
          assignments={assignments.ok ? assignments.data : []}
          employees={(employees.ok ? employees.data : []).map((e) => ({
            id: e.id,
            label: `${e.matricule} · ${e.last_name} ${e.first_name}`,
          }))}
          sites={(sites.ok ? sites.data : []).map((s) => ({ id: s.id, label: `${s.code} · ${s.name_fr}` }))}
          contracts={(contracts.ok ? contracts.data : []).map((c) => ({
            id: c.id,
            label: `${c.matricule} · ${c.employee_name} · ${c.site_name}${c.poste_fr ? ` · ${c.poste_fr}` : ""}`,
          }))}
          postes={(postes.ok ? postes.data : []).map((p) => ({ id: p.id, label: `${p.code} · ${p.label_fr}` }))}
        />
      </RhPage>
    </AppShell>
  );
}
