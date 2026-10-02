import { RhShell } from "@/components/rh/rh-shell";
import { ContractsManager } from "@/components/rh/contracts-manager";
import { RhPage } from "@/components/rh/rh-ui";
import { listHrContracts } from "@/lib/actions/hr-contracts";
import { listHrEmployeeRows } from "@/lib/actions/hr-employees";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { listSalaryAssignments, listSalaryRubriques } from "@/lib/actions/hr-salary";
import { listPostes } from "@/lib/actions/hr-postes";
import { listAgencies } from "@/lib/actions/hr-interim";
import { listContractComplianceOptions } from "@/lib/actions/hr-compliance";
import { getComplianceAccess } from "@/lib/auth/compliance-access";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { HR_SALARY_VALUE_ROLES, workspaceHasRole } from "@/lib/auth/require-roles";

export const dynamic = "force-dynamic";

export default async function ContratsPage() {
  const [
    contracts,
    employees,
    lookups,
    rubriques,
    assignments,
    workspace,
    postes,
    agencies,
    complianceOptions,
    compliance,
  ] = await Promise.all([
    listHrContracts(),
    listHrEmployeeRows(),
    loadHrLookups(),
    listSalaryRubriques(),
    listSalaryAssignments(),
    getWorkspaceProfile(),
    listPostes(),
    listAgencies(),
    listContractComplianceOptions(),
    getComplianceAccess(),
  ]);

  return (
    <RhShell title="Contrats de travail">
      <RhPage>
        <ContractsManager
          initialContracts={contracts.ok ? contracts.data : []}
          employees={employees.ok ? employees.data : []}
          sites={lookups.sites}
          activities={lookups.activities}
          catalogs={lookups.catalogs}
          rubriques={rubriques.ok ? rubriques.data : []}
          assignments={assignments.ok ? assignments.data : []}
          complianceOptions={
            complianceOptions.ok ? complianceOptions.data : { regimes: [], zones: [], cacobatph_activity_ids: [] }
          }
          canEditCompliance={compliance.canWrite}
          postes={postes.ok ? postes.data : []}
          agencies={(agencies.ok ? agencies.data : [])
            .filter((a) => a.is_active)
            .map((a) => ({ id: a.id, label: `${a.code} · ${a.name}`, default_daily_rate: a.default_daily_rate }))}
          isSuperAdmin={workspace?.isSuperAdmin ?? false}
          canEditSalaryValues={
            workspace ? workspaceHasRole(workspace, HR_SALARY_VALUE_ROLES) : false
          }
          loadError={
            (!contracts.ok && contracts.error) ||
            lookups.error ||
            (!rubriques.ok && rubriques.error) ||
            (!complianceOptions.ok && complianceOptions.error) ||
            undefined
          }
        />
      </RhPage>
    </RhShell>
  );
}
