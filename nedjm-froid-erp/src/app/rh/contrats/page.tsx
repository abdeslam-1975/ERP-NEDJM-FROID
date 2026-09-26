import { RhShell } from "@/components/rh/rh-shell";
import { ContractsWorkspace } from "@/components/rh/contracts-workspace";
import { listHrContracts } from "@/lib/actions/hr-contracts";
import { listHrEmployeeRows } from "@/lib/actions/hr-employees";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { listSalaryAssignments, listSalaryRubriques } from "@/lib/actions/hr-salary";
import { listLegalVars } from "@/lib/actions/hr-legal-vars";
import { listIrgCatalog } from "@/lib/actions/hr-irg";
import { listPostes } from "@/lib/actions/hr-postes";
import { listAgencies } from "@/lib/actions/hr-interim";
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
    legalVars,
    irg,
    workspace,
    postes,
    agencies,
  ] = await Promise.all([
    listHrContracts(),
    listHrEmployeeRows(),
    loadHrLookups(),
    listSalaryRubriques(),
    listSalaryAssignments(),
    listLegalVars(),
    listIrgCatalog(),
    getWorkspaceProfile(),
    listPostes(),
    listAgencies(),
  ]);

  const empRows = employees.ok ? employees.data : [];
  const contractRows = contracts.ok ? contracts.data : [];

  return (
    <RhShell title="Contrats de travail">
      <ContractsWorkspace
        initialContracts={contractRows}
        employees={empRows}
        sites={lookups.sites}
        activities={lookups.activities}
        catalogs={lookups.catalogs}
        rubriques={rubriques.ok ? rubriques.data : []}
        assignments={assignments.ok ? assignments.data : []}
        salaryEmployees={empRows.map((e) => ({
          id: e.id,
          label: `${e.matricule} · ${e.last_name} ${e.first_name}`,
        }))}
        salarySites={lookups.sites.map((s) => ({
          id: s.id,
          label: `${s.code} · ${s.name_fr}`,
        }))}
        salaryContracts={contractRows.map((c) => ({
          id: c.id,
          label: `${c.matricule} · ${c.employee_name} · ${c.site_name}${
            c.poste_fr ? ` · ${c.poste_fr}` : ""
          }`,
        }))}
        legalVars={legalVars.ok ? legalVars.data : []}
        irgCatalog={
          irg.ok ? irg.data : { versions: [], brackets: [], ruleSets: [], rules: [] }
        }
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
          undefined
        }
        legalError={
          (!legalVars.ok && legalVars.error) ||
          (!irg.ok && irg.error) ||
          undefined
        }
      />
    </RhShell>
  );
}
