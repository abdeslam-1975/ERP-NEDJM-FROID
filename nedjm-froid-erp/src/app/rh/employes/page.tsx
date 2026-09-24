import { RhShell } from "@/components/rh/rh-shell";
import { EmployeesManager } from "@/components/rh/employees-manager";
import {
  listHrEmployeeFiches,
  listHrEmployeeFields,
} from "@/lib/actions/hr-employees";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { getHrFicheSettings } from "@/lib/actions/hr-fiche";
import { DEFAULT_FICHE_SETTINGS } from "@/lib/hr/fiche-settings";

export const dynamic = "force-dynamic";

export default async function EmployesPage() {
  const [result, fields, lookups, fiche] = await Promise.all([
    listHrEmployeeFiches(),
    listHrEmployeeFields(),
    loadHrLookups(),
    getHrFicheSettings(),
  ]);

  return (
    <RhShell title="Employés RH">
      <EmployeesManager
        initialEmployees={result.ok ? result.data : []}
        fields={fields.ok ? fields.data : []}
        catalogs={lookups.catalogs}
        kinds={lookups.kinds}
        sites={lookups.sites}
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
