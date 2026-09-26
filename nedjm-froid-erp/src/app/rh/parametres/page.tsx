import { RhShell } from "@/components/rh/rh-shell";
import { RhParametres } from "@/components/rh/rh-parametres";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { listHrEmployeeFields, listHrEmployeeRows } from "@/lib/actions/hr-employees";
import { listHrContracts } from "@/lib/actions/hr-contracts";
import { listSites } from "@/lib/actions/sites";
import { listSalaryAssignments, listSalaryRubriques } from "@/lib/actions/hr-salary";
import { getHrFicheSettings } from "@/lib/actions/hr-fiche";
import { loadPayrollBulletinContext } from "@/lib/actions/hr-bulletin";
import { loadAttendanceColumnsAdmin } from "@/lib/actions/hr-attendance-sheet";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { HR_SALARY_VALUE_ROLES, workspaceHasRole } from "@/lib/auth/require-roles";
import { DEFAULT_FICHE_SETTINGS } from "@/lib/hr/fiche-settings";

export const dynamic = "force-dynamic";

export default async function RhParametresPage() {
  const [
    lookups,
    fields,
    fiche,
    workspace,
    rubriques,
    assignments,
    employees,
    contracts,
    sites,
    bulletin,
    attendanceAdmin,
  ] = await Promise.all([
    loadHrLookups(),
    listHrEmployeeFields(),
    getHrFicheSettings(),
    getWorkspaceProfile(),
    listSalaryRubriques(),
    listSalaryAssignments(),
    listHrEmployeeRows(),
    listHrContracts(),
    listSites(),
    loadPayrollBulletinContext(),
    loadAttendanceColumnsAdmin(),
  ]);
  const salaryError =
    (!rubriques.ok && rubriques.error) ||
    (!assignments.ok && assignments.error) ||
    undefined;
  return (
    <RhShell title="Paramètres RH">
      <RhParametres
        kinds={lookups.kinds}
        items={lookups.catalogs}
        legends={lookups.legends}
        fields={fields.ok ? fields.data : []}
        fiche={fiche.ok ? fiche.data : DEFAULT_FICHE_SETTINGS}
        isSuperAdmin={workspace?.isSuperAdmin ?? false}
        canEditSalaryValues={
          workspace ? workspaceHasRole(workspace, HR_SALARY_VALUE_ROLES) : false
        }
        rubriques={rubriques.ok ? rubriques.data : []}
        assignments={assignments.ok ? assignments.data : []}
        employees={(employees.ok ? employees.data : []).map((e) => ({
          id: e.id,
          label: `${e.matricule} · ${e.last_name} ${e.first_name}`,
        }))}
        sites={(sites.ok ? sites.data : []).map((s) => ({
          id: s.id,
          label: `${s.code} · ${s.name_fr}`,
        }))}
        contracts={(contracts.ok ? contracts.data : []).map((c) => ({
          id: c.id,
          label: `${c.matricule} · ${c.employee_name} · ${c.site_name}${
            c.poste_fr ? ` · ${c.poste_fr}` : ""
          }`,
        }))}
        bulletin={bulletin.bulletin}
        legalRates={bulletin.legalRates}
        attendanceAdmin={attendanceAdmin.ok ? attendanceAdmin.data : null}
        loadError={
          lookups.error ||
          (!fields.ok ? fields.error : undefined) ||
          (!fiche.ok ? fiche.error : undefined) ||
          salaryError ||
          bulletin.error
        }
      />
    </RhShell>
  );
}
