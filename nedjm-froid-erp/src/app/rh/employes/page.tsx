import { RhShell } from "@/components/rh/rh-shell";
import { EmployeesManager } from "@/components/rh/employees-manager";
import {
  listHrEmployeeFiches,
  listHrEmployeeFields,
} from "@/lib/actions/hr-employees";
import { listHrContracts } from "@/lib/actions/hr-contracts";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { getHrFicheSettings } from "@/lib/actions/hr-fiche";
import { DEFAULT_FICHE_SETTINGS } from "@/lib/hr/fiche-settings";
import { isOpenContract } from "@/lib/hr/dashboard-stats";
import type { EmployeeAssignment } from "@/components/rh/employees-list";

export const dynamic = "force-dynamic";

export default async function EmployesPage() {
  const [result, fields, lookups, fiche, contracts] = await Promise.all([
    listHrEmployeeFiches(),
    listHrEmployeeFields(),
    loadHrLookups(),
    getHrFicheSettings(),
    listHrContracts(),
  ]);

  const typeLabels = new Map(
    lookups.catalogs.filter((c) => c.kind === "contract_type").map((c) => [c.code, c.label_fr]),
  );
  const assignments = new Map<string, EmployeeAssignment & { main: boolean }>();
  for (const c of contracts.ok ? contracts.data.filter(isOpenContract) : []) {
    const current = assignments.get(c.employee_id);
    if (current && (current.main || !c.affectation_principale)) continue;
    assignments.set(c.employee_id, {
      employee_id: c.employee_id,
      contract_type: c.contract_type_code ? (typeLabels.get(c.contract_type_code) ?? c.contract_type_code) : null,
      site: c.site_name || null,
      poste: c.poste_fr,
      main: c.affectation_principale,
    });
  }

  return (
    <RhShell title="Employés RH">
      <EmployeesManager
        initialEmployees={result.ok ? result.data : []}
        fields={fields.ok ? fields.data : []}
        catalogs={lookups.catalogs}
        kinds={lookups.kinds}
        sites={lookups.sites}
        assignments={[...assignments.values()].map((a) => ({
          employee_id: a.employee_id,
          contract_type: a.contract_type,
          site: a.site,
          poste: a.poste,
        }))}
        fiche={fiche.ok ? fiche.data : DEFAULT_FICHE_SETTINGS}
        loadError={
          result.ok
            ? fields.ok
              ? lookups.error
              : fields.error
            : result.error
        }
      />
    </RhShell>
  );
}
